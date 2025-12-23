<template>
  <!-- 
    机器人卡片组件 - 用于 CEX/DEX 机器人列表
    
    Props:
    - robot: 机器人数据对象
    - purchasedCount: 用户已购买该机器人的数量
    - isLoading: 是否正在加载/购买中
    - isLocked: 是否锁定（需要解锁才能购买）
    
    Events:
    - purchase: 点击购买按钮时触发
  -->
  <div class="robot-card" :class="{ 'robot-card-locked': isLocked }">
    <!-- 机器人头部：Logo 和名称 -->
    <div class="robot-header">
      <img :src="robot.logo" :alt="robot.name" class="robot-logo" />
      <h3 class="robot-name">{{ t(robot.nameKey) || robot.name }}</h3>
    </div>
    
    <!-- 机器人信息 -->
    <div class="robot-info">
      <!-- 套利订单数 -->
      <div class="info-row">
        <span class="info-label">{{ t('robotPage.arbitrageOrders') }}</span>
        <span class="info-value">{{ robot.orders }}</span>
      </div>
      <!-- 日收益率 -->
      <div class="info-row">
        <span class="info-label">{{ t('robotPage.dailyProfit') }}</span>
        <span class="info-value">{{ robot.dailyProfit }} %</span>
      </div>
      <!-- 到期总收益 -->
      <div class="info-row">
        <span class="info-label">{{ t('robotPage.totalReturnMaturity') }}</span>
        <span class="info-value">{{ robot.totalReturn }} USDT</span>
      </div>
      <!-- 运行周期（使用小时数计算，显示天数或小时） -->
      <div class="info-row">
        <span class="info-label">{{ t('robotPage.operationCycle') }}</span>
        <span class="info-value">{{ formatDuration(robot.durationHours) }}</span>
      </div>
      <!-- 限购数量（如果没有 showNote） -->
      <div v-if="!robot.showNote" class="info-row">
        <span class="info-label">{{ t('robotPage.limitedUnits') }}</span>
        <span class="info-value">{{ robot.limit }}</span>
      </div>
      <!-- DEX 机器人的备注 -->
      <div v-if="robot.showNote" class="info-row">
        <span class="info-label info-label-long">{{ t('robotPage.depositReturnNote') }}</span>
      </div>
    </div>

    <!-- 机器人底部：价格和按钮 -->
    <div class="robot-footer">
      <div class="robot-price">
        <span class="price-amount">{{ robot.price }}</span>
        <span class="price-currency">USDT</span>
      </div>
      <button 
        class="enable-button" 
        :class="{ 
          'is-disabled': isSoldOut || isLocked,
          'is-loading': isLoading 
        }"
        :disabled="isSoldOut || isLocked || isLoading"
        @click="handleClick"
      >
        <span v-if="isLoading">...</span>
        <span v-else-if="isSoldOut">{{ t('robotPage.soldOut') || 'Sold Out' }}</span>
        <span v-else>{{ t('robotPage.openButton') }}</span>
      </button>
    </div>

    <!-- Locked Overlay (only for locked robots) -->
    <div v-if="isLocked" class="locked-overlay">
      <div class="locked-circle">
        <div class="lock-icon">🔒</div>
        <div class="unlock-text">{{ t('robotPage.toBeUnlocked') }}</div>
        <div v-if="unlockRobotName" class="unlock-condition">
          {{ t('robotPage.unlockBy') || 'Purchase' }} {{ unlockRobotName }} {{ t('robotPage.toUnlock') || 'to unlock' }}
        </div>
        <div v-else class="countdown-text">{{ t('robotPage.countdown') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * RobotCard 组件 - 显示可购买的机器人卡片
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Define Props
const props = defineProps({
  robot: {
    type: Object,
    required: true
  },
  purchasedCount: {
    type: Number,
    default: 0
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  unlockRobotName: {
    type: String,
    default: ''
  }
})

// 定义 Events
const emit = defineEmits(['purchase'])

/**
 * 格式化运行周期（小时数转换为天/小时显示）
 * @param {number} hours - 小时数
 * @returns {string} 格式化后的显示文本
 */
const formatDuration = (hours) => {
  if (!hours) return '-'
  
  // 如果是24小时的整数倍，只显示天数
  if (hours % 24 === 0) {
    const days = hours / 24
    return days === 1 
      ? `1 ${t('common.day')}` 
      : `${days} ${t('common.days')}`
  }
  
  // 否则显示小时，或天+小时
  if (hours < 24) {
    return `${hours}h`
  }
  
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `${days} ${t('common.days')} ${remainingHours}h`
}

// 计算是否已售罄（达到限购数量）
const isSoldOut = computed(() => {
  return props.purchasedCount >= props.robot.limit
})

// 点击购买按钮
const handleClick = () => {
  if (!props.isLoading && !isSoldOut.value && !props.isLocked) {
    emit('purchase', props.robot)
  }
}
</script>

<style scoped>
.robot-card {
  width: 100%;
  max-width: 350px;
  height: 225px;
  background-image: url('/static/CEX-Robots/机器人背景图.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  border: none;
  border-radius: 12px;
  padding: 14px 18px 20px 18px;
  box-sizing: border-box;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
}

.robot-card:hover {
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.15);
  transform: translateY(-2px);
}

.robot-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.robot-logo {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  object-fit: contain;
  background: transparent;
}

.robot-name {
  font-size: 16px;
  font-weight: 700;
  color: rgb(245, 182, 56);
  margin: 0;
}

.robot-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  width: 100%;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.info-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  flex-shrink: 0;
}

.info-label-long {
  font-size: 11px;
  width: 100%;
  text-align: left;
}

.info-value {
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  text-align: right;
  flex-shrink: 0;
}

.robot-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  flex-shrink: 0;
}

.robot-price {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.price-amount {
  font-size: 24px;
  font-weight: 700;
  color: rgb(51, 190, 135);
}

.price-currency {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
}

.enable-button {
  width: 104px;
  height: 30px;
  background: rgb(245, 182, 56);
  border: none;
  border-radius: 6px;
  padding: 0;
  font-size: 14px;
  font-weight: 600;
  color: #000;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.enable-button:hover:not(.is-disabled):not(.is-loading) {
  background: rgb(255, 192, 66);
  transform: translateY(-1px);
}

.enable-button:active:not(.is-disabled):not(.is-loading) {
  transform: translateY(0);
}

/* 禁用状态 - 灰色按钮 */
.enable-button.is-disabled {
  background: rgb(128, 128, 128);
  color: rgba(255, 255, 255, 0.6);
  cursor: not-allowed;
}

/* 加载状态 */
.enable-button.is-loading {
  background: rgb(200, 160, 56);
  cursor: wait;
}

/* 锁定卡片样式 */
.robot-card-locked {
  position: relative;
  overflow: visible;
}

.locked-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.locked-circle {
  width: 160px;
  height: 160px;
  background: rgba(20, 20, 25, 0.95);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.lock-icon {
  font-size: 24px;
  margin-bottom: 4px;
}

.unlock-text {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  text-align: center;
}

.countdown-text {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
}

.unlock-condition {
  font-size: 11px;
  font-weight: 500;
  color: #f5b638;
  text-align: center;
  margin-top: 6px;
  padding: 4px 8px;
  background: rgba(245, 182, 56, 0.1);
  border-radius: 4px;
  line-height: 1.4;
}

/* Mobile Adaptation */
@media (max-width: 768px) {
  .robot-card {
    padding: 14px 16px 20px 16px;
  }
  
  .enable-button {
    width: 104px;
    height: 30px;
    font-size: 13px;
  }
}
</style>

