<template>
  <!--
    点击退出功能：
    - 点击页面任意位置都会退出，返回到上一页
  -->
  <div class="community-members-page" @click="handleExit">
    <!-- 顶部导航栏 -->
    <div class="top-navigation">
      <div class="nav-container">
        <!-- 左侧返回按钮 -->
        <div class="nav-left" @click.stop="goBack">
          <svg class="back-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        
        <!-- 中间标题 -->
        <div class="nav-center">
          <h1 class="page-title">{{ t('invitePage.communityMemberDetails') }}</h1>
        </div>
        
        <!-- 右侧占位（保持布局对称） -->
        <div class="nav-right"></div>
      </div>
    </div>

    <!-- 页面内容 -->
    <div class="content-wrapper">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <div class="loading-spinner"></div>
        <p class="loading-text">{{ t('communityPage.loading') }}</p>
      </div>
      
      <!-- 错误提示 -->
      <div v-else-if="error" class="error-container">
        <p class="error-text">{{ error }}</p>
        <button class="retry-btn" @click.stop="fetchLevelCounts">
          {{ t('communityPage.retry') }}
        </button>
      </div>
      
      <!-- 层级列表 -->
      <div v-else class="levels-container">
        <div 
          v-for="level in levels" 
          :key="level.id" 
          class="level-card"
        >
          <div class="level-header">
            <h3 class="level-title">{{ t('communityPage.levelEmployees', { level: level.id }) }}</h3>
            <span class="level-badge">{{ level.rewardPercentage }}</span>
          </div>
          
          <div class="level-stats">
            <div class="stat-item">
              <span class="stat-label">{{ t('communityPage.memberCount') }}</span>
              <span class="stat-value">{{ level.count }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{ t('communityPage.teamPerformance') }}</span>
              <span class="stat-value">{{ parseFloat(level.totalInvestment).toFixed(2) }} USDT</span>
            </div>
          </div>
          
          <button 
            class="community-details-btn" 
            @click.stop="viewLevelDetails(level.id)"
            :disabled="level.count === 0"
          >
            {{ t('communityPage.communityDetails') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 社区成员详情页面
 * 
 * 功能：
 * - 显示社区成员列表
 * - 显示成员详细信息
 * - 支持搜索和筛选
 * - 点击页面任意位置退出
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWalletStore } from '@/stores/wallet'

const router = useRouter()
const { t } = useI18n()
const walletStore = useWalletStore()

// ==================== 自动刷新相关 ====================
let refreshInterval = null
const REFRESH_INTERVAL = 30000 // 30秒自动刷新一次

/**
 * 层级数据（1-8级，对应推荐奖励系统）
 */
const levels = ref([
  { id: 1, count: 0, totalInvestment: '0.0000', rewardPercentage: '30%' },
  { id: 2, count: 0, totalInvestment: '0.0000', rewardPercentage: '10%' },
  { id: 3, count: 0, totalInvestment: '0.0000', rewardPercentage: '5%' },
  { id: 4, count: 0, totalInvestment: '0.0000', rewardPercentage: '1%' },
  { id: 5, count: 0, totalInvestment: '0.0000', rewardPercentage: '1%' },
  { id: 6, count: 0, totalInvestment: '0.0000', rewardPercentage: '1%' },
  { id: 7, count: 0, totalInvestment: '0.0000', rewardPercentage: '1%' },
  { id: 8, count: 0, totalInvestment: '0.0000', rewardPercentage: '1%' }
])

// 加载状态
const loading = ref(false)
const error = ref(null)

/**
 * 获取团队统计数据（使用新的详细API）
 */
const fetchLevelCounts = async () => {
  if (!walletStore.isConnected || !walletStore.walletAddress) {
    error.value = t('communityPage.connectWalletFirst')
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://bocail.com'
    const response = await fetch(
      `${API_BASE}/api/invite/team-stats?wallet_address=${walletStore.walletAddress}`
    )
    const data = await response.json()
    
    console.log('[CommunityMembers] Team stats response:', data)
    
    if (data.success && data.data) {
      // 更新各层级数据
      data.data.forEach(stat => {
        const level = levels.value.find(l => l.id === stat.level)
        if (level) {
          level.count = stat.count
          level.totalInvestment = stat.totalInvestment
          level.rewardPercentage = stat.rewardPercentage
        }
      })
    } else {
      error.value = data.message || t('communityPage.fetchError')
    }
  } catch (err) {
    console.error('[CommunityMembers] Fetch team stats error:', err)
    error.value = t('communityPage.fetchError')
  } finally {
    loading.value = false
  }
}

/**
 * 查看层级详情
 */
const viewLevelDetails = (level) => {
  console.log(`View level ${level} details`)
  // 跳转到Invite页面并传递层级参数
  router.push({
    path: '/invite',
    query: { level }
  })
}

/**
 * 返回上一页（返回按钮点击）
 */
const goBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/invite')
  }
}

/**
 * 点击页面退出（点击任意空白区域）
 */
const handleExit = () => {
  // 退出逻辑：优先返回上一页，无历史则跳转到 /invite
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/invite')
  }
}

// ==================== 自动刷新方法 ====================

/**
 * 启动自动刷新定时器
 */
const startAutoRefresh = () => {
  stopAutoRefresh()
  refreshInterval = setInterval(() => {
    if (walletStore.isConnected) {
      console.log('[CommunityMembers] 自动刷新数据...')
      fetchLevelCounts()
    }
  }, REFRESH_INTERVAL)
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
  if (document.visibilityState === 'visible' && walletStore.isConnected) {
    console.log('[CommunityMembers] 页面变为可见，刷新数据...')
    fetchLevelCounts()
  }
}

/**
 * 组件挂载时加载数据
 */
onMounted(() => {
  if (walletStore.isConnected) {
    fetchLevelCounts()
    startAutoRefresh()
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

/**
 * 组件卸载时清理
 */
onUnmounted(() => {
  stopAutoRefresh()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

/**
 * 监听钱包连接状态变化
 */
watch(() => walletStore.isConnected, (connected) => {
  if (connected) {
    fetchLevelCounts()
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
})
</script>

<style scoped>
/* 页面容器 */
.community-members-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a1e, #0f0f12);
  padding-top: 108px;
  padding-bottom: 20px;
}

/* 顶部导航栏 */
.top-navigation {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 108px;
  background-image: url(/static/two/headbgimg.png);
  background-size: 100% 100%;
  background-position: top center;
  background-repeat: no-repeat;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-container {
  width: 100%;
  max-width: 456px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-sizing: border-box;
}

.nav-left,
.nav-right {
  width: 40px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-left {
  cursor: pointer;
  transition: opacity 0.3s ease;
}

.nav-left:hover {
  opacity: 0.8;
}

.nav-left:active {
  opacity: 0.6;
}

.back-icon {
  width: 24px;
  height: 24px;
  color: #fff;
}

.nav-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  overflow: hidden;
}

.page-title {
  font-size: 16px;
  font-weight: 700;
  color: rgb(245, 182, 56);
  text-align: center;
  margin: 0;
  line-height: 30px;
  letter-spacing: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 内容区域 */
.content-wrapper {
  width: 100%;
  max-width: 432px;
  margin: 0 auto;
  padding: 20px 16px;
  box-sizing: border-box;
  min-height: calc(100vh - 128px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 加载状态 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(245, 182, 56, 0.2);
  border-top-color: rgb(245, 182, 56);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  margin: 0;
}

/* 错误提示 */
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 16px;
}

.error-text {
  color: #ff6b6b;
  font-size: 14px;
  text-align: center;
  margin: 0;
}

.retry-btn {
  padding: 10px 24px;
  background: linear-gradient(90deg, rgb(245, 182, 56), #ffc107);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1e;
  cursor: pointer;
  transition: all 0.3s ease;
}

.retry-btn:hover {
  background: linear-gradient(90deg, #ffc107, rgb(245, 182, 56));
  transform: translateY(-1px);
}

/* 层级列表容器 */
.levels-container {
  display: flex;
  flex-direction: column;
  gap: 16px; /* 卡片之间的间距 */
}

/* 层级卡片 */
.level-card {
  background: linear-gradient(135deg, rgba(42, 50, 65, 0.8), rgba(31, 37, 48, 0.8));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: all 0.3s ease;
}

.level-card:hover {
  background: linear-gradient(135deg, rgba(42, 50, 65, 0.9), rgba(31, 37, 48, 0.9));
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateY(-2px);
}

/* 层级头部 */
.level-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.level-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
  line-height: 1.4;
}

.level-badge {
  padding: 4px 12px;
  background: rgba(245, 182, 56, 0.15);
  border: 1px solid rgba(245, 182, 56, 0.3);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  color: rgb(245, 182, 56);
}

/* 层级统计 */
.level-stats {
  display: flex;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

/* 社区详情按钮 */
.community-details-btn {
  width: 100%;
  height: 40px;
  background: linear-gradient(90deg, rgb(245, 182, 56), #ffc107);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1e;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(245, 182, 56, 0.3);
}

.community-details-btn:hover:not(:disabled) {
  background: linear-gradient(90deg, #ffc107, rgb(245, 182, 56));
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 182, 56, 0.4);
}

.community-details-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.community-details-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: linear-gradient(90deg, rgba(245, 182, 56, 0.5), rgba(255, 193, 7, 0.5));
  box-shadow: none;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .content-wrapper {
    max-width: 100%;
    padding: 16px;
    gap: 14px;
  }

  .levels-container {
    gap: 14px;
  }

  .page-title {
    font-size: 15px;
  }

  .level-card {
    padding: 18px;
    gap: 14px;
  }

  .level-title {
    font-size: 15px;
  }

  .level-count {
    font-size: 18px;
  }

  .community-details-btn {
    height: 38px;
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .top-navigation {
    height: 90px;
  }

  .community-members-page {
    padding-top: 90px;
  }

  .nav-container {
    max-width: 100%;
    padding: 0 12px;
  }

  .content-wrapper {
    padding: 12px;
    gap: 12px;
  }

  .levels-container {
    gap: 12px;
  }

  .page-title {
    font-size: 14px;
  }

  .level-card {
    padding: 16px;
    gap: 12px;
  }

  .level-title {
    font-size: 14px;
  }

  .level-count {
    font-size: 16px;
  }

  .community-details-btn {
    height: 36px;
    font-size: 12px;
  }
}

@media (max-width: 360px) {
  .levels-container {
    gap: 10px;
  }

  .page-title {
    font-size: 13px;
  }

  .level-title {
    font-size: 13px;
  }

  .level-count {
    font-size: 15px;
  }
}
</style>

