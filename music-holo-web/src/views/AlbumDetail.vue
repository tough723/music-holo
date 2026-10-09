<template>
  <div v-loading="loading" class="album-detail-page">
    <div class="detail-back">
      <el-button text @click="router.push('/albums')"><el-icon><ArrowLeft /></el-icon> 返回专辑库</el-button>
    </div>

    <section v-if="album" class="album-header glass-panel">
      <div class="album-cover"><Cover :src="album.cover" :text="album.album" :size="190" /></div>
      <div class="album-copy">
        <div class="eyebrow"><el-icon><Disc /></el-icon> ALBUM · HOLO RELEASE</div>
        <div class="album-title">{{ album.album }}</div>
        <div class="album-artist"><el-icon><User /></el-icon>{{ album.singerName || '未知歌手' }}</div>
        <div class="album-stats">
          <span>{{ album.songCount }} 首歌曲</span>
          <span>{{ formatCount(album.playCount) }} 次曲库累计播放</span>
        </div>
        <div class="album-actions">
          <el-button type="primary" round :disabled="songs.length === 0" @click="playAll">
            <el-icon><VideoPlay /></el-icon> 播放专辑
          </el-button>
          <el-button round :disabled="songs.length === 0" @click="addAllToQueue">
            <el-icon><Plus /></el-icon> 加入队列
          </el-button>
          <el-button v-if="sourceSong" round plain @click="openRadio">
            <el-icon><Headset /></el-icon> 听相似电台
          </el-button>
        </div>
      </div>
      <div class="album-projector">
        <HoloProjector
          :cover="playerStore.currentSong?.cover || album.cover"
          :anonymous-cover="Boolean(playerStore.currentSong?.isCustomSource)"
          :title="playerStore.currentSong?.title || album.album"
          :singer="playerStore.currentSong?.singerName || album.singerName"
          :playing="playerStore.playing"
          :size="148"
          show-caption
        />
      </div>
    </section>

    <section v-if="album" class="album-tracks glass-panel">
      <div class="section-head">
        <div>
          <div class="section-title">专辑曲目</div>
          <div class="section-subtitle">按曲库收录顺序排列 · 点击曲目即可播放</div>
        </div>
        <el-tag effect="plain" round>{{ songs.length }} 首</el-tag>
      </div>
      <SongList
        :songs="songs"
        :favorite-ids="favoriteIds"
        show-album
        @play="playSong"
        @toggle-favorite="toggleFavorite"
        @add-queue="addToQueue"
      />
      <el-empty v-if="!loading && songs.length === 0" description="这张专辑暂时没有可播放曲目" :image-size="100" />
    </section>

    <el-empty v-if="!loading && !album" description="没有找到这张专辑，可能已从曲库移除" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as albumApi from '@/api/album'
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
const album = ref(null)
const songs = ref([])
const favoriteIds = ref([])
const loading = ref(false)
const albumName = computed(() => String(route.query.album || '').trim())
const singerId = computed(() => route.query.singerId ? Number(route.query.singerId) : undefined)
const sourceSong = computed(() => playerStore.currentSong && !playerStore.currentSong.isLocal && !playerStore.currentSong.isCustomSource ? playerStore.currentSong : null)
let requestId = 0

const formatCount = (value) => new Intl.NumberFormat('zh-CN').format(Number(value || 0))

async function loadAlbum() {
  const currentRequest = ++requestId
  if (!albumName.value) {
    album.value = null
    songs.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const [detail, tracks] = await Promise.all([
      albumApi.detail(albumName.value, singerId.value),
      albumApi.songs(albumName.value, singerId.value)
    ])
    if (currentRequest !== requestId) return
    album.value = detail
    songs.value = tracks || []
  } catch {
    if (currentRequest === requestId) {
      album.value = null
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

function playAll() {
  if (songs.value.length) playerStore.playAll(songs.value, songs.value[0].id)
}
function playSong(song) {
  if (songs.value.length) playerStore.playAll(songs.value, song.id)
}
function addAllToQueue() {
  let added = 0
  songs.value.forEach((song) => {
    if (!playerStore.queue.some((queued) => queued.id === song.id)) added += 1
    playerStore.addToQueue(song)
  })
  ElMessage.success(added ? `已将 ${added} 首歌曲加入播放队列` : '专辑曲目已在播放队列中')
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
function openRadio() {
  if (sourceSong.value) router.push({ path: '/radio', query: { sourceId: sourceSong.value.id } })
}

watch(() => [route.query.album, route.query.singerId], loadAlbum, { immediate: true })
onMounted(loadFavorites)
</script>

<style scoped>
.album-detail-page { display: flex; flex-direction: column; gap: 14px; }
.detail-back { margin: -4px 0 -4px -8px; }
.album-header {
  position: relative; min-height: 240px; padding: 25px 30px; display: flex; align-items: center; gap: 24px; overflow: hidden;
  background: radial-gradient(ellipse at 80% 40%, color-mix(in srgb, var(--holo-primary) 17%, transparent), transparent 42%);
}
.album-cover { position: relative; z-index: 1; width: 190px; height: 190px; flex: 0 0 190px; border-radius: 14px; overflow: hidden; box-shadow: 0 18px 34px rgba(0,0,0,.34), 0 0 24px color-mix(in srgb,var(--holo-primary) 28%,transparent); transform: perspective(700px) rotateY(7deg) rotateX(2deg) translateZ(12px); }
.album-copy { position: relative; z-index: 1; min-width: 0; flex: 1; }
.eyebrow { display: flex; align-items: center; gap: 7px; color: var(--holo-primary); font-size: 10px; letter-spacing: 1.8px; }
.album-title { margin-top: 12px; overflow-wrap: anywhere; font-size: clamp(23px,3vw,34px); font-weight: 700; letter-spacing: .5px; }
.album-artist { display: flex; align-items: center; gap: 7px; margin-top: 10px; color: var(--text-main); font-size: 14px; }
.album-stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; color: var(--text-sub); font-size: 11px; }
.album-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.album-projector { position: relative; z-index: 1; flex: 0 0 155px; display: flex; justify-content: center; transform: perspective(600px) rotateY(-8deg); }
.album-tracks { padding: 20px; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.section-title { font-size: 17px; font-weight: 650; }
.section-subtitle { margin-top: 4px; color: var(--text-sub); font-size: 11px; }
@media (max-width: 800px) {
  .album-header { gap: 18px; padding: 20px; }
  .album-cover { width: 150px; height: 150px; flex-basis: 150px; }
  .album-projector { flex-basis: 120px; transform: scale(.84); }
}
@media (max-width: 600px) {
  .album-header { align-items: flex-start; flex-wrap: wrap; gap: 14px; padding: 16px; }
  .album-cover { width: 112px; height: 112px; flex-basis: 112px; }
  .album-copy { flex-basis: calc(100% - 130px); }
  .album-projector { display: none; }
  .album-actions :deep(.el-button) { margin-left: 0; }
  .album-tracks { padding: 12px; }
}
</style>
