<template>
  <!-- Full screen maintenance overlay -->
  <div v-if="isVisible" class="maintenance-overlay">
    <!-- 3D Background Component -->
    <MaintenanceBackground3D />
    
    <!-- Content container -->
    <div class="maintenance-content">
      <!-- Animated icon -->
      <div class="icon-container">
        <div class="icon-glow"></div>
        <svg class="icon-main" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" 
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      
      <!-- Title -->
      <h1 class="maintenance-title">{{ title }}</h1>
      
      <!-- Message -->
      <p class="maintenance-message">{{ message }}</p>
      
      <!-- Timer display -->
      <div class="timer-container">
        <div class="timer-icon">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
            <path d="M12 6V12L16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <span class="timer-text">{{ estimatedTime }}</span>
      </div>
      
      <!-- Logo -->
      <div class="logo-container">
        <span class="logo-text">VituFinance</span>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * Maintenance Overlay Component
 * Displays full-screen maintenance notice when system is in maintenance mode
 * Supports multiple languages (13 languages)
 * Auto-detects user's country via IP geolocation API
 * Uses 3D background effect from admin login page
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MaintenanceBackground3D from './MaintenanceBackground3D.vue'

// Props
const props = defineProps({
  // Whether the overlay is visible
  isVisible: {
    type: Boolean,
    default: false
  },
  // Maintenance data from API
  maintenanceData: {
    type: Object,
    default: () => ({
      title: '',
      message: '',
      estimated_duration: 120,
      translations: {}
    })
  }
})

// i18n
const { locale } = useI18n()

// Supported languages list
const SUPPORTED_LANGUAGES = ['en', 'zh-tw', 'ar', 'de', 'es', 'fr', 'id', 'ms', 'pt', 'tr', 'uk', 'vi', 'zu']

// Country code to language mapping
// Maps ISO country codes to our supported language codes
const COUNTRY_TO_LANGUAGE = {
  // English speaking countries
  'US': 'en', 'GB': 'en', 'AU': 'en', 'CA': 'en', 'NZ': 'en', 'IE': 'en', 'SG': 'en', 'PH': 'en', 'IN': 'en',
  
  // Chinese speaking regions -> Traditional Chinese
  'TW': 'zh-tw', 'HK': 'zh-tw', 'MO': 'zh-tw', 'CN': 'zh-tw',
  
  // Arabic speaking countries
  'SA': 'ar', 'AE': 'ar', 'EG': 'ar', 'MA': 'ar', 'DZ': 'ar', 'TN': 'ar', 'LY': 'ar', 
  'JO': 'ar', 'LB': 'ar', 'KW': 'ar', 'QA': 'ar', 'BH': 'ar', 'OM': 'ar', 'YE': 'ar', 
  'IQ': 'ar', 'SY': 'ar', 'PS': 'ar', 'SD': 'ar',
  
  // German speaking countries
  'DE': 'de', 'AT': 'de', 'CH': 'de', 'LI': 'de', 'LU': 'de',
  
  // Spanish speaking countries
  'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es', 'CL': 'es', 'PE': 'es', 'VE': 'es', 
  'EC': 'es', 'GT': 'es', 'CU': 'es', 'BO': 'es', 'DO': 'es', 'HN': 'es', 'PY': 'es', 
  'SV': 'es', 'NI': 'es', 'CR': 'es', 'PA': 'es', 'UY': 'es', 'PR': 'es',
  
  // French speaking countries
  'FR': 'fr', 'BE': 'fr', 'MC': 'fr', 'SN': 'fr', 'CI': 'fr', 'ML': 'fr', 'NE': 'fr',
  'BF': 'fr', 'TG': 'fr', 'BJ': 'fr', 'GN': 'fr', 'CG': 'fr', 'GA': 'fr', 'TD': 'fr',
  'CF': 'fr', 'CM': 'fr', 'MG': 'fr', 'CD': 'fr', 'RW': 'fr', 'BI': 'fr', 'HT': 'fr',
  
  // Indonesian
  'ID': 'id',
  
  // Malay speaking countries
  'MY': 'ms', 'BN': 'ms',
  
  // Portuguese speaking countries
  'PT': 'pt', 'BR': 'pt', 'AO': 'pt', 'MZ': 'pt', 'GW': 'pt', 'TL': 'pt', 'CV': 'pt', 'ST': 'pt',
  
  // Turkish
  'TR': 'tr', 'CY': 'tr',
  
  // Ukrainian
  'UA': 'uk',
  
  // Vietnamese
  'VN': 'vi',
  
  // Zulu / South Africa
  'ZA': 'zu',
  
  // Additional country mappings (fallback to closest language)
  'JP': 'en',     // Japan -> English
  'KR': 'en',     // South Korea -> English
  'RU': 'uk',     // Russia -> Ukrainian (closest Slavic)
  'TH': 'en',     // Thailand -> English
  'PK': 'ar',     // Pakistan -> Arabic (Urdu is similar)
  'BD': 'en',     // Bangladesh -> English
  'NL': 'de',     // Netherlands -> German (closest)
  'PL': 'uk',     // Poland -> Ukrainian (closest Slavic)
  'IT': 'es',     // Italy -> Spanish (closest Romance)
  'RO': 'es',     // Romania -> Spanish (closest Romance)
  'CZ': 'de',     // Czech Republic -> German (closest)
  'SE': 'de',     // Sweden -> German (closest)
  'NO': 'de',     // Norway -> German (closest)
  'DK': 'de',     // Denmark -> German (closest)
  'FI': 'de',     // Finland -> German (closest)
  'GR': 'en',     // Greece -> English
  'IL': 'ar',     // Israel -> Arabic (closest)
  'IR': 'ar',     // Iran -> Arabic (closest)
  'AF': 'ar',     // Afghanistan -> Arabic (closest)
  'NG': 'en',     // Nigeria -> English
  'KE': 'en',     // Kenya -> English
  'GH': 'en',     // Ghana -> English
  'ET': 'en',     // Ethiopia -> English
  'TZ': 'en',     // Tanzania -> English
  'UG': 'en',     // Uganda -> English
  'ZW': 'en',     // Zimbabwe -> English
  'ZM': 'en',     // Zambia -> English
  'MM': 'en',     // Myanmar -> English
  'KH': 'en',     // Cambodia -> English
  'LA': 'en',     // Laos -> English
  'NP': 'en',     // Nepal -> English
  'LK': 'en',     // Sri Lanka -> English
}

// Browser language mapping (fallback)
const LANGUAGE_MAP = {
  'en': 'en', 'en-us': 'en', 'en-gb': 'en', 'en-au': 'en', 'en-ca': 'en',
  'zh': 'zh-tw', 'zh-cn': 'zh-tw', 'zh-tw': 'zh-tw', 'zh-hk': 'zh-tw',
  'ar': 'ar', 'ar-sa': 'ar', 'ar-ae': 'ar', 'ar-eg': 'ar',
  'de': 'de', 'de-de': 'de', 'de-at': 'de', 'de-ch': 'de',
  'es': 'es', 'es-es': 'es', 'es-mx': 'es', 'es-ar': 'es',
  'fr': 'fr', 'fr-fr': 'fr', 'fr-ca': 'fr', 'fr-be': 'fr',
  'id': 'id', 'id-id': 'id',
  'ms': 'ms', 'ms-my': 'ms',
  'pt': 'pt', 'pt-br': 'pt', 'pt-pt': 'pt',
  'tr': 'tr', 'tr-tr': 'tr',
  'uk': 'uk', 'uk-ua': 'uk',
  'vi': 'vi', 'vi-vn': 'vi',
  'zu': 'zu', 'zu-za': 'zu',
  'ja': 'en', 'ko': 'en', 'ru': 'uk', 'th': 'en', 'hi': 'en',
  'nl': 'de', 'pl': 'uk', 'it': 'es', 'ro': 'es',
}

// Detected language (from IP or browser)
const detectedLanguage = ref('en')
const detectedCountry = ref('')
const isDetecting = ref(true)

/**
 * Detect user's country via IP geolocation API
 * Uses multiple fallback APIs for reliability
 */
const detectCountryByIP = async () => {
  isDetecting.value = true
  
  // List of free IP geolocation APIs to try
  const APIs = [
    {
      url: 'https://ipapi.co/json/',
      getCountry: (data) => data.country_code
    },
    {
      url: 'https://ip-api.com/json/?fields=countryCode',
      getCountry: (data) => data.countryCode
    },
    {
      url: 'https://ipwho.is/',
      getCountry: (data) => data.country_code
    },
    {
      url: 'https://api.country.is/',
      getCountry: (data) => data.country
    }
  ]
  
  for (const api of APIs) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
      
      const response = await fetch(api.url, { 
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      })
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const data = await response.json()
        const countryCode = api.getCountry(data)
        
        if (countryCode && typeof countryCode === 'string') {
          const normalizedCountry = countryCode.toUpperCase()
          detectedCountry.value = normalizedCountry
          
          // Map country to language
          if (COUNTRY_TO_LANGUAGE[normalizedCountry]) {
            detectedLanguage.value = COUNTRY_TO_LANGUAGE[normalizedCountry]
            console.log(`[Maintenance] Detected country: ${normalizedCountry} -> Language: ${detectedLanguage.value}`)
            isDetecting.value = false
            return
          }
        }
      }
    } catch (error) {
      console.warn(`[Maintenance] IP API failed: ${api.url}`, error.message)
      // Continue to next API
    }
  }
  
  // If all IP APIs fail, fallback to browser language detection
  console.log('[Maintenance] IP detection failed, falling back to browser language')
  detectBrowserLanguage()
  isDetecting.value = false
}

/**
 * Fallback: Detect user's browser language
 */
const detectBrowserLanguage = () => {
  const browserLanguages = navigator.languages || [navigator.language || navigator.userLanguage || 'en']
  
  for (const lang of browserLanguages) {
    const normalizedLang = lang.toLowerCase()
    
    if (LANGUAGE_MAP[normalizedLang]) {
      detectedLanguage.value = LANGUAGE_MAP[normalizedLang]
      console.log(`[Maintenance] Detected browser language: ${lang} -> ${detectedLanguage.value}`)
      return
    }
    
    const baseLang = normalizedLang.split('-')[0]
    if (LANGUAGE_MAP[baseLang]) {
      detectedLanguage.value = LANGUAGE_MAP[baseLang]
      console.log(`[Maintenance] Detected browser base language: ${baseLang} -> ${detectedLanguage.value}`)
      return
    }
  }
  
  detectedLanguage.value = 'en'
  console.log('[Maintenance] Using default language: en')
}

// Get the best language to use
// Priority: 1. App locale (if set), 2. IP detected country, 3. Browser language
const currentLanguage = computed(() => {
  // If app locale is set and supported, use it
  if (locale.value && SUPPORTED_LANGUAGES.includes(locale.value)) {
    return locale.value
  }
  
  // Otherwise use detected language (from IP or browser)
  return detectedLanguage.value
})

// Computed: Get title based on current language
const title = computed(() => {
  const translations = props.maintenanceData?.translations || {}
  const lang = currentLanguage.value
  
  if (translations[lang]?.title) {
    return translations[lang].title
  }
  
  return props.maintenanceData?.title || getDefaultTitle(lang)
})

// Computed: Get message based on current language
const message = computed(() => {
  const translations = props.maintenanceData?.translations || {}
  const lang = currentLanguage.value
  
  if (translations[lang]?.message) {
    return translations[lang].message
  }
  
  return props.maintenanceData?.message || getDefaultMessage(lang)
})

// Computed: Get estimated time text
const estimatedTime = computed(() => {
  const duration = props.maintenanceData?.estimated_duration || 120
  const hours = Math.floor(duration / 60)
  const mins = duration % 60
  
  if (hours > 0 && mins > 0) {
    return `~${hours}h ${mins}min`
  } else if (hours > 0) {
    return `~${hours}h`
  } else {
    return `~${mins}min`
  }
})

// Get default title based on language
const getDefaultTitle = (lang) => {
  const defaultTitles = {
    'en': 'System Maintenance',
    'zh-tw': '系統維護中',
    'ar': 'صيانة النظام',
    'de': 'Systemwartung',
    'es': 'Mantenimiento del Sistema',
    'fr': 'Maintenance du Système',
    'id': 'Pemeliharaan Sistem',
    'ms': 'Penyelenggaraan Sistem',
    'pt': 'Manutenção do Sistema',
    'tr': 'Sistem Bakımı',
    'uk': 'Технічне обслуговування',
    'vi': 'Bảo trì Hệ thống',
    'zu': 'Ukulungiswa Kwesistimu'
  }
  return defaultTitles[lang] || defaultTitles['en']
}

// Get default message based on language
const getDefaultMessage = (lang) => {
  const defaultMessages = {
    'en': 'The system is currently under maintenance. Please try again in 2 hours. Thank you for your patience.',
    'zh-tw': '系統正在維護中，請2個小時後再次訪問。感謝您的耐心等待。',
    'ar': 'النظام قيد الصيانة حاليًا. يرجى المحاولة مرة أخرى بعد ساعتين. شكرًا لصبركم.',
    'de': 'Das System befindet sich derzeit in Wartung. Bitte versuchen Sie es in 2 Stunden erneut. Vielen Dank für Ihre Geduld.',
    'es': 'El sistema está actualmente en mantenimiento. Por favor, inténtelo de nuevo en 2 horas. Gracias por su paciencia.',
    'fr': 'Le système est actuellement en maintenance. Veuillez réessayer dans 2 heures. Merci de votre patience.',
    'id': 'Sistem sedang dalam pemeliharaan. Silakan coba lagi dalam 2 jam. Terima kasih atas kesabaran Anda.',
    'ms': 'Sistem sedang dalam penyelenggaraan. Sila cuba lagi dalam 2 jam. Terima kasih atas kesabaran anda.',
    'pt': 'O sistema está atualmente em manutenção. Por favor, tente novamente em 2 horas. Obrigado pela sua paciência.',
    'tr': 'Sistem şu anda bakımdadır. Lütfen 2 saat sonra tekrar deneyin. Sabrınız için teşekkür ederiz.',
    'uk': 'Система наразі на технічному обслуговуванні. Будь ласка, спробуйте через 2 години. Дякуємо за терпіння.',
    'vi': 'Hệ thống đang được bảo trì. Vui lòng thử lại sau 2 giờ. Cảm ơn sự kiên nhẫn của bạn.',
    'zu': 'Isistimu ikhona kulungiswa. Sicela uzame futhi emva kwamahora angu-2. Siyabonga ngokubekezela kwakho.'
  }
  return defaultMessages[lang] || defaultMessages['en']
}

// Detect language when component becomes visible
watch(() => props.isVisible, (visible) => {
  if (visible && isDetecting.value) {
    detectCountryByIP()
  }
}, { immediate: true })

// Also detect on mount
onMounted(() => {
  if (props.isVisible) {
    detectCountryByIP()
  }
})
</script>

<style scoped>
.maintenance-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #000;
}

/* Content */
.maintenance-content {
  position: relative;
  z-index: 10;
  text-align: center;
  padding: 48px;
  max-width: 520px;
  width: 90%;
  background: rgba(13, 17, 23, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(40px);
}

/* Icon */
.icon-container {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto 32px;
}

.icon-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 140px;
  height: 140px;
  background: radial-gradient(circle, rgba(243, 156, 18, 0.4) 0%, transparent 70%);
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
  50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.4; }
}

.icon-main {
  position: relative;
  width: 80px;
  height: 80px;
  color: #f39c12;
  margin: 20px;
  animation: iconBounce 3s ease-in-out infinite;
}

@keyframes iconBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

/* Title */
.maintenance-title {
  font-size: 32px;
  font-weight: 700;
  color: #f0f6fc;
  margin: 0 0 20px 0;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  line-height: 1.3;
  letter-spacing: -0.5px;
}

/* Message */
.maintenance-message {
  font-size: 17px;
  color: #8b949e;
  line-height: 1.8;
  margin: 0 0 32px 0;
}

/* Timer */
.timer-container {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 16px 28px;
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(10px);
  border-radius: 50px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 32px;
}

.timer-icon {
  width: 24px;
  height: 24px;
  color: #8b949e;
}

.timer-icon svg {
  width: 100%;
  height: 100%;
}

.timer-text {
  font-size: 16px;
  color: #f0f6fc;
  font-weight: 500;
}

/* Logo */
.logo-container {
  margin-top: 8px;
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(90deg, #58a6ff 0%, #a371f7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 2px;
}

/* Responsive */
@media (max-width: 480px) {
  .maintenance-content {
    padding: 32px 24px;
    border-radius: 20px;
  }
  
  .icon-container {
    width: 100px;
    height: 100px;
    margin-bottom: 24px;
  }
  
  .icon-glow {
    width: 120px;
    height: 120px;
  }
  
  .icon-main {
    width: 60px;
    height: 60px;
    margin: 20px;
  }
  
  .maintenance-title {
    font-size: 24px;
    margin-bottom: 16px;
  }
  
  .maintenance-message {
    font-size: 15px;
    margin-bottom: 24px;
  }
  
  .timer-container {
    padding: 12px 20px;
    margin-bottom: 24px;
  }
  
  .timer-text {
    font-size: 14px;
  }
  
  .logo-text {
    font-size: 18px;
  }
}
</style>
