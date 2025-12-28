<template>
  <div class="team-management-container">
    <!-- Page Header -->
    <el-card class="header-card">
      <h2><el-icon><UserFilled /></el-icon> 团队推荐管理</h2>
      <p class="subtitle">搜索用户、发放奖励、调整等级、查看推荐层级</p>
    </el-card>

    <!-- Search Section -->
    <el-card class="search-card">
      <el-form :inline="true" @submit.prevent="searchUsers">
        <el-form-item label="钱包地址">
          <el-input 
            v-model="searchQuery" 
            placeholder="输入钱包地址搜索" 
            clearable 
            style="width: 300px"
            @keyup.enter="searchUsers"
          />
        </el-form-item>
        <el-form-item label="最低等级">
          <el-select v-model="minLevel" placeholder="全部" clearable style="width: 120px">
            <el-option label="全部" :value="0" />
            <el-option v-for="i in 5" :key="i" :label="`${i}级`" :value="i" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchUsers" :loading="loading">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button type="success" @click="showBatchAwardDialog = true">
            <el-icon><Money /></el-icon> 批量发放
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- User List -->
    <el-card class="main-card">
      <template #header>
        <div class="card-header">
          <span>用户列表</span>
          <el-tag type="info">共 {{ pagination.total }} 条</el-tag>
        </div>
      </template>

      <el-table :data="userList" v-loading="loading" stripe border style="width: 100%">
        <el-table-column prop="wallet_address" label="钱包地址" min-width="180">
          <template #default="{ row }">
            <el-tooltip :content="row.wallet_address">
              <span class="wallet-addr" @click="copyText(row.wallet_address)">
                {{ formatAddress(row.wallet_address) }}
                <el-icon><CopyDocument /></el-icon>
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="broker_level" label="经纪人等级" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="getLevelType(row.broker_level)" effect="dark">
              {{ row.broker_level ? `${row.broker_level}级` : '普通用户' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="direct_referrals" label="直推人数" width="100" align="center">
          <template #default="{ row }">
            <span class="stat-value">{{ row.direct_referrals || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="usdt_balance" label="USDT余额" width="120" align="right">
          <template #default="{ row }">
            <span class="amount">{{ formatMoney(row.usdt_balance) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="total_referral_reward" label="累计推荐奖励" width="130" align="right">
          <template #default="{ row }">
            <span class="amount success">{{ formatMoney(row.total_referral_reward) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="total_team_dividend" label="累计团队分红" width="130" align="right">
          <template #default="{ row }">
            <span class="amount warning">{{ formatMoney(row.total_team_dividend) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="viewUserDetail(row)">
              <el-icon><View /></el-icon> 详情
            </el-button>
            <el-button size="small" type="success" @click="openAwardDialog(row, 'referral')">
              发奖励
            </el-button>
            <el-button size="small" type="warning" @click="openAwardDialog(row, 'dividend')">
              发分红
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="searchUsers"
        @size-change="searchUsers"
        class="pagination"
      />
    </el-card>

    <!-- User Detail Dialog -->
    <el-dialog v-model="showDetailDialog" :title="'用户团队详情'" width="900px" destroy-on-close>
      <div v-loading="detailLoading" class="user-detail">
        <!-- User Stats -->
        <el-row :gutter="16" class="stats-row">
          <el-col :span="6">
            <div class="stat-card primary">
              <div class="stat-icon"><el-icon><User /></el-icon></div>
              <div class="stat-info">
                <div class="value">{{ userDetail.broker_level || 0 }}级</div>
                <div class="label">经纪人等级</div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card success">
              <div class="stat-icon"><el-icon><Coin /></el-icon></div>
              <div class="stat-info">
                <div class="value">{{ formatMoney(userDetail.usdt_balance) }}</div>
                <div class="label">USDT余额</div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card warning">
              <div class="stat-icon"><el-icon><Connection /></el-icon></div>
              <div class="stat-info">
                <div class="value">{{ userDetail.direct_referrals || 0 }}</div>
                <div class="label">直推人数</div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card info">
              <div class="stat-icon"><el-icon><UserFilled /></el-icon></div>
              <div class="stat-info">
                <div class="value">{{ userDetail.total_team_members || 0 }}</div>
                <div class="label">团队总人数</div>
              </div>
            </div>
          </el-col>
        </el-row>

        <!-- More Stats -->
        <el-descriptions :column="3" border class="detail-desc">
          <el-descriptions-item label="钱包地址">
            <span class="wallet-full">{{ userDetail.wallet_address }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="团队业绩">
            {{ formatMoney(userDetail.team_performance) }} USDT
          </el-descriptions-item>
          <el-descriptions-item label="合格直推">
            {{ userDetail.qualified_direct_members || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="累计推荐奖励">
            <span class="amount success">{{ formatMoney(userDetail.total_referral_reward) }} USDT</span>
          </el-descriptions-item>
          <el-descriptions-item label="累计团队分红">
            <span class="amount warning">{{ formatMoney(userDetail.total_team_dividend) }} USDT</span>
          </el-descriptions-item>
          <el-descriptions-item label="我的推荐人">
            {{ userDetail.my_referrer ? formatAddress(userDetail.my_referrer) : '无' }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- Actions -->
        <div class="detail-actions">
          <el-button type="primary" @click="loadHierarchy">
            <el-icon><DataLine /></el-icon> 查看推荐层级树
          </el-button>
          <el-button type="success" @click="openAwardDialog(userDetail, 'referral')">
            <el-icon><Money /></el-icon> 发放推荐奖励
          </el-button>
          <el-button type="warning" @click="openAwardDialog(userDetail, 'dividend')">
            <el-icon><Coin /></el-icon> 发放团队分红
          </el-button>
          <el-button type="info" @click="openLevelDialog">
            <el-icon><Setting /></el-icon> 调整等级
          </el-button>
        </div>

        <!-- Hierarchy Tree -->
        <div v-if="showHierarchy" class="hierarchy-section">
          <h4>
            <el-icon><DataLine /></el-icon> 推荐层级树 ({{ hierarchyData.total_members }} 人)
          </h4>
          <div v-loading="hierarchyLoading">
            <el-tree
              v-if="hierarchyTree.length > 0"
              :data="hierarchyTree"
              :props="treeProps"
              default-expand-all
              node-key="wallet_address"
            >
              <template #default="{ node, data }">
                <div class="tree-node">
                  <span class="node-addr">{{ formatAddress(data.wallet_address) }}</span>
                  <el-tag size="small" :type="getLevelType(data.broker_level)">
                    {{ data.broker_level ? `${data.broker_level}级` : '普通' }}
                  </el-tag>
                  <span class="node-info">
                    余额: {{ formatMoney(data.balance) }} | 
                    机器人: {{ data.active_robots }} | 
                    下级: {{ data.sub_count }}
                  </span>
                </div>
              </template>
            </el-tree>
            <el-empty v-else description="暂无下级成员" />
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- Award Dialog -->
    <el-dialog 
      v-model="showAwardDialog" 
      :title="awardType === 'referral' ? '发放推荐奖励' : '发放团队分红'" 
      width="500px"
    >
      <el-form :model="awardForm" label-width="100px">
        <el-form-item label="钱包地址">
          <el-input v-model="awardForm.wallet_address" disabled />
        </el-form-item>
        <el-form-item label="发放金额" required>
          <el-input-number 
            v-model="awardForm.amount" 
            :min="0.01" 
            :max="100000" 
            :precision="4"
            :step="10"
            style="width: 200px"
          />
          <span class="unit">USDT</span>
        </el-form-item>
        <el-form-item v-if="awardType === 'dividend'" label="经纪人等级">
          <el-select v-model="awardForm.broker_level">
            <el-option v-for="i in 5" :key="i" :label="`${i}级`" :value="i" />
          </el-select>
        </el-form-item>
        <el-form-item label="发放原因">
          <el-input v-model="awardForm.reason" type="textarea" :rows="2" placeholder="请输入发放原因..." />
        </el-form-item>
        <el-alert type="info" :closable="false" style="margin-top: 10px">
          该金额将直接添加到用户USDT余额，并记录到{{ awardType === 'referral' ? '推荐奖励' : '团队分红' }}历史
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="showAwardDialog = false">取消</el-button>
        <el-button type="primary" @click="submitAward" :loading="awarding">确认发放</el-button>
      </template>
    </el-dialog>

    <!-- Level Dialog -->
    <el-dialog v-model="showLevelDialog" title="调整经纪人等级" width="450px">
      <el-form :model="levelForm" label-width="100px">
        <el-form-item label="钱包地址">
          <el-input v-model="levelForm.wallet_address" disabled />
        </el-form-item>
        <el-form-item label="当前等级">
          <el-tag :type="getLevelType(levelForm.old_level)" effect="dark">
            {{ levelForm.old_level ? `${levelForm.old_level}级` : '普通用户' }}
          </el-tag>
        </el-form-item>
        <el-form-item label="新等级" required>
          <el-select v-model="levelForm.new_level" style="width: 150px">
            <el-option label="普通用户" :value="0" />
            <el-option v-for="i in 5" :key="i" :label="`${i}级经纪人`" :value="i" />
          </el-select>
        </el-form-item>
        <el-form-item label="调整原因">
          <el-input v-model="levelForm.reason" type="textarea" :rows="2" placeholder="请输入调整原因..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showLevelDialog = false">取消</el-button>
        <el-button type="primary" @click="submitLevelChange" :loading="levelChanging">确认调整</el-button>
      </template>
    </el-dialog>

    <!-- Batch Award Dialog -->
    <el-dialog v-model="showBatchAwardDialog" title="批量发放奖励" width="700px">
      <el-form :model="batchForm" label-width="100px">
        <el-form-item label="奖励类型" required>
          <el-radio-group v-model="batchForm.award_type">
            <el-radio value="referral">推荐奖励</el-radio>
            <el-radio value="dividend">团队分红</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="发放列表" required>
          <el-input 
            v-model="batchForm.rawInput" 
            type="textarea" 
            :rows="8" 
            placeholder="每行一条记录，格式：钱包地址,金额&#10;例如：&#10;0x1234...abcd,100&#10;0x5678...efgh,50"
          />
        </el-form-item>
        <el-form-item label="发放原因">
          <el-input v-model="batchForm.reason" placeholder="批量发放原因" />
        </el-form-item>
      </el-form>
      <div class="batch-preview" v-if="parsedBatchList.length > 0">
        <h4>预览 ({{ parsedBatchList.length }} 条记录，总金额: {{ batchTotalAmount }} USDT)</h4>
        <el-table :data="parsedBatchList.slice(0, 10)" size="small" border>
          <el-table-column prop="wallet_address" label="钱包地址">
            <template #default="{ row }">{{ formatAddress(row.wallet_address) }}</template>
          </el-table-column>
          <el-table-column prop="amount" label="金额" width="100" />
        </el-table>
        <p v-if="parsedBatchList.length > 10" class="more-hint">... 还有 {{ parsedBatchList.length - 10 }} 条</p>
      </div>
      <template #footer>
        <el-button @click="showBatchAwardDialog = false">取消</el-button>
        <el-button type="primary" @click="submitBatchAward" :loading="batchAwarding" :disabled="parsedBatchList.length === 0">
          确认发放 ({{ parsedBatchList.length }} 条)
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
/**
 * Team Management Page
 * Features: Search users, award rewards, change broker level, view hierarchy
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  UserFilled, Search, Money, View, CopyDocument, User, Coin, 
  Connection, DataLine, Setting 
} from '@element-plus/icons-vue'
import request from '@/api'

// ==================== State ====================

const loading = ref(false)
const searchQuery = ref('')
const minLevel = ref(0)
const userList = ref([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

// User detail
const showDetailDialog = ref(false)
const detailLoading = ref(false)
const userDetail = ref({})
const selectedUser = ref(null)

// Hierarchy
const showHierarchy = ref(false)
const hierarchyLoading = ref(false)
const hierarchyData = ref({ total_members: 0, hierarchy: [] })
const treeProps = { children: 'children', label: 'wallet_address' }

// Award dialog
const showAwardDialog = ref(false)
const awardType = ref('referral')
const awarding = ref(false)
const awardForm = reactive({
  wallet_address: '',
  amount: 10,
  broker_level: 1,
  reason: ''
})

// Level dialog
const showLevelDialog = ref(false)
const levelChanging = ref(false)
const levelForm = reactive({
  wallet_address: '',
  old_level: 0,
  new_level: 0,
  reason: ''
})

// Batch award
const showBatchAwardDialog = ref(false)
const batchAwarding = ref(false)
const batchForm = reactive({
  award_type: 'referral',
  rawInput: '',
  reason: ''
})

// ==================== Computed ====================

const hierarchyTree = computed(() => {
  return hierarchyData.value.hierarchy || []
})

const parsedBatchList = computed(() => {
  if (!batchForm.rawInput) return []
  const lines = batchForm.rawInput.trim().split('\n')
  const result = []
  for (const line of lines) {
    const parts = line.trim().split(',')
    if (parts.length >= 2) {
      const wallet = parts[0].trim()
      const amount = parseFloat(parts[1].trim())
      if (wallet && !isNaN(amount) && amount > 0) {
        result.push({ wallet_address: wallet.toLowerCase(), amount, broker_level: 1 })
      }
    }
  }
  return result
})

const batchTotalAmount = computed(() => {
  return parsedBatchList.value.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
})

// ==================== Methods ====================

/**
 * Search users
 */
const searchUsers = async () => {
  loading.value = true
  try {
    const response = await request.get('/team-management/search', {
      params: {
        q: searchQuery.value,
        page: pagination.page,
        limit: pagination.pageSize,
        min_level: minLevel.value
      }
    })
    if (response.success) {
      userList.value = response.data || []
      pagination.total = response.pagination?.total || 0
    }
  } catch (error) {
    console.error('Search users error:', error)
    ElMessage.error('搜索用户失败')
  } finally {
    loading.value = false
  }
}

/**
 * View user detail
 */
const viewUserDetail = async (user) => {
  selectedUser.value = user
  showDetailDialog.value = true
  showHierarchy.value = false
  detailLoading.value = true
  
  try {
    const response = await request.get(`/team-management/user/${user.wallet_address}`)
    if (response.success) {
      userDetail.value = response.data
    }
  } catch (error) {
    console.error('Get user detail error:', error)
    ElMessage.error('获取用户详情失败')
  } finally {
    detailLoading.value = false
  }
}

/**
 * Load hierarchy tree
 */
const loadHierarchy = async () => {
  if (!selectedUser.value) return
  showHierarchy.value = true
  hierarchyLoading.value = true
  
  try {
    const response = await request.get(`/team-management/hierarchy/${selectedUser.value.wallet_address}`, {
      params: { max_level: 5 }
    })
    if (response.success) {
      hierarchyData.value = response.data
    }
  } catch (error) {
    console.error('Load hierarchy error:', error)
    ElMessage.error('获取推荐层级失败')
  } finally {
    hierarchyLoading.value = false
  }
}

/**
 * Open award dialog
 */
const openAwardDialog = (user, type) => {
  awardType.value = type
  awardForm.wallet_address = user.wallet_address
  awardForm.amount = 10
  awardForm.broker_level = user.broker_level || 1
  awardForm.reason = ''
  showAwardDialog.value = true
}

/**
 * Submit award
 */
const submitAward = async () => {
  if (!awardForm.amount || awardForm.amount <= 0) {
    ElMessage.warning('请输入有效金额')
    return
  }

  await ElMessageBox.confirm(
    `确定要向 ${formatAddress(awardForm.wallet_address)} 发放 ${awardForm.amount} USDT ${awardType.value === 'referral' ? '推荐奖励' : '团队分红'} 吗？`,
    '确认发放',
    { type: 'warning' }
  )

  awarding.value = true
  try {
    const endpoint = awardType.value === 'referral' 
      ? '/team-management/award-referral' 
      : '/team-management/award-dividend'
    
    const response = await request.post(endpoint, awardForm)
    if (response.success) {
      ElMessage.success(response.message || '发放成功')
      showAwardDialog.value = false
      // Refresh detail if open
      if (showDetailDialog.value && selectedUser.value) {
        viewUserDetail(selectedUser.value)
      }
      // Refresh list
      searchUsers()
    } else {
      ElMessage.error(response.message || '发放失败')
    }
  } catch (error) {
    console.error('Award error:', error)
    ElMessage.error(error.response?.data?.message || '发放失败')
  } finally {
    awarding.value = false
  }
}

/**
 * Open level dialog
 */
const openLevelDialog = () => {
  if (!userDetail.value.wallet_address) return
  levelForm.wallet_address = userDetail.value.wallet_address
  levelForm.old_level = userDetail.value.broker_level || 0
  levelForm.new_level = userDetail.value.broker_level || 0
  levelForm.reason = ''
  showLevelDialog.value = true
}

/**
 * Submit level change
 */
const submitLevelChange = async () => {
  if (levelForm.new_level === levelForm.old_level) {
    ElMessage.warning('新等级与当前等级相同')
    return
  }

  await ElMessageBox.confirm(
    `确定要将 ${formatAddress(levelForm.wallet_address)} 的等级从 ${levelForm.old_level}级 调整为 ${levelForm.new_level}级 吗？`,
    '确认调整',
    { type: 'warning' }
  )

  levelChanging.value = true
  try {
    const response = await request.put('/team-management/broker-level', levelForm)
    if (response.success) {
      ElMessage.success(response.message || '调整成功')
      showLevelDialog.value = false
      // Refresh detail
      if (selectedUser.value) {
        viewUserDetail(selectedUser.value)
      }
      // Refresh list
      searchUsers()
    } else {
      ElMessage.error(response.message || '调整失败')
    }
  } catch (error) {
    console.error('Level change error:', error)
    ElMessage.error(error.response?.data?.message || '调整失败')
  } finally {
    levelChanging.value = false
  }
}

/**
 * Submit batch award
 */
const submitBatchAward = async () => {
  if (parsedBatchList.value.length === 0) {
    ElMessage.warning('请输入有效的发放列表')
    return
  }

  await ElMessageBox.confirm(
    `确定要批量发放 ${parsedBatchList.value.length} 条 ${batchForm.award_type === 'referral' ? '推荐奖励' : '团队分红'}，总金额 ${batchTotalAmount.value} USDT 吗？`,
    '确认批量发放',
    { type: 'warning' }
  )

  batchAwarding.value = true
  try {
    const response = await request.post('/team-management/batch-award', {
      awards: parsedBatchList.value,
      award_type: batchForm.award_type,
      reason: batchForm.reason || '批量发放'
    })
    if (response.success) {
      ElMessage.success(response.message || '批量发放完成')
      showBatchAwardDialog.value = false
      batchForm.rawInput = ''
      searchUsers()
    } else {
      ElMessage.error(response.message || '批量发放失败')
    }
  } catch (error) {
    console.error('Batch award error:', error)
    ElMessage.error(error.response?.data?.message || '批量发放失败')
  } finally {
    batchAwarding.value = false
  }
}

// ==================== Utilities ====================

const formatAddress = (addr) => {
  if (!addr) return '-'
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const formatMoney = (value) => {
  return parseFloat(value || 0).toFixed(4)
}

const getLevelType = (level) => {
  const types = ['info', 'primary', 'success', 'warning', 'danger', 'danger']
  return types[level] || 'info'
}

const copyText = (text) => {
  navigator.clipboard.writeText(text)
  ElMessage.success('已复制')
}

// ==================== Lifecycle ====================

onMounted(() => {
  searchUsers()
})
</script>

<style scoped>
.team-management-container {
  padding: 20px;
}

.header-card {
  margin-bottom: 20px;
}

.header-card h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 20px;
  color: var(--admin-text-primary);
}

.header-card .subtitle {
  margin: 8px 0 0 0;
  color: var(--admin-text-secondary);
  font-size: 14px;
}

.search-card {
  margin-bottom: 20px;
}

.main-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.wallet-addr {
  font-family: 'Courier New', monospace;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--admin-text-regular);
}

.wallet-addr:hover {
  color: var(--admin-primary);
}

.stat-value {
  font-weight: 600;
  color: var(--admin-primary);
}

.amount {
  font-weight: 600;
}

.amount.success {
  color: var(--admin-success);
}

.amount.warning {
  color: var(--admin-warning);
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

/* User Detail Styles */
.user-detail {
  padding: 10px 0;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 16px;
  border-radius: 8px;
  background: var(--admin-bg-secondary);
  border: 1px solid var(--admin-border-color-light);
}

.stat-card .stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
}

.stat-card .stat-icon .el-icon {
  font-size: 24px;
  color: #fff;
}

.stat-card.primary .stat-icon { background: linear-gradient(135deg, #409EFF, #66b1ff); }
.stat-card.success .stat-icon { background: linear-gradient(135deg, #67C23A, #95d475); }
.stat-card.warning .stat-icon { background: linear-gradient(135deg, #E6A23C, #f3d19e); }
.stat-card.info .stat-icon { background: linear-gradient(135deg, #909399, #c0c4cc); }

.stat-card .stat-info .value {
  font-size: 20px;
  font-weight: 700;
  color: var(--admin-text-primary);
}

.stat-card .stat-info .label {
  font-size: 12px;
  color: var(--admin-text-secondary);
  margin-top: 4px;
}

.detail-desc {
  margin-bottom: 20px;
}

.wallet-full {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  word-break: break-all;
}

.detail-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.hierarchy-section {
  margin-top: 20px;
  padding: 16px;
  background: var(--admin-bg-secondary);
  border-radius: 8px;
}

.hierarchy-section h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px 0;
  color: var(--admin-text-primary);
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.tree-node .node-addr {
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.tree-node .node-info {
  font-size: 11px;
  color: var(--admin-text-secondary);
}

/* Award Form */
.unit {
  margin-left: 8px;
  color: var(--admin-text-secondary);
}

/* Batch Preview */
.batch-preview {
  margin-top: 20px;
  padding: 12px;
  background: var(--admin-bg-secondary);
  border-radius: 6px;
}

.batch-preview h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: var(--admin-text-primary);
}

.more-hint {
  text-align: center;
  color: var(--admin-text-secondary);
  font-size: 12px;
  margin-top: 8px;
}
</style>

