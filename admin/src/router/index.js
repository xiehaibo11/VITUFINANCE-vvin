/**
 * 管理系统路由配置
 */
import { createRouter, createWebHistory } from 'vue-router'

// 路由配置
const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录' }
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('@/views/Layout.vue'),
    redirect: '/dashboard',
    children: [
      // 仪表盘
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '仪表盘', icon: 'Odometer' }
      },
      // 用户管理
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/Users.vue'),
        meta: { title: '用户管理', icon: 'User' }
      },
      // 充值记录
      {
        path: 'deposits',
        name: 'Deposits',
        component: () => import('@/views/Deposits.vue'),
        meta: { title: '充值记录', icon: 'Download' }
      },
      // 提款记录
      {
        path: 'withdrawals',
        name: 'Withdrawals',
        component: () => import('@/views/Withdrawals.vue'),
        meta: { title: '提款记录', icon: 'Upload' }
      },
      // 交易记录
      {
        path: 'transactions',
        name: 'Transactions',
        component: () => import('@/views/Transactions.vue'),
        meta: { title: '交易记录', icon: 'List' }
      },
      // 运行中机器人
      {
        path: 'robots-active',
        name: 'RobotsActive',
        component: () => import('@/views/RobotsActive.vue'),
        meta: { title: '运行中机器人', icon: 'VideoPlay' }
      },
      // 过期机器人
      {
        path: 'robots-expired',
        name: 'RobotsExpired',
        component: () => import('@/views/RobotsExpired.vue'),
        meta: { title: '过期机器人', icon: 'Timer' }
      },
      // 量化日志
      {
        path: 'quantify-logs',
        name: 'QuantifyLogs',
        component: () => import('@/views/QuantifyLogs.vue'),
        meta: { title: '量化日志', icon: 'DocumentCopy' }
      },
      // 质押管理
      {
        path: 'pledges',
        name: 'Pledges',
        component: () => import('@/views/Pledges.vue'),
        meta: { title: '质押管理', icon: 'Coin' }
      },
      // 跟单管理
      {
        path: 'follows',
        name: 'Follows',
        component: () => import('@/views/Follows.vue'),
        meta: { title: '跟单管理', icon: 'TrendCharts' }
      },
      // 推广管理
      {
        path: 'referrals',
        name: 'Referrals',
        component: () => import('@/views/Referrals.vue'),
        meta: { title: '推广管理', icon: 'Share' }
      },
      // 推荐数据管理
      {
        path: 'invite-stats',
        name: 'InviteStats',
        component: () => import('@/views/InviteStats.vue'),
        meta: { title: '推荐数据', icon: 'DataLine' }
      },
      // 团队分红
      {
        path: 'team-dividend',
        name: 'TeamDividend',
        component: () => import('@/views/TeamDividend.vue'),
        meta: { title: '团队分红', icon: 'Coin' }
      },
      // 抽奖管理
      {
        path: 'lucky-wheel',
        name: 'LuckyWheel',
        component: () => import('@/views/LuckyWheel.vue'),
        meta: { title: '抽奖管理', icon: 'Present' }
      },
      // 公告管理
      {
        path: 'announcements',
        name: 'Announcements',
        component: () => import('@/views/Announcements.vue'),
        meta: { title: '公告管理', icon: 'Bell' }
      },
      // 资质文件
      {
        path: 'documents',
        name: 'Documents',
        component: () => import('@/views/Documents.vue'),
        meta: { title: '资质文件', icon: 'Document' }
      },
      // 数据清理
      {
        path: 'data-cleanup',
        name: 'DataCleanup',
        component: () => import('@/views/DataCleanup.vue'),
        meta: { title: '数据清理', icon: 'Delete' }
      },
      // 系统设置
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/Settings.vue'),
        meta: { title: '系统设置', icon: 'Setting' }
      },
      // 系统日志
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('@/views/Logs.vue'),
        meta: { title: '系统日志', icon: 'Document' }
      },
      // 错误日志
      {
        path: 'error-logs',
        name: 'ErrorLogs',
        component: () => import('@/views/ErrorLogs.vue'),
        meta: { title: '错误日志', icon: 'Warning' }
      },
      // IP封禁管理
      {
        path: 'ip-blacklist',
        name: 'IPBlacklist',
        component: () => import('@/views/IPBlacklist.vue'),
        meta: { title: 'IP封禁管理', icon: 'Lock' }
      },
      // 维护公告管理
      {
        path: 'maintenance',
        name: 'Maintenance',
        component: () => import('@/views/Maintenance.vue'),
        meta: { title: '维护公告', icon: 'Warning' }
      },
      // 虚假账户检测
      {
        path: 'fake-accounts',
        name: 'FakeAccounts',
        component: () => import('@/views/FakeAccounts.vue'),
        meta: { title: '虚假账户', icon: 'UserFilled' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes
})

// 路由守卫 - 检查登录状态
router.beforeEach((to, from, next) => {
  // 设置页面标题
  document.title = to.meta.title ? `${to.meta.title} - VituFinance 管理系统` : 'VituFinance 管理系统'
  
  // 检查是否登录
  const token = localStorage.getItem('admin_token')
  
  if (to.path !== '/login' && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
