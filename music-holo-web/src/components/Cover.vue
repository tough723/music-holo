<template>
  <div class="cover">
    <img v-if="showImg" :src="src" alt="cover" loading="lazy" @error="onError" />
    <span v-else class="cover-fallback" :style="gradientStyle">{{ fallbackText }}</span>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { hashCode } from '@/utils/format'

const props = defineProps({
  /** 图片地址，为空时显示渐变占位 */
  src: { type: String, default: '' },
  /** 占位文字（取首字符） */
  text: { type: String, default: '♪' },
  /** 尺寸（px） */
  size: { type: Number, default: 48 }
})

const imgError = ref(false)

const PALETTE = [
  ['#22d3ee', '#818cf8'],
  ['#f472b6', '#c084fc'],
  ['#fbbf24', '#fb7185'],
  ['#a3e635', '#34d399'],
  ['#60a5fa', '#22d3ee'],
  ['#c084fc', '#f472b6']
]

const gradientStyle = computed(() => {
  const [c1, c2] = PALETTE[hashCode(props.text) % PALETTE.length]
  return {
    background: `linear-gradient(135deg, ${c1}, ${c2})`,
    fontSize: `${Math.max(12, props.size * 0.42)}px`
  }
})

const fallbackText = computed(() => (props.text || '♪').trim().charAt(0) || '♪')

const onError = () => {
  imgError.value = true
}
</script>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  overflow: hidden;
  flex-shrink: 0;
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}
</style>
