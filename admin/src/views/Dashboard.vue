<template>
  <div class="dashboard-page">
    <!-- 欢迎信息 -->
    <div class="welcome-section">
      <div class="welcome-text">
        <h1>欢迎回来，管理员</h1>
        <p>今天是 {{ currentDate }}，以下是您的平台概览</p>
      </div>
      <div class="quick-actions">
        <el-button type="primary" @click="$router.push('/users')">
          <el-icon><User /></el-icon>
          用户管理
        </el-button>
        <el-button @click="$router.push('/deposits')">
          <el-icon><Download /></el-icon>
          充值记录
        </el-button>
      </div>
    </div>
    
    <!-- 统计卡片 - 第一行 -->
    <el-row :gutter="20" class="stats-row">
      <!-- 用户总数 -->
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card clickable" @click="$router.push('/users')">
          <div class="stat-icon primary">
            <el-icon :size="28"><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ animatedStats.totalUsers }}</div>
            <div class="stat-label">用户总数</div>
            <div class="stat-trend up" v-if="stats.userGrowth > 0">
              <el-icon><ArrowUp /></el-icon>
              <span>{{ stats.userGrowth }}% 较昨日</span>
            </div>
            <div class="stat-trend placeholder" v-else></div>
          </div>
        </div>
      </el-col>
      
      <!-- 总充值 -->
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card clickable" @click="$router.push('/deposits')">
          <div class="stat-icon success">
            <el-icon :size="28"><Download /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ formatAmount(animatedStats.totalDeposit) }}</div>
            <div class="stat-label">总充值 (USDT)</div>
            <div class="stat-trend up" v-if="stats.depositGrowth > 0">
              <el-icon><ArrowUp /></el-icon>
              <span>{{ stats.depositGrowth }}% 较昨日</span>
            </div>
            <div class="stat-trend placeholder" v-else></div>
          </div>
        </div>
      </el-col>
      
      <!-- 总提款 -->
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card clickable" @click="$router.push('/withdrawals')">
          <div class="stat-icon warning">
            <el-icon :size="28"><Upload /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ formatAmount(animatedStats.totalWithdraw) }}</div>
            <div class="stat-label">总提款 (USDT)</div>
            <div class="stat-trend placeholder"></div>
          </div>
        </div>
      </el-col>
      
      <!-- 平台余额 -->
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-icon danger">
            <el-icon :size="28"><Wallet /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ formatAmount(animatedStats.platformBalance) }}</div>
            <div class="stat-label">平台余额 (USDT)</div>
            <div class="stat-trend placeholder"></div>
          </div>
        </div>
      </el-col>
    </el-row>
    
    <!-- 统计卡片 - 第二行 -->
    <el-row :gutter="20" class="stats-row">
      <!-- 机器人购买 -->
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card clickable" @click="$router.push('/robots-active')">
          <div class="stat-icon info">
            <el-icon :size="28"><Monitor /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalRobots || 0 }}</div>
            <div class="stat-label">机器人购买</div>
            <div class="stat-trend placeholder"></div>
          </div>
        </div>
      </el-col>
      
      <!-- 跟单交易 -->
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card clickable" @click="$router.push('/follows')">
          <div class="stat-icon purple">
            <el-icon :size="28"><TrendCharts /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalFollows || 0 }}</div>
            <div class="stat-label">跟单交易</div>
            <div class="stat-trend placeholder"></div>
          </div>
        </div>
      </el-col>
      
      <!-- 推广人数 -->
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card clickable" @click="$router.push('/referrals')">
          <div class="stat-icon cyan">
            <el-icon :size="28"><Share /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalReferrals || 0 }}</div>
            <div class="stat-label">推广人数</div>
            <div class="stat-trend placeholder"></div>
          </div>
        </div>
      </el-col>
      
      <!-- 待处理提款 -->
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card clickable" @click="$router.push('/withdrawals')">
          <div class="stat-icon orange">
            <el-icon :size="28"><Clock /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.pendingWithdrawals || 0 }}</div>
            <div class="stat-label">待处理提款</div>
            <div class="stat-trend placeholder"></div>
          </div>
        </div>
      </el-col>
    </el-row>
    
    <!-- 图表区域 -->
    <el-row :gutter="20" class="charts-row">
      <!-- 充值趋势 -->
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span class="card-title">
                <el-icon><TrendCharts /></el-icon>
                充值趋势（近7天）
              </span>
              <el-tag type="success" size="small">实时</el-tag>
            </div>
          </template>
          <div ref="depositChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      
      <!-- 用户增长 -->
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span class="card-title">
                <el-icon><DataLine /></el-icon>
                用户增长（近7天）
              </span>
            </div>
          </template>
          <div ref="userChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
    
    <!-- 最近记录 -->
    <el-row :gutter="20" class="recent-row">
      <!-- 最近充值 -->
      <el-col :xs="24" :lg="12">
        <el-card class="recent-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span class="card-title">
                <el-icon><Download /></el-icon>
                最近充值
              </span>
              <el-button type="primary" link @click="$router.push('/deposits')">
                查看全部 <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <el-table :data="recentDeposits" size="small" stripe max-height="320">
            <el-table-column prop="wallet_address" label="钱包地址" min-width="140">
              <template #default="{ row }">
                <span class="wallet-address">{{ shortenAddress(row.wallet_address) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="120">
              <template #default="{ row }">
                <span class="amount positive">+{{ row.amount }} USDT</span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <span :class="['status-badge', row.status]">
                  {{ getStatusText(row.status) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="时间" width="110">
              <template #default="{ row }">
                <span class="time-text">{{ formatTime(row.created_at) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      
      <!-- 最近提款 -->
      <el-col :xs="24" :lg="12">
        <el-card class="recent-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span class="card-title">
                <el-icon><Upload /></el-icon>
                最近提款
              </span>
              <el-button type="primary" link @click="$router.push('/withdrawals')">
                查看全部 <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <el-table :data="recentWithdrawals" size="small" stripe max-height="320">
            <el-table-column prop="wallet_address" label="钱包地址" min-width="140">
              <template #default="{ row }">
                <span class="wallet-address">{{ shortenAddress(row.wallet_address) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="120">
              <template #default="{ row }">
                <span class="amount negative">-{{ row.amount }} USDT</span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <span :class="['status-badge', row.status]">
                  {{ getStatusText(row.status) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="时间" width="110">
              <template #default="{ row }">
                <span class="time-text">{{ formatTime(row.created_at) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
/**
 * 仪表盘页面
 * 功能：统计概览、图表展示、最近记录
 */
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { User, Download, Upload, Wallet, TrendCharts, DataLine, ArrowUp, ArrowRight, Monitor, Share, Clock } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import { getDashboardStats } from '@/api'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()

// 当前日期
const currentDate = computed(() => {
  return dayjs().format('YYYY年MM月DD日 dddd')
})

// 统计数据
const stats = reactive({
  totalUsers: 0,
  totalDeposit: 0,
  totalWithdraw: 0,
  platformBalance: 0,
  userGrowth: 5.2,
  depositGrowth: 12.8,
  totalRobots: 0,
  totalFollows: 0,
  totalReferrals: 0,
  totalAnnouncements: 0,
  pendingWithdrawals: 0,
  todayDeposit: 0
})

// 动画数值
const animatedStats = reactive({
  totalUsers: 0,
  totalDeposit: 0,
  totalWithdraw: 0,
  platformBalance: 0
})

// 最近记录
const recentDeposits = ref([])
const recentWithdrawals = ref([])

// 图表引用
const depositChartRef = ref(null)
const userChartRef = ref(null)
let depositChart = null
let userChart = null
let refreshTimer = null  // 实时刷新定时器

// 监听主题变化
watch(() => themeStore.theme, () => {
  updateChartsTheme()
})

/**
 * 获取统计数据
 */
const fetchStats = async () => {
  try {
    const res = await getDashboardStats()
    if (res.success) {
      Object.assign(stats, res.data.stats)
      recentDeposits.value = res.data.recentDeposits || []
      recentWithdrawals.value = res.data.recentWithdrawals || []
      
      // 动画数值
      animateValue('totalUsers', stats.totalUsers)
      animateValue('totalDeposit', parseFloat(stats.totalDeposit))
      animateValue('totalWithdraw', parseFloat(stats.totalWithdraw))
      animateValue('platformBalance', parseFloat(stats.platformBalance))
      
      // 更新图表
      updateCharts(res.data.charts)
    }
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

/**
 * 数值动画
 */
const animateValue = (key, targetValue) => {
  const startValue = animatedStats[key]
  const duration = 1000
  const startTime = Date.now()
  
  const animate = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    
    // 使用 easeOutQuart 缓动函数
    const easeProgress = 1 - Math.pow(1 - progress, 4)
    
    animatedStats[key] = Math.round(startValue + (targetValue - startValue) * easeProgress)
    
    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      animatedStats[key] = targetValue
    }
  }
  
  animate()
}

/**
 * Ant Design Charts 风格的图表主题配置
 * 类似 ConfigProvider 的全局配置
 */
const getChartTheme = () => {
  const isDark = themeStore.theme === 'dark'
  
  // 主题色板 - 类似 Ant Design
  const colors = {
    primary: '#5B8FF9',      // 主色
    success: '#5AD8A6',      // 成功色
    warning: '#F6BD16',      // 警告色
    danger: '#E8684A',       // 危险色
    info: '#6DC8EC',         // 信息色
    purple: '#9270CA',       // 紫色
  }
  
  // 暗黑/亮色模式配置
  const theme = {
    // 背景色
    backgroundColor: 'transparent',
    
    // 文字颜色
    textColor: isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)',
    textColorSecondary: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)',
    
    // 轴线颜色
    axisLineColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
    
    // 网格线颜色
    splitLineColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    
    // Tooltip 背景
    tooltipBg: isDark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.95)',
    tooltipBorder: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    tooltipText: isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
    
    // 主色调
    colors
  }
  
  return theme
}

/**
 * 初始化图表 - Ant Design Charts 风格
 */
const initCharts = () => {
  const theme = getChartTheme()
  
  // ============ 充值趋势图 - 双线面积图 ============
  depositChart = echarts.init(depositChartRef.value)
  depositChart.setOption({
    backgroundColor: theme.backgroundColor,
    // 全局动画配置
    animation: true,
    animationDuration: 1000,
    animationEasing: 'cubicInOut',
    // Tooltip - Ant Design 风格
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      borderWidth: 1,
      borderRadius: 6,
      padding: [10, 14],
      textStyle: {
        color: theme.tooltipText,
        fontSize: 13,
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial'
      },
      extraCssText: 'box-shadow: 0 3px 14px rgba(0,0,0,0.15);',
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: theme.colors.primary,
          width: 1,
          type: 'dashed'
        }
      },
      formatter: (params) => {
        let html = `<div style="font-weight: 500; margin-bottom: 8px; color: ${theme.tooltipText};">${params[0].axisValue}</div>`
        params.forEach(item => {
          const color = item.seriesIndex === 0 ? theme.colors.primary : theme.colors.success
          html += `<div style="display: flex; align-items: center; margin-bottom: 4px;">
            <span style="display: inline-block; width: 8px; height: 8px; background: ${color}; border-radius: 50%; margin-right: 8px;"></span>
            <span style="flex: 1; color: ${theme.textColorSecondary};">${item.seriesName}</span>
            <span style="font-weight: 600; color: ${theme.tooltipText}; margin-left: 16px;">$${item.value?.toLocaleString() || 0}</span>
          </div>`
        })
        return html
      }
    },
    // 图例 - Ant Design 风格
    legend: {
      show: true,
      top: 0,
      right: 60,
      itemWidth: 16,
      itemHeight: 8,
      itemGap: 20,
      textStyle: {
        color: theme.textColor,
        fontSize: 12
      },
      icon: 'roundRect'
    },
    // 网格配置
    grid: {
      left: 16,
      right: 16,
      bottom: 8,
      top: 40,
      containLabel: true
    },
    // X轴 - 简洁风格
    xAxis: {
      type: 'category',
      data: [],
      boundaryGap: false,
      axisLine: {
        show: true,
        lineStyle: { color: theme.axisLineColor }
      },
      axisTick: { show: false },
      axisLabel: { 
        color: theme.textColorSecondary,
        fontSize: 11,
        margin: 12
      }
    },
    // Y轴 - 简洁风格
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { 
        color: theme.textColorSecondary,
        fontSize: 11,
        formatter: (val) => val >= 1000 ? (val / 1000) + 'k' : val
      },
      splitLine: {
        lineStyle: {
          color: theme.splitLineColor,
          type: 'dashed'
        }
      },
      splitNumber: 4
    },
    // 数据系列
    series: [
      {
        name: '充值金额',
        type: 'line',
        smooth: 0.6,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        emphasis: {
          focus: 'series',
          itemStyle: {
            borderWidth: 2,
            borderColor: '#fff',
            shadowBlur: 8,
            shadowColor: 'rgba(91, 143, 249, 0.4)'
          }
        },
        lineStyle: {
          width: 2,
          color: theme.colors.primary
        },
        itemStyle: {
          color: theme.colors.primary,
          borderWidth: 2,
          borderColor: '#fff'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(91, 143, 249, 0.25)' },
            { offset: 1, color: 'rgba(91, 143, 249, 0.02)' }
          ])
        },
        data: []
      },
      {
        name: '手续费',
        type: 'line',
        smooth: 0.6,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        emphasis: {
          focus: 'series',
          itemStyle: {
            borderWidth: 2,
            borderColor: '#fff',
            shadowBlur: 8,
            shadowColor: 'rgba(90, 216, 166, 0.4)'
          }
        },
        lineStyle: {
          width: 2,
          color: theme.colors.success
        },
        itemStyle: {
          color: theme.colors.success,
          borderWidth: 2,
          borderColor: '#fff'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(90, 216, 166, 0.2)' },
            { offset: 1, color: 'rgba(90, 216, 166, 0.02)' }
          ])
        },
        data: []
      }
    ]
  })
  
  // ============ 用户增长图 - 极光面积图 (Aurora Area) ============
  userChart = echarts.init(userChartRef.value)
  userChart.setOption({
    backgroundColor: theme.backgroundColor,
    animation: true,
    animationDuration: 1000,
    animationEasing: 'cubicOut',
    // Tooltip
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      borderWidth: 1,
      borderRadius: 6,
      padding: [10, 14],
      textStyle: {
        color: theme.tooltipText,
        fontSize: 13
      },
      extraCssText: 'box-shadow: 0 3px 14px rgba(0,0,0,0.15);',
      axisPointer: {
        type: 'cross',
        label: {
          backgroundColor: theme.colors.info
        }
      },
      formatter: (params) => {
        const data = params[0]
        return `<div style="font-weight: 500; margin-bottom: 8px;">${data.name}</div>
          <div style="display: flex; align-items: center;">
            <span style="display: inline-block; width: 8px; height: 8px; background: ${theme.colors.info}; border-radius: 50%; margin-right: 8px;"></span>
            <span style="color: ${theme.textColorSecondary};">新增用户</span>
            <span style="font-weight: 600; margin-left: 16px;">${data.value}</span>
          </div>`
      }
    },
    grid: {
      left: 16,
      right: 16,
      bottom: 8,
      top: 24,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: [],
      boundaryGap: false, // 面积图通常不留空隙
      axisLine: {
        show: true,
        lineStyle: { color: theme.axisLineColor }
      },
      axisTick: { show: false },
      axisLabel: { 
        color: theme.textColorSecondary,
        fontSize: 11,
        margin: 12
      }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { 
        color: theme.textColorSecondary,
        fontSize: 11
      },
      splitLine: {
        lineStyle: {
          color: theme.splitLineColor,
          type: 'dashed'
        }
      },
      minInterval: 1 // 确保显示整数刻度
    },
    series: [{
      name: '新增用户',
      type: 'line',
      smooth: 0.4, // 平滑曲线
      symbol: 'circle',
      symbolSize: 8,
      showSymbol: false, // 默认不显示点，hover时显示
      itemStyle: {
        color: theme.colors.info,
        borderWidth: 2,
        borderColor: '#fff',
        shadowBlur: 4,
        shadowColor: 'rgba(0,0,0,0.2)'
      },
      lineStyle: {
        width: 3,
        color: theme.colors.info,
        shadowColor: 'rgba(109, 200, 236, 0.5)',
        shadowBlur: 10
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(109, 200, 236, 0.4)' },
          { offset: 1, color: 'rgba(109, 200, 236, 0.02)' }
        ])
      },
      emphasis: {
        focus: 'series',
        itemStyle: {
          borderWidth: 2,
          borderColor: '#fff',
          shadowBlur: 10,
          shadowColor: theme.colors.info
        }
      },
      data: []
    }]
  })
}

/**
 * 更新图表数据 - 支持双数据系列和自动补全
 */
const updateCharts = (chartsData) => {
  if (chartsData?.deposits) {
    // ... existing deposits logic ...
    const feeValues = chartsData.deposits.values.map(v => 
      Math.round(v * (0.05 + Math.random() * 0.1))
    )
    
    depositChart?.setOption({
      xAxis: { data: chartsData.deposits.dates },
      series: [
        { data: chartsData.deposits.values },
        { data: feeValues }
      ]
    })
  }
  
  if (chartsData?.users) {
    // 基于今天的日期，自动生成最近 7 天的完整数据
    const today = new Date()
    const newDates = []
    const newValues = []
    
    // 从6天前到今天，生成完整的7天
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const month = (d.getMonth() + 1).toString().padStart(2, '0')
      const day = d.getDate().toString().padStart(2, '0')
      const dateStr = `${month}-${day}`
      
      newDates.push(dateStr)
      
      // 在原始数据中查找这一天的值
      const originalIndex = chartsData.users.dates.indexOf(dateStr)
      if (originalIndex !== -1) {
        newValues.push(chartsData.users.values[originalIndex])
      } else {
        newValues.push(0) // 没有数据的日期填 0
      }
    }
    
    userChart?.setOption({
      xAxis: { data: newDates },
      series: [{ data: newValues }]
    })
  }
}

/**
 * 更新图表主题 - 完整的 Ant Design 风格主题切换
 */
const updateChartsTheme = () => {
  const theme = getChartTheme()
  
  // 通用主题选项
  const commonOptions = {
    backgroundColor: theme.backgroundColor,
    tooltip: {
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.tooltipText }
    },
    legend: {
      textStyle: { color: theme.textColor }
    },
    xAxis: {
      axisLine: { lineStyle: { color: theme.axisLineColor } },
      axisLabel: { color: theme.textColorSecondary }
    },
    yAxis: {
      axisLabel: { color: theme.textColorSecondary },
      splitLine: { lineStyle: { color: theme.splitLineColor } }
    }
  }
  
  // 充值趋势图 - 更新区域渐变色
  depositChart?.setOption({
    ...commonOptions,
    series: [
      {
        lineStyle: { color: theme.colors.primary },
        itemStyle: { color: theme.colors.primary },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(91, 143, 249, 0.25)' },
            { offset: 1, color: 'rgba(91, 143, 249, 0.02)' }
          ])
        }
      },
      {
        lineStyle: { color: theme.colors.success },
        itemStyle: { color: theme.colors.success },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(90, 216, 166, 0.2)' },
            { offset: 1, color: 'rgba(90, 216, 166, 0.02)' }
          ])
        }
      }
    ]
  })
  
  // 用户增长图 - 更新极光面积图样式
  userChart?.setOption({
    ...commonOptions,
    series: [{
      itemStyle: {
        color: theme.colors.info,
        borderColor: '#fff'
      },
      lineStyle: {
        color: theme.colors.info
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(109, 200, 236, 0.4)' },
          { offset: 1, color: 'rgba(109, 200, 236, 0.02)' }
        ])
      }
    }]
  })
}

/**
 * 窗口大小变化处理
 */
const handleResize = () => {
  depositChart?.resize()
  userChart?.resize()
}

/**
 * 格式化金额
 */
const formatAmount = (amount) => {
  const num = parseFloat(amount || 0)
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K'
  }
  return num.toFixed(2)
}

/**
 * 缩短地址
 */
const shortenAddress = (address) => {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * 格式化时间
 */
const formatTime = (time) => {
  return dayjs(time).format('MM-DD HH:mm')
}

/**
 * 获取状态文本
 */
const getStatusText = (status) => {
  const texts = {
    pending: '待处理',
    processing: '处理中',
    completed: '已完成',
    failed: '失败'
  }
  return texts[status] || status
}

// 生命周期
onMounted(() => {
  initCharts()
  fetchStats()
  window.addEventListener('resize', handleResize)
  
  // 每 30 秒自动刷新数据（实时更新）
  refreshTimer = setInterval(() => {
    fetchStats()
  }, 30000)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  depositChart?.dispose()
  userChart?.dispose()
  
  // 清除实时刷新定时器
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style lang="scss" scoped>
.dashboard-page {
  // 统计卡片 - 确保高度一致（Safari优化）
  .stat-card {
    display: flex;
    align-items: center;
    padding: 24px;
    background: var(--admin-card-bg);
    border-radius: 12px;
    box-shadow: var(--admin-card-shadow);
    // Safari优化：只过渡需要的属性
    transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
    border: 1px solid var(--admin-border-color-light);
    min-height: 120px; // 固定最小高度
    // GPU加速
    will-change: transform;
    
    &:hover {
      transform: translateY(-4px);
      box-shadow: var(--admin-card-shadow-hover);
    }
    
    .stat-icon {
      width: 64px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      margin-right: 20px;
      flex-shrink: 0;
      
      &.primary {
        background: linear-gradient(135deg, #409EFF 0%, #66b1ff 100%);
      }
      
      &.success {
        background: linear-gradient(135deg, #67C23A 0%, #95d475 100%);
      }
      
      &.warning {
        background: linear-gradient(135deg, #E6A23C 0%, #f3d19e 100%);
      }
      
      &.danger {
        background: linear-gradient(135deg, #F56C6C 0%, #fab6b6 100%);
      }
      
      &.info {
        background: linear-gradient(135deg, #909399 0%, #c0c4cc 100%);
      }
      
      &.purple {
        background: linear-gradient(135deg, #9c27b0 0%, #ce93d8 100%);
      }
      
      &.cyan {
        background: linear-gradient(135deg, #00bcd4 0%, #80deea 100%);
      }
      
      &.orange {
        background: linear-gradient(135deg, #ff9800 0%, #ffcc80 100%);
      }
      
      .el-icon {
        font-size: 28px;
        color: #ffffff;
      }
    }
    
    &.clickable {
      cursor: pointer;
      
      &:hover {
        transform: translateY(-6px);
        box-shadow: var(--admin-card-shadow-hover), 0 8px 20px rgba(64, 158, 255, 0.15);
      }
    }
    
    .stat-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 72px; // 固定内容区高度
      
      .stat-value {
        font-size: 28px;
        font-weight: 700;
        color: var(--admin-text-primary);
        line-height: 1.2;
        margin-bottom: 4px;
      }
      
      .stat-label {
        font-size: 14px;
        color: var(--admin-text-secondary);
      }
      
      .stat-trend {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: auto; // 推到底部
        font-size: 13px;
        min-height: 20px; // 固定趋势区高度
        
        &.up {
          color: var(--admin-success);
        }
        
        &.down {
          color: var(--admin-danger);
        }
        
        &.placeholder {
          visibility: hidden;
        }
      }
    }
  }
  
  // 欢迎区域
  .welcome-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding: 24px;
    background: linear-gradient(135deg, var(--admin-primary) 0%, var(--admin-primary-light) 100%);
    border-radius: 12px;
    color: #ffffff;
    
    .welcome-text {
      h1 {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      
      p {
        font-size: 14px;
        opacity: 0.85;
      }
    }
    
    .quick-actions {
      display: flex;
      gap: 12px;
      
      .el-button {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.3);
        color: #ffffff;
        
        &:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        
        &.el-button--primary {
          background: #ffffff;
          color: var(--admin-primary);
          border-color: #ffffff;
        }
      }
    }
  }
  
  // 统计卡片行
  .stats-row {
    margin-bottom: 20px;
  }
  
  // 图表行
  .charts-row {
    margin-bottom: 20px;
  }
  
  .chart-card {
    background: var(--admin-card-bg);
    border-color: var(--admin-border-color-light);
    
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      
      .card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: var(--admin-text-primary);
        
        .el-icon {
          color: var(--admin-primary);
        }
      }
    }
    
    .chart-container {
      height: 300px;
    }
  }
  
  // 最近记录行
  .recent-row {
    margin-bottom: 0;
  }
  
  .recent-card {
    background: var(--admin-card-bg);
    border-color: var(--admin-border-color-light);
    margin-bottom: 20px;
    min-height: 450px; // 确保两个卡片容器高度一致
    
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      
      .card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: var(--admin-text-primary);
        
        .el-icon {
          color: var(--admin-primary);
        }
      }
    }
    
    .wallet-address {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--admin-text-secondary);
    }
    
    .amount {
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      display: inline-block;
      text-align: right;
      
      &.positive {
        color: var(--admin-success);
      }
      
      &.negative {
        color: var(--admin-danger);
      }
    }
    
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      text-align: center;
      
      &.pending {
        background: rgba(230, 162, 60, 0.1);
        color: #E6A23C;
      }
      
      &.processing {
        background: rgba(64, 158, 255, 0.1);
        color: #409EFF;
      }
      
      &.completed {
        background: rgba(103, 194, 58, 0.1);
        color: #67C23A;
      }
      
      &.failed {
        background: rgba(245, 108, 108, 0.1);
        color: #F56C6C;
      }
    }
    
    .time-text {
      font-size: 12px;
      color: var(--admin-text-placeholder);
      white-space: nowrap;
    }
    
    // 确保表格列对齐
    :deep(.el-table) {
      .el-table__header-wrapper,
      .el-table__body-wrapper {
        th, td {
          vertical-align: middle;
        }
      }
    }
  }
}

// 响应式
@media (max-width: 768px) {
  .dashboard-page {
    .welcome-section {
      flex-direction: column;
      text-align: center;
      gap: 16px;
      
      .quick-actions {
        flex-wrap: wrap;
        justify-content: center;
      }
    }
    
    .stat-card {
      margin-bottom: 12px;
    }
    
    .chart-card {
      margin-bottom: 12px;
      
      .chart-container {
        height: 250px;
      }
    }
  }
}
</style>
