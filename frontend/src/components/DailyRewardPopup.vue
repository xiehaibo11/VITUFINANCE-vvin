<template>
  <div v-if="visible" class="popup-overlay" @click="closePopup">
    <div class="popup-container" @click.stop>
      <!-- 关闭按钮 -->
      <div class="close-btn" @click="closePopup">
        <svg width="23" height="23" viewBox="0 0 23 23" fill="none">
          <circle cx="11.5" cy="11.5" r="11.5" fill="#f5b638" />
          <path d="M7 7L16 16M16 7L7 16" stroke="#000" stroke-width="2" stroke-linecap="round" />
        </svg>
      </div>

      <!-- 飘动金币动画容器 -->
      <div class="floating-coins-container">
        <div 
          v-for="coin in floatingCoins" 
          :key="coin.id" 
          class="floating-coin"
          :style="coin.style"
        >
          <img src="/static/icon/wld.png" alt="WLD" />
        </div>
      </div>

      <!-- 可滑动的内容区域 -->
      <div class="popup-content-wrapper">
        <!-- 顶部背景图 -->
        <div class="popup-header">
          <img src="/static/two/image.png" alt="Header" />
        </div>

        <!-- 主体内容 -->
        <div class="popup-body">
          <!-- 日历图标 -->
          <div class="calendar-icon">
            <img src="/static/four/icon1.png" alt="Daily Reward Icon" />
          </div>

          <!-- 标题 -->
          <h2 class="title">{{ t('dailyReward.title') }}</h2>

          <!-- 描述文字 -->
          <p class="description">
            {{ t('dailyReward.description') }}
          </p>

          <!-- 签到天数格子 - 仅在连接钱包后显示 -->
          <div v-if="isWalletConnected" class="days-grid" ref="daysGridRef">
            <!-- 第一行：Day 1-4 -->
            <div class="days-row">
              <div 
                v-for="day in 4" 
                :key="day" 
                class="day-card"
                :class="{ 
                  'active': currentDay === day && !claimedToday,
                  'claimed': day < currentDay || (day === currentDay && claimedToday)
                }"
                :ref="el => setDayCardRef(el, day)"
              >
                <span class="day-label">{{ t('dailyReward.day') }} {{ day }}</span>
                <img src="/static/icon/wld.png" alt="WLD" class="wld-icon" />
                <span class="reward-amount">+2 WLD</span>
              </div>
            </div>
            <!-- 第二行：Day 5-8 -->
            <div class="days-row">
              <div 
                v-for="day in [5, 6, 7, 8]" 
                :key="day" 
                class="day-card"
                :class="{ 
                  'active': currentDay === day && !claimedToday,
                  'claimed': day < currentDay || (day === currentDay && claimedToday)
                }"
                :ref="el => setDayCardRef(el, day)"
              >
                <span class="day-label">{{ t('dailyReward.day') }} {{ day }}</span>
                <img src="/static/icon/wld.png" alt="WLD" class="wld-icon" />
                <span class="reward-amount">+2 WLD</span>
              </div>
            </div>
            <!-- 第三行：Day 9-10 -->
            <div class="days-row">
              <div 
                v-for="day in [9, 10]" 
                :key="day" 
                class="day-card"
                :class="{ 
                  'active': currentDay === day && !claimedToday,
                  'claimed': day < currentDay || (day === currentDay && claimedToday)
                }"
                :ref="el => setDayCardRef(el, day)"
              >
                <span class="day-label">{{ t('dailyReward.day') }} {{ day }}</span>
                <img src="/static/icon/wld.png" alt="WLD" class="wld-icon" />
                <span class="reward-amount">+2 WLD</span>
              </div>
            </div>
          </div>

          <!-- 未连接钱包时的提示 -->
          <div v-else class="connect-wallet-hint">
            <p>{{ t('dailyReward.connectWalletHint') || t('common.connectWalletFirst') || 'Please connect your wallet first' }}</p>
          </div>

          <!-- Claim 按钮 -->
          <button class="claim-btn" :disabled="!isWalletConnected || claimedToday || isProcessing" @click="handleClaim">
            <span v-if="!isWalletConnected">{{ t('dailyReward.claim') }}</span>
            <span v-else-if="claimedToday">{{ t('dailyReward.claimed') }}</span>
            <span v-else-if="isProcessing">{{ t('dailyReward.processing') }}</span>
            <span v-else>{{ t('dailyReward.claim') }}</span>
          </button>
        </div>
      </div>

      <!-- 底部导航栏 -->
      <BottomNav :in-popup="true" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BottomNav from './BottomNav.vue'
import axios from 'axios'

const { t } = useI18n()

// 组件属性定义
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

// 事件定义
const emit = defineEmits(['update:visible', 'claim'])

// API 基础地址
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://vitufinance.com'

// 状态变量
const streak = ref(0)           // 连续签到天数
const currentDay = ref(1)       // 当前签到天数（1-10）
const claimedToday = ref(false) // 今天是否已签到
const isProcessing = ref(false) // 是否正在处理
const walletAddress = ref('')   // 钱包地址

// 是否连接钱包
const isWalletConnected = computed(() => {
  return !!walletAddress.value
})

// 飘动金币动画相关
const floatingCoins = ref([])   // 飘动的金币列表
const daysGridRef = ref(null)   // 签到格子容器引用
const dayCardRefs = ref({})     // 每日卡片引用

// 设置日卡片引用
const setDayCardRef = (el, day) => {
  if (el) {
    dayCardRefs.value[day] = el
  }
}

// 触发金币飘动动画
const triggerCoinAnimation = (dayNumber) => {
  // 获取当前签到卡片的位置
  const cardEl = dayCardRefs.value[dayNumber]
  if (!cardEl) return
  
  const cardRect = cardEl.getBoundingClientRect()
  const startX = cardRect.left + cardRect.width / 2
  const startY = cardRect.top + cardRect.height / 2
  
  // 目标位置：顶部导航栏 ID 位置（大约在屏幕顶部中间）
  const targetX = window.innerWidth / 2
  const targetY = 50 // 顶部导航栏的大概位置
  
  // 创建多个金币
  const coinCount = 8 // 金币数量
  const newCoins = []
  
  for (let i = 0; i < coinCount; i++) {
    const coin = {
      id: Date.now() + i,
      style: {
        left: `${startX}px`,
        top: `${startY}px`,
        '--target-x': `${targetX - startX + (Math.random() - 0.5) * 60}px`,
        '--target-y': `${targetY - startY}px`,
        '--random-x': `${(Math.random() - 0.5) * 100}px`,
        '--delay': `${i * 0.08}s`,
        '--duration': `${0.8 + Math.random() * 0.4}s`,
        animationDelay: `${i * 0.08}s`,
        animationDuration: `${0.8 + Math.random() * 0.4}s`
      }
    }
    newCoins.push(coin)
  }
  
  floatingCoins.value = newCoins
  
  // 播放金币音效
  playCoinSound()
  
  // 动画结束后清除金币
  setTimeout(() => {
    floatingCoins.value = []
  }, 2000)
}

// 音频上下文（全局复用）
let audioCtx = null
// 标记是否已经有用户交互（浏览器要求用户交互后才能播放音频）
let userInteracted = false

// 初始化用户交互监听（只需要一次用户交互即可解锁音频）
const initUserInteraction = () => {
  if (userInteracted) return
  
  const unlockAudio = () => {
    userInteracted = true
    // 创建并立即恢复音频上下文
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
    // 移除事件监听器
    document.removeEventListener('click', unlockAudio)
    document.removeEventListener('touchstart', unlockAudio)
    document.removeEventListener('touchend', unlockAudio)
  }
  
  document.addEventListener('click', unlockAudio)
  document.addEventListener('touchstart', unlockAudio)
  document.addEventListener('touchend', unlockAudio)
}

// 获取或创建音频上下文
const getAudioContext = () => {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      console.log('[Audio] Created AudioContext, state:', audioCtx.state)
    } catch (e) {
      console.warn('[Audio] Failed to create AudioContext:', e)
      return null
    }
  }
  // 如果音频上下文被挂起，尝试恢复它
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('[Audio] AudioContext resumed')
    }).catch(e => {
      console.warn('[Audio] Failed to resume AudioContext:', e)
    })
  }
  return audioCtx
}

// 播放金币领取音效（清脆悦耳的叮当声）
const playCoinSound = () => {
  try {
    // 检查是否支持 Web Audio API
    if (!window.AudioContext && !window.webkitAudioContext) {
      console.warn('[Audio] Web Audio API not supported')
      return
    }
    
    const audioContext = getAudioContext()
    if (!audioContext) {
      console.warn('[Audio] AudioContext not available')
      return
    }
    
    // 检查音频上下文状态
    if (audioContext.state === 'suspended') {
      console.log('[Audio] AudioContext is suspended, attempting to resume...')
      audioContext.resume().catch(e => {
        console.warn('[Audio] Cannot resume AudioContext:', e.message)
      })
    }
    
    console.log('[Audio] Playing coin sound, context state:', audioContext.state)
    
    // 创建清脆的"叮"声
    const playDing = (delay, pitch = 1, vol = 0.25) => {
      setTimeout(() => {
        try {
          const osc1 = audioContext.createOscillator()
          const osc2 = audioContext.createOscillator()
          const osc3 = audioContext.createOscillator()
          const gain = audioContext.createGain()
          const filter = audioContext.createBiquadFilter()
          
          filter.type = 'bandpass'
          filter.frequency.value = 4000 * pitch
          filter.Q.value = 3
          
          osc1.connect(filter)
          osc2.connect(filter)
          osc3.connect(gain)
          filter.connect(gain)
          gain.connect(audioContext.destination)
          
          osc1.frequency.value = 4200 * pitch + Math.random() * 200
          osc1.type = 'sine'
          osc2.frequency.value = 6800 * pitch + Math.random() * 300
          osc2.type = 'sine'
          osc3.frequency.value = 2400 * pitch
          osc3.type = 'triangle'
          
          const now = audioContext.currentTime
          gain.gain.setValueAtTime(0, now)
          gain.gain.linearRampToValueAtTime(vol, now + 0.003)
          gain.gain.exponentialRampToValueAtTime(vol * 0.3, now + 0.05)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
          
          osc1.start(now)
          osc2.start(now)
          osc3.start(now)
          osc1.stop(now + 0.18)
          osc2.stop(now + 0.18)
          osc3.stop(now + 0.18)
        } catch (e) { console.log('Ding error:', e) }
      }, delay)
    }
    
    // 金属回响声
    const playRing = (delay, pitch = 1) => {
      setTimeout(() => {
        try {
          const osc = audioContext.createOscillator()
          const gain = audioContext.createGain()
          osc.connect(gain)
          gain.connect(audioContext.destination)
          osc.frequency.value = 3200 * pitch
          osc.type = 'sine'
          const now = audioContext.currentTime
          gain.gain.setValueAtTime(0.08, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
          osc.start(now)
          osc.stop(now + 0.3)
        } catch (e) { console.log('Ring error:', e) }
      }, delay)
    }
    
    // 叮叮当当声序列
    playDing(0, 1.0, 0.3)
    playDing(60, 1.15, 0.28)
    playDing(110, 0.95, 0.25)
    playDing(170, 1.1, 0.22)
    playDing(220, 1.2, 0.18)
    playDing(280, 0.9, 0.15)
    playDing(330, 1.05, 0.12)
    playDing(400, 1.15, 0.1)
    
    // 金属回响
    playRing(30, 1.0)
    playRing(150, 1.1)
    playRing(250, 0.95)
    
  } catch (e) {
    console.log('Audio not supported:', e)
  }
}

// 关闭弹窗
const closePopup = () => {
  emit('update:visible', false)
}

// 获取钱包地址
const getWalletAddress = () => {
  // 从 localStorage 获取钱包地址
  const wallet = localStorage.getItem('walletAddress') || localStorage.getItem('wallet_address')
  if (wallet) {
    walletAddress.value = wallet.toLowerCase()
    return wallet.toLowerCase()
  }
  return null
}

// 从服务器加载签到状态
const loadCheckinStatus = async () => {
  const wallet = getWalletAddress()
  if (!wallet) {
    // 没有钱包地址，重置为初始状态（新用户）
    resetToInitialState()
    return
  }
  
  try {
    const response = await axios.get(`${API_BASE}/api/checkin/status`, {
      params: { wallet }
    })
    
    if (response.data.success) {
      const data = response.data.data
      claimedToday.value = data.claimedToday
      streak.value = data.totalCheckins || 0
      currentDay.value = data.currentDay
      console.log('[签到状态]', { claimedToday: data.claimedToday, currentDay: data.currentDay, totalCheckins: data.totalCheckins })
    }
  } catch (error) {
    console.error('获取签到状态失败:', error)
    // 失败时重置为初始状态
    resetToInitialState()
  }
}

// 重置为初始状态（新用户）
const resetToInitialState = () => {
  streak.value = 0
  currentDay.value = 1
  claimedToday.value = false
}

// 本地存储备用方案
const STORAGE_KEY = 'dailyRewardState'

// 获取北京时间（UTC+8）的日期字符串，避免时区问题
const getTodayKey = () => {
  const now = new Date()
  // 转换为北京时间（UTC+8）
  const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
  return beijingTime.toISOString().slice(0, 10)
}

const loadLocalState = () => {
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    if (cached) {
      const state = JSON.parse(cached)
      const totalCheckins = Number(state.totalCheckins) || 0
      streak.value = totalCheckins
      // 如果今天已签到，currentDay 是最后签到的天数
      // 如果今天未签到，currentDay 是下一次要签到的天数
      if (state.lastClaimDate === getTodayKey()) {
        claimedToday.value = true
        currentDay.value = state.lastDayNumber || 1
      } else {
        claimedToday.value = false
        currentDay.value = (totalCheckins % 10) + 1
      }
    } else {
      streak.value = 0
      currentDay.value = 1
      claimedToday.value = false
    }
  } catch (e) {
    streak.value = 0
    currentDay.value = 1
    claimedToday.value = false
  }
}

const saveLocalState = (lastClaimDate, dayNumber) => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      totalCheckins: streak.value,
      lastClaimDate,
      lastDayNumber: dayNumber
    })
  )
}

// 执行签到
const handleClaim = async () => {
  // 检查钱包连接
  if (!isWalletConnected.value) {
    alert(t('dailyReward.connectWalletFirst') || t('common.connectWalletFirst') || 'Please connect your wallet first')
    return
  }
  
  if (claimedToday.value || isProcessing.value) {
    return
  }

  isProcessing.value = true
  const wallet = getWalletAddress()
  
  if (wallet) {
    // 调用后端 API 签到
    try {
      const response = await axios.post(`${API_BASE}/api/checkin/claim`, {
        wallet
      })
      
      if (response.data.success) {
        const data = response.data.data
        
        // 先触发金币飘动动画（在状态更新之前，获取当前卡片位置）
        triggerCoinAnimation(currentDay.value)
        
        claimedToday.value = true
        currentDay.value = data.dayNumber
        streak.value = data.dayNumber
        
        // 触发事件通知父组件
        emit('claim', { 
          reward: data.reward, 
          streak: data.dayNumber, 
          date: getTodayKey(),
          newWldBalance: data.newWldBalance
        })
        
        // 保存本地状态作为备份
        saveLocalState(getTodayKey(), data.dayNumber)
      }
    } catch (error) {
      console.error('签到失败:', error)
      if (error.response?.data?.message === 'Already claimed today') {
        claimedToday.value = true
        alert(t('dailyReward.alreadyClaimedToday'))
      } else {
        alert(t('dailyReward.claimFailed'))
      }
    }
  } else {
    // 没有钱包地址，使用本地存储模式
    const today = getTodayKey()
    
    // 先触发金币飘动动画
    triggerCoinAnimation(currentDay.value)
    
    // 增加总签到次数
    streak.value = streak.value + 1
    // 计算当前签到天数（1-10 循环）
    const dayNumber = ((streak.value - 1) % 10) + 1
    currentDay.value = dayNumber
    claimedToday.value = true
    saveLocalState(today, dayNumber)

    emit('claim', { reward: 2, streak: streak.value, date: today })
  }
  
  isProcessing.value = false
}

// 监听弹窗显示状态
watch(
  () => props.visible,
  (v) => {
    if (v) {
      // 先获取钱包地址
      getWalletAddress()
      // 先重置状态，然后加载
      resetToInitialState()
      loadCheckinStatus()
    }
  }
)

// 组件挂载时加载状态
onMounted(() => {
  resetToInitialState()
  loadCheckinStatus()
  // 初始化用户交互监听，用于解锁音频播放
  initUserInteraction()
})
</script>

<style scoped>
/* 遮罩层 */
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 10075;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 弹窗容器 */
.popup-container {
  position: relative;
  width: 632px;
  max-width: 100%;
  max-height: 90vh;
  background: rgb(22, 22, 22);
  border-radius: 20px 20px 0 0;
  animation: slideUp 0.3s ease-out;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

/* 关闭按钮 */
.close-btn {
  position: absolute;
  right: 33px;
  top: 33px;
  cursor: pointer;
  z-index: 1;
  width: 23px;
  height: 23px;
  transition: transform 0.2s;
}

.close-btn:hover { transform: scale(1.1); }
.close-btn:active { transform: scale(0.95); }

/* 飘动金币动画容器 */
.floating-coins-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10080;
  overflow: hidden;
}

/* 单个飘动金币 */
.floating-coin {
  position: fixed;
  width: 32px;
  height: 32px;
  animation: floatUp var(--duration, 1s) ease-out forwards;
  animation-delay: var(--delay, 0s);
  opacity: 0;
}

.floating-coin img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(245, 182, 56, 0.6));
}

/* 金币飘动动画 */
@keyframes floatUp {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1) rotate(0deg);
  }
  20% {
    opacity: 1;
    transform: translate(var(--random-x, 0), -30px) scale(1.2) rotate(45deg);
  }
  50% {
    opacity: 1;
    transform: translate(calc(var(--target-x, 0) * 0.5 + var(--random-x, 0) * 0.5), calc(var(--target-y, 0) * 0.5)) scale(1) rotate(180deg);
  }
  100% {
    opacity: 0;
    transform: translate(var(--target-x, 0), var(--target-y, 0)) scale(0.5) rotate(360deg);
  }
}

/* 顶部背景图 */
.popup-header {
  width: 100%;
  height: 67px;
  overflow: hidden;
  flex-shrink: 0;
}

.popup-header img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 可滚动的内容包装器 */
.popup-content-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

/* 主体内容 */
.popup-body {
  width: 100%;
  background: rgb(22, 22, 22);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 20px 32px 20px;
  box-sizing: border-box;
}

/* 日历图标 */
.calendar-icon {
  width: 120px;
  height: 120px;
  margin-bottom: 16px;
}

.calendar-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 标题 */
.title {
  font-size: 28px;
  font-weight: bold;
  color: #ffffff;
  text-align: center;
  margin: 0 auto 8px auto;
}

/* 描述文字 */
.description {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  margin: 0 auto 20px auto;
  line-height: 1.4;
}

/* 签到天数格子容器 */
.days-grid {
  width: 100%;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

/* 每行 */
.days-row {
  display: flex;
  justify-content: center;
  gap: 8px;
}

/* 单个天数卡片 */
.day-card {
  width: 76px;
  height: 90px;
  background: #2a2a30;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 2px solid transparent;
  transition: all 0.3s ease;
}

/* 当前天数高亮 */
.day-card.active {
  border-color: #f5b638;
  background: rgba(245, 182, 56, 0.1);
}

/* 已签到的天数 */
.day-card.claimed {
  opacity: 0.6;
}

.day-card.claimed .wld-icon {
  filter: grayscale(50%);
}

/* 天数标签 */
.day-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

/* WLD 图标 */
.wld-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

/* 奖励金额 */
.reward-amount {
  font-size: 11px;
  color: #ffffff;
  font-weight: 600;
}

/* 未连接钱包提示 */
.connect-wallet-hint {
  width: 100%;
  max-width: 340px;
  padding: 40px 20px;
  text-align: center;
  margin-bottom: 20px;
}

.connect-wallet-hint p {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  line-height: 1.5;
}

/* Claim 按钮 */
.claim-btn {
  width: 287px;
  height: 46px;
  background: #f5b638;
  border: 2px solid #f5b6388c;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 800;
  color: #000000;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(245, 182, 56, 0.35);
}

.claim-btn:hover {
  background: #ffca4a;
  transform: translateY(-2px);
}

.claim-btn:active {
  transform: translateY(0);
}

.claim-btn:disabled {
  background: #f5b638;
  color: #000;
  border-color: #f5b6388c;
  cursor: not-allowed;
  opacity: 0.7;
  box-shadow: 0 4px 12px rgba(245, 182, 56, 0.2);
  transform: none;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .popup-container {
    width: 100%;
    max-width: 400px;
    border-radius: 20px 20px 0 0;
  }

  .close-btn {
    right: 16px;
    top: 16px;
  }

  .popup-header {
    height: 50px;
  }

  .popup-body {
    padding: 16px 16px 24px 16px;
  }

  .calendar-icon {
    width: 100px;
    height: 100px;
    margin-bottom: 12px;
  }

  .title {
    font-size: 24px;
    margin-bottom: 6px;
  }

  .description {
    font-size: 12px;
    margin-bottom: 16px;
  }

  .days-grid {
    max-width: 320px;
    gap: 8px;
  }

  .days-row {
    gap: 6px;
  }

  .day-card {
    width: 70px;
    height: 82px;
  }

  .day-label {
    font-size: 11px;
  }

  .wld-icon {
    width: 24px;
    height: 24px;
  }

  .reward-amount {
    font-size: 10px;
  }

  .claim-btn {
    width: 260px;
    height: 44px;
    font-size: 16px;
  }
}
</style>
