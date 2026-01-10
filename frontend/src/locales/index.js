/**
 * i18n Internationalization Configuration
 * 
 * Features:
 * - Multi-language switching support
 * - Auto-detect user browser language
 * - IP-based geolocation language detection
 * - URL parameter has highest priority
 * - Language settings persisted to localStorage
 */

import { createI18n } from 'vue-i18n'
import en from './en.json'
import ar from './ar.json'
import id from './id.json'
import vi from './vi.json'
import fr from './fr.json'
import tr from './tr.json'
import zu from './zu.json'
import es from './es.json'
import pt from './pt.json'
import de from './de.json'
import ms from './ms.json'
import uk from './uk.json'
import zhTw from './zh-tw.json'
import it from './it.json'  // Italian language

// All supported languages
const messages = {
  en,
  ar,
  id,
  vi,
  fr,
  tr,
  zu,
  es,
  pt,
  de,
  ms,
  uk,
  it,  // Italian
  'zh-tw': zhTw
}

// Supported locale codes list
const supportedLocales = Object.keys(messages)

// Country code to language mapping
const countryToLanguage = {
  // Arabic speaking countries
  'SA': 'ar', 'AE': 'ar', 'EG': 'ar', 'IQ': 'ar', 'JO': 'ar', 'KW': 'ar', 
  'LB': 'ar', 'LY': 'ar', 'MA': 'ar', 'OM': 'ar', 'QA': 'ar', 'SY': 'ar',
  'TN': 'ar', 'YE': 'ar', 'BH': 'ar', 'DZ': 'ar', 'SD': 'ar',
  
  // Indonesian
  'ID': 'id',
  
  // Vietnamese
  'VN': 'vi',
  
  // French speaking countries
  'FR': 'fr', 'BE': 'fr', 'CH': 'fr', 'CA': 'fr', 'LU': 'fr', 'MC': 'fr',
  'SN': 'fr', 'CI': 'fr', 'ML': 'fr', 'BF': 'fr', 'NE': 'fr', 'TG': 'fr',
  'BJ': 'fr', 'MG': 'fr', 'CM': 'fr', 'GA': 'fr', 'CG': 'fr', 'CD': 'fr',
  
  // Turkish
  'TR': 'tr', 'CY': 'tr',
  
  // Zulu (South Africa)
  'ZA': 'zu',
  
  // Spanish speaking countries
  'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es', 'PE': 'es', 'VE': 'es',
  'CL': 'es', 'EC': 'es', 'GT': 'es', 'CU': 'es', 'BO': 'es', 'DO': 'es',
  'HN': 'es', 'PY': 'es', 'SV': 'es', 'NI': 'es', 'CR': 'es', 'PA': 'es',
  'UY': 'es', 'PR': 'es', 'GQ': 'es',
  
  // Portuguese speaking countries
  'PT': 'pt', 'BR': 'pt', 'AO': 'pt', 'MZ': 'pt', 'GW': 'pt', 'CV': 'pt',
  'ST': 'pt', 'TL': 'pt',
  
  // German speaking countries
  'DE': 'de', 'AT': 'de', 'LI': 'de',
  
  // Malay speaking countries
  'MY': 'ms', 'BN': 'ms', 'SG': 'ms',
  
  // Ukrainian
  'UA': 'uk',
  
  // Italian speaking countries (Note: CH/Switzerland already mapped to 'fr' above, Italy is primary)
  'IT': 'it', 'SM': 'it', 'VA': 'it',
  
  // Traditional Chinese
  'TW': 'zh-tw', 'HK': 'zh-tw', 'MO': 'zh-tw'
}

/**
 * Detect language from browser settings
 * @returns {string|null} Language code or null if not detected
 */
function detectBrowserLanguage() {
  const browserLanguages = navigator.languages || [navigator.language]
  
  for (const lang of browserLanguages) {
    // Process language code, e.g., 'zh-TW' -> 'zh-tw', 'en-US' -> 'en'
    const normalizedLang = lang.toLowerCase()
    
    // Exact match
    if (supportedLocales.includes(normalizedLang)) {
      return normalizedLang
    }
    
    // Match primary language code (e.g., 'zh-TW' matches 'zh-tw')
    const primaryLang = normalizedLang.split('-')[0]
    const matchedLocale = supportedLocales.find(locale => 
      locale === primaryLang || locale.startsWith(primaryLang + '-')
    )
    
    if (matchedLocale) {
      return matchedLocale
    }
  }
  
  return null
}

/**
 * Detect user's preferred language
 * Priority: URL param > localStorage > browser language > default (en)
 */
function detectUserLanguage() {
  // 1. Check URL parameter
  const urlParams = new URLSearchParams(window.location.search)
  const langParam = urlParams.get('lang')
  if (langParam && supportedLocales.includes(langParam)) {
    localStorage.setItem('language', langParam)
    return langParam
  }

  // 2. Check localStorage saved language
  const savedLanguage = localStorage.getItem('language')
  if (savedLanguage && supportedLocales.includes(savedLanguage)) {
    return savedLanguage
  }

  // 3. Detect browser language
  const browserLang = detectBrowserLanguage()
  if (browserLang) {
    return browserLang
  }

  // 4. Default language
  return 'en'
}

/**
 * Fetch user location from IP and update language if needed
 * This runs async after initial load to potentially improve UX
 */
export async function detectAndSetLanguageByLocation() {
  // Skip if user already manually selected a language
  if (localStorage.getItem('language')) {
    console.log('[i18n] User has manually selected language, skipping geo-detection')
    return
  }

  try {
    // Use free IP geolocation API
    const response = await fetch('https://ipapi.co/json/', {
      timeout: 3000
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch location')
    }
    
    const data = await response.json()
    const countryCode = data.country_code
    
    console.log('[i18n] Detected country:', countryCode)
    
    // Map country to language
    const suggestedLang = countryToLanguage[countryCode]
    
    if (suggestedLang && supportedLocales.includes(suggestedLang)) {
      // Check if current language is different and not manually set
      if (i18n.global.locale.value !== suggestedLang) {
        console.log('[i18n] Auto-switching language to:', suggestedLang)
        setLocale(suggestedLang, true) // true = auto-detected, don't persist
      }
    }
  } catch (error) {
    console.warn('[i18n] Geo-detection failed:', error.message)
    // Silently fail, user keeps browser-detected or default language
  }
}

// 检测并获取初始语言
const initialLocale = detectUserLanguage()

// 创建 i18n 实例
const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages,
  // 缺失翻译时的处理
  missing: (locale, key) => {
    console.warn(`[i18n] Missing translation for key: ${key} in locale: ${locale}`)
  },
  // 允许在模板中使用 HTML 标签
  warnHtmlInMessage: 'off'
})

/**
 * Switch language
 * @param {string} locale - Language code
 * @param {boolean} autoDetected - Whether language was auto-detected (don't persist if true)
 */
export function setLocale(locale, autoDetected = false) {
  if (supportedLocales.includes(locale)) {
    i18n.global.locale.value = locale
    
    // Only persist to localStorage if manually selected (not auto-detected)
    if (!autoDetected) {
      localStorage.setItem('language', locale)
    }
    
    // Update HTML lang attribute
    document.documentElement.lang = locale
    
    // Update document direction for RTL languages
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
    
    return true
  }
  return false
}

/**
 * Get current language
 * @returns {string} Current language code
 */
export function getLocale() {
  return i18n.global.locale.value
}

/**
 * Get list of supported languages
 * @returns {string[]} Array of supported language codes
 */
export function getSupportedLocales() {
  return supportedLocales
}

/**
 * Get language display names for UI
 * @returns {Object[]} Array of {code, name} objects
 */
export function getLanguageOptions() {
  return [
    { code: 'en', name: 'English' },
    { code: 'ar', name: 'العربية' },
    { code: 'de', name: 'Deutsch' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'it', name: 'Italiano' },  // Italian
    { code: 'ms', name: 'Bahasa Melayu' },
    { code: 'pt', name: 'Português' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'uk', name: 'Українська' },
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'zh-tw', name: '繁體中文' },
    { code: 'zu', name: 'isiZulu' }
  ]
}

export default i18n
