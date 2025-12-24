<template>
  <div class="invite-stats-container">
    <!-- Page Header -->
    <div class="page-header">
      <h1>推荐数据管理</h1>
      <p class="subtitle">管理用户邀请页面显示的各项金额和数据</p>
    </div>

    <!-- Search Section -->
    <el-card class="search-card">
      <div class="search-section">
        <el-input
          v-model="searchQuery"
          placeholder="输入钱包地址搜索..."
          clearable
          @keyup.enter="handleSearch"
          class="search-input"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" @click="handleSearch" :loading="loading">
          <el-icon><Search /></el-icon>
          搜索
        </el-button>
        <el-button @click="loadAdjustedUsers">
          <el-icon><List /></el-icon>
          已调整用户
        </el-button>
      </div>
    </el-card>

    <!-- Users Table -->
    <el-card class="data-card">
      <template #header>
        <div class="card-header">
          <span>{{ showAdjusted ? '已调整用户列表' : '用户列表' }}</span>
          <el-tag v-if="showAdjusted" type="warning" size="small">
            仅显示有调整值的用户
          </el-tag>
        </div>
      </template>

      <el-table
        :data="userList"
        v-loading="loading"
        stripe
        style="width: 100%"
        @row-click="handleRowClick"
      >
        <el-table-column prop="wallet_address" label="钱包地址" min-width="180">
          <template #default="{ row }">
            <span class="wallet-address">{{ formatWallet(row.wallet_address) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="每日收入调整" width="120" align="right">
          <template #default="{ row }">
            <span :class="getAdjClass(row.daily_income_adj)">
              {{ formatAdj(row.daily_income_adj) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="团队成员调整" width="120" align="right">
          <template #default="{ row }">
            <span :class="getAdjClass(row.team_members_adj)">
              {{ formatAdjInt(row.team_members_adj) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="推荐奖励调整" width="120" align="right">
          <template #default="{ row }">
            <span :class="getAdjClass(row.referral_reward_adj)">
              {{ formatAdj(row.referral_reward_adj) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="团队奖励调整" width="120" align="right">
          <template #default="{ row }">
            <span :class="getAdjClass(row.team_reward_adj)">
              {{ formatAdj(row.team_reward_adj) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="updated_by" label="操作人" width="100" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click.stop="editUser(row)">
              <el-icon><Edit /></el-icon>
              编辑
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSearch"
          @current-change="handleSearch"
        />
      </div>
    </el-card>

    <!-- Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="'编辑推荐数据 - ' + formatWallet(editingUser.wallet_address)"
      width="700px"
      destroy-on-close
    >
      <div v-loading="dialogLoading" class="edit-form">
        <!-- Real Stats Display -->
        <div class="stats-section">
          <h4>实际数据（只读）</h4>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="每日总收入">
              {{ formatMoney(editingStats.real_stats?.daily_income) }}
            </el-descriptions-item>
            <el-descriptions-item label="团队成员">
              {{ editingStats.real_stats?.team_members || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="社区充值">
              {{ formatMoney(editingStats.real_stats?.total_recharge) }}
            </el-descriptions-item>
            <el-descriptions-item label="直推成员">
              {{ editingStats.real_stats?.direct_members || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="社区提现">
              {{ formatMoney(editingStats.real_stats?.total_withdrawals) }}
            </el-descriptions-item>
            <el-descriptions-item label="社区业绩">
              {{ formatMoney(editingStats.real_stats?.total_performance) }}
            </el-descriptions-item>
            <el-descriptions-item label="推荐奖励">
              {{ formatMoney(editingStats.real_stats?.referral_reward) }}
            </el-descriptions-item>
            <el-descriptions-item label="团队奖励">
              {{ formatMoney(editingStats.real_stats?.team_reward) }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- Adjustments Form -->
        <div class="adjustments-section">
          <h4>调整值设置（正数增加，负数减少）</h4>
          <el-form :model="adjustForm" label-width="120px" size="default">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="每日收入">
                  <el-input-number
                    v-model="adjustForm.daily_income_adj"
                    :precision="4"
                    :step="10"
                    controls-position="right"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="团队成员">
                  <el-input-number
                    v-model="adjustForm.team_members_adj"
                    :precision="0"
                    :step="1"
                    controls-position="right"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="社区充值">
                  <el-input-number
                    v-model="adjustForm.total_recharge_adj"
                    :precision="4"
                    :step="100"
                    controls-position="right"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="直推成员">
                  <el-input-number
                    v-model="adjustForm.direct_members_adj"
                    :precision="0"
                    :step="1"
                    controls-position="right"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="社区提现">
                  <el-input-number
                    v-model="adjustForm.total_withdrawals_adj"
                    :precision="4"
                    :step="100"
                    controls-position="right"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="社区业绩">
                  <el-input-number
                    v-model="adjustForm.total_performance_adj"
                    :precision="4"
                    :step="100"
                    controls-position="right"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="推荐奖励">
                  <el-input-number
                    v-model="adjustForm.referral_reward_adj"
                    :precision="4"
                    :step="10"
                    controls-position="right"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="团队奖励">
                  <el-input-number
                    v-model="adjustForm.team_reward_adj"
                    :precision="4"
                    :step="10"
                    controls-position="right"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="备注">
              <el-input
                v-model="adjustForm.notes"
                type="textarea"
                :rows="2"
                placeholder="输入调整原因或备注..."
              />
            </el-form-item>
          </el-form>
        </div>

        <!-- Preview Display Stats -->
        <div class="preview-section">
          <h4>预览显示效果</h4>
          <el-descriptions :column="2" border size="small" class="preview-desc">
            <el-descriptions-item label="每日总收入">
              <span class="preview-value">
                {{ formatMoney(previewStats.daily_income) }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="团队成员">
              <span class="preview-value">
                {{ previewStats.team_members }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="社区充值">
              <span class="preview-value">
                {{ formatMoney(previewStats.total_recharge) }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="直推成员">
              <span class="preview-value">
                {{ previewStats.direct_members }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="社区提现">
              <span class="preview-value">
                {{ formatMoney(previewStats.total_withdrawals) }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="社区业绩">
              <span class="preview-value">
                {{ formatMoney(previewStats.total_performance) }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="推荐奖励">
              <span class="preview-value">
                {{ formatMoney(previewStats.referral_reward) }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="团队奖励">
              <span class="preview-value">
                {{ formatMoney(previewStats.team_reward) }}
              </span>
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="warning" @click="resetAdjustments">重置调整</el-button>
        <el-button type="primary" @click="saveAdjustments" :loading="saving">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Edit, List } from '@element-plus/icons-vue'
import request from '@/api'

// State
const loading = ref(false)
const dialogVisible = ref(false)
const dialogLoading = ref(false)
const saving = ref(false)
const showAdjusted = ref(false)

// Search & Pagination
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const userList = ref([])

// Edit Form
const editingUser = ref({})
const editingStats = ref({
  real_stats: {},
  adjustments: {},
  display_stats: {}
})
const adjustForm = reactive({
  daily_income_adj: 0,
  team_members_adj: 0,
  total_recharge_adj: 0,
  direct_members_adj: 0,
  total_withdrawals_adj: 0,
  total_performance_adj: 0,
  referral_reward_adj: 0,
  team_reward_adj: 0,
  notes: ''
})

// Computed preview stats
const previewStats = computed(() => {
  const real = editingStats.value.real_stats || {}
  return {
    daily_income: (parseFloat(real.daily_income) || 0) + (parseFloat(adjustForm.daily_income_adj) || 0),
    team_members: (parseInt(real.team_members) || 0) + (parseInt(adjustForm.team_members_adj) || 0),
    total_recharge: (parseFloat(real.total_recharge) || 0) + (parseFloat(adjustForm.total_recharge_adj) || 0),
    direct_members: (parseInt(real.direct_members) || 0) + (parseInt(adjustForm.direct_members_adj) || 0),
    total_withdrawals: (parseFloat(real.total_withdrawals) || 0) + (parseFloat(adjustForm.total_withdrawals_adj) || 0),
    total_performance: (parseFloat(real.total_performance) || 0) + (parseFloat(adjustForm.total_performance_adj) || 0),
    referral_reward: (parseFloat(real.referral_reward) || 0) + (parseFloat(adjustForm.referral_reward_adj) || 0),
    team_reward: (parseFloat(real.team_reward) || 0) + (parseFloat(adjustForm.team_reward_adj) || 0)
  }
})

/**
 * Format wallet address for display
 */
const formatWallet = (address) => {
  if (!address) return '-'
  if (address.length <= 15) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Format money with 4 decimal places
 */
const formatMoney = (value) => {
  const num = parseFloat(value) || 0
  return num.toFixed(4)
}

/**
 * Format adjustment value
 */
const formatAdj = (value) => {
  const num = parseFloat(value) || 0
  if (num === 0) return '-'
  return (num > 0 ? '+' : '') + num.toFixed(4)
}

/**
 * Format integer adjustment
 */
const formatAdjInt = (value) => {
  const num = parseInt(value) || 0
  if (num === 0) return '-'
  return (num > 0 ? '+' : '') + num
}

/**
 * Get CSS class for adjustment display
 */
const getAdjClass = (value) => {
  const num = parseFloat(value) || 0
  if (num > 0) return 'positive-adj'
  if (num < 0) return 'negative-adj'
  return 'zero-adj'
}

/**
 * Search users
 */
const handleSearch = async () => {
  loading.value = true
  showAdjusted.value = false
  try {
    const response = await request.get('/invite-stats/search', {
      params: {
        q: searchQuery.value,
        page: currentPage.value,
        limit: pageSize.value
      }
    })
    if (response.success) {
      userList.value = response.data || []
      total.value = response.pagination?.total || 0
    } else {
      ElMessage.error(response.message || '搜索失败')
    }
  } catch (error) {
    console.error('Search error:', error)
    ElMessage.error('搜索失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

/**
 * Load users with adjustments
 */
const loadAdjustedUsers = async () => {
  loading.value = true
  showAdjusted.value = true
  try {
    const response = await request.get('/invite-stats-adjusted', {
      params: {
        page: currentPage.value,
        limit: pageSize.value
      }
    })
    if (response.success) {
      userList.value = response.data || []
      total.value = response.pagination?.total || 0
    } else {
      ElMessage.error(response.message || '获取失败')
    }
  } catch (error) {
    console.error('Load adjusted users error:', error)
    ElMessage.error('获取失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

/**
 * Handle row click to edit
 */
const handleRowClick = (row) => {
  editUser(row)
}

/**
 * Open edit dialog for user
 */
const editUser = async (user) => {
  editingUser.value = user
  dialogVisible.value = true
  dialogLoading.value = true
  
  try {
    const response = await request.get(`/invite-stats/${user.wallet_address}`)
    if (response.success) {
      editingStats.value = response.data
      
      // Populate form with current adjustments
      const adj = response.data.adjustments || {}
      adjustForm.daily_income_adj = parseFloat(adj.daily_income_adj) || 0
      adjustForm.team_members_adj = parseInt(adj.team_members_adj) || 0
      adjustForm.total_recharge_adj = parseFloat(adj.total_recharge_adj) || 0
      adjustForm.direct_members_adj = parseInt(adj.direct_members_adj) || 0
      adjustForm.total_withdrawals_adj = parseFloat(adj.total_withdrawals_adj) || 0
      adjustForm.total_performance_adj = parseFloat(adj.total_performance_adj) || 0
      adjustForm.referral_reward_adj = parseFloat(adj.referral_reward_adj) || 0
      adjustForm.team_reward_adj = parseFloat(adj.team_reward_adj) || 0
      adjustForm.notes = adj.notes || ''
    } else {
      ElMessage.error(response.message || '获取用户数据失败')
      dialogVisible.value = false
    }
  } catch (error) {
    console.error('Get user stats error:', error)
    ElMessage.error('获取用户数据失败: ' + (error.message || '未知错误'))
    dialogVisible.value = false
  } finally {
    dialogLoading.value = false
  }
}

/**
 * Reset all adjustments to zero
 */
const resetAdjustments = () => {
  ElMessageBox.confirm(
    '确定要重置所有调整值为0吗？',
    '重置确认',
    { type: 'warning' }
  ).then(() => {
    adjustForm.daily_income_adj = 0
    adjustForm.team_members_adj = 0
    adjustForm.total_recharge_adj = 0
    adjustForm.direct_members_adj = 0
    adjustForm.total_withdrawals_adj = 0
    adjustForm.total_performance_adj = 0
    adjustForm.referral_reward_adj = 0
    adjustForm.team_reward_adj = 0
    adjustForm.notes = ''
  }).catch(() => {})
}

/**
 * Save adjustments
 */
const saveAdjustments = async () => {
  saving.value = true
  try {
    const response = await request.put(
      `/invite-stats/${editingUser.value.wallet_address}`,
      adjustForm
    )
    if (response.success) {
      ElMessage.success('保存成功')
      dialogVisible.value = false
      // Refresh list
      if (showAdjusted.value) {
        loadAdjustedUsers()
      } else {
        handleSearch()
      }
    } else {
      ElMessage.error(response.message || '保存失败')
    }
  } catch (error) {
    console.error('Save error:', error)
    ElMessage.error('保存失败: ' + (error.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

// Initialize - load empty search results
onMounted(() => {
  handleSearch()
})
</script>

<style scoped>
.invite-stats-container {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--admin-text-primary, var(--el-text-color-primary, #303133));
  margin: 0 0 8px 0;
}

.page-header .subtitle {
  font-size: 14px;
  color: var(--admin-text-secondary, var(--el-text-color-secondary, #909399));
  margin: 0;
}

.search-card {
  margin-bottom: 20px;
}

.search-section {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-input {
  width: 350px;
}

.data-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--admin-text-primary, var(--el-text-color-primary));
}

.wallet-address {
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 13px;
  color: var(--admin-text-regular, var(--el-text-color-regular, #606266));
}

.positive-adj {
  color: var(--admin-success, var(--el-color-success, #67c23a));
  font-weight: 500;
}

.negative-adj {
  color: var(--admin-danger, var(--el-color-danger, #f56c6c));
  font-weight: 500;
}

.zero-adj {
  color: var(--admin-text-secondary, var(--el-text-color-secondary, #909399));
}

.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* Dialog Styles */
.edit-form {
  padding: 0 20px;
}

.stats-section,
.adjustments-section,
.preview-section {
  margin-bottom: 24px;
}

.stats-section h4,
.adjustments-section h4,
.preview-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.preview-section {
  background: var(--el-fill-color-light);
  padding: 16px;
  border-radius: 8px;
}

.preview-desc {
  background: var(--el-bg-color);
}

.preview-value {
  font-weight: 600;
  color: var(--el-color-primary);
}

/* Responsive */
@media (max-width: 768px) {
  .search-section {
    flex-wrap: wrap;
  }
  
  .search-input {
    width: 100%;
  }
}
</style>

