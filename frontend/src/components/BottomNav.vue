<template>
  <!-- Use Teleport to mount directly to body, avoiding parent CSS issues on iOS Safari -->
  <Teleport to="body" :disabled="inPopup">
  <nav
    class="bottom-nav"
    :class="{ 'in-popup': inPopup }"
    :style="bottomNavInlineStyle"
  >
    <router-link 
      v-for="item in navItems" 
      :key="item.path" 
      :to="item.path" 
      class="nav-item"
      :class="{ active: isActive(item.path) }"
      @click="handleNavClick(item.path, $event)"
    >
      <div class="nav-icon">
        <img :src="isActive(item.path) ? item.activeIcon : item.icon" :alt="item.label" />
      </div>
      <div class="nav-label">
          <!-- Active state shows dot -->
        <span v-if="isActive(item.path)" class="active-dot">·</span>
          <!-- Inactive state shows text -->
        <span v-else class="label-text">{{ t(item.label) }}</span>
      </div>
    </router-link>
  </nav>
  </Teleport>
</template>

<script setup>
/**
 * Bottom navigation (fixed).
 *
 * iOS Safari / some wallet WebViews have a known issue:
 * when the browser UI (address bar / bottom toolbar) expands/collapses,
 * `position: fixed; bottom: ...` is calculated against the *layout viewport*,
 * causing the element to visually "float" (can appear in the middle while scrolling).
 *
 * Fix strategy:
 * - Keep Teleport to `body` (avoids transform/overflow parent issues)
 * - Additionally, use `window.visualViewport` (when available) to compute a bottom offset
 *   so the nav always sticks to the *visual viewport* bottom.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const router = useRouter()

const props = defineProps({
  inPopup: {
    type: Boolean,
    default: false
  }
})

const route = useRoute()

// iOS visual viewport bottom offset (px). 0 on most desktop browsers.
const visualViewportBottomOffset = ref(0)

/**
 * Update visual viewport bottom offset.
 * Formula: bottomGap = layoutViewportHeight - (visualViewportHeight + visualViewportOffsetTop)
 */
const updateVisualViewportOffset = () => {
  if (typeof window === 'undefined') return
  const vv = window.visualViewport
  if (!vv) {
    visualViewportBottomOffset.value = 0
    return
  }

  const gap = window.innerHeight - (vv.height + vv.offsetTop)
  visualViewportBottomOffset.value = Number.isFinite(gap) && gap > 0 ? Math.round(gap) : 0
}

onMounted(() => {
  updateVisualViewportOffset()
  const vv = window.visualViewport
  if (!vv) return

  // Both events are needed: Safari triggers either depending on scroll/toolbar state.
  vv.addEventListener('resize', updateVisualViewportOffset)
  vv.addEventListener('scroll', updateVisualViewportOffset)
})

onUnmounted(() => {
  const vv = window.visualViewport
  if (!vv) return
  vv.removeEventListener('resize', updateVisualViewportOffset)
  vv.removeEventListener('scroll', updateVisualViewportOffset)
})

/**
 * Inline style for CSS variables.
 * - `--vv-bottom-offset`: dynamic offset for iOS visual viewport
 */
const bottomNavInlineStyle = computed(() => {
  // In popup mode we intentionally don't Teleport and use relative layout.
  if (props.inPopup) return {}
  return {
    '--vv-bottom-offset': `${visualViewportBottomOffset.value}px`
  }
})

const navItems = [
  { path: '/', icon: '/static/index/1.png', activeIcon: '/static/SHOUYE/1.png', label: 'bottomNav.home' },
  { path: '/robot', icon: '/static/index/2.png', activeIcon: '/static/SHOUYE/2.png', label: 'bottomNav.robot' },
  { path: '/invite', icon: '/static/index/3.png', activeIcon: '/static/SHOUYE/3.png', label: 'bottomNav.invite' },
  { path: '/follow', icon: '/static/index/4.png', activeIcon: '/static/SHOUYE/4.png', label: 'bottomNav.follow' },
  { path: '/wallet', icon: '/static/index/5.png', activeIcon: '/static/SHOUYE/5.png', label: 'bottomNav.assets' }
]

const isActive = (path) => {
  return route.path === path
}

// 处理导航点击事件
const handleNavClick = (path, event) => {
  // 如果点击的是首页图标，并且当前已经在首页
  if (path === '/' && route.path === '/') {
    event.preventDefault() // 阻止默认的路由跳转行为
    // 平滑滚动到页面顶部
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }
}
</script>

<style scoped>
.bottom-nav {
  /* Fixed positioning - Teleport ensures this works on iOS Safari */
  position: fixed;
  /*
   * Base bottom spacing + iOS visual viewport compensation.
   * `--vv-bottom-offset` is 0 on normal browsers, >0 when iOS toolbars are visible.
   */
  bottom: calc(20px + var(--vv-bottom-offset, 0px));
  left: 0;
  right: 0;
  margin: 0 auto;
  width: 404px;
  height: 67px;
  background: #222226;
  border-radius: 12px;
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.03);
  z-index: 99999; /* Very high z-index since it's now in body */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  
  /* iOS Safari hardware acceleration */
  -webkit-transform: translate3d(0, 0, 0);
  transform: translate3d(0, 0, 0);
  
  /* Safe area for iPhone notch/home indicator */
  padding-bottom: env(safe-area-inset-bottom, 0);
}

/* 弹窗内的导航栏样式 */
.bottom-nav.in-popup {
  position: relative;
  bottom: 0;
  width: 100%;
  height: 75px;
  border-radius: 0;
  margin: 0;
  background: #2a2a2e;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  border-left: none;
  border-right: none;
  border-bottom: none;
  box-shadow: none;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-decoration: none;
  color: rgba(255, 255, 255, 0.5);
  transition: color 0.3s ease;
  height: 100%;
  flex: 1;
}

.nav-item.active {
  color: #f59e0b;
}

.nav-icon {
  width: 28px; /* 增大图标以适应67px高度 */
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.nav-label {
  font-size: 11px; /* 增大字体 */
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 4px; /* 增加与图标的间距 */
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 16px; /* 确保高度一致 */
}

/* 选中状态的圆点 */
.active-dot {
  color: rgb(245, 182, 56); /* 金黄色 #f5b638 */
  font-size: 24px; /* 圆点大小 */
  line-height: 1;
  font-weight: bold;
}

/* 未选中状态的文字 */
.label-text {
  font-size: 11px;
  font-weight: 500;
}

/* Mobile adaptation */
@media (max-width: 768px) {
  .bottom-nav {
    width: 90%;
    max-width: 404px;
    bottom: calc(16px + var(--vv-bottom-offset, 0px));
  }

  .bottom-nav.in-popup {
    width: 100%;
    height: 67px;
  }
}

/* Small screen phone adaptation */
@media (max-width: 420px) {
  .bottom-nav {
    width: 95%;
    max-width: 404px;
    bottom: calc(12px + var(--vv-bottom-offset, 0px));
  }
}
</style>
