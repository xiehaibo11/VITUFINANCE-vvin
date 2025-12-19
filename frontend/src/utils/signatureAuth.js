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

/**
 * Get nonce from server for signature authentication
 * @param {string} walletAddress - User's wallet address
 * @returns {object} { success, nonce, message }
 */
async function getChallenge(walletAddress) {
  console.log('[SignatureAuth] Getting nonce for wallet:', walletAddress)
  
  const response = await fetch(`/api/auth/nonce?wallet=${encodeURIComponent(walletAddress)}`, { 
    credentials: 'include' 
  })
  const data = await response.json().catch(() => ({}))
  
  console.log('[SignatureAuth] Nonce response:', data)
  
  if (!data?.success) {
    const msg = data?.message || '获取签名挑战失败'
    throw new Error(msg)
  }
  
  // Return in format expected by the signature flow
  return {
    success: true,
    nonce: data.nonce,
    message: data.message
  }
}

/**
 * Verify signature with server
 * @param {object} params - { walletAddress, nonce, signature }
 * @returns {object} { success, message, token, expiresAt }
 */
async function verifySignature({ walletAddress, nonce, signature }) {
  console.log('[SignatureAuth] Verifying signature...')
  
  const response = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      wallet: walletAddress,
      nonce,
      signature
    })
  })

  const data = await response.json().catch(() => ({}))
  console.log('[SignatureAuth] Verify response:', data)
  
  if (!data?.success) {
    const msg = data?.message || '签名验证失败'
    throw new Error(msg)
  }
  
  // Generate a client-side token since backend doesn't provide one
  return {
    success: true,
    token: `sig_${walletAddress}_${Date.now()}`,
    expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  }
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
 * 确保已完成钱包签名认证（支持所有DApp浏览器钱包）
 * @param {object} options
 * @param {boolean} options.force 强制重新签名
 */
export async function ensureTokenPocketSignatureAuth(options = {}) {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const { force = false } = options

      // Check if in DApp browser environment
      if (!isDAppBrowser()) {
        console.log('[SignatureAuth] Not in DApp browser, skipping')
        return { success: false, skipped: true, reason: 'not_dapp_browser' }
      }

      const walletType = detectWalletType()
      console.log('[SignatureAuth] Wallet type detected:', walletType)
      
      // Support all wallet types in DApp browser, not just TokenPocket
      // Any wallet with ethereum object should work
      if (!window.ethereum) {
        console.log('[SignatureAuth] No ethereum object found')
        return { success: false, skipped: true, reason: 'no_ethereum' }
      }

      const walletStore = useWalletStore()

      // Step 1: Try to get already authorized accounts first
      if (!walletStore.isConnected || !walletStore.walletAddress) {
        try {
          const ethereum = window.ethereum
          const accounts = await ethereum.request({ method: 'eth_accounts' })
          console.log('[SignatureAuth] Existing accounts:', accounts)
          if (accounts && accounts.length > 0) {
            walletStore.setWallet(accounts[0], walletType)
          }
        } catch (e) {
          console.log('[SignatureAuth] Failed to get existing accounts:', e)
        }
      }

      // Step 2: If not connected, request wallet connection (will show wallet popup)
      if (!walletStore.isConnected || !walletStore.walletAddress) {
        console.log('[SignatureAuth] Requesting wallet connection...')
        const result = await connectWallet()
        if (!result?.success) {
          return { success: false, error: result?.error || '连接钱包失败' }
        }
      }

      const walletAddress = walletStore.walletAddress
      if (!walletAddress) {
        return { success: false, error: '未获取到钱包地址' }
      }

      if (!force && isStoredTokenValidForWallet(walletAddress)) {
        return { success: true, alreadyAuthenticated: true, wallet_address: walletAddress }
      }

      // Step 3: Ensure correct chain (BSC)
      let chainId = ''
      try {
        chainId = await ensureRequiredChain()
        console.log('[SignatureAuth] Chain verified:', chainId)
      } catch (e) {
        console.log('[SignatureAuth] Chain verification failed:', e)
        return { success: false, error: normalizeWalletErrorMessage(e) || '网络校验失败' }
      }

      // Step 4: Get nonce from server
      console.log('[SignatureAuth] Requesting nonce from server...')
      const challenge = await getChallenge(walletAddress)
      const { nonce, message } = challenge
      console.log('[SignatureAuth] Got nonce:', nonce)

      // Step 5: Request wallet signature (will show wallet popup with password input)
      let signature
      try {
        console.log('[SignatureAuth] Requesting wallet signature...')
        signature = await personalSign({ walletAddress, message })
        console.log('[SignatureAuth] Signature received:', signature?.slice(0, 20) + '...')
      } catch (error) {
        console.log('[SignatureAuth] Signature error:', error)
        // 4001: User rejected
        if (error?.code === 4001) {
          return { success: false, error: '用户拒绝签名' }
        }
        // TokenPocket: Common error for wrong password
        if (isPasswordIncorrectError(error)) {
          return { success: false, error: '钱包密码不正确，请重试' }
        }
        // Request still pending in wallet
        if (error?.code === -32002) {
          return { success: false, error: '钱包请求处理中，请在钱包内完成操作' }
        }
        return { success: false, error: error?.message || '签名失败' }
      }

      // Step 6: Verify signature with server
      console.log('[SignatureAuth] Verifying signature with server...')
      const verified = await verifySignature({ walletAddress, nonce, signature })
      saveToken({ walletAddress, token: verified.token, expiresAt: verified.expiresAt })
      console.log('[SignatureAuth] ✅ Signature verified and token saved')

      ElMessage.success('签名认证成功')
      return { success: true, wallet_address: walletAddress }
    } catch (error) {
      console.warn('[SignatureAuth] Failed:', error?.message || error)
      return { success: false, error: error?.message || '签名认证失败' }
    }
  })().finally(() => {
    inFlight = null
  })

  return inFlight
}
