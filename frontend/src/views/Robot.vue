<template>
  <div class="robot-page">
    <!-- 公告横幅 -->
    <AnnouncementBanner />

    <!-- 总量卡片 -->
    <section class="total-card">
      <div class="card-header">
        <h2 class="card-title">{{ t('robotPage.totalValueLabel') }}</h2>
        <span class="badge" @click="goToCaption">{{ t('robotPage.captionLabel') }}</span>
      </div>
      <div class="total-amount">$ {{ animatedAmount }}</div>
      <h3 class="card-subtitle">{{ t('robotPage.aiRobotTitle') }}</h3>
      <p class="card-description">
        {{ t('robotPage.description') }}
      </p>
    </section>

    <!-- 机器人类型选择 -->
    <section class="robot-tabs">
      <button 
        v-for="tab in robotTabs" 
        :key="tab.id"
        class="tab-button"
        :class="{ active: activeTab === tab.id }"
        @click="switchTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </section>

    <!-- 机器人列表 - 固定位置，标签切换 -->
    <section class="robot-list-container">
      <!-- CEX-Robots 内容 -->
      <transition name="fade" mode="out-in">
        <div v-if="activeTab === 'cex'" key="cex" class="robot-list">
          <RobotCard 
            v-for="robot in cexRobots" 
            :key="robot.id"
            :robot="robot"
            :purchased-count="getPurchasedCount(robot.id)"
            :is-loading="loadingRobots[robot.id]"
            @purchase="handleOpenClick"
          />
        </div>

        <!-- DEX-Robots Content -->
        <div v-else-if="activeTab === 'dex'" key="dex" class="robot-list">
          <RobotCard 
            v-for="robot in dexRobots" 
            :key="robot.id"
            :robot="robot"
            :purchased-count="getPurchasedCount(robot.id)"
            :is-loading="loadingRobots[robot.id]"
            :is-locked="isRobotLocked(robot)"
            :unlock-robot-name="robot.unlockRobotName"
            @purchase="handleOpenClick"
          />
        </div>

        <!-- My Robot 内容 -->
        <div v-else-if="activeTab === 'my'" key="my" class="robot-list">
          <div v-if="myRobots.length === 0" class="empty-state">
            <p class="empty-text">{{ t('robotPage.noMyRobots') || 'No robots yet' }}</p>
          </div>
          <MyRobotCard 
            v-for="robot in myRobots"
            :key="robot.id"
            :robot="robot"
            :is-quantifying="quantifyingRobots[robot.id]"
            :quantified-today="quantifiedToday[robot.id]"
            :last-earnings="lastEarnings[robot.id] || 0"
            :next-quantify-time="nextQuantifyTime[robot.id] || ''"
            :hours-remaining="hoursRemaining[robot.id] || 0"
            @quantify="handleQuantify"
            @animation-complete="handleAnimationComplete"
          />
        </div>

        <!-- Expired Robot 内容 -->
        <div v-else-if="activeTab === 'expired'" key="expired" class="robot-list">
          <div v-if="expiredRobots.length === 0" class="empty-state">
            <p class="empty-text">{{ t('robotPage.noExpiredRobots') || 'No expired robots' }}</p>
          </div>
          <ExpiredRobotCard 
            v-for="robot in expiredRobots"
            :key="robot.id"
            :robot="robot"
          />
        </div>
      </transition>
    </section>

    <!-- Bottom Navigation -->
    <BottomNav />

    <!-- 钱包未连接提示弹窗 -->
    <RobotWalletPrompt v-model:visible="showWalletPrompt" @confirm="handleWalletConfirm" />

    <!-- USDT余额不足提示弹窗 -->
    <USDTBalancePrompt v-model:visible="showUSDTPrompt" @confirm="handleUSDTConfirm" />
  </div>
</template>

<script setup>
/**
 * Robot 页面 - AI 机器人
 * 
 * 功能：
 * - 展示 CEX/DEX 机器人列表
 * - 购买机器人（检查钱包连接和余额，以及限购数量）
 * - 显示我的机器人并执行量化操作
 * - 显示已过期机器人
 */
import { ref, onMounted, onUnmounted, computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import BottomNav from '@/components/BottomNav.vue'
import AnnouncementBanner from '@/components/AnnouncementBanner.vue'
import RobotWalletPrompt from '@/components/RobotWalletPrompt.vue'
import USDTBalancePrompt from '@/components/USDTBalancePrompt.vue'
import RobotCard from '@/components/robot/RobotCard.vue'
import MyRobotCard from '@/components/robot/MyRobotCard.vue'
import ExpiredRobotCard from '@/components/robot/ExpiredRobotCard.vue'
import { useWalletStore } from '@/stores/wallet'
import { useCsrfStore } from '@/stores/csrf'
import { trackRobotPurchase, trackQuantify } from '@/utils/tracker'
import { ensureReferralBound } from '@/utils/wallet'
import { post } from '@/api/secureApi'

// 导入机器人收益数学计算工具
import {
    calculateDailyEarning,                      // 计算每日收益
    calculateTotalProfit,                       // 计算总收益
    calculateTotalReturn,                       // 计算总回报
    calculateAPY,                               // 计算年化收益率
    analyzeRobotProfit,                         // 完整收益分析
    calculatePortfolioProfit,                   // 投资组合收益
    calculateQuantifyEarning,                   // 量化收益计算
    checkQuantifyStatus as mathCheckQuantify,   // 数学工具检查量化状态（重命名避免冲突）
    formatAmount as mathFormatAmount            // 格式化金额（重命名避免冲突）
} from '@/utils/robotCalc'

const { t } = useI18n()
const router = useRouter()

// 钱包 store
const walletStore = useWalletStore()
const csrfStore = useCsrfStore()

// ==================== 自动刷新相关 ====================
let dataRefreshInterval = null
const DATA_REFRESH_INTERVAL = 30000 // 30秒自动刷新一次

const activeTab = ref('cex')
const showWalletPrompt = ref(false)
const showUSDTPrompt = ref(false)

// 当前选中的机器人价格（用于购买检查）
const selectedRobotPrice = ref(0)

// 用户已购买的机器人
const myRobots = ref([])
const expiredRobots = ref([])

// 各机器人的购买数量
const purchasedCounts = reactive({})

// 加载状态
const loadingRobots = reactive({})

// 量化状态
const quantifyingRobots = reactive({})
const quantifiedToday = reactive({})
const lastEarnings = reactive({})
// 下次可量化时间
const nextQuantifyTime = reactive({})
// 剩余小时数
const hoursRemaining = reactive({})
// 存储量化结果，等待动画完成后显示
const pendingQuantifyResults = reactive({})

// 金额动画相关
const SIMULATED_BASE = 146721610.00 // 模拟基础金额（固定值，永不改变）
const baseAmount = ref(SIMULATED_BASE) // 确保初始化为模拟基础值
const currentAmount = ref(0)
const animationDuration = 2000 // 初始动画持续2秒
let incrementInterval = null // 定时增长计时器

// 机器人价格列表（用于随机增长）
const robotPrices = [20, 100, 300, 800, 1600, 3200, 6800, 10000, 20000, 46800, 1000, 2000, 3000, 5000, 10000, 30000, 60000]

/**
 * 加载量化总金额
 * 总金额 = 模拟基础金额（固定）+ 真实用户购买金额（从数据库统计）
 * 
 * 保证：即使API失败，也会显示模拟基础金额，数据永不丢失
 */
const loadTotalAmount = async () => {
  try {
    // 获取真实用户购买的总投资
    const response = await fetch('/api/platform/total-investments', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    
    // 确保响应成功
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`)
    }
    
    const data = await response.json()
    
    if (data.success && data.data && data.data.robot_page_total) {
      const realUserInvestment = parseFloat(data.data.robot_page_total) || 0
      
      // 总金额 = 模拟基础值（固定）+ 真实用户投资（动态）
      baseAmount.value = SIMULATED_BASE + realUserInvestment
      
      console.log('[Robot] ✅ Total amount loaded:', {
        simulated: SIMULATED_BASE.toLocaleString(),
        realUser: realUserInvestment.toLocaleString(),
        total: baseAmount.value.toLocaleString()
      })
    } else {
      // API返回格式错误时，保持模拟基础值
      console.warn('[Robot] ⚠️ API response invalid, using simulated base only')
      baseAmount.value = SIMULATED_BASE
    }
  } catch (error) {
    // 任何错误都不影响显示，始终保证模拟基础值可用
    console.warn('[Robot] ⚠️ Failed to load real user investment, using simulated base only:', error.message)
    baseAmount.value = SIMULATED_BASE
  }
}

// CEX 机器人数据（使用小时数 durationHours 作为基准）- 2024-12-21 修复收益率
// 收益计算公式: totalReturn = price + (price × dailyProfit% × days)
const cexRobots = ref([
  { id: 'binance_01', name: 'Binance Ai Bot', nameKey: 'robotPage.robotName', logo: '/static/CEX-Robots/图标.png', orders: 5, dailyProfit: 2.0, totalReturn: 20.4, durationHours: 24, limit: 1, price: 20 },
  { id: 'coinbase_01', name: 'Coinbase Ai Bot', nameKey: 'robotPage.coinbaseRobotName', logo: '/static/CEX-Robots/3.png', orders: 8, dailyProfit: 2.0, totalReturn: 106, durationHours: 72, limit: 1, price: 100 },
  { id: 'okx_01', name: 'OKX Ai Bot', nameKey: 'robotPage.okxRobotName', logo: '/static/CEX-Robots/6.png', orders: 12, dailyProfit: 2.0, totalReturn: 312, durationHours: 48, limit: 1, price: 300 },
  { id: 'bybit_01', name: 'Bybit Ai Bot', nameKey: 'robotPage.bybitRobotName', logo: '/static/CEX-Robots/5.png', orders: 15, dailyProfit: 1.5, totalReturn: 884, durationHours: 168, limit: 2, price: 800 },
  { id: 'upbit_01', name: 'Upbit Ai Bot', nameKey: 'robotPage.upbitRobotName', logo: '/static/CEX-Robots/7.png', orders: 18, dailyProfit: 1.8, totalReturn: 2032, durationHours: 360, limit: 2, price: 1600 },
  { id: 'bitfinex_01', name: 'Bitfinex Ai Bot', nameKey: 'robotPage.bitfinexRobotName', logo: '/static/CEX-Robots/2.png', orders: 25, dailyProfit: 2.0, totalReturn: 5120, durationHours: 720, limit: 2, price: 3200 },
  { id: 'kucoin_01', name: 'Kucoin Ai Bot', nameKey: 'robotPage.kucoinRobotName', logo: '/static/CEX-Robots/15.png', orders: 30, dailyProfit: 2.2, totalReturn: 13532, durationHours: 1080, limit: 2, price: 6800 },
  { id: 'bitget_01', name: 'Bitget Ai Bot', nameKey: 'robotPage.bitgetRobotName', logo: '/static/CEX-Robots/14.png', orders: 45, dailyProfit: 2.5, totalReturn: 32500, durationHours: 2160, limit: 2, price: 10000 },
  { id: 'gate_01', name: 'Gate Ai Bot', nameKey: 'robotPage.gateRobotName', logo: '/static/CEX-Robots/9.png', orders: 50, dailyProfit: 3.0, totalReturn: 92000, durationHours: 2880, limit: 2, price: 20000 },
  // Business rule: Binance AI Robot can be purchased at most 5 times per wallet.
  { id: 'binance_02', name: 'Binance Ai Bot-01', nameKey: 'robotPage.binanceBot01Name', logo: '/static/CEX-Robots/图标.png', orders: 5, dailyProfit: 4.2, totalReturn: 400608, durationHours: 4320, limit: 2, price: 46800 }
])

// DEX Robot Data (using durationHours as base) - 2024-12-21 fixed yield rate
// Yield formula: totalReturn = price + (price × dailyProfit% × days)
// Unlock conditions: Curve unlocks after purchasing Jupiter, DODO unlocks after purchasing Curve
const dexRobots = ref([
  { id: 'pancake_01', name: 'PancakeSwap Ai Bot', nameKey: 'robotPage.pancakeSwapRobotName', logo: '/static/DEX-Robots/1.png', orders: 6, dailyProfit: 1.8, totalReturn: 1540, durationHours: 720, limit: 1, price: 1000, showNote: true },
  { id: 'uniswap_01', name: 'Uniswap Ai Bot', nameKey: 'robotPage.uniswapRobotName', logo: '/static/DEX-Robots/2.png', orders: 10, dailyProfit: 2.0, totalReturn: 3200, durationHours: 720, limit: 1, price: 2000, showNote: true },
  { id: 'baseswap_01', name: 'BaseSwap Ai Bot', nameKey: 'robotPage.baseSwapRobotName', logo: '/static/DEX-Robots/3.png', orders: 15, dailyProfit: 2.2, totalReturn: 4980, durationHours: 720, limit: 1, price: 3000, showNote: true },
  { id: 'sushiswap_01', name: 'SushiSwap Ai Bot', nameKey: 'robotPage.sushiSwapRobotName', logo: '/static/DEX-Robots/4.png', orders: 20, dailyProfit: 2.5, totalReturn: 12500, durationHours: 1440, limit: 1, price: 5000, showNote: true },
  { id: 'jupiter_01', name: 'Jupiter Ai Bot', nameKey: 'robotPage.jupiterRobotName', logo: '/static/DEX-Robots/5.png', orders: 30, dailyProfit: 2.8, totalReturn: 26800, durationHours: 1440, limit: 1, price: 10000, showNote: true },
  { id: 'curve_01', name: 'Curve Ai Bot', nameKey: 'robotPage.curveRobotName', logo: '/static/DEX-Robots/6.png', orders: 50, dailyProfit: 3.5, totalReturn: 61500, durationHours: 720, limit: 1, price: 30000, showNote: true, locked: true, unlockCondition: 'jupiter_01', unlockRobotName: 'Jupiter AI Robot' },
  { id: 'dodo_01', name: 'DODO Ai Bot', nameKey: 'robotPage.dodoRobotName', logo: '/static/DEX-Robots/7.png', orders: 60, dailyProfit: 4.0, totalReturn: 132000, durationHours: 720, limit: 1, price: 60000, showNote: true, locked: true, unlockCondition: 'curve_01', unlockRobotName: 'Curve AI Robot' }
])

// 格式化金额显示
const animatedAmount = computed(() => {
  return currentAmount.value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
})

// ==================== 数学工具计算 ====================

/**
 * 使用数学工具计算我的机器人投资组合收益
 */
const portfolioAnalysis = computed(() => {
  if (myRobots.value.length === 0) {
    return {
      summary: {
        totalPrincipal: 0,
        totalDailyEarning: 0,
        totalProfit: 0,
        totalReturn: 0,
        avgROI: 0,
        robotCount: 0
      },
      details: []
    }
  }
  return calculatePortfolioProfit(myRobots.value)
})

/**
 * 计算单个机器人的预期收益（使用数学工具）
 */
const getRobotProfitAnalysis = (robot) => {
  return analyzeRobotProfit({
    price: robot.price,
    dailyProfit: robot.dailyProfit || robot.daily_profit,
    durationHours: robot.durationHours || robot.duration_hours
  })
}

/**
 * 计算机器人的量化收益（使用数学工具）
 */
const getQuantifyEarning = (robot) => {
  const price = robot.price || robot.principal
  const dailyProfit = robot.dailyProfit || robot.daily_profit
  return calculateQuantifyEarning(price, dailyProfit)
}

/**
 * 使用数学工具计算每日收益
 */
const getDailyEarning = (price, dailyProfitRate) => {
  return calculateDailyEarning(price, dailyProfitRate)
}

/**
 * 使用数学工具计算年化收益率
 */
const getAPY = (dailyProfitRate) => {
  return calculateAPY(dailyProfitRate)
}

// ==================== 结束数学工具计算 ====================

// 获取某个机器人的已购买数量
const getPurchasedCount = (robotId) => {
  return purchasedCounts[robotId] || 0
}

/**
 * Check if a robot is locked based on unlock conditions
 * - Curve AI Robot: unlocks when Jupiter AI Robot is purchased
 * - DODO AI Robot: unlocks when Curve AI Robot is purchased
 * @param {Object} robot - Robot configuration object
 * @returns {boolean} - Whether the robot is locked
 */
const isRobotLocked = (robot) => {
  // If robot doesn't have locked flag, it's not locked
  if (!robot.locked) return false
  
  // If robot has unlock condition, check if user has purchased the required robot
  if (robot.unlockCondition) {
    // Check if user has purchased (or is currently holding) the required robot
    const hasRequiredRobot = myRobots.value.some(
      r => r.robot_id === robot.unlockCondition || r.id === robot.unlockCondition
    )
    // Also check expired robots (user has purchased it before)
    const hasPurchasedBefore = expiredRobots.value.some(
      r => r.robot_id === robot.unlockCondition || r.id === robot.unlockCondition
    )
    
    // If user has purchased the required robot, unlock this one
    if (hasRequiredRobot || hasPurchasedBefore) {
      return false
    }
  }
  
  // Default: robot is locked
  return true
}

// Randomly select a robot price as increment amount
const getRandomIncrement = () => {
  const randomIndex = Math.floor(Math.random() * robotPrices.length)
  return robotPrices[randomIndex]
}

// 平滑增长动画
const smoothIncrement = (targetValue) => {
  const startValue = currentAmount.value
  const difference = targetValue - startValue
  const incrementDuration = 800 // 平滑过渡时间 800ms
  const startTime = performance.now()
  let lastUpdateTime = 0
  const updateInterval = 50 // 限制更新频率：每50ms更新一次，避免移动端闪烁
  
  const animate = (currentTime) => {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / incrementDuration, 1)
    
    // 限制更新频率，避免移动端闪烁
    if (currentTime - lastUpdateTime >= updateInterval || progress >= 1) {
      lastUpdateTime = currentTime
    // 使用缓动函数
    const easeProgress = 1 - Math.pow(1 - progress, 3)
    currentAmount.value = startValue + difference * easeProgress
    }
    
    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }
  
  requestAnimationFrame(animate)
}

// 初始数字跳动动画函数
const animateAmount = () => {
  const startAmount = 100000000 // 从1亿开始
  const startTime = performance.now()
  let lastUpdateTime = 0
  const updateInterval = 50 // 限制更新频率：每50ms更新一次（约20fps），避免移动端闪烁
  
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4) // 缓动函数，先快后慢
  
  const animate = (currentTime) => {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / animationDuration, 1)
    
    // 限制更新频率，避免移动端闪烁
    if (currentTime - lastUpdateTime >= updateInterval || progress >= 1) {
      lastUpdateTime = currentTime
    // 使用缓动函数使动画更自然
    const easedProgress = easeOutQuart(progress)
    currentAmount.value = startAmount + (baseAmount.value - startAmount) * easedProgress
    }
    
    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      currentAmount.value = baseAmount.value // 确保最终值精确
      // 初始动画完成后，启动定时增长
      startAutoIncrement()
    }
  }
  
  requestAnimationFrame(animate)
}

// 启动定时自动增长
const startAutoIncrement = () => {
  // 每 15-45 秒随机增长一次
  const scheduleNextIncrement = () => {
    const delay = Math.random() * 30000 + 15000 // 15-45秒随机间隔
    incrementInterval = setTimeout(() => {
      const increment = getRandomIncrement()
      const newAmount = currentAmount.value + increment
      smoothIncrement(newAmount)
      scheduleNextIncrement() // 继续下一次增长
    }, delay)
  }
  
  scheduleNextIncrement()
}

// 标签配置 - 使用computed确保翻译响应式更新
const robotTabs = computed(() => [
  { id: 'cex', label: t('robotPage.tabs.cexRobots') },
  { id: 'dex', label: t('robotPage.tabs.dexRobots') },
  { id: 'my', label: t('robotPage.tabs.myRobots') },
  { id: 'expired', label: t('robotPage.tabs.expiredRobot') }
])

// 切换标签页
const switchTab = (tabId) => {
  activeTab.value = tabId
  // 切换到"我的机器人"或"过期机器人"时刷新数据
  if (tabId === 'my') {
    fetchMyRobots()
  } else if (tabId === 'expired') {
    fetchExpiredRobots()
  }
}

// 跳转到说明页面
const goToCaption = () => {
  router.push('/robot/caption')
}

/**
 * 获取用户购买的机器人数量
 */
const fetchPurchasedCounts = async () => {
  if (!walletStore.isConnected) return
  
  try {
    const response = await fetch(`/api/robot/count?wallet_address=${walletStore.walletAddress}`)
    const data = await response.json()
    
    if (data.success && data.data) {
      // 清空旧数据
      Object.keys(purchasedCounts).forEach(key => delete purchasedCounts[key])
      // 填充新数据
      data.data.forEach(item => {
        purchasedCounts[item.robot_id] = item.count
      })
    }
  } catch (error) {
    console.error('[Robot] Failed to fetch purchased counts:', error)
  }
}

/**
 * 获取用户购买的机器人列表
 */
const fetchMyRobots = async () => {
  if (!walletStore.isConnected) {
    myRobots.value = []
    return
  }
  
  try {
    const response = await fetch(`/api/robot/my?wallet_address=${walletStore.walletAddress}`)
    const data = await response.json()
    
    if (data.success) {
      myRobots.value = data.data || []
      // 检查每个机器人今天是否已量化
      for (const robot of myRobots.value) {
        await checkQuantifyStatus(robot.id)
      }
    }
  } catch (error) {
    console.error('[Robot] Failed to fetch my robots:', error)
    myRobots.value = []
  }
}

/**
 * 获取过期的机器人列表
 */
const fetchExpiredRobots = async () => {
  if (!walletStore.isConnected) {
    expiredRobots.value = []
    return
  }
  
  try {
    const response = await fetch(`/api/robot/expired?wallet_address=${walletStore.walletAddress}`)
    const data = await response.json()
    
    if (data.success) {
      expiredRobots.value = data.data || []
    }
  } catch (error) {
    console.error('[Robot] Failed to fetch expired robots:', error)
    expiredRobots.value = []
  }
}

/**
 * 检查机器人是否可以量化（24小时间隔）
 */
const checkQuantifyStatus = async (robotPurchaseId) => {
  try {
    const response = await fetch(
      `/api/robot/quantify-status?wallet_address=${walletStore.walletAddress}&robot_purchase_id=${robotPurchaseId}`
    )
    const data = await response.json()
    
    if (data.success) {
      quantifiedToday[robotPurchaseId] = data.data.quantified_today
      // 存储下次量化时间和剩余小时数
      nextQuantifyTime[robotPurchaseId] = data.data.next_quantify_time || ''
      hoursRemaining[robotPurchaseId] = parseFloat(data.data.hours_remaining) || 0
    }
  } catch (error) {
    console.error('[Robot] Failed to check quantify status:', error)
  }
}

/**
 * 点击 Open 按钮时检测钱包和余额
 * @param {object} robot - 机器人对象
 */
const handleOpenClick = async (robot) => {
  const price = robot.price
  const robotName = robot.name
  const robotId = robot.id
  
  selectedRobotPrice.value = price
  
  // 设置加载状态
  loadingRobots[robotId] = true
  
  try {
    // 1. 检查钱包是否连接
    if (!walletStore.isConnected) {
      console.log('[Robot] Wallet not connected')
      showWalletPrompt.value = true
      return
    }
    
    // 2. 检查是否达到限购数量
    const currentCount = getPurchasedCount(robotId)
    if (currentCount >= robot.limit) {
      console.log('[Robot] Purchase limit reached:', currentCount, '/', robot.limit)
      alert(t('robotPage.soldOut'))
      return
    }
    
    // 3. 从平台获取用户余额
    const response = await fetch(`/api/user/balance?wallet_address=${walletStore.walletAddress}`)
    const data = await response.json()
    
    if (!data.success) {
      console.log('[Robot] Failed to fetch balance')
      showWalletPrompt.value = true
      return
    }
    
    const usdtBalance = parseFloat(data.data.usdt_balance) || 0
    
    // 4. 检查余额是否足够
    if (usdtBalance < price) {
      console.log('[Robot] Insufficient USDT balance:', usdtBalance, 'required:', price)
      showUSDTPrompt.value = true
      return
    }
    
    // 5. 余额足够，执行购买
    console.log('[Robot] Purchasing robot:', robotName, 'price:', price)
    await purchaseRobot(robot)
    
  } catch (error) {
    console.error('[Robot] Error checking balance:', error)
    showWalletPrompt.value = true
  } finally {
    loadingRobots[robotId] = false
  }
}

/**
 * 购买机器人
 * @param {object} robot - 机器人对象
 */
const purchaseRobot = async (robot) => {
  try {
    // 确保推荐关系已绑定（防止漏发推荐奖励）
    await ensureReferralBound()

    // 使用安全API工具发送请求（自动包含CSRF令牌）
    const data = await post('/api/robot/purchase', {
      wallet_address: walletStore.walletAddress,
      robot_name: robot.name,
      price: robot.price
    })

    if (data.success) {
      // 记录购买行为
      trackRobotPurchase(robot.name, robot.price)

      // 购买成功，更新余额
      walletStore.setUsdtBalance(data.data.new_balance)

      // 更新购买数量
      purchasedCounts[robot.id] = (purchasedCounts[robot.id] || 0) + 1

      ElMessageBox.alert(
        t('robotPage.purchaseSuccess', { name: robot.name }),
        t('robotPage.promptTitle'),
        {
          confirmButtonText: t('robotPage.sureBtn') || 'OK',
          type: 'success'
        }
      )

      // 切换到"我的机器人"标签
      activeTab.value = 'my'
      await fetchMyRobots()
    } else {
      alert(data.message || t('robotPage.purchaseFailed'))
    }
  } catch (error) {
    console.error('[Robot] Purchase error:', error)
    alert(t('robotPage.purchaseFailedRetry'))
  }
}

/**
 * 执行量化操作
 * @param {object} robot - 机器人购买记录
 */
const handleQuantify = async (robot) => {
  if (quantifiedToday[robot.id]) {
    alert(t('robotPage.alreadyQuantified'))
    return
  }

  quantifyingRobots[robot.id] = true
  // 清除之前的待处理结果
  delete pendingQuantifyResults[robot.id]

  try {
    // 确保推荐关系已绑定（防止漏发推荐奖励）
    await ensureReferralBound()

    // 使用安全API工具发送请求（自动包含CSRF令牌）
    const data = await post('/api/robot/quantify', {
      wallet_address: walletStore.walletAddress,
      robot_purchase_id: robot.id
    })

    if (data.success) {
      // 更新余额
      walletStore.setUsdtBalance(data.data.new_balance)
      walletStore.setEquityValue(parseFloat(data.data.new_balance))

      // 标记已量化
      quantifiedToday[robot.id] = true

      // 设置下次可量化时间（24小时后）- 使用本地时间格式
      const nextTime = new Date()
      nextTime.setHours(nextTime.getHours() + 24)
      // Format as local time string (YYYY-MM-DD HH:MM:SS) to match backend format
      const year = nextTime.getFullYear()
      const month = String(nextTime.getMonth() + 1).padStart(2, '0')
      const day = String(nextTime.getDate()).padStart(2, '0')
      const hours = String(nextTime.getHours()).padStart(2, '0')
      const minutes = String(nextTime.getMinutes()).padStart(2, '0')
      const seconds = String(nextTime.getSeconds()).padStart(2, '0')
      nextQuantifyTime[robot.id] = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
      hoursRemaining[robot.id] = 24

      // 记录收益用于显示
      if (data.data.earnings) {
        lastEarnings[robot.id] = parseFloat(data.data.earnings)
      }

      // 刷新机器人列表
      await fetchMyRobots()

      // 存储成功结果（弹窗由组件内部处理）
      pendingQuantifyResults[robot.id] = {
        success: true
      }
    } else {
      if (data.data?.already_quantified) {
        quantifiedToday[robot.id] = true
        // 更新下次可量化时间和剩余小时数
        if (data.data.next_quantify_time) {
          nextQuantifyTime[robot.id] = data.data.next_quantify_time
        }
        if (data.data.hours_remaining) {
          hoursRemaining[robot.id] = parseFloat(data.data.hours_remaining)
        }
        pendingQuantifyResults[robot.id] = {
          success: false,
          message: data.message || t('robotPage.alreadyQuantified')
        }
      } else {
        pendingQuantifyResults[robot.id] = {
          success: false,
          message: data.message || t('robotPage.quantifyFailed')
        }
      }
    }
  } catch (error) {
    console.error('[Robot] Quantify error:', error)
    pendingQuantifyResults[robot.id] = {
      success: false,
      message: t('robotPage.quantifyFailedRetry')
    }
  }
  // 注意：不在这里设置 quantifyingRobots[robot.id] = false
  // 等待动画完成后再设置
}

/**
 * 处理量化动画完成
 * @param {string} robotId - 机器人购买记录ID
 */
const handleAnimationComplete = (robotId) => {
  // 动画完成后，设置 quantifying 状态为 false
  quantifyingRobots[robotId] = false
  
  // 检查是否有待显示的失败结果
  const result = pendingQuantifyResults[robotId]
  if (result && !result.success) {
    // 只有失败时才显示alert
    alert(result.message)
  }
  // 成功的情况由组件内的收益弹窗处理
  
  // 清除待处理结果
  delete pendingQuantifyResults[robotId]
}

// 点击确认按钮 - 钱包未连接
const handleWalletConfirm = () => {
  // 跳转到钱包页面进行充值
  router.push('/wallet')
}

// 点击确认按钮 - USDT余额不足
const handleUSDTConfirm = () => {
  // 跳转到钱包页面进行充值
  router.push('/wallet')
}

// 监听钱包连接状态变化
watch(() => walletStore.isConnected, (newVal) => {
  if (newVal) {
    fetchPurchasedCounts()
    if (activeTab.value === 'my') {
      fetchMyRobots()
    } else if (activeTab.value === 'expired') {
      fetchExpiredRobots()
    }
    startDataAutoRefresh()
  } else {
    stopDataAutoRefresh()
    // 清空数据
    myRobots.value = []
    expiredRobots.value = []
    Object.keys(purchasedCounts).forEach(key => delete purchasedCounts[key])
  }
})

// ==================== 自动刷新方法 ====================

/**
 * 刷新所有数据
 */
const refreshAllData = async () => {
  if (!walletStore.isConnected) return
  console.log('[Robot] 自动刷新数据...')
  await Promise.all([
    loadTotalAmount(),
    fetchPurchasedCounts(),
    fetchMyRobots(),
    fetchExpiredRobots()
  ])
}

/**
 * 启动数据自动刷新定时器
 */
const startDataAutoRefresh = () => {
  stopDataAutoRefresh()
  dataRefreshInterval = setInterval(() => {
    if (walletStore.isConnected) {
      refreshAllData()
    }
  }, DATA_REFRESH_INTERVAL)
}

/**
 * 停止数据自动刷新定时器
 */
const stopDataAutoRefresh = () => {
  if (dataRefreshInterval) {
    clearInterval(dataRefreshInterval)
    dataRefreshInterval = null
  }
}

/**
 * 页面可见性变化处理
 */
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible' && walletStore.isConnected) {
    console.log('[Robot] 页面变为可见，刷新数据...')
    refreshAllData()
  }
}

// 页面加载时启动动画
onMounted(async () => {
  // 先加载总金额，再启动动画
  await loadTotalAmount()
  animateAmount()
  fetchPurchasedCounts()
  
  // 监听页面可见性
  document.addEventListener('visibilitychange', handleVisibilityChange)
  
  // 如果钱包已连接，启动自动刷新
  if (walletStore.isConnected) {
    startDataAutoRefresh()
  }
})

// 页面卸载时清理定时器
onUnmounted(() => {
  if (incrementInterval) {
    clearTimeout(incrementInterval)
    incrementInterval = null
  }
  stopDataAutoRefresh()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style scoped>
.robot-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a1e 0%, #0f0f12 100%);
  padding: 124px 0 100px 0;
}

/* 总量卡片 */
.total-card {
  background: linear-gradient(135deg, #2a2a2e 0%, #1f1f23 100%);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  width: 350px;
  height: 184px;
  padding: 16px 14px;
  margin: 0 auto 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-title {
  font-size: 12px;
  font-weight: 500;
  color: rgb(255, 255, 255);
  margin: 0;
}

.badge {
  background: rgb(245, 182, 56);
  color: rgb(255, 255, 255);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.badge:hover {
  background: rgb(255, 192, 66);
  transform: scale(1.05);
}

.total-amount {
  width: 100%;
  height: auto;
  min-height: 45px;
  font-size: 28px;
  font-weight: 700;
  color: rgb(245, 182, 56);
  line-height: 1.4;
  letter-spacing: -0.5px;
  margin-bottom: 4px;
  /* 性能优化：避免移动端闪烁 */
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  will-change: contents;
  /* 防止文字换行和溢出 */
  white-space: nowrap;
  overflow: visible;
}

.card-subtitle {
  width: 100%;
  font-size: 14px;
  font-weight: 600;
  color: rgb(255, 255, 255);
  line-height: 1.4;
  margin: 0 0 6px 0;
}

.card-description {
  width: 100%;
  height: auto;
  max-height: 52px;
  font-size: 11px;
  line-height: 17px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
}

/* 机器人类型选择 */
.robot-tabs {
  display: flex;
  gap: 4px;
  padding: 0;
  margin: 0 auto 16px;
  width: 350px;
  height: 33px;
  align-items: center;
  justify-content: space-between;
}

.tab-button {
  background: transparent;
  border: none;
  border-radius: 6px;
  flex: 1;
  height: 33px;
  padding: 0 6px;
  font-size: 10px;
  font-weight: 500;
  color: rgb(184, 184, 184);
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-button.active {
  background: rgb(245, 182, 56);
  color: rgb(255, 255, 255);
  font-weight: 600;
}

.tab-button:hover:not(.active) {
  color: rgb(220, 220, 220);
}

/* 机器人列表 - 固定容器 */
.robot-list-container {
  width: 100%;
  padding: 0 12px;
  box-sizing: border-box;
}

.robot-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  padding: 40px 20px;
}

.empty-text {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  margin: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .total-amount {
    font-size: 28px;
  }

  .robot-tabs {
    width: calc(100% - 32px);
    max-width: 350px;
  }

  .tab-button {
    font-size: 9px;
    padding: 0 4px;
  }
}

@media (max-width: 400px) {
  .robot-tabs {
    width: calc(100% - 24px);
  }

  .tab-button {
    font-size: 8px;
    padding: 0 3px;
  }
}
</style>
