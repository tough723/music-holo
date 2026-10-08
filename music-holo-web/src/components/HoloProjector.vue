<template>
  <div class="holo" :class="{ playing }" :style="{ '--sz': size + 'px' }">
    <div class="holo-cone"></div>
    <div class="holo-stage">
      <div class="holo-ring r1"></div>
      <div class="holo-ring r2"></div>
      <div class="holo-disc">
        <div class="disc-face front">
          <Cover :src="cover" :text="title" :size="size * 0.62" />
        </div>
        <div class="disc-face back"></div>
        <div class="holo-scan"></div>
      </div>
      <div class="holo-particles">
        <i v-for="n in 10" :key="n" :style="particleStyle(n)"></i>
      </div>
    </div>
    <div class="holo-base"></div>
    <div class="holo-shadow"></div>
    <div class="holo-caption" v-if="showCaption">
      <div class="cap-title holo-text">{{ title || '3D 全息音乐' }}</div>
      <div class="cap-sub">{{ singer || 'Music Holo' }}</div>
    </div>
  </div>
</template>

<script setup>
import Cover from './Cover.vue'

defineProps({
  cover: { type: String, default: '' },
  title: { type: String, default: '' },
  singer: { type: String, default: '' },
  playing: { type: Boolean, default: false },
  size: { type: Number, default: 220 },
  showCaption: { type: Boolean, default: false }
})

/** 粒子位置 / 动画延迟（确定性分布，避免每次渲染抖动） */
const particleStyle = (n) => {
  const angle = (n / 10) * 360
  const radius = 38 + (n % 3) * 8
  return {
    left: `calc(50% + ${Math.cos((angle * Math.PI) / 180) * radius}%)`,
    animationDelay: `${(n * 0.37) % 4}s`,
    animationDuration: `${3.4 + (n % 4) * 0.3}s`
  }
}
</script>

<style scoped>
.holo {
  position: relative;
  width: var(--sz);
  height: calc(var(--sz) * 1.18);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  user-select: none;
}

/* 投影锥体：从底座向上投出的光束 */
.holo-cone {
  position: absolute;
  bottom: 9%;
  left: 50%;
  transform: translateX(-50%);
  width: 82%;
  height: 74%;
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
  background: linear-gradient(180deg, var(--holo-glow), transparent 88%);
  filter: blur(3px);
  animation: flicker 3.2s ease-in-out infinite;
  z-index: 1;
}

/* 舞台：3D 透视容器 */
.holo-stage {
  position: absolute;
  bottom: 30%;
  left: 50%;
  transform: translateX(-50%);
  width: 64%;
  aspect-ratio: 1;
  perspective: 700px;
  z-index: 2;
}

/* 旋转的全息碟片 */
.holo-disc {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  animation: spinY 7s linear infinite;
  animation-play-state: paused;
}
.holo.playing .holo-disc {
  animation-play-state: running;
}
.disc-face {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  overflow: hidden;
  transform: rotateX(72deg);
  box-shadow: 0 0 26px var(--holo-glow), inset 0 0 18px rgba(255, 255, 255, 0.08);
  border: 1px solid color-mix(in srgb, var(--holo-primary) 55%, transparent);
}
.disc-face.back {
  transform: rotateX(72deg) translateZ(-9px);
  background: radial-gradient(circle, color-mix(in srgb, var(--holo-secondary) 30%, transparent), transparent 70%);
}

/* 扫描线（全息质感） */
.holo-scan {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  transform: rotateX(72deg);
  background: repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.07) 0 1px, transparent 1px 4px);
  mix-blend-mode: screen;
  pointer-events: none;
}

/* 轨道环 */
.holo-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px dashed color-mix(in srgb, var(--holo-primary) 70%, transparent);
  transform: rotateX(72deg);
  animation: ringPulse 3s ease-in-out infinite;
  pointer-events: none;
}
.holo-ring.r1 {
  inset: -16%;
  opacity: 0.55;
}
.holo-ring.r2 {
  inset: -30%;
  opacity: 0.3;
  animation-duration: 4.2s;
  animation-direction: reverse;
}

/* 粒子 */
.holo-particles {
  position: absolute;
  inset: -20%;
  pointer-events: none;
}
.holo-particles i {
  position: absolute;
  bottom: 0;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--holo-primary);
  box-shadow: 0 0 8px var(--holo-primary);
  opacity: 0;
  animation: floatUp 4s linear infinite;
}

/* 底座 */
.holo-base {
  width: 46%;
  height: 11%;
  border-radius: 50%;
  background: linear-gradient(180deg, #1e293b, #0b1120);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  position: relative;
  z-index: 3;
}
.holo-base::after {
  content: '';
  position: absolute;
  inset: 32% 22%;
  border-radius: 50%;
  background: var(--holo-primary);
  filter: blur(7px);
  opacity: 0.75;
  animation: basePulse 2.4s ease-in-out infinite;
}

/* 地面投影阴影 */
.holo-shadow {
  width: 70%;
  height: 7%;
  margin-top: 2%;
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--holo-glow), transparent);
  filter: blur(4px);
  animation: shadowPulse 2.4s ease-in-out infinite;
}

.holo-caption {
  margin-top: 10px;
  text-align: center;
}
.cap-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: var(--sz);
}
.cap-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: var(--sz);
}

@keyframes spinY {
  from { transform: rotateY(0deg); }
  to { transform: rotateY(360deg); }
}
@keyframes flicker {
  0%, 100% { opacity: 0.55; }
  25% { opacity: 0.85; }
  50% { opacity: 0.6; }
  75% { opacity: 0.9; }
}
@keyframes ringPulse {
  0%, 100% { transform: rotateX(72deg) scale(1); opacity: 0.35; }
  50% { transform: rotateX(72deg) scale(1.12); opacity: 0.7; }
}
@keyframes floatUp {
  0% { transform: translateY(0); opacity: 0; }
  15% { opacity: 0.9; }
  85% { opacity: 0.6; }
  100% { transform: translateY(calc(var(--sz) * -1.1)); opacity: 0; }
}
@keyframes basePulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.95; }
}
@keyframes shadowPulse {
  0%, 100% { transform: scaleX(1); opacity: 0.7; }
  50% { transform: scaleX(1.15); opacity: 1; }
}
</style>
