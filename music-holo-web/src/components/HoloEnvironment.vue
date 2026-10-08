<template>
  <div class="holo-environment" aria-hidden="true">
    <div class="env-haze haze-one"></div>
    <div class="env-haze haze-two"></div>
    <div class="env-horizon"></div>
    <div class="env-orbit orbit-one"><i></i><b></b></div>
    <div class="env-orbit orbit-two"><i></i></div>
    <div class="env-orbit orbit-three"></div>
    <div class="env-spire"><i></i><i></i><i></i></div>
    <div class="env-grid"></div>
    <div class="env-particles">
      <i v-for="particle in particles" :key="particle" :style="particleStyle(particle)"></i>
    </div>
  </div>
</template>

<script setup>
const particles = Array.from({ length: 18 }, (_, index) => index + 1)

const particleStyle = (n) => {
  const angle = n * 137.5
  const radius = 12 + (n % 6) * 8
  return {
    '--particle-x': `${50 + Math.cos(angle * Math.PI / 180) * radius}%`,
    '--particle-y': `${22 + (n * 17) % 68}%`,
    '--particle-delay': `${-(n % 9) * 0.8}s`,
    '--particle-duration': `${8 + (n % 5) * 2}s`,
    '--particle-size': `${2 + (n % 3)}px`
  }
}
</script>

<style scoped>
.holo-environment {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  perspective: 1200px;
  transform-style: preserve-3d;
  contain: strict;
  opacity: 0.82;
}
.env-haze {
  position: absolute;
  width: min(68vw, 920px);
  aspect-ratio: 1;
  border-radius: 50%;
  filter: blur(12px);
  opacity: 0.27;
  transform: translate3d(0, 0, -180px);
  animation: haze-drift 22s ease-in-out infinite alternate;
}
.haze-one {
  left: 15%;
  top: -45%;
  background: radial-gradient(circle, color-mix(in srgb, var(--holo-primary) 32%, transparent), transparent 68%);
}
.haze-two {
  right: -22%;
  top: 16%;
  background: radial-gradient(circle, color-mix(in srgb, var(--holo-secondary) 28%, transparent), transparent 70%);
  animation-delay: -11s;
}
.env-horizon {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 14%;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--holo-primary) 30%, transparent), transparent);
  box-shadow: 0 0 32px 5px var(--holo-glow);
  opacity: 0.45;
}
.env-orbit {
  position: absolute;
  left: 54%;
  top: 48%;
  width: min(66vw, 920px);
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 15%, transparent);
  border-radius: 50%;
  transform-style: preserve-3d;
  transform: translate3d(-50%, -50%, -120px) rotateX(72deg) rotateZ(-24deg);
  box-shadow: 0 0 42px color-mix(in srgb, var(--holo-primary) 8%, transparent), inset 0 0 46px color-mix(in srgb, var(--holo-primary) 5%, transparent);
  animation: orbit-drift 44s linear infinite;
}
.env-orbit::before,
.env-orbit::after {
  content: '';
  position: absolute;
  inset: 12%;
  border: 1px dashed color-mix(in srgb, var(--holo-secondary) 24%, transparent);
  border-radius: 50%;
}
.env-orbit::after {
  inset: 25%;
  border-style: solid;
  opacity: 0.52;
}
.env-orbit i,
.env-orbit b {
  position: absolute;
  left: 50%;
  top: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--holo-primary);
  box-shadow: 0 0 14px 4px var(--holo-glow);
  transform: translate(-50%, -50%);
}
.env-orbit b {
  left: 13%;
  top: 68%;
  width: 4px;
  height: 4px;
  background: var(--holo-secondary);
  box-shadow: 0 0 16px 5px color-mix(in srgb, var(--holo-secondary) 38%, transparent);
}
.orbit-two {
  left: 54%;
  top: 48%;
  width: min(48vw, 680px);
  border-color: color-mix(in srgb, var(--holo-secondary) 18%, transparent);
  transform: translate3d(-50%, -50%, -80px) rotateX(69deg) rotateZ(52deg);
  animation-duration: 58s;
  animation-direction: reverse;
}
.orbit-two::before {
  inset: -9%;
  border-color: color-mix(in srgb, var(--holo-primary) 12%, transparent);
}
.orbit-three {
  left: 54%;
  top: 48%;
  width: min(34vw, 470px);
  border-style: dotted;
  border-color: color-mix(in srgb, var(--holo-primary) 16%, transparent);
  transform: translate3d(-50%, -50%, -40px) rotateX(76deg) rotateZ(12deg);
  animation-duration: 36s;
  animation-direction: reverse;
}
.env-spire {
  position: absolute;
  left: 54%;
  bottom: 8%;
  width: min(38vw, 490px);
  height: 70%;
  transform: translateX(-50%) translateZ(-60px);
  opacity: 0.15;
  filter: blur(1px);
}
.env-spire i {
  position: absolute;
  inset: 0 22%;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  background: linear-gradient(180deg, color-mix(in srgb, var(--holo-primary) 35%, transparent), transparent 85%);
}
.env-spire i:nth-child(2) {
  inset: 12% 32% 0;
  opacity: 0.8;
  background: linear-gradient(180deg, color-mix(in srgb, var(--holo-secondary) 38%, transparent), transparent 82%);
}
.env-spire i:nth-child(3) {
  inset: 25% 8% 0;
  opacity: 0.42;
  background: linear-gradient(180deg, color-mix(in srgb, var(--holo-primary) 20%, transparent), transparent 80%);
}
.env-grid {
  position: absolute;
  left: -35%;
  right: -35%;
  bottom: -49%;
  height: 88%;
  transform-origin: center bottom;
  transform: rotateX(72deg) translateZ(-80px);
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--holo-primary) 12%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--holo-primary) 12%, transparent) 1px, transparent 1px),
    radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--holo-primary) 14%, transparent), transparent 72%);
  background-size: 58px 58px, 58px 58px, 100% 100%;
  mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent 83%);
  -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent 83%);
}
.env-particles {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
}
.env-particles i {
  position: absolute;
  left: var(--particle-x);
  top: var(--particle-y);
  width: var(--particle-size);
  height: var(--particle-size);
  border-radius: 50%;
  background: var(--holo-primary);
  box-shadow: 0 0 12px 2px var(--holo-glow);
  opacity: 0;
  transform: translateZ(-60px);
  animation: particle-float var(--particle-duration) ease-in-out var(--particle-delay) infinite;
}
.env-particles i:nth-child(3n) {
  background: var(--holo-secondary);
  box-shadow: 0 0 12px 2px color-mix(in srgb, var(--holo-secondary) 45%, transparent);
}
@keyframes orbit-drift {
  from { rotate: 0deg; }
  to { rotate: 360deg; }
}
@keyframes particle-float {
  0%, 100% { opacity: 0; transform: translate3d(0, 10px, -90px) scale(0.6); }
  30%, 72% { opacity: 0.58; }
  50% { opacity: 0.8; transform: translate3d(10px, -18px, 20px) scale(1.15); }
}
@keyframes haze-drift {
  from { translate: -2% 1%; scale: 0.92; }
  to { translate: 3% -2%; scale: 1.08; }
}
@media (max-width: 700px) {
  .env-orbit { left: 78%; width: 112vw; }
  .orbit-two { left: 78%; width: 80vw; }
  .orbit-three { left: 78%; width: 62vw; }
  .env-spire { left: 78%; width: 70vw; }
  .env-grid { background-size: 46px 46px, 46px 46px, 100% 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .env-haze,
  .env-orbit,
  .env-particles i { animation: none; }
  .env-particles i { opacity: 0.18; }
}
</style>
