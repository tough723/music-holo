<template>
  <div class="radio-page">
    <section class="radio-hero glass-panel">
      <div class="radio-copy">
        <div class="eyebrow"><el-icon><Headset /></el-icon> HOLO RADIO · SIMILAR SIGNAL</div>
        <h1>相似歌曲电台</h1>
        <p v-if="sourceSong">从《{{ sourceSong.title }}》出发，沿着相近的歌手与曲风继续探索。</p>
        <p v-else>结合近期收听与收藏，为你聚合一组可直接播放的曲目。</p>
        <div v-if="sourceSong" class="radio-source">
          <Cover :src="sourceSong.cover" :text="sourceSong.title" :size="46" />
          <div class="source-copy">
            <span class="source-label">电台起点</span>
            <strong>{{ sourceSong.title }}</strong>
            <small>{{ sourceSong.singerName || '未知歌手' }}<template v-if="sourceSong.album"> · {{ sourceSong.album }}</template></small>
          </div>
          <span class="source-pulse" aria-hidden="true"></span>
        </div>
        <div v-else class="radio-source radio-source--personal">
          <el-icon><MagicStick /></el-icon>
          <span>{{ userStore.isLogin ? '按你的收听与收藏生成' : '热门歌曲冷启动电台' }}</span>
        </div>
        <div class="radio-actions">
          <el-button type="primary" round :disabled="songs.length === 0" @click="startRadio">
            <el-icon><VideoPlay /></el-icon> 播放本轮电台
          </el-button>
          <el-button round :loading="loading" @click="loadRadio">
            <el-icon><Refresh /></el-icon> 重新加载
          </el-button>
        </div>
      </div>
      <div class="radio-stage" aria-hidden="true">
        <div class="radio-stage__signal signal-one"></div>
        <div class="radio-stage__signal signal-two"></div>
        <div class="radio-stage__beam"></div>
        <HoloProjector
          :cover="sourceSong?.cover || playerStore.currentSong?.cover"
          :anonymous-cover="Boolean(sourceSong?.isCustomSource || (!sourceSong && playerStore.currentSong?.isCustomSource))"
          :title="sourceSong?.title || playerStore.currentSong?.title || 'HOLO RADIO'"
          :singer="sourceSong?.singerName || playerStore.currentSong?.singerName"
          :playing="playerStore.playing"
          :size="154"
          show-caption
        />
      </div>
    </section>

    <section class="radio-tracks glass-panel">
      <div class="section-head">
        <div>
          <div class="section-title">{{ sourceSong ? '从这首歌继续' : '为你挑选' }}</div>
          <div class="section-subtitle">{{ sourceSong ? '优先匹配同歌手与同分类，热度曲目用于补齐' : '根据现有收听和收藏偏好生成；未登录时回落热门' }}</div>
        </div>
        <el-tag effect="plain" round>{{ songs.length }} 首候选</el-tag>
      </div>
      <SongList
        :songs="songs"
        :loading="loading"
        :favorite-ids="favoriteIds"
        show-album
        @play="playSong"
        @toggle-favorite="toggleFavorite"
        @add-queue="addToQueue"
      />
      <el-empty v-if="!loading && songs.length === 0" description="暂时没有可用候选，试试排行榜或稍后重试" :image-size="100">
        <el-button type="primary" plain @click="router.push('/charts')">前往排行榜</el-button>
      </el-empty>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as songApi from '@/api/song'
import * as recommendationApi from '@/api/recommend'
import * as favoriteApi from '@/api/favorite'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import Cover from '@/components/Cover.vue'
import HoloProjector from '@/components/HoloProjector.vue'
import SongList from '@/components/SongList.vue'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const userStore = useUserStore()
const sourceSong = ref(null)
const songs = ref([])
const favoriteIds = ref([])
const loading = ref(false)
let requestId = 0

async function loadRadio() {
  const currentRequest = ++requestId
  loading.value = true
  try {
    const queryId = Number(route.query.sourceId)
    let source = null
    if (Number.isFinite(queryId) && queryId > 0) {
      source = await songApi.detail(queryId)
    } else if (playerStore.currentSong && !playerStore.currentSong.isLocal && !playerStore.currentSong.isCustomSource) {
      source = playerStore.currentSong
    }
    if (currentRequest !== requestId) return
    sourceSong.value = source
    const result = source
      ? await recommendationApi.similar(source.id, 24)
      : await recommendationApi.songs(24)
    if (currentRequest !== requestId) return
    songs.value = (result || []).filter((song) => song.id !== source?.id)
  } catch {
    if (currentRequest === requestId) {
      sourceSong.value = null
      songs.value = []
    }
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

async function loadFavorites() {
  if (!userStore.isLogin) return
  try { favoriteIds.value = await favoriteApi.ids() } catch { favoriteIds.value = [] }
}

function startRadio() {
  if (!songs.value.length) return
  playerStore.playAll(songs.value, songs.value[0].id)
  ElMessage.success(`相似歌曲电台已开启，共 ${songs.value.length} 首`)
}
function playSong(song) {
  if (songs.value.length) playerStore.playAll(songs.value, song.id)
}
function addToQueue(song) {
  playerStore.addToQueue(song)
  ElMessage.success(`已加入播放队列：《${song.title}》`)
}
async function toggleFavorite(song) {
  if (!userStore.isLogin) {
    ElMessage.warning('请先登录后再收藏')
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  try {
    if (favoriteIds.value.includes(song.id)) {
      await favoriteApi.cancel(song.id)
      favoriteIds.value = favoriteIds.value.filter((id) => id !== song.id)
      ElMessage.success('已取消收藏')
    } else {
      await favoriteApi.add(song.id)
      favoriteIds.value.push(song.id)
      ElMessage.success('收藏成功')
    }
  } catch { /* API 拦截器已提示 */ }
}

watch(() => route.query.sourceId, loadRadio)
onMounted(() => {
  loadRadio()
  loadFavorites()
})
</script>

<style scoped>
.radio-page { display: flex; flex-direction: column; gap: 18px; }
.radio-hero {
  position: relative; min-height: 286px; padding: 30px; display: flex; align-items: center; overflow: hidden;
  background: radial-gradient(ellipse at 80% 40%, color-mix(in srgb, var(--holo-primary) 20%, transparent), transparent 42%), linear-gradient(120deg, color-mix(in srgb, var(--holo-secondary) 9%, transparent), transparent 65%);
}
.radio-copy { position: relative; z-index: 2; width: min(660px, 72%); }
.eyebrow { display: flex; align-items: center; gap: 8px; color: var(--holo-primary); font-size: 10px; letter-spacing: 2px; }
h1 { margin: 14px 0 8px; font-size: clamp(25px, 3vw, 36px); }
.radio-copy > p { margin: 0; color: var(--text-sub); font-size: 13px; }
.radio-source { position: relative; display: flex; align-items: center; gap: 11px; width: fit-content; min-width: 250px; max-width: 100%; margin-top: 18px; padding: 8px 12px 8px 8px; border: 1px solid color-mix(in srgb, var(--holo-primary) 24%, transparent); border-radius: 13px; background: color-mix(in srgb, var(--holo-primary) 7%, rgba(8,14,34,.5)); box-shadow: inset 0 1px rgba(255,255,255,.08), 0 9px 20px -18px var(--holo-glow); }
.source-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.source-label { color: var(--holo-primary); font-size: 9px; letter-spacing: 1px; }
.source-copy strong, .source-copy small { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.source-copy strong { max-width: 280px; font-size: 12px; }
.source-copy small { color: var(--text-sub); font-size: 10px; }
.source-pulse { width: 7px; height: 7px; margin-left: auto; border-radius: 50%; background: var(--holo-primary); box-shadow: 0 0 12px var(--holo-primary); animation: radio-pulse 1.6s ease-in-out infinite; }
.radio-source--personal { min-width: 0; color: var(--text-main); font-size: 12px; }
.radio-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 17px; }
.radio-stage { position: absolute; right: 7%; top: 50%; width: 210px; height: 220px; display: grid; place-items: center; transform: translateY(-50%); perspective: 700px; }
.radio-stage :deep(.holo) { position: relative; z-index: 2; }
.radio-stage__signal { position: absolute; left: 50%; top: 50%; width: 190px; height: 74px; border: 1px solid color-mix(in srgb, var(--holo-primary) 58%, transparent); border-radius: 50%; transform-style: preserve-3d; box-shadow: 0 0 20px -12px var(--holo-glow); }
.signal-one { transform: translate(-50%,-50%) rotateX(72deg) rotateZ(-18deg) translateZ(-10px); animation: signal-orbit 13s linear infinite; }
.signal-two { width: 150px; height: 106px; border-color: color-mix(in srgb, var(--holo-secondary) 54%, transparent); transform: translate(-50%,-50%) rotateY(66deg) rotateZ(32deg) translateZ(-18px); animation: signal-orbit 18s linear infinite reverse; }
.radio-stage__beam { position: absolute; top: 2px; left: 50%; width: 114px; height: 190px; clip-path: polygon(50% 0,100% 100%,0 100%); transform: translateX(-50%) translateZ(-36px); background: linear-gradient(180deg, color-mix(in srgb, var(--holo-primary) 22%, transparent), transparent 75%); }
.radio-tracks { padding: 22px; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.section-title { font-size: 17px; font-weight: 650; }
.section-subtitle { margin-top: 4px; color: var(--text-sub); font-size: 11px; }
@keyframes radio-pulse { 50% { opacity: .35; transform: scale(.75); } }
@keyframes signal-orbit { to { filter: hue-rotate(45deg); } }
@media (max-width: 760px) {
  .radio-hero { min-height: 310px; padding: 22px; }
  .radio-copy { width: 100%; max-width: 560px; }
  .radio-stage { right: -34px; top: 14px; transform: scale(.78); transform-origin: top right; opacity: .46; }
}
@media (max-width: 520px) {
  .radio-hero { min-height: 322px; padding: 18px; align-items: flex-start; }
  .radio-stage { right: -56px; top: 62px; transform: scale(.66); opacity: .38; }
  .radio-copy { width: 100%; }
  .radio-copy > p { max-width: 76%; }
  .radio-source { min-width: 0; max-width: 94%; }
  .radio-tracks { padding: 12px; }
}
</style>
