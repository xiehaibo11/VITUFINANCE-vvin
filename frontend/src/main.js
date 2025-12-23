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

// Use plugins
app.use(pinia)
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
