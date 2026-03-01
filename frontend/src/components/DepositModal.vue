<template>
  <!-- Deposit Modal -->
  <div v-if="visible" class="deposit-modal-overlay" @click.self="closeModal">
    <div class="deposit-modal">
      <!-- Title -->
      <h2 class="modal-title">{{ t('depositModal.title') }}</h2>
      
      <!-- Chain Selection Area -->
      <div class="chain-select-section">
        <label class="input-label">{{ t('depositModal.selectNetwork') }}</label>
        <div class="chain-buttons">
          <!-- BSC Selection Button -->
          <button 
            class="chain-btn"
            :class="{ selected: selectedChain === 'BSC' }"
            @click="selectedChain = 'BSC'"
          >
            <img src="/static/bsc-chain.png" alt="BSC" class="chain-logo-img" />
            <div class="chain-info">
              <span class="chain-name">BSC</span>
              <span class="chain-desc">{{ t('depositModal.lowGasFee') }}</span>
            </div>
          </button>
          
          <!-- ETH Selection Button -->
          <button 
            class="chain-btn"
            :class="{ selected: selectedChain === 'ETH' }"
            @click="selectedChain = 'ETH'"
          >
            <img src="/static/eth-chain.png" alt="ETH" class="chain-logo-img" />
            <div class="chain-info">
              <span class="chain-name">Ethereum</span>
              <span class="chain-desc">{{ t('depositModal.mainnet') }}</span>
            </div>
          </button>
          
          <!-- TRON Selection Button -->
          <button 
            class="chain-btn"
            :class="{ selected: selectedChain === 'TRON' }"
            @click="selectedChain = 'TRON'"
          >
            <img src="/static/tron.svg" alt="TRON" class="chain-logo-img" />
            <div class="chain-info">
              <span class="chain-name">TRON</span>
              <span class="chain-desc">{{ t('depositModal.passwordFree') }}</span>
            </div>
          </button>
        </div>
      </div>
      
      <!-- TRON Manual Transfer Mode (when tronWeb not available, e.g. imToken) -->
      <template v-if="showManualTronTransfer">
        <div class="manual-transfer-section">
          <label class="input-label">{{ t('depositModal.manualTransferTitle') }}</label>
          <div class="address-display">
            <span class="address-text">{{ platformWalletAddress }}</span>
            <button class="copy-btn" @click="copyAddress">
              {{ addressCopied ? t('depositModal.copied') : t('depositModal.copyAddress') }}
            </button>
          </div>
          <p class="manual-transfer-tip">{{ t('depositModal.manualTransferTip') }}</p>
        </div>

        <!-- Tip -->
        <p class="tip-text">{{ t('depositModal.minDepositTip') }}</p>

        <!-- Button Area -->
        <div class="button-group">
          <button class="btn-cancel" @click="closeModal">{{ t('common.close') }}</button>
        </div>
      </template>

      <!-- Normal Deposit Mode -->
      <template v-else>
        <!-- Input Area -->
        <div class="input-section">
          <label class="input-label">{{ t('depositModal.enterAmount') }}</label>
          <div class="amount-input-wrapper">
            <input
              v-model="depositAmount"
              type="number"
              min="20"
              step="1"
              placeholder="0"
              class="amount-input"
            />
          </div>
        </div>

        <!-- Quick Amount Buttons -->
        <div class="quick-amounts">
          <button
            v-for="amount in quickAmounts"
            :key="amount"
            class="quick-amount-btn"
            :class="{ selected: depositAmount === amount.toString() }"
            @click="depositAmount = amount.toString()"
          >
            {{ amount }}
          </button>
        </div>

        <!-- Tip -->
        <p class="tip-text">{{ t('depositModal.minDepositTip') }}</p>

        <!-- Button Area -->
        <div class="button-group">
          <button class="btn-cancel" @click="closeModal">{{ t('common.cancel') }}</button>
          <button
            class="btn-sure"
            :disabled="!isValidAmount || isProcessing"
            @click="handleDeposit"
          >
            {{ isProcessing ? t('common.processing') : t('common.confirm') }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * 充值弹窗组件
 * 
 * 功能：
 * - 输入充值金额
 * - 调用钱包进行 USDT 转账
 * - 提交充值记录到后端
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWalletStore } from '@/stores/wallet'
import { useCsrfStore } from '@/stores/csrf'
import { post } from '@/api/secureApi'
import { isDAppBrowser, getNetworkInfo } from '@/utils/wallet'
import { isTronDAppBrowser, depositWithTronRelay, getTronUsdtBalance } from '@/utils/tronWallet'

const { t } = useI18n()

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'success'])

// 钱包 store
const walletStore = useWalletStore()
const csrfStore = useCsrfStore()

// 状态
const depositAmount = ref('')
const isProcessing = ref(false)
const addressCopied = ref(false)

// 是否显示手动转账模式（TRON链 + 无tronWeb环境，如imToken）
const showManualTronTransfer = computed(() => {
  return selectedChain.value === 'TRON' && !isTronDAppBrowser()
})

// 复制地址到剪贴板
const copyAddress = async () => {
  try {
    await navigator.clipboard.writeText(platformWalletAddress.value)
    addressCopied.value = true
    setTimeout(() => { addressCopied.value = false }, 2000)
  } catch {
    // Fallback for older browsers
    const input = document.createElement('input')
    input.value = platformWalletAddress.value
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    addressCopied.value = true
    setTimeout(() => { addressCopied.value = false }, 2000)
  }
}

// 链选择
const selectedChain = ref('BSC')
const supportedChains = ref(['BSC', 'ETH', 'TRON'])
const chainIcons = {
  BSC: '🟡',
  ETH: '🔷',
  TRON: '🔴'
}

// 多链钱包配置
const walletConfigs = ref({
  BSC: {
    address: '0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4',
    chainId: '0x38',
    chainName: 'BNB Smart Chain',
    token: 'USDT',
    tokenContract: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18,
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    explorer: 'https://bscscan.com/'
  },
  ETH: {
    address: '0x8a92c73FdE5d0313303989eB269d6d17ffb1ba9d',
    chainId: '0x1',
    chainName: 'Ethereum Mainnet',
    token: 'USDT',
    tokenContract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
    rpcUrl: 'https://mainnet.infura.io/v3/',
    explorer: 'https://etherscan.io/'
  },
  TRON: {
    address: 'TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi',
    chainName: 'TRON Mainnet',
    token: 'USDT',
    tokenContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: 6,
    explorer: 'https://tronscan.org/'
  }
})

// 当前选中链的配置
const currentChainConfig = computed(() => walletConfigs.value[selectedChain.value])

// 平台收款地址（根据选中链动态获取）
const platformWalletAddress = computed(() => currentChainConfig.value?.address || '')

// 快捷金额选项
const quickAmounts = [20, 100, 300, 500, 800]

// USDT 合约地址（根据选中链动态获取）
const USDT_CONTRACT_ADDRESS = computed(() => currentChainConfig.value?.tokenContract || '')

// 计算属性
const isValidAmount = computed(() => {
  const amount = parseFloat(depositAmount.value)
  return !isNaN(amount) && amount >= 20
})

// 监听弹窗显示状态，重置表单
watch(() => props.visible, (newVal) => {
  if (newVal) {
    resetForm()
    fetchPlatformWallet()
  }
})

// 重置表单
const resetForm = () => {
  depositAmount.value = ''
  isProcessing.value = false
}

// 获取平台收款地址（多链）
const fetchPlatformWallet = async () => {
  try {
    const response = await fetch('/api/platform/wallet')
    const data = await response.json()
    if (data.success && data.data) {
      // 更新多链钱包配置
      if (data.data.wallets) {
        walletConfigs.value = { ...walletConfigs.value, ...data.data.wallets }
      }
      // 更新支持的链列表
      if (data.data.supportedChains) {
        supportedChains.value = data.data.supportedChains
      }
      console.log('[Deposit] Wallet configs loaded:', walletConfigs.value)
    }
  } catch (error) {
    console.error('Failed to fetch platform wallet:', error)
  }
}

// 关闭弹窗
const closeModal = () => {
  emit('update:visible', false)
}

/**
 * 获取钱包中的 USDT 余额（链上余额）
 * 注意：ETH的USDT是6位小数，BSC的USDT是18位小数，TRON的USDT是6位小数
 * @returns {Promise<number>} USDT 余额
 */
const getWalletUsdtBalance = async () => {
  try {
    // TRON 链处理
    if (selectedChain.value === 'TRON') {
      if (!isTronDAppBrowser()) {
        console.error('[Deposit] Not in TRON DApp browser')
        return 0
      }
      
      const balance = await getTronUsdtBalance(walletStore.walletAddress)
      return parseFloat(balance) || 0
    }
    
    // ETH/BSC 链处理
    const ethereum = window.ethereum
    if (!ethereum) return 0
    
    const chainConfig = currentChainConfig.value
    
    // 调用 USDT 合约的 balanceOf 方法
    // balanceOf(address) 函数签名: 0x70a08231
    const walletAddr = walletStore.walletAddress.slice(2).padStart(64, '0')
    const data = '0x70a08231' + walletAddr
    
    const result = await ethereum.request({
      method: 'eth_call',
      params: [{
        to: chainConfig.tokenContract,
        data: data
      }, 'latest']
    })
    
    // 将结果从 hex 转换为数字（根据链的小数位数）
    const balanceWei = BigInt(result)
    const decimals = chainConfig.decimals
    const balance = Number(balanceWei) / Math.pow(10, decimals)
    
    console.log(`[Deposit] Wallet USDT balance on ${selectedChain.value}:`, balance)
    return balance
  } catch (error) {
    console.error('[Deposit] Failed to get USDT balance:', error)
    return 0
  }
}

// 处理充值
const handleDeposit = async () => {
  if (!isValidAmount.value) {
    alert(t('depositModal.enterValidAmount'))
    return
  }

  // TRON 链处理
  if (selectedChain.value === 'TRON') {
    if (!isTronDAppBrowser()) {
      alert(t('depositModal.openInTronWalletBrowser') || 'Please open in TronLink or TRON wallet browser')
      return
    }

    if (!walletStore.isConnected) {
      alert(t('depositModal.connectWalletFirst'))
      return
    }

    isProcessing.value = true

    try {
      const amount = parseFloat(depositAmount.value)
      
      // 检查钱包 USDT 余额是否足够
      const walletBalance = await getWalletUsdtBalance()
      if (walletBalance < amount) {
        const message = t('depositModal.walletInsufficientBalance', { balance: walletBalance.toFixed(4) })
        const displayMessage = message.includes('depositModal.') 
          ? `Insufficient USDT in wallet. Current balance: ${walletBalance.toFixed(4)} USDT`
          : message
        alert(displayMessage)
        isProcessing.value = false
        return
      }

      // 调用 TRON 充值函数
      console.log('[Deposit] Starting TRON deposit:', amount, 'USDT')
      const result = await depositWithTronRelay(amount)
      
      if (!result.success) {
        alert(result.error || t('depositModal.depositFailed'))
        return
      }

      console.log('[Deposit] TRON deposit successful:', result.txHash)

      // 触发成功事件
      emit('success', {
        amount: depositAmount.value,
        txHash: result.txHash
      })

      alert(t('depositModal.depositSuccess', { amount: depositAmount.value }))
      closeModal()

    } catch (error) {
      console.error('[Deposit] TRON deposit error:', error)
      alert(error.message || t('depositModal.transferFailed'))
    } finally {
      isProcessing.value = false
    }
    
    return
  }

  // ETH/BSC 链处理
  if (!isDAppBrowser()) {
    alert(t('depositModal.openInWalletBrowser'))
    return
  }

  if (!walletStore.isConnected) {
    alert(t('depositModal.connectWalletFirst'))
    return
  }

  isProcessing.value = true

  try {
    const ethereum = window.ethereum
    const chainConfig = currentChainConfig.value
    
    // 检查当前网络是否是选中的链
    const { chainId } = await getNetworkInfo()
    if (chainId !== chainConfig.chainId) {
      // 尝试切换到选中的网络
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainConfig.chainId }]
        })
      } catch (switchError) {
        if (switchError.code === 4902) {
          // 网络不存在，尝试添加（仅对BSC等非内置网络）
          if (selectedChain.value === 'BSC') {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: chainConfig.chainId,
                chainName: chainConfig.chainName,
                nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                rpcUrls: [chainConfig.rpcUrl],
                blockExplorerUrls: [chainConfig.explorer]
              }]
            })
          } else {
            // ETH主网应该已内置，如果没有则提示用户
            alert('Please add Ethereum Mainnet to your wallet manually')
            isProcessing.value = false
            return
          }
        } else {
          throw switchError
        }
      }
    }

    const amount = parseFloat(depositAmount.value)
    
    // ✅ 检查钱包 USDT 余额是否足够
    const walletBalance = await getWalletUsdtBalance()
    if (walletBalance < amount) {
      // 显示余额不足提示
      const message = t('depositModal.walletInsufficientBalance', { balance: walletBalance.toFixed(4) })
      // 如果翻译返回原始键名，使用后备文本
      const displayMessage = message.includes('depositModal.') 
        ? `Insufficient USDT in wallet. Current balance: ${walletBalance.toFixed(4)} USDT`
        : message
      alert(displayMessage)
      isProcessing.value = false
      return
    }

    // 构造 USDT 转账数据
    // transfer(address to, uint256 amount)
    // 函数签名: 0xa9059cbb
    // 注意：ETH的USDT是6位小数，BSC的USDT是18位小数
    const decimals = chainConfig.decimals
    const amountWei = BigInt(Math.floor(amount * Math.pow(10, decimals))).toString(16).padStart(64, '0')
    const toAddress = platformWalletAddress.value.slice(2).padStart(64, '0')
    const data = '0xa9059cbb' + toAddress + amountWei

    // 发送交易
    const transactionHash = await ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: walletStore.walletAddress,
        to: USDT_CONTRACT_ADDRESS.value,
        data: data,
        gas: selectedChain.value === 'ETH' ? '0x14C08' : '0x186A0' // ETH 85000, BSC 100000
      }]
    })

    console.log('[Deposit] Transaction sent:', transactionHash)

    // 提交充值记录到后端（后端会验证交易状态）
    const submitResult = await submitDepositRecord(transactionHash)
    
    if (!submitResult.success) {
      alert(submitResult.message || t('depositModal.depositFailed'))
      return
    }

    // 触发成功事件
    emit('success', {
      amount: depositAmount.value,
      txHash: transactionHash
    })

    alert(t('depositModal.depositSuccess', { amount: depositAmount.value }))
    closeModal()

  } catch (error) {
    console.error('[Deposit] Transfer error:', error)
    
    if (error.code === 4001) {
      alert(t('depositModal.transactionCancelled'))
    } else if (error.code === -32000) {
      alert(t('depositModal.insufficientBalance'))
    } else {
      alert(error.message || t('depositModal.transferFailed'))
    }
  } finally {
    isProcessing.value = false
  }
}

/**
 * 提交充值记录到后端
 * 后端会验证区块链交易状态
 * @param {string} transactionHash - 交易哈希
 * @returns {Promise<{success: boolean, message?: string}>}
 */
const submitDepositRecord = async (transactionHash) => {
  try {
    // 使用安全API工具发送请求（自动包含CSRF令牌）
    const data = await post('/api/user/deposit', {
      wallet_address: walletStore.walletAddress,
      amount: depositAmount.value,
      tx_hash: transactionHash,
      token: 'USDT',
      chain: selectedChain.value  // 添加链信息
    })

    // ✅ secureApi 工具已处理错误，直接检查 success 字段
    if (data.success) {
      // 更新钱包余额
      const usdtBalance = parseFloat(data.data.new_balance.usdt) || 0
      const wldBalance = parseFloat(data.data.new_balance.wld) || 0

      walletStore.setUsdtBalance(data.data.new_balance.usdt)
      walletStore.setWldBalance(data.data.new_balance.wld)

      // 更新总权益值（USDT 余额 + WLD 折算）
      const wldPrice = 0 // TODO: 从价格 API 获取 WLD 价格
      const totalEquity = usdtBalance + (wldBalance * wldPrice)
      walletStore.setEquityValue(totalEquity.toFixed(4))

      console.log('[Deposit] Balance updated:', {
        usdt: data.data.new_balance.usdt,
        wld: data.data.new_balance.wld,
        equity: totalEquity.toFixed(4)
      })
      
      return { success: true }
    } else {
      console.error('[Deposit] Server rejected deposit:', data.message)
      return { success: false, message: data.message }
    }
  } catch (error) {
    console.error('[Deposit] Submit record error:', error)
    return { success: false, message: error.message }
  }
}
</script>

<style scoped>
/* 遮罩层 */
.deposit-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10100;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 弹窗容器 - 增加高度以容纳链选择 */
.deposit-modal {
  width: 302px;
  height: 420px;  /* 增加高度确保按钮不超出 */
  /* 移除背景图片，使用渐变背景 */
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 20px 20px 24px 20px;  /* 调整padding */
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  animation: scaleIn 0.2s ease-out;
  overflow: hidden;  /* 防止内容溢出 */
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 标题 */
.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 16px 0;
  text-align: center;
}

/* 链选择区域 */
.chain-select-section {
  margin-bottom: 12px;
}

.chain-buttons {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 0;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.chain-buttons::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}

.chain-btn {
  flex: 0 0 auto;
  min-width: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 8px;
  background: rgba(0, 0, 0, 0.5);
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s ease;
  box-sizing: border-box;
}

.chain-btn:hover {
  background: rgba(245, 182, 56, 0.15);
  border-color: rgba(245, 182, 56, 0.5);
  transform: translateY(-2px);
}

.chain-btn.selected {
  background: linear-gradient(135deg, rgba(245, 182, 56, 0.3) 0%, rgba(245, 182, 56, 0.15) 100%);
  border-color: rgb(245, 182, 56);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(245, 182, 56, 0.3);
}

/* 链图标图片样式 */
.chain-logo-img {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.chain-icon {
  font-size: 24px;
  line-height: 1;
}

.chain-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.chain-name {
  font-weight: 700;
  font-size: 13px;
  color: #ffffff;
  white-space: nowrap;
}

.chain-desc {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 400;
  white-space: nowrap;
}

/* 输入区域 */
.input-section {
  margin-bottom: 12px;
}

.input-label {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
}

.amount-input-wrapper {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  overflow: hidden;
}

.amount-input {
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 20px;
  font-weight: 600;
  outline: none;
  box-sizing: border-box;
}

.amount-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

/* 快捷金额按钮 */
.quick-amounts {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
}

.quick-amount-btn {
  flex: 1;
  padding: 8px 4px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 16px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-amount-btn:hover {
  background: rgba(245, 182, 56, 0.2);
  border-color: rgb(245, 182, 56);
}

.quick-amount-btn.selected {
  background: rgb(245, 182, 56);
  border-color: rgb(245, 182, 56);
  color: #000000;
  font-weight: 600;
}

/* 提示文字 */
.tip-text {
  font-size: 12px;
  color: rgb(245, 182, 56);
  text-align: center;
  margin: 0 0 12px 0;
  flex-shrink: 0;
}

/* 手动转账模式 */
.manual-transfer-section {
  margin-bottom: 12px;
  flex: 1;
}

.address-display {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(245, 182, 56, 0.4);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.address-text {
  flex: 1;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  word-break: break-all;
  line-height: 1.4;
}

.copy-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  background: rgb(245, 182, 56);
  border: none;
  border-radius: 6px;
  color: #000000;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.copy-btn:hover {
  background: rgb(255, 192, 66);
}

.copy-btn:active {
  transform: scale(0.96);
}

.manual-transfer-tip {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin: 10px 0 0 0;
  line-height: 1.5;
  text-align: center;
}

/* 按钮区域 */
.button-group {
  display: flex;
  gap: 16px;
  margin-top: auto;
  flex-shrink: 0;
  padding-bottom: 4px;  /* 确保按钮不贴边 */
}

.btn-cancel {
  flex: 1;
  height: 44px;
  background: rgba(100, 100, 100, 0.8);
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel:hover {
  background: rgba(80, 80, 80, 0.9);
}

.btn-cancel:active {
  transform: scale(0.98);
}

.btn-sure {
  flex: 1;
  height: 44px;
  background: rgb(245, 182, 56);
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #000000;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-sure:hover:not(:disabled) {
  background: rgb(255, 192, 66);
}

.btn-sure:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-sure:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 移动端适配 */
@media (max-width: 340px) {
  .deposit-modal {
    width: 290px;
    height: 400px;
    padding: 18px 16px 20px 16px;
  }

  .modal-title {
    font-size: 18px;
    margin-bottom: 10px;
  }

  .chain-btn {
    padding: 8px 6px;
    font-size: 12px;
  }

  .chain-logo-img {
    width: 28px;
    height: 28px;
  }

  .quick-amount-btn {
    font-size: 12px;
    padding: 6px 2px;
  }

  .btn-cancel,
  .btn-sure {
    height: 40px;
    font-size: 15px;
  }
}
</style>
