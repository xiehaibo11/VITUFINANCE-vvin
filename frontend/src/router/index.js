import { createRouter, createWebHistory } from 'vue-router'
import { trackPageView, trackReferralVisit } from '@/utils/tracker'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue'),
    meta: { title: 'VituFinance - AI Cryptocurrency Trading Platform | Automated Trading Robots' }
  },
  {
    path: '/index',
    name: 'Index',
    component: () => import('../views/Index.vue'),
    meta: { title: 'Market Prices - VituFinance | Crypto Market Data & Trends' }
  },
  {
    path: '/one',
    name: 'OnePage',
    component: () => import('../views/OnePage.vue'),
    meta: { title: 'Platform Overview - VituFinance | AI Crypto Trading' }
  },
  {
    path: '/two',
    name: 'TwoPage',
    component: () => import('../views/TwoPage.vue'),
    meta: { title: 'About the Platform - VituFinance | Crypto Trading Platform' }
  },
  {
    path: '/four',
    name: 'FourPage',
    component: () => import('../views/FourPage.vue'),
    meta: { title: 'Services - VituFinance | Trading Robots, Staking, Copy Trading' }
  },
  {
    path: '/five',
    name: 'FivePage',
    component: () => import('../views/FivePage.vue'),
    meta: { title: 'Trading Center - VituFinance | AI-Powered Crypto Trading' }
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('../views/About.vue'),
    meta: { title: 'About Us - VituFinance | AI Cryptocurrency Trading Platform' }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { title: 'Dashboard - VituFinance', requiresAuth: true }
  },
  {
    path: '/announcement',
    name: 'Announcement',
    component: () => import('../views/Announcement.vue'),
    meta: { title: 'Announcements - VituFinance | News & Updates' }
  },
  {
    path: '/pledge',
    name: 'Pledge',
    component: () => import('../views/Pledge.vue'),
    meta: { title: 'Staking - VituFinance | Crypto Staking & Rewards' }
  },
  {
    path: '/robot',
    name: 'Robot',
    component: () => import('../views/Robot.vue'),
    meta: { title: 'AI Trading Robots - VituFinance | Automated Crypto Trading Bots' }
  },
  {
    path: '/robot/caption',
    name: 'RobotCaption',
    component: () => import('../views/RobotCaption.vue'),
    meta: { title: 'Robot Strategy - VituFinance | AI Robot Explanation' }
  },
  {
    path: '/invite',
    name: 'Invite',
    component: () => import('../views/Invite.vue'),
    meta: { title: 'Referral Program - VituFinance | Invite & Earn Rewards' }
  },
  {
    path: '/invite/level-introduction',
    name: 'LevelIntroduction',
    component: () => import('../views/LevelIntroduction.vue'),
    meta: { title: 'Referral Levels - VituFinance | Level Introduction' }
  },
  {
    path: '/invite/community-members',
    name: 'CommunityMembers',
    component: () => import('../views/CommunityMembers.vue'),
    meta: { title: 'Community Members - VituFinance' }
  },
  {
    path: '/follow',
    name: 'Follow',
    component: () => import('../views/Follow.vue'),
    meta: { title: 'Copy Trading - VituFinance | Follow Top Traders' }
  },
  {
    path: '/wallet',
    name: 'Wallet',
    component: () => import('../views/Assets.vue'),
    meta: { title: 'Wallet - VituFinance' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/NotFound.vue'),
    meta: { title: '404 - 页面未找到' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 全局前置守卫
router.beforeEach((to, from, next) => {
  // 设置页面标题
  document.title = to.meta.title || 'Vitu Finance'

  // 检查是否需要认证
  if (to.meta.requiresAuth) {
    // 这里可以检查用户登录状态
    // const isAuthenticated = checkAuth()
    // if (!isAuthenticated) {
    //   next({ name: 'Home' })
    //   return
    // }
  }

  next()
})

// 全局后置守卫 - 记录页面访问
router.afterEach((to) => {
  // 记录页面访问
  trackPageView(to.name || to.path)
  
  // 检查是否有推荐码参数
  const refCode = to.query.ref
  if (refCode) {
    trackReferralVisit(refCode)
  }
})

export default router
