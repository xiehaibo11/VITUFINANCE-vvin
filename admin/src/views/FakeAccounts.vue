<template>
  <div class="fake-accounts-page">
    <!-- Page Header -->
    <div class="page-header">
      <h2 class="page-title">
        <el-icon><UserFilled /></el-icon>
        虚假账户检测
      </h2>
      <p class="page-desc">检测没有充值记录的用户账户，可批量清理虚假数据</p>
    </div>

    <!-- Statistics Cards -->
    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :sm="6">
        <div class="stat-card warning">
          <div class="stat-icon"><el-icon><Warning /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ summary.fakeAccountCount }}</div>
            <div class="stat-label">虚假账户</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card danger">
          <div class="stat-icon"><el-icon><Coin /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatNumber(summary.totalUSDT) }}</div>
            <div class="stat-label">虚假USDT</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card primary">
          <div class="stat-icon"><el-icon><Money /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatNumber(summary.totalWLD) }}</div>
            <div class="stat-label">虚假WLD</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card success">
          <div class="stat-icon"><el-icon><TrendCharts /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatNumber(summary.totalProfit) }}</div>
            <div class="stat-label">虚假收益</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- Main Table Card -->
    <el-card class="table-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span class="header-title">⚠️ 无充值记录账户</span>
          <div class="header-actions">
            <el-input
              v-model="minBalance"
              type="number"
              placeholder="最小余额过滤"
              style="width: 140px"
              size="small"
              @change="fetchData"
            >
              <template #prepend>≥</template>
            </el-input>
            <el-button
              v-if="selectedAccounts.length > 0"
              type="danger"
              size="small"
              @click="batchClean"
              :loading="batchLoading"
            >
              批量清理 ({{ selectedAccounts.length }})
            </el-button>
            <el-button type="primary" size="small" @click="fetchData" :loading="loading">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-table
        ref="tableRef"
        :data="accounts"
        stripe
        v-loading="loading"
        @selection-change="handleSelectionChange"
        :max-height="500"
        size="small"
      >
        <el-table-column type="selection" width="45" />
        <el-table-column prop="wallet_address" label="钱包地址" min-width="180">
          <template #default="{ row }">
            <div class="wallet-cell">
              <span class="wallet-addr">{{ formatAddress(row.wallet_address) }}</span>
              <el-button link type="primary" size="small" @click="copyAddress(row.wallet_address)">
                <el-icon size="12"><CopyDocument /></el-icon>
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="usdt_balance" label="USDT余额" width="110" align="right">
          <template #default="{ row }">
            <span :class="row.usdt_balance > 0 ? 'text-danger' : ''">
              {{ formatNumber(row.usdt_balance) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="wld_balance" label="WLD余额" width="100" align="right">
          <template #default="{ row }">
            <span :class="row.wld_balance > 0 ? 'text-warning' : ''">
              {{ formatNumber(row.wld_balance) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="total_profit" label="累计收益" width="110" align="right">
          <template #default="{ row }">
            <span :class="row.total_profit > 0 ? 'text-success' : ''">
              {{ formatNumber(row.total_profit) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="关联数据" width="120" align="center">
          <template #default="{ row }">
            <div class="related-data">
              <el-tooltip content="机器人" placement="top">
                <el-tag v-if="row.robot_count > 0" type="primary" size="small">
                  🤖 {{ row.robot_count }}
                </el-tag>
              </el-tooltip>
              <el-tooltip content="质押" placement="top">
                <el-tag v-if="row.pledge_count > 0" type="warning" size="small">
                  💰 {{ row.pledge_count }}
                </el-tag>
              </el-tooltip>
              <el-tooltip content="跟单" placement="top">
                <el-tag v-if="row.follow_count > 0" type="success" size="small">
                  📈 {{ row.follow_count }}
                </el-tag>
              </el-tooltip>
              <span v-if="!row.robot_count && !row.pledge_count && !row.follow_count" class="text-muted">
                无
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="注册时间" width="160">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.is_banned ? 'danger' : 'success'" size="small">
              {{ row.is_banned ? '封禁' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.is_banned"
              type="success"
              size="small"
              link
              @click="unfreezeAccount(row.wallet_address)"
            >
              解冻
            </el-button>
            <el-button
              v-else
              type="danger"
              size="small"
              link
              @click="freezeAccount(row.wallet_address)"
            >
              冻结
            </el-button>
            <el-popconfirm
              title="确定要清理此账户吗？此操作不可恢复！"
              confirm-button-text="确定"
              cancel-button-text="取消"
              @confirm="cleanAccount(row.wallet_address)"
            >
              <template #reference>
                <el-button type="danger" size="small" link :loading="cleaningAddr === row.wallet_address">
                  清理
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </el-card>

    <!-- Zero Balance Accounts Card -->
    <el-card class="table-card" shadow="hover" style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <span class="header-title">🗑️ 零余额无活动账户</span>
          <div class="header-actions">
            <el-select v-model="inactiveDays" placeholder="不活跃天数" style="width: 130px" size="small" @change="fetchZeroBalance">
              <el-option label="30天" :value="30" />
              <el-option label="60天" :value="60" />
              <el-option label="90天" :value="90" />
            </el-select>
            <el-button
              v-if="selectedZeroAccounts.length > 0"
              type="danger"
              size="small"
              @click="batchCleanZero"
              :loading="batchZeroLoading"
            >
              批量清理 ({{ selectedZeroAccounts.length }})
            </el-button>
            <el-button type="info" size="small" @click="fetchZeroBalance" :loading="zeroLoading">
              <el-icon><Refresh /></el-icon>
              检测
            </el-button>
          </div>
        </div>
      </template>

      <el-table
        :data="zeroAccounts"
        stripe
        v-loading="zeroLoading"
        @selection-change="handleZeroSelectionChange"
        :max-height="300"
        size="small"
      >
        <el-table-column type="selection" width="45" />
        <el-table-column prop="wallet_address" label="钱包地址" min-width="200">
          <template #default="{ row }">
            <span class="wallet-addr">{{ formatAddress(row.wallet_address) }}</span>
            <el-button link type="primary" size="small" @click="copyAddress(row.wallet_address)">
              <el-icon size="12"><CopyDocument /></el-icon>
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="注册时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-popconfirm
              title="确定要清理此账户吗？"
              @confirm="cleanAccount(row.wallet_address)"
            >
              <template #reference>
                <el-button type="danger" size="small" link>清理</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="zeroPage"
          v-model:page-size="zeroPageSize"
          :total="zeroTotal"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="fetchZeroBalance"
          @current-change="fetchZeroBalance"
          small
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
/**
 * Fake Accounts Detection Page
 * Detect and clean accounts with no deposit records
 */
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  UserFilled, Warning, Coin, Money, TrendCharts,
  Refresh, CopyDocument
} from '@element-plus/icons-vue'
import request, { banUser, unbanUser } from '@/api'
import dayjs from 'dayjs'

// ==================== State ====================
const loading = ref(false)
const batchLoading = ref(false)
const zeroLoading = ref(false)
const batchZeroLoading = ref(false)
const cleaningAddr = ref('')

// Pagination
const currentPage = ref(1)
const pageSize = ref(50)
const total = ref(0)
const minBalance = ref(0)

// Zero balance pagination
const zeroPage = ref(1)
const zeroPageSize = ref(50)
const zeroTotal = ref(0)
const inactiveDays = ref(30)

// Data
const accounts = ref([])
const zeroAccounts = ref([])
const selectedAccounts = ref([])
const selectedZeroAccounts = ref([])

// Summary
const summary = reactive({
  fakeAccountCount: 0,
  totalUSDT: 0,
  totalWLD: 0,
  totalProfit: 0
})

// ==================== Methods ====================

const formatNumber = (num) => {
  if (!num) return '0'
  return parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

const formatAddress = (addr) => {
  if (!addr) return ''
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

const formatTime = (time) => {
  if (!time) return '-'
  return dayjs(time).format('YYYY-MM-DD HH:mm')
}

const copyAddress = async (addr) => {
  try {
    await navigator.clipboard.writeText(addr)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

const handleSelectionChange = (selection) => {
  selectedAccounts.value = selection
}

const handleZeroSelectionChange = (selection) => {
  selectedZeroAccounts.value = selection
}

// Fetch fake accounts
const fetchData = async () => {
  loading.value = true
  try {
    const res = await request.get('/fake-accounts', {
      params: {
        page: currentPage.value,
        limit: pageSize.value,
        minBalance: minBalance.value || 0
      }
    })
    if (res.success) {
      accounts.value = res.data || []
      total.value = res.pagination?.total || 0
      Object.assign(summary, res.summary || {})
    }
  } catch (error) {
    console.error('Fetch failed:', error)
    ElMessage.error('获取数据失败')
  } finally {
    loading.value = false
  }
}

// Fetch zero balance accounts
const fetchZeroBalance = async () => {
  zeroLoading.value = true
  try {
    const res = await request.get('/fake-accounts/zero-balance', {
      params: {
        page: zeroPage.value,
        limit: zeroPageSize.value,
        days: inactiveDays.value
      }
    })
    if (res.success) {
      zeroAccounts.value = res.data || []
      zeroTotal.value = res.pagination?.total || 0
    }
  } catch (error) {
    console.error('Fetch zero balance failed:', error)
  } finally {
    zeroLoading.value = false
  }
}

// Clean single account
const cleanAccount = async (walletAddress) => {
  cleaningAddr.value = walletAddress
  try {
    const res = await request.delete(`/fake-accounts/${walletAddress}`)
    if (res.success) {
      ElMessage.success('清理成功')
      fetchData()
      fetchZeroBalance()
    } else {
      ElMessage.error(res.message || '清理失败')
    }
  } catch (error) {
    ElMessage.error('清理失败')
  } finally {
    cleaningAddr.value = ''
  }
}

/**
 * Freeze/suspend a user account from the fake-accounts list.
 * This uses the same admin ban endpoint as the User Management page.
 *
 * Backend: POST /api/admin/users/:wallet_address/ban
 *
 * @param {string} walletAddress - Target wallet address
 */
const freezeAccount = async (walletAddress) => {
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `确定要冻结该用户吗？\n钱包地址：${formatAddress(walletAddress)}`,
      '确认冻结',
      {
        confirmButtonText: '冻结',
        cancelButtonText: '取消',
        inputPlaceholder: '请输入冻结原因（必填）',
        inputType: 'textarea',
        inputValidator: (val) => {
          if (!val || !String(val).trim()) return '冻结原因不能为空'
          if (String(val).trim().length < 3) return '原因太短（至少 3 个字符）'
          return true
        },
        type: 'warning'
      }
    )

    const res = await banUser(walletAddress, { reason: String(reason).trim() })
    if (res?.success) {
      ElMessage.success('已冻结用户')
      fetchData()
    } else {
      ElMessage.error(res?.message || '冻结失败')
    }
  } catch (e) {
    // Cancelled or failed - do not block user.
  }
}

/**
 * Unfreeze/unsuspend a user account from the fake-accounts list.
 *
 * Backend: POST /api/admin/users/:wallet_address/unban
 *
 * @param {string} walletAddress - Target wallet address
 */
const unfreezeAccount = async (walletAddress) => {
  try {
    await ElMessageBox.confirm(
      `确定要解冻该用户吗？\n钱包地址：${formatAddress(walletAddress)}`,
      '确认解冻',
      { type: 'warning', confirmButtonText: '解冻', cancelButtonText: '取消' }
    )

    const res = await unbanUser(walletAddress)
    if (res?.success) {
      ElMessage.success('已解冻用户')
      fetchData()
    } else {
      ElMessage.error(res?.message || '解冻失败')
    }
  } catch (e) {
    // Cancelled or failed - do not block user.
  }
}

// Batch clean fake accounts
const batchClean = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要清理选中的 ${selectedAccounts.value.length} 个账户吗？此操作不可恢复！`,
      '批量清理确认',
      { confirmButtonText: '确定清理', cancelButtonText: '取消', type: 'warning' }
    )

    batchLoading.value = true
    const addresses = selectedAccounts.value.map(a => a.wallet_address)
    const res = await request.post('/fake-accounts/batch-clean', { wallet_addresses: addresses })

    if (res.success) {
      ElMessage.success(`成功清理 ${res.cleaned} 个账户，跳过 ${res.skipped} 个`)
      selectedAccounts.value = []
      fetchData()
    } else {
      ElMessage.error(res.message || '批量清理失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('批量清理失败')
    }
  } finally {
    batchLoading.value = false
  }
}

// Batch clean zero balance accounts
const batchCleanZero = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要清理选中的 ${selectedZeroAccounts.value.length} 个零余额账户吗？`,
      '批量清理确认',
      { confirmButtonText: '确定清理', cancelButtonText: '取消', type: 'warning' }
    )

    batchZeroLoading.value = true
    const addresses = selectedZeroAccounts.value.map(a => a.wallet_address)
    const res = await request.post('/fake-accounts/batch-clean', { wallet_addresses: addresses })

    if (res.success) {
      ElMessage.success(`成功清理 ${res.cleaned} 个账户`)
      selectedZeroAccounts.value = []
      fetchZeroBalance()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('批量清理失败')
    }
  } finally {
    batchZeroLoading.value = false
  }
}

// ==================== Lifecycle ====================
onMounted(() => {
  fetchData()
  fetchZeroBalance()
})
</script>

<style lang="scss" scoped>
.fake-accounts-page {
  padding: 0;
}

.page-header {
  margin-bottom: 20px;

  .page-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 22px;
    font-weight: 600;
    color: var(--admin-text-primary);
    margin: 0 0 8px 0;
  }

  .page-desc {
    color: var(--admin-text-secondary);
    margin: 0;
    font-size: 14px;
  }
}

.stat-row {
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--admin-card-bg);
  border-radius: 12px;
  border: 1px solid var(--admin-border-color);

  .stat-icon {
    width: 50px;
    height: 50px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
  }

  &.warning .stat-icon {
    background: rgba(230, 162, 60, 0.15);
    color: var(--admin-warning);
  }

  &.danger .stat-icon {
    background: rgba(245, 108, 108, 0.15);
    color: var(--admin-danger);
  }

  &.primary .stat-icon {
    background: rgba(64, 158, 255, 0.15);
    color: var(--admin-primary);
  }

  &.success .stat-icon {
    background: rgba(103, 194, 58, 0.15);
    color: var(--admin-success);
  }

  .stat-info {
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--admin-text-primary);
    }

    .stat-label {
      font-size: 13px;
      color: var(--admin-text-secondary);
      margin-top: 4px;
    }
  }
}

.table-card {
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
  flex-wrap: wrap;
  gap: 12px;

  .header-title {
    font-size: 16px;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
}

.wallet-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.wallet-addr {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
}

.related-data {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
}

.text-danger { color: var(--admin-danger); font-weight: 600; }
.text-warning { color: var(--admin-warning); font-weight: 600; }
.text-success { color: var(--admin-success); font-weight: 600; }
.text-muted { color: var(--admin-text-placeholder); font-size: 12px; }

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0 0;
}

@media (max-width: 768px) {
  .stat-card {
    padding: 16px;

    .stat-icon { width: 40px; height: 40px; font-size: 20px; }
    .stat-info .stat-value { font-size: 20px; }
  }

  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>

