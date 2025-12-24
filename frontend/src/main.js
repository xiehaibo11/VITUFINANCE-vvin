/**
 * VituFinance Frontend Application Entry Point
 * 
 * Features:
 * - Vue 3 with Pinia state management
 * - Element Plus UI components
 * - i18n internationalization
 * - Performance monitoring
 * - Global error handling and logging
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import router from './router'
import App from './App.vue'
import './styles/mobile.css' // Mobile responsive styles
import i18n, { detectAndSetLanguageByLocation } from './locales' // i18n configuration
import { initPerformanceMonitoring } from './utils/performance' // Performance monitoring
import { 
  createVueErrorHandler, 
  setupGlobalErrorHandlers,
  syncPendingErrors 
} from './utils/errorLogger' // Error logging

// Filter browser extension errors from console
const originalConsoleError = console.error
console.error = (...args) => {
  const errorString = args.join(' ')
  if (errorString.includes('chrome-extension://') || 
      errorString.includes('ERR_FILE_NOT_FOUND')) {
    return // Ignore browser extension errors
  }
  originalConsoleError.apply(console, args)
}

const app = createApp(App)
const pinia = createPinia()

// Initialize global error handlers
setupGlobalErrorHandlers()

// Initialize performance monitoring (development only)
initPerformanceMonitoring({
  enableConsoleLog: import.meta.env.DEV,
  enableAnalytics: false, // Disable backend reporting
  apiEndpoint: '/api/analytics/performance'
})

// Use plugins - Pinia MUST be used first
app.use(pinia)

// CRITICAL: Restore wallet state BEFORE mounting
// This ensures components see correct wallet state on mount
import { useWalletStore } from '@/stores/wallet'
const walletStore = useWalletStore()
walletStore.restoreFromStorage()
console.log('[App] Wallet restored:', walletStore.isConnected ? walletStore.walletAddress.slice(-8) : 'not connected')

// Pre-fetch balance if wallet connected (async, don't block mounting)
if (walletStore.isConnected && walletStore.walletAddress) {
  fetch(`/api/user/balance?wallet_address=${walletStore.walletAddress}&_t=${Date.now()}`, {
    cache: 'no-store'
  })
    .then(res => res.json())
    .then(data => {
      if (data.success && data.data) {
        walletStore.setUsdtBalance(data.data.usdt_balance)
        walletStore.setWldBalance(data.data.wld_balance)
        console.log('[App] Pre-fetched balance:', data.data.usdt_balance, 'USDT')
      }
    })
    .catch(err => console.error('[App] Pre-fetch balance error:', err))
}

app.use(router)
app.use(ElementPlus)
app.use(i18n)
app.use(createVueErrorHandler()) // Vue error handler

// Mount application
app.mount('#app')

// Sync pending errors when online
window.addEventListener('online', () => {
  console.log('[App] Back online, syncing pending errors...')
  syncPendingErrors()
})

// Log app startup
console.log('[App] VituFinance Frontend initialized successfully')

// Detect language by geolocation (async, runs after app loads)
detectAndSetLanguageByLocation().then(() => {
  console.log('[App] Geo-language detection completed')
})
