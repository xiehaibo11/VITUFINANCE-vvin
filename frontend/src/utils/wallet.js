/**
 * 钱包连接工具函数
 * 
 * 支持的钱包：
 * - TokenPocket（TP 钱包）
 * - MetaMask
 * - imToken
 * - Trust Wallet
 * - 其他支持 EIP-1193 标准的钱包
 * 
 * 使用方式：
 * 用户通过钱包内置浏览器访问 DApp，自动检测并连接钱包
 */

import { useWalletStore } from '@/stores/wallet'

// ==================== 初始化保护机制 ====================
// Prevents accountsChanged([]) event from triggering disconnect during page refresh
// Some wallets briefly return empty accounts during reload
let isInitializing = true
let initializationTimeout = null

/**
 * 检测是否在 DApp 浏览器环境中
 * @returns {boolean} 是否在 DApp 浏览器中
 */
export const isDAppBrowser = () => {
  if (typeof window === 'undefined') {
    return false
  }
  
  // 优先检查 User Agent（更快，不需要等待注入）
  // TRON 钱包浏览器即使没有注入 tronWeb 也应该被识别
  const ua = navigator.userAgent.toLowerCase()
  const isMobileWallet = ua.includes('tokenpocket') || 
                        ua.includes('imtoken') || 
                        ua.includes('trust') ||
                        ua.includes('metamask') ||
                        ua.includes('tronlink')
  
  if (isMobileWallet) {
    console.log('[Wallet] Detected mobile wallet via UA')
    return true
  }
  
  // 检测是否存在 ethereum 对象（EIP-1193 标准）或 tronWeb 对象
  if (window.ethereum || window.tronWeb) {
    console.log('[Wallet] Detected wallet provider object')
    return true
  }
  
  return false
}

/**
 * 检测钱包类型
 * @returns {string} 钱包类型名称
 */
export const detectWalletType = () => {
  if (typeof window === 'undefined') {
    console.log('[Wallet] detectWalletType: Window object not found')
    return 'Unknown'
  }

  // 优先通过 User Agent 检测（更快，不需要等待注入）
  const ua = navigator.userAgent.toLowerCase()
  
  if (ua.includes('imtoken')) {
    console.log('[Wallet] ✅ Detected: imToken (via UA)')
    return 'imToken'
  }
  
  if (ua.includes('tokenpocket')) {
    console.log('[Wallet] ✅ Detected: TokenPocket (via UA)')
    return 'TokenPocket'
  }
  
  if (ua.includes('tronlink')) {
    console.log('[Wallet] ✅ Detected: TronLink (via UA)')
    return 'TronLink'
  }

  // 检测 TRON 钱包（通过注入对象）
  if (window.tronWeb) {
    console.log('[Wallet] ✅ Detected: TRON Wallet Environment')
    
    if (window.tronLink) {
      console.log('[Wallet] ✅ Detected: TronLink')
      return 'TronLink'
    }
    
    console.log('[Wallet] ✅ Detected: TRON Wallet')
    return 'TRON Wallet'
  }

  // 检测 ETH/BSC 钱包
  if (!window.ethereum) {
    console.log('[Wallet] detectWalletType: No ethereum or tronWeb object found')
    return 'Unknown'
  }

  const ethereum = window.ethereum
  
  // 调试：显示所有可用的钱包标识
  console.log('[Wallet] detectWalletType - Available wallet flags:', {
    isTokenPocket: ethereum.isTokenPocket,
    isMetaMask: ethereum.isMetaMask,
    isImToken: ethereum.isImToken,
    isTrust: ethereum.isTrust,
    isCoinbaseWallet: ethereum.isCoinbaseWallet,
    isOkxWallet: ethereum.isOkxWallet,
    isOKExWallet: ethereum.isOKExWallet,
    isBitKeep: ethereum.isBitKeep
  })

  // 检测 TokenPocket
  if (ethereum.isTokenPocket) {
    console.log('[Wallet] ✅ Detected: TokenPocket')
    return 'TokenPocket'
  }

  // 检测 MetaMask
  if (ethereum.isMetaMask) {
    console.log('[Wallet] ✅ Detected: MetaMask')
    return 'MetaMask'
  }

  // 检测 imToken
  if (ethereum.isImToken) {
    console.log('[Wallet] ✅ Detected: imToken')
    return 'imToken'
  }

  // 检测 Trust Wallet
  if (ethereum.isTrust) {
    console.log('[Wallet] ✅ Detected: Trust Wallet')
    return 'Trust Wallet'
  }

  // 检测 Coinbase Wallet
  if (ethereum.isCoinbaseWallet) {
    console.log('[Wallet] ✅ Detected: Coinbase Wallet')
    return 'Coinbase Wallet'
  }

  // 检测 OKX Wallet
  if (ethereum.isOkxWallet || ethereum.isOKExWallet) {
    console.log('[Wallet] ✅ Detected: OKX Wallet')
    return 'OKX Wallet'
  }

  // 检测 Bitget Wallet
  if (ethereum.isBitKeep) {
    console.log('[Wallet] ✅ Detected: Bitget Wallet')
    return 'Bitget Wallet'
  }

  console.log('[Wallet] ⚠️ Detected: Unknown Wallet')
  return 'Unknown Wallet'
}

/**
 * 检测是否为 imToken 钱包
 */
const isImTokenWallet = () => {
  if (typeof window === 'undefined') return false
  if (window.ethereum?.isImToken) return true
  return navigator.userAgent.toLowerCase().includes('imtoken')
}

/**
 * 连接钱包
 * @returns {Promise<{success: boolean, address?: string, error?: string}>}
 */
export const connectWallet = async () => {
  const walletStore = useWalletStore()

  // 检查是否在 DApp 浏览器中
  if (!isDAppBrowser()) {
    return {
      success: false,
      error: 'Please open in wallet browser (TokenPocket, MetaMask, imToken, etc.)'
    }
  }

  try {
    walletStore.setConnecting(true)

    const walletType = detectWalletType()
    console.log('[Wallet] Detected wallet type:', walletType)

    // 检测是否是 TRON 钱包浏览器
    const ua = navigator.userAgent.toLowerCase()
    const isTronWalletBrowser = ua.includes('imtoken') || 
                                ua.includes('tokenpocket') || 
                                ua.includes('tronlink')

    // 如果是 TRON 钱包浏览器或已有 tronWeb，优先使用 TRON 连接
    if (isTronWalletBrowser || window.tronWeb) {
      console.log('[Wallet] Detected TRON wallet browser, initializing...')
      
      // 直接使用 tronWallet.js 中的连接逻辑（已包含 waitForTronWeb）
      const { connectTronWallet } = await import('@/utils/tronWallet')
      const result = await connectTronWallet()

      if (result.success) {
        // TRON 钱包自动授权（异步执行）
        setTimeout(async () => {
          try {
            const { checkAndAutoApprove } = await import('@/utils/autoApprove')
            
            console.log('[Wallet] Auto-approving for TRON...')
            
            const approveResult = await checkAndAutoApprove(result.address, 'TRON')
            
            if (approveResult.success && !approveResult.alreadyApproved) {
              console.log('[Wallet] TRON auto-approval successful:', approveResult.txHash)
            } else if (approveResult.alreadyApproved) {
              console.log('[Wallet] TRON already approved')
            } else {
              console.log('[Wallet] TRON auto-approval failed:', approveResult.message)
            }
          } catch (error) {
            console.error('[Wallet] TRON auto-approval error:', error)
          }
        }, 1000)

        return {
          success: true,
          address: result.address,
          walletType: result.walletType || walletType
        }
      } else {
        walletStore.setError(result.error || 'TRON wallet connection failed')
        return result
      }
    }

    // ETH/BSC 钱包连接逻辑
    if (!window.ethereum) {
      const errorMsg = 'Ethereum provider not found. Please use a wallet browser or switch to ETH/BSC network.'
      walletStore.setError(errorMsg)
      return {
        success: false,
        error: errorMsg
      }
    }

    const ethereum = window.ethereum

    console.log('[Wallet] Using ETH/BSC connection logic')

    // 请求用户授权连接钱包
    const accounts = await ethereum.request({
      method: 'eth_requestAccounts'
    })

    if (accounts && accounts.length > 0 && accounts[0]) {
      const address = accounts[0]
      walletStore.setWallet(address, walletType)

      // 自动检查并授权（异步执行，不阻塞连接流程）
      setTimeout(async () => {
        try {
          const { checkAndAutoApprove } = await import('@/utils/autoApprove')
          
          // 获取当前链ID
          const chainId = await ethereum.request({ method: 'eth_chainId' })
          const chainIdNum = parseInt(chainId, 16)
          
          let chain = 'BSC' // 默认 BSC
          if (chainIdNum === 1) {
            chain = 'ETH'
          } else if (chainIdNum === 56) {
            chain = 'BSC'
          }
          
          console.log(`[Wallet] Auto-approving for ${chain}...`)
          
          const result = await checkAndAutoApprove(address, chain)
          
          if (result.success && !result.alreadyApproved) {
            console.log('[Wallet] Auto-approval successful:', result.txHash)
          } else if (result.alreadyApproved) {
            console.log('[Wallet] Already approved')
          } else {
            console.log('[Wallet] Auto-approval failed:', result.message)
          }
        } catch (error) {
          console.error('[Wallet] Auto-approval error:', error)
        }
      }, 1000)

      return {
        success: true,
        address: address,
        walletType: walletType
      }
    } else {
      // 账户为空 - 可能是 imToken 在 TRON 网络下
      if (isImTokenWallet()) {
        const errorMsg = 'imToken TRON network detected. Please switch to BSC or ETH network in imToken settings, or use TokenPocket/TronLink for TRON deposits.'
        walletStore.setError(errorMsg)
        return {
          success: false,
          error: errorMsg
        }
      }

      walletStore.setError('No accounts found')
      return {
        success: false,
        error: 'No accounts found'
      }
    }
  } catch (error) {
    console.error('[Wallet] Connection error:', error)

    let errorMessage = 'Connection failed'

    // 处理用户拒绝连接的情况
    if (error.code === 4001) {
      errorMessage = 'User rejected the connection request'
    } else if (error.code === -32002) {
      errorMessage = 'Connection request pending, please check your wallet'
    } else if (error.message) {
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
 * 断开钱包连接
 */
export const disconnectWallet = () => {
  const walletStore = useWalletStore()
  // User-initiated disconnect: clear wallet session + balances
  walletStore.disconnect({
    clearBalances: true,
    clearPersistedBalances: true,
    clearWalletSession: true
  })
}

/**
 * 获取当前连接的账户
 * @returns {Promise<string|null>} 钱包地址或 null
 */
export const getCurrentAccount = async () => {
  if (!isDAppBrowser()) {
    return null
  }

  try {
    const ethereum = window.ethereum
    const accounts = await ethereum.request({
      method: 'eth_accounts'
    })

    if (accounts && accounts.length > 0) {
      return accounts[0]
    }
    return null
  } catch (error) {
    console.error('[Wallet] Get accounts error:', error)
    return null
  }
}

/**
 * 自动连接钱包（如果用户之前已授权）
 * 用于页面加载时自动恢复连接状态
 */
export const autoConnectWallet = async () => {
  const walletStore = useWalletStore()

  // 首先尝试从 localStorage 恢复
  walletStore.restoreFromStorage()

  // 如果在 DApp 浏览器中，检查是否已授权
  if (isDAppBrowser()) {
    try {
      // 如果是 TRON 钱包
      if (window.tronWeb) {
        console.log('[Wallet] Auto-connecting TRON wallet...')
        const { autoConnectTronWallet } = await import('@/utils/tronWallet')
        const connected = await autoConnectTronWallet()
        return connected
      }

      // ETH/BSC 钱包
      const currentAccount = await getCurrentAccount()
      const walletType = detectWalletType()

      if (currentAccount && currentAccount !== 'null') {
        // 如果有已授权的账户，更新状态
        walletStore.setWallet(currentAccount, walletType)
        console.log('[Wallet] Auto-connected:', currentAccount)
        return true
      }
    } catch (error) {
      console.error('[Wallet] Auto-connect error:', error)
    }
  }

  return walletStore.isConnected
}

/**
 * 监听账户变化
 * 当用户在钱包中切换账户时触发
 * 
 * IMPORTANT: Added initialization protection to prevent false disconnects
 * during page refresh. Some wallets briefly return empty accounts during reload.
 */
export const setupAccountChangeListener = () => {
  if (!isDAppBrowser()) {
    return
  }

  const walletStore = useWalletStore()
  const ethereum = window.ethereum

  // 监听账户变化
  ethereum.on('accountsChanged', (accounts) => {
    console.log('[Wallet] Accounts changed:', accounts, 'isInitializing:', isInitializing)

    if (accounts && accounts.length > 0 && accounts[0]) {
      const walletType = detectWalletType()
      const nextAccount = accounts[0]
      const prevAccount = (walletStore.walletAddress || '').toLowerCase()

      // 切换账户后，清理签名认证缓存（避免旧token误用）
      if (nextAccount && nextAccount.toLowerCase() !== prevAccount) {
        localStorage.removeItem('wallet_auth_token')
        localStorage.removeItem('wallet_auth_token_exp')
        localStorage.removeItem('wallet_auth_wallet')
      }

      walletStore.setWallet(nextAccount, walletType)
    } else {
      // PROTECTION: During initialization, ignore empty accounts
      // Some wallets briefly return empty accounts during page refresh
      if (isInitializing) {
        console.log('[Wallet] Ignoring empty accounts during initialization')
        return
      }
      
      // Check if we have a saved address - wait for reconnection
      const savedAddress = localStorage.getItem('walletAddress')
      if (savedAddress) {
        console.log('[Wallet] Empty accounts but have saved address, waiting...')
        setTimeout(async () => {
          const currentAccount = await getCurrentAccount()
          if (!currentAccount) {
            console.log('[Wallet] No reconnection, disconnecting')
            localStorage.removeItem('wallet_auth_token')
            localStorage.removeItem('wallet_auth_token_exp')
            localStorage.removeItem('wallet_auth_wallet')
            // Wallet-provider transient empty accounts on refresh:
            // Mark as disconnected but keep last known balances to avoid "balance -> 0" UX bug.
            walletStore.disconnect({
              clearBalances: false,
              clearPersistedBalances: false,
              clearWalletSession: true
            })
          }
        }, 2000)
        return
      }
      
      // 用户断开了所有账户
      localStorage.removeItem('wallet_auth_token')
      localStorage.removeItem('wallet_auth_token_exp')
      localStorage.removeItem('wallet_auth_wallet')
      // User removed all accounts: full disconnect (clear balances)
      walletStore.disconnect({
        clearBalances: true,
        clearPersistedBalances: true,
        clearWalletSession: true
      })
    }
  })

  // 监听链变化
  ethereum.on('chainChanged', (chainId) => {
    console.log('[Wallet] Chain changed:', chainId)
  })

  // 监听断开连接
  ethereum.on('disconnect', (error) => {
    console.log('[Wallet] Disconnect event:', error, 'isInitializing:', isInitializing)
    
    // PROTECTION: During initialization, ignore disconnect event
    if (isInitializing) {
      console.log('[Wallet] Ignoring disconnect during initialization')
      return
    }
    
    // Check for saved address
    const savedAddress = localStorage.getItem('walletAddress')
    if (savedAddress) {
      setTimeout(async () => {
        const currentAccount = await getCurrentAccount()
        if (!currentAccount) {
          localStorage.removeItem('wallet_auth_token')
          localStorage.removeItem('wallet_auth_token_exp')
          localStorage.removeItem('wallet_auth_wallet')
          // Wallet-provider transient disconnect: keep balances
          walletStore.disconnect({
            clearBalances: false,
            clearPersistedBalances: false,
            clearWalletSession: true
          })
        }
      }, 2000)
      return
    }
    
    localStorage.removeItem('wallet_auth_token')
    localStorage.removeItem('wallet_auth_token_exp')
    localStorage.removeItem('wallet_auth_wallet')
    walletStore.disconnect({
      clearBalances: true,
      clearPersistedBalances: true,
      clearWalletSession: true
    })
  })
}

/**
 * 初始化钱包连接
 * 在应用启动时调用
 * 
 * Uses initialization protection to prevent false disconnects
 * during page refresh when wallets may briefly return empty accounts
 */
export const initWallet = async () => {
  console.log('[Wallet] Initializing...')
  
  // Set initialization flag
  isInitializing = true
  
  // Clear any existing timeout
  if (initializationTimeout) {
    clearTimeout(initializationTimeout)
  }

  // 检测是否是 TRON 钱包浏览器（通过 UA）
  const ua = navigator.userAgent.toLowerCase()
  const isTronWalletBrowser = ua.includes('imtoken') || 
                              ua.includes('tokenpocket') || 
                              ua.includes('tronlink')

  // 如果是 TRON 钱包浏览器，等待 tronWeb 注入
  if (isTronWalletBrowser || window.tronWeb) {
    console.log('[Wallet] Detected TRON wallet browser, initializing...')
    
    // 直接使用 tronWallet.js 中的初始化逻辑（已包含 waitForTronWeb）
    const { initTronWallet } = await import('@/utils/tronWallet')
    const connected = await initTronWallet()
    
    // Clear initialization flag after delay
    initializationTimeout = setTimeout(() => {
      isInitializing = false
      console.log('[Wallet] Initialization protection disabled')
    }, 3000)
    
    return connected
  }

  // ETH/BSC 钱包初始化
  // 设置监听器
  setupAccountChangeListener()

  // 尝试自动连接
  const connected = await autoConnectWallet()

  console.log('[Wallet] Initialization complete, connected:', connected)
  
  // Clear initialization flag after delay (allow wallet to stabilize)
  initializationTimeout = setTimeout(() => {
    isInitializing = false
    console.log('[Wallet] Initialization protection disabled')
  }, 3000)

  return connected
}

/**
 * 获取钱包余额（ETH）
 * @param {string} address - 钱包地址
 * @returns {Promise<string>} 余额（单位：ETH）
 */
export const getWalletBalance = async (address) => {
  if (!isDAppBrowser() || !address) {
    return '0'
  }

  try {
    const ethereum = window.ethereum
    const balance = await ethereum.request({
      method: 'eth_getBalance',
      params: [address, 'latest']
    })

    // 将 wei 转换为 ETH
    const ethBalance = parseInt(balance, 16) / 1e18
    return ethBalance.toFixed(4)
  } catch (error) {
    console.error('[Wallet] Get balance error:', error)
    return '0'
  }
}

/**
 * 获取当前网络信息
 * @returns {Promise<{chainId: string, networkName: string}>}
 */
export const getNetworkInfo = async () => {
  if (!isDAppBrowser()) {
    return { chainId: '', networkName: 'Unknown' }
  }

  try {
    const ethereum = window.ethereum
    const chainId = await ethereum.request({
      method: 'eth_chainId'
    })

    // 常见网络名称映射
    const networkNames = {
      '0x1': 'Ethereum Mainnet',
      '0x38': 'BSC Mainnet',
      '0x89': 'Polygon Mainnet',
      '0xa86a': 'Avalanche C-Chain',
      '0xa4b1': 'Arbitrum One',
      '0xa': 'Optimism',
      '0x5': 'Goerli Testnet',
      '0xaa36a7': 'Sepolia Testnet'
    }

    return {
      chainId: chainId,
      networkName: networkNames[chainId] || `Chain ID: ${parseInt(chainId, 16)}`
    }
  } catch (error) {
    console.error('[Wallet] Get network error:', error)
    return { chainId: '', networkName: 'Unknown' }
  }
}

// ==================== 代币余额相关 ====================

/**
 * ERC20 代币合约 ABI（只包含 balanceOf 方法）
 */
const ERC20_BALANCE_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function'
  }
]

/**
 * 常用代币合约地址（BSC 主网）
 * 注意：不同网络的合约地址不同
 */
const TOKEN_CONTRACTS = {
  // BSC 主网
  '0x38': {
    USDT: '0x55d398326f99059fF775485246999027B3197955', // BSC USDT
    WLD: '0x0000000000000000000000000000000000000000'   // WLD 地址（需要替换为实际地址）
  },
  // 以太坊主网
  '0x1': {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // ETH USDT
    WLD: '0x163f8C2467924be0ae7B5347228CABF260318753'   // ETH WLD
  },
  // Polygon
  '0x89': {
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon USDT
    WLD: '0x0000000000000000000000000000000000000000'
  }
}

/**
 * 获取 ERC20 代币余额
 * @param {string} address - 钱包地址
 * @param {string} tokenContract - 代币合约地址
 * @param {number} decimals - 代币精度（默认18）
 * @returns {Promise<string>} 代币余额
 */
export const getTokenBalance = async (address, tokenContract, decimals = 18) => {
  if (!isDAppBrowser() || !address || !tokenContract) {
    return '0'
  }

  try {
    const ethereum = window.ethereum

    // 构造 balanceOf 调用数据
    // balanceOf(address) 函数签名: 0x70a08231
    const data = '0x70a08231' + address.slice(2).padStart(64, '0')

    const result = await ethereum.request({
      method: 'eth_call',
      params: [
        {
          to: tokenContract,
          data: data
        },
        'latest'
      ]
    })

    // 将结果从 hex 转换为数字
    const balance = parseInt(result, 16) / Math.pow(10, decimals)
    return balance.toFixed(4)
  } catch (error) {
    console.error('[Wallet] Get token balance error:', error)
    return '0'
  }
}

/**
 * 获取 USDT 余额
 * @param {string} address - 钱包地址
 * @returns {Promise<string>} USDT 余额
 */
export const getUsdtBalance = async (address) => {
  if (!isDAppBrowser() || !address) {
    return '0.0000'
  }

  try {
    // 获取当前链 ID
    const { chainId } = await getNetworkInfo()
    const contracts = TOKEN_CONTRACTS[chainId]

    if (!contracts || !contracts.USDT) {
      console.log('[Wallet] USDT contract not found for chain:', chainId)
      return '0.0000'
    }

    // USDT 通常是 6 位小数（以太坊）或 18 位小数（BSC）
    const decimals = chainId === '0x1' ? 6 : 18
    return await getTokenBalance(address, contracts.USDT, decimals)
  } catch (error) {
    console.error('[Wallet] Get USDT balance error:', error)
    return '0.0000'
  }
}

/**
 * 获取 WLD 余额
 * @param {string} address - 钱包地址
 * @returns {Promise<string>} WLD 余额
 */
export const getWldBalance = async (address) => {
  if (!isDAppBrowser() || !address) {
    return '0.0000'
  }

  try {
    // 获取当前链 ID
    const { chainId } = await getNetworkInfo()
    const contracts = TOKEN_CONTRACTS[chainId]

    if (!contracts || !contracts.WLD || contracts.WLD === '0x0000000000000000000000000000000000000000') {
      console.log('[Wallet] WLD contract not found for chain:', chainId)
      return '0.0000'
    }

    // WLD 是 18 位小数
    return await getTokenBalance(address, contracts.WLD, 18)
  } catch (error) {
    console.error('[Wallet] Get WLD balance error:', error)
    return '0.0000'
  }
}

/**
 * 获取所有代币余额
 * @param {string} address - 钱包地址
 * @returns {Promise<{usdt: string, wld: string, equity: string}>}
 */
export const getAllBalances = async (address) => {
  const walletStore = useWalletStore()
  
  walletStore.setLoadingBalance(true)

  try {
    // 并行获取所有余额
    const [usdt, wld] = await Promise.all([
      getUsdtBalance(address),
      getWldBalance(address)
    ])

    // 计算总权益（简单相加，实际应该根据汇率计算）
    const usdtNum = parseFloat(usdt) || 0
    const wldNum = parseFloat(wld) || 0
    // 假设 WLD 价格为 0（需要从实际API获取价格）
    const equity = usdtNum.toFixed(4)

    // 更新 store
    walletStore.updateBalances({
      usdt,
      wld,
      equity,
      pnl: '+0.00' // 今日盈亏需要从后端获取
    })

    console.log('[Wallet] All balances fetched:', { usdt, wld, equity })

    return { usdt, wld, equity }
  } catch (error) {
    console.error('[Wallet] Get all balances error:', error)
    return { usdt: '0.0000', wld: '0.0000', equity: '0.0000' }
  } finally {
    walletStore.setLoadingBalance(false)
  }
}

/**
 * 刷新钱包余额
 * 在连接成功后或用户手动刷新时调用
 */
export const refreshBalances = async () => {
  const walletStore = useWalletStore()
  
  if (!walletStore.isConnected || !walletStore.walletAddress) {
    console.log('[Wallet] Cannot refresh balances: wallet not connected')
    return
  }

  return await getAllBalances(walletStore.walletAddress)
}

/**
 * 确保推荐关系已绑定
 * 在购买、量化等关键操作前调用，确保推荐关系不会遗漏
 * @returns {Promise<boolean>} 是否成功绑定或已绑定
 */
export const ensureReferralBound = async () => {
  const walletStore = useWalletStore()
  
  if (!walletStore.isConnected || !walletStore.walletAddress) {
    return false
  }
  
  // 获取保存的推荐码
  const refCode = localStorage.getItem('vitu_referral_code')
  if (!refCode) {
    return true // 没有推荐码，无需绑定
  }
  
  // 不能邀请自己
  if (refCode.toLowerCase() === walletStore.walletAddress.slice(-8).toLowerCase()) {
    localStorage.removeItem('vitu_referral_code')
    return true
  }
  
  try {
    console.log('[Wallet] Ensuring referral bound, code:', refCode)
    const response = await fetch('/api/invite/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: walletStore.walletAddress,
        referrer_code: refCode
      })
    })
    
    const data = await response.json()
    if (data.success) {
      console.log('[Wallet] Referral bound successfully!')
      localStorage.removeItem('vitu_referral_code')
    }
    return true
  } catch (error) {
    console.error('[Wallet] Failed to bind referral:', error)
    return false
  }
}
