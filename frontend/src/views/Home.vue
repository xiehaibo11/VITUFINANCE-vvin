<template>
  <div class="home-page">
    <!-- Announcement Banner -->
    <AnnouncementBanner />

    <!-- Hero Section -->
    <section class="hero-section">
      <img src="/static/one/4.png" alt="Background" class="hero-bg-image" />
      <div class="logo-container">
        <img src="/static/YAOQI/10.png" alt="Logo" class="hero-logo" />
        <h1 class="hero-title">Vitu Finance</h1>
      </div>
    </section>

    <!-- Introduction Card -->
    <section class="intro-card">
      <p class="intro-text">
        {{ t('homePage.introText') }}
      </p>
    </section>

    <!-- Worldcoin Card -->
    <section class="worldcoin-card">
      <img src="/static/two/twobj11.png" alt="Earth Background" class="worldcoin-bg" />
      <div class="worldcoin-content">
        <p class="worldcoin-text worldcoin-text-1">
          {{ t('homePage.worldcoinText1') }}
        </p>
        <p class="worldcoin-text worldcoin-text-2">
          {{ t('homePage.worldcoinText2') }}
        </p>
      </div>
      <div class="worldcoin-footer">
        <img src="/static/icon/wld.png" alt="WLD" class="wld-icon" />
        <span class="wld-amount">1</span>
        <span class="wld-label">WLD</span>
        <span class="wld-separator">≈</span>
        <span class="wld-price">${{ wldPriceDisplay }}</span>
      </div>
    </section>

    <!-- Center Logo Circle -->
    <section class="center-logo">
      <RippleCircle />
    </section>

    <!-- Energy and Pledge -->
    <section class="energy-section">
      <div class="energy-item">
        <span class="energy-icon">⚡</span>
        <span class="energy-value">0/0</span>
      </div>
      <div class="pledge-item" @click="goToPledge">
        <span class="pledge-icon">🛡️</span>
        <span class="pledge-text">{{ t('homePage.pledgeLabel') }}</span>
      </div>
    </section>

    <!-- Market Conditions - 币种行情（放在任务列表上方） -->
    <CryptoList />

    <!-- Daily Tasks Section -->
    <section class="tasks-section">
      <h2 class="section-title">{{ t('homePage.dailyTasks') }}</h2>
      <TaskItem 
        :title="t('homePage.dailyReward')"
        icon="/static/four/icon1.png"
        :completed="isDailyRewardClaimed"
        @click="openDailyReward"
      />
    </section>

    <!-- World Albot Telegram Section -->
    <section class="tasks-section">
      <h2 class="section-title">{{ t('homePage.worldAlbotTelegram') }}</h2>
      <TaskItem 
        :title="t('homePage.joinTgChannel')"
        icon="/static/four/icon2.png"
        @click="openTelegramPopup"
      />
    </section>

    <!-- Tasks List Section -->
    <section class="tasks-section">
      <h2 class="section-title">{{ t('homePage.tasksList') }}</h2>
      <TaskItem 
        :title="t('homePage.shareFacebook')"
        icon="/static/four/icon4.png"
        @click="openFacebookPopup"
      />
      <TaskItem 
        :title="t('homePage.followYoutube')"
        icon="/static/four/icon6.png"
        @click="openYouTubePopup"
      />
    </section>

    <!-- Social Links -->
    <section class="social-section">
      <div class="social-links">
        <a href="https://t.me/WorldGPT_io" target="_blank" class="social-link">
          <img src="/static/one/6.png" alt="Telegram" />
        </a>
        <a href="https://x.com/Virtu_Financial" target="_blank" class="social-link">
          <img src="/static/one/7.png" alt="Twitter" />
        </a>
        <a href="https://t.me/VituFinance" target="_blank" class="social-link">
          <img src="/static/one/8.png" alt="WhatsApp" />
        </a>
        <a href="https://api.whatsapp.com/send/?phone=16465271638&text&type=phone_number&app_absent=0" target="_blank" class="social-link">
          <img src="/static/one/em.png" alt="Support" />
        </a>
      </div>
    </section>

    <!-- Copyright -->
    <footer class="footer">
      <p>© 2024 Vitu Finance All rights reserved.</p>
    </footer>

    <!-- Bottom Navigation - 使用组件 -->
    <BottomNav />

    <!-- 每日签到弹窗 -->
    <DailyRewardPopup 
      v-model:visible="showDailyRewardPopup"
      @claim="handleCheckinSuccess"
    />

    <!-- Telegram 弹窗 -->
    <TelegramPopup 
      v-model:visible="showTelegramPopup"
      telegram-url="https://t.me/VituFinance"
      @check="handleTelegramCheck"
    />

    <!-- Facebook 弹窗 -->
    <FacebookPopup 
      v-model:visible="showFacebookPopup"
      facebook-url="https://www.facebook.com/share_channel/#"
      @check="handleFacebookCheck"
    />

    <!-- YouTube 弹窗 -->
    <YouTubePopup 
      v-model:visible="showYouTubePopup"
      youtube-url="https://www.youtube.com/channel/UC92aIDlejplKldAwfhvUlfg"
      @check="handleYouTubeCheck"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import RippleCircle from '../components/RippleCircle.vue'
import CryptoList from '../components/CryptoList.vue'
import BottomNav from '../components/BottomNav.vue'
import AnnouncementBanner from '../components/AnnouncementBanner.vue'
import TaskItem from '../components/TaskItem.vue'
import DailyRewardPopup from '../components/DailyRewardPopup.vue'
import TelegramPopup from '../components/TelegramPopup.vue'
import FacebookPopup from '../components/FacebookPopup.vue'
import YouTubePopup from '../components/YouTubePopup.vue'
import { useWalletStore } from '@/stores/wallet'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()
const router = useRouter()
const walletStore = useWalletStore()

// ==================== Signature Auth State ====================
const signatureLoading = ref(false)
const requiresSignature = ref(false)
const isAuthenticated = ref(false)
const authError = ref('')
const connectedWallet = ref('')

// Storage keys
const SIGNATURE_TIMESTAMP_KEY = 'wallet_signature_timestamp'
const SIGNATURE_WALLET_KEY = 'wallet_signature_address'
const BIOMETRIC_TIP_SHOWN_KEY = 'biometric_tip_shown'

// Signature validity period: 24 hours (set to 0 for every visit)
const SIGNATURE_VALIDITY_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Check if wallet provider exists (TokenPocket, MetaMask, etc.)
 */
const hasWalletProvider = () => {
  return typeof window !== 'undefined' && !!window.ethereum
}

/**
 * Check if signature is still valid
 */
const isSignatureValid = (walletAddress) => {
  if (SIGNATURE_VALIDITY_MS === 0) return false
  
  const savedTimestamp = localStorage.getItem(SIGNATURE_TIMESTAMP_KEY)
  const savedWallet = localStorage.getItem(SIGNATURE_WALLET_KEY)
  
  if (!savedTimestamp || !savedWallet) return false
  if (savedWallet.toLowerCase() !== walletAddress.toLowerCase()) return false
  
  const timestamp = parseInt(savedTimestamp, 10)
  return Date.now() - timestamp < SIGNATURE_VALIDITY_MS
}

/**
 * Save signature timestamp
 */
const saveSignatureTimestamp = (walletAddress) => {
  localStorage.setItem(SIGNATURE_TIMESTAMP_KEY, String(Date.now()))
  localStorage.setItem(SIGNATURE_WALLET_KEY, walletAddress.toLowerCase())
}

/**
 * Connect wallet and get address
 */
const connectWalletAndGetAddress = async () => {
  if (!window.ethereum) throw new Error('请在钱包浏览器中打开')
  
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
  if (!accounts || accounts.length === 0) throw new Error('未获取到钱包地址')
  
  return accounts[0]
}

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

/**
 * Request signature from wallet
 */
const requestSignature = async (walletAddress) => {
  if (!window.ethereum) throw new Error(t('signatureAuthPopup.noWallet') || '请在钱包浏览器中打开')
  
  const timestamp = Date.now()
  const formattedTime = formatDateTime(timestamp)
  
  // Build signature message using i18n translations
  const message = `${t('signatureAuthPopup.signTitle') || 'VituFinance Security Verification'}

${t('signatureAuthPopup.walletLabel') || 'Wallet Address'}: ${walletAddress}
${t('signatureAuthPopup.timeLabel') || 'Time'}: ${formattedTime}

${t('signatureAuthPopup.signNote') || 'This signature is only used to verify wallet ownership and will not transfer any assets.'}`
  
  console.log('[Signature] Requesting signature...')
  
  return await window.ethereum.request({
    method: 'personal_sign',
    params: [message, walletAddress]
  })
}

/**
 * Show biometric setup tip
 */
const showBiometricTip = () => {
  const tipShown = localStorage.getItem(BIOMETRIC_TIP_SHOWN_KEY)
  if (tipShown) return
  
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
    ).catch(() => {})
  }, 500)
}

/**
 * Handle signature confirmation
 */
const handleSignatureConfirm = async () => {
  signatureLoading.value = true
  authError.value = ''
  
  try {
    console.log('[Signature] Starting signature process...')
    
    const walletAddress = await connectWalletAndGetAddress()
    console.log('[Signature] Wallet connected:', walletAddress)
    connectedWallet.value = walletAddress
    
    walletStore.setWallet(walletAddress, 'TokenPocket')
    
    await requestSignature(walletAddress)
    
    saveSignatureTimestamp(walletAddress)
    isAuthenticated.value = true
    
    console.log('[Signature] ✅ Authentication successful')
    ElMessage.success(t('signatureAuthPopup.success') || '签名认证成功')
    
    showBiometricTip()
    
  } catch (error) {
    console.error('[Signature] Error:', error)
    
    if (error.code === 4001) {
      authError.value = '您取消了签名请求，请重新签名'
    } else if (error.code === -32002) {
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
 * Initialize signature auth
 */
const initSignatureAuth = async () => {
  console.log('[Signature] Initializing...')
  
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  if (!hasWalletProvider()) {
    console.log('[Signature] No wallet provider, allowing access')
    requiresSignature.value = false
    isAuthenticated.value = true
    return
  }
  
  console.log('[Signature] ✅ Wallet provider detected')
  requiresSignature.value = true
  
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' })
    
    if (accounts && accounts.length > 0) {
      const walletAddress = accounts[0]
      connectedWallet.value = walletAddress
      
      if (SIGNATURE_VALIDITY_MS > 0 && isSignatureValid(walletAddress)) {
        console.log('[Signature] Valid cache, granting access')
        isAuthenticated.value = true
        walletStore.setWallet(walletAddress, 'TokenPocket')
        return
      }
    }
    
    console.log('[Signature] 🔐 Signature required')
    isAuthenticated.value = false
    
    // Auto-trigger signature request
    setTimeout(() => {
      if (!isAuthenticated.value) {
        console.log('[Signature] Auto-triggering...')
        handleSignatureConfirm()
      }
    }, 1500)
    
  } catch (error) {
    console.error('[Signature] Init error:', error)
    isAuthenticated.value = false
  }
}

// ==================== 自动刷新相关 ====================
let refreshInterval = null
const REFRESH_INTERVAL = 30000 // 30秒自动刷新一次

// WLD 余额和价格
const wldBalance = ref('0')
const wldPrice = ref(0)

// 计算WLD的USDT价值（用于显示1 WLD的价格）
const wldPriceDisplay = computed(() => {
  const price = parseFloat(wldPrice.value) || 0
  return price.toFixed(2)
})

// 弹窗状态
const isDailyRewardClaimed = ref(false)
const showDailyRewardPopup = ref(false)
const showTelegramPopup = ref(false)
const showFacebookPopup = ref(false)
const showYouTubePopup = ref(false)

// 跳转到质押页面
const goToPledge = () => {
  router.push('/pledge')
}

// 打开每日签到弹窗
const openDailyReward = () => {
  // 如果今天已签到，提示用户
  if (isDailyRewardClaimed.value) {
    alert(t('dailyReward.alreadyClaimedToday') || 'Already claimed today')
    return
  }
  showDailyRewardPopup.value = true
}

// 签到成功回调
const handleCheckinSuccess = () => {
  isDailyRewardClaimed.value = true
  showDailyRewardPopup.value = false
}

// 打开 Telegram 弹窗
const openTelegramPopup = () => {
  showTelegramPopup.value = true
}

// 打开 Facebook 弹窗
const openFacebookPopup = () => {
  showFacebookPopup.value = true
}

// 打开 YouTube 弹窗
const openYouTubePopup = () => {
  showYouTubePopup.value = true
}

// Telegram 任务回调
const handleTelegramCheck = (data) => {
  console.log('检查 Telegram 任务', data)
}

// Facebook 任务回调
const handleFacebookCheck = (data) => {
  console.log('检查 Facebook 任务', data)
}

// YouTube 任务回调
const handleYouTubeCheck = (data) => {
  console.log('检查 YouTube 任务', data)
}

// 检查今日是否已签到
const checkTodayCheckin = async () => {
  if (!walletStore.isConnected || !walletStore.walletAddress) {
    return
  }
  
  try {
    const response = await fetch(`/api/checkin/status?wallet=${walletStore.walletAddress}`)
    const data = await response.json()
    
    if (data.success) {
      isDailyRewardClaimed.value = data.data.claimedToday
    }
  } catch (error) {
    console.error('检查签到状态失败:', error)
  }
}

// 获取WLD价格
const fetchWldPrice = async () => {
  try {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://bocail.com'
    const response = await fetch(`${API_BASE}/api/market/ticker?symbols=["WLDUSDT"]`)
    const data = await response.json()
    
    // API直接返回币安数组数据 [{symbol, lastPrice, ...}]
    if (Array.isArray(data) && data.length > 0) {
      wldPrice.value = parseFloat(data[0].lastPrice) || 0
      console.log('[Home] WLD price fetched:', wldPrice.value)
    } else if (data.success && data.data && data.data.length > 0) {
      // 兼容包装格式
      wldPrice.value = parseFloat(data.data[0].lastPrice) || 0
    }
  } catch (error) {
    console.error('获取WLD价格失败:', error)
    wldPrice.value = 0
  }
}

// 获取WLD余额
const fetchWldBalance = async () => {
  if (!walletStore.isConnected || !walletStore.walletAddress) {
    wldBalance.value = '0'
    return
  }
  
  try {
    const response = await fetch(`/api/user/balance?wallet_address=${walletStore.walletAddress}`)
    const data = await response.json()
    
    if (data.success && data.data) {
      wldBalance.value = parseFloat(data.data.wld_balance || 0).toFixed(4)
    }
  } catch (error) {
    console.error('获取WLD余额失败:', error)
    wldBalance.value = '0'
  }
}

// ==================== 自动刷新方法 ====================

/**
 * 刷新所有数据（包括签到状态）
 */
const refreshAllData = async () => {
  console.log('[Home] 自动刷新数据...')
  await fetchWldPrice()
  if (walletStore.isConnected) {
    await Promise.all([
      fetchWldBalance(),
      checkTodayCheckin()  // 刷新签到状态，确保跨天后状态正确
    ])
  }
}

/**
 * 启动自动刷新定时器
 */
const startAutoRefresh = () => {
  stopAutoRefresh()
  refreshInterval = setInterval(refreshAllData, REFRESH_INTERVAL)
}

/**
 * 停止自动刷新定时器
 */
const stopAutoRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

/**
 * 页面可见性变化处理
 */
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    console.log('[Home] 页面变为可见，刷新数据...')
    refreshAllData()
  }
}

// 页面加载时初始化数据
onMounted(async () => {
  // Initialize signature authentication
  initSignatureAuth()
  
  // 获取WLD价格（无需登录）
  await fetchWldPrice()
  
  // 如果钱包已连接，获取更多数据
  if (walletStore.isConnected) {
    await Promise.all([
      checkTodayCheckin(),
      fetchWldBalance()
    ])
  }
  
  // 启动自动刷新和监听页面可见性
  startAutoRefresh()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

// 组件卸载时清理
onUnmounted(() => {
  stopAutoRefresh()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

// 监听钱包连接状态变化
watch(() => walletStore.isConnected, async (connected) => {
  if (connected) {
    await fetchWldBalance()
    await checkTodayCheckin()
  } else {
    wldBalance.value = '0'
  }
})
</script>

<style scoped>
/* ==================== Home Page ==================== */
.home-page {
  min-height: 100vh;
  background: var(--UI-BG-0);
  padding-top: 108px;
  padding-bottom: 80px;
  color: var(--UI-FG-0);
}

/* Hero Section */
.hero-section {
  position: relative;
  width: 100%;
  max-width: 558px;
  height: 372px;
  margin: 0 auto 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.hero-bg-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 1;
}

.logo-container {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.hero-logo {
  width: 64px;
  height: 72px;
  object-fit: contain;
}

.hero-title {
  font-size: 32px;
  font-weight: bold;
  color: #fff;
  margin: 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* Introduction Card */
.intro-card {
  background: rgba(45, 55, 72, 0.6);
  border-radius: 16px;
  padding: 24px;
  margin: -80px auto 16px;
  max-width: 387px;
  min-height: 464px;
  position: relative;
  z-index: 3;
}

.intro-text {
  font-size: 13px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.85);
  margin: 0;
  text-align: justify;
}

/* Worldcoin Card */
.worldcoin-card {
  width: 100%;
  max-width: 387px;
  height: 306px;
  margin: 0 auto 24px;
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.worldcoin-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

.worldcoin-content {
  width: 100%;
  max-width: 350px;
  min-height: auto;
  padding: 20px 16px;
  position: relative;
  z-index: 1;
}

.worldcoin-text {
  font-size: 13px;
  line-height: 1.5;
  color: #fff;
  margin: 0 0 12px 0;
  text-align: left;
}

.worldcoin-text-2 { margin-bottom: 0; }

.worldcoin-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 16px;
  position: relative;
  z-index: 10;
}

.wld-icon { width: 20px; height: 20px; object-fit: contain; }
.wld-amount { font-size: 24px; font-weight: bold; color: #f59e0b; }
.wld-label { font-size: 16px; font-weight: 600; color: #fff; }
.wld-separator { font-size: 16px; color: #fff; margin: 0 2px; }
.wld-price { font-size: 24px; font-weight: bold; color: #fff; }

/* Center Logo */
.center-logo {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px 16px;
}

/* Tasks Section */
.tasks-section {
  padding: 0 16px;
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  margin: 0 0 12px 0;
  padding-left: 4px;
}

/* Energy Section */
.energy-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 32px;
  margin-bottom: 32px;
}

.energy-item, .pledge-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.energy-icon, .pledge-icon { font-size: 24px; }

/* Social Links */
.social-section { padding: 32px 16px; }

.social-links {
  display: flex;
  justify-content: center;
  gap: 24px;
}

.social-link img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.social-link {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.social-link:hover {
  transform: translateY(-4px);
}

.social-icon-placeholder {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  color: #fff;
}

/* Footer 版权信息 */
.footer {
  padding: 24px 16px 100px;
  text-align: center;
}

.footer p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

/* Desktop Adaptation */
@media (min-width: 769px) {
  .home-page { max-width: 1200px; margin: 0 auto; }
  .hero-section { padding: 60px 0; position: static; max-width: 1200px; overflow: visible; }
  .hero-bg-image { position: absolute; top: 300px; right: 0; left: auto; width: 318.99px; height: 213px; object-fit: contain; }
  .intro-card { margin: -80px auto 24px; }
  .worldcoin-card { margin: 0 auto 24px; }
  .center-logo { padding: 80px 0; }
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .hero-section { max-width: 100%; height: auto; aspect-ratio: 558 / 372; margin: 0 16px 16px; }
  .hero-logo { width: 56px; height: 63px; }
  .hero-title { font-size: 28px; }
  .intro-card { max-width: 331px; min-height: 181px; margin: -80px auto 16px; padding: 16px; }
  .intro-text { font-size: 11px; line-height: 1.5; }
  .worldcoin-card { max-width: 333px; height: auto; min-height: 175px; margin: 0 auto 16px; }
  .worldcoin-content { max-width: 300px; padding: 16px; }
  .worldcoin-text { font-size: 11px; line-height: 1.4; margin: 0 0 8px 0; }
  .worldcoin-footer { padding: 12px; gap: 6px; }
  .wld-icon { width: 16px; height: 16px; }
  .wld-amount, .wld-price { font-size: 18px; }
  .wld-label, .wld-separator { font-size: 14px; }
}

@media (max-width: 480px) {
  .hero-section { margin: 0 12px 12px; }
  .hero-logo { width: 48px; height: 54px; }
  .hero-title { font-size: 24px; }
  .worldcoin-card { max-width: calc(100% - 24px); margin: 0 12px 12px; }
}
</style>
