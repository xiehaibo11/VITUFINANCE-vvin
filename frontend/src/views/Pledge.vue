<template>
  <div class="pledge-page" @click="handleBackgroundClick">
    <!-- 说明文字 - 始终显示 -->
    <div class="description-text" @click.stop>
      {{ t('pledgePage.description') }}
    </div>

    <!-- 顶部标签切换 -->
    <div class="tabs-container" @click.stop>
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'wld' }"
        @click="activeTab = 'wld'"
      >
        {{ t('pledgePage.tabs.wldPledge') }}
      </div>
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'my' }"
        @click="activeTab = 'my'"
      >
        {{ t('pledgePage.tabs.myPledge') }}
      </div>
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'expired' }"
        @click="activeTab = 'expired'"
      >
        {{ t('pledgePage.tabs.expiredPledge') }}
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="content-container" @click.stop>
      <!-- WLD Pledge 卡片轮播 -->
      <div v-if="activeTab === 'wld'" class="pledge-cards">
        <div class="carousel-container">
          <!-- 左箭头 -->
          <div class="arrow-btn arrow-left" @click="prevCard">
            <img src="/css/左转.png" alt="Previous" class="arrow-icon" />
          </div>

          <!-- 卡片容器 -->
          <div class="card-wrapper">
            <Transition :name="`slide-${slideDirection}`" mode="out-in">
              <div class="pledge-card" :key="currentIndex">
                <div class="card-title">{{ currentPledge.name }}</div>
                
                <div class="card-icon">
                  <img src="/static/icon/wld.png" alt="WLD" class="wld-icon" />
                </div>
                
                <div class="card-amount">{{ currentPledge.amount }} WLD</div>
                
                <div class="card-details">
                  <div class="detail-row">
                    <span class="detail-label">{{ t('pledgePage.totalPledgeIncome') }}</span>
                    <span class="detail-value">{{ currentPledge.income }} WLD</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">{{ t('pledgePage.runCycle') }}</span>
                    <span class="detail-value">{{ currentPledge.cycle }} {{ t('pledgePage.days') }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">{{ t('pledgePage.holdAtSameTime') }}</span>
                    <span class="detail-value">{{ currentPledge.pieces }} {{ t('pledgePage.pieces') }}</span>
                  </div>
                </div>

                <button class="synthetic-btn" @click="handleSynthetic" :disabled="isCreating">
                  {{ isCreating ? t('pledgePage.processing') : t('pledgePage.syntheticMiner') }}
                </button>
              </div>
            </Transition>
          </div>

          <!-- 右箭头 -->
          <div class="arrow-btn arrow-right" @click="nextCard">
            <img src="/css/右转.png" alt="Next" class="arrow-icon" />
          </div>
        </div>
      </div>

      <!-- My Pledge -->
      <div v-else-if="activeTab === 'my'" class="my-pledges">
        <div v-if="!walletStore.isConnected" class="empty-state">
          <p>{{ t('pledgePage.pleaseConnectWallet') }}</p>
        </div>
        <div v-else-if="myPledges.length === 0" class="empty-state">
          <p>{{ t('pledgePage.noActivePledges') }}</p>
        </div>
        <div v-else class="pledge-list">
          <div v-for="pledge in myPledges" :key="pledge.id" class="pledge-item">
            <div class="pledge-item-header">
              <span class="pledge-name">{{ pledge.product_name }}</span>
              <span class="pledge-status active">{{ t('pledgePage.statusActive') }}</span>
            </div>
            <div class="pledge-item-body">
              <div class="pledge-info-row">
                <span class="label">{{ t('pledgePage.stakedAmount') }}</span>
                <span class="value">{{ pledge.amount }} WLD</span>
              </div>
              <div class="pledge-info-row">
                <span class="label">{{ t('pledgePage.earnedIncome') }}</span>
                <span class="value highlight">{{ parseFloat(pledge.earned_income).toFixed(4) }} WLD</span>
              </div>
              <div class="pledge-info-row">
                <span class="label">{{ t('pledgePage.remainingDays') }}</span>
                <span class="value">{{ pledge.remaining_days > 0 ? pledge.remaining_days : 0 }} {{ t('pledgePage.days') }}</span>
              </div>
              <div class="pledge-info-row">
                <span class="label">{{ t('pledgePage.endDate') }}</span>
                <span class="value">{{ formatDate(pledge.end_date) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Expired Pledge -->
      <div v-else class="expired-pledges">
        <div v-if="!walletStore.isConnected" class="empty-state">
          <p>{{ t('pledgePage.pleaseConnectWallet') }}</p>
        </div>
        <div v-else-if="expiredPledges.length === 0" class="empty-state">
          <p>{{ t('pledgePage.noExpiredPledges') }}</p>
        </div>
        <div v-else class="pledge-list">
          <div v-for="pledge in expiredPledges" :key="pledge.id" class="pledge-item">
            <div class="pledge-item-header">
              <span class="pledge-name">{{ pledge.product_name }}</span>
              <span class="pledge-status expired">{{ t('pledgePage.statusExpired') }}</span>
            </div>
            <div class="pledge-item-body">
              <div class="pledge-info-row">
                <span class="label">{{ t('pledgePage.stakedAmount') }}</span>
                <span class="value">{{ pledge.amount }} WLD</span>
              </div>
              <div class="pledge-info-row">
                <span class="label">{{ t('pledgePage.totalEarned') }}</span>
                <span class="value highlight">{{ parseFloat(pledge.earned_income).toFixed(4) }} WLD</span>
              </div>
              <div class="pledge-info-row">
                <span class="label">{{ t('pledgePage.endDate') }}</span>
                <span class="value">{{ formatDate(pledge.end_date) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部导航 -->
    <BottomNav />

    <!-- 提示框 -->
    <WalletAlert 
      :visible="showAlert" 
      :message="alertMessage"
      @update:visible="showAlert = $event" 
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWalletStore } from '@/stores/wallet'
import BottomNav from '../components/BottomNav.vue'
import WalletAlert from '../components/WalletAlert.vue'

const router = useRouter()
const { t } = useI18n()
const walletStore = useWalletStore()

// ==================== 自动刷新相关 ====================
let refreshInterval = null
const REFRESH_INTERVAL = 30000 // 30秒自动刷新一次

const activeTab = ref('wld')
const currentIndex = ref(0)
const slideDirection = ref('left')
const showAlert = ref(false)
const alertMessage = ref('')
const isLoading = ref(false)
const isCreating = ref(false)

// 质押产品数据（从API获取）
const pledgeProducts = ref([])

// 我的质押数据
const myPledges = ref([])

// 已过期质押数据
const expiredPledges = ref([])

// API 基础地址
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://bocail.com'

// 当前显示的质押产品
const currentPledge = computed(() => {
  if (pledgeProducts.value.length === 0) {
    return { name: 'WLD-01', amount: 100, income: 730, cycle: 365, max_pieces: 100, id: 0 }
  }
  return pledgeProducts.value[currentIndex.value]
})

// 获取质押产品列表
const fetchPledgeProducts = async () => {
  try {
    isLoading.value = true
    const response = await fetch(`${API_BASE}/api/pledge/products`)
    const data = await response.json()
    if (data.success) {
      pledgeProducts.value = data.data.map(p => ({
        id: p.id,
        name: p.name,
        amount: parseFloat(p.amount),
        income: parseFloat(p.income),
        cycle: p.cycle,
        pieces: p.max_pieces
      }))
    }
  } catch (error) {
    console.error('获取质押产品失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 获取我的质押
const fetchMyPledges = async () => {
  if (!walletStore.isConnected) return
  
  try {
    const response = await fetch(`${API_BASE}/api/pledge/my?wallet_address=${walletStore.walletAddress}`)
    const data = await response.json()
    if (data.success) {
      myPledges.value = data.data
    }
  } catch (error) {
    console.error('获取我的质押失败:', error)
  }
}

// 获取已过期质押
const fetchExpiredPledges = async () => {
  if (!walletStore.isConnected) return
  
  try {
    const response = await fetch(`${API_BASE}/api/pledge/expired?wallet_address=${walletStore.walletAddress}`)
    const data = await response.json()
    if (data.success) {
      expiredPledges.value = data.data
    }
  } catch (error) {
    console.error('获取已过期质押失败:', error)
  }
}

// 切换卡片
const prevCard = () => {
  slideDirection.value = 'right'
  if (currentIndex.value > 0) {
    currentIndex.value--
  } else {
    currentIndex.value = pledgeProducts.value.length - 1
  }
}

const nextCard = () => {
  slideDirection.value = 'left'
  if (currentIndex.value < pledgeProducts.value.length - 1) {
    currentIndex.value++
  } else {
    currentIndex.value = 0
  }
}

// 显示提示框
const showAlertMessage = (message) => {
  alertMessage.value = message
  showAlert.value = true
}

// 处理Synthetic Miner（合成矿机）点击 - 创建质押
const handleSynthetic = async () => {
  // 检查钱包是否连接
  if (!walletStore.isConnected) {
    showAlertMessage(t('pledgePage.pleaseConnectWallet'))
    return
  }
  
  if (isCreating.value) return
  
  try {
    isCreating.value = true
    
    const response = await fetch(`${API_BASE}/api/pledge/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        wallet_address: walletStore.walletAddress,
        product_id: currentPledge.value.id
      })
    })
    
    const data = await response.json()
    
    if (data.success) {
      showAlertMessage(t('pledgePage.pledgeSuccess'))
      // 刷新数据
      await fetchMyPledges()
    } else {
      showAlertMessage(data.message || t('pledgePage.pledgeFailed'))
    }
  } catch (error) {
    console.error('创建质押失败:', error)
    showAlertMessage(t('pledgePage.pledgeFailed'))
  } finally {
    isCreating.value = false
  }
}

// 处理背景点击 - 返回首页
const handleBackgroundClick = () => {
  router.push('/')
}

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString()
}

// ==================== 自动刷新方法 ====================

/**
 * 刷新所有数据
 */
const refreshAllData = async () => {
  console.log('[Pledge] 自动刷新数据...')
  await fetchPledgeProducts()
  if (walletStore.isConnected) {
    await Promise.all([fetchMyPledges(), fetchExpiredPledges()])
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
    console.log('[Pledge] 页面变为可见，刷新数据...')
    refreshAllData()
  }
}

// 页面加载时获取数据
onMounted(async () => {
  await fetchPledgeProducts()
  if (walletStore.isConnected) {
    await Promise.all([fetchMyPledges(), fetchExpiredPledges()])
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
    await Promise.all([fetchMyPledges(), fetchExpiredPledges()])
  }
})
</script>

<style scoped>
.pledge-page {
  min-height: 100vh;
  background: #0a0a0a;
  padding: 120px 16px 100px;
}

/* 标签切换 */
.tabs-container {
  width: 333px;
  height: 31px;
  margin: 0 auto 24px;
  display: flex;
  gap: 0;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 0;
  overflow: hidden;
}

.tab-item {
  width: 111px;
  height: 31px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  border-radius: 0;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.tab-item:last-child {
  border-right: none;
}

.tab-item.active {
  background: #f59e0b;
  color: #000000;
  font-weight: 600;
}

.tab-item:hover:not(.active) {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

/* 说明文字 */
.description-text {
  width: 350px;
  padding: 20px 9px;
  margin: 0 auto 20px;
  background: linear-gradient(315deg, rgba(39, 42, 47, 0.4), rgba(93, 107, 135, 0.4) 99%);
  border-radius: 24px;
  font-size: 12px;
  font-family: PingFang SC, PingFang SC-Heavy, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 800;
  color: #fff;
  text-align: left;
}

/* 内容容器 */
.content-container {
  max-width: 430px;
  margin: 0 auto;
}

/* 轮播容器 */
.carousel-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  position: relative;
  width: 100%;
  max-width: 100%;
  overflow: visible;
}

/* 卡片包裹器 */
.card-wrapper {
  position: relative;
  width: 315px;
  height: 320px;
  flex-shrink: 0;
}

/* 箭头按钮 */
.arrow-btn {
  width: 48px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.arrow-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.arrow-btn:hover {
  transform: scale(1.1);
}

.arrow-btn:active {
  transform: scale(0.95);
}

/* 质押卡片 */
.pledge-card {
  width: 315px;
  min-width: 315px;
  height: 307px;
  background: #2d3e56;
  border-radius: 16px;
  padding: 20px 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
  flex-shrink: 0;
}

.card-title {
  display: block;
  width: 155px;
  height: 34px;
  line-height: 34px;
  background: #f59e0b;
  color: #000000;
  font-size: 14px;
  font-weight: 700;
  padding: 0;
  border-radius: 6px;
  margin: 0 auto 12px;
  text-align: center;
}

.card-icon {
  width: 64px;
  height: 64px;
  min-width: 64px;
  min-height: 64px;
  max-width: 64px;
  max-height: 64px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border-radius: 50%;
  flex-shrink: 0;
  overflow: hidden;
}

.wld-icon {
  width: 50px;
  height: 50px;
  object-fit: contain;
}

.card-amount {
  width: 315px;
  height: 20px;
  line-height: 20px;
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 12px;
  text-align: center;
}

.card-details {
  background: transparent;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 19px;
  padding: 6px 0;
  border-bottom: none;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  height: 19px;
  line-height: 19px;
  font-size: 11px;
  color: #ffffff;
  font-weight: 400;
}

.detail-value {
  height: 16px;
  line-height: 16px;
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
}

.synthetic-btn {
  width: 216px;
  height: 32px;
  line-height: 32px;
  padding: 0;
  background: #f59e0b;
  color: #000000;
  font-size: 13px;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  margin: 0 auto;
}

.synthetic-btn:hover {
  background: #d97706;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
}

.synthetic-btn:active {
  transform: translateY(0);
}

/* 卡片滑动动画 */
.slide-left-enter-active,
.slide-right-enter-active {
  transition: all 0.35s ease-out;
}

.slide-left-leave-active,
.slide-right-leave-active {
  transition: all 0.35s ease-in;
  position: absolute;
  top: 0;
  left: 0;
}

.slide-left-enter-from {
  transform: translateX(40px);
  opacity: 0;
}

.slide-left-leave-to {
  transform: translateX(-40px);
  opacity: 0;
}

.slide-right-enter-from {
  transform: translateX(-40px);
  opacity: 0;
}

.slide-right-leave-to {
  transform: translateX(40px);
  opacity: 0;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 16px;
}

/* 质押列表样式 */
.pledge-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 4px;
}

.pledge-item {
  background: #2d3e56;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.pledge-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.pledge-name {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
}

.pledge-status {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
}

.pledge-status.active {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.pledge-status.expired {
  background: rgba(156, 163, 175, 0.2);
  color: #9ca3af;
}

.pledge-item-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pledge-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pledge-info-row .label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.pledge-info-row .value {
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
}

.pledge-info-row .value.highlight {
  color: #f59e0b;
}

/* 按钮禁用状态 */
.synthetic-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .pledge-page {
    padding: 130px 12px 100px;
  }

  .tabs-container {
    max-width: 100%;
  }

  .tab-item {
    font-size: 12px;
    padding: 10px 12px;
  }

  .arrow-btn {
    width: 48px;
    height: 70px;
  }

  .arrow-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .pledge-card {
    padding: 20px 16px;
  }

  .card-icon {
    width: 64px;
    height: 64px;
    min-width: 64px;
    min-height: 64px;
    max-width: 64px;
    max-height: 64px;
    flex-shrink: 0;
  }

  .wld-icon {
    width: 50px;
    height: 50px;
  }
}

@media (max-width: 480px) {
  .pledge-page {
    padding: 130px 8px 100px;
  }

  .carousel-container {
    gap: 0;
    position: relative;
    padding: 0 50px;
  }

  .arrow-btn {
    width: 40px;
    height: 60px;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
  }

  .arrow-left {
    left: 0;
  }

  .arrow-right {
    right: 0;
  }

  .pledge-card {
    width: 100%;
    max-width: 315px;
    margin: 0 auto;
  }

  .card-title {
    display: block;
    width: 155px;
    height: 34px;
    line-height: 34px;
    font-size: 14px;
    padding: 0;
    margin: 0 auto 12px;
    text-align: center;
  }

  .card-amount {
    width: 100%;
    max-width: 315px;
    height: 20px;
    line-height: 20px;
    font-size: 16px;
    text-align: center;
  }

  .detail-label {
    height: 19px;
    line-height: 19px;
    font-size: 11px;
  }

  .detail-value {
    height: 16px;
    line-height: 16px;
    font-size: 11px;
  }

  .synthetic-btn {
    width: 216px;
    height: 32px;
    line-height: 32px;
    font-size: 13px;
    padding: 0;
  }
}
</style>

