<template>
  <div id="app">
    <el-config-provider :locale="elLocale">
      <!-- Maintenance Overlay - shows when system is in maintenance mode -->
      <MaintenanceOverlay 
        :isVisible="isMaintenanceMode" 
        :maintenanceData="maintenanceData" 
      />
      
      <!-- Normal content - hidden during maintenance -->
      <template v-if="!isMaintenanceMode">
      <Navigation v-if="showNavigation" />
      <router-view />
      </template>
    </el-config-provider>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElConfigProvider } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import Navigation from './components/Navigation.vue'
import MaintenanceOverlay from './components/MaintenanceOverlay.vue'
import { useWalletStore } from '@/stores/wallet'
import { ensureReferralBound } from '@/utils/wallet'
import { checkMaintenanceStatus } from '@/api/maintenance'

const route = useRoute()
const walletStore = useWalletStore()

// ==================== Maintenance Mode ====================

// Maintenance state
const isMaintenanceMode = ref(false)
const maintenanceData = ref({
  is_enabled: false,
  title: '',
  message: '',
  estimated_duration: 120,
  translations: {}
})

// Maintenance check interval (every 60 seconds)
let maintenanceCheckInterval = null

/**
 * Check if system is in maintenance mode
 * Called on mount and periodically
 */
const checkMaintenance = async () => {
  try {
    const result = await checkMaintenanceStatus()
    if (result.success && result.data) {
      isMaintenanceMode.value = result.data.is_enabled === true
      maintenanceData.value = result.data
      
      if (result.data.is_enabled) {
        console.log('[App] System is in maintenance mode')
      }
    }
  } catch (error) {
    console.error('[App] Failed to check maintenance status:', error)
    // Don't block users if maintenance check fails
    isMaintenanceMode.value = false
  }
}

/**
 * Start periodic maintenance check
 */
const startMaintenanceCheck = () => {
  // Initial check
  checkMaintenance()
  
  // Check every 60 seconds
  maintenanceCheckInterval = setInterval(() => {
    checkMaintenance()
  }, 60000)
}

/**
 * Stop maintenance check
 */
const stopMaintenanceCheck = () => {
  if (maintenanceCheckInterval) {
    clearInterval(maintenanceCheckInterval)
    maintenanceCheckInterval = null
  }
}

// 需要隐藏导航栏的路由
const hiddenNavRoutes = ['/robot/caption']

// 控制是否显示导航栏
const showNavigation = computed(() => {
  return !hiddenNavRoutes.includes(route.path)
})

/**
 * 处理推荐码参数
 * 当用户通过邀请链接访问时，保存推荐码到 localStorage 并尝试绑定
 */
const handleReferralCode = () => {
  const refCode = route.query.ref
  if (refCode && typeof refCode === 'string') {
    // 保存推荐码到 localStorage，供后续使用
    localStorage.setItem('vitu_referral_code', refCode)
    console.log('[App] Referral code saved:', refCode)
    
    // 如果用户已连接钱包，立即尝试绑定
    if (walletStore.isConnected) {
      ensureReferralBound()
    }
  }
}

// 页面加载时检查推荐码和维护状态
onMounted(async () => {
  // 初始化钱包连接（支持 ETH/BSC 和 TRON）
  try {
    const { initWallet } = await import('@/utils/wallet')
    await initWallet()
    console.log('[App] Wallet initialized')
    
    // 如果钱包已连接，尝试进行签名认证
    if (walletStore.isConnected && walletStore.walletAddress) {
      console.log('[App] Wallet connected, checking signature auth...')
      try {
        const { ensureTokenPocketSignatureAuth } = await import('@/utils/signatureAuth')
        const result = await ensureTokenPocketSignatureAuth()
        if (result.success) {
          console.log('[App] ✅ Signature auth completed')
        } else if (result.skipped) {
          console.log('[App] Signature auth skipped:', result.reason)
        } else {
          console.warn('[App] Signature auth failed:', result.error)
        }
      } catch (error) {
        console.error('[App] Signature auth error:', error)
      }
    }
  } catch (error) {
    console.error('[App] Wallet initialization error:', error)
  }
  
  handleReferralCode()
  
  // 如果有保存的推荐码且钱包已连接，尝试绑定
  const savedRefCode = localStorage.getItem('vitu_referral_code')
  if (savedRefCode && walletStore.isConnected) {
    ensureReferralBound()
  }
  
  // Start maintenance status check
  startMaintenanceCheck()
})

// Cleanup on unmount
onUnmounted(() => {
  stopMaintenanceCheck()
})

// 监听路由变化，处理推荐码
watch(() => route.query.ref, (newRef) => {
  if (newRef) {
    handleReferralCode()
  }
})

// 监听钱包连接状态，连接后立即尝试绑定推荐关系
watch(() => walletStore.isConnected, (connected) => {
  if (connected) {
    ensureReferralBound()
  }
})

// 导入 Element Plus 语言包
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import en from 'element-plus/dist/locale/en.mjs'
import ar from 'element-plus/dist/locale/ar.mjs'
import id from 'element-plus/dist/locale/id.mjs'
import vi from 'element-plus/dist/locale/vi.mjs'
import fr from 'element-plus/dist/locale/fr.mjs'
import tr from 'element-plus/dist/locale/tr.mjs'
import es from 'element-plus/dist/locale/es.mjs'
import pt from 'element-plus/dist/locale/pt.mjs'
import de from 'element-plus/dist/locale/de.mjs'
import uk from 'element-plus/dist/locale/uk.mjs'

const { locale } = useI18n()

// 根据当前语言动态选择 Element Plus 语言
const elLocale = computed(() => {
  const localeMap = {
    'en': en,
    'ar': ar,
    'id': id,
    'vi': vi,
    'fr': fr,
    'tr': tr,
    'es': es,
    'pt': pt,
    'de': de,
    'uk': uk,
    'zh-tw': zhCn  // 繁体中文使用简体中文包
  }
  return localeMap[locale.value] || en
})
</script>

<style>
/* 颜色变量定义 */
:root {
  --UI-BG: #fff;
  --UI-BG-0: #1a1a1a; /* 主背景色 - 深灰黑色 */
  --UI-BG-1: #2a2a2a;
  --UI-BG-2: #242424;
  --UI-BG-3: #2e2e2e;
  --UI-BG-4: #4c4c4c;
  --UI-BG-5: #fff;
  --UI-CARD-BG: #2A2A30; /* 卡片背景色 - 深灰色 */
  --UI-FG: #fff;
  --UI-FG-0: rgba(255, 255, 255, 0.9); /* 主文字色 - 白色 */
  --UI-FG-HALF: rgba(255, 255, 255, 0.9);
  --UI-FG-1: rgba(255, 255, 255, 0.6);
  --UI-FG-2: rgba(255, 255, 255, 0.4);
  --UI-FG-3: rgba(255, 255, 255, 0.2);
  /* 主字体变量 - 使用 DM Sans 现代无衬线字体 */
  --font-primary: 'DM Sans', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  /* 全局禁止文本选择和复制 */
  -webkit-user-select: none;  /* Safari */
  -moz-user-select: none;     /* Firefox */
  -ms-user-select: none;      /* IE/Edge */
  user-select: none;          /* 标准语法 */
  /* 禁止长按弹出菜单（移动端） */
  -webkit-touch-callout: none;
}

html {
  /* Mobile adaptation: prevent user scaling */
  -webkit-text-size-adjust: 100%;
  -ms-text-size-adjust: 100%;
  /* Remove mobile tap highlight */
  -webkit-tap-highlight-color: transparent;
  /* Fix iOS Safari height issues */
  height: 100%;
  /* Prevent overscroll bounce that can affect fixed elements */
  overscroll-behavior: none;
}

html, body {
  /* Prevent horizontal overflow without breaking fixed positioning */
  max-width: 100vw;
}

body {
  /* Use modern font - DM Sans */
  font-family: var(--font-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  /* Background and text colors */
  background-color: var(--UI-BG-0);
  color: var(--UI-FG-0);
  /* Disable text selection and copy */
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  /* IMPORTANT: Do NOT use overflow-x: hidden or -webkit-overflow-scrolling: touch here */
  /* These properties break position: fixed on iOS Safari */
}

/* 隐藏滚动条但保持滚动功能 - 全局应用 */
* {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 和 Edge */
}

*::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Edge */
}

html,
body {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 和 Edge */
}

html::-webkit-scrollbar,
body::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Edge */
}

/* 移动端按钮点击优化 */
button, a {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

/* 移动端输入框优化 */
input, textarea, select {
  -webkit-appearance: none;
  appearance: none;
  /* 输入框允许选择和复制 */
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
  user-select: text !important;
  -webkit-touch-callout: default !important;
}

/* 可编辑内容允许选择 */
[contenteditable="true"] {
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
  user-select: text !important;
  -webkit-touch-callout: default !important;
}

#app {
  min-height: 100vh;
  width: 100%;
  max-width: 100vw;
  /* Note: overflow-x: hidden on #app can break position: fixed on iOS Safari */
  /* Moving this to body instead to avoid containing block issues */
}

/* iOS Safari fixed position support */
@supports (-webkit-touch-callout: none) {
  #app {
    /* Ensure no transform or will-change on parent that could break fixed positioning */
    transform: none !important;
    -webkit-transform: none !important;
  }
}

/* 移动端基础字体大小 */
@media (max-width: 768px) {
  html {
    font-size: 14px;
  }
}

@media (max-width: 480px) {
  html {
    font-size: 13px;
  }
}
</style>