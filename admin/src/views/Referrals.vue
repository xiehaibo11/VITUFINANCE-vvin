<template>
  <div class="page-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>推广管理</h2>
      <p class="description">查看用户推荐关系和推广转化数据</p>
    </div>
    
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon primary">
            <el-icon><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ referralStats.totalReferrers }}</div>
            <div class="stat-label">推荐人总数</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon success">
            <el-icon><View /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ referralStats.totalReferred }}</div>
            <div class="stat-label">被推荐人总数</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon warning">
            <el-icon><Share /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ formatAmount(referralStats.totalRewards) }} USDT</div>
            <div class="stat-label">累计推荐奖励</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon info">
            <el-icon><UserFilled /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ referralStats.todayNew }}</div>
            <div class="stat-label">今日新增推荐</div>
          </div>
        </div>
      </el-col>
    </el-row>
    
    <!-- 标签页 -->
    <el-tabs v-model="activeTab" @tab-change="handleTabChange" class="referral-tabs">
      <el-tab-pane label="推荐关系" name="referrals">
        <template #label>
          <span>
            <el-icon><Connection /></el-icon>
            推荐关系
          </span>
        </template>
      </el-tab-pane>
      <el-tab-pane label="转化统计" name="conversions">
        <template #label>
          <span>
            <el-icon><TrendCharts /></el-icon>
            转化统计
          </span>
        </template>
      </el-tab-pane>
      <el-tab-pane label="行为记录" name="behaviors">
        <template #label>
          <span>
            <el-icon><Pointer /></el-icon>
            行为记录
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>
    
    <!-- 推荐关系列表 -->
    <template v-if="activeTab === 'referrals'">
    <!-- 搜索区域 -->
    <div class="search-area">
      <el-form :inline="true" :model="searchForm" @submit.prevent="handleSearch">
        <el-form-item label="钱包地址">
          <el-input
            v-model="searchForm.wallet_address"
            placeholder="请输入用户钱包地址"
            clearable
            style="width: 280px"
          />
        </el-form-item>
        <el-form-item label="推荐人地址">
          <el-input
            v-model="searchForm.referrer_address"
            placeholder="请输入推荐人地址"
            clearable
            style="width: 280px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button type="success" @click="handleSearchHierarchy">
            <el-icon><Connection /></el-icon>
            查询上下级
          </el-button>
          <el-button type="warning" @click="showBindDialog = true">
            <el-icon><Link /></el-icon>
            手动绑定
          </el-button>
          <el-button @click="handleReset">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </div>
    
    <!-- 手动绑定推荐关系弹窗 -->
    <el-dialog v-model="showBindDialog" title="手动绑定推荐关系" width="600px" @close="resetBindForm">
      <el-form :model="bindForm" label-width="100px">
        <el-form-item label="用户地址" required>
          <div style="display: flex; gap: 10px; width: 100%">
            <el-input 
              v-model="bindForm.wallet_address" 
              placeholder="请输入要绑定的用户钱包地址"
              style="flex: 1"
            />
            <el-button type="info" @click="previewRetroactive" :loading="previewLoading">
              预览
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="推荐人地址" required>
          <el-input 
            v-model="bindForm.referrer_address" 
            placeholder="请输入推荐人钱包地址"
          />
        </el-form-item>
        
        <!-- 用户信息预览 -->
        <el-form-item label="用户信息" v-if="previewData">
          <div class="preview-info">
            <div class="preview-item">
              <span class="label">机器人数量：</span>
              <span class="value">{{ previewData.robot_count }} 个</span>
            </div>
            <div class="preview-item">
              <span class="label">总投资：</span>
              <span class="value">{{ previewData.total_investment }} USDT</span>
            </div>
            <div class="preview-item">
              <span class="label">量化次数：</span>
              <span class="value">{{ previewData.quantify_count }} 次</span>
            </div>
            <div class="preview-item">
              <span class="label">累计收益：</span>
              <span class="value highlight">{{ previewData.total_earnings }} USDT</span>
            </div>
            <div class="preview-item">
              <span class="label">可补发奖励：</span>
              <span class="value highlight-success">{{ previewData.retroactive_reward }} USDT ({{ previewData.reward_rate }})</span>
            </div>
          </div>
        </el-form-item>
        
        <!-- 补发奖励选项 -->
        <el-form-item label="补发奖励">
          <el-switch
            v-model="bindForm.retroactive_reward"
            active-text="补发历史奖励"
            inactive-text="不补发"
            :disabled="!previewData || parseFloat(previewData.retroactive_reward) <= 0"
          />
          <div class="reward-tip" v-if="bindForm.retroactive_reward && previewData">
            将为推荐人补发 <span class="amount">{{ previewData.retroactive_reward }} USDT</span> 奖励
          </div>
        </el-form-item>
        
        <el-alert 
          type="warning" 
          :closable="false"
          style="margin-top: 10px"
        >
          <template #title>
            注意：绑定操作不可撤销，补发的奖励将直接添加到推荐人余额
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="showBindDialog = false">取消</el-button>
        <el-button type="primary" @click="handleBindReferral" :loading="bindLoading">
          确认绑定
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 上下级关系详情区域 -->
    <div v-if="showHierarchy && hierarchyData" class="hierarchy-section">
      <div class="hierarchy-header">
        <div class="header-left">
          <div class="header-icon">
            <el-icon><Connection /></el-icon>
          </div>
          <div class="header-text">
            <h3>用户上下级关系详情</h3>
            <p>查看用户的推荐关系网络</p>
          </div>
        </div>
        <el-button type="danger" plain size="small" @click="closeHierarchy">
          <el-icon><Close /></el-icon>
          关闭
        </el-button>
      </div>
      
      <!-- 目标用户信息 -->
      <div class="hierarchy-card target-card">
        <div class="card-header">
          <div class="card-icon target">
            <el-icon><User /></el-icon>
          </div>
          <div class="card-label">查询用户</div>
        </div>
        <div class="card-body">
          <!-- 钱包地址 -->
          <div class="wallet-display">
            <span class="wallet-label">钱包地址：</span>
            <code class="wallet-value" @click="copyText(hierarchyData.target.wallet_address)">
              {{ hierarchyData.target.wallet_address }}
              <el-icon class="copy-icon"><CopyDocument /></el-icon>
            </code>
          </div>
          <!-- 统计数据表格布局 -->
          <div class="data-table">
            <div class="data-row">
              <div class="data-cell">
                <div class="cell-label">邀请码</div>
                <div class="cell-value">
                  <el-tag type="primary" effect="dark">{{ hierarchyData.target.referral_code }}</el-tag>
                </div>
              </div>
              <div class="data-cell">
                <div class="cell-label">直推人数</div>
                <div class="cell-value highlight">{{ hierarchyData.target.direct_count }}</div>
              </div>
              <div class="data-cell">
                <div class="cell-label">累计奖励</div>
                <div class="cell-value success">{{ hierarchyData.target.total_reward }} USDT</div>
              </div>
              <div class="data-cell">
                <div class="cell-label">机器人数</div>
                <div class="cell-value">{{ hierarchyData.target.robot_count }}</div>
              </div>
              <div class="data-cell">
                <div class="cell-label">总投资</div>
                <div class="cell-value warning">{{ hierarchyData.target.total_investment }} USDT</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 推荐人（上级） -->
      <div class="hierarchy-card referrer-card" v-if="hierarchyData.referrer">
        <div class="card-header">
          <div class="card-icon referrer">
            <el-icon><Top /></el-icon>
          </div>
          <div class="card-label">推荐人（上级）</div>
        </div>
        <div class="card-body">
          <div class="data-table">
            <div class="data-row">
              <div class="data-cell wide">
                <div class="cell-label">钱包地址</div>
                <div class="cell-value">
                  <code class="wallet-code" @click="copyText(hierarchyData.referrer.wallet_address)">
                    {{ shortenAddress(hierarchyData.referrer.wallet_address) }}
                    <el-icon class="copy-icon"><CopyDocument /></el-icon>
                  </code>
                </div>
              </div>
              <div class="data-cell">
                <div class="cell-label">邀请码</div>
                <div class="cell-value">
                  <el-tag type="success" effect="plain">{{ hierarchyData.referrer.referral_code }}</el-tag>
                </div>
              </div>
              <div class="data-cell">
                <div class="cell-label">直推人数</div>
                <div class="cell-value highlight">{{ hierarchyData.referrer.direct_count }}</div>
              </div>
              <div class="data-cell">
                <div class="cell-label">累计奖励</div>
                <div class="cell-value success">{{ hierarchyData.referrer.total_reward }} USDT</div>
              </div>
              <div class="data-cell">
                <div class="cell-label">绑定时间</div>
                <div class="cell-value">{{ formatTime(hierarchyData.referrer.bindTime) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="hierarchy-card referrer-card empty" v-else>
        <div class="card-header">
          <div class="card-icon referrer empty">
            <el-icon><Top /></el-icon>
          </div>
          <div class="card-label">推荐人（上级）</div>
        </div>
        <div class="card-body">
          <div class="empty-state">
            <el-icon class="empty-icon"><UserFilled /></el-icon>
            <span>该用户无推荐人（顶级用户）</span>
          </div>
        </div>
      </div>
      
      <!-- 直推成员（下级）列表 -->
      <div class="hierarchy-card members-card">
        <div class="card-header">
          <div class="card-icon members">
            <el-icon><Bottom /></el-icon>
          </div>
          <div class="card-label">直推成员（下级） - 共 <strong>{{ hierarchyData.direct_members.length }}</strong> 人</div>
        </div>
        <div class="card-body" v-if="hierarchyData.direct_members.length > 0">
          <el-table
          :data="hierarchyData.direct_members"
          stripe
          border
          size="small"
          style="width: 100%"
        >
          <el-table-column type="index" label="序号" width="60" align="center" />
          <el-table-column prop="wallet_address" label="钱包地址" min-width="180">
            <template #default="{ row }">
              <span class="wallet-address" @click="copyText(row.wallet_address)">
                {{ shortenAddress(row.wallet_address) }}
                <el-icon><CopyDocument /></el-icon>
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="referral_code" label="邀请码" width="100" align="center">
            <template #default="{ row }">
              <el-tag size="small">{{ row.referral_code }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="sub_count" label="下级数" width="80" align="center">
            <template #default="{ row }">
              <span class="count">{{ row.sub_count || 0 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="robot_count" label="机器人" width="80" align="center">
            <template #default="{ row }">
              <span :class="{ 'count': row.robot_count > 0 }">{{ row.robot_count || 0 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="total_investment" label="总投资" width="120" align="right">
            <template #default="{ row }">
              <span :class="{ 'amount positive': parseFloat(row.total_investment) > 0 }">
                {{ formatAmount(row.total_investment) }} USDT
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="bindTime" label="绑定时间" width="160">
            <template #default="{ row }">
              {{ formatTime(row.bindTime) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" align="center">
            <template #default="{ row }">
              <el-button type="primary" size="small" link @click="searchSubHierarchy(row.wallet_address)">
                查看下级
              </el-button>
            </template>
          </el-table-column>
          </el-table>
        </div>
        <div v-else class="card-body">
          <div class="empty-state">
            <el-icon class="empty-icon"><UserFilled /></el-icon>
            <span>暂无直推成员</span>
          </div>
        </div>
      </div>
    </div>
    
      <!-- 推荐关系表格 -->
    <el-table
      v-show="!showHierarchy"
      v-loading="loading"
      :data="referralList"
      stripe
      border
      style="width: 100%"
    >
      <el-table-column type="index" label="序号" width="60" align="center" />
      
      <el-table-column prop="wallet_address" label="用户钱包地址" min-width="200">
        <template #default="{ row }">
          <el-tooltip :content="row.wallet_address" placement="top">
            <span class="wallet-address" @click="copyText(row.wallet_address)">
              {{ shortenAddress(row.wallet_address) }}
              <el-icon><CopyDocument /></el-icon>
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      
      <el-table-column prop="referrer_address" label="推荐人地址" min-width="200">
        <template #default="{ row }">
          <template v-if="row.referrer_address">
            <el-tooltip :content="row.referrer_address" placement="top">
              <span class="wallet-address" @click="copyText(row.referrer_address)">
                {{ shortenAddress(row.referrer_address) }}
                <el-icon><CopyDocument /></el-icon>
              </span>
            </el-tooltip>
          </template>
          <span v-else class="no-data">无推荐人</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="referral_code" label="邀请码" width="120" align="center">
        <template #default="{ row }">
          <el-tag size="small">{{ row.referral_code || '-' }}</el-tag>
        </template>
      </el-table-column>
      
      <el-table-column prop="referral_count" label="邀请人数" width="100" align="center">
        <template #default="{ row }">
          <span class="count" :class="{ 'clickable': row.referral_count > 0 }" @click="row.referral_count > 0 && viewMemberHierarchy(row.wallet_address)">
            {{ row.referral_count || 0 }}
          </span>
        </template>
      </el-table-column>
      
      <el-table-column prop="total_reward" label="累计奖励" width="130" align="right">
        <template #default="{ row }">
          <span class="amount positive">{{ formatAmount(row.total_reward) }} USDT</span>
        </template>
      </el-table-column>
      
      <el-table-column prop="level" label="等级" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="getLevelColor(row.level)" size="small">
            Lv.{{ row.level || 1 }}
          </el-tag>
        </template>
      </el-table-column>
      
      <el-table-column prop="created_at" label="绑定时间" width="170">
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      
      <el-table-column label="操作" width="100" align="center" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" size="small" link @click="viewMemberHierarchy(row.wallet_address)">
            查看关系
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    </template>
    
    <!-- 转化统计列表 -->
    <template v-if="activeTab === 'conversions'">
      <el-table
        v-loading="loading"
        :data="conversionList"
        stripe
        border
        style="width: 100%"
      >
        <el-table-column type="index" label="序号" width="60" align="center" />
        
        <el-table-column prop="referral_code" label="推荐码" width="100" align="center">
          <template #default="{ row }">
            <el-tag type="primary" size="small">{{ row.referral_code }}</el-tag>
          </template>
        </el-table-column>
        
        <el-table-column prop="referrer_address" label="推荐人地址" min-width="180">
          <template #default="{ row }">
            <template v-if="row.referrer_address">
              <span class="wallet-address" @click="copyText(row.referrer_address)">
                {{ shortenAddress(row.referrer_address) }}
              </span>
            </template>
            <span v-else class="no-data">-</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="registered_users" label="注册人数" width="100" align="center">
          <template #default="{ row }">
            <span class="count">{{ row.registered_users || 0 }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="deposited_users" label="充值人数" width="100" align="center">
          <template #default="{ row }">
            <span class="count">{{ row.deposited_users || 0 }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="deposit_rate" label="充值率" width="90" align="center">
          <template #default="{ row }">
            <span class="rate" :class="{ positive: parseFloat(row.deposit_rate) > 0 }">{{ row.deposit_rate }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="purchased_users" label="购买人数" width="100" align="center">
          <template #default="{ row }">
            <span class="count success">{{ row.purchased_users || 0 }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="purchase_rate" label="购买率" width="90" align="center">
          <template #default="{ row }">
            <span class="rate" :class="{ positive: parseFloat(row.purchase_rate) > 0 }">{{ row.purchase_rate }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="total_deposits" label="充值总额" width="130" align="right">
          <template #default="{ row }">
            <span class="amount">{{ row.total_deposits }} USDT</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="total_investment" label="投资总额" width="130" align="right">
          <template #default="{ row }">
            <span class="amount positive">{{ row.total_investment }} USDT</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="total_rewards_earned" label="获得奖励" width="130" align="right">
          <template #default="{ row }">
            <span class="amount highlight">{{ row.total_rewards_earned }} USDT</span>
          </template>
        </el-table-column>
      </el-table>
    </template>
    
    <!-- 行为记录列表 -->
    <template v-if="activeTab === 'behaviors'">
      <div class="search-area">
        <el-form :inline="true" :model="behaviorSearchForm" @submit.prevent="fetchBehaviors">
          <el-form-item label="钱包地址">
            <el-input
              v-model="behaviorSearchForm.wallet_address"
              placeholder="请输入钱包地址"
              clearable
              style="width: 200px"
            />
          </el-form-item>
          <el-form-item label="推荐码">
            <el-input
              v-model="behaviorSearchForm.referral_code"
              placeholder="请输入推荐码"
              clearable
              style="width: 140px"
            />
          </el-form-item>
          <el-form-item label="行为类型">
            <el-select v-model="behaviorSearchForm.action_type" placeholder="全部" clearable style="width: 140px">
              <el-option label="页面访问" value="page_view" />
              <el-option label="按钮点击" value="button_click" />
              <el-option label="连接钱包" value="wallet_connect" />
              <el-option label="充值" value="deposit" />
              <el-option label="提款" value="withdraw" />
              <el-option label="购买机器人" value="robot_buy" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="fetchBehaviors">
              <el-icon><Search /></el-icon>
              搜索
            </el-button>
          </el-form-item>
        </el-form>
      </div>
      
      <el-table
        v-loading="loading"
        :data="behaviorList"
        stripe
        border
        style="width: 100%"
      >
        <el-table-column type="index" label="序号" width="60" align="center" />
        
        <el-table-column prop="wallet_address" label="钱包地址" width="180">
          <template #default="{ row }">
            <span v-if="row.wallet_address" class="wallet-address">
              {{ shortenAddress(row.wallet_address) }}
            </span>
            <span v-else class="no-data">未连接</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="referral_code" label="来源推荐码" width="120" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.referral_code" type="success" size="small">
              {{ row.referral_code }}
            </el-tag>
            <span v-else class="no-data">直接访问</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="action_type" label="行为类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getActionTypeColor(row.action_type)" size="small">
              {{ getActionTypeText(row.action_type) }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column prop="page_url" label="页面" min-width="200">
          <template #default="{ row }">
            <el-tooltip v-if="row.page_url" :content="row.page_url" placement="top">
              <span class="page-url">{{ shortenUrl(row.page_url) }}</span>
            </el-tooltip>
            <span v-else class="no-data">-</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="ip_address" label="IP地址" width="140">
          <template #default="{ row }">
            <span class="ip-address">{{ row.ip_address || '-' }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="created_at" label="时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>
    </template>
    
    <!-- 分页（仅在推荐关系列表视图显示，上下级详情视图时隐藏） -->
    <div class="pagination-wrapper" v-show="!showHierarchy">
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
  </div>
</template>

<script setup>
/**
 * 推广管理页面
 */
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, CopyDocument, User, View, Share, UserFilled, Connection, TrendCharts, Pointer, Top, Bottom, Close, Link } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { getReferrals } from '@/api'
import request from '@/api'

// 加载状态
const loading = ref(false)

// 当前标签页
const activeTab = ref('referrals')

// 行为统计数据（保留用于行为记录标签页）
const behaviorStats = reactive({
  totalVisits: 0,
  todayVisits: 0,
  referralVisits: 0,
  uniqueVisitors: 0
})

// 推荐统计数据
const referralStats = reactive({
  totalReferrers: 0,
  totalReferred: 0,
  totalRewards: 0,
  todayNew: 0
})

// 推荐列表
const referralList = ref([])

// 转化统计列表
const conversionList = ref([])

// 行为记录列表
const behaviorList = ref([])

// 推荐搜索表单
const searchForm = reactive({
  wallet_address: '',
  referrer_address: ''
})

// 行为搜索表单
const behaviorSearchForm = reactive({
  wallet_address: '',
  referral_code: '',
  action_type: ''
})

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

// 上下级关系详情
const showHierarchy = ref(false)
const hierarchyData = ref(null)

// 手动绑定推荐关系
const showBindDialog = ref(false)
const bindLoading = ref(false)
const previewLoading = ref(false)
const previewData = ref(null)
const bindForm = reactive({
  wallet_address: '',
  referrer_address: '',
  retroactive_reward: false
})

/**
 * 获取行为统计
 */
const fetchBehaviorStats = async () => {
  try {
    const res = await request.get('/user-behaviors/stats')
    if (res.success && res.data) {
      Object.assign(behaviorStats, res.data)
    }
  } catch (error) {
    console.error('获取行为统计失败:', error)
  }
}

/**
 * 获取推荐统计
 */
const fetchReferralStats = async () => {
  try {
    const res = await request.get('/referrals/stats')
    if (res.success && res.data) {
      Object.assign(referralStats, res.data)
    }
  } catch (error) {
    console.error('获取推荐统计失败:', error)
  }
}

/**
 * 获取推荐关系列表
 */
const fetchReferrals = async () => {
  loading.value = true
  try {
    const res = await getReferrals({
      page: pagination.page,
      pageSize: pagination.pageSize,
      wallet_address: searchForm.wallet_address || undefined,
      referrer_address: searchForm.referrer_address || undefined
    })
    
    if (res.success) {
      referralList.value = res.data.list || []
      pagination.total = res.data.total || 0
    }
  } catch (error) {
    console.error('获取推荐关系失败:', error)
  } finally {
    loading.value = false
  }
}

/**
 * 获取转化统计
 */
const fetchConversions = async () => {
  loading.value = true
  try {
    const res = await request.get('/referral-conversions', {
      params: {
        page: pagination.page,
        pageSize: pagination.pageSize
      }
    })
    
    if (res.success) {
      conversionList.value = res.data.list || []
      pagination.total = res.data.total || 0
    }
  } catch (error) {
    console.error('获取转化统计失败:', error)
  } finally {
    loading.value = false
  }
}

/**
 * 获取行为记录
 */
const fetchBehaviors = async () => {
  loading.value = true
  try {
    const res = await request.get('/user-behaviors', {
      params: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        wallet_address: behaviorSearchForm.wallet_address || undefined,
        referral_code: behaviorSearchForm.referral_code || undefined,
        action_type: behaviorSearchForm.action_type || undefined
      }
    })
    
    if (res.success) {
      behaviorList.value = res.data.list || []
      pagination.total = res.data.total || 0
    }
  } catch (error) {
    console.error('获取行为记录失败:', error)
  } finally {
    loading.value = false
  }
}

/**
 * 标签切换
 */
const handleTabChange = () => {
  pagination.page = 1
  if (activeTab.value === 'referrals') {
    fetchReferrals()
  } else if (activeTab.value === 'conversions') {
    fetchConversions()
  } else if (activeTab.value === 'behaviors') {
    fetchBehaviors()
  }
}

/**
 * 搜索
 */
const handleSearch = () => {
  pagination.page = 1
  showHierarchy.value = false
  fetchReferrals()
}

/**
 * 重置
 */
const handleReset = () => {
  searchForm.wallet_address = ''
  searchForm.referrer_address = ''
  pagination.page = 1
  showHierarchy.value = false
  hierarchyData.value = null
  fetchReferrals()
}

/**
 * 查询上下级关系
 */
const handleSearchHierarchy = async () => {
  if (!searchForm.wallet_address) {
    ElMessage.warning('请先输入钱包地址')
    return
  }
  
  loading.value = true
  try {
    const res = await request.get('/referrals/hierarchy', {
      params: {
        wallet_address: searchForm.wallet_address.trim()
      }
    })
    
    if (res.success) {
      hierarchyData.value = res.data
      showHierarchy.value = true
    } else {
      ElMessage.error(res.message || '查询失败')
    }
  } catch (error) {
    console.error('查询上下级关系失败:', error)
    ElMessage.error('查询失败，请检查地址是否正确')
  } finally {
    loading.value = false
  }
}

/**
 * 关闭上下级详情
 */
const closeHierarchy = () => {
  showHierarchy.value = false
  hierarchyData.value = null
}

/**
 * 查看某个成员的上下级
 */
const viewMemberHierarchy = async (walletAddress) => {
  searchForm.wallet_address = walletAddress
  await handleSearchHierarchy()
}

/**
 * 查看下级的上下级关系
 */
const searchSubHierarchy = async (walletAddress) => {
  searchForm.wallet_address = walletAddress
  await handleSearchHierarchy()
}

/**
 * 预览补发奖励金额
 */
const previewRetroactive = async () => {
  if (!bindForm.wallet_address) {
    return
  }
  
  previewLoading.value = true
  previewData.value = null
  
  try {
    const res = await request.get('/referrals/preview-retroactive', {
      params: { wallet_address: bindForm.wallet_address.trim() }
    })
    
    if (res.success) {
      previewData.value = res.data
      // 如果有可补发奖励，默认勾选
      if (parseFloat(res.data.retroactive_reward) > 0) {
        bindForm.retroactive_reward = true
      }
    } else {
      ElMessage.error(res.message || '预览失败')
    }
  } catch (error) {
    console.error('预览失败:', error)
    ElMessage.error('预览失败')
  } finally {
    previewLoading.value = false
  }
}

/**
 * 重置绑定表单
 */
const resetBindForm = () => {
  bindForm.wallet_address = ''
  bindForm.referrer_address = ''
  bindForm.retroactive_reward = false
  previewData.value = null
}

/**
 * 手动绑定推荐关系
 */
const handleBindReferral = async () => {
  if (!bindForm.wallet_address || !bindForm.referrer_address) {
    ElMessage.warning('请填写完整的地址信息')
    return
  }
  
  bindLoading.value = true
  try {
    const res = await request.post('/referrals/bind', {
      wallet_address: bindForm.wallet_address.trim(),
      referrer_address: bindForm.referrer_address.trim(),
      retroactive_reward: bindForm.retroactive_reward
    })
    
    if (res.success) {
      ElMessage.success(res.message || '绑定成功！')
      showBindDialog.value = false
      resetBindForm()
      // 刷新列表
      fetchReferrals()
    } else {
      ElMessage.error(res.message || '绑定失败')
    }
  } catch (error) {
    console.error('绑定推荐关系失败:', error)
    ElMessage.error(error.response?.data?.message || '绑定失败')
  } finally {
    bindLoading.value = false
  }
}

/**
 * 分页大小变化
 */
const handleSizeChange = () => {
  pagination.page = 1
  handleTabChange()
}

/**
 * 页码变化
 */
const handlePageChange = () => {
  handleTabChange()
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
 * 缩短URL
 */
const shortenUrl = (url) => {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    return parsed.pathname + (parsed.search ? '...' : '')
  } catch {
    return url.length > 40 ? url.slice(0, 40) + '...' : url
  }
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

/**
 * 获取等级颜色
 */
const getLevelColor = (level) => {
  const colors = {
    1: 'info',
    2: 'primary',
    3: 'success',
    4: 'warning',
    5: 'danger'
  }
  return colors[level] || 'info'
}

/**
 * 获取行为类型颜色
 */
const getActionTypeColor = (type) => {
  const colors = {
    page_view: 'info',
    button_click: 'primary',
    wallet_connect: 'success',
    deposit: 'success',
    withdraw: 'warning',
    robot_buy: 'danger'
  }
  return colors[type] || 'info'
}

/**
 * 获取行为类型文本
 */
const getActionTypeText = (type) => {
  const texts = {
    page_view: '页面访问',
    button_click: '按钮点击',
    wallet_connect: '连接钱包',
    deposit: '充值',
    withdraw: '提款',
    robot_buy: '购买机器人'
  }
  return texts[type] || type
}

// 初始化
onMounted(() => {
  fetchReferralStats()
  fetchBehaviorStats()
  fetchReferrals()
})
</script>

<style lang="scss" scoped>
.stats-row {
  margin-bottom: 20px;
}

.referral-tabs {
  margin-bottom: 20px;
  
  :deep(.el-tabs__item) {
    font-size: 14px;
    
    .el-icon {
      margin-right: 4px;
    }
  }
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.wallet-address {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: var(--admin-text-regular, #606266);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  
  &:hover {
    color: var(--admin-primary, #409EFF);
  }
}

.amount {
  font-weight: 600;
  color: var(--admin-text-primary);
  
  &.positive {
    color: var(--admin-success, #67C23A);
  }
  
  &.highlight {
    color: var(--admin-warning, #E6A23C);
  }
}

.count {
  font-weight: 600;
  color: var(--admin-primary, #409EFF);
  
  &.success {
    color: var(--admin-success, #67C23A);
  }
}

.rate {
  font-weight: 600;
  color: var(--admin-warning, #E6A23C);
  
  &.positive {
    color: var(--admin-success, #67C23A);
  }
}

.no-data {
  color: var(--admin-text-secondary, #909399);
}

.page-url {
  font-size: 12px;
  color: var(--admin-text-regular, #606266);
}

.ip-address {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: var(--admin-text-secondary, #909399);
}

/* 上下级关系详情区域样式 - 美化版 */
.hierarchy-section {
  margin-bottom: 24px;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.03) 0%, rgba(103, 194, 58, 0.03) 100%);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid rgba(64, 158, 255, 0.1);
}

.hierarchy-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  
  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  
  .header-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, #409EFF 0%, #66b1ff 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
    
    .el-icon {
      font-size: 24px;
      color: #fff;
    }
  }
  
  .header-text {
    h3 {
      margin: 0 0 4px 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--admin-text-primary);
    }
    
    p {
      margin: 0;
      font-size: 13px;
      color: var(--admin-text-secondary);
    }
  }
}

/* 通用卡片样式 */
.hierarchy-card {
  background: var(--admin-card-bg);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s, box-shadow 0.2s;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  }
  
  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--admin-border-color-light);
    background: rgba(0, 0, 0, 0.02);
  }
  
  .card-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    
    .el-icon {
      font-size: 18px;
      color: #fff;
    }
    
    &.target {
      background: linear-gradient(135deg, #409EFF 0%, #79bbff 100%);
    }
    
    &.referrer {
      background: linear-gradient(135deg, #67C23A 0%, #95d475 100%);
      
      &.empty {
        background: linear-gradient(135deg, #909399 0%, #c0c4cc 100%);
      }
    }
    
    &.members {
      background: linear-gradient(135deg, #E6A23C 0%, #f3d19e 100%);
    }
  }
  
  .card-label {
    font-size: 15px;
    font-weight: 600;
    color: var(--admin-text-primary);
    
    strong {
      color: #409EFF;
    }
  }
  
  .card-body {
    padding: 20px;
  }
}

/* 数据表格布局 - 整齐的行列展示 */
.data-table {
  width: 100%;
  
  .data-row {
    display: flex;
    flex-wrap: wrap;
    border: 1px solid var(--admin-border-color-light);
    border-radius: 8px;
    overflow: hidden;
    background: var(--admin-bg-secondary);
  }
  
  .data-cell {
    flex: 1;
    min-width: 140px;
    padding: 16px 20px;
    border-right: 1px solid var(--admin-border-color-light);
    display: flex;
    flex-direction: column;
    gap: 8px;
    
    &:last-child {
      border-right: none;
    }
    
    &.wide {
      min-width: 200px;
      flex: 1.5;
    }
    
    .cell-label {
      font-size: 12px;
      color: var(--admin-text-secondary);
      font-weight: 500;
    }
    
    .cell-value {
      font-size: 15px;
      font-weight: 600;
      color: var(--admin-text-primary);
      display: flex;
      align-items: center;
      gap: 6px;
      
      &.highlight {
        color: #409EFF;
        font-size: 18px;
      }
      
      &.success {
        color: #67C23A;
      }
      
      &.warning {
        color: #E6A23C;
      }
      
      .wallet-code {
        font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        color: var(--admin-text-primary);
        background: rgba(64, 158, 255, 0.1);
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s;
        
        &:hover {
          color: #409EFF;
          background: rgba(64, 158, 255, 0.15);
        }
        
        .copy-icon {
          font-size: 12px;
          opacity: 0.6;
        }
      }
    }
  }
}

/* 目标用户卡片 */
.target-card {
  border-top: 3px solid #409EFF;
  
  .wallet-display {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: linear-gradient(135deg, rgba(64, 158, 255, 0.08) 0%, rgba(64, 158, 255, 0.04) 100%);
    border-radius: 8px;
    margin-bottom: 16px;
    border: 1px solid rgba(64, 158, 255, 0.15);
    
    .wallet-label {
      font-size: 13px;
      color: var(--admin-text-secondary);
      white-space: nowrap;
      font-weight: 500;
    }
    
    .wallet-value {
      font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
      font-size: 13px;
      color: var(--admin-text-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      word-break: break-all;
      background: transparent;
      padding: 0;
      transition: color 0.2s;
      
      &:hover {
        color: #409EFF;
      }
      
      .copy-icon {
        flex-shrink: 0;
        font-size: 14px;
        opacity: 0.6;
      }
    }
  }
}

/* 推荐人卡片 */
.referrer-card {
  border-top: 3px solid #67C23A;
  
  &.empty {
    border-top-color: #909399;
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    color: var(--admin-text-secondary);
    gap: 12px;
    
    .empty-icon {
      font-size: 40px;
      opacity: 0.3;
    }
    
    span {
      font-size: 14px;
    }
  }
}

/* 直推成员卡片 */
.members-card {
  border-top: 3px solid #E6A23C;
  
  .card-body {
    padding: 16px;
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: var(--admin-text-secondary);
    gap: 12px;
    
    .empty-icon {
      font-size: 48px;
      opacity: 0.3;
    }
    
    span {
      font-size: 14px;
    }
  }
}

/* 保留旧的样式兼容 */
.empty-text {
  text-align: center;
  color: var(--admin-text-secondary);
  padding: 20px;
  font-size: 14px;
}

// 补发奖励预览样式
.preview-info {
  background: var(--admin-bg-secondary);
  border-radius: 8px;
  padding: 16px;
  width: 100%;
  
  .preview-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px dashed var(--admin-border-color);
    
    &:last-child {
      border-bottom: none;
    }
    
    .label {
      color: var(--admin-text-secondary);
      font-size: 13px;
    }
    
    .value {
      color: var(--admin-text-primary);
      font-size: 14px;
      font-weight: 500;
      
      &.highlight {
        color: #409EFF;
      }
      
      &.highlight-success {
        color: #67C23A;
        font-weight: 600;
      }
    }
  }
}

.reward-tip {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(103, 194, 58, 0.1);
  border-radius: 4px;
  font-size: 13px;
  color: #67C23A;
  
  .amount {
    font-weight: 600;
    font-size: 15px;
  }
}

.clickable {
  cursor: pointer;
  
  &:hover {
    color: #409EFF;
    text-decoration: underline;
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
</style>
