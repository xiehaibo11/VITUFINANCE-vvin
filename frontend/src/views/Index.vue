<template>
  <div class="index-page">
    <!-- Signature Auth Blocking Overlay - Must sign to access -->
    <div v-if="requiresSignature && !isAuthenticated" class="auth-blocking-overlay">
      <div class="auth-blocking-content">
        <div class="auth-icon">🔐</div>
        <h2 class="auth-title">{{ t('signatureAuthPopup.title') || '钱包签名认证' }}</h2>
        <p class="auth-desc">{{ t('signatureAuthPopup.blockingDesc') || '为保护您的资产安全，请先完成钱包签名认证' }}</p>
        
        <button 
          class="auth-btn" 
          :disabled="signatureLoading"
          @click="handleSignatureConfirm"
        >
          <span v-if="signatureLoading">{{ t('signatureAuthPopup.processing') || '认证中...' }}</span>
          <span v-else>{{ t('signatureAuthPopup.confirm') || '签名认证' }}</span>
        </button>
        
        <p v-if="authError" class="auth-error">{{ authError }}</p>
        
        <div class="auth-tips">
          <p>💡 {{ t('signatureAuthPopup.tip1') || '签名不会转移任何资产' }}</p>
          <p>🛡️ {{ t('signatureAuthPopup.tip2') || '仅用于验证钱包所有权' }}</p>
        </div>
      </div>
    </div>

    <!-- Signature Auth Popup - Daily wallet authentication (backup) -->
    <SignatureAuthPopup 
      v-model:visible="showSignaturePopup" 
      :loading="signatureLoading"
      @confirm="handleSignatureConfirm"
    />

    <!-- 头部横幅 -->
    <div class="header-banner">
      <img :src="`${ICON_PATHS.INDEX}1_s.png`" alt="Banner" class="banner-img" />
    </div>

    <!-- 加密货币列表 -->
    <div class="crypto-section">
      <h2 class="section-title">{{ t('indexPage.sectionTitle') }}</h2>
      
      <!-- Loading 状态 -->
      <div v-if="loading" class="loading-container">
        <div class="loading-spinner"></div>
        <p>{{ t('common.loading') || '加载市场数据中...' }}</p>
      </div>

      <!-- Error 状态 -->
      <div v-else-if="error" class="error-container">
        <p class="error-message">{{ error }}</p>
        <button @click="fetchMarketData" class="retry-btn">{{ t('common.retry') || '重试' }}</button>
      </div>

      <!-- 数据列表 -->
      <div v-else class="crypto-list">
        <div v-for="crypto in cryptoList" :key="crypto.symbol" class="crypto-item">
          <img :src="`${ICON_PATHS.CRYPTO}${crypto.icon}`" :alt="crypto.name" class="crypto-icon" />
          <div class="crypto-info">
            <div class="crypto-name">{{ crypto.name }}</div>
            <div class="crypto-symbol">{{ crypto.symbol }}</div>
          </div>
          <div class="crypto-price">
            <div class="price">{{ crypto.price }}</div>
            <div :class="['change', getChangeClass(crypto.change)]">
              {{ typeof crypto.change === 'string' ? crypto.change : (crypto.change > 0 ? '+' : '') + crypto.change + '%' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 功能特性区 -->
    <div class="features-section">
      <div v-for="(img, index) in featureImages" :key="index" class="feature-item">
        <img :src="`${ICON_PATHS.INDEX}${img}`" :alt="`Feature ${index + 1}`" class="feature-img" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCryptoMarket } from '@/composables/useCryptoMarket'
import { CRYPTO_LIST, ICON_PATHS } from '@/utils/constants'
import { useWalletStore } from '@/stores/wallet'
import SignatureAuthPopup from '@/components/SignatureAuthPopup.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()
const walletStore = useWalletStore()

// ==================== Signature Auth State ====================
const showSignaturePopup = ref(false)
const signatureLoading = ref(false)
const requiresSignature = ref(false)  // Whether user needs to sign (in DApp browser)
const isAuthenticated = ref(false)    // Whether user has completed signature today
const authError = ref('')             // Error message for failed auth
const connectedWallet = ref('')       // Connected wallet address

// Storage keys
const SIGNATURE_TIMESTAMP_KEY = 'wallet_signature_timestamp'
const SIGNATURE_WALLET_KEY = 'wallet_signature_address'
const BIOMETRIC_TIP_SHOWN_KEY = 'biometric_tip_shown'

// Signature validity period: 24 hours (set to 0 for every visit)
const SIGNATURE_VALIDITY_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Check if ethereum wallet is available (TokenPocket, MetaMask, etc.)
 */
const hasWalletProvider = () => {
  return typeof window !== 'undefined' && !!window.ethereum
}

/**
 * Check if signature is still valid (within 24 hours)
 */
const isSignatureValid = (walletAddress) => {
  const savedTimestamp = localStorage.getItem(SIGNATURE_TIMESTAMP_KEY)
  const savedWallet = localStorage.getItem(SIGNATURE_WALLET_KEY)
  
  if (!savedTimestamp || !savedWallet) {
    console.log('[Signature] No saved signature found')
    return false
  }
  
  // Check if wallet matches
  if (savedWallet.toLowerCase() !== walletAddress.toLowerCase()) {
    console.log('[Signature] Wallet address mismatch')
    return false
  }
  
  // Check if within 24 hours
  const timestamp = parseInt(savedTimestamp, 10)
  const now = Date.now()
  const elapsed = now - timestamp
  
  if (elapsed > SIGNATURE_VALIDITY_MS) {
    console.log('[Signature] Signature expired, elapsed:', elapsed / 1000 / 60 / 60, 'hours')
    return false
  }
  
  console.log('[Signature] Signature still valid, remaining:', (SIGNATURE_VALIDITY_MS - elapsed) / 1000 / 60 / 60, 'hours')
  return true
}

/**
 * Save signature timestamp
 */
const saveSignatureTimestamp = (walletAddress) => {
  localStorage.setItem(SIGNATURE_TIMESTAMP_KEY, String(Date.now()))
  localStorage.setItem(SIGNATURE_WALLET_KEY, walletAddress.toLowerCase())
}

/**
 * Connect wallet and get account address
 */
const connectWalletAndGetAddress = async () => {
  if (!window.ethereum) {
    throw new Error('请在钱包浏览器中打开')
  }
  
  // Request wallet connection - this will prompt user to connect
  const accounts = await window.ethereum.request({ 
    method: 'eth_requestAccounts' 
  })
  
  if (!accounts || accounts.length === 0) {
    throw new Error('未获取到钱包地址')
  }
  
  return accounts[0]
}

/**
 * Request personal signature from wallet
 * This will trigger wallet's native signature popup (requires password)
 */
/**
 * Format timestamp to readable date string
 */
const formatDateTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

const requestSignature = async (walletAddress) => {
  if (!window.ethereum) {
    throw new Error(t('signatureAuthPopup.noWallet') || '请在钱包浏览器中打开')
  }
  
  // Create signature message with formatted timestamp
  const timestamp = Date.now()
  const formattedTime = formatDateTime(timestamp)
  
  // Build signature message using i18n translations
  const message = `${t('signatureAuthPopup.signTitle') || 'VituFinance Security Verification'}

${t('signatureAuthPopup.walletLabel') || 'Wallet Address'}: ${walletAddress}
${t('signatureAuthPopup.timeLabel') || 'Time'}: ${formattedTime}

${t('signatureAuthPopup.signNote') || 'This signature is only used to verify wallet ownership and will not transfer any assets.'}`
  
  console.log('[Signature] Requesting signature for message:', message)
  
  // Request personal_sign - this triggers wallet password prompt
  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [message, walletAddress]
  })
  
  console.log('[Signature] Signature obtained:', signature.substring(0, 20) + '...')
  return signature
}

/**
 * Show biometric setup tip (Face ID / Fingerprint)
 * Only shown once per device
 */
const showBiometricTip = () => {
  const tipShown = localStorage.getItem(BIOMETRIC_TIP_SHOWN_KEY)
  if (tipShown) return
  
  // Mark as shown
  localStorage.setItem(BIOMETRIC_TIP_SHOWN_KEY, 'true')
  
  // Show biometric setup tip with i18n translation
  setTimeout(() => {
    ElMessageBox.confirm(
      t('signatureAuthPopup.biometricDesc'),
      '💡 ' + t('signatureAuthPopup.biometricTitle'),
      {
        confirmButtonText: t('signatureAuthPopup.biometricConfirm'),
        cancelButtonText: t('signatureAuthPopup.biometricDontRemind'),
        type: 'info',
        center: true
      }
    ).catch(() => {
      // User clicked "Don't remind me", already saved
    })
  }, 500)
}

/**
 * Handle signature confirmation - MUST complete to access page
 */
const handleSignatureConfirm = async () => {
  signatureLoading.value = true
  authError.value = ''
  
  try {
    console.log('[Signature] Starting signature process...')
    
    // Step 1: Connect wallet and get address
    const walletAddress = await connectWalletAndGetAddress()
    console.log('[Signature] Wallet connected:', walletAddress)
    connectedWallet.value = walletAddress
    
    // Update wallet store
    walletStore.setWallet(walletAddress, 'TokenPocket')
    
    // Step 2: Request signature (triggers wallet password/biometric popup)
    await requestSignature(walletAddress)
    
    // Step 3: Save timestamp and grant access
    saveSignatureTimestamp(walletAddress)
    isAuthenticated.value = true
    
    console.log('[Signature] ✅ Authentication successful')
    ElMessage.success(t('signatureAuthPopup.success') || '签名认证成功')
    
    // Step 4: Show biometric setup tip (only once)
    showBiometricTip()
    
  } catch (error) {
    console.error('[Signature] Error:', error)
    
    // Handle specific error codes
    if (error.code === 4001) {
      // User rejected the request
      authError.value = '您取消了签名请求，请重新签名'
    } else if (error.code === -32002) {
      // Request pending
      authError.value = '请在钱包中完成签名操作'
    } else {
      authError.value = error.message || '签名失败，请重试'
    }
    
    ElMessage.error(authError.value)
  } finally {
    signatureLoading.value = false
  }
}

/**
 * Initialize signature auth check on page load
 * Auto-triggers signature request when in DApp browser
 */
const initSignatureAuth = async () => {
  console.log('[Signature] Initializing...')
  
  // Wait for wallet provider to be injected (TokenPocket needs time)
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // Check if wallet provider exists (TokenPocket, MetaMask, etc.)
  if (!hasWalletProvider()) {
    console.log('[Signature] No wallet provider detected, allowing normal access')
    requiresSignature.value = false
    isAuthenticated.value = true
    return
  }
  
  console.log('[Signature] ✅ Wallet provider detected (TokenPocket/MetaMask)')
  requiresSignature.value = true
  
  try {
    // Try to get already connected accounts (without prompting)
    const accounts = await window.ethereum.request({ method: 'eth_accounts' })
    
    if (accounts && accounts.length > 0) {
      const walletAddress = accounts[0]
      connectedWallet.value = walletAddress
      console.log('[Signature] Found connected wallet:', walletAddress)
      
      // Check if signature is still valid (only if SIGNATURE_VALIDITY_MS > 0)
      if (SIGNATURE_VALIDITY_MS > 0 && isSignatureValid(walletAddress)) {
        console.log('[Signature] Valid signature cache found, granting access')
        isAuthenticated.value = true
        walletStore.setWallet(walletAddress, 'TokenPocket')
        return
      }
    }
    
    // Need signature - show blocking overlay
    console.log('[Signature] 🔐 Signature required, showing auth overlay')
    isAuthenticated.value = false
    
    // Auto-trigger signature request after short delay
    // This gives user time to see the overlay before wallet popup appears
    setTimeout(() => {
      if (!isAuthenticated.value) {
        console.log('[Signature] Auto-triggering signature request...')
        handleSignatureConfirm()
      }
    }, 1500)
    
  } catch (error) {
    console.error('[Signature] Init error:', error)
    // On error, require signature
    isAuthenticated.value = false
  }
}

// ==================== Market Data ====================
// 初始化加密货币列表（添加默认值）
const initialCryptoList = CRYPTO_LIST.map(crypto => ({
  ...crypto,
  price: '$0.00',
  change: 0,
  chartData: []
}))

// 使用 Composable 管理市场数据
const { 
  cryptoList, 
  loading, 
  error, 
  fetchMarketData 
} = useCryptoMarket(initialCryptoList)

// 功能特性图片
const featureImages = ref(['2.png', '3.png', '4.png', '5.png'])

// 计算涨跌幅的 CSS 类
const getChangeClass = (change) => {
  const changeValue = typeof change === 'string' 
    ? parseFloat(change.replace('%', '')) 
    : change
  return changeValue > 0 ? 'positive' : changeValue < 0 ? 'negative' : 'neutral'
}

// ==================== Lifecycle ====================
onMounted(() => {
  // Initialize signature authentication check
  initSignatureAuth()
})
</script>

<style scoped>
/* ==================== Auth Blocking Overlay ==================== */
.auth-blocking-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.auth-blocking-content {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 40px 30px;
  max-width: 400px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.auth-icon {
  font-size: 64px;
  margin-bottom: 20px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.auth-title {
  color: #f5b638;
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 16px 0;
}

.auth-desc {
  color: rgba(255, 255, 255, 0.8);
  font-size: 15px;
  line-height: 1.6;
  margin: 0 0 30px 0;
}

.auth-btn {
  width: 100%;
  height: 52px;
  background: linear-gradient(135deg, #f5b638 0%, #e6a52f 100%);
  border: none;
  border-radius: 14px;
  color: #000;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  -webkit-appearance: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
}

.auth-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(245, 182, 56, 0.4);
}

.auth-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.auth-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.auth-error {
  color: #ff6b6b;
  font-size: 14px;
  margin: 16px 0 0 0;
  padding: 12px;
  background: rgba(255, 107, 107, 0.1);
  border-radius: 8px;
}

.auth-tips {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.auth-tips p {
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  margin: 8px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* ==================== Main Page Styles ==================== */
.index-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding-bottom: 20px;
}

.header-banner {
  width: 100%;
  overflow: hidden;
}

.banner-img {
  width: 100%;
  height: auto;
  display: block;
}

.crypto-section {
  padding: 20px;
}

.section-title {
  color: #fff;
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 20px;
  text-align: center;
}

.crypto-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.crypto-item {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 15px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.3s ease;
}

.crypto-item:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.crypto-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.crypto-info {
  flex: 1;
}

.crypto-name {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.crypto-symbol {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
}

.crypto-price {
  text-align: right;
}

.price {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.change {
  font-size: 14px;
  font-weight: 500;
}

.change.positive {
  color: #4ade80;
}

.change.negative {
  color: #f87171;
}

.change.neutral {
  color: rgba(255, 255, 255, 0.6);
}

/* Loading 状态 */
.loading-container {
  text-align: center;
  padding: 60px 20px;
  color: #fff;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.1);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Error 状态 */
.error-container {
  text-align: center;
  padding: 60px 20px;
  color: #fff;
}

.error-message {
  color: #ff6b6b;
  margin-bottom: 20px;
  font-size: 16px;
}

.retry-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.2s;
}

.retry-btn:hover {
  transform: translateY(-2px);
}

.features-section {
  padding: 20px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.feature-item {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.feature-img {
  width: 100%;
  height: auto;
  display: block;
  transition: transform 0.3s ease;
}

.feature-img:hover {
  transform: scale(1.05);
}

@media (max-width: 768px) {
  .crypto-section {
    padding: 15px;
  }

  .section-title {
    font-size: 20px;
  }

  .features-section {
    grid-template-columns: 1fr;
    padding: 15px;
  }
}
</style>
