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
import { isDAppBrowser, detectWalletType } from '@/utils/wallet'
import { 
  hasValidSignatureAuthCache, 
  ensureTokenPocketSignatureAuth,
  clearSignatureAuthCache
} from '@/utils/signatureAuth'
import SignatureAuthPopup from '@/components/SignatureAuthPopup.vue'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const walletStore = useWalletStore()

// ==================== Signature Auth State ====================
const showSignaturePopup = ref(false)
const signatureLoading = ref(false)
const requiresSignature = ref(false)  // Whether user needs to sign (in DApp browser)
const isAuthenticated = ref(false)    // Whether user has completed signature today
const authError = ref('')             // Error message for failed auth

// Storage key for daily signature check
const DAILY_SIGNATURE_KEY = 'daily_signature_date'

/**
 * Check if user is in DApp browser environment
 * Returns true if in TokenPocket or similar wallet browser
 */
const isInDAppBrowser = () => {
  if (!isDAppBrowser()) {
    return false
  }
  // Support all wallet types, not just TokenPocket
  const walletType = detectWalletType()
  console.log('[Index] Wallet type detected:', walletType)
  return walletType !== 'Unknown'
}

/**
 * Check if user needs to sign today
 * Returns true if signature is needed
 */
const needsDailySignature = () => {
  // Only require signature in DApp browser
  if (!isInDAppBrowser()) {
    console.log('[Index] Not in DApp browser, skipping signature check')
    return false
  }

  // Get today's date string (YYYY-MM-DD)
  const today = new Date().toISOString().split('T')[0]
  const lastSignatureDate = localStorage.getItem(DAILY_SIGNATURE_KEY)
  
  console.log('[Index] Daily signature check:', { today, lastSignatureDate })
  
  // If already signed today, no need to sign again
  if (lastSignatureDate === today) {
    console.log('[Index] Already signed today, skipping')
    return false
  }
  
  // Check if has valid cached token for current wallet
  const walletAddress = walletStore.walletAddress
  if (hasValidSignatureAuthCache({ walletAddress })) {
    // Has valid cache but check date
    console.log('[Index] Has valid cache but checking daily requirement')
  }
  
  return true
}

/**
 * Handle signature confirmation - MUST complete to access page
 */
const handleSignatureConfirm = async () => {
  signatureLoading.value = true
  authError.value = ''
  
  try {
    const result = await ensureTokenPocketSignatureAuth({ force: true })
    
    if (result.success) {
      // Save today's date as signed
      const today = new Date().toISOString().split('T')[0]
      localStorage.setItem(DAILY_SIGNATURE_KEY, today)
      
      // Mark as authenticated - allow access to page
      isAuthenticated.value = true
      showSignaturePopup.value = false
      ElMessage.success(t('signatureAuthPopup.success') || '签名认证成功')
    } else if (result.error) {
      // Show error but keep blocking
      authError.value = result.error
      ElMessage.error(result.error)
    }
  } catch (error) {
    console.error('[Index] Signature auth failed:', error)
    authError.value = error?.message || '签名认证失败'
    ElMessage.error(error?.message || '签名认证失败')
  } finally {
    signatureLoading.value = false
  }
}

/**
 * Initialize signature auth check on page load
 */
const initSignatureAuth = async () => {
  // Delay a bit to let wallet connect first
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // Check if in DApp browser
  if (isInDAppBrowser()) {
    requiresSignature.value = true
    
    // Check if already authenticated today
    const today = new Date().toISOString().split('T')[0]
    const lastSignatureDate = localStorage.getItem(DAILY_SIGNATURE_KEY)
    
    if (lastSignatureDate === today) {
      // Already signed today, allow access
      isAuthenticated.value = true
      console.log('[Index] Already authenticated today')
    } else {
      // Need to sign - block page access
      isAuthenticated.value = false
      console.log('[Index] Signature required - blocking page access')
    }
  } else {
    // Not in DApp browser, allow normal access
    requiresSignature.value = false
    isAuthenticated.value = true
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
