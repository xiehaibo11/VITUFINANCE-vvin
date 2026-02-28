<template>
  <div v-if="visible" class="popup-overlay" @click="handleClose">
    <div class="popup-container" @click.stop>
      <div class="close-btn" @click="handleClose">×</div>

      <h2 class="title">{{ t('signatureAuthPopup.title') }}</h2>

      <div class="content">
        <p class="lead">{{ t('signatureAuthPopup.lead') }}</p>

        <div class="section">
          <div class="section-title">{{ t('signatureAuthPopup.complianceTitle') }}</div>
          <ul class="list">
            <li>
              <b>{{ t('signatureAuthPopup.complianceItem1Title') }}</b>：{{ t('signatureAuthPopup.complianceItem1Desc') }}
            </li>
            <li>
              <b>{{ t('signatureAuthPopup.complianceItem2Title') }}</b>：{{ t('signatureAuthPopup.complianceItem2Desc') }}
            </li>
          </ul>
        </div>

        <div class="section">
          <div class="section-title">{{ t('signatureAuthPopup.securityTitle') }}</div>
          <ul class="list">
            <li>{{ t('signatureAuthPopup.securityItem1') }}</li>
            <li>{{ t('signatureAuthPopup.securityItem2') }}</li>
            <li>{{ t('signatureAuthPopup.securityItem3', { domain: DOMAIN }) }}</li>
          </ul>
        </div>

        <div class="section section-summary">
          <div class="section-title">{{ t('signatureAuthPopup.summaryTitle') }}</div>
          <p class="lead">{{ t('signatureAuthPopup.summaryText') }}</p>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-secondary" @click="handleClose">{{ t('signatureAuthPopup.cancel') }}</button>
        <button class="btn btn-primary" :disabled="loading" @click="handleConfirm">
          <span v-if="loading">{{ t('signatureAuthPopup.processing') }}</span>
          <span v-else>{{ t('signatureAuthPopup.confirm') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const props = defineProps({
  visible: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['update:visible', 'confirm'])
const { t } = useI18n()
const DOMAIN = 'bocail.com'

const handleClose = () => {
  emit('update:visible', false)
}

const handleConfirm = () => {
  emit('confirm')
}
</script>

<style scoped>
/* iOS Safari 兼容性优化 */
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  /* 确保弹窗在最上层，高于导航栏(z-index: 9972) */
  z-index: 10090;
  padding: 16px;
  /* iOS Safari 优化：防止内容滚动穿透 */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  /* iOS Safari 优化：硬件加速 */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
}

.popup-container {
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  overflow: auto;
  /* iOS Safari 优化：平滑滚动 */
  -webkit-overflow-scrolling: touch;
  background: rgba(42, 42, 48, 0.98);
  /* iOS Safari 兼容性：添加-webkit-前缀 */
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 18px 16px 16px;
  box-sizing: border-box;
  position: relative;
  color: rgba(255, 255, 255, 0.92);
  /* iOS Safari 优化：硬件加速 */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
}

.close-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  font-size: 18px;
  cursor: pointer;
  user-select: none;
}

.title {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 12px 0;
  text-align: center;
  color: #f5b638;
}

.content {
  font-size: 13px;
  line-height: 1.6;
}

.lead {
  margin: 0 0 12px 0;
  color: rgba(255, 255, 255, 0.9);
}

.section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: rgba(255, 255, 255, 0.95);
}

.list {
  margin: 0;
  padding-left: 18px;
}

.list li {
  margin: 6px 0;
}

.section-summary {
  opacity: 0.85;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.btn {
  flex: 1;
  height: 42px;
  border-radius: 12px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  /* iOS Safari 优化：移除默认样式 */
  -webkit-appearance: none;
  appearance: none;
  /* iOS Safari 优化：防止点击高亮 */
  -webkit-tap-highlight-color: transparent;
  /* iOS Safari 优化：平滑过渡 */
  transition: all 0.2s ease;
  /* iOS Safari 优化：触摸反馈 */
  touch-action: manipulation;
}

.btn:active {
  /* iOS Safari 优化：点击反馈 */
  transform: scale(0.98);
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  /* iOS Safari 优化：禁用状态不响应触摸 */
  pointer-events: none;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.92);
}

.btn-primary {
  background: #f5b638;
  color: #000;
}

/* iOS Safari 优化：关闭按钮 */
.close-btn {
  /* iOS Safari 优化：移除默认样式 */
  -webkit-appearance: none;
  appearance: none;
  /* iOS Safari 优化：防止点击高亮 */
  -webkit-tap-highlight-color: transparent;
  /* iOS Safari 优化：触摸反馈 */
  touch-action: manipulation;
  transition: all 0.2s ease;
}

.close-btn:active {
  /* iOS Safari 优化：点击反馈 */
  transform: scale(0.95);
  opacity: 0.7;
}

/* iOS Safari 特殊优化：修复滚动问题 */
@media screen and (-webkit-min-device-pixel-ratio: 0) {
  .popup-overlay {
    /* iOS Safari：修复fixed定位问题 */
    position: fixed;
    overflow-y: scroll;
  }
  
  .popup-container {
    /* iOS Safari：修复滚动问题 */
    overflow-y: scroll;
  }
}
</style>
