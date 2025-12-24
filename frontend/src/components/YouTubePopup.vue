<template>
  <div v-if="visible" class="popup-overlay" @click="closePopup">
    <div class="popup-container" @click.stop>
      <!-- 关闭按钮 -->
      <div class="close-btn" @click="closePopup">
        <svg width="23" height="23" viewBox="0 0 23 23" fill="none">
          <circle cx="11.5" cy="11.5" r="11.5" fill="#f5b638" />
          <path d="M7 7L16 16M16 7L7 16" stroke="#000" stroke-width="2" stroke-linecap="round" />
        </svg>
      </div>

      <!-- 可滑动的内容区域 -->
      <div class="popup-content-wrapper">
        <!-- 顶部背景图 -->
        <div class="popup-header">
          <img src="/static/two/image.png" alt="Header" />
        </div>

        <!-- 主体内容 -->
        <div class="popup-body">
          <!-- YouTube 图标 -->
          <div class="icon-wrapper">
            <img src="/static/four/icon6.png" alt="YouTube Icon" />
          </div>

          <!-- 标题 -->
          <h2 class="title">{{ t('socialPopup.youtubeTitle') }}</h2>

          <!-- Join 按钮 -->
          <button class="join-btn" @click="handleJoin">
            <span>{{ t('socialPopup.join') }}</span>
          </button>

          <!-- Check 按钮 -->
          <button class="check-btn" :disabled="checked || isChecking" @click="handleCheck">
            <span v-if="checked">{{ t('socialPopup.checked') }}</span>
            <span v-else-if="isChecking">{{ t('socialPopup.checking') }}</span>
            <span v-else>{{ t('socialPopup.check') }}</span>
          </button>
        </div>
      </div>

      <!-- 底部导航栏 -->
      <BottomNav :in-popup="true" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BottomNav from './BottomNav.vue'

const { t } = useI18n()

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  youtubeUrl: {
    type: String,
    // Default YouTube channel link for sharing/joining.
    // IMPORTANT: Keep this in sync with the default social link configured in the app.
    default: 'https://www.youtube.com/channel/UC92aIDlejplKldAwfhvUlfg'
  }
})

const emit = defineEmits(['update:visible', 'check'])

const checked = ref(false)
const isChecking = ref(false)

const closePopup = () => {
  emit('update:visible', false)
}

/**
 * 处理加入按钮点击
 * 使用多重fallback策略确保在各种移动端浏览器都能正常跳转
 */
const handleJoin = () => {
  const url = props.youtubeUrl
  
  // 方案1: 尝试 window.open (大多数情况下有效)
  const newWindow = window.open(url, '_blank')
  
  // 方案2: 如果 window.open 被阻止，使用 location.href
  if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
    // 直接在当前页面跳转
    window.location.href = url
  }
}

const handleCheck = async () => {
  if (checked.value || isChecking.value) {
    return
  }

  isChecking.value = true

  // 模拟检查过程
  setTimeout(() => {
    checked.value = true
    isChecking.value = false
    emit('check', { reward: 0 })
  }, 1500)
}

watch(
  () => props.visible,
  (v) => {
    if (!v) {
      // 弹窗关闭时不重置状态，保持用户的操作记录
    }
  }
)
</script>

<style scoped>
/* 遮罩层 */
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 10075;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 弹窗容器 */
.popup-container {
  position: relative;
  width: 632px;
  max-width: 100%;
  max-height: 90vh;
  background: rgb(22, 22, 22);
  border-radius: 20px 20px 0 0;
  animation: slideUp 0.3s ease-out;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

/* 关闭按钮 */
.close-btn {
  position: absolute;
  right: 33px;
  top: 33px;
  cursor: pointer;
  z-index: 1;
  width: 23px;
  height: 23px;
  transition: transform 0.2s;
}

.close-btn:hover {
  transform: scale(1.1);
}

.close-btn:active {
  transform: scale(0.95);
}

/* 顶部背景图 */
.popup-header {
  width: 100%;
  height: 67px;
  overflow: hidden;
  flex-shrink: 0;
}

.popup-header img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 可滚动的内容包装器 */
.popup-content-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

/* 自定义滚动条样式 */
.popup-content-wrapper::-webkit-scrollbar {
  width: 4px;
}

.popup-content-wrapper::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 2px;
}

.popup-content-wrapper::-webkit-scrollbar-thumb {
  background: rgba(245, 182, 56, 0.5);
  border-radius: 2px;
}

.popup-content-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(245, 182, 56, 0.7);
}

/* 主体内容 */
.popup-body {
  width: 100%;
  min-height: 520px;
  background: rgb(22, 22, 22);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 32px 32px 32px;
  box-sizing: border-box;
}

/* 图标 */
.icon-wrapper {
  width: 115px;
  height: 81px;
  margin-bottom: 25px;
}

.icon-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 标题 */
.title {
  width: 156.56px;
  height: 26px;
  font-size: 20px;
  font-weight: bold;
  color: #ffffff;
  text-align: center;
  margin: 0 auto 32px auto;
  line-height: 26px;
}

/* Join 按钮 */
.join-btn {
  width: 95px;
  height: 31px;
  background: #f5b638;
  border: 2px solid #f5b6388c;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 800;
  color: #000000;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  padding: 0 !important;
  box-sizing: border-box !important;
  line-height: 31px !important;
  box-shadow: 0 4px 12px rgba(245, 182, 56, 0.35);
}

.join-btn:hover {
  background: #ffca4a;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 182, 56, 0.4);
}

.join-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(245, 182, 56, 0.3);
}

.join-btn:disabled {
  background: #f5b638;
  color: #000000;
  border-color: #f5b6388c;
  cursor: not-allowed;
  box-shadow: 0 4px 12px rgba(245, 182, 56, 0.35);
  transform: none;
}

/* Check 按钮 */
.check-btn {
  width: 287px;
  height: 46px;
  background: #f5b638;
  border: 2px solid #f5b6388c;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 800;
  color: #000000;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  box-sizing: border-box !important;
  line-height: 46px !important;
  box-shadow: 0 4px 12px rgba(245, 182, 56, 0.35);
}

.check-btn:hover {
  background: #ffca4a;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 182, 56, 0.4);
}

.check-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(245, 182, 56, 0.3);
}

.check-btn:disabled {
  background: #f5b638;
  color: #000000;
  border-color: #f5b6388c;
  cursor: not-allowed;
  box-shadow: 0 4px 12px rgba(245, 182, 56, 0.35);
  transform: none;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .popup-container {
    width: 360px;
    height: 405px;
    max-height: 405px;
    border-radius: 20px 20px 0 0;
  }

  .close-btn {
    right: 20px;
    top: 20px;
  }

  .popup-header {
    height: 38px;
  }

  .popup-content-wrapper {
    height: 367px; /* 背景图整体高度：360 x 367 */
  }

  .popup-body {
    min-height: 367px;
    height: 367px;
    padding: 35px 20px 24px 20px;
  }

  .icon-wrapper {
    width: 115px;
    height: 81px;
    margin-bottom: 20px;
  }

  .title {
    width: 156.56px;
    height: 26px;
    font-size: 20px;
    line-height: 26px;
    margin: 0 auto 24px auto;
  }

  .join-btn {
    width: 95px;
    height: 31px;
    font-size: 16px;
    border-radius: 12px;
    padding: 0 !important;
    box-sizing: border-box !important;
    line-height: 31px !important;
    margin-bottom: 16px;
  }

  .check-btn {
    width: 287px;
    height: 46px;
    font-size: 18px;
    border-radius: 12px;
    padding: 0 !important;
    box-sizing: border-box !important;
    line-height: 46px !important;
    margin-bottom: 24px;
  }
}
</style>

