<template>
  <div class="albums-page">
    <section class="albums-hero glass-panel">
      <div class="hero-copy">
        <div class="eyebrow"><el-icon><Disc /></el-icon> HOLO ALBUMS · CURATED RELEASES</div>
        <h1>每张专辑，都是一座声音星系</h1>
        <p>从一张封面进入完整曲目，让音乐以专辑的方式被发现。</p>
        <div class="hero-meta">
          <span><el-icon><Collection /></el-icon> 曲库专辑 {{ total }} 张</span>
          <span>以现有歌曲资料聚合 · 不依赖外部曲库</span>
        </div>
      </div>
      <div class="hero-disc" aria-hidden="true">
        <div class="hero-disc__orbit"></div>
        <div class="hero-disc__ring"></div>
        <div class="hero-disc__core"><el-icon><Disc /></el-icon></div>
        <div class="hero-disc__beam"></div>
      </div>
      <div class="albums-search">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索专辑或歌手"
          aria-label="搜索专辑或歌手"
          @keyup.enter="searchAlbums"
          @clear="searchAlbums"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" @click="searchAlbums">搜索</el-button>
      </div>
    </section>

    <section class="albums-section">
      <div class="section-heading">
        <div>
          <div class="section-title">专辑库</div>
          <div class="section-subtitle">按曲库收录热度排列 · 点击封面查看曲目</div>
        </div>
        <el-tag effect="plain" round>{{ total }} 张专辑</el-tag>
      </div>

      <div v-loading="loading" class="album-grid">
        <button
          v-for="album in albums"
          :key="`${album.singerId ?? 'unknown'}-${album.album}`"
          type="button"
          class="album-card glass-panel"
          :aria-label="`查看《${album.album}》专辑，${album.singerName || '未知歌手'}，${album.songCount} 首歌曲`"
          @click="openAlbum(album)"
        >
          <div class="album-art">
            <Cover :src="album.cover" :text="album.album" :size="170" />
            <div class="album-art__frame"></div>
            <div class="album-art__play"><el-icon><VideoPlay /></el-icon></div>
            <span class="album-count">{{ album.songCount }} 首</span>
          </div>
          <div class="album-name" :title="album.album">{{ album.album }}</div>
          <div class="album-artist">{{ album.singerName || '未知歌手' }}</div>
          <div class="album-card-meta">
            <span><el-icon><Headset /></el-icon>{{ formatCount(album.playCount) }} 次播放</span>
            <span class="album-open">进入专辑 <el-icon><ArrowRight /></el-icon></span>
          </div>
        </button>
        <el-empty v-if="!loading && albums.length === 0" description="还没有匹配的专辑" />
      </div>

      <div v-if="total > pageSize" class="pagination-wrap">
        <el-pagination
          v-model:current-page="pageNum"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="loadAlbums"
        />
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as albumApi from '@/api/album'
import Cover from '@/components/Cover.vue'

const router = useRouter()
const albums = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = 12
const keyword = ref('')
const loading = ref(false)

const formatCount = (value) => new Intl.NumberFormat('zh-CN').format(Number(value || 0))

async function loadAlbums() {
  loading.value = true
  try {
    const result = await albumApi.page({ pageNum: pageNum.value, pageSize, keyword: keyword.value.trim() || undefined })
    albums.value = result.records || []
    total.value = result.total || 0
  } catch {
    if (albums.value.length === 0) total.value = 0
  } finally {
    loading.value = false
  }
}

function searchAlbums() {
  pageNum.value = 1
  loadAlbums()
}

function openAlbum(album) {
  router.push({
    name: 'AlbumDetail',
    query: {
      album: album.album,
      ...(album.singerId ? { singerId: album.singerId } : {})
    }
  })
}

onMounted(loadAlbums)
</script>

<style scoped>
.albums-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.albums-hero {
  position: relative;
  min-height: 214px;
  padding: 28px 32px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background:
    radial-gradient(ellipse at 82% 42%, color-mix(in srgb, var(--holo-primary) 19%, transparent), transparent 40%),
    linear-gradient(115deg, color-mix(in srgb, var(--holo-secondary) 7%, transparent), transparent 64%);
}
.hero-copy { position: relative; z-index: 2; max-width: 650px; }
.eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--holo-primary);
  font-size: 10px;
  letter-spacing: 2px;
}
h1 { margin: 14px 0 8px; font-size: clamp(24px, 3vw, 34px); letter-spacing: 1px; }
.hero-copy p { margin: 0; color: var(--text-sub); font-size: 13px; }
.hero-meta { display: flex; align-items: center; gap: 18px; margin-top: 18px; color: var(--text-sub); font-size: 11px; }
.hero-meta span:first-child { display: inline-flex; align-items: center; gap: 6px; color: var(--text-main); }
.hero-disc { position: absolute; right: 32px; top: 13px; width: 190px; height: 190px; perspective: 700px; transform-style: preserve-3d; }
.hero-disc__ring, .hero-disc__core, .hero-disc__orbit, .hero-disc__beam { position: absolute; }
.hero-disc__ring {
  inset: 20px; border: 1px solid color-mix(in srgb, var(--holo-primary) 72%, white); border-radius: 50%;
  background: repeating-radial-gradient(circle, rgba(255,255,255,.09) 0 1px, transparent 2px 8px), radial-gradient(circle, color-mix(in srgb, var(--holo-primary) 32%, transparent), rgba(7,11,28,.12) 65%);
  box-shadow: 0 0 28px var(--holo-glow), inset 0 0 24px color-mix(in srgb, var(--holo-secondary) 32%, transparent);
  transform: rotateX(64deg) rotateZ(-16deg) translateZ(12px);
  animation: album-disc-spin 18s linear infinite;
}
.hero-disc__core { inset: 62px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.35); border-radius: 50%; color: white; font-size: 26px; background: radial-gradient(circle at 35% 28%, #fff, var(--holo-primary) 16%, var(--holo-secondary) 56%, #10152d 72%); transform: translateZ(22px); box-shadow: 0 0 25px var(--holo-glow); }
.hero-disc__orbit { inset: 4px 32px; border: 1px solid color-mix(in srgb, var(--holo-secondary) 60%, transparent); border-radius: 50%; transform: rotateX(72deg) rotateZ(35deg); }
.hero-disc__beam { left: 50%; top: 9px; width: 110px; height: 150px; clip-path: polygon(50% 0,100% 100%,0 100%); transform: translateX(-50%) translateZ(-24px); background: linear-gradient(180deg, color-mix(in srgb, var(--holo-primary) 22%, transparent), transparent 76%); }
.albums-search { position: absolute; z-index: 2; right: 30px; bottom: 25px; display: flex; gap: 8px; width: min(340px, 40%); }
.albums-search :deep(.el-input__wrapper) { background: rgba(7,11,28,.5); border-radius: 999px; }
.albums-search :deep(.el-button) { border-radius: 999px; }
.albums-section { display: flex; flex-direction: column; gap: 14px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-title { font-size: 18px; font-weight: 650; }
.section-subtitle { margin-top: 4px; color: var(--text-sub); font-size: 11px; }
.album-grid { min-height: 180px; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 16px; }
.album-card {
  min-width: 0; padding: 12px; border: 1px solid rgba(148,163,184,.12); color: var(--text-main); text-align: left; cursor: pointer;
  transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease; transform-style: preserve-3d;
}
.album-card:hover { transform: perspective(900px) translateY(-4px) rotateX(1deg) translateZ(7px); border-color: color-mix(in srgb, var(--holo-primary) 40%, transparent); box-shadow: 0 16px 28px -20px var(--holo-glow), 0 6px 16px rgba(0,0,0,.18); }
.album-card:focus-visible { outline: 2px solid var(--holo-primary); outline-offset: 3px; }
.album-art { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: 12px; background: rgba(8,14,34,.8); box-shadow: 0 12px 20px rgba(0,0,0,.24); }
.album-art :deep(.cover) { width: 100% !important; height: 100% !important; }
.album-art__frame { position: absolute; inset: 8px; border: 1px solid rgba(255,255,255,.24); border-radius: 9px; pointer-events: none; box-shadow: inset 0 0 24px rgba(255,255,255,.06); }
.album-art__play { position: absolute; right: 12px; bottom: 12px; width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.45); border-radius: 50%; color: white; background: color-mix(in srgb, var(--holo-primary) 76%, #0b1225); box-shadow: 0 0 18px var(--holo-glow); opacity: 0; transform: translateY(4px) scale(.92); transition: .18s ease; }
.album-card:hover .album-art__play, .album-card:focus-visible .album-art__play { opacity: 1; transform: none; }
.album-count { position: absolute; left: 10px; bottom: 12px; padding: 3px 8px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; color: white; background: rgba(5,8,22,.66); font-size: 10px; backdrop-filter: blur(10px); }
.album-name { margin-top: 12px; overflow: hidden; color: var(--text-main); font-size: 14px; font-weight: 650; white-space: nowrap; text-overflow: ellipsis; }
.album-artist { margin-top: 4px; overflow: hidden; color: var(--text-sub); font-size: 12px; white-space: nowrap; text-overflow: ellipsis; }
.album-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 12px; color: var(--text-sub); font-size: 10px; }
.album-card-meta > span { display: inline-flex; align-items: center; gap: 5px; }
.album-open { color: var(--holo-primary); }
.pagination-wrap { display: flex; justify-content: center; }
@keyframes album-disc-spin { to { transform: rotateX(64deg) rotateZ(344deg) translateZ(12px); } }
@media (max-width: 800px) {
  .albums-hero { padding: 22px; min-height: 250px; align-items: flex-start; }
  .hero-disc { right: 12px; top: 22px; width: 150px; height: 150px; opacity: .7; }
  .albums-search { left: 22px; right: 22px; bottom: 18px; width: auto; }
  .hero-copy { max-width: calc(100% - 100px); }
  .hero-meta { flex-wrap: wrap; gap: 8px 14px; }
}
@media (max-width: 520px) {
  .albums-hero { min-height: 266px; padding: 18px; }
  .hero-disc { right: -18px; top: 58px; width: 128px; height: 128px; opacity: .48; }
  .hero-copy { max-width: 100%; }
  .hero-meta span:last-child { display: none; }
  .albums-search { left: 18px; right: 18px; }
  .album-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .album-card { padding: 8px; }
  .album-card-meta { flex-wrap: wrap; }
}
</style>
