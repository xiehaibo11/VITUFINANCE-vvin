<template>
  <div class="maintenance-page">
    <!-- Page Header -->
    <div class="page-header">
      <h2 class="page-title">
        <el-icon><Setting /></el-icon>
        維護公告管理
      </h2>
      <p class="page-desc">管理系統維護模式，啟用後前端用戶將無法訪問系統</p>
    </div>

    <!-- Maintenance Status Card -->
    <el-card class="status-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span class="header-title">
            <el-icon><Bell /></el-icon>
            維護狀態
          </span>
          <el-tag :type="maintenanceEnabled ? 'danger' : 'success'" size="large">
            {{ maintenanceEnabled ? '維護中' : '正常運行' }}
          </el-tag>
        </div>
      </template>

      <div class="status-content">
        <div class="toggle-section">
          <div class="toggle-info">
            <h4>系統維護模式</h4>
            <p>啟用後，前端用戶將看到維護公告，無法訪問任何頁面</p>
          </div>
          <el-switch
            v-model="maintenanceEnabled"
            :loading="toggleLoading"
            size="large"
            active-text="啟用"
            inactive-text="關閉"
            @change="handleToggle"
          />
        </div>

        <el-divider />

        <div class="time-info" v-if="maintenanceData.start_time">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="開始時間">
              {{ formatTime(maintenanceData.start_time) }}
            </el-descriptions-item>
            <el-descriptions-item label="預計結束時間">
              {{ formatTime(maintenanceData.end_time) }}
            </el-descriptions-item>
            <el-descriptions-item label="最後更新人">
              {{ maintenanceData.updated_by || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="預計時長">
              {{ maintenanceData.estimated_duration }} 分鐘
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </el-card>

    <!-- Settings Card -->
    <el-card class="settings-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span class="header-title">
            <el-icon><Edit /></el-icon>
            維護公告設置
          </span>
        </div>
      </template>

      <el-form :model="formData" label-position="top" class="settings-form">
        <el-form-item label="預計維護時長（分鐘）">
          <el-input-number
            v-model="formData.estimated_duration"
            :min="10"
            :max="1440"
            :step="30"
          />
        </el-form-item>

        <el-form-item label="默認標題（英文）">
          <el-input v-model="formData.title" placeholder="System Maintenance" />
        </el-form-item>

        <el-form-item label="默認公告內容（英文）">
          <el-input
            v-model="formData.message"
            type="textarea"
            :rows="3"
            placeholder="Enter maintenance message..."
          />
        </el-form-item>

        <el-button type="primary" @click="saveSettings" :loading="saving">
          <el-icon><Check /></el-icon>
          保存設置
        </el-button>
      </el-form>
    </el-card>

    <!-- Translations Card -->
    <el-card class="translations-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span class="header-title">
            <el-icon><Message /></el-icon>
            多語言公告內容
          </span>
          <el-button type="primary" text @click="expandAll = !expandAll">
            {{ expandAll ? '收起全部' : '展開全部' }}
          </el-button>
        </div>
      </template>

      <el-collapse v-model="activeLanguages">
        <el-collapse-item
          v-for="lang in supportedLanguages"
          :key="lang.code"
          :name="lang.code"
        >
          <template #title>
            <div class="lang-title">
              <span class="lang-flag">{{ lang.flag }}</span>
              <span class="lang-name">{{ lang.name }}</span>
              <el-tag v-if="getTranslation(lang.code)" type="success" size="small">
                已設置
              </el-tag>
            </div>
          </template>

          <div class="translation-form">
            <el-form label-position="top">
              <el-form-item label="標題">
                <el-input
                  v-model="translationsMap[lang.code].title"
                  :placeholder="lang.titlePlaceholder"
                />
              </el-form-item>
              <el-form-item label="公告內容">
                <el-input
                  v-model="translationsMap[lang.code].message"
                  type="textarea"
                  :rows="3"
                  :placeholder="lang.messagePlaceholder"
                />
              </el-form-item>
              <el-button
                type="primary"
                size="small"
                @click="saveTranslation(lang.code)"
                :loading="savingLang === lang.code"
              >
                保存此語言
              </el-button>
            </el-form>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <!-- Preview Card -->
    <el-card class="preview-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span class="header-title">
            <el-icon><View /></el-icon>
            預覽效果
          </span>
          <el-select v-model="previewLang" placeholder="選擇語言" style="width: 150px">
            <el-option
              v-for="lang in supportedLanguages"
              :key="lang.code"
              :label="lang.name"
              :value="lang.code"
            />
          </el-select>
        </div>
      </template>

      <div class="preview-container">
        <div class="preview-modal">
          <div class="preview-icon">
            <el-icon :size="60"><Warning /></el-icon>
          </div>
          <h3 class="preview-title">{{ previewTitle }}</h3>
          <p class="preview-message">{{ previewMessage }}</p>
          <div class="preview-timer">
            <el-icon><Clock /></el-icon>
            <span>{{ formData.estimated_duration }} min</span>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
/**
 * Maintenance Management Page
 * Manage system maintenance mode and announcements
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Setting,
  Bell,
  Edit,
  Message,
  View,
  Warning,
  Clock,
  Check
} from '@element-plus/icons-vue'
import request from '@/api'
import dayjs from 'dayjs'

// ==================== State ====================

const loading = ref(false)
const toggleLoading = ref(false)
const saving = ref(false)
const savingLang = ref('')
const maintenanceEnabled = ref(false)
const activeLanguages = ref([])
const expandAll = ref(false)
const previewLang = ref('en')

// Maintenance data from server
const maintenanceData = ref({
  is_enabled: false,
  title: '',
  message: '',
  estimated_duration: 120,
  start_time: null,
  end_time: null,
  updated_by: '',
  translations: []
})

// Form data for settings
const formData = reactive({
  title: 'System Maintenance',
  message: 'The system is currently under maintenance. Please try again in 2 hours.',
  estimated_duration: 120
})

// Supported languages with placeholders
const supportedLanguages = [
  { code: 'en', name: 'English', flag: '🇺🇸', titlePlaceholder: 'System Maintenance', messagePlaceholder: 'The system is under maintenance...' },
  { code: 'zh-tw', name: '繁體中文', flag: '🇹🇼', titlePlaceholder: '系統維護中', messagePlaceholder: '系統正在維護中...' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', titlePlaceholder: 'صيانة النظام', messagePlaceholder: 'النظام قيد الصيانة...' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', titlePlaceholder: 'Systemwartung', messagePlaceholder: 'Das System ist in Wartung...' },
  { code: 'es', name: 'Español', flag: '🇪🇸', titlePlaceholder: 'Mantenimiento', messagePlaceholder: 'Sistema en mantenimiento...' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', titlePlaceholder: 'Maintenance', messagePlaceholder: 'Système en maintenance...' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩', titlePlaceholder: 'Pemeliharaan', messagePlaceholder: 'Sistem sedang dipelihara...' },
  { code: 'ms', name: 'Bahasa Melayu', flag: '🇲🇾', titlePlaceholder: 'Penyelenggaraan', messagePlaceholder: 'Sistem dalam penyelenggaraan...' },
  { code: 'pt', name: 'Português', flag: '🇧🇷', titlePlaceholder: 'Manutenção', messagePlaceholder: 'Sistema em manutenção...' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷', titlePlaceholder: 'Bakım', messagePlaceholder: 'Sistem bakımda...' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦', titlePlaceholder: 'Обслуговування', messagePlaceholder: 'Система на обслуговуванні...' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳', titlePlaceholder: 'Bảo trì', messagePlaceholder: 'Hệ thống đang bảo trì...' },
  { code: 'zu', name: 'isiZulu', flag: '🇿🇦', titlePlaceholder: 'Ukulungiswa', messagePlaceholder: 'Isistimu ikhona kulungiswa...' }
]

// Translations map for editing
const translationsMap = reactive({})

// Initialize translations map
supportedLanguages.forEach(lang => {
  translationsMap[lang.code] = { title: '', message: '' }
})

// ==================== Computed ====================

// Preview title based on selected language
const previewTitle = computed(() => {
  const trans = translationsMap[previewLang.value]
  return trans?.title || formData.title || 'System Maintenance'
})

// Preview message based on selected language
const previewMessage = computed(() => {
  const trans = translationsMap[previewLang.value]
  return trans?.message || formData.message || 'The system is under maintenance.'
})

// ==================== Methods ====================

/**
 * Format datetime
 */
const formatTime = (time) => {
  if (!time) return '-'
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

/**
 * Get translation for a language
 */
const getTranslation = (langCode) => {
  const trans = translationsMap[langCode]
  return trans && trans.title && trans.message
}

/**
 * Fetch maintenance data from server
 */
const fetchMaintenanceData = async () => {
  loading.value = true
  try {
    const res = await request.get('/maintenance')
    if (res.success && res.data) {
      maintenanceData.value = res.data
      maintenanceEnabled.value = res.data.is_enabled
      
      // Update form data
      formData.title = res.data.title || 'System Maintenance'
      formData.message = res.data.message || ''
      formData.estimated_duration = res.data.estimated_duration || 120
      
      // Update translations map
      if (res.data.translations) {
        res.data.translations.forEach(trans => {
          if (translationsMap[trans.language_code]) {
            translationsMap[trans.language_code].title = trans.title
            translationsMap[trans.language_code].message = trans.message
          }
        })
      }
    }
  } catch (error) {
    console.error('Failed to fetch maintenance data:', error)
    ElMessage.error('獲取維護設置失敗')
  } finally {
    loading.value = false
  }
}

/**
 * Handle toggle maintenance mode
 */
const handleToggle = async (enabled) => {
  try {
    await ElMessageBox.confirm(
      enabled 
        ? '確定要啟用維護模式嗎？啟用後前端用戶將無法訪問系統。'
        : '確定要關閉維護模式嗎？關閉後用戶可以正常訪問系統。',
      enabled ? '啟用維護模式' : '關閉維護模式',
      {
        confirmButtonText: '確定',
        cancelButtonText: '取消',
        type: enabled ? 'warning' : 'info'
      }
    )
    
    toggleLoading.value = true
    
    const res = await request.post('/maintenance/toggle')
    if (res.success) {
      ElMessage.success(enabled ? '維護模式已啟用' : '維護模式已關閉')
      await fetchMaintenanceData()
    } else {
      maintenanceEnabled.value = !enabled
      ElMessage.error(res.message || '操作失敗')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Toggle failed:', error)
      ElMessage.error('操作失敗')
    }
    maintenanceEnabled.value = !enabled
  } finally {
    toggleLoading.value = false
  }
}

/**
 * Save maintenance settings
 */
const saveSettings = async () => {
  saving.value = true
  try {
    // Collect all translations
    const translations = supportedLanguages.map(lang => ({
      language_code: lang.code,
      title: translationsMap[lang.code].title,
      message: translationsMap[lang.code].message
    })).filter(t => t.title && t.message)

    const res = await request.put('/maintenance', {
      is_enabled: maintenanceEnabled.value,
      title: formData.title,
      message: formData.message,
      estimated_duration: formData.estimated_duration,
      translations
    })

    if (res.success) {
      ElMessage.success('設置已保存')
      await fetchMaintenanceData()
    } else {
      ElMessage.error(res.message || '保存失敗')
    }
  } catch (error) {
    console.error('Save failed:', error)
    ElMessage.error('保存失敗')
  } finally {
    saving.value = false
  }
}

/**
 * Save single language translation
 */
const saveTranslation = async (langCode) => {
  const trans = translationsMap[langCode]
  if (!trans.title || !trans.message) {
    ElMessage.warning('請填寫標題和公告內容')
    return
  }

  savingLang.value = langCode
  try {
    const res = await request.put('/maintenance/translations', {
      language_code: langCode,
      title: trans.title,
      message: trans.message
    })

    if (res.success) {
      ElMessage.success('翻譯已保存')
    } else {
      ElMessage.error(res.message || '保存失敗')
    }
  } catch (error) {
    console.error('Save translation failed:', error)
    ElMessage.error('保存失敗')
  } finally {
    savingLang.value = ''
  }
}

// ==================== Watchers ====================

// Expand/collapse all languages
watch(expandAll, (val) => {
  if (val) {
    activeLanguages.value = supportedLanguages.map(l => l.code)
  } else {
    activeLanguages.value = []
  }
})

// ==================== Lifecycle ====================

onMounted(() => {
  fetchMaintenanceData()
})
</script>

<style lang="scss" scoped>
.maintenance-page {
  padding: 0;
}

.page-header {
  margin-bottom: 24px;
  
  .page-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 24px;
    font-weight: 600;
    color: var(--admin-text-primary);
    margin: 0 0 8px 0;
  }
  
  .page-desc {
    color: var(--admin-text-secondary);
    margin: 0;
  }
}

.status-card,
.settings-card,
.translations-card,
.preview-card {
  margin-bottom: 20px;
  background: var(--admin-card-bg);
  border: 1px solid var(--admin-border-color);
  
  :deep(.el-card__header) {
    padding: 16px 20px;
    border-bottom: 1px solid var(--admin-border-color);
  }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  
  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
  }
}

.status-content {
  .toggle-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0;
    
    .toggle-info {
      h4 {
        margin: 0 0 4px 0;
        font-size: 16px;
        color: var(--admin-text-primary);
      }
      
      p {
        margin: 0;
        font-size: 14px;
        color: var(--admin-text-secondary);
      }
    }
  }
}

.settings-form {
  max-width: 600px;
}

.lang-title {
  display: flex;
  align-items: center;
  gap: 12px;
  
  .lang-flag {
    font-size: 20px;
  }
  
  .lang-name {
    font-weight: 500;
  }
}

.translation-form {
  padding: 16px;
  background: var(--admin-bg-color);
  border-radius: 8px;
}

.preview-container {
  display: flex;
  justify-content: center;
  padding: 40px 20px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 8px;
}

.preview-modal {
  max-width: 400px;
  padding: 40px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.2);
  
  .preview-icon {
    margin-bottom: 20px;
    color: #f39c12;
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }
  
  .preview-title {
    font-size: 24px;
    font-weight: 700;
    color: #fff;
    margin: 0 0 16px 0;
  }
  
  .preview-message {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.6;
    margin: 0 0 20px 0;
  }
  
  .preview-timer {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
  }
}
</style>

