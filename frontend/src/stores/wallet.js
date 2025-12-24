/**
 * 钱包状态管理 Store
 * 
 * 功能：
 * - 管理钱包连接状态
 * - 存储钱包地址和短ID
 * - 管理钱包余额（USDT、WLD等）
 * - 支持 TokenPocket、MetaMask 等 DApp 钱包
 * - 自动检测和连接钱包
 * - 余额持久化到 localStorage（刷新后立即显示）
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

// ==================== 余额持久化 ====================
const BALANCE_STORAGE_KEY = 'vitu_wallet_balances'

// Load persisted balances from localStorage
const loadPersistedBalances = () => {
  try {
    const saved = localStorage.getItem(BALANCE_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      console.log('[Wallet] Loaded persisted balances:', parsed)
      return parsed
    }
  } catch (e) {
    console.error('[Wallet] Failed to load persisted balances:', e)
  }
  return null
}

// Save balances to localStorage
const persistBalances = (usdt, wld, equity) => {
  try {
    localStorage.setItem(BALANCE_STORAGE_KEY, JSON.stringify({ usdt, wld, equity, ts: Date.now() }))
  } catch (e) {
    // Ignore storage errors
  }
}

export const useWalletStore = defineStore('wallet', () => {
  // ==================== 状态定义 ====================
  
  // 钱包连接状态
  const isConnected = ref(false)
  
  // 完整钱包地址
  const walletAddress = ref('')
  
  // 钱包短ID（显示用，如 1f94a213）
  const walletShortId = ref('')
  
  // 连接中状态
  const isConnecting = ref(false)
  
  // 错误信息
  const errorMessage = ref('')
  
  // 钱包类型（TokenPocket、MetaMask 等）
  const walletType = ref('')

  // ==================== 余额相关状态 ====================
  
  // Load initial balances from localStorage (for instant display after refresh)
  const persistedBalances = loadPersistedBalances()
  
  // USDT 余额
  const usdtBalance = ref(persistedBalances?.usdt || '0.0000')
  
  // WLD 余额
  const wldBalance = ref(persistedBalances?.wld || '0.0000')
  
  // 总权益价值（USDT）
  const equityValue = ref(persistedBalances?.equity || '0.0000')
  
  // 今日盈亏
  const todayPnl = ref('0.00')
  
  // 余额加载状态
  const isLoadingBalance = ref(false)
  
  // Watch for balance changes and persist them
  watch([usdtBalance, wldBalance, equityValue], ([usdt, wld, equity]) => {
    // Only persist non-zero balances
    if (usdt !== '0.0000' || wld !== '0.0000') {
      persistBalances(usdt, wld, equity)
    }
  })

  // ==================== 计算属性 ====================
  
  /**
   * 格式化显示的钱包ID
   * 格式：ID: xxxxxxxx
   */
  const displayWalletId = computed(() => {
    if (walletShortId.value) {
      return `ID: ${walletShortId.value}`
    }
    return ''
  })

  /**
   * 截取钱包地址的短ID
   * 取地址最后8位小写字符
   */
  const generateShortId = (address) => {
    if (!address) return ''
    // 取地址最后8位，转为小写
    return address.slice(-8).toLowerCase()
  }

  // ==================== 动作方法 ====================

  /**
   * 设置钱包连接状态
   * @param {string} address - 钱包地址
   * @param {string} type - 钱包类型
   */
  const setWallet = (address, type = 'Unknown') => {
    walletAddress.value = address
    walletShortId.value = generateShortId(address)
    walletType.value = type
    isConnected.value = true
    isConnecting.value = false
    errorMessage.value = ''
    
    // 保存到 localStorage
    localStorage.setItem('walletAddress', address)
    localStorage.setItem('walletType', type)
    
    console.log('[Wallet] Connected:', {
      address,
      shortId: walletShortId.value,
      type
    })
  }

  /**
   * Disconnect wallet session.
   *
   * IMPORTANT:
   * - There are 2 different "disconnect" scenarios in this project:
   *   1) User-initiated disconnect (explicit logout / switch account) -> should clear balances
   *   2) Wallet-provider transient disconnect during refresh (accounts temporarily empty) -> should NOT clear balances
   *
   * This method supports both by accepting options.
   *
   * @param {object} options
   * @param {boolean} options.clearBalances - When true, reset in-memory balances to 0
   * @param {boolean} options.clearPersistedBalances - When true, remove persisted balance cache from localStorage
   * @param {boolean} options.clearWalletSession - When true, clear walletAddress/walletType localStorage and mark disconnected
   */
  const disconnect = (options = {}) => {
    const {
      clearBalances = true,
      clearPersistedBalances = true,
      clearWalletSession = true
    } = options

    // Always stop "connecting" state and clear error message
    isConnecting.value = false
    errorMessage.value = ''

    // Clear wallet session state
    if (clearWalletSession) {
      walletAddress.value = ''
      walletShortId.value = ''
      walletType.value = ''
      isConnected.value = false

      // Clear wallet session storage
      localStorage.removeItem('walletAddress')
      localStorage.removeItem('walletType')
    }

    // Reset balances if requested
    if (clearBalances) {
      usdtBalance.value = '0.0000'
      wldBalance.value = '0.0000'
      equityValue.value = '0.0000'
      todayPnl.value = '0.00'
      isLoadingBalance.value = false
    }

    // Clear persisted balances if requested
    if (clearPersistedBalances) {
      localStorage.removeItem(BALANCE_STORAGE_KEY)
    }

    console.log('[Wallet] Disconnected', {
      clearBalances,
      clearPersistedBalances,
      clearWalletSession
    })
  }

  /**
   * 设置连接中状态
   */
  const setConnecting = (status) => {
    isConnecting.value = status
  }

  /**
   * 设置错误信息
   */
  const setError = (message) => {
    errorMessage.value = message
    isConnecting.value = false
  }

  /**
   * 从 localStorage 恢复钱包状态
   * 用于页面刷新后恢复连接状态
   */
  const restoreFromStorage = () => {
    const savedAddress = localStorage.getItem('walletAddress')
    const savedType = localStorage.getItem('walletType')
    
    if (savedAddress) {
      walletAddress.value = savedAddress
      walletShortId.value = generateShortId(savedAddress)
      walletType.value = savedType || 'Unknown'
      isConnected.value = true
      
      console.log('[Wallet] Restored from storage:', {
        address: savedAddress,
        shortId: walletShortId.value,
        type: savedType
      })
    }
  }

  // ==================== 余额相关方法 ====================

  /**
   * 设置 USDT 余额
   * @param {string} balance - USDT 余额
   */
  const setUsdtBalance = (balance) => {
    usdtBalance.value = formatBalance(balance)
  }

  /**
   * 设置 WLD 余额
   * @param {string} balance - WLD 余额
   */
  const setWldBalance = (balance) => {
    wldBalance.value = formatBalance(balance)
  }

  /**
   * 设置总权益价值
   * @param {string} value - 总权益价值（USDT）
   */
  const setEquityValue = (value) => {
    equityValue.value = formatBalance(value)
  }

  /**
   * 设置今日盈亏
   * @param {string} pnl - 今日盈亏
   */
  const setTodayPnl = (pnl) => {
    todayPnl.value = pnl
  }

  /**
   * 设置余额加载状态
   * @param {boolean} status - 是否加载中
   */
  const setLoadingBalance = (status) => {
    isLoadingBalance.value = status
  }

  /**
   * Format balance display with abbreviations for large numbers
   * Handles numbers beyond JavaScript's safe integer limit (9007199254740991)
   * @param {string|number} balance - Balance value
   * @returns {string} Formatted balance string
   */
  const formatBalance = (balance) => {
    // Handle null/undefined/invalid values
    if (balance === null || balance === undefined || balance === '') {
      return '0.0000'
    }
    
    // Convert to string first to preserve precision for very large numbers
    const strBalance = String(balance)
    
    // Parse as float (may lose precision for very large numbers)
    const num = parseFloat(strBalance)
    
    // Handle NaN or Infinity
    if (!isFinite(num) || isNaN(num)) {
      return '0.0000'
    }
    
    // For ultra-large numbers (Quadrillion+, > 1e15)
    if (num >= 1e15) {
      return (num / 1e15).toFixed(2) + 'Q'
    }
    // Trillion level (T, >= 1e12)
    if (num >= 1e12) {
      return (num / 1e12).toFixed(2) + 'T'
    }
    // Billion level (B, >= 1e9)
    if (num >= 1e9) {
      return (num / 1e9).toFixed(2) + 'B'
    }
    // Million level (M, >= 1e6)
    if (num >= 1e6) {
      return (num / 1e6).toFixed(2) + 'M'
    }
    // Hundred thousand level (K, >= 1e5)
    if (num >= 1e5) {
      return (num / 1e3).toFixed(2) + 'K'
    }
    
    // Normal number display with 4 decimal places
    return num.toFixed(4)
  }

  /**
   * 更新所有余额
   * @param {object} balances - 余额对象
   */
  const updateBalances = (balances) => {
    if (balances.usdt !== undefined) {
      usdtBalance.value = formatBalance(balances.usdt)
    }
    if (balances.wld !== undefined) {
      wldBalance.value = formatBalance(balances.wld)
    }
    if (balances.equity !== undefined) {
      equityValue.value = formatBalance(balances.equity)
    }
    if (balances.pnl !== undefined) {
      todayPnl.value = balances.pnl
    }
    
    console.log('[Wallet] Balances updated:', {
      usdt: usdtBalance.value,
      wld: wldBalance.value,
      equity: equityValue.value,
      pnl: todayPnl.value
    })
  }

  /**
   * 重置余额（断开连接时调用）
   */
  const resetBalances = () => {
    usdtBalance.value = '0.0000'
    wldBalance.value = '0.0000'
    equityValue.value = '0.0000'
    todayPnl.value = '0.00'
    isLoadingBalance.value = false
  }

  // ==================== 返回 ====================
  
  return {
    // 状态
    isConnected,
    walletAddress,
    walletShortId,
    isConnecting,
    errorMessage,
    walletType,
    
    // 余额状态
    usdtBalance,
    wldBalance,
    equityValue,
    todayPnl,
    isLoadingBalance,
    
    // 计算属性
    displayWalletId,
    
    // 方法
    setWallet,
    disconnect,
    setConnecting,
    setError,
    restoreFromStorage,
    generateShortId,
    
    // 余额方法
    setUsdtBalance,
    setWldBalance,
    setEquityValue,
    setTodayPnl,
    setLoadingBalance,
    updateBalances,
    resetBalances,
    formatBalance
  }
})

