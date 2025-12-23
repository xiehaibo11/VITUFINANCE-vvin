<template>
  <div class="page-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>过期机器人</h2>
      <p class="description">查看所有已过期的机器人历史记录和收益详情</p>
    </div>
    
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon warning">
            <el-icon><Timer /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.expiredCount }}</div>
            <div class="stat-label">已过期</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon success">
            <el-icon><Coin /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalInvestment }}</div>
            <div class="stat-label">历史投资 (USDT)</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon primary">
            <el-icon><TrendCharts /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalProfit }}</div>
            <div class="stat-label">总收益 (USDT)</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon info">
            <el-icon><DocumentCopy /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.avgProfit }}%</div>
            <div class="stat-label">平均收益率</div>
          </div>
        </div>
      </el-col>
    </el-row>
    
    <!-- 搜索区域 -->
    <div class="search-area">
      <el-form :inline="!isMobile" :model="searchForm" @submit.prevent="handleSearch">
        <el-form-item label="钱包地址">
          <el-input
            v-model="searchForm.wallet_address"
            placeholder="请输入钱包地址"
            clearable
            style="width: 280px"
          />
        </el-form-item>
        <el-form-item label="机器人类型">
          <el-select v-model="searchForm.robot_type" placeholder="全部" clearable style="width: 140px">
            <el-option label="CEX 机器人" value="cex" />
            <el-option label="DEX 机器人" value="dex" />
            <el-option label="网格交易" value="grid" />
            <el-option label="高频交易" value="high" />
          </el-select>
        </el-form-item>
        <el-form-item label="过期时间">
          <el-date-picker
            v-model="searchForm.expiredDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 280px"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
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
          <el-button type="success" @click="fetchRobots">
            <el-icon><Refresh /></el-icon>
            刷新数据
          </el-button>
        </el-form-item>
      </el-form>
    </div>
    
    <!-- 数据表格 -->
    <el-table
      v-loading="loading"
      :data="robotList"
      stripe
      border
      style="width: 100%"
      :default-sort="{ prop: 'end_time', order: 'descending' }"
    >
      <el-table-column type="index" label="序号" width="60" align="center" />
      
      <el-table-column prop="id" label="ID" width="80" align="center" sortable />
      
      <el-table-column prop="wallet_address" label="钱包地址" min-width="200">
        <template #default="{ row }">
          <el-tooltip :content="row.wallet_address" placement="top">
            <span class="wallet-address" @click="copyText(row.wallet_address)">
              {{ shortenAddress(row.wallet_address) }}
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      
      <el-table-column prop="robot_name" label="机器人名称" min-width="170">
        <template #default="{ row }">
          <div class="robot-name-cell">
            <span class="robot-name">{{ row.robot_name || '-' }}</span>
            <div class="robot-id-small">ID: {{ row.robot_id || '-' }}</div>
          </div>
        </template>
      </el-table-column>
      
      <el-table-column prop="robot_type" label="类型" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="getRobotTypeColor(row.robot_type)" size="small">
            {{ getRobotTypeName(row.robot_type) }}
          </el-tag>
        </template>
      </el-table-column>
      
      <el-table-column prop="price" label="购买价格" width="130" align="right" sortable>
        <template #default="{ row }">
          <span class="amount">{{ formatAmount(row.price) }} USDT</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="daily_profit" label="日收益率" width="100" align="center" sortable>
        <template #default="{ row }">
          <span class="rate positive">{{ row.daily_profit || 0 }}%</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="total_profit" label="实际收益" width="120" align="right" sortable>
        <template #default="{ row }">
          <span class="amount positive">{{ formatAmount(row.total_profit) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="quantify_count" label="量化次数" width="100" align="center" sortable>
        <template #default="{ row }">
          <el-tag type="info" size="small">{{ row.quantify_count || 0 }}次</el-tag>
        </template>
      </el-table-column>
      
      <el-table-column label="收益率" width="110" align="center" sortable>
        <template #default="{ row }">
          <el-tag :type="getProfitRateType(row)" size="small">
            {{ calculateProfitRate(row) }}
          </el-tag>
        </template>
      </el-table-column>
      
      <el-table-column prop="expected_return" label="预期收益" width="120" align="right" sortable>
        <template #default="{ row }">
          <span class="amount">{{ formatAmount(row.expected_return) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="start_time" label="开始时间" width="170" sortable>
        <template #default="{ row }">
          <span class="datetime">{{ formatDateTime(row.start_time || row.start_date) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="end_time" label="过期时间" width="170" sortable>
        <template #default="{ row }">
          <span class="datetime expired-date">{{ formatDateTime(row.end_time || row.end_date) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="duration_hours" label="运行周期" width="100" align="center">
        <template #default="{ row }">
          <span class="duration">{{ formatDuration(row) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="status" label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag type="info" size="small">已过期</el-tag>
        </template>
      </el-table-column>
      
      <el-table-column prop="updated_at" label="最后更新" width="170" sortable>
        <template #default="{ row }">
          <span class="datetime">{{ formatDateTime(row.updated_at) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column label="操作" width="200" align="center" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" size="small" @click="viewDetail(row.id)">
            查看详情
          </el-button>
          <el-button type="info" size="small" @click="viewUserData(row.wallet_address)">
            用户数据
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
    
    <!-- 机器人详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="机器人详情（已过期）"
      :close-on-click-modal="false"
      append-to-body
      destroy-on-close
      class="robot-detail-dialog"
    >
      <div v-loading="detailLoading" class="dialog-content-wrapper">
        <div v-if="robotDetail">
          <!-- 收益汇总卡片 -->
          <el-alert
            :title="`收益汇总: 投入 ${formatAmount(robotDetail.robot.price)} USDT，获得 ${formatAmount(robotDetail.robot.total_profit)} USDT，收益率 ${calculateProfitRate(robotDetail.robot)}`"
            :type="getProfitRateType(robotDetail.robot)"
            :closable="false"
            style="margin-bottom: 20px"
          />
          
          <!-- 基本信息 -->
          <el-descriptions title="基本信息" :column="2" border>
            <el-descriptions-item label="记录ID">{{ robotDetail.robot.id }}</el-descriptions-item>
            <el-descriptions-item label="机器人ID">{{ robotDetail.robot.robot_id || '-' }}</el-descriptions-item>
            <el-descriptions-item label="钱包地址" :span="2">
              <span class="wallet-address" @click="copyText(robotDetail.robot.wallet_address)">
                {{ robotDetail.robot.wallet_address }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="机器人名称">{{ robotDetail.robot.robot_name }}</el-descriptions-item>
            <el-descriptions-item label="机器人类型">
              <el-tag :type="getRobotTypeColor(robotDetail.robot.robot_type)" size="small">
                {{ getRobotTypeName(robotDetail.robot.robot_type) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="购买价格">{{ formatAmount(robotDetail.robot.price) }} USDT</el-descriptions-item>
            <el-descriptions-item label="日收益率">{{ robotDetail.robot.daily_profit }}%</el-descriptions-item>
            <el-descriptions-item label="实际收益">
              <span class="amount positive">{{ formatAmount(robotDetail.robot.total_profit) }} USDT</span>
            </el-descriptions-item>
            <el-descriptions-item label="预期收益">{{ formatAmount(robotDetail.robot.expected_return) }} USDT</el-descriptions-item>
            <el-descriptions-item label="收益完成率">
              <el-tag :type="getProfitRateType(robotDetail.robot)" size="small">
                {{ calculateProfitRate(robotDetail.robot) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="运行状态">
              <el-tag type="info" size="small">已过期</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="量化次数">{{ robotDetail.robot.quantify_count || 0 }} 次</el-descriptions-item>
            <el-descriptions-item label="代币类型">{{ robotDetail.robot.token || 'USDT' }}</el-descriptions-item>
            <el-descriptions-item label="运行周期">{{ formatDuration(robotDetail.robot) }}</el-descriptions-item>
            <el-descriptions-item label="实际运行天数">
              {{ calculateActualDays(robotDetail.robot) }} 天
            </el-descriptions-item>
            <el-descriptions-item label="开始时间">{{ formatDateTime(robotDetail.robot.start_time) }}</el-descriptions-item>
            <el-descriptions-item label="过期时间">
              <span class="expired-date">{{ formatDateTime(robotDetail.robot.end_time) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDateTime(robotDetail.robot.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="最后更新">{{ formatDateTime(robotDetail.robot.updated_at) }}</el-descriptions-item>
          </el-descriptions>
          
          <!-- 用户信息 -->
          <el-descriptions title="用户信息" :column="2" border style="margin-top: 20px" v-if="robotDetail.userInfo">
            <el-descriptions-item label="USDT余额">{{ formatAmount(robotDetail.userInfo.usdt_balance) }} USDT</el-descriptions-item>
            <el-descriptions-item label="WLD余额">{{ formatAmount(robotDetail.userInfo.wld_balance) }} WLD</el-descriptions-item>
            <el-descriptions-item label="总充值">{{ formatAmount(robotDetail.userInfo.total_deposit) }} USDT</el-descriptions-item>
            <el-descriptions-item label="总提款">{{ formatAmount(robotDetail.userInfo.total_withdraw) }} USDT</el-descriptions-item>
            <el-descriptions-item label="注册时间" :span="2">{{ formatDateTime(robotDetail.userInfo.created_at) }}</el-descriptions-item>
          </el-descriptions>
          
          <!-- 量化日志 -->
          <div style="margin-top: 20px">
            <h3 style="margin-bottom: 10px">量化日志 ({{ robotDetail.quantifyLogs.length }})</h3>
            <el-table :data="robotDetail.quantifyLogs" border stripe max-height="300">
              <el-table-column type="index" label="#" width="50" />
              <el-table-column prop="earnings" label="本次收益" width="120">
                <template #default="{ row }">
                  <span class="amount positive">{{ formatAmount(row.earnings) }} USDT</span>
                </template>
              </el-table-column>
              <el-table-column prop="cumulative_earnings" label="累计收益" width="130">
                <template #default="{ row }">
                  <span class="amount positive">{{ formatAmount(row.cumulative_earnings) }} USDT</span>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'success' ? 'success' : 'warning'" size="small">
                    {{ row.status === 'success' ? '成功' : row.status }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" min-width="150" />
              <el-table-column prop="created_at" label="量化时间" width="170">
                <template #default="{ row }">
                  {{ formatDateTime(row.created_at) }}
                </template>
              </el-table-column>
            </el-table>
          </div>
          
          <!-- 推荐奖励 -->
          <div style="margin-top: 20px" v-if="robotDetail.referralRewards && robotDetail.referralRewards.length > 0">
            <h3 style="margin-bottom: 10px">推荐奖励 ({{ robotDetail.referralRewards.length }})</h3>
            <el-alert
              :title="`此机器人产生的推荐奖励总额: ${calculateTotalReferralRewards(robotDetail.referralRewards)} USDT`"
              type="success"
              :closable="false"
              style="margin-bottom: 10px"
            />
            <el-table :data="robotDetail.referralRewards" border stripe max-height="300">
              <el-table-column type="index" label="#" width="50" />
              <el-table-column prop="wallet_address" label="获奖地址" width="180">
                <template #default="{ row }">
                  <span class="wallet-address" @click="copyText(row.wallet_address)">
                    {{ shortenAddress(row.wallet_address) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="level" label="级别" width="80" align="center" />
              <el-table-column prop="reward_rate" label="比例" width="80">
                <template #default="{ row }">
                  {{ row.reward_rate }}%
                </template>
              </el-table-column>
              <el-table-column prop="reward_amount" label="奖励金额" width="130">
                <template #default="{ row }">
                  <span class="amount positive">{{ formatAmount(row.reward_amount) }} USDT</span>
                </template>
              </el-table-column>
              <el-table-column prop="source_type" label="来源" width="100">
                <template #default="{ row }">
                  <el-tag size="small">{{ row.source_type === 'maturity' ? '到期' : row.source_type }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="created_at" label="发放时间" width="170">
                <template #default="{ row }">
                  {{ formatDateTime(row.created_at) }}
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
    
    <!-- 用户数据对话框 -->
    <el-dialog
      v-model="userDataDialogVisible"
      title="用户机器人数据"
      :close-on-click-modal="false"
      append-to-body
      destroy-on-close
      class="robot-detail-dialog"
    >
      <div v-loading="userDataLoading" class="dialog-content-wrapper">
        <div v-if="userData">
          <!-- 用户总览 -->
          <el-row :gutter="20" style="margin-bottom: 20px">
            <el-col :xs="24" :sm="12" :md="6">
              <div class="stat-card-mini">
                <div class="stat-label">总收益</div>
                <div class="stat-value positive">{{ userData.stats.totalEarnings }} USDT</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <div class="stat-card-mini">
                <div class="stat-label">量化次数</div>
                <div class="stat-value">{{ userData.stats.quantifyCount }}</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <div class="stat-card-mini">
                <div class="stat-label">推荐奖励</div>
                <div class="stat-value positive">{{ userData.stats.totalReferralRewards }} USDT</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :md="6">
              <div class="stat-card-mini">
                <div class="stat-label">机器人数量</div>
                <div class="stat-value">{{ userData.robots.length }}</div>
              </div>
            </el-col>
          </el-row>
          
          <!-- 用户信息 -->
          <el-descriptions title="用户信息" :column="2" border>
            <el-descriptions-item label="钱包地址" :span="2">
              <span class="wallet-address" @click="copyText(userData.userInfo.wallet_address)">
                {{ userData.userInfo.wallet_address }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="USDT余额">{{ formatAmount(userData.userInfo.usdt_balance) }} USDT</el-descriptions-item>
            <el-descriptions-item label="WLD余额">{{ formatAmount(userData.userInfo.wld_balance) }} WLD</el-descriptions-item>
            <el-descriptions-item label="总充值">{{ formatAmount(userData.userInfo.total_deposit) }} USDT</el-descriptions-item>
            <el-descriptions-item label="总提款">{{ formatAmount(userData.userInfo.total_withdraw) }} USDT</el-descriptions-item>
            <el-descriptions-item label="注册时间" :span="2">{{ formatDateTime(userData.userInfo.created_at) }}</el-descriptions-item>
          </el-descriptions>
          
          <!-- 机器人列表 -->
          <div style="margin-top: 20px">
            <h3 style="margin-bottom: 10px">机器人列表 ({{ userData.robots.length }})</h3>
            <el-table :data="userData.robots" border stripe max-height="400">
              <el-table-column type="index" label="#" width="50" />
              <el-table-column prop="robot_name" label="机器人名称" width="150" />
              <el-table-column prop="robot_type" label="类型" width="120">
                <template #default="{ row }">
                  <el-tag :type="getRobotTypeColor(row.robot_type)" size="small">
                    {{ getRobotTypeName(row.robot_type) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="price" label="价格" width="120">
                <template #default="{ row }">
                  {{ formatAmount(row.price) }} USDT
                </template>
              </el-table-column>
              <el-table-column prop="daily_profit" label="日收益率" width="100">
                <template #default="{ row }">
                  {{ row.daily_profit }}%
                </template>
              </el-table-column>
              <el-table-column prop="total_profit" label="累计收益" width="130">
                <template #default="{ row }">
                  <span class="amount positive">{{ formatAmount(row.total_profit) }} USDT</span>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="getStatusType(row.status)" size="small">
                    {{ getStatusText(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="quantify_count" label="量化次数" width="100" align="center" />
              <el-table-column prop="end_time" label="过期时间" width="170">
                <template #default="{ row }">
                  {{ formatDateTime(row.end_time) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" size="small" @click="viewDetailFromUser(row.id)">
                    详情
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="userDataDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
/**
 * 过期机器人页面
 * 专门显示状态为 expired 或已到期的机器人
 */
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Timer, Coin, TrendCharts, DocumentCopy } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { getRobotPurchases, getRobotStats, getRobotDetail, getUserRobots } from '@/api'
import { useIsMobile } from '@/composables/useIsMobile'

// 加载状态
const loading = ref(false)
const { isMobile } = useIsMobile()

// 统计数据
const stats = reactive({
  expiredCount: 0,
  totalInvestment: '0.00',
  totalProfit: '0.00',
  avgProfit: '0.00'
})

// 机器人列表
const robotList = ref([])

// 搜索表单
const searchForm = reactive({
  wallet_address: '',
  robot_type: '',
  expiredDateRange: null
})

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

// 详情对话框
const detailDialogVisible = ref(false)
const detailLoading = ref(false)
const robotDetail = ref(null)

// 用户数据对话框
const userDataDialogVisible = ref(false)
const userDataLoading = ref(false)
const userData = ref(null)

/**
 * 获取统计数据
 */
const fetchStats = async () => {
  try {
    const res = await getRobotStats()
    if (res.success && res.data) {
      stats.expiredCount = res.data.expiredCount || 0
      
      // 获取过期机器人详细数据来计算统计
      const expiredRobots = await getRobotPurchases({
        status: 'expired',
        page: 1,
        pageSize: 999999 // 获取所有记录来计算统计
      })
      
      if (expiredRobots.success && expiredRobots.data.list) {
        const list = expiredRobots.data.list
        
        // 总投资
        const totalInvestment = list.reduce((sum, robot) => {
          return sum + parseFloat(robot.price || 0)
        }, 0)
        stats.totalInvestment = totalInvestment.toFixed(2)
        
        // 总收益
        const totalProfit = list.reduce((sum, robot) => {
          return sum + parseFloat(robot.total_profit || 0)
        }, 0)
        stats.totalProfit = totalProfit.toFixed(2)
        
        // 平均收益率
        if (totalInvestment > 0) {
          stats.avgProfit = ((totalProfit / totalInvestment) * 100).toFixed(2)
        }
      }
    }
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

/**
 * 获取过期机器人记录
 */
const fetchRobots = async () => {
  loading.value = true
  try {
    const res = await getRobotPurchases({
      page: pagination.page,
      pageSize: pagination.pageSize,
      wallet_address: searchForm.wallet_address || undefined,
      robot_type: searchForm.robot_type || undefined,
      status: 'expired' // 固定为 expired
    })
    
    if (res.success) {
      let filteredList = res.data.list || []
      
      // 如果有日期范围筛选，在前端过滤
      if (searchForm.expiredDateRange && searchForm.expiredDateRange.length === 2) {
        const [startDate, endDate] = searchForm.expiredDateRange
        filteredList = filteredList.filter(robot => {
          const expiredDate = dayjs(robot.end_time || robot.end_date).format('YYYY-MM-DD')
          return expiredDate >= startDate && expiredDate <= endDate
        })
      }
      
      robotList.value = filteredList
      pagination.total = res.data.total || 0
    }
  } catch (error) {
    console.error('获取机器人购买记录失败:', error)
    ElMessage.error('获取数据失败，请重试')
  } finally {
    loading.value = false
  }
}

/**
 * 搜索
 */
const handleSearch = () => {
  pagination.page = 1
  fetchRobots()
}

/**
 * 重置
 */
const handleReset = () => {
  searchForm.wallet_address = ''
  searchForm.robot_type = ''
  searchForm.expiredDateRange = null
  pagination.page = 1
  fetchRobots()
}

/**
 * 分页大小变化
 */
const handleSizeChange = () => {
  pagination.page = 1
  fetchRobots()
}

/**
 * 页码变化
 */
const handlePageChange = () => {
  fetchRobots()
}

/**
 * 复制文本
 */
const copyText = (text) => {
  navigator.clipboard.writeText(text)
  ElMessage.success('已复制')
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
 * 格式化日期时间
 */
const formatDateTime = (datetime) => {
  if (!datetime) return '-'
  return dayjs(datetime).format('YYYY-MM-DD HH:mm:ss')
}

/**
 * 计算收益率
 * 如果没有预期收益，则基于购买价格计算
 */
const calculateProfitRate = (row) => {
  const price = parseFloat(row.price || 0)
  const profit = parseFloat(row.total_profit || 0)
  let expected = parseFloat(row.expected_return || 0)
  
  // 如果预期收益为0，使用购买价格作为基准
  if (expected <= 0 && price > 0) {
    expected = price
  }
  
  if (expected <= 0) return '0.00%'
  
  const rate = (profit / expected) * 100
  return `${rate.toFixed(2)}%`
}

/**
 * 获取收益率标签类型
 */
const getProfitRateType = (row) => {
  const price = parseFloat(row.price || 0)
  const profit = parseFloat(row.total_profit || 0)
  let expected = parseFloat(row.expected_return || 0)
  
  // 如果预期收益为0，使用购买价格作为基准
  if (expected <= 0 && price > 0) {
    expected = price
  }
  
  if (expected <= 0) return 'info'
  
  const rate = (profit / expected) * 100
  
  if (rate >= 100) return 'success'
  if (rate >= 80) return 'warning'
  return 'danger'
}

/**
 * 计算实际运行天数
 */
const calculateActualDays = (row) => {
  const startTime = row.start_time || row.start_date
  const endTime = row.end_time || row.end_date
  
  if (!startTime || !endTime) return '-'
  
  return dayjs(endTime).diff(dayjs(startTime), 'day')
}

/**
 * 计算推荐奖励总额
 */
const calculateTotalReferralRewards = (rewards) => {
  if (!rewards || rewards.length === 0) return '0.0000'
  
  const total = rewards.reduce((sum, reward) => {
    return sum + parseFloat(reward.reward_amount || 0)
  }, 0)
  
  return total.toFixed(4)
}

/**
 * 格式化运行周期
 */
const formatDuration = (row) => {
  if (row.duration_hours) {
    const hours = parseInt(row.duration_hours)
    if (hours >= 24) {
      const days = Math.floor(hours / 24)
      const remainingHours = hours % 24
      if (remainingHours > 0) {
        return `${days}天${remainingHours}h`
      }
      return `${days}天`
    }
    return `${hours}h`
  }
  
  const startTime = row.start_time || row.start_date
  const endTime = row.end_time || row.end_date
  if (!startTime || !endTime) return '-'
  
  const diffHours = dayjs(endTime).diff(dayjs(startTime), 'hour')
  if (diffHours >= 24) {
    return `${Math.floor(diffHours / 24)}天`
  }
  return `${diffHours}h`
}

/**
 * 获取机器人类型颜色
 */
const getRobotTypeColor = (type) => {
  const colors = {
    'cex': 'primary',
    'dex': 'success',
    'grid': 'warning',
    'high': 'danger'
  }
  return colors[type] || 'info'
}

/**
 * 获取机器人类型名称
 */
const getRobotTypeName = (type) => {
  const names = {
    'cex': 'CEX 机器人',
    'dex': 'DEX 机器人',
    'grid': '网格交易',
    'high': '高频交易'
  }
  return names[type] || type
}

/**
 * 获取状态类型
 */
const getStatusType = (status) => {
  const types = {
    active: 'success',
    expired: 'info',
    cancelled: 'danger'
  }
  return types[status] || 'info'
}

/**
 * 获取状态文本
 */
const getStatusText = (status) => {
  const texts = {
    active: '运行中',
    expired: '已过期',
    cancelled: '已取消'
  }
  return texts[status] || status
}

/**
 * 查看机器人详情
 */
const viewDetail = async (id) => {
  try {
    detailDialogVisible.value = true
    detailLoading.value = true
    robotDetail.value = null
    
    const res = await getRobotDetail(id)
    if (res.success) {
      robotDetail.value = res.data
    } else {
      ElMessage.error(res.message || '获取详情失败')
    }
  } catch (error) {
    console.error('查看机器人详情失败:', error)
    ElMessage.error('获取详情失败')
  } finally {
    detailLoading.value = false
  }
}

/**
 * 查看用户数据
 */
const viewUserData = async (walletAddress) => {
  try {
    userDataDialogVisible.value = true
    userDataLoading.value = true
    userData.value = null
    
    const res = await getUserRobots(walletAddress)
    if (res.success) {
      userData.value = res.data
    } else {
      ElMessage.error(res.message || '获取用户数据失败')
    }
  } catch (error) {
    console.error('查看用户数据失败:', error)
    ElMessage.error('获取用户数据失败')
  } finally {
    userDataLoading.value = false
  }
}

/**
 * 从用户数据对话框中查看机器人详情
 */
const viewDetailFromUser = async (id) => {
  userDataDialogVisible.value = false
  await viewDetail(id)
}

// 初始化
onMounted(() => {
  fetchStats()
  fetchRobots()
})
</script>

<style lang="scss" scoped>
// 导入通用样式
.stats-row {
  margin-bottom: 20px;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.wallet-address {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #606266;
  cursor: pointer;
  
  &:hover {
    color: #409EFF;
  }
}

.robot-name-cell {
  .robot-name {
    font-weight: 500;
    color: var(--admin-text-primary);
    display: block;
  }
  
  .robot-id-small {
    font-size: 11px;
    color: var(--admin-text-secondary);
    margin-top: 2px;
  }
}

.amount {
  font-weight: 600;
  
  &.positive {
    color: #67C23A;
  }
}

.rate {
  font-weight: 600;
  
  &.positive {
    color: #67C23A;
  }
}

.datetime {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 12px;
  color: var(--admin-text-secondary);
}

.expired-date {
  color: #909399;
  font-weight: 400;
}

.duration {
  font-weight: 500;
  color: var(--admin-text-secondary);
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 20px;
  background: var(--admin-card-bg);
  border-radius: 12px;
  box-shadow: var(--admin-card-shadow);
  border: 1px solid var(--admin-border-color-light);
  
  .stat-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    margin-right: 16px;
    
    &.primary {
      background: linear-gradient(135deg, #409EFF 0%, #66b1ff 100%);
    }
    
    &.success {
      background: linear-gradient(135deg, #67C23A 0%, #95d475 100%);
    }
    
    &.warning {
      background: linear-gradient(135deg, #E6A23C 0%, #f3d19e 100%);
    }
    
    &.info {
      background: linear-gradient(135deg, #909399 0%, #c0c4cc 100%);
    }
    
    .el-icon {
      font-size: 24px;
      color: #ffffff;
    }
  }
  
  .stat-info {
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--admin-text-primary);
      line-height: 1.2;
    }
    
    .stat-label {
      font-size: 13px;
      color: var(--admin-text-secondary);
      margin-top: 4px;
    }
  }
}

.stat-card-mini {
  padding: 15px;
  background: var(--admin-card-bg);
  border-radius: 8px;
  box-shadow: var(--admin-card-shadow);
  border: 1px solid var(--admin-border-color-light);
  text-align: center;
  
  .stat-label {
    font-size: 12px;
    color: var(--admin-text-secondary);
    margin-bottom: 8px;
  }
  
  .stat-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--admin-text-primary);
    
    &.positive {
      color: #67C23A;
    }
  }
}

// 弹窗样式优化
.robot-detail-dialog {
  :deep(.el-overlay) {
    z-index: 2999 !important;
  }
  
  :deep(.el-dialog) {
    z-index: 3000 !important;
    margin: 0 auto;
    padding: 0;
    width: calc(100vw - 300px);
    max-width: 1440px;
    min-height: 500px;
    max-height: calc(100vh - 120px);
    margin-top: 60px !important;
    margin-bottom: 60px !important;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--admin-card-bg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    
    @media (max-width: 1200px) {
      width: calc(100vw - 144px);
      max-width: none;
    }
    
    @media (max-width: 768px) {
      width: 100vw !important;
      max-width: none !important;
      height: 100vh !important;
      max-height: 100vh !important;
      margin: 0 !important;
      border-radius: 0;
    }
  }
}

.dialog-content-wrapper {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 400px;
  -webkit-overflow-scrolling: touch;
  
  @media (max-width: 768px) {
    padding: 20px;
  }
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: var(--admin-border-color);
    border-radius: 3px;
    
    &:hover {
      background-color: var(--admin-text-secondary);
    }
  }
  
  &::-webkit-scrollbar-track {
    background-color: transparent;
  }
}
</style>

