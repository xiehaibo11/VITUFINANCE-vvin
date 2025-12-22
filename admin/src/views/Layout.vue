<template>
  <div class="admin-layout" :class="{ 'is-dark': isDark }">
    <!-- 全局 3D 背景 -->
    <Background3D class="layout-bg" />
    
    <!-- 移动端遮罩层 -->
    <div 
      v-if="isMobile && !isCollapse" 
      class="mobile-overlay" 
      @click="toggleCollapse"
    ></div>
    
    <!-- 侧边栏 -->
    <aside class="sidebar" :class="{ 'is-collapse': isCollapse, 'is-mobile': isMobile }">
      <!-- Logo -->
      <div class="sidebar-logo">
        <div class="logo-icon">
          <el-icon :size="24"><TrendCharts /></el-icon>
        </div>
        <transition name="fade">
          <span v-show="!isCollapse || isMobile" class="logo-text">VituFinance</span>
        </transition>
        <!-- 移动端关闭按钮 -->
        <el-icon v-if="isMobile" class="close-btn" :size="20" @click="toggleCollapse">
          <Close />
        </el-icon>
      </div>
      
      <!-- 菜单 -->
      <el-scrollbar class="sidebar-menu-wrapper">
        <el-menu
          :default-active="activeMenu"
          :collapse="!isMobile && isCollapse"
          :collapse-transition="false"
          :background-color="isDark ? '#0d1117' : '#001529'"
          :text-color="'rgba(255, 255, 255, 0.65)'"
          :active-text-color="'#ffffff'"
          router
          @select="handleMenuSelect"
        >
          <!-- 仪表盘 -->
          <el-menu-item index="/dashboard">
            <el-icon><Odometer /></el-icon>
            <template #title>仪表盘</template>
          </el-menu-item>
          
          <!-- 用户管理 -->
          <el-menu-item index="/users">
            <el-icon><User /></el-icon>
            <template #title>用户管理</template>
          </el-menu-item>
          
          <!-- 资金管理 -->
          <el-sub-menu index="funds">
            <template #title>
              <el-icon><Wallet /></el-icon>
              <span>资金管理</span>
            </template>
            <el-menu-item index="/deposits">
              <el-icon><Download /></el-icon>
              <template #title>
                <span>充值记录</span>
                <el-badge v-if="newDepositCount > 0" :value="newDepositCount" class="menu-badge" />
              </template>
            </el-menu-item>
            <el-menu-item index="/withdrawals">
              <el-icon><Upload /></el-icon>
              <span>提款记录</span>
            </el-menu-item>
            <el-menu-item index="/transactions">
              <el-icon><List /></el-icon>
              <span>交易记录</span>
            </el-menu-item>
          </el-sub-menu>
          
          <!-- 业务管理 -->
          <el-sub-menu index="business">
            <template #title>
              <el-icon><DataLine /></el-icon>
              <span>业务管理</span>
            </template>
            <el-menu-item index="/robots-active">
              <el-icon><VideoPlay /></el-icon>
              <span>运行中机器人</span>
            </el-menu-item>
            <el-menu-item index="/robots-expired">
              <el-icon><Timer /></el-icon>
              <span>过期机器人</span>
            </el-menu-item>
            <el-menu-item index="/pledges">
              <el-icon><Coin /></el-icon>
              <span>质押管理</span>
            </el-menu-item>
            <el-menu-item index="/follows">
              <el-icon><TrendCharts /></el-icon>
              <span>跟单管理</span>
            </el-menu-item>
          </el-sub-menu>
          
          <!-- 推广管理 -->
          <el-menu-item index="/referrals">
            <el-icon><Share /></el-icon>
            <template #title>推广管理</template>
          </el-menu-item>
          
          <!-- 推荐数据管理 -->
          <el-menu-item index="/invite-stats">
            <el-icon><DataLine /></el-icon>
            <template #title>推荐数据</template>
          </el-menu-item>
          
          <!-- 团队分红 -->
          <el-menu-item index="/team-dividend">
            <el-icon><Coin /></el-icon>
            <template #title>团队分红</template>
          </el-menu-item>
          
          <!-- 抽奖管理 -->
          <el-menu-item index="/lucky-wheel">
            <el-icon><Present /></el-icon>
            <template #title>抽奖管理</template>
          </el-menu-item>
          
          <!-- 内容管理 -->
          <el-menu-item index="/announcements">
            <el-icon><Bell /></el-icon>
            <template #title>公告管理</template>
          </el-menu-item>

          <!-- 资质文件 -->
          <el-menu-item index="/documents">
            <el-icon><Document /></el-icon>
            <template #title>资质文件</template>
          </el-menu-item>
          
          <!-- 数据清理 -->
          <el-menu-item index="/data-cleanup">
            <el-icon><Delete /></el-icon>
            <template #title>数据清理</template>
          </el-menu-item>
          
          <!-- 系统管理 -->
          <el-sub-menu index="system">
            <template #title>
              <el-icon><Setting /></el-icon>
              <span>系统管理</span>
            </template>
            <el-menu-item index="/ip-blacklist">
              <el-icon><Lock /></el-icon>
              <span>IP封禁管理</span>
            </el-menu-item>
            <el-menu-item index="/error-logs">
              <el-icon><Warning /></el-icon>
              <span>错误日志</span>
            </el-menu-item>
            <el-menu-item index="/settings">
              <el-icon><Tools /></el-icon>
              <span>系统设置</span>
            </el-menu-item>
            <el-menu-item index="/logs">
              <el-icon><Document /></el-icon>
              <span>系统日志</span>
            </el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-scrollbar>
      
      <!-- 侧边栏底部 -->
      <div class="sidebar-footer" v-if="!isCollapse || isMobile">
        <span class="version">v1.0.0</span>
      </div>
    </aside>
    
    <!-- 主内容区 -->
    <div class="main-container" :class="{ 'is-collapse': isCollapse }">
      <!-- 顶部导航 -->
      <header class="navbar">
        <div class="navbar-left">
          <!-- 折叠/菜单按钮 -->
          <el-tooltip :content="isCollapse ? '展开菜单' : '收起菜单'" placement="bottom">
            <div class="collapse-btn" @click="toggleCollapse">
              <el-icon :size="20">
                <Fold v-if="!isCollapse && !isMobile" />
                <Expand v-else />
              </el-icon>
            </div>
          </el-tooltip>
          
          <!-- 面包屑（移动端隐藏） -->
          <el-breadcrumb v-if="!isMobile" separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentPageTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
          
          <!-- 移动端标题 -->
          <span v-else class="mobile-title">{{ currentPageTitle }}</span>
        </div>
        
        <div class="navbar-right">
          <!-- 充值通知铃铛 -->
          <el-tooltip content="充值通知" placement="bottom">
            <el-badge :value="newDepositCount" :hidden="newDepositCount === 0" class="notification-badge">
              <div class="navbar-icon" @click="goToDeposits">
                <el-icon :size="20"><Bell /></el-icon>
              </div>
            </el-badge>
          </el-tooltip>
          
          <!-- 主题切换 -->
          <el-tooltip :content="isDark ? '切换亮色主题' : '切换暗黑主题'" placement="bottom">
            <div class="navbar-icon" @click="toggleTheme">
              <el-icon :size="20">
                <Sunny v-if="isDark" />
                <Moon v-else />
              </el-icon>
            </div>
          </el-tooltip>
          
          <!-- 全屏（移动端隐藏） -->
          <el-tooltip v-if="!isMobile" content="全屏" placement="bottom">
            <div class="navbar-icon" @click="toggleFullscreen">
              <el-icon :size="20"><FullScreen /></el-icon>
            </div>
          </el-tooltip>
          
          <!-- 刷新 -->
          <el-tooltip content="刷新" placement="bottom">
            <div class="navbar-icon" @click="refreshPage">
              <el-icon :size="20"><Refresh /></el-icon>
            </div>
          </el-tooltip>
          
          <!-- 用户下拉菜单 -->
          <el-dropdown @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="32" :src="adminAvatarUrl" class="user-avatar">
                <el-icon><UserFilled /></el-icon>
              </el-avatar>
              <span v-if="!isMobile" class="username">管理员</span>
              <el-icon class="dropdown-icon"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="settings">
                  <el-icon><Setting /></el-icon>
                  系统设置
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>
      
      <!-- 内容区 -->
      <main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="slide-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
      
      <!-- 页脚 -->
      <footer class="main-footer">
        <span>© 2024 VituFinance. All rights reserved.</span>
      </footer>
    </div>
    
    <!-- 充值/提款提示音 -->
    <audio ref="notificationSound" preload="auto" src="/admin/sounds/notification.mp3"></audio>
    
    <!-- 声音启用提示 -->
    <el-dialog
      v-model="showSoundEnableDialog"
      title=""
      width="400px"
      :close-on-click-modal="false"
      class="sound-enable-dialog"
    >
      <div class="sound-enable-content">
        <div class="sound-icon">
          <el-icon :size="64"><Bell /></el-icon>
        </div>
        <h3>启用通知提示音</h3>
        <p>为了确保您能及时收到充值和提款通知，请点击下方按钮启用声音提示。</p>
      </div>
      <template #footer>
        <el-button type="primary" size="large" @click="enableSoundNotification">
          <el-icon><Bell /></el-icon>
          启用声音通知
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 充值通知弹窗 -->
    <el-dialog
      v-model="showDepositNotification"
      title=""
      width="420px"
      :close-on-click-modal="false"
      class="deposit-notification-dialog"
      :show-close="true"
      @close="stopNotificationSound"
    >
      <div class="notification-content">
        <div class="notification-icon success">
          <el-icon :size="48"><CircleCheckFilled /></el-icon>
        </div>
        <h3 class="notification-title">💰 新充值通知</h3>
        <p class="notification-amount">+{{ latestDeposit.amount }} {{ latestDeposit.token }}</p>
        <p class="notification-address">{{ shortenAddress(latestDeposit.wallet_address) }}</p>
        <p class="notification-time">{{ formatTime(latestDeposit.created_at) }}</p>
      </div>
      <template #footer>
        <el-button @click="handleDepositLater">稍后处理</el-button>
        <el-button type="primary" @click="viewDepositDetail">
          <el-icon><View /></el-icon>
          查看详情
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 提款通知弹窗 -->
    <el-dialog
      v-model="showWithdrawNotification"
      title=""
      width="420px"
      :close-on-click-modal="false"
      class="withdraw-notification-dialog"
      :show-close="true"
      @close="stopNotificationSound"
    >
      <div class="notification-content">
        <div class="notification-icon warning">
          <el-icon :size="48"><Warning /></el-icon>
        </div>
        <h3 class="notification-title">💸 新提款申请</h3>
        <p class="notification-amount withdraw">-{{ latestWithdraw.amount }} {{ latestWithdraw.token }}</p>
        <p class="notification-address">{{ shortenAddress(latestWithdraw.wallet_address) }}</p>
        <p class="notification-time">{{ formatTime(latestWithdraw.created_at) }}</p>
      </div>
      <template #footer>
        <el-button @click="handleWithdrawLater">稍后处理</el-button>
        <el-button type="warning" @click="viewWithdrawDetail">
          <el-icon><View /></el-icon>
          立即处理
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 攻击警报弹窗 -->
    <el-dialog
      v-model="showAttackNotification"
      title=""
      width="480px"
      :close-on-click-modal="false"
      class="attack-notification-dialog"
      :show-close="true"
      @close="stopNotificationSound"
    >
      <div class="notification-content attack">
        <div class="notification-icon danger">
          <el-icon :size="56"><Warning /></el-icon>
        </div>
        <h3 class="notification-title attack-title">🚨 安全警报</h3>
        <p class="attack-summary">
          检测到 <strong>{{ latestAttackSummary.count }}</strong> 次攻击
        </p>
        <div class="attack-details">
          <el-tag :type="getSeverityType(latestAttackSummary.highestSeverity)" size="large">
            {{ latestAttackSummary.highestSeverity === 'critical' ? '严重' :
               latestAttackSummary.highestSeverity === 'high' ? '高危' :
               latestAttackSummary.highestSeverity === 'medium' ? '中危' : '低危' }}
          </el-tag>
          <el-tag type="info" size="large" style="margin-left: 8px;">
            {{ getAttackTypeName(latestAttackSummary.mainType) }}攻击
          </el-tag>
        </div>
        <p class="attack-blocked" v-if="latestAttackSummary.blockedCount > 0">
          已自动封禁 {{ latestAttackSummary.blockedCount }} 个IP
        </p>
        <div class="attack-list" v-if="latestAttacks.length > 0">
          <div class="attack-item" v-for="attack in latestAttacks.slice(0, 3)" :key="attack.id">
            <span class="attack-ip">{{ attack.ip_address }}</span>
            <el-tag :type="getSeverityType(attack.severity)" size="small">
              {{ attack.attack_type }}
            </el-tag>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="handleAttackLater">稍后处理</el-button>
        <el-button type="danger" @click="viewAttackDetail">
          <el-icon><View /></el-icon>
          查看详情
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
/**
 * 管理系统布局组件
 * 功能：响应式布局、暗黑主题、充值通知
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import Background3D from '@/components/Background3D.vue'
import {
  Setting,
  Odometer,
  User,
  UserFilled,
  Download,
  Upload,
  Bell,
  Monitor,
  Share,
  Fold,
  Expand,
  FullScreen,
  Refresh,
  ArrowDown,
  SwitchButton,
  Close,
  CircleCheckFilled,
  Sunny,
  Moon,
  View,
  Wallet,
  List,
  DataLine,
  Coin,
  TrendCharts,
  Tools,
  Document,
  Warning,
  VideoPlay,
  Timer,
  Delete,
  Lock,
  Present
} from '@element-plus/icons-vue'
import request from '@/api'
import { useThemeStore } from '@/stores/theme'
import dayjs from 'dayjs'
import eventBus, { EVENTS } from '@/utils/eventBus'
// 引入语音播报服务
import speechService, { 
  initSpeechService, 
  speakNewDepositOrder, 
  speakDepositComplete, 
  speakWithdrawRequest,
  speakAttackAlert,
  speakIPBlocked,
  speechEnabled,
  activateSpeech,
  activateAndEnableSpeech,
  saveSettings as saveSpeechSettings
} from '@/utils/speechService'

const route = useRoute()
const router = useRouter()
const themeStore = useThemeStore()

// ==================== 主题相关 ====================

const isDark = computed(() => themeStore.theme === 'dark')

const toggleTheme = () => {
  themeStore.toggleTheme()
}

// ==================== 管理员头像 ====================
const adminAvatarUrl = ref('')

// 获取管理员头像
const fetchAdminAvatar = async () => {
  try {
    const res = await request.get('/settings/avatar')
    if (res.success && res.data?.avatar_url) {
      adminAvatarUrl.value = res.data.avatar_url
    }
  } catch (error) {
    console.log('获取头像失败（可忽略）:', error)
  }
}

// 监听头像更新事件
const handleAvatarUpdate = (event) => {
  adminAvatarUrl.value = event.detail || ''
}

// ==================== 响应式状态 ====================

// 侧边栏折叠状态
const isCollapse = ref(true)

// 是否为移动端
const isMobile = ref(false)

// 当前激活的菜单
const activeMenu = computed(() => route.path)

// 当前页面标题
const currentPageTitle = computed(() => route.meta.title || '')

// ==================== 充值通知状态 ====================

// 提示音元素引用
const notificationSound = ref(null)

// 新充值数量
const newDepositCount = ref(0)

// 最后检查的充值ID
const lastDepositId = ref(0)

// 显示充值通知弹窗
const showDepositNotification = ref(false)

// 最新充值信息
const latestDeposit = ref({
  amount: '0',
  token: 'USDT',
  wallet_address: '',
  created_at: new Date()
})

// ==================== 提款通知状态 ====================

// 新提款数量
const newWithdrawCount = ref(0)

// 最后检查的提款ID
const lastWithdrawId = ref(0)

// 显示提款通知弹窗
const showWithdrawNotification = ref(false)

// 最新提款信息
const latestWithdraw = ref({
  amount: '0',
  token: 'USDT',
  wallet_address: '',
  created_at: new Date()
})

// ==================== 攻击通知状态 ====================

// 最后检查的攻击日志ID
const lastAttackId = ref(0)

// 最后检查的封禁IP ID
const lastBlockId = ref(0)

// 显示攻击通知弹窗
const showAttackNotification = ref(false)

// 最新攻击摘要信息
const latestAttackSummary = ref({
  count: 0,
  mainType: 'other',
  highestSeverity: 'low',
  blockedCount: 0
})

// 最新攻击列表
const latestAttacks = ref([])

// 攻击轮询定时器
let attackPollingTimer = null

// ==================== 声音启用状态 ====================

// 显示声音启用对话框
const showSoundEnableDialog = ref(false)

// 声音是否已启用
const soundEnabled = ref(false)

// 轮询定时器
let pollingTimer = null

// ==================== 待处理通知管理（刷新后继续显示直到手动关闭） ====================

// 待处理的充值通知ID列表
const pendingDepositIds = ref([])

// 待处理的提款通知ID列表
const pendingWithdrawIds = ref([])

// 已确认（关闭）的通知ID列表 - 用于避免重复显示
const confirmedDepositIds = ref({})
const confirmedWithdrawIds = ref({})

/**
 * 检查充值是否已被确认（手动关闭）
 */
const isDepositConfirmed = (depositId) => {
  return confirmedDepositIds.value[depositId] === true
}

/**
 * 检查提款是否已被确认（手动关闭）
 */
const isWithdrawConfirmed = (withdrawId) => {
  return confirmedWithdrawIds.value[withdrawId] === true
}

/**
 * 添加待处理充值通知
 */
const addPendingDeposit = (deposit) => {
  const depositId = deposit.id
  // If already confirmed, skip
  if (isDepositConfirmed(depositId)) {
    return false
  }
  // Add to pending list if not exists
  if (!pendingDepositIds.value.includes(depositId)) {
    pendingDepositIds.value.push(depositId)
    latestDeposit.value = deposit
    savePendingNotifications()
    return true
  }
  return false
}

/**
 * 添加待处理提款通知
 */
const addPendingWithdraw = (withdraw) => {
  const withdrawId = withdraw.id
  // If already confirmed, skip
  if (isWithdrawConfirmed(withdrawId)) {
    return false
  }
  // Add to pending list if not exists
  if (!pendingWithdrawIds.value.includes(withdrawId)) {
    pendingWithdrawIds.value.push(withdrawId)
    latestWithdraw.value = withdraw
    savePendingNotifications()
    return true
  }
  return false
}

/**
 * 确认（关闭）充值通知 - 管理员手动关闭时调用
 */
const confirmDeposit = (depositId) => {
  // Remove from pending
  const index = pendingDepositIds.value.indexOf(depositId)
  if (index > -1) {
    pendingDepositIds.value.splice(index, 1)
  }
  // Mark as confirmed
  confirmedDepositIds.value[depositId] = true
  savePendingNotifications()
}

/**
 * 确认（关闭）提款通知 - 管理员手动关闭时调用
 */
const confirmWithdraw = (withdrawId) => {
  // Remove from pending
  const index = pendingWithdrawIds.value.indexOf(withdrawId)
  if (index > -1) {
    pendingWithdrawIds.value.splice(index, 1)
  }
  // Mark as confirmed
  confirmedWithdrawIds.value[withdrawId] = true
  savePendingNotifications()
}

/**
 * 保存待处理通知到 localStorage
 */
const savePendingNotifications = () => {
  try {
    localStorage.setItem('admin_pending_deposits', JSON.stringify(pendingDepositIds.value))
    localStorage.setItem('admin_pending_withdraws', JSON.stringify(pendingWithdrawIds.value))
    localStorage.setItem('admin_confirmed_deposits', JSON.stringify(confirmedDepositIds.value))
    localStorage.setItem('admin_confirmed_withdraws', JSON.stringify(confirmedWithdrawIds.value))
    localStorage.setItem('admin_latest_deposit', JSON.stringify(latestDeposit.value))
    localStorage.setItem('admin_latest_withdraw', JSON.stringify(latestWithdraw.value))
  } catch (e) {
    console.log('保存待处理通知失败:', e)
  }
}

/**
 * 从 localStorage 加载待处理通知
 */
const loadPendingNotifications = () => {
  try {
    const pendingDeposits = localStorage.getItem('admin_pending_deposits')
    const pendingWithdraws = localStorage.getItem('admin_pending_withdraws')
    const confirmedDeposits = localStorage.getItem('admin_confirmed_deposits')
    const confirmedWithdraws = localStorage.getItem('admin_confirmed_withdraws')
    const savedLatestDeposit = localStorage.getItem('admin_latest_deposit')
    const savedLatestWithdraw = localStorage.getItem('admin_latest_withdraw')
    
    if (pendingDeposits) {
      pendingDepositIds.value = JSON.parse(pendingDeposits)
    }
    if (pendingWithdraws) {
      pendingWithdrawIds.value = JSON.parse(pendingWithdraws)
    }
    if (confirmedDeposits) {
      confirmedDepositIds.value = JSON.parse(confirmedDeposits)
    }
    if (confirmedWithdraws) {
      confirmedWithdrawIds.value = JSON.parse(confirmedWithdraws)
    }
    if (savedLatestDeposit) {
      latestDeposit.value = JSON.parse(savedLatestDeposit)
    }
    if (savedLatestWithdraw) {
      latestWithdraw.value = JSON.parse(savedLatestWithdraw)
    }
    
    // Show popup if there are pending notifications
    if (pendingDepositIds.value.length > 0) {
      showDepositNotification.value = true
      playNotificationSound()
    }
    if (pendingWithdrawIds.value.length > 0) {
      showWithdrawNotification.value = true
      playNotificationSound()
    }
  } catch (e) {
    console.log('加载待处理通知失败:', e)
  }
}

/**
 * 清理旧的已确认记录（保留最近200条）
 */
const cleanOldConfirmedRecords = () => {
  const maxRecords = 200
  const depositKeys = Object.keys(confirmedDepositIds.value)
  const withdrawKeys = Object.keys(confirmedWithdrawIds.value)
  
  if (depositKeys.length > maxRecords) {
    const keysToRemove = depositKeys.slice(0, depositKeys.length - maxRecords)
    keysToRemove.forEach(key => delete confirmedDepositIds.value[key])
  }
  
  if (withdrawKeys.length > maxRecords) {
    const keysToRemove = withdrawKeys.slice(0, withdrawKeys.length - maxRecords)
    keysToRemove.forEach(key => delete confirmedWithdrawIds.value[key])
  }
  savePendingNotifications()
}

// ==================== 响应式处理 ====================

/**
 * 检查是否为移动端
 */
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
  // 移动端默认收起菜单
  if (isMobile.value) {
    isCollapse.value = true
  }
}

/**
 * 切换侧边栏折叠
 */
const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value
}

/**
 * 菜单选择时（移动端自动收起）
 */
const handleMenuSelect = () => {
  if (isMobile.value) {
    isCollapse.value = true
  }
}

/**
 * 切换全屏
 */
const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

/**
 * 刷新页面
 */
const refreshPage = () => {
  window.location.reload()
}

/**
 * 处理下拉菜单命令
 */
const handleCommand = async (command) => {
  switch (command) {
    case 'settings':
      router.push('/settings')
      break
    case 'logout':
      try {
        await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        })
        localStorage.removeItem('admin_token')
        router.push('/login')
        ElMessage.success('已退出登录')
      } catch {
        // 用户取消
      }
      break
  }
}

// ==================== 声音启用功能 ====================

/**
 * 启用声音通知（同时启用语音播报）
 */
const enableSoundNotification = async () => {
  if (notificationSound.value) {
    try {
      // 播放一次声音来激活音频上下文
      notificationSound.value.volume = 0.5
      await notificationSound.value.play()
      
      soundEnabled.value = true
      showSoundEnableDialog.value = false
      localStorage.setItem('admin_sound_enabled', 'true')
      
      // 同时启用并激活语音播报功能（会播放"语音通知已开启"）
      await activateAndEnableSpeech()
      
      ElMessage.success('声音和语音通知已启用')
    } catch (err) {
      console.log('启用声音失败:', err.message)
      ElMessage.warning('无法启用声音，请检查浏览器设置')
    }
  }
}

/**
 * 检查是否需要启用声音
 * 默认尝试启用声音，如果浏览器阻止则会在播放时显示对话框
 */
const checkSoundEnabled = () => {
  const enabled = localStorage.getItem('admin_sound_enabled')
  if (enabled) {
    soundEnabled.value = true
  }
  // 不主动显示启用对话框，等到有通知时再尝试播放
  // 如果浏览器阻止自动播放，playNotificationSound 会显示对话框
}

// ==================== 充值通知功能 ====================

/**
 * 播放提示音（持续1分钟循环播放）
 * 不需要用户先点击"启用声音"，直接尝试播放
 */
let soundLoopTimer = null
let soundStartTime = null

const playNotificationSound = () => {
  if (!notificationSound.value) return
  
  // 如果已经在播放，不重复启动
  if (soundLoopTimer) return
  
  const duration = 60000 // 1分钟 = 60000毫秒
  soundStartTime = Date.now()
  
  const playOnce = () => {
    notificationSound.value.currentTime = 0
    notificationSound.value.volume = 0.7
    notificationSound.value.play().then(() => {
      // 播放成功，标记为已启用
      soundEnabled.value = true
      localStorage.setItem('admin_sound_enabled', 'true')
    }).catch(err => {
      console.log('无法播放提示音:', err.message)
      // 浏览器阻止自动播放，显示启用对话框
      if (!soundEnabled.value) {
        showSoundEnableDialog.value = true
      }
    })
  }
  
  // 首次播放
  playOnce()
  
  // 监听播放结束，继续循环播放直到1分钟
  const handleEnded = () => {
    const elapsed = Date.now() - soundStartTime
    if (elapsed < duration) {
      setTimeout(() => {
        playOnce()
      }, 500) // 间隔500ms
    } else {
      // 1分钟结束，停止循环
      stopNotificationSound()
    }
  }
  
  notificationSound.value.addEventListener('ended', handleEnded)
  
  // 设置1分钟后自动停止的定时器（保险）
  soundLoopTimer = setTimeout(() => {
    stopNotificationSound()
  }, duration + 1000)
}

/**
 * 停止提示音
 */
const stopNotificationSound = () => {
  if (notificationSound.value) {
    notificationSound.value.pause()
    notificationSound.value.currentTime = 0
    // 移除所有ended监听器
    notificationSound.value.onended = null
  }
  if (soundLoopTimer) {
    clearTimeout(soundLoopTimer)
    soundLoopTimer = null
  }
  soundStartTime = null
}

/**
 * 检查新充值
 */
const checkNewDeposits = async () => {
  try {
    // 检查是否已登录
    const token = localStorage.getItem('admin_token')
    if (!token) {
      console.log('[Polling] 未登录，跳过充值检查')
      return
    }
    
    console.log('[Polling] 检查新充值, lastDepositId:', lastDepositId.value)
    const res = await request.get('/deposits/check-new', {
      params: { last_id: lastDepositId.value }
    })
    
    if (res.success && res.data) {
      const { newCount, lastId, latestDeposit: deposit } = res.data
      console.log('[Polling] 充值检查结果:', { newCount, lastId, currentLastId: lastDepositId.value })
      
      // 如果有新充值
      if (newCount > 0 && lastId > lastDepositId.value) {
        console.log('[Polling] 🔔 检测到新充值!')
        newDepositCount.value += newCount
        lastDepositId.value = lastId
        
        if (deposit) {
          // 总是播放声音（不管是否已确认）
          playNotificationSound()
          
          // 语音播报：你有一笔充值订单来啦
          speakNewDepositOrder().then(() => {
            // 语音播报完成后，播放详细信息
            setTimeout(() => {
              speakDepositComplete(
                deposit.wallet_address || deposit.user_id,
                deposit.amount,
                deposit.token || 'USDT'
              )
            }, 500)
          }).catch(err => {
            console.log('语音播报失败:', err)
          })
          
          // 显示通知
          ElNotification({
            title: '💰 新充值通知',
            message: `收到 ${deposit?.amount || ''} ${deposit?.token || 'USDT'} 充值`,
            type: 'success',
            duration: 5000,
            onClick: () => {
              router.push('/deposits')
            }
          })
          
          // Add to pending list and show popup only if not already confirmed
          const canPopup = addPendingDeposit(deposit)
          if (canPopup) {
            showDepositNotification.value = true
            console.log(`[Polling] 充值ID ${deposit.id} 已添加到待处理列表`)
          } else {
            console.log(`[Polling] 充值ID ${deposit.id} 已确认，不显示弹窗但仍播放声音`)
          }
        }
        
        // 触发刷新事件
        eventBus.emit(EVENTS.REFRESH_DEPOSITS)
      }
    }
  } catch (error) {
    console.error('检查新充值失败:', error)
  }
}

/**
 * 检查新提款
 */
const checkNewWithdrawals = async () => {
  try {
    // 检查是否已登录
    const token = localStorage.getItem('admin_token')
    if (!token) {
      console.log('[Polling] 未登录，跳过提款检查')
      return
    }
    
    console.log('[Polling] 检查新提款, lastWithdrawId:', lastWithdrawId.value)
    const res = await request.get('/withdrawals/check-new', {
      params: { last_id: lastWithdrawId.value }
    })
    
    if (res.success && res.data) {
      const { newCount, lastId, latestWithdraw: withdraw } = res.data
      console.log('[Polling] 提款检查结果:', { newCount, lastId, currentLastId: lastWithdrawId.value })
      
      // 如果有新提款
      if (newCount > 0 && lastId > lastWithdrawId.value) {
        console.log('[Polling] 🔔 检测到新提款!')
        newWithdrawCount.value += newCount
        lastWithdrawId.value = lastId
        
        if (withdraw) {
          // 总是播放声音（不管是否已确认）
          playNotificationSound()
          
          // 语音播报：用户ID提现金额
          speakWithdrawRequest(
            withdraw.wallet_address || withdraw.user_id,
            withdraw.amount,
            withdraw.token || 'USDT'
          ).catch(err => {
            console.log('语音播报失败:', err)
          })
          
          // 显示通知
          ElNotification({
            title: '💸 新提款申请',
            message: `用户申请提款 ${withdraw?.amount || ''} ${withdraw?.token || 'USDT'}`,
            type: 'warning',
            duration: 8000,
            onClick: () => {
              router.push('/withdrawals')
            }
          })
          
          // Add to pending list and show popup only if not already confirmed
          const canPopup = addPendingWithdraw(withdraw)
          if (canPopup) {
            showWithdrawNotification.value = true
            console.log(`[Polling] 提款ID ${withdraw.id} 已添加到待处理列表`)
          } else {
            console.log(`[Polling] 提款ID ${withdraw.id} 已确认，不显示弹窗但仍播放声音`)
          }
        }
        
        // 触发刷新事件
        eventBus.emit(EVENTS.REFRESH_WITHDRAWALS)
      }
    }
  } catch (error) {
    console.error('检查新提款失败:', error)
  }
}

// ==================== 攻击通知功能 ====================

/**
 * 检查新攻击
 */
const checkNewAttacks = async () => {
  try {
    // 检查是否已登录
    const token = localStorage.getItem('admin_token')
    if (!token) {
      return
    }
    
    // 检查新攻击日志
    const res = await request.get('/security/check-new-attacks', {
      params: { last_id: lastAttackId.value }
    })
    
    if (res.success && res.hasNew && res.data && res.data.length > 0) {
      console.log('[Security] 🚨 检测到新攻击!', res.summary)
      
      // 更新最后攻击ID
      lastAttackId.value = res.maxId
      
      // 更新攻击摘要
      latestAttackSummary.value = res.summary
      latestAttacks.value = res.data
      
      // 如果攻击数量超过3或者有高严重性攻击，播放警报
      const { count, mainType, highestSeverity } = res.summary
      if (count >= 3 || highestSeverity === 'critical' || highestSeverity === 'high') {
        // 播放攻击警报语音
        speakAttackAlert(count, mainType, highestSeverity).catch(err => {
          console.log('语音播报攻击警报失败:', err)
        })
        
        // 播放提示音
        playNotificationSound()
        
        // 显示通知
        ElNotification({
          title: '🚨 安全警报',
          message: `检测到 ${count} 次${getAttackTypeName(mainType)}攻击`,
          type: 'error',
          duration: 10000,
          onClick: () => {
            router.push('/ip-blacklist')
          }
        })
        
        // 显示攻击弹窗（仅对大量攻击或严重攻击）
        if (count >= 5 || highestSeverity === 'critical') {
          showAttackNotification.value = true
        }
      }
    }
    
    // 检查新封禁IP
    const blockRes = await request.get('/security/check-new-blocks', {
      params: { last_id: lastBlockId.value }
    })
    
    if (blockRes.success && blockRes.hasNew && blockRes.data && blockRes.data.length > 0) {
      console.log('[Security] 🔒 检测到新封禁IP!', blockRes.data.length)
      
      // 更新最后封禁ID
      lastBlockId.value = blockRes.maxId
      
      // 对每个新封禁的IP播放语音
      for (const block of blockRes.data.slice(0, 3)) { // 最多播报3个
        speakIPBlocked(block.ip_address).catch(err => {
          console.log('语音播报IP封禁失败:', err)
        })
        
        // 显示通知
        ElNotification({
          title: '🔒 IP已封禁',
          message: `IP ${block.ip_address} 已被自动封禁`,
          type: 'warning',
          duration: 5000
        })
        
        // 间隔播放
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  } catch (error) {
    console.error('检查新攻击失败:', error)
  }
}

/**
 * 获取攻击类型名称
 */
const getAttackTypeName = (type) => {
  const typeMap = {
    'sql_injection': 'SQL注入',
    'xss': 'XSS',
    'brute_force': '暴力破解',
    'rate_limit': '流量',
    'bot_detection': '机器人',
    'ddos': 'DDOS',
    'other': '恶意'
  }
  return typeMap[type] || '恶意'
}

/**
 * 获取严重程度样式
 */
const getSeverityType = (severity) => {
  const map = {
    'critical': 'danger',
    'high': 'danger',
    'medium': 'warning',
    'low': 'info'
  }
  return map[severity] || 'info'
}

/**
 * 初始化攻击检查ID
 */
const initLastAttackId = async () => {
  try {
    // 获取最新的攻击日志ID
    const res = await request.get('/security/attacks', { params: { limit: 1 } })
    if (res.success && res.data && res.data.length > 0) {
      lastAttackId.value = res.data[0].id || 0
    }
  } catch (error) {
    console.log('获取最后攻击ID失败（可忽略）:', error)
  }
  
  try {
    // 获取最新的封禁ID
    const blockRes = await request.get('/security/blocked-ips', { params: { limit: 1 } })
    if (blockRes.success && blockRes.data && blockRes.data.length > 0) {
      lastBlockId.value = blockRes.data[0].id || 0
    }
  } catch (error) {
    console.log('获取最后封禁ID失败（可忽略）:', error)
  }
}

/**
 * 开始攻击检查轮询
 */
const startAttackPolling = () => {
  const token = localStorage.getItem('admin_token')
  if (!token) return
  
  console.log('[Security] 启动攻击检查轮询...')
  
  // 延迟3秒后执行首次检查
  setTimeout(() => {
    checkNewAttacks()
  }, 3000)
  
  // 每10秒检查一次攻击
  attackPollingTimer = setInterval(() => {
    checkNewAttacks()
  }, 10000)
}

/**
 * 停止攻击检查轮询
 */
const stopAttackPolling = () => {
  if (attackPollingTimer) {
    clearInterval(attackPollingTimer)
    attackPollingTimer = null
  }
}

/**
 * 关闭攻击通知弹窗
 */
const handleAttackLater = () => {
  showAttackNotification.value = false
  stopNotificationSound()
}

/**
 * 查看攻击详情
 */
const viewAttackDetail = () => {
  showAttackNotification.value = false
  stopNotificationSound()
  router.push('/ip-blacklist')
}

/**
 * 跳转到充值记录
 */
const goToDeposits = () => {
  newDepositCount.value = 0
  router.push('/deposits')
}

/**
 * 稍后处理充值（用户点击时激活语音） - 不标记为已确认，刷新后继续显示
 */
const handleDepositLater = async () => {
  showDepositNotification.value = false
  stopNotificationSound()
  // 用户点击按钮，激活语音功能（下次通知时可以播放）
  await activateSpeech()
  // Note: 不调用 confirmDeposit，刷新页面后会继续显示弹窗
}

/**
 * 稍后处理提款（用户点击时激活语音） - 不标记为已确认，刷新后继续显示
 */
const handleWithdrawLater = async () => {
  showWithdrawNotification.value = false
  stopNotificationSound()
  // 用户点击按钮，激活语音功能
  await activateSpeech()
  // Note: 不调用 confirmWithdraw，刷新页面后会继续显示弹窗
}

/**
 * 查看充值详情（用户点击时激活语音并播放） - 标记为已确认，刷新后不再显示
 */
const viewDepositDetail = async () => {
  showDepositNotification.value = false
  newDepositCount.value = 0
  stopNotificationSound() // 停止提示音
  
  // Mark all pending deposits as confirmed (user has acknowledged)
  pendingDepositIds.value.forEach(id => {
    confirmDeposit(id)
  })
  
  // 用户点击按钮，激活语音功能并播放当前通知
  await activateSpeech()
  if (speechEnabled.value && latestDeposit.value) {
    // 播放充值完成语音
    speakDepositComplete(
      latestDeposit.value.wallet_address || latestDeposit.value.user_id,
      latestDeposit.value.amount,
      latestDeposit.value.token || 'USDT'
    )
  }
  
  router.push('/deposits')
}

/**
 * 查看提款详情（用户点击时激活语音并播放） - 标记为已确认，刷新后不再显示
 */
const viewWithdrawDetail = async () => {
  showWithdrawNotification.value = false
  newWithdrawCount.value = 0
  stopNotificationSound() // 停止提示音
  
  // Mark all pending withdraws as confirmed (user has acknowledged)
  pendingWithdrawIds.value.forEach(id => {
    confirmWithdraw(id)
  })
  
  // 用户点击按钮，激活语音功能并播放当前通知
  await activateSpeech()
  if (speechEnabled.value && latestWithdraw.value) {
    // 播放提款申请语音
    speakWithdrawRequest(
      latestWithdraw.value.wallet_address || latestWithdraw.value.user_id,
      latestWithdraw.value.amount,
      latestWithdraw.value.token || 'USDT'
    )
  }
  
  router.push('/withdrawals')
}

/**
 * 缩短地址
 */
const shortenAddress = (address) => {
  if (!address) return ''
  return `${address.slice(0, 10)}...${address.slice(-8)}`
}

/**
 * 格式化时间
 */
const formatTime = (time) => {
  if (!time) return ''
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

/**
 * 初始化最后充值ID
 */
const initLastDepositId = async () => {
  try {
    const res = await request.get('/deposits/latest-id')
    if (res.success && res.data) {
      lastDepositId.value = res.data.lastId || 0
    }
  } catch (error) {
    console.error('获取最后充值ID失败:', error)
  }
}

/**
 * 初始化最后提款ID
 */
const initLastWithdrawId = async () => {
  try {
    const res = await request.get('/withdrawals/latest-id')
    if (res.success && res.data) {
      lastWithdrawId.value = res.data.lastId || 0
    }
  } catch (error) {
    console.error('获取最后提款ID失败:', error)
  }
}

/**
 * 开始轮询检查新充值和提款
 * 优化：缩短轮询间隔提高实时性
 */
const startPolling = () => {
  // 检查是否已登录（是否有token）
  const token = localStorage.getItem('admin_token')
  if (!token) {
    console.log('[Polling] 未登录，跳过轮询启动')
    return
  }
  
  console.log('[Polling] 启动轮询检查...')
  
  // 立即执行一次检查（延迟1秒等待初始化完成）
  setTimeout(() => {
    console.log('[Polling] 执行首次检查')
    checkNewDeposits()
    checkNewWithdrawals()
  }, 1000)
  
  // 每5秒检查一次充值和提款（优化：从10秒缩短到5秒）
  pollingTimer = setInterval(() => {
    checkNewDeposits()
    checkNewWithdrawals()
  }, 5000)
}

/**
 * 停止轮询
 */
const stopPolling = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

// ==================== 生命周期 ====================

onMounted(() => {
  // 初始化响应式检测
  checkMobile()
  window.addEventListener('resize', checkMobile)
  
  // 检查声音启用状态
  checkSoundEnabled()
  
  // 初始化语音播报服务
  initSpeechService()
  
  // 加载待处理通知（刷新后继续显示）
  loadPendingNotifications()
  cleanOldConfirmedRecords()
  
  // 初始化充值和提款通知
  initLastDepositId()
  initLastWithdrawId()
  startPolling()
  
  // 初始化攻击检查
  initLastAttackId()
  startAttackPolling()
  
  // 获取管理员头像
  fetchAdminAvatar()
  // 监听头像更新事件（来自设置页面）
  window.addEventListener('avatar-updated', handleAvatarUpdate)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  window.removeEventListener('avatar-updated', handleAvatarUpdate)
  stopPolling()
  stopAttackPolling()
})

// 监听路由变化，访问充值页面时清除计数
watch(() => route.path, (newPath) => {
  if (newPath === '/deposits') {
    newDepositCount.value = 0
  }
})
</script>

<style lang="scss" scoped>
// 布局变量 - 响应式菜单尺寸规范
// 桌面端：不遮挡内容，保证可读性
$sidebar-width: 240px;              // 展开宽度：240px（适合中文菜单）
$sidebar-collapse-width: 64px;      // 折叠宽度：64px（仅显示图标）

// 移动端：全屏展示，易于点击
$sidebar-mobile-width: 75vw;        // 移动端宽度：75%视口（max 280px）
$sidebar-mobile-max-width: 280px;   // 移动端最大宽度

// 页面其他尺寸
$header-height: 56px;               // 顶部导航高度
$footer-height: 48px;               // 页脚高度

.admin-layout {
  display: flex;
  width: 100%;
  height: 100dvh;
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background: transparent; // 透明背景，让3D动画显示
}

// 全局 3D 背景 - 与登录页面一致
.layout-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  opacity: 1; // 完全显示3D背景
  pointer-events: none;
}

// 移动端遮罩层 - Safari优化
.mobile-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7); // 不使用blur时增加不透明度
  z-index: 998;
  // Safari性能优化：使用will-change代替backdrop-filter
  will-change: opacity;
  transform: translateZ(0); // 强制GPU加速
}

// 侧边栏 - Safari优化
.sidebar {
  width: $sidebar-width;
  height: 100%;
  // 使用纯色背景替代半透明+blur（Safari性能优化）
  background-color: var(--admin-sidebar-bg);
  // 仅在非Safari设备上使用毛玻璃效果
  @supports not (-webkit-touch-callout: none) {
    background-color: rgba(var(--admin-sidebar-bg-rgb), 0.85);
    backdrop-filter: blur(20px);
  }
  // 优化过渡动画：只动画必要的属性
  transition: width 0.2s ease-out, transform 0.2s ease-out;
  flex-shrink: 0;
  z-index: 999;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--admin-border-color);
  // GPU加速
  transform: translateZ(0);
  will-change: width, transform;
  
  &.is-collapse:not(.is-mobile) {
    width: $sidebar-collapse-width;
    
    .sidebar-logo {
      justify-content: center;
      padding: 0;
      
      .logo-icon {
        margin-right: 0;
      }
    }
    
    .sidebar-footer {
      display: none;
    }
  }
  
  // 移动端侧边栏样式
  &.is-mobile {
    position: fixed;
    left: 0;
    top: env(safe-area-inset-top, 0px);
    height: calc(100vh - env(safe-area-inset-top, 0px));
    height: calc(100dvh - env(safe-area-inset-top, 0px));
    width: $sidebar-mobile-width;
    max-width: $sidebar-mobile-max-width;
    transform: translateX(0);
    box-shadow: 4px 0 12px rgba(0, 0, 0, 0.2);
    background-color: rgba(var(--admin-sidebar-bg-rgb), 0.95);
    
    &.is-collapse {
      transform: translateX(-100%);
    }
  }
  
  // Logo
  .sidebar-logo {
    height: $header-height;
    display: flex;
    align-items: center;
    padding: 0 16px;
    background-color: rgba(0, 0, 0, 0.2);
    position: relative;
    
    .logo-icon {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #409EFF 0%, #66b1ff 100%);
      border-radius: 8px;
      margin-right: 12px;
      flex-shrink: 0;
      
      .el-icon {
        color: #ffffff;
      }
    }
    
    .logo-text {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      white-space: nowrap;
    }
    
    .close-btn {
      position: absolute;
      right: 16px;
      color: rgba(255, 255, 255, 0.65);
      cursor: pointer;
      transition: color 0.2s;
      
      &:hover {
        color: #ffffff;
      }
    }
  }
  
  // 菜单滚动容器
  .sidebar-menu-wrapper {
    flex: 1;
    overflow: hidden;
  }
  
  // 菜单样式 - 优化可点击区域
  :deep(.el-menu) {
    border-right: none;
    
    .el-menu-item,
    .el-sub-menu__title {
      height: 48px;
      line-height: 48px;
      margin: 4px 8px;
      border-radius: 8px;
      // Safari优化：只过渡背景色
      transition: background-color 0.15s ease-out;
      
      &:hover {
        background-color: var(--admin-sidebar-item-hover) !important;
      }
    }
    
    // 子菜单项 - 移动端增加点击区域
    .el-menu-item {
      @media (max-width: 768px) {
        height: 52px;
        line-height: 52px;
        font-size: 15px;
      }
    }
    
    .el-menu-item.is-active {
      background: linear-gradient(90deg, var(--admin-primary) 0%, var(--admin-primary-light) 100%) !important;
      color: #ffffff !important;
      font-weight: 500;
    }
    
    .el-sub-menu.is-opened > .el-sub-menu__title {
      color: var(--admin-sidebar-text-active);
    }
    
    // 菜单徽章
    .menu-badge {
      margin-left: 8px;
      
      :deep(.el-badge__content) {
        height: 16px;
        line-height: 16px;
        padding: 0 5px;
        font-size: 10px;
      }
    }
  }
  
  // 侧边栏底部
  .sidebar-footer {
    padding: 12px 16px;
    text-align: center;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    
    .version {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.35);
    }
  }
}

// 主内容区 - Safari优化
.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  background-color: transparent;
  z-index: 1;
  // GPU加速
  transform: translateZ(0);
}

// 顶部导航 - Safari优化
.navbar {
  height: calc(#{$header-height} + env(safe-area-inset-top, 0px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  padding-top: env(safe-area-inset-top, 0px);
  // 使用纯色背景替代半透明+blur
  background-color: var(--admin-header-bg);
  // 仅在非Safari设备上使用毛玻璃效果
  @supports not (-webkit-touch-callout: none) {
    background-color: rgba(var(--admin-header-bg-rgb), 0.85);
    backdrop-filter: blur(20px);
  }
  border-bottom: 1px solid var(--admin-border-color);
  flex-shrink: 0;
  z-index: 100;
  // GPU加速
  transform: translateZ(0);
  will-change: auto;
  
  .navbar-left {
    display: flex;
    align-items: center;
    gap: 16px;
    
    .collapse-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 8px;
      color: var(--admin-text-regular);
      // 优化：只过渡需要的属性
      transition: background-color 0.15s ease-out, color 0.15s ease-out;
      
      &:hover {
        background-color: var(--admin-bg-color);
        color: var(--admin-primary);
      }
    }
    
    .mobile-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--admin-text-primary);
    }
    
    :deep(.el-breadcrumb) {
      .el-breadcrumb__inner {
        color: var(--admin-text-secondary);
        
        &.is-link:hover {
          color: var(--admin-primary);
        }
      }
      
      .el-breadcrumb__item:last-child .el-breadcrumb__inner {
        color: var(--admin-text-primary);
        font-weight: 500;
      }
    }
  }
  
  .navbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    
    .notification-badge {
      :deep(.el-badge__content) {
        top: 4px;
        right: 4px;
      }
    }
    
    .navbar-icon {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 8px;
      color: var(--admin-text-regular);
      // Safari优化：只过渡需要的属性
      transition: background-color 0.15s ease-out, color 0.15s ease-out;
      
      &:hover {
        background-color: var(--admin-bg-color);
        color: var(--admin-primary);
      }
    }
    
    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 8px;
      // Safari优化：只过渡背景色
      transition: background-color 0.15s ease-out;
      
      &:hover {
        background-color: var(--admin-bg-color);
      }
      
      .user-avatar {
        background: linear-gradient(135deg, var(--admin-primary) 0%, var(--admin-primary-light) 100%);
      }
      
      .username {
        font-size: 14px;
        color: var(--admin-text-primary);
        font-weight: 500;
      }
      
      .dropdown-icon {
        color: var(--admin-text-secondary);
        font-size: 12px;
      }
    }
  }
}

// 内容区 - 透明背景让3D动画透出
.main-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: transparent;
}

// 页脚
.main-footer {
  height: $footer-height;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  background-color: transparent;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
  
  span {
    font-size: 12px;
    color: var(--admin-text-secondary);
  }
}

// 充值通知弹窗
.deposit-notification-dialog {
  :deep(.el-dialog__header) {
    display: none;
  }
  
  :deep(.el-dialog__body) {
    padding: 32px;
  }
}

.notification-content {
  text-align: center;
  
  .notification-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    
    &.success {
      background: linear-gradient(135deg, rgba(103, 194, 58, 0.2) 0%, rgba(103, 194, 58, 0.1) 100%);
      color: var(--admin-success);
    }
  }
  
  .notification-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--admin-text-primary);
    margin-bottom: 16px;
  }
  
  .notification-amount {
    font-size: 32px;
    font-weight: 700;
    color: var(--admin-success);
    margin-bottom: 12px;
    font-family: 'JetBrains Mono', monospace;
  }
  
  .notification-address {
    font-size: 14px;
    color: var(--admin-text-secondary);
    font-family: 'JetBrains Mono', monospace;
    background: var(--admin-bg-color);
    padding: 8px 16px;
    border-radius: 8px;
    display: inline-block;
    margin-bottom: 8px;
  }
  
  .notification-time {
    font-size: 12px;
    color: var(--admin-text-placeholder);
  }
  
  .notification-amount.withdraw {
    color: var(--admin-warning);
  }
}

// 声音启用对话框
.sound-enable-dialog {
  :deep(.el-dialog__header) {
    display: none;
  }
  
  :deep(.el-dialog__body) {
    padding: 32px;
  }
}

.sound-enable-content {
  text-align: center;
  
  .sound-icon {
    width: 100px;
    height: 100px;
    margin: 0 auto 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(64, 158, 255, 0.2) 0%, rgba(64, 158, 255, 0.1) 100%);
    color: var(--admin-primary);
    animation: pulse 2s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }
  
  h3 {
    font-size: 20px;
    font-weight: 600;
    color: var(--admin-text-primary);
    margin-bottom: 12px;
  }
  
  p {
    font-size: 14px;
    color: var(--admin-text-secondary);
    line-height: 1.6;
  }
}

// 提款通知样式
.withdraw-notification-dialog {
  :deep(.el-dialog__header) {
    display: none;
  }
  
  :deep(.el-dialog__body) {
    padding: 32px;
  }
  
  .notification-icon.warning {
    background: linear-gradient(135deg, rgba(230, 162, 60, 0.2) 0%, rgba(230, 162, 60, 0.1) 100%);
    color: var(--admin-warning);
  }
}

// 攻击警报通知样式
.attack-notification-dialog {
  :deep(.el-dialog__header) {
    display: none;
  }
  
  :deep(.el-dialog__body) {
    padding: 32px;
  }
  
  .notification-content.attack {
    .notification-icon.danger {
      width: 90px;
      height: 90px;
      background: linear-gradient(135deg, rgba(245, 108, 108, 0.3) 0%, rgba(245, 108, 108, 0.1) 100%);
      color: var(--admin-danger);
      animation: shake 0.5s ease-in-out infinite;
    }
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-3px); }
      75% { transform: translateX(3px); }
    }
    
    .attack-title {
      color: var(--admin-danger);
      font-size: 24px;
    }
    
    .attack-summary {
      font-size: 18px;
      color: var(--admin-text-primary);
      margin: 16px 0;
      
      strong {
        color: var(--admin-danger);
        font-size: 28px;
        font-weight: 700;
      }
    }
    
    .attack-details {
      margin: 16px 0;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    
    .attack-blocked {
      font-size: 14px;
      color: var(--admin-warning);
      margin: 12px 0;
    }
    
    .attack-list {
      margin-top: 16px;
      background: var(--admin-bg-color);
      border-radius: 8px;
      padding: 12px;
      max-height: 150px;
      overflow-y: auto;
      
      .attack-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        
        &:last-child {
          border-bottom: none;
        }
        
        .attack-ip {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: var(--admin-text-secondary);
        }
      }
    }
  }
}

// 过渡动画 - Safari优化
.slide-fade-enter-active {
  // 仅过渡 opacity 和 transform，避免 all
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
}

.slide-fade-leave-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(10px); // 减小位移距离
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// 响应式适配
@media (max-width: 768px) {
  .main-content {
    padding: 12px;
  }
  
  .navbar {
    padding: 0 12px;
    
    .navbar-right {
      gap: 4px;
    }
  }
  
  .main-footer {
    height: 40px;
  }
}
</style>
