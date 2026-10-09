<template>
  <section class="dislike-settings" aria-label="不喜欢规则">
    <article class="setting-card glass-panel">
      <div class="setting-card-head">
        <div class="setting-symbol"><el-icon><CircleClose /></el-icon></div>
        <div class="setting-copy">
          <h2>不喜欢的歌曲和歌手</h2>
          <p>自动下一首、每日推荐和相似电台会跳过这些规则。搜索、排行榜、管理后台和手动点播仍然可见，也不会删除曲库。</p>
        </div>
      </div>
      <div class="rule-counts">
        <span>歌曲 {{ dislikeStore.songs.length }} / {{ dislikeStore.songLimit }}</span>
        <span>歌手 {{ dislikeStore.singers.length }} / {{ dislikeStore.singerLimit }}</span>
      </div>
      <p v-if="loadError" class="load-error" role="alert">
        {{ loadError }}
        <el-button text type="primary" :disabled="loading" @click="load">重试</el-button>
      </p>
    </article>

    <article v-loading="loading" class="setting-card glass-panel">
      <div class="setting-card-head">
        <div class="setting-copy">
          <h2>歌曲</h2>
          <p>只跳过这一首。同一歌手的其他歌曲不受影响。</p>
        </div>
      </div>
      <ul v-if="dislikeStore.songs.length" class="rule-list">
        <li v-for="song in dislikeStore.songs" :key="`song-${song.id}`">
          <div class="rule-copy">
            <strong>{{ song.title }}</strong>
            <span>{{ song.singerName || '未知歌手' }}</span>
          </div>
          <el-button size="small" :aria-label="`取消不喜欢《${song.title}》`" :data-testid="`revoke-dislike-song-${song.id}`" @click="removeSong(song)">撤销</el-button>
        </li>
      </ul>
      <p v-else class="empty-copy">还没有不喜欢的歌曲。</p>
    </article>

    <article class="setting-card glass-panel">
      <div class="setting-card-head">
        <div class="setting-copy">
          <h2>歌手</h2>
          <p>跳过这位歌手的全部曲库歌曲。撤销后，单独屏蔽的歌曲仍然有效。</p>
        </div>
      </div>
      <ul v-if="dislikeStore.singers.length" class="rule-list">
        <li v-for="singer in dislikeStore.singers" :key="`singer-${singer.id}`">
          <div class="rule-copy">
            <strong>{{ singer.name }}</strong>
            <span>{{ singer.region || '歌手' }}</span>
          </div>
          <el-button size="small" :aria-label="`取消不喜欢歌手${singer.name}`" :data-testid="`revoke-dislike-singer-${singer.id}`" @click="removeSinger(singer)">撤销</el-button>
        </li>
      </ul>
      <p v-else class="empty-copy">还没有不喜欢的歌手。</p>
      <p v-if="!dislikeStore.songs.length && !dislikeStore.singers.length" class="empty-summary">还没有不喜欢的歌曲或歌手</p>
    </article>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useDislikeStore } from '@/store/dislike'

const dislikeStore = useDislikeStore()
const loading = ref(false)
const loadError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    await dislikeStore.load()
  } catch {
    loadError.value = '暂时无法加载不喜欢规则'
  } finally {
    loading.value = false
  }
}

async function removeSong(song) {
  try {
    await dislikeStore.removeSong(song.id)
    ElMessage.success(`已取消不喜欢《${song.title}》`)
  } catch { /* 拦截器已提示 */ }
}

async function removeSinger(singer) {
  try {
    await dislikeStore.removeSinger(singer.id)
    ElMessage.success(`已取消不喜欢歌手${singer.name}`)
  } catch { /* 拦截器已提示 */ }
}

onMounted(load)
</script>

<style scoped>
.dislike-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.setting-card {
  padding: 22px 24px;
}
.setting-card-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.setting-symbol {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: var(--holo-primary);
  background: color-mix(in srgb, var(--holo-primary) 12%, transparent);
  flex-shrink: 0;
}
.setting-copy h2 {
  margin: 0 0 6px;
  font-size: 16px;
}
.setting-copy p,
.empty-copy,
.empty-summary,
.rule-counts,
.rule-copy span {
  margin: 0;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.6;
}
.rule-counts {
  display: flex;
  gap: 16px;
  margin-top: 14px;
}
.rule-list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rule-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--holo-primary) 6%, transparent);
}
.rule-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rule-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.load-error,
.empty-summary {
  margin-top: 12px;
}
</style>
