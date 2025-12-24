<template>
  <div class="page-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>用户管理</h2>
      <p class="description">管理平台所有用户信息和余额</p>
    </div>
    
    <!-- 搜索区域 -->
    <div class="search-area">
      <el-form :inline="true" :model="searchForm" @submit.prevent="handleSearch">
        <el-form-item label="钱包地址">
          <el-input
            v-model="searchForm.wallet_address"
            placeholder="请输入钱包地址"
            clearable
            style="width: 280px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button @click="handleReset">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </div>
    
    <!-- 数据表格 -->
    <el-table
      v-loading="loading"
      :data="userList"
      stripe
      border
      style="width: 100%"
    >
      <el-table-column type="index" label="序号" width="60" align="center" />
      
      <el-table-column prop="wallet_address" label="钱包地址" min-width="200">
        <template #default="{ row }">
          <el-tooltip :content="row.wallet_address" placement="top">
            <span class="wallet-address" @click="copyAddress(row.wallet_address)">
              {{ shortenAddress(row.wallet_address) }}
              <el-icon><CopyDocument /></el-icon>
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      
      <el-table-column prop="usdt_balance" label="USDT余额" width="140" align="right">
        <template #default="{ row }">
          <span class="amount">{{ formatAmount(row.usdt_balance) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="wld_balance" label="WLD余额" width="140" align="right">
        <template #default="{ row }">
          <span class="amount">{{ formatAmount(row.wld_balance) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="total_deposit" label="总充值" width="140" align="right">
        <template #default="{ row }">
          <span class="amount positive">{{ formatAmount(row.total_deposit) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="total_withdraw" label="总提款" width="140" align="right">
        <template #default="{ row }">
          <span class="amount negative">{{ formatAmount(row.total_withdraw) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="created_at" label="注册时间" width="170">
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      
      <el-table-column label="操作" width="260" fixed="right" align="center">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="handleEdit(row)">
            编辑
          </el-button>
          <el-button type="success" link size="small" @click="handleViewBalanceDetails(row)">
            明细
          </el-button>
          <el-button type="warning" link size="small" @click="handleDiagnose(row)">
            诊断
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    
    <!-- 分页 -->
    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </div>
    
    <!-- 编辑余额弹窗 -->
    <el-dialog
      v-model="editDialogVisible"
      title="编辑用户余额"
      width="500px"
      destroy-on-close
    >
      <el-form
        ref="editFormRef"
        :model="editForm"
        :rules="editRules"
        label-width="100px"
      >
        <el-form-item label="钱包地址">
          <el-input v-model="editForm.wallet_address" disabled />
        </el-form-item>
        <el-form-item label="USDT余额" prop="usdt_balance">
          <el-input-number
            v-model="editForm.usdt_balance"
            :precision="4"
            :step="1"
            :min="0"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="WLD余额" prop="wld_balance">
          <el-input-number
            v-model="editForm.wld_balance"
            :precision="4"
            :step="1"
            :min="0"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="操作备注" prop="remark">
          <el-input
            v-model="editForm.remark"
            type="textarea"
            :rows="3"
            placeholder="请输入操作备注（必填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitEdit">
          确定
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 用户详情抽屉 -->
    <el-drawer
      v-model="detailDrawerVisible"
      title="用户详情"
      size="500px"
    >
      <template v-if="currentUser">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="钱包地址">
            {{ currentUser.wallet_address }}
          </el-descriptions-item>
          <el-descriptions-item label="USDT余额">
            {{ formatAmount(currentUser.usdt_balance) }}
          </el-descriptions-item>
          <el-descriptions-item label="WLD余额">
            {{ formatAmount(currentUser.wld_balance) }}
          </el-descriptions-item>
          <el-descriptions-item label="总充值">
            {{ formatAmount(currentUser.total_deposit) }}
          </el-descriptions-item>
          <el-descriptions-item label="总提款">
            {{ formatAmount(currentUser.total_withdraw) }}
          </el-descriptions-item>
          <el-descriptions-item label="注册时间">
            {{ formatTime(currentUser.created_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="最后更新">
            {{ formatTime(currentUser.updated_at) }}
          </el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
    
    <!-- 余额明细抽屉 -->
    <el-drawer
      v-model="balanceDetailsDrawerVisible"
      title="💰 用户余额明细"
      size="800px"
    >
      <div v-if="balanceDetailsLoading" class="diagnose-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在加载...</span>
      </div>
      <template v-else-if="balanceDetailsData">
        <!-- 用户信息 -->
        <el-card class="diagnose-card">
          <template #header><span>👤 用户信息</span></template>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="钱包地址" :span="2">
              {{ balanceDetailsData.user.wallet_address }}
            </el-descriptions-item>
            <el-descriptions-item label="当前USDT余额">
              <span class="amount">{{ balanceDetailsData.user.current_usdt_balance }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="当前WLD余额">
              {{ balanceDetailsData.user.current_wld_balance }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
        
        <!-- 余额汇总 -->
        <el-card class="diagnose-card" :class="{ 'card-warning': parseFloat(balanceDetailsData.totals.balance_difference) !== 0 }">
          <template #header>
            <div class="card-header">
              <span>📊 余额汇总</span>
              <el-tag v-if="parseFloat(balanceDetailsData.totals.balance_difference) !== 0" type="danger" size="small">
                差异: {{ balanceDetailsData.totals.balance_difference }}
              </el-tag>
              <el-tag v-else type="success" size="small">数据一致</el-tag>
            </div>
          </template>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="总充值">
              <span class="amount positive">+{{ balanceDetailsData.totals.deposits }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="总提款">
              <span class="amount negative">-{{ balanceDetailsData.totals.withdrawals }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="机器人购买">
              <span class="amount negative">-{{ balanceDetailsData.totals.robot_purchases }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="量化收益">
              <span class="amount positive">+{{ balanceDetailsData.totals.robot_earnings }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="推荐奖励">
              <span class="amount positive">+{{ balanceDetailsData.totals.referral_rewards }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="团队奖励">
              <span class="amount positive">+{{ balanceDetailsData.totals.team_rewards }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="管理员调整">
              <span :class="parseFloat(balanceDetailsData.totals.admin_adjustments) >= 0 ? 'amount positive' : 'amount negative'">
                {{ parseFloat(balanceDetailsData.totals.admin_adjustments) >= 0 ? '+' : '' }}{{ balanceDetailsData.totals.admin_adjustments }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="计算余额">
              <span class="amount">{{ balanceDetailsData.totals.calculated_balance }}</span>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
        
        <!-- 交易记录 -->
        <el-card class="diagnose-card">
          <template #header>
            <span>📝 交易记录 ({{ balanceDetailsData.transaction_count }}条)</span>
          </template>
          <el-table :data="balanceDetailsData.transactions" max-height="400" size="small" stripe>
            <el-table-column prop="type_cn" label="类型" width="100">
              <template #default="{ row }">
                <el-tag :type="getTransactionTypeColor(row.type)" size="small">{{ row.type_cn }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="120" align="right">
              <template #default="{ row }">
                <span :class="row.amount >= 0 ? 'amount positive' : 'amount negative'">
                  {{ row.amount >= 0 ? '+' : '' }}{{ row.amount.toFixed(4) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="running_balance" label="余额" width="100" align="right">
              <template #default="{ row }">
                {{ row.running_balance.toFixed(4) }}
              </template>
            </el-table-column>
            <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'completed' ? 'success' : row.status === 'pending' ? 'warning' : 'info'" size="small">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="时间" width="160">
              <template #default="{ row }">
                {{ formatTime(row.created_at) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </template>
    </el-drawer>
    
    <!-- 余额诊断抽屉 -->
    <el-drawer
      v-model="diagnoseDrawerVisible"
      title="余额诊断"
      size="600px"
    >
      <div v-if="diagnoseLoading" class="diagnose-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在诊断...</span>
      </div>
      <template v-else-if="diagnoseData">
        <!-- 余额概览 -->
        <el-card class="diagnose-card">
          <template #header>
            <div class="card-header">
              <span>💰 当前余额</span>
              <el-tag v-if="diagnoseData.analysis.is_mismatch" type="danger" size="small">数据异常</el-tag>
              <el-tag v-else type="success" size="small">正常</el-tag>
            </div>
          </template>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="USDT">{{ diagnoseData.current_balance.usdt }}</el-descriptions-item>
            <el-descriptions-item label="WLD">{{ diagnoseData.current_balance.wld }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
        
        <!-- 收入明细 -->
        <el-card class="diagnose-card">
          <template #header><span>📥 收入明细</span></template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="充值 (completed)">
              +{{ diagnoseData.calculated.deposits.total }} ({{ diagnoseData.calculated.deposits.count }}笔)
            </el-descriptions-item>
            <el-descriptions-item label="机器人收益">
              +{{ diagnoseData.calculated.robots.profit }}
            </el-descriptions-item>
            <el-descriptions-item label="推荐奖励">
              +{{ diagnoseData.calculated.referral_reward }}
            </el-descriptions-item>
            <el-descriptions-item label="团队奖励">
              +{{ diagnoseData.calculated.team_reward }}
            </el-descriptions-item>
            <el-descriptions-item label="手动添加">
              +{{ diagnoseData.stored_totals.manual_added }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
        
        <!-- 支出明细 -->
        <el-card class="diagnose-card">
          <template #header><span>📤 支出明细</span></template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="提款 (completed)">
              -{{ diagnoseData.calculated.withdrawals.total }} ({{ diagnoseData.calculated.withdrawals.count }}笔)
            </el-descriptions-item>
            <el-descriptions-item label="机器人购买">
              -{{ diagnoseData.calculated.robots.cost }} ({{ diagnoseData.calculated.robots.count }}个)
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
        
        <!-- 余额分析 -->
        <el-card class="diagnose-card" :class="{ 'card-warning': diagnoseData.analysis.is_mismatch }">
          <template #header><span>📊 余额分析</span></template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="预期余额">{{ diagnoseData.analysis.expected_balance }}</el-descriptions-item>
            <el-descriptions-item label="实际余额">{{ diagnoseData.analysis.actual_balance }}</el-descriptions-item>
            <el-descriptions-item label="差异">
              <span :class="{ 'text-danger': diagnoseData.analysis.is_mismatch }">
                {{ diagnoseData.analysis.difference }}
              </span>
            </el-descriptions-item>
          </el-descriptions>
          <el-alert
            v-if="diagnoseData.analysis.has_negative_expected"
            type="warning"
            title="预期余额为负数，说明存在未记录的收入来源"
            :closable="false"
            show-icon
            style="margin-top: 10px"
          />
        </el-card>
        
        <!-- 字段不匹配提示 -->
        <el-card v-if="diagnoseData.field_mismatches.total_deposit || diagnoseData.field_mismatches.total_withdraw" class="diagnose-card card-warning">
          <template #header><span>⚠️ 字段不匹配</span></template>
          <div v-if="diagnoseData.field_mismatches.total_deposit">
            <p>total_deposit: 存储值 {{ diagnoseData.field_mismatches.total_deposit.stored }} ≠ 计算值 {{ diagnoseData.field_mismatches.total_deposit.calculated }}</p>
          </div>
          <div v-if="diagnoseData.field_mismatches.total_withdraw">
            <p>total_withdraw: 存储值 {{ diagnoseData.field_mismatches.total_withdraw.stored }} ≠ 计算值 {{ diagnoseData.field_mismatches.total_withdraw.calculated }}</p>
          </div>
        </el-card>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
/**
 * 用户管理页面
 */
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, CopyDocument, Loading } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { getUsers, updateUserBalance, diagnoseUserBalance, getUserBalanceDetails } from '@/api'

// 加载状态
const loading = ref(false)
const submitting = ref(false)

// 用户列表
const userList = ref([])

// 搜索表单
const searchForm = reactive({
  wallet_address: ''
})

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

// 编辑相关
const editDialogVisible = ref(false)
const editFormRef = ref(null)
const editForm = reactive({
  wallet_address: '',
  usdt_balance: 0,
  wld_balance: 0,
  remark: ''
})

const editRules = {
  usdt_balance: [{ required: true, message: '请输入USDT余额', trigger: 'blur' }],
  wld_balance: [{ required: true, message: '请输入WLD余额', trigger: 'blur' }],
  remark: [{ required: true, message: '请输入操作备注', trigger: 'blur' }]
}

// 详情相关
const detailDrawerVisible = ref(false)
const currentUser = ref(null)

// 诊断相关
const diagnoseDrawerVisible = ref(false)
const diagnoseLoading = ref(false)
const diagnoseData = ref(null)

// 余额明细相关
const balanceDetailsDrawerVisible = ref(false)
const balanceDetailsLoading = ref(false)
const balanceDetailsData = ref(null)

/**
 * 获取用户列表
 */
const fetchUsers = async () => {
  loading.value = true
  try {
    const res = await getUsers({
      page: pagination.page,
      pageSize: pagination.pageSize,
      wallet_address: searchForm.wallet_address || undefined
    })
    
    if (res.success) {
      userList.value = res.data.list || []
      pagination.total = res.data.total || 0
    }
  } catch (error) {
    console.error('获取用户列表失败:', error)
  } finally {
    loading.value = false
  }
}

/**
 * 搜索
 */
const handleSearch = () => {
  pagination.page = 1
  fetchUsers()
}

/**
 * 重置
 */
const handleReset = () => {
  searchForm.wallet_address = ''
  pagination.page = 1
  fetchUsers()
}

/**
 * 分页大小变化
 */
const handleSizeChange = () => {
  pagination.page = 1
  fetchUsers()
}

/**
 * 页码变化
 */
const handlePageChange = () => {
  fetchUsers()
}

/**
 * 编辑用户
 */
const handleEdit = (row) => {
  editForm.wallet_address = row.wallet_address
  editForm.usdt_balance = parseFloat(row.usdt_balance)
  editForm.wld_balance = parseFloat(row.wld_balance)
  editForm.remark = ''
  editDialogVisible.value = true
}

/**
 * 提交编辑
 */
const handleSubmitEdit = async () => {
  const valid = await editFormRef.value.validate().catch(() => false)
  if (!valid) return
  
  submitting.value = true
  try {
    const res = await updateUserBalance(editForm.wallet_address, {
      usdt_balance: editForm.usdt_balance,
      wld_balance: editForm.wld_balance,
      remark: editForm.remark
    })
    
    if (res.success) {
      ElMessage.success('更新成功')
      editDialogVisible.value = false
      fetchUsers()
    } else {
      ElMessage.error(res.message || '更新失败')
    }
  } catch (error) {
    console.error('更新用户余额失败:', error)
  } finally {
    submitting.value = false
  }
}

/**
 * 查看详情
 */
const handleViewDetail = (row) => {
  currentUser.value = row
  detailDrawerVisible.value = true
}

/**
 * 诊断用户余额
 */
const handleDiagnose = async (row) => {
  diagnoseDrawerVisible.value = true
  diagnoseLoading.value = true
  diagnoseData.value = null
  
  try {
    const res = await diagnoseUserBalance(row.wallet_address)
    if (res.success) {
      diagnoseData.value = res.data
    } else {
      ElMessage.error(res.message || '诊断失败')
    }
  } catch (error) {
    console.error('诊断用户余额失败:', error)
    ElMessage.error('诊断失败')
  } finally {
    diagnoseLoading.value = false
  }
}

/**
 * 查看用户余额明细
 */
const handleViewBalanceDetails = async (row) => {
  balanceDetailsDrawerVisible.value = true
  balanceDetailsLoading.value = true
  balanceDetailsData.value = null
  
  try {
    const res = await getUserBalanceDetails(row.wallet_address)
    if (res.success) {
      balanceDetailsData.value = res.data
    } else {
      ElMessage.error(res.message || '获取明细失败')
    }
  } catch (error) {
    console.error('获取用户余额明细失败:', error)
    ElMessage.error('获取明细失败')
  } finally {
    balanceDetailsLoading.value = false
  }
}

/**
 * 获取交易类型的颜色
 */
const getTransactionTypeColor = (type) => {
  const colors = {
    deposit: 'success',
    withdraw: 'danger',
    robot_purchase: 'warning',
    robot_earning: 'success',
    referral_reward: 'primary',
    team_reward: 'primary',
    admin_adjustment: 'info'
  }
  return colors[type] || 'info'
}

/**
 * 复制地址
 */
const copyAddress = (address) => {
  navigator.clipboard.writeText(address)
  ElMessage.success('地址已复制')
}

/**
 * 缩短地址
 */
const shortenAddress = (address) => {
  if (!address) return ''
  return `${address.slice(0, 10)}...${address.slice(-8)}`
}

/**
 * 格式化金额
 */
const formatAmount = (amount) => {
  return parseFloat(amount || 0).toFixed(4)
}

/**
 * 格式化时间
 */
const formatTime = (time) => {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

// 初始化
onMounted(() => {
  fetchUsers()
})
</script>

<style lang="scss" scoped>
.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.wallet-address {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  
  &:hover {
    color: #409EFF;
  }
  
  .el-icon {
    font-size: 14px;
  }
}

.amount {
  font-weight: 600;
  
  &.positive {
    color: #67C23A;
  }
  
  &.negative {
    color: #F56C6C;
  }
}

// Diagnose styles
.diagnose-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #909399;
  
  .el-icon {
    font-size: 32px;
    margin-bottom: 10px;
  }
}

.diagnose-card {
  margin-bottom: 16px;
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  &.card-warning {
    border-color: #E6A23C;
    
    :deep(.el-card__header) {
      background-color: #fdf6ec;
    }
  }
}

.text-danger {
  color: #F56C6C;
  font-weight: 600;
}
</style>

