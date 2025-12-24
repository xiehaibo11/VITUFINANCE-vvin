<template>
  <div class="page-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>系统设置</h2>
      <p class="description">管理系统配置和安全设置</p>
    </div>
    
    <!-- 平台收款地址配置（多链支持） -->
    <el-card class="settings-card" v-loading="settingsLoading">
      <template #header>
        <div class="card-header">
          <el-icon :size="20"><Wallet /></el-icon>
          <span>平台收款地址配置</span>
          <el-tag type="success" size="small" style="margin-left: 10px">多链支持</el-tag>
        </div>
      </template>
      
      <!-- 安全密码保护区域 -->
      <div class="security-protection-section">
        <el-divider content-position="left">
          <span class="chain-divider">🔐 安全保护</span>
        </el-divider>
        
        <div class="security-status">
          <el-icon :size="18" :class="walletSecurity.isPasswordSet ? 'status-secure' : 'status-warning'">
            <component :is="walletSecurity.isPasswordSet ? 'CircleCheck' : 'Warning'" />
          </el-icon>
          <span v-if="walletSecurity.isPasswordSet" class="status-text secure">安全密码已设置</span>
          <span v-else class="status-text warning">安全密码未设置，建议立即设置以保护收款地址</span>
        </div>
        
        <!-- 未设置密码时显示设置表单 -->
        <el-form 
          v-if="!walletSecurity.isPasswordSet" 
          :model="walletSecurity.initForm"
          label-width="120px" 
          style="max-width: 500px; margin-top: 16px"
        >
          <el-form-item label="设置安全密码">
            <el-input
              v-model="walletSecurity.initForm.password"
              type="password"
              placeholder="请设置安全密码（至少6位）"
              show-password
            />
          </el-form-item>
          <el-form-item label="确认密码">
            <el-input
              v-model="walletSecurity.initForm.confirmPassword"
              type="password"
              placeholder="请再次输入安全密码"
              show-password
            />
          </el-form-item>
          <el-form-item>
            <el-button type="success" :loading="walletSecurity.loading" @click="initSecurityPassword">
              <el-icon><Lock /></el-icon>
              设置安全密码
            </el-button>
          </el-form-item>
        </el-form>
        
        <!-- 已设置密码时显示修改按钮 -->
        <div v-else class="security-actions">
          <el-button type="warning" plain size="small" @click="showChangePasswordDialog">
            <el-icon><Edit /></el-icon>
            修改安全密码
          </el-button>
        </div>
      </div>
      
      <el-form label-width="140px" style="max-width: 700px">
        <!-- BSC 收款地址 -->
        <el-divider content-position="left">
          <span class="chain-divider">🟡 BSC (BNB Smart Chain)</span>
        </el-divider>
        <el-form-item label="BSC 收款地址">
          <el-input
            v-model="platformSettings.wallet_address_bsc"
            placeholder="请输入BSC链USDT收款地址"
            clearable
          >
            <template #prepend>BSC</template>
          </el-input>
          <div class="form-tip">BSC链 USDT 合约: 0x55d398326f99059fF775485246999027B3197955 (18位精度)</div>
        </el-form-item>
        
        <!-- ETH 收款地址 -->
        <el-divider content-position="left">
          <span class="chain-divider">🔷 Ethereum (ETH)</span>
        </el-divider>
        <el-form-item label="ETH 收款地址">
          <el-input
            v-model="platformSettings.wallet_address_eth"
            placeholder="请输入以太坊链USDT收款地址"
            clearable
          >
            <template #prepend>ETH</template>
          </el-input>
          <div class="form-tip">ETH链 USDT 合约: 0xdAC17F958D2ee523a2206206994597C13D831ec7 (6位精度)</div>
        </el-form-item>
        
        <!-- 默认网络选择 -->
        <el-divider content-position="left">
          <span class="chain-divider">⚙️ 默认设置</span>
        </el-divider>
        <el-form-item label="默认网络">
          <el-select v-model="platformSettings.network" style="width: 200px">
            <el-option label="BSC (BNB Smart Chain)" value="BSC" />
            <el-option label="ETH (Ethereum)" value="ETH" />
          </el-select>
          <div class="form-tip">用户打开充值页面时默认选中的网络</div>
        </el-form-item>
        
        <el-form-item label="代币">
          <el-select v-model="platformSettings.token" style="width: 200px">
            <el-option label="USDT" value="USDT" />
            <el-option label="USDC" value="USDC" />
          </el-select>
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" :loading="savingSettings" @click="handleSaveSettings">
            <el-icon><Check /></el-icon>
            保存配置
          </el-button>
          <el-button @click="fetchSettings">
            <el-icon><Refresh /></el-icon>
            重新加载
          </el-button>
        </el-form-item>
      </el-form>
      
      <el-alert
        title="多链收款地址说明"
        type="warning"
        :closable="false"
        show-icon
        style="margin-top: 20px"
      >
        <template #default>
          <ul class="security-tips">
            <li><strong>BSC链</strong>：Gas费低，确认快，推荐大多数用户使用</li>
            <li><strong>ETH链</strong>：主流公链，但Gas费较高，适合大额充值</li>
            <li>修改后立即生效，用户充值时可选择任一网络</li>
            <li>请务必仔细核对地址，错误的地址可能导致资产丢失</li>
            <li><strong style="color: var(--admin-danger)">重要：</strong>设置安全密码后，修改收款地址需要验证安全密码</li>
          </ul>
        </template>
      </el-alert>
    </el-card>
    
    <!-- 安全密码验证对话框 -->
    <el-dialog
      v-model="walletSecurity.verifyDialogVisible"
      title="🔐 安全验证"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px">
        <el-form-item label="安全密码">
          <el-input
            v-model="walletSecurity.verifyPassword"
            type="password"
            placeholder="请输入安全密码"
            show-password
            @keyup.enter="confirmSaveSettings"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="walletSecurity.verifyDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingSettings" @click="confirmSaveSettings">
          确认保存
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 修改安全密码对话框 -->
    <el-dialog
      v-model="walletSecurity.changeDialogVisible"
      title="🔐 修改安全密码"
      width="450px"
      :close-on-click-modal="false"
    >
      <el-form :model="walletSecurity.changeForm" label-width="100px">
        <el-form-item label="旧密码">
          <el-input
            v-model="walletSecurity.changeForm.oldPassword"
            type="password"
            placeholder="请输入当前安全密码"
            show-password
          />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input
            v-model="walletSecurity.changeForm.newPassword"
            type="password"
            placeholder="请输入新密码（至少6位）"
            show-password
          />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input
            v-model="walletSecurity.changeForm.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="walletSecurity.changeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="walletSecurity.loading" @click="changeSecurityPassword">
          确认修改
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 管理员头像设置 -->
    <el-card class="settings-card" style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <el-icon :size="20"><Avatar /></el-icon>
          <span>管理员头像设置</span>
        </div>
      </template>
      
      <div class="avatar-section">
        <div class="avatar-preview">
          <el-avatar :size="120" :src="avatarUrl" class="current-avatar">
            <el-icon :size="48"><UserFilled /></el-icon>
          </el-avatar>
          <div class="avatar-info">
            <p class="avatar-title">当前头像</p>
            <p class="avatar-tip">支持 JPG、PNG 格式，建议尺寸 200x200</p>
          </div>
        </div>
        
        <div class="avatar-upload">
          <el-upload
            class="avatar-uploader"
            action="/api/admin/upload-avatar"
            :headers="uploadHeaders"
            :show-file-list="false"
            :on-success="handleAvatarSuccess"
            :on-error="handleAvatarError"
            :before-upload="beforeAvatarUpload"
            accept="image/jpeg,image/png,image/gif"
          >
            <el-button type="primary">
              <el-icon><Upload /></el-icon>
              上传新头像
            </el-button>
          </el-upload>
          
          <el-button 
            v-if="avatarUrl" 
            type="danger" 
            plain 
            @click="resetAvatar"
            style="margin-left: 12px"
          >
            <el-icon><Delete /></el-icon>
            恢复默认
          </el-button>
        </div>
      </div>
    </el-card>
    
    <!-- 修改密码卡片 -->
    <el-card class="settings-card" style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <el-icon :size="20"><Lock /></el-icon>
          <span>修改管理员密码</span>
        </div>
      </template>
      
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-width="120px"
        style="max-width: 500px"
      >
        <el-form-item label="当前密码" prop="oldPassword">
          <el-input
            v-model="passwordForm.oldPassword"
            type="password"
            placeholder="请输入当前密码"
            show-password
          />
        </el-form-item>
        
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            placeholder="请输入新密码（至少8位）"
            show-password
          />
          <div class="password-strength">
            <span class="strength-label">密码强度：</span>
            <span :class="['strength-value', passwordStrength.class]">
              {{ passwordStrength.text }}
            </span>
          </div>
        </el-form-item>
        
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
          />
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleChangePassword">
            <el-icon><Check /></el-icon>
            确认修改
          </el-button>
          <el-button @click="resetForm">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-form-item>
      </el-form>
      
      <el-alert
        title="密码安全提示"
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 20px"
      >
        <template #default>
          <ul class="security-tips">
            <li>密码长度至少8位，建议包含大小写字母、数字和特殊字符</li>
            <li>定期更换密码可提高账户安全性</li>
            <li>请勿使用与其他网站相同的密码</li>
            <li>修改密码后需要重新登录</li>
          </ul>
        </template>
      </el-alert>
    </el-card>
    
    <!-- 语音播报设置卡片 -->
    <el-card class="settings-card" style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <el-icon :size="20"><Microphone /></el-icon>
          <span>语音播报设置</span>
        </div>
      </template>
      
      <el-form label-width="120px" style="max-width: 600px">
        <!-- 语音播报开关 -->
        <el-form-item label="语音播报">
          <div class="speech-switch-wrapper">
            <el-switch
              v-model="speechSettings.enabled"
              active-text="已开启"
              inactive-text="已关闭"
              @change="handleSpeechEnabledChange"
            />
            <span class="switch-tip">开启后，新充值和提款会有语音提示</span>
          </div>
        </el-form-item>
        
        <!-- 音量设置 -->
        <el-form-item label="播报音量">
          <div class="slider-wrapper">
            <el-slider
              v-model="speechSettings.volume"
              :min="0"
              :max="100"
              :disabled="!speechSettings.enabled"
              @change="handleSpeechVolumeChange"
            />
            <span class="slider-value">{{ speechSettings.volume }}%</span>
          </div>
        </el-form-item>
        
        <!-- 语速设置 -->
        <el-form-item label="播报语速">
          <div class="slider-wrapper">
            <el-slider
              v-model="speechSettings.rate"
              :min="50"
              :max="200"
              :disabled="!speechSettings.enabled"
              :format-tooltip="(val) => `${val}%`"
              @change="handleSpeechRateChange"
            />
            <span class="slider-value">{{ speechSettings.rate }}%</span>
          </div>
        </el-form-item>
        
        <!-- 测试按钮 -->
        <el-form-item label="测试播报">
          <el-button-group>
            <el-button 
              type="primary" 
              :disabled="!speechSettings.enabled"
              @click="testDepositSpeech"
            >
              <el-icon><Download /></el-icon>
              测试充值播报
            </el-button>
            <el-button 
              type="warning" 
              :disabled="!speechSettings.enabled"
              @click="testWithdrawSpeech"
            >
              <el-icon><Upload /></el-icon>
              测试提款播报
            </el-button>
          </el-button-group>
        </el-form-item>
      </el-form>
      
      <el-alert
        title="语音播报说明"
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 20px"
      >
        <template #default>
          <ul class="security-tips">
            <li><strong>充值通知</strong>：收到新充值时，播报"你有一笔充值订单来啦"，然后播报用户ID和金额</li>
            <li><strong>提款通知</strong>：收到新提款申请时，播报用户ID和提款金额</li>
            <li>需要浏览器支持 Web Speech API，建议使用 Chrome 浏览器</li>
            <li>首次启用可能需要允许浏览器使用语音功能</li>
          </ul>
        </template>
      </el-alert>
    </el-card>
    
    <!-- 系统信息卡片 -->
    <el-card class="settings-card" style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <el-icon :size="20"><InfoFilled /></el-icon>
          <span>系统信息</span>
        </div>
      </template>
      
      <el-descriptions :column="2" border>
        <el-descriptions-item label="系统版本">v1.0.0</el-descriptions-item>
        <el-descriptions-item label="当前用户">{{ adminInfo.username }}</el-descriptions-item>
        <el-descriptions-item label="用户角色">
          <el-tag type="primary">{{ adminInfo.role === 'super_admin' ? '超级管理员' : '管理员' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="登录时间">{{ loginTime }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup>
/**
 * 系统设置页面
 * 功能：修改管理员密码、查看系统信息
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Lock, Check, Refresh, InfoFilled, Wallet, Avatar, Upload, Delete, UserFilled,
  Microphone, Download, // Speech settings related icons
  CircleCheck, Warning, Edit // Wallet security icons
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import request from '@/api'
// 引入语音播报服务
import speechService, {
  initSpeechService,
  speechEnabled,
  speechVolume,
  speechRate,
  saveSettings as saveSpeechSettings,
  speakNewDepositOrder,
  speakDepositComplete,
  speakWithdrawRequest,
  testSpeech,
  activateSpeech
} from '@/utils/speechService'

const router = useRouter()

// 加载状态
const loading = ref(false)
const settingsLoading = ref(false)
const savingSettings = ref(false)

// 平台收款地址配置（多链支持）
const platformSettings = reactive({
  wallet_address: '',           // 兼容旧版
  wallet_address_bsc: '',       // BSC链收款地址
  wallet_address_eth: '',       // ETH链收款地址
  network: 'BSC',
  token: 'USDT'
})

// 钱包安全密码保护相关
const walletSecurity = reactive({
  isPasswordSet: false,         // 安全密码是否已设置
  loading: false,               // 加载状态
  verifyDialogVisible: false,   // 验证密码对话框
  changeDialogVisible: false,   // 修改密码对话框
  verifyPassword: '',           // 验证用的密码
  initForm: {                   // 初始化密码表单
    password: '',
    confirmPassword: ''
  },
  changeForm: {                 // 修改密码表单
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  }
})

// 头像相关
const avatarUrl = ref('')
const uploadHeaders = {
  Authorization: `Bearer ${localStorage.getItem('admin_token')}`
}

// 表单引用
const passwordFormRef = ref(null)

// 密码表单
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

// 管理员信息
const adminInfo = reactive({
  username: 'admin',
  role: 'super_admin'
})

// 登录时间（从token解析或使用当前时间）
const loginTime = ref(dayjs().format('YYYY-MM-DD HH:mm:ss'))

/**
 * 计算密码强度
 */
const passwordStrength = computed(() => {
  const pwd = passwordForm.newPassword
  if (!pwd) return { text: '-', class: '' }
  
  let score = 0
  
  // 长度评分
  if (pwd.length >= 8) score += 1
  if (pwd.length >= 12) score += 1
  
  // 包含小写字母
  if (/[a-z]/.test(pwd)) score += 1
  
  // 包含大写字母
  if (/[A-Z]/.test(pwd)) score += 1
  
  // 包含数字
  if (/[0-9]/.test(pwd)) score += 1
  
  // 包含特殊字符
  if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score += 1
  
  if (score <= 2) return { text: '弱', class: 'weak' }
  if (score <= 4) return { text: '中', class: 'medium' }
  return { text: '强', class: 'strong' }
})

/**
 * 验证确认密码
 */
const validateConfirmPassword = (rule, value, callback) => {
  if (value !== passwordForm.newPassword) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

/**
 * 验证新密码
 */
const validateNewPassword = (rule, value, callback) => {
  if (value === passwordForm.oldPassword) {
    callback(new Error('新密码不能与当前密码相同'))
  } else if (value.length < 8) {
    callback(new Error('密码长度至少8位'))
  } else {
    callback()
  }
}

// 表单验证规则
const passwordRules = {
  oldPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码长度至少8位', trigger: 'blur' },
    { validator: validateNewPassword, trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

/**
 * 修改密码
 */
const handleChangePassword = async () => {
  // 表单验证
  const valid = await passwordFormRef.value.validate().catch(() => false)
  if (!valid) return
  
  // 二次确认
  try {
    await ElMessageBox.confirm(
      '确定要修改密码吗？修改后需要重新登录。',
      '确认修改',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return // 用户取消
  }
  
  loading.value = true
  
  try {
    const res = await request.post('/change-password', {
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    })
    
    if (res.success) {
      ElMessage.success('密码修改成功，请重新登录')
      
      // 清除 token 并跳转登录页
      localStorage.removeItem('admin_token')
      
      setTimeout(() => {
        router.push('/login')
      }, 1500)
    } else {
      ElMessage.error(res.message || '密码修改失败')
    }
  } catch (error) {
    console.error('修改密码失败:', error)
    ElMessage.error('修改密码失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

/**
 * 重置表单
 */
const resetForm = () => {
  passwordFormRef.value?.resetFields()
}

// ==================== 头像相关函数 ====================

/**
 * 获取当前头像
 */
const fetchAvatar = async () => {
  try {
    const res = await request.get('/settings/avatar')
    if (res.success && res.data?.avatar_url) {
      avatarUrl.value = res.data.avatar_url
    }
  } catch (error) {
    console.error('获取头像失败:', error)
  }
}

/**
 * 上传头像前的验证
 */
const beforeAvatarUpload = (file) => {
  const isImage = ['image/jpeg', 'image/png', 'image/gif'].includes(file.type)
  const isLt2M = file.size / 1024 / 1024 < 2

  if (!isImage) {
    ElMessage.error('头像只能是 JPG/PNG/GIF 格式!')
    return false
  }
  if (!isLt2M) {
    ElMessage.error('头像大小不能超过 2MB!')
    return false
  }
  return true
}

/**
 * 头像上传成功
 */
const handleAvatarSuccess = (response) => {
  if (response.success) {
    avatarUrl.value = response.data.avatar_url
    ElMessage.success('头像上传成功')
    // 通知其他组件更新头像
    window.dispatchEvent(new CustomEvent('avatar-updated', { detail: response.data.avatar_url }))
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

/**
 * 头像上传失败
 */
const handleAvatarError = () => {
  ElMessage.error('头像上传失败，请重试')
}

/**
 * 恢复默认头像
 */
const resetAvatar = async () => {
  try {
    await ElMessageBox.confirm('确定要恢复默认头像吗？', '提示', {
      type: 'warning'
    })
    
    const res = await request.delete('/settings/avatar')
    if (res.success) {
      avatarUrl.value = ''
      ElMessage.success('已恢复默认头像')
      window.dispatchEvent(new CustomEvent('avatar-updated', { detail: '' }))
    } else {
      ElMessage.error(res.message || '操作失败')
    }
  } catch {
    // 用户取消
  }
}

/**
 * 获取系统设置（多链支持）
 */
const fetchSettings = async () => {
  settingsLoading.value = true
  try {
    const res = await request.get('/settings')
    if (res.success && res.data?.map) {
      const map = res.data.map
      // 兼容旧版单地址
      platformSettings.wallet_address = map.platform_wallet_address?.value || ''
      // 多链地址
      platformSettings.wallet_address_bsc = map.platform_wallet_bsc?.value || map.platform_wallet_address?.value || ''
      platformSettings.wallet_address_eth = map.platform_wallet_eth?.value || ''
      platformSettings.network = map.platform_network?.value || 'BSC'
      platformSettings.token = map.platform_token?.value || 'USDT'
    }
  } catch (error) {
    console.error('获取设置失败:', error)
    ElMessage.error('获取设置失败')
  } finally {
    settingsLoading.value = false
  }
}

// ==================== 钱包安全密码相关函数 ====================

/**
 * 获取钱包安全密码状态
 */
const fetchWalletSecurityStatus = async () => {
  try {
    const res = await request.get('/wallet-security/status')
    if (res.success) {
      walletSecurity.isPasswordSet = res.data.isPasswordSet
    }
  } catch (error) {
    console.error('获取安全密码状态失败:', error)
  }
}

/**
 * 初始化设置安全密码
 */
const initSecurityPassword = async () => {
  const { password, confirmPassword } = walletSecurity.initForm
  
  if (!password || password.length < 6) {
    ElMessage.warning('安全密码至少需要6位')
    return
  }
  
  if (password !== confirmPassword) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }
  
  walletSecurity.loading = true
  try {
    const res = await request.post('/wallet-security/init', { password })
    if (res.success) {
      ElMessage.success('安全密码设置成功')
      walletSecurity.isPasswordSet = true
      walletSecurity.initForm.password = ''
      walletSecurity.initForm.confirmPassword = ''
    } else {
      ElMessage.error(res.message || '设置失败')
    }
  } catch (error) {
    console.error('设置安全密码失败:', error)
    ElMessage.error('设置安全密码失败')
  } finally {
    walletSecurity.loading = false
  }
}

/**
 * 显示修改安全密码对话框
 */
const showChangePasswordDialog = () => {
  walletSecurity.changeForm.oldPassword = ''
  walletSecurity.changeForm.newPassword = ''
  walletSecurity.changeForm.confirmPassword = ''
  walletSecurity.changeDialogVisible = true
}

/**
 * 修改安全密码
 */
const changeSecurityPassword = async () => {
  const { oldPassword, newPassword, confirmPassword } = walletSecurity.changeForm
  
  if (!oldPassword) {
    ElMessage.warning('请输入当前安全密码')
    return
  }
  
  if (!newPassword || newPassword.length < 6) {
    ElMessage.warning('新密码至少需要6位')
    return
  }
  
  if (newPassword !== confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  
  walletSecurity.loading = true
  try {
    const res = await request.post('/wallet-security/change', { oldPassword, newPassword })
    if (res.success) {
      ElMessage.success('安全密码修改成功')
      walletSecurity.changeDialogVisible = false
    } else {
      ElMessage.error(res.message || '修改失败')
    }
  } catch (error) {
    console.error('修改安全密码失败:', error)
    ElMessage.error(error.response?.data?.message || '修改安全密码失败')
  } finally {
    walletSecurity.loading = false
  }
}

/**
 * 处理保存设置按钮点击
 * If security password is set, show verification dialog
 */
const handleSaveSettings = async () => {
  // Validate at least one address is provided
  if (!platformSettings.wallet_address_bsc && !platformSettings.wallet_address_eth) {
    ElMessage.warning('请至少输入一个收款地址')
    return
  }
  
  // Validate address format
  const addressRegex = /^0x[a-fA-F0-9]{40}$/
  
  if (platformSettings.wallet_address_bsc && !addressRegex.test(platformSettings.wallet_address_bsc)) {
    ElMessage.error('BSC收款地址格式无效（0x开头，40位十六进制）')
    return
  }
  
  if (platformSettings.wallet_address_eth && !addressRegex.test(platformSettings.wallet_address_eth)) {
    ElMessage.error('ETH收款地址格式无效（0x开头，40位十六进制）')
    return
  }
  
  // If security password is set, show verification dialog
  if (walletSecurity.isPasswordSet) {
    walletSecurity.verifyPassword = ''
    walletSecurity.verifyDialogVisible = true
  } else {
    // No password set, save directly
    await saveWalletSettings('')
  }
}

/**
 * 确认保存设置（验证密码后）
 */
const confirmSaveSettings = async () => {
  if (!walletSecurity.verifyPassword) {
    ElMessage.warning('请输入安全密码')
    return
  }
  
  await saveWalletSettings(walletSecurity.verifyPassword)
}

/**
 * 保存钱包设置（带安全密码）
 */
const saveWalletSettings = async (securityPassword) => {
  savingSettings.value = true
  try {
    const res = await request.post('/wallet-config', {
      securityPassword,
      settings: {
        // Compatible with old version (default use BSC address)
        platform_wallet_address: platformSettings.wallet_address_bsc || platformSettings.wallet_address_eth,
        // Multi-chain addresses
        platform_wallet_bsc: platformSettings.wallet_address_bsc,
        platform_wallet_eth: platformSettings.wallet_address_eth,
        platform_network: platformSettings.network,
        platform_token: platformSettings.token
      }
    })
    
    if (res.success) {
      ElMessage.success('多链收款地址配置保存成功')
      walletSecurity.verifyDialogVisible = false
      walletSecurity.verifyPassword = ''
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (error) {
    console.error('保存设置失败:', error)
    ElMessage.error(error.response?.data?.message || '保存设置失败')
  } finally {
    savingSettings.value = false
  }
}

/**
 * 保存平台设置（多链支持）- 保留旧函数作为兼容
 */
const saveSettings = async () => {
  await handleSaveSettings()
}

// ==================== 语音播报设置 ====================

// 语音设置响应式对象
const speechSettings = reactive({
  enabled: false,
  volume: 80,  // 0-100
  rate: 85     // 50-200，默认85%为适中语速
})

/**
 * 初始化语音设置
 */
const initSpeechSettings = () => {
  // 从 speechService 同步状态
  speechSettings.enabled = speechEnabled.value
  speechSettings.volume = Math.round(speechVolume.value * 100)
  speechSettings.rate = Math.round(speechRate.value * 100)
}

/**
 * 处理语音开关变化
 */
const handleSpeechEnabledChange = (enabled) => {
  speechEnabled.value = enabled
  saveSpeechSettings()
  
  if (enabled) {
    // 测试播放一次，激活语音
    testSpeech().then(() => {
      ElMessage.success('语音播报已开启')
    }).catch(() => {
      ElMessage.warning('语音功能可能不可用，请检查浏览器设置')
    })
  } else {
    ElMessage.info('语音播报已关闭')
  }
}

/**
 * 处理音量变化
 */
const handleSpeechVolumeChange = (volume) => {
  speechVolume.value = volume / 100
  saveSpeechSettings()
}

/**
 * 处理语速变化
 */
const handleSpeechRateChange = (rate) => {
  speechRate.value = rate / 100
  saveSpeechSettings()
}

/**
 * 测试充值语音播报
 */
const testDepositSpeech = async () => {
  try {
    // 先激活语音（浏览器安全策略要求用户交互触发）
    await activateSpeech()
    
    // 播放新订单提示（两次）
    await speakNewDepositOrder()
    
    // 延迟后播放详细信息
    setTimeout(async () => {
      await speakDepositComplete('ABC123', 100, 'USDT')
    }, 500)
    
    ElMessage.success('正在播放充值语音测试')
  } catch (error) {
    console.error('语音测试失败:', error)
    ElMessage.error('语音播放失败，请检查浏览器设置')
  }
}

/**
 * 测试提款语音播报
 */
const testWithdrawSpeech = async () => {
  try {
    // 先激活语音（浏览器安全策略要求用户交互触发）
    await activateSpeech()
    
    await speakWithdrawRequest('XYZ789', 50, 'USDT')
    ElMessage.success('正在播放提款语音测试')
  } catch (error) {
    console.error('语音测试失败:', error)
    ElMessage.error('语音播放失败，请检查浏览器设置')
  }
}

// ==================== 页面初始化 ====================

// 页面加载时获取设置
onMounted(() => {
  // 初始化语音服务
  initSpeechService()
  // 初始化语音设置UI
  initSpeechSettings()
})

fetchSettings()
fetchAvatar()
fetchWalletSecurityStatus()
</script>

<style lang="scss" scoped>
.settings-card {
  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
  }
}

.password-strength {
  margin-top: 8px;
  font-size: 12px;
  
  .strength-label {
    color: var(--admin-text-secondary);
  }
  
  .strength-value {
    font-weight: 600;
    margin-left: 4px;
    
    &.weak {
      color: var(--admin-danger);
    }
    
    &.medium {
      color: var(--admin-warning);
    }
    
    &.strong {
      color: var(--admin-success);
    }
  }
}

.security-tips {
  margin: 0;
  padding-left: 20px;
  
  li {
    line-height: 1.8;
    color: var(--admin-text-regular);
  }
}

.form-tip {
  font-size: 12px;
  color: var(--admin-text-secondary);
  margin-top: 4px;
}

// ==================== 头像上传样式 ====================
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 20px 0;
}

.avatar-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  
  .current-avatar {
    border: 4px solid var(--admin-border-color);
    box-shadow: 0 4px 12px var(--admin-shadow-color, rgba(0, 0, 0, 0.1));
    transition: all 0.3s ease;
    
    &:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px var(--admin-shadow-color, rgba(0, 0, 0, 0.15));
    }
  }
  
  .avatar-info {
    text-align: center;
    
    .avatar-title {
      margin: 0 0 4px;
      font-size: 16px;
      font-weight: 600;
      color: var(--admin-text-primary);
    }
    
    .avatar-tip {
      margin: 0;
      font-size: 12px;
      color: var(--admin-text-secondary);
    }
  }
}

.avatar-upload {
  display: flex;
  align-items: center;
  gap: 12px;
  
  .avatar-uploader {
    :deep(.el-upload) {
      display: inline-block;
    }
  }
}

// 响应式适配
@media (max-width: 768px) {
  .avatar-section {
    padding: 10px 0;
  }
  
  .avatar-upload {
    flex-direction: column;
    gap: 8px;
    
    .el-button {
      width: 100%;
    }
  }
}

// ==================== 语音播报设置样式 ====================
.speech-switch-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
  
  .switch-tip {
    font-size: 12px;
    color: var(--admin-text-secondary);
  }
}

.slider-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  
  .el-slider {
    flex: 1;
    max-width: 300px;
  }
  
  .slider-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--admin-primary);
    min-width: 50px;
    text-align: right;
  }
}

// 语音测试按钮组响应式
@media (max-width: 576px) {
  .el-button-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    
    .el-button {
      margin-left: 0 !important;
      border-radius: 4px !important;
    }
  }
}

// 链分隔线样式
.chain-divider {
  font-weight: 600;
  font-size: 14px;
  color: var(--admin-text-primary);
}

// ==================== 安全密码保护区域样式 ====================
.security-protection-section {
  background: var(--admin-bg-color, #f5f7fa);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
  border: 1px solid var(--admin-border-color, #e4e7ed);
}

.security-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--admin-card-bg, #fff);
  border-radius: 6px;
  border: 1px solid var(--admin-border-color, #e4e7ed);
  
  .status-secure {
    color: var(--admin-success, #67c23a);
  }
  
  .status-warning {
    color: var(--admin-warning, #e6a23c);
  }
  
  .status-text {
    font-size: 14px;
    
    &.secure {
      color: var(--admin-success, #67c23a);
      font-weight: 600;
    }
    
    &.warning {
      color: var(--admin-warning, #e6a23c);
    }
  }
}

.security-actions {
  margin-top: 12px;
  display: flex;
  gap: 10px;
}

// 暗色主题适配
:deep(.el-dialog) {
  .el-dialog__header {
    font-weight: 600;
  }
}
</style>

