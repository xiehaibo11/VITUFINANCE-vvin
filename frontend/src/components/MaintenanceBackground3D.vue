<template>
  <!-- Show simple background for low performance devices -->
  <div 
    v-if="!shouldRender3D" 
    class="fallback-container"
  >
    <div class="gradient-bg"></div>
    <div class="particles-static">
      <div v-for="i in 20" :key="i" class="particle" :style="getParticleStyle(i)"></div>
    </div>
  </div>
  
  <!-- Show 3D background for high performance devices -->
  <div 
    v-else 
    ref="container" 
    class="three-container"
  ></div>
</template>

<script setup>
/**
 * 3D Background Component for Maintenance Page
 * Auto switches to static CSS background on low performance devices
 */
import * as THREE from 'three'
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { 
  shouldUse3DEffects, 
  getOptimalPixelRatio,
  getOptimalParticleCount,
  isLowPerformanceDevice
} from '@/utils/deviceDetect'

const container = ref(null)

// Check if should render 3D effects
const shouldRender3D = ref(shouldUse3DEffects())

/**
 * Generate static particle style (for fallback mode)
 */
const getParticleStyle = (index) => {
  const seed = index * 137.508
  return {
    left: `${(seed % 100)}%`,
    top: `${((seed * 1.618) % 100)}%`,
    animationDelay: `${(index * 0.3)}s`,
    opacity: 0.3 + (index % 5) * 0.1
  }
}

let scene, camera, renderer
let waveParticles, rainParticles, explosionParticles
let count = 0
let mouseX = 0
let mouseY = 0
let windowHalfX = window.innerWidth / 2
let windowHalfY = window.innerHeight / 2
let animationFrameId = null
let isAnimating = false

// Particle system parameters - adjust based on device performance
const isLowPerf = isLowPerformanceDevice()
const WAVE_COUNT_X = isLowPerf ? 25 : 50
const WAVE_COUNT_Y = isLowPerf ? 25 : 50
const RAIN_COUNT = getOptimalParticleCount(200)
const EXPLOSION_COUNT = getOptimalParticleCount(200)
const EXPLOSION_POOL_SIZE = isLowPerf ? 30 : 100

// Explosion object pool
const explosions = []

/**
 * Initialize the 3D scene
 */
const init = () => {
  // Return if should not render 3D or container not available
  if (!shouldRender3D.value || !container.value) {
    console.log('[MaintenanceBackground3D] Using fallback mode (CSS background)')
    return
  }
  
  console.log('[MaintenanceBackground3D] Initializing 3D background')
  
  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x050505, 0.002)

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 3000)
  camera.position.z = 1000
  camera.position.y = 200

  // Performance optimization: disable antialiasing, limit pixel ratio
  renderer = new THREE.WebGLRenderer({ 
    alpha: true, 
    antialias: !isLowPerf, // Disable antialiasing on low performance devices
    powerPreference: 'low-power' // Prefer integrated GPU, reduce power consumption
  })
  
  // Use optimized pixel ratio
  renderer.setPixelRatio(getOptimalPixelRatio())
  renderer.setSize(window.innerWidth, window.innerHeight)
  container.value.appendChild(renderer.domElement)

  // 1. Initialize wave particles
  initWave()
  
  // 2. Initialize rain particles
  initRain()
  
  // 3. Initialize explosion particle pool
  initExplosions()

  document.addEventListener('mousemove', onDocumentMouseMove)
  window.addEventListener('resize', onWindowResize)
}

/**
 * Initialize wave particle system
 */
const initWave = () => {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(WAVE_COUNT_X * WAVE_COUNT_Y * 3)
  
  let i = 0
  for (let ix = 0; ix < WAVE_COUNT_X; ix++) {
    for (let iy = 0; iy < WAVE_COUNT_Y; iy++) {
      positions[i] = ix * 80 - 2000
      positions[i + 1] = 0
      positions[i + 2] = iy * 80 - 2000
      i += 3
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0x409EFF,
    size: 4,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  })
  
  waveParticles = new THREE.Points(geometry, material)
  scene.add(waveParticles)
}

/**
 * Initialize rain particle system
 */
const initRain = () => {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(RAIN_COUNT * 3)
  const velocities = new Float32Array(RAIN_COUNT) // Fall velocity
  
  for (let i = 0; i < RAIN_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 4000 // x
    positions[i * 3 + 1] = Math.random() * 2000 + 500 // y (start height)
    positions[i * 3 + 2] = (Math.random() - 0.5) * 4000 // z
    velocities[i] = Math.random() * 10 + 20 // velocity 20-30
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1))
  
  const material = new THREE.PointsMaterial({
    color: 0xA6C8FF, // Light blue raindrops
    size: 3,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending
  })
  
  rainParticles = new THREE.Points(geometry, material)
  scene.add(rainParticles)
}

/**
 * Initialize explosion particle pool
 */
const initExplosions = () => {
  const geometry = new THREE.BufferGeometry()
  const particleCount = EXPLOSION_COUNT * EXPLOSION_POOL_SIZE
  const positions = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)
  
  // Initially hide all explosion particles, set default color to white
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3 + 1] = -10000 
    colors[i * 3] = 1.0
    colors[i * 3 + 1] = 1.0
    colors[i * 3 + 2] = 1.0
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  
  const material = new THREE.PointsMaterial({
    size: 4, // Increase explosion particle size
    vertexColors: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending
  })
  
  explosionParticles = new THREE.Points(geometry, material)
  scene.add(explosionParticles)
  
  // Initialize explosion object pool logic
  for (let i = 0; i < EXPLOSION_POOL_SIZE; i++) {
    explosions.push({
      active: false,
      startIndex: i * EXPLOSION_COUNT,
      age: 0,
      positions: [], // Store relative positions locally
      velocities: []
    })
  }
}

/**
 * Trigger explosion effect at specified position
 */
const triggerExplosion = (x, y, z) => {
  // Find an idle explosion object
  const explosion = explosions.find(e => !e.active)
  if (!explosion) return

  explosion.active = true
  explosion.age = 0
  
  const positions = explosionParticles.geometry.attributes.position.array
  const colors = explosionParticles.geometry.attributes.color.array
  
  for (let i = 0; i < EXPLOSION_COUNT; i++) {
    const index = explosion.startIndex + i
    
    // Reset position to collision point
    positions[index * 3] = x
    positions[index * 3 + 1] = y // Use precise collision height
    positions[index * 3 + 2] = z
    
    // Random upward splash velocity, increase spread range
    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 8 + 4 
    const vy = Math.random() * 12 + 8 
    
    explosion.velocities[i] = {
      x: Math.cos(angle) * speed,
      y: vy,
      z: Math.sin(angle) * speed
    }
    
    // Random color (blue-green spectrum)
    colors[index * 3] = 0.4 + Math.random() * 0.4 
    colors[index * 3 + 1] = 0.8 + Math.random() * 0.2 
    colors[index * 3 + 2] = 1.0 
  }
  
  explosionParticles.geometry.attributes.position.needsUpdate = true
  explosionParticles.geometry.attributes.color.needsUpdate = true
}

/**
 * Handle mouse move event
 */
const onDocumentMouseMove = (event) => {
  mouseX = event.clientX - windowHalfX
  mouseY = event.clientY - windowHalfY
}

/**
 * Handle window resize event
 */
const onWindowResize = () => {
  // Guard check - only proceed if 3D scene is initialized
  if (!camera || !renderer) return
  
  windowHalfX = window.innerWidth / 2
  windowHalfY = window.innerHeight / 2
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

/**
 * Animation loop - with frame rate control
 */
let lastFrameTime = 0
const targetFPS = isLowPerf ? 30 : 60 // Limit to 30fps on low performance devices
const frameInterval = 1000 / targetFPS

const animate = (currentTime) => {
  if (!isAnimating) return
  
  animationFrameId = requestAnimationFrame(animate)
  
  // Frame rate control
  const deltaTime = currentTime - lastFrameTime
  if (deltaTime < frameInterval) return
  
  lastFrameTime = currentTime - (deltaTime % frameInterval)
  
  render()
}

/**
 * Calculate wave height at specified position
 */
const getWaveHeight = (x, z, time) => {
  // Reverse calculate grid index (approximate)
  const ix = (x + 2000) / 80
  const iy = (z + 2000) / 80
  
  return (Math.sin((ix + time) * 0.3) * 50) + 
         (Math.sin((iy + time) * 0.5) * 50) +
         (Math.sin((ix + iy + time) * 0.2) * 20)
}

/**
 * Render frame
 */
const render = () => {
  // Guard check - only proceed if 3D scene is fully initialized
  if (!scene || !camera || !renderer || !waveParticles || !rainParticles || !explosionParticles) {
    return
  }
  
  // 1. Camera movement
  camera.position.x += (mouseX - camera.position.x) * 0.02
  camera.position.y += (-mouseY + 200 - camera.position.y) * 0.02
  camera.lookAt(scene.position)

  // 2. Wave animation
  const wavePositions = waveParticles.geometry.attributes.position.array
  let i = 0
  for (let ix = 0; ix < WAVE_COUNT_X; ix++) {
    for (let iy = 0; iy < WAVE_COUNT_Y; iy++) {
      // Calculate wave height using x, z
      wavePositions[i + 1] = (Math.sin((ix + count) * 0.3) * 50) + 
                           (Math.sin((iy + count) * 0.5) * 50) +
                           (Math.sin((ix + iy + count) * 0.2) * 20)
      i += 3
    }
  }
  waveParticles.geometry.attributes.position.needsUpdate = true
  count += 0.05

  // 3. Rain animation & collision detection
  const rainPos = rainParticles.geometry.attributes.position.array
  const rainVel = rainParticles.geometry.attributes.velocity.array
  
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainPos[i * 3 + 1] -= rainVel[i] // Fall
    
    const x = rainPos[i * 3]
    const z = rainPos[i * 3 + 2]
    
    // Real-time calculate wave height at this position
    const waveHeight = getWaveHeight(x, z, count)
    
    // Precise collision detection: raindrop falls below wave surface
    if (rainPos[i * 3 + 1] < waveHeight) {
      // Trigger explosion at wave surface
      triggerExplosion(x, waveHeight, z)
      
      // Reset raindrop to top
      rainPos[i * 3] = (Math.random() - 0.5) * 4000
      rainPos[i * 3 + 1] = Math.random() * 1000 + 1000 // Random new height
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 4000
    }
  }
  rainParticles.geometry.attributes.position.needsUpdate = true

  // 4. Explosion animation
  const expPos = explosionParticles.geometry.attributes.position.array
  
  explosions.forEach(explosion => {
    if (!explosion.active) return
    
    explosion.age++
    if (explosion.age > 40) { // Lifespan ended
      explosion.active = false
      // Hide particles
      for (let i = 0; i < EXPLOSION_COUNT; i++) {
        expPos[(explosion.startIndex + i) * 3 + 1] = -10000
      }
      return
    }
    
    // Update each particle position
    for (let i = 0; i < EXPLOSION_COUNT; i++) {
      const idx = explosion.startIndex + i
      const vel = explosion.velocities[i]
      
      expPos[idx * 3] += vel.x
      expPos[idx * 3 + 1] += vel.y
      expPos[idx * 3 + 2] += vel.z
      
      // Gravity simulation
      vel.y -= 0.5 
    }
  })
  explosionParticles.geometry.attributes.position.needsUpdate = true

  renderer.render(scene, camera)
}

onMounted(() => {
  if (shouldRender3D.value) {
    init()
    isAnimating = true
    animate(performance.now())
  }
})

onBeforeUnmount(() => {
  // Stop animation loop
  isAnimating = false
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  
  // Remove event listeners
  document.removeEventListener('mousemove', onDocumentMouseMove)
  window.removeEventListener('resize', onWindowResize)
  
  // Clean up Three.js resources
  if (renderer) {
    renderer.dispose()
    renderer.forceContextLoss()
    renderer = null
  }
  
  if (scene) {
    scene.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose()
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose())
        } else {
          object.material.dispose()
        }
      }
    })
    scene = null
  }
  
  camera = null
  waveParticles = null
  rainParticles = null
  explosionParticles = null
})
</script>

<style scoped>
/* 3D Container */
.three-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
  background: radial-gradient(circle at center, #1b2735 0%, #090a0f 100%);
}

/* Fallback Container - Safari/iOS optimized background */
.fallback-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
}

/* Gradient Background */
.gradient-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 30% 20%, #1b2735 0%, #090a0f 50%, #0d1520 100%);
}

/* Static Particle Effects */
.particles-static {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: #66b1ff;
  border-radius: 50%;
  opacity: 0.5;
  animation: float 8s infinite ease-in-out;
}

/* Simple floating animation - only use transform and opacity for best performance */
@keyframes float {
  0%, 100% {
    transform: translateY(0) scale(1);
    opacity: 0.3;
  }
  50% {
    transform: translateY(-20px) scale(1.2);
    opacity: 0.6;
  }
}

/* Disable animation on Safari/iOS devices */
@media (prefers-reduced-motion: reduce) {
  .particle {
    animation: none;
  }
}
</style>

