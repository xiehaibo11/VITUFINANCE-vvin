<template>
  <!-- 闪兑容器 -->
  <div class="flash-exchange-container" :class="{ loading: showSwapLoading }">
    <!-- 顶部图标 -->
    <div class="exchange-icon-wrapper">
      <img src="/static/YAOQI/2.png" alt="Flash Exchange" class="exchange-icon" />
    </div>

    <!-- 标题 -->
    <div class="exchange-title">
      <h2>{{ t('assetsPage.flashExchange') }}</h2>
    </div>

    <!-- 第一个输入区域(动态显示 WLD 或 USDT) -->
    <div class="exchange-input-group">
      <div class="input-left">
        <input 
          type="number" 
          v-model="topInputAmount" 
          class="exchange-input" 
          :class="{ 'wld-input': topCurrency === 'WLD', 'usdt-input': topCurrency === 'USDT' }"
          placeholder="0.0000"
          step="0.0001"
          min="0"
          @input="handleTopInputChange"
        />
        <div class="input-balance">
          {{ t('assetsPage.balance') }}: 
          <span class="balance-animated">{{ topCurrency === 'WLD' ? displayWldBalance : displayUsdtBalance }}</span> 
          {{ topCurrency }}
        </div>
      </div>
      <div class="input-right">
        <span class="currency-name" :class="{ 'wld-color': topCurrency === 'WLD', 'usdt-color': topCurrency === 'USDT' }">
          {{ topCurrency }}
        </span>
        <template v-if="topCurrency === 'WLD'">
          <span class="currency-divider"></span>
          <span class="max-badge" @click="setMaxTopAmount">{{ t('assetsPage.max') }}</span>
        </template>
      </div>
    </div>

    <!-- 转换图标 -->
    <div class="exchange-swap-icon" @click="handleSwap">
      <img src="/static/YAOQI/7.png" alt="Swap" class="swap-icon" />
    </div>

    <!-- 第二个输入区域(动态显示 USDT 或 WLD) -->
    <div class="exchange-input-group">
      <div class="input-left">
        <span class="exchange-result" :class="{ 'wld-result': bottomCurrency === 'WLD', 'usdt-result': bottomCurrency === 'USDT' }">
          {{ bottomCalculatedAmount }}
        </span>
        <div class="input-balance">
          {{ t('assetsPage.balance') }}: 
          <span class="balance-animated">{{ bottomCurrency === 'WLD' ? displayWldBalance : displayUsdtBalance }}</span> 
          {{ bottomCurrency }}
        </div>
      </div>
      <div class="input-right">
        <span class="currency-name" :class="{ 'wld-color': bottomCurrency === 'WLD', 'usdt-color': bottomCurrency === 'USDT' }">
          {{ bottomCurrency }}
        </span>
      </div>
    </div>

    <!-- 当前价格 -->
    <div class="exchange-price-row">
      <span class="price-label">{{ t('assetsPage.currentPrice') }}：</span>
      <span class="price-value">1WLD≈{{ wldPrice.toFixed(4) }}USDT</span>
    </div>

    <!-- 今日可兑换数量(仅 WLD 换 USDT 时显示) -->
    <div class="exchange-limit-row" v-if="!isSwapped">
      <span class="limit-label">{{ t('assetsPage.todayRedeemable') }}：</span>
      <span class="limit-value">{{ remainingWld.toFixed(2) }} WLD</span>
    </div>
    
    <!-- 按钮区域 -->
    <div class="exchange-buttons-wrapper">
      <!-- 等级提示按钮(仅未解锁时显示) -->
      <button 
        class="unlock-hint-btn" 
        v-if="!isSwapped && userLevel === 0"
        @click="goToInvite"
      >
        {{ t('assetsPage.inviteToExchange') || 'Invite members to unlock WLD exchange' }}
      </button>

      <!-- 确认兑换按钮 -->
      <button class="confirm-exchange-btn" @click="handleConfirmExchange" :disabled="isExchanging">
        {{ isExchanging ? t('common.loading') : t('assetsPage.confirmExchange') }}
      </button>
    </div>

    <!-- 提示弹窗 -->
    <div v-if="showExchangeAlert" class="exchange-alert-overlay" @click.self="closeExchangeAlert">
      <div class="exchange-alert-box">
        <div class="alert-icon">
          <span v-if="exchangeAlertType === 'warning'">⚠️</span>
          <span v-else-if="exchangeAlertType === 'success'">✅</span>
        </div>
        <p class="alert-message">{{ exchangeAlertMessage }}</p>
      </div>
    </div>

    <!-- 交换加载蒙版 -->
    <div v-if="showSwapLoading" class="swap-loading-overlay">
      <div class="swap-loading-dots">
        <span class="dot dot-1"></span>
        <span class="dot dot-2"></span>
        <span class="dot dot-3"></span>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 资产闪兑组件
 * 
 * 功能:
 * - WLD与USDT互换
 * - 价格计算显示
 * - 每日兑换限额检查
 * - 用户等级限制
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'

const { t } = useI18n()
const router = useRouter()
const walletStore = useWalletStore()

// Props
const props = defineProps({
  wldPrice: {
    type: Number,
    default: 0
  },
  userLevel: {
    type: Number,
    default: 0
  },
  dailyRedeemableWld: {
    type: Number,
    default: 0
  },
  todayExchangedWld: {
    type: Number,
    default: 0
  }
})

// Emits
const emit = defineEmits(['refresh'])

// ==================== 状态定义 ====================

// 币种交换状态(false: WLD在上, true: USDT在上)
const isSwapped = ref(false)
const topInputAmount = ref('')
const showSwapLoading = ref(false)
const isExchanging = ref(false)

// 提示弹窗状态
const showExchangeAlert = ref(false)
const exchangeAlertType = ref('warning')
const exchangeAlertMessage = ref('')

// ==================== 计算属性 ====================

// 当前显示的币种
const topCurrency = computed(() => isSwapped.value ? 'USDT' : 'WLD')
const bottomCurrency = computed(() => isSwapped.value ? 'WLD' : 'USDT')

// 剩余可兑换数量
const remainingWld = computed(() => {
  return Math.max(0, props.dailyRedeemableWld - props.todayExchangedWld)
})

// 格式化余额显示
const displayWldBalance = computed(() => {
  const balance = parseFloat(walletStore.wldBalance) || 0
  return balance.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
})

const displayUsdtBalance = computed(() => {
  const balance = parseFloat(walletStore.usdtBalance) || 0
  return balance.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
})

// 计算底部显示的金额(根据输入和汇率)
const bottomCalculatedAmount = computed(() => {
  const inputVal = parseFloat(topInputAmount.value) || 0
  if (inputVal <= 0 || props.wldPrice <= 0) return '0.0000'
  
  if (topCurrency.value === 'WLD') {
    // WLD -> USDT
    return (inputVal * props.wldPrice).toFixed(4)
  } else {
    // USDT -> WLD
    return (inputVal / props.wldPrice).toFixed(4)
  }
})

// ==================== 方法 ====================

/**
 * 处理顶部输入变化
 */
const handleTopInputChange = () => {
  console.log('[Exchange] Input changed:', topInputAmount.value)
}

/**
 * 设置最大金额
 */
const setMaxTopAmount = () => {
  if (topCurrency.value === 'WLD') {
    // 取用户余额和剩余限额的较小值
    const balance = parseFloat(walletStore.wldBalance) || 0
    const maxAllowed = Math.min(balance, remainingWld.value)
    topInputAmount.value = maxAllowed.toFixed(4)
  } else {
    topInputAmount.value = walletStore.usdtBalance
  }
}

/**
 * 处理币种交换
 */
const handleSwap = () => {
  showSwapLoading.value = true
  
  setTimeout(() => {
    isSwapped.value = !isSwapped.value
    topInputAmount.value = ''
    showSwapLoading.value = false
  }, 800)
}

/**
 * 跳转到邀请页面
 */
const goToInvite = () => {
  router.push('/invite')
}

/**
 * 显示提示
 */
const showAlert = (type, message) => {
  exchangeAlertType.value = type
  exchangeAlertMessage.value = message
  showExchangeAlert.value = true
  
  setTimeout(() => {
    showExchangeAlert.value = false
  }, 2000)
}

/**
 * 关闭提示
 */
const closeExchangeAlert = () => {
  showExchangeAlert.value = false
}

/**
 * 处理确认兑换
 */
const handleConfirmExchange = async () => {
  // 检查钱包连接
  if (!walletStore.isConnected) {
    showAlert('warning', t('assetsPage.connectWalletFirst'))
    return
  }
  
  const fromCurrency = topCurrency.value
  const exchangeAmount = parseFloat(topInputAmount.value) || 0
  
  // 获取余额
  const fromBalance = fromCurrency === 'WLD' 
    ? parseFloat(walletStore.wldBalance) || 0 
    : parseFloat(walletStore.usdtBalance) || 0
  
  // 验证输入
  if (exchangeAmount <= 0) {
    showAlert('warning', t('assetsPage.enterAmount') || 'Please enter a valid amount')
    return
  }
  
  if (exchangeAmount > fromBalance) {
    showAlert('warning', t('assetsPage.insufficientBalance', { currency: fromCurrency }))
    return
  }
  
  const direction = fromCurrency === 'WLD' ? 'wld_to_usdt' : 'usdt_to_wld'
  
  // WLD换USDT需要检查等级限制
  if (direction === 'wld_to_usdt') {
    if (props.userLevel === 0) {
      showAlert('warning', t('assetsPage.inviteToExchange') || 'Invite members to unlock WLD exchange')
      return
    }
    
    if (exchangeAmount > remainingWld.value) {
      showAlert('warning', `Daily limit exceeded. You can only exchange ${remainingWld.value.toFixed(4)} WLD today.`)
      return
    }
  }
  
  // 执行兑换
  isExchanging.value = true
  
  try {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://bocail.com'
    const response = await fetch(`${API_BASE}/api/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: walletStore.walletAddress,
        direction: direction,
        amount: exchangeAmount
      })
    })
    const result = await response.json()
    
    if (result.success) {
      // 更新余额
      walletStore.setUsdtBalance(result.data.newUsdtBalance)
      walletStore.setWldBalance(result.data.newWldBalance)
      
      // 清空输入
      topInputAmount.value = ''
      
      // 显示成功提示
      showAlert('success', t('assetsPage.exchangeSuccess'))
      
      // 通知父组件刷新
      emit('refresh')
    } else {
      throw new Error(result.message)
    }
  } catch (error) {
    console.error('兑换失败:', error)
    showAlert('warning', error.message || 'Exchange failed')
  } finally {
    isExchanging.value = false
  }
}
</script>

<style scoped>
/* 闪兑容器 */
.flash-exchange-container {
  position: relative;
  width: 100%;
  max-width: 387px;
  margin: 24px auto;
  padding: 24px;
  background: linear-gradient(135deg, #2a2d35 0%, #1f2229 100%);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.flash-exchange-container.loading {
  pointer-events: none;
}

/* 顶部图标 */
.exchange-icon-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.exchange-icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

/* 标题 */
.exchange-title {
  text-align: center;
  margin-bottom: 24px;
}

.exchange-title h2 {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

/* 输入组 */
.exchange-input-group {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  margin-bottom: 16px;
}

.input-left {
  flex: 1;
}

.exchange-input {
  width: 100%;
  background: transparent;
  border: none;
  font-size: 24px;
  font-weight: 600;
  color: #fff;
  outline: none;
}

.exchange-input.wld-input { color: #4ade80; }
.exchange-input.usdt-input { color: #f5a623; }

.exchange-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.exchange-result {
  font-size: 24px;
  font-weight: 600;
}

.exchange-result.wld-result { color: #4ade80; }
.exchange-result.usdt-result { color: #f5a623; }

.input-balance {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 8px;
}

.balance-animated {
  color: rgba(255, 255, 255, 0.8);
}

.input-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.currency-name {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.currency-name.wld-color { color: #4ade80; }
.currency-name.usdt-color { color: #f5a623; }

.currency-divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.2);
}

.max-badge {
  font-size: 12px;
  color: #667eea;
  cursor: pointer;
  padding: 4px 8px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 4px;
  transition: all 0.2s ease;
}

.max-badge:hover {
  background: rgba(102, 126, 234, 0.2);
}

/* 交换图标 */
.exchange-swap-icon {
  display: flex;
  justify-content: center;
  margin: -8px 0;
  position: relative;
  z-index: 1;
  cursor: pointer;
}

.swap-icon {
  width: 40px;
  height: 40px;
  object-fit: contain;
  transition: transform 0.3s ease;
}

.exchange-swap-icon:hover .swap-icon {
  transform: rotate(180deg);
}

/* 价格和限额 */
.exchange-price-row,
.exchange-limit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 14px;
}

.price-label,
.limit-label {
  color: rgba(255, 255, 255, 0.6);
}

.price-value,
.limit-value {
  color: #fff;
  font-weight: 500;
}

/* 按钮区域 */
.exchange-buttons-wrapper {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.unlock-hint-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.unlock-hint-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.confirm-exchange-btn {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #f5a623 0%, #e89b1f 100%);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.confirm-exchange-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 166, 35, 0.4);
}

.confirm-exchange-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 提示弹窗 */
.exchange-alert-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  z-index: 10;
}

.exchange-alert-box {
  background: #2a2d35;
  padding: 24px;
  border-radius: 12px;
  text-align: center;
  max-width: 280px;
}

.alert-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.alert-message {
  color: #fff;
  font-size: 14px;
  margin: 0;
  line-height: 1.5;
}

/* 加载动画 */
.swap-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  z-index: 20;
}

.swap-loading-dots {
  display: flex;
  gap: 8px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #f5a623;
  animation: bounce 1.4s infinite ease-in-out both;
}

.dot-1 { animation-delay: -0.32s; }
.dot-2 { animation-delay: -0.16s; }
.dot-3 { animation-delay: 0s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* 响应式 */
@media (max-width: 768px) {
  .flash-exchange-container {
    max-width: 343px;
    padding: 20px;
  }
  
  .exchange-input,
  .exchange-result {
    font-size: 20px;
  }
}
</style>

