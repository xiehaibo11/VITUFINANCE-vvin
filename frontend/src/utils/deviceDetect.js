/**
 * Device Detection Utility - Safari/iOS Performance Optimization
 * Used to detect device type and apply corresponding performance optimization strategies
 */

/**
 * Check if browser is Safari (including iOS Safari)
 * @returns {boolean}
 */
export const isSafari = () => {
  const ua = navigator.userAgent.toLowerCase()
  // Safari but not Chrome (Chrome also contains Safari string)
  return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium')
}

/**
 * Check if device is iOS
 * @returns {boolean}
 */
export const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Check if device is macOS
 * @returns {boolean}
 */
export const isMacOS = () => {
  return navigator.platform.toLowerCase().includes('mac')
}

/**
 * Check if device is Apple device (iOS + macOS)
 * @returns {boolean}
 */
export const isAppleDevice = () => {
  return isIOS() || isMacOS()
}

/**
 * Check if device is low performance
 * Includes: iOS devices, Safari browser, low memory devices, low GPU performance devices
 * @returns {boolean}
 */
export const isLowPerformanceDevice = () => {
  // Safari/iOS has poor support for complex animations
  if (isSafari() || isIOS()) {
    return true
  }
  
  // Check device memory (if supported)
  if (navigator.deviceMemory && navigator.deviceMemory < 4) {
    return true
  }
  
  // Check hardware concurrency (CPU cores)
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
    return true
  }
  
  // Check if reduced motion is requested
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return true
  }
  
  return false
}

/**
 * Check if backdrop-filter should be used
 * Safari supports it but performance is poor
 * @returns {boolean}
 */
export const shouldUseBackdropFilter = () => {
  // Disable backdrop-filter on Safari/iOS for better performance
  if (isSafari() || isIOS()) {
    return false
  }
  
  // Check if supported
  return CSS.supports?.('backdrop-filter', 'blur(10px)') ?? false
}

/**
 * Check if complex animations should be used
 * @returns {boolean}
 */
export const shouldUseComplexAnimations = () => {
  // Disable complex animations on low performance devices
  if (isLowPerformanceDevice()) {
    return false
  }
  
  // Check if reduced motion is requested
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return false
  }
  
  return true
}

/**
 * Check if 3D effects should be used
 * @returns {boolean}
 */
export const shouldUse3DEffects = () => {
  // Safari/iOS has poor Three.js performance support
  if (isSafari() || isIOS()) {
    return false
  }
  
  return shouldUseComplexAnimations()
}

/**
 * Get recommended animation duration
 * Use shorter animations on Safari to reduce stuttering
 * @param {number} defaultDuration - Default duration (milliseconds)
 * @returns {number}
 */
export const getOptimalAnimationDuration = (defaultDuration = 300) => {
  if (isLowPerformanceDevice()) {
    return Math.min(defaultDuration * 0.5, 150) // Halve but not exceed 150ms
  }
  return defaultDuration
}

/**
 * Get recommended particle count
 * @param {number} defaultCount - Default count
 * @returns {number}
 */
export const getOptimalParticleCount = (defaultCount) => {
  if (isLowPerformanceDevice()) {
    return Math.floor(defaultCount * 0.3) // Reduce to 30%
  }
  return defaultCount
}

/**
 * Get recommended device pixel ratio
 * Limit pixel ratio on high DPI devices for better performance
 * @returns {number}
 */
export const getOptimalPixelRatio = () => {
  const dpr = window.devicePixelRatio || 1
  
  // Limit max pixel ratio to 1.5 on Safari/iOS
  if (isSafari() || isIOS()) {
    return Math.min(dpr, 1.5)
  }
  
  // Limit max pixel ratio to 2 on other devices
  return Math.min(dpr, 2)
}

/**
 * Get device performance configuration
 * @returns {Object}
 */
export const getDevicePerformanceConfig = () => {
  return {
    // Whether to use 3D effects
    use3DEffects: shouldUse3DEffects(),
    // Whether to use complex animations
    useComplexAnimations: shouldUseComplexAnimations(),
    // Whether to use backdrop-filter
    useBackdropFilter: shouldUseBackdropFilter(),
    // Recommended pixel ratio
    pixelRatio: getOptimalPixelRatio(),
    // Animation duration multiplier
    animationDurationMultiplier: isLowPerformanceDevice() ? 0.5 : 1,
    // Particle count multiplier
    particleCountMultiplier: isLowPerformanceDevice() ? 0.3 : 1,
    // Whether to enable shadows
    useShadows: !isLowPerformanceDevice(),
    // Target FPS
    targetFPS: isLowPerformanceDevice() ? 30 : 60
  }
}

export default {
  isSafari,
  isIOS,
  isMacOS,
  isAppleDevice,
  isLowPerformanceDevice,
  shouldUseBackdropFilter,
  shouldUseComplexAnimations,
  shouldUse3DEffects,
  getOptimalAnimationDuration,
  getOptimalParticleCount,
  getOptimalPixelRatio,
  getDevicePerformanceConfig
}

