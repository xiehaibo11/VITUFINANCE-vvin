<template>
  <div class="page-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>运行中机器人</h2>
      <p class="description">查看所有正在运行的机器人详细信息</p>
    </div>
    
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon primary">
            <el-icon><Monitor /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.activeCount }}</div>
            <div class="stat-label">运行中</div>
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
            <div class="stat-label">总投资 (USDT)</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon warning">
            <el-icon><TrendCharts /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalProfit }}</div>
            <div class="stat-label">累计收益 (USDT)</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon info">
            <el-icon><Plus /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.todayCount }}</div>
            <div class="stat-label">今日新增</div>
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
        <el-form-item label="量化状态">
          <el-select v-model="searchForm.quantify_status" placeholder="全部" clearable style="width: 140px">
            <el-option label="已量化" :value="1" />
            <el-option label="未量化" :value="0" />
          </el-select>
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
      :default-sort="{ prop: 'created_at', order: 'descending' }"
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
      
      <el-table-column prop="total_profit" label="累计收益" width="130" align="right" sortable>
        <template #default="{ row }">
          <span class="amount positive">{{ formatAmount(row.total_profit) }} USDT</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="expected_return" label="预期收益" width="130" align="right" sortable>
        <template #default="{ row }">
          <span class="amount positive">{{ formatAmount(row.expected_return) }} USDT</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="quantify_count" label="量化次数" width="100" align="center" sortable>
        <template #default="{ row }">
          <el-tag type="info" size="small">{{ row.quantify_count || 0 }} 次</el-tag>
        </template>
      </el-table-column>
      
      <el-table-column prop="is_quantified" label="今日量化" width="120" align="center">
        <template #default="{ row }">
          <el-tooltip :content="row.robot_type === 'high' ? 'High机器人只需量化一次' : '今日量化状态'" placement="top">
            <el-tag :type="row.is_quantified ? 'success' : 'warning'" size="small">
              {{ row.is_quantified ? '已量化' : '未量化' }}
            </el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      
      <el-table-column prop="start_time" label="开始时间" width="170" sortable>
        <template #default="{ row }">
          <span class="datetime">{{ formatDateTime(row.start_time || row.start_date) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="end_time" label="到期时间" width="170" sortable>
        <template #default="{ row }">
          <span :class="['datetime', { 'warning-date': isExpiringSoon(row) }]">
            {{ formatDateTime(row.end_time || row.end_date) }}
          </span>
        </template>
      </el-table-column>
      
      <el-table-column prop="duration_hours" label="运行周期" width="100" align="center">
        <template #default="{ row }">
          <span class="duration">{{ formatDuration(row) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="hours_remaining" label="剩余时间" width="120" align="center" sortable>
        <template #default="{ row }">
          <span :class="['remaining', { 'warning': getRemainingHours(row) < 24, 'danger': getRemainingHours(row) <= 0 }]">
            {{ formatRemainingTime(row) }}
          </span>
        </template>
      </el-table-column>
      
      <el-table-column prop="created_at" label="创建时间" width="170" sortable>
        <template #default="{ row }">
          <span class="datetime">{{ formatDateTime(row.created_at) }}</span>
        </template>
      </el-table-column>
      
      <el-table-column label="操作" width="280" align="center" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" size="small" @click="viewDetail(row.id)">
            详情
          </el-button>
          <el-button type="info" size="small" @click="viewUserData(row.wallet_address)">
            用户
          </el-button>
          <el-button type="danger" size="small" @click="showCancelDialog(row)">
            关闭
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
      title="机器人详情"
      :close-on-click-modal="false"
      append-to-body
      destroy-on-close
      class="robot-detail-dialog"
    >
      <div v-loading="detailLoading" class="dialog-content-wrapper">
        <div v-if="robotDetail">
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
            <el-descriptions-item label="累计收益">{{ formatAmount(robotDetail.robot.total_profit) }} USDT</el-descriptions-item>
            <el-descriptions-item label="预期收益">{{ formatAmount(robotDetail.robot.expected_return) }} USDT</el-descriptions-item>
            <el-descriptions-item label="运行状态">
              <el-tag type="success" size="small">运行中</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="量化状态">
              <el-tag :type="robotDetail.robot.is_quantified ? 'success' : 'warning'" size="small">
                {{ robotDetail.robot.is_quantified ? '已量化' : '未量化' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="量化次数">{{ robotDetail.robot.quantify_count || 0 }} 次</el-descriptions-item>
            <el-descriptions-item label="代币类型">{{ robotDetail.robot.token || 'USDT' }}</el-descriptions-item>
            <el-descriptions-item label="运行周期">{{ formatDuration(robotDetail.robot) }}</el-descriptions-item>
            <el-descriptions-item label="剩余时间">
              <span :class="['remaining', { 'warning': getRemainingHours(robotDetail.robot) < 24 }]">
                {{ formatRemainingTime(robotDetail.robot) }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="开始时间">{{ formatDateTime(robotDetail.robot.start_time) }}</el-descriptions-item>
            <el-descriptions-item label="到期时间">{{ formatDateTime(robotDetail.robot.end_time) }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDateTime(robotDetail.robot.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ formatDateTime(robotDetail.robot.updated_at) }}</el-descriptions-item>
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
              <el-table-column prop="created_at" label="购买时间" width="170">
                <template #default="{ row }">
                  {{ formatDateTime(row.created_at) }}
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
    
    <!-- 关闭机器人确认对话框 -->
    <el-dialog
      v-model="cancelDialogVisible"
      title="关闭机器人"
      width="500px"
      :close-on-click-modal="false"
      append-to-body
      destroy-on-close
    >
      <div class="cancel-dialog-content">
        <el-alert
          title="注意：关闭机器人后无法自动恢复"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 20px"
        />
        
        <el-descriptions :column="1" border>
          <el-descriptions-item label="机器人ID">{{ currentCancelRobot?.id }}</el-descriptions-item>
          <el-descriptions-item label="机器人名称">{{ currentCancelRobot?.robot_name }}</el-descriptions-item>
          <el-descriptions-item label="钱包地址">
            <span class="wallet-address">{{ shortenAddress(currentCancelRobot?.wallet_address) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="购买价格">{{ formatAmount(currentCancelRobot?.price) }} USDT</el-descriptions-item>
          <el-descriptions-item label="累计收益">{{ formatAmount(currentCancelRobot?.total_profit) }} USDT</el-descriptions-item>
        </el-descriptions>
        
        <el-form style="margin-top: 20px" label-width="100px">
          <el-form-item label="是否退款">
            <el-switch
              v-model="cancelForm.refund"
              active-text="退还本金"
              inactive-text="不退款"
            />
          </el-form-item>
          <el-form-item label="退款金额" v-if="cancelForm.refund">
            <span class="amount positive">{{ getRefundAmount() }} USDT</span>
            <el-tag type="info" size="small" style="margin-left: 10px">
              {{ currentCancelRobot?.robot_type === 'high' || currentCancelRobot?.robot_type === 'dex' ? '预期收益' : '购买价格' }}
            </el-tag>
          </el-form-item>
          <el-form-item label="关闭原因">
            <el-input
              v-model="cancelForm.reason"
              type="textarea"
              :rows="2"
              placeholder="请输入关闭原因（可选）"
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="cancelDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="confirmCancelRobot" :loading="cancelLoading">
          确认关闭
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 批量关闭确认对话框 -->
    <el-dialog
      v-model="batchCancelDialogVisible"
      title="批量关闭机器人"
      width="500px"
      :close-on-click-modal="false"
      append-to-body
    >
      <div class="cancel-dialog-content">
        <el-alert
          title="即将关闭选中的所有机器人"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 20px"
        />
        
        <p>已选择 <strong>{{ selectedRobots.length }}</strong> 个机器人</p>
        
        <el-form style="margin-top: 20px" label-width="100px">
          <el-form-item label="是否退款">
            <el-switch
              v-model="batchCancelForm.refund"
              active-text="退还本金"
              inactive-text="不退款"
            />
          </el-form-item>
          <el-form-item label="关闭原因">
            <el-input
              v-model="batchCancelForm.reason"
              type="textarea"
              :rows="2"
              placeholder="请输入关闭原因（可选）"
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="batchCancelDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="confirmBatchCancel" :loading="batchCancelLoading">
          确认批量关闭
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
/**
 * 运行中机器人页面
 * 专门显示状态为 active 的机器人
 */
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Monitor, Coin, Plus, TrendCharts } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { getRobotPurchases, getRobotStats, getRobotDetail, getUserRobots, cancelRobotById, batchCancelRobots } from '@/api'
import { useIsMobile } from '@/composables/useIsMobile'

// 加载状态
const loading = ref(false)
const { isMobile } = useIsMobile()

// 统计数据
const stats = reactive({
  activeCount: 0,
  totalInvestment: '0.00',
  totalProfit: '0.00',
  todayCount: 0
})

// 机器人列表
const robotList = ref([])

// 搜索表单
const searchForm = reactive({
  wallet_address: '',
  robot_type: '',
  quantify_status: ''
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

// 关闭机器人对话框
const cancelDialogVisible = ref(false)
const cancelLoading = ref(false)
const currentCancelRobot = ref(null)
const cancelForm = reactive({
  refund: true,
  reason: ''
})

// 批量关闭
const batchCancelDialogVisible = ref(false)
const batchCancelLoading = ref(false)
const selectedRobots = ref([])
const batchCancelForm = reactive({
  refund: true,
  reason: ''
})

/**
 * 获取统计数据
 */
const fetchStats = async () => {
  try {
    const res = await getRobotStats()
    if (res.success && res.data) {
      stats.activeCount = res.data.activeCount || 0
      stats.totalInvestment = res.data.totalInvestment || '0.00'
      stats.todayCount = res.data.todayCount || 0
      
      // 计算运行中机器人的总收益
      const activeRobots = await getRobotPurchases({
        status: 'active',
        page: 1,
        pageSize: 999999 // 获取所有记录来计算总收益
      })
      
      if (activeRobots.success && activeRobots.data.list) {
        const totalProfit = activeRobots.data.list.reduce((sum, robot) => {
          return sum + parseFloat(robot.total_profit || 0)
        }, 0)
        stats.totalProfit = totalProfit.toFixed(2)
      }
    }
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

/**
 * 获取运行中机器人记录
 */
const fetchRobots = async () => {
  loading.value = true
  try {
    const res = await getRobotPurchases({
      page: pagination.page,
      pageSize: pagination.pageSize,
      wallet_address: searchForm.wallet_address || undefined,
      robot_type: searchForm.robot_type || undefined,
      status: 'active' // 固定为 active
    })
    
    if (res.success) {
      // 如果有量化状态筛选，在前端过滤
      let filteredList = res.data.list || []
      if (searchForm.quantify_status !== '') {
        filteredList = filteredList.filter(robot => {
          return robot.is_quantified === searchForm.quantify_status
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
  searchForm.quantify_status = ''
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
 * 格式化日期时间（北京时间，精确到秒）
 */
const formatDateTime = (datetime) => {
  if (!datetime) return '-'
  return dayjs(datetime).format('YYYY-MM-DD HH:mm:ss')
}

/**
 * 检查是否即将到期（24小时内）
 */
const isExpiringSoon = (row) => {
  return getRemainingHours(row) < 24 && getRemainingHours(row) > 0
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
  
  // 回退到使用 start/end 计算
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
 * 获取剩余小时数
 */
const getRemainingHours = (row) => {
  if (row.hours_remaining !== undefined && row.hours_remaining !== null) {
    return parseFloat(row.hours_remaining)
  }
  
  const endTime = row.end_time || row.end_date
  if (!endTime) return 0
  
  const diffMs = dayjs(endTime).diff(dayjs())
  return diffMs / (1000 * 60 * 60)
}

/**
 * 格式化剩余时间
 */
const formatRemainingTime = (row) => {
  const hours = getRemainingHours(row)
  
  if (hours <= 0) return '已到期'
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remainingHours = Math.floor(hours % 24)
    if (remainingHours > 0) {
      return `${days}天${remainingHours}h`
    }
    return `${days}天`
  }
  
  const h = Math.floor(hours)
  const m = Math.floor((hours % 1) * 60)
  return `${h}h ${m}m`
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

/**
 * 显示关闭机器人对话框
 */
const showCancelDialog = (row) => {
  currentCancelRobot.value = row
  cancelForm.refund = true
  cancelForm.reason = ''
  cancelDialogVisible.value = true
}

/**
 * 获取退款金额
 */
const getRefundAmount = () => {
  if (!currentCancelRobot.value) return '0.00'
  // high 和 dex 类型退还预期收益，其他类型退还购买价格
  const type = currentCancelRobot.value.robot_type
  if (type === 'high' || type === 'dex') {
    return formatAmount(currentCancelRobot.value.expected_return)
  }
  return formatAmount(currentCancelRobot.value.price)
}

/**
 * 确认关闭机器人
 */
const confirmCancelRobot = async () => {
  if (!currentCancelRobot.value) return
  
  try {
    cancelLoading.value = true
    
    const res = await cancelRobotById(currentCancelRobot.value.id, {
      refund: cancelForm.refund,
      reason: cancelForm.reason || '管理员手动关闭'
    })
    
    if (res.success) {
      ElMessage.success('机器人已关闭')
      cancelDialogVisible.value = false
      fetchRobots()
      fetchStats()
    } else {
      ElMessage.error(res.message || '关闭失败')
    }
  } catch (error) {
    console.error('关闭机器人失败:', error)
    ElMessage.error('关闭失败，请重试')
  } finally {
    cancelLoading.value = false
  }
}

/**
 * 确认批量关闭
 */
const confirmBatchCancel = async () => {
  if (!selectedRobots.value.length) return
  
  try {
    batchCancelLoading.value = true
    
    const ids = selectedRobots.value.map(r => r.id)
    const res = await batchCancelRobots({
      ids,
      refund: batchCancelForm.refund,
      reason: batchCancelForm.reason || '管理员批量关闭'
    })
    
    if (res.success) {
      ElMessage.success(`成功关闭 ${res.data.success} 个机器人`)
      batchCancelDialogVisible.value = false
      selectedRobots.value = []
      fetchRobots()
      fetchStats()
    } else {
      ElMessage.error(res.message || '批量关闭失败')
    }
  } catch (error) {
    console.error('批量关闭失败:', error)
    ElMessage.error('批量关闭失败，请重试')
  } finally {
    batchCancelLoading.value = false
  }
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
  
  &.warning-date {
    color: #E6A23C;
    font-weight: 500;
  }
}

.duration {
  font-weight: 500;
  color: var(--admin-text-secondary);
}

.remaining {
  font-weight: 600;
  color: #67C23A;
  
  &.warning {
    color: #E6A23C;
  }
  
  &.danger {
    color: #F56C6C;
  }
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

