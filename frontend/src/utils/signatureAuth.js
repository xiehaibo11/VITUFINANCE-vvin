/**
 * 钱包签名认证（TokenPocket优先）
 *
 * 目标：
 * - 在 TokenPocket 内置浏览器访问首页时，触发钱包签名弹窗（会要求输入钱包密码）
 * - 通过后端 challenge(一次性nonce) + 服务端验签，生成短期 token
 * - 前端缓存 token/过期时间，避免重复弹窗
 */

import { ElMessage } from 'element-plus'
import { useWalletStore } from '@/stores/wallet'
import { connectWallet, detectWalletType, isDAppBrowser } from '@/utils/wallet'

const STORAGE_TOKEN_KEY = 'wallet_auth_token'
const STORAGE_TOKEN_EXP_KEY = 'wallet_auth_token_exp'
const STORAGE_TOKEN_WALLET_KEY = 'wallet_auth_wallet'

// “永久”缓存：给一个足够长的时间窗口（100年），避免已签名仍反复弹窗
const DEFAULT_TOKEN_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000

// 当前项目默认运行在 BSC 主网
const REQUIRED_CHAIN_ID_HEX = '0x38'

let inFlight = null

function parseExpiryMs(value) {
  if (!value) return 0
  const str = String(value).trim()
  const asNumber = Number(str)
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber
  const asDate = Date.parse(str)
  return Number.isFinite(asDate) ? asDate : 0
}

function isStoredTokenValidForWallet(walletAddress) {
  if (!walletAddress) return false
  const savedWallet = (localStorage.getItem(STORAGE_TOKEN_WALLET_KEY) || '').toLowerCase()
  const token = localStorage.getItem(STORAGE_TOKEN_KEY) || ''
  const expMs = parseExpiryMs(localStorage.getItem(STORAGE_TOKEN_EXP_KEY))

  if (!token || !expMs) return false
  if (savedWallet !== walletAddress.toLowerCase()) return false
  return Date.now() < expMs
}

function saveToken({ walletAddress, token, expiresAt }) {
  const expMs = parseExpiryMs(expiresAt) || (Date.now() + DEFAULT_TOKEN_TTL_MS)
  localStorage.setItem(STORAGE_TOKEN_KEY, token)
  localStorage.setItem(STORAGE_TOKEN_EXP_KEY, String(expMs))
  localStorage.setItem(STORAGE_TOKEN_WALLET_KEY, walletAddress.toLowerCase())
}

function normalizeWalletErrorMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return String(error?.message || error?.data?.message || error?.error?.message || '')
}

function isPasswordIncorrectError(error) {
  const message = normalizeWalletErrorMessage(error)
  if (!message) return false
  return (
    message.includes('密码不正确') ||
    message.toLowerCase().includes('wrong password') ||
    (message.toLowerCase().includes('password') && message.toLowerCase().includes('incorrect'))
  )
}

async function ensureRequiredChain() {
  const ethereum = window.ethereum
  if (!ethereum?.request) throw new Error('未检测到钱包环境')

  let chainId = ''
  try {
    chainId = await ethereum.request({ method: 'eth_chainId' })
  } catch (e) {
    chainId = ''
  }

  if (chainId === REQUIRED_CHAIN_ID_HEX) return chainId

  // 尝试自动切换到 BSC 主网（TokenPocket/MetaMask 等支持）
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: REQUIRED_CHAIN_ID_HEX }]
    })
  } catch (switchError) {
    // 4902: 未添加该网络，尝试添加
    if (switchError?.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: REQUIRED_CHAIN_ID_HEX,
          chainName: 'BNB Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com/']
        }]
      })
    } else {
      throw switchError
    }
  }

  // 重新读取确认
  const nextChainId = await ethereum.request({ method: 'eth_chainId' })
  if (nextChainId !== REQUIRED_CHAIN_ID_HEX) {
    throw new Error('请切换到 BSC 主网后再进行签名认证')
  }
  return nextChainId
}

export function hasValidSignatureAuthCache(options = {}) {
  const { walletAddress } = options
  const token = localStorage.getItem(STORAGE_TOKEN_KEY) || ''
  const expMs = parseExpiryMs(localStorage.getItem(STORAGE_TOKEN_EXP_KEY))
  const savedWallet = (localStorage.getItem(STORAGE_TOKEN_WALLET_KEY) || '').toLowerCase()
  
  console.log('[SignatureAuth] hasValidSignatureAuthCache called with:', {
    walletAddress: walletAddress,
    hasToken: !!token,
    expMs: expMs,
    expDate: expMs ? new Date(expMs).toISOString() : 'N/A',
    isExpired: expMs ? Date.now() >= expMs : 'N/A',
    savedWallet: savedWallet,
    currentTime: Date.now(),
    timeDiff: expMs ? (expMs - Date.now()) / 1000 / 60 / 60 / 24 : 'N/A'  // days
  })

  if (!token || !expMs) {
    console.log('[SignatureAuth] ❌ No token or expiry, returning false')
    return false
  }
  
  if (Date.now() >= expMs) {
    console.log('[SignatureAuth] ❌ Token expired, returning false')
    return false
  }

  if (walletAddress) {
    const normalizedWalletAddress = String(walletAddress).toLowerCase()
    if (savedWallet && savedWallet !== normalizedWalletAddress) {
      console.log('[SignatureAuth] ❌ Wallet address mismatch:', {
        saved: savedWallet,
        current: normalizedWalletAddress
      })
      return false
    }
  }

  console.log('[SignatureAuth] ✅ Valid cache found, returning true')
  return true
}

export function clearSignatureAuthCache() {
  console.log('[SignatureAuth] Clearing signature auth cache...')
  const hadToken = !!localStorage.getItem(STORAGE_TOKEN_KEY)
  localStorage.removeItem(STORAGE_TOKEN_KEY)
  localStorage.removeItem(STORAGE_TOKEN_EXP_KEY)
  localStorage.removeItem(STORAGE_TOKEN_WALLET_KEY)
  console.log('[SignatureAuth] ✅ Cache cleared, hadToken:', hadToken)
}

// 调试工具：暴露到全局window对象，方便在控制台调试
if (typeof window !== 'undefined') {
  window.__debugSignatureAuth = {
    clearCache: () => {
      clearSignatureAuthCache()
      console.log('%c✅ 签名认证缓存已清除！刷新页面后重试。', 'color: green; font-size: 14px; font-weight: bold;')
    },
    checkCache: () => {
      const token = localStorage.getItem(STORAGE_TOKEN_KEY)
      const exp = localStorage.getItem(STORAGE_TOKEN_EXP_KEY)
      const wallet = localStorage.getItem(STORAGE_TOKEN_WALLET_KEY)
      const expMs = parseExpiryMs(exp)
      console.table({
        'Has Token': !!token,
        'Token': token ? token.substring(0, 20) + '...' : 'N/A',
        'Wallet': wallet || 'N/A',
        'Expires At': expMs ? new Date(expMs).toISOString() : 'N/A',
        'Is Expired': expMs ? Date.now() >= expMs : 'N/A',
        'Days Remaining': expMs ? Math.floor((expMs - Date.now()) / 1000 / 60 / 60 / 24) : 'N/A'
      })
      const isValid = hasValidSignatureAuthCache()
      console.log('%c' + (isValid ? '✅ 缓存有效' : '❌ 缓存无效或已过期'), 
        'color: ' + (isValid ? 'green' : 'red') + '; font-size: 14px; font-weight: bold;')
    },
    help: () => {
      console.log('%c签名认证调试工具', 'color: blue; font-size: 16px; font-weight: bold;')
      console.log('使用方法：')
      console.log('  window.__debugSignatureAuth.checkCache() - 查看当前缓存状态')
      console.log('  window.__debugSignatureAuth.clearCache() - 清除缓存（清除后需刷新页面）')
      console.log('  window.__debugSignatureAuth.help() - 显示帮助信息')
    }
  }
  
  // 自动显示帮助信息
  console.log('%c🔧 签名认证调试工具已加载', 'color: blue; font-size: 14px; font-weight: bold;')
  console.log('输入 window.__debugSignatureAuth.help() 查看使用说明')
}

async function getChallenge(walletAddress, chainId) {
  const params = { wallet_address: walletAddress }
  if (chainId) params.chain_id = chainId
  const qs = new URLSearchParams(params).toString()
  const response = await fetch(`/api/auth/challenge?${qs}`, { credentials: 'include' })
  const data = await response.json().catch(() => ({}))
  if (!data?.success) {
    const msg = data?.message || '获取签名挑战失败'
    throw new Error(msg)
  }
  return data
}

async function verifySignature({ walletAddress, message, signature }) {
  const response = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      wallet_address: walletAddress,
      message,
      signature
    })
  })

  const data = await response.json().catch(() => ({}))
  if (!data?.success) {
    const msg = data?.message || '签名验证失败'
    throw new Error(msg)
  }
  return data
}

async function personalSign({ walletAddress, message }) {
  const ethereum = window.ethereum
  if (!ethereum?.request) {
    throw new Error('未检测到钱包环境')
  }

  // TokenPocket / MetaMask 等普遍支持 personal_sign（params: [message, address]）
  return await ethereum.request({
    method: 'personal_sign',
    params: [message, walletAddress]
  })
}

/**
 * 确保已完成 TokenPocket 签名认证（用于首页自动弹窗）
 * @param {object} options
 * @param {boolean} options.force 强制重新签名
 */
export async function ensureTokenPocketSignatureAuth(options = {}) {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const { force = false } = options

      if (!isDAppBrowser()) {
        return { success: false, skipped: true, reason: 'not_dapp_browser' }
      }

      const walletType = detectWalletType()
      console.log('[SignatureAuth] Detected wallet type:', walletType)
      
      // 移除 TokenPocket 限制，支持所有钱包类型
      // if (walletType !== 'TokenPocket') {
      //   return { success: false, skipped: true, reason: 'not_tokenpocket' }
      // }

      const walletStore = useWalletStore()

      // 尽量避免直接弹出授权：先尝试读取已授权账户
      if (!walletStore.isConnected || !walletStore.walletAddress) {
        try {
          const ethereum = window.ethereum
          const accounts = await ethereum.request({ method: 'eth_accounts' })
          if (accounts && accounts.length > 0) {
            walletStore.setWallet(accounts[0], walletType)
          }
        } catch (e) {
          // ignore
        }
      }

      // 仍未连接则请求连接（会弹出授权）
      if (!walletStore.isConnected || !walletStore.walletAddress) {
        const result = await connectWallet()
        if (!result?.success) {
          return { success: false, error: result?.error || '连接钱包失败' }
        }
      }

      const walletAddress = walletStore.walletAddress
      if (!walletAddress) {
        return { success: false, error: '未获取到钱包地址' }
      }

      console.log('[SignatureAuth] Checking signature auth for wallet:', walletAddress)

      if (!force && isStoredTokenValidForWallet(walletAddress)) {
        console.log('[SignatureAuth] ✅ Already authenticated, using cached token')
        return { success: true, alreadyAuthenticated: true, wallet_address: walletAddress }
      }

      console.log('[SignatureAuth] No valid token, requesting signature...')

      let chainId = ''
      try {
        chainId = await ensureRequiredChain()
        console.log('[SignatureAuth] Chain verified:', chainId)
      } catch (e) {
        console.error('[SignatureAuth] Chain verification failed:', e)
        return { success: false, error: normalizeWalletErrorMessage(e) || '网络校验失败' }
      }

      const challenge = await getChallenge(walletAddress, chainId)
      const message = challenge.message
      console.log('[SignatureAuth] Challenge received, requesting personal_sign...')

      let signature
      try {
        signature = await personalSign({ walletAddress, message })
        console.log('[SignatureAuth] Signature received')
      } catch (error) {
        console.error('[SignatureAuth] Signature failed:', error)
        
        // 4001: 用户拒绝
        if (error?.code === 4001) {
          return { success: false, error: '用户拒绝签名' }
        }
        // TokenPocket：常见为“密码不正确”（钱包本地校验失败）
        if (isPasswordIncorrectError(error)) {
          return { success: false, error: '钱包密码不正确，请重试' }
        }
        // 请求仍在钱包端等待用户操作
        if (error?.code === -32002) {
          return { success: false, error: '钱包请求处理中，请在钱包内完成操作' }
        }
        return { success: false, error: error?.message || '签名失败' }
      }

      console.log('[SignatureAuth] Verifying signature...')
      const verified = await verifySignature({ walletAddress, message, signature })
      saveToken({ walletAddress, token: verified.token, expiresAt: verified.expiresAt })

      console.log('[SignatureAuth] ✅ Signature auth successful!')
      ElMessage.success('签名认证成功')
      return { success: true, wallet_address: walletAddress }
    } catch (error) {
      console.error('[SignatureAuth] Failed:', error?.message || error)
      return { success: false, error: error?.message || '签名认证失败' }
    }
  })().finally(() => {
    inFlight = null
  })

  return inFlight
}
