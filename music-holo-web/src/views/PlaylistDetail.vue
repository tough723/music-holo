<template>
  <div class="page" v-loading="loading">
    <!-- 歌单信息头 -->
    <div class="playlist-header glass-panel" v-if="playlist">
      <div class="playlist-cover">
        <Cover :src="playlist.cover" :text="playlist.name" :size="130" />
      </div>
      <div class="playlist-info">
        <div class="playlist-name">
          {{ playlist.name }}
          <el-tag v-if="playlist.isPublic === 0" size="small" type="warning" effect="plain">私密</el-tag>
        </div>
        <div class="playlist-desc">{{ playlist.description || '这位创建者很神秘，什么都没有留下～' }}</div>
        <div class="playlist-meta">
          <span><el-icon><User /></el-icon> {{ playlist.creatorName || '神秘人' }}</span>
          <span><el-icon><Headset /></el-icon> {{ playlist.songCount || 0 }} 首歌曲</span>
          <span><el-icon><CaretRight /></el-icon> {{ fmtCount(playlist.playCount) }} 次播放</span>
        </div>
        <div class="playlist-actions">
          <el-button type="primary" round :disabled="songs.length === 0" @click="playAll">
            <el-icon><VideoPlay /></el-icon> 播放全部
          </el-button>
          <el-button round :disabled="songs.length === 0" @click="addAllToQueue">
            <el-icon><Plus /></el-icon> 加入队列
          </el-button>
          <el-button v-if="isPublicPlaylist" round plain @click="sharePlaylist">
            <el-icon><Share /></el-icon> 分享歌单
          </el-button>
          <template v-if="canManage">
            <el-button round @click="openEdit">
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-button round type="danger" plain @click="onDelete">
              <el-icon><Delete /></el-icon> 删除
            </el-button>
          </template>
        </div>
      </div>
      <div class="playlist-holo">
        <HoloProjector
          :cover="playerStore.currentSong?.cover"
          :anonymous-cover="Boolean(playerStore.currentSong?.isCustomSource)"
          :title="playerStore.currentSong?.title || playlist.name"
          :playing="playerStore.playing"
          :size="150"
        />
      </div>
    </div>

    <!-- 歌曲列表 -->
    <div class="section-head">
      <div>
        <div class="section-title">歌曲列表</div>
        <div class="section-subtitle">点击播放，收藏喜欢的歌曲</div>
      </div>
      <el-button v-if="canManage" type="primary" plain round size="small" @click="openAddSongs">
        <el-icon><Plus /></el-icon> 添加歌曲
      </el-button>
    </div>
    <SongList
      :songs="songs"
      :favorite-ids="favoriteIds"
      show-album
      @play="onPlay"
      @toggle-favorite="onToggleFavorite"
      @add-queue="onAddQueue"
    >
      <template #actions="{ row }">
        <el-tooltip v-if="canManage" content="从歌单移除" placement="top">
          <el-button circle size="small" type="danger" plain @click.stop="onRemoveSong(row)">
            <el-icon><Remove /></el-icon>
          </el-button>
        </el-tooltip>
      </template>
    </SongList>

    <ReviewPanel
      v-if="playlist"
      target-type="playlist"
      :target-id="playlist.id"
      :target-title="playlist.name"
    />

    <!-- 编辑歌单对话框 -->
    <el-dialog v-model="editVisible" :title="editForm.id ? '编辑歌单' : '新建歌单'" width="480px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="歌单名称" required>
          <el-input v-model="editForm.name" placeholder="请输入歌单名称" />
        </el-form-item>
        <el-form-item label="封面">
          <div class="upload-row">
            <el-input v-model="editForm.cover" placeholder="封面地址（可上传）" clearable />
            <el-upload :show-file-list="false" :http-request="onUploadCover" accept="image/*">
              <el-button>上传</el-button>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="3" placeholder="介绍一下这个歌单" />
        </el-form-item>
        <el-form-item label="是否公开">
          <el-radio-group v-model="editForm.isPublic">
            <el-radio :value="1">公开</el-radio>
            <el-radio :value="0">私密</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加歌曲对话框 -->
    <el-dialog v-model="addSongsVisible" title="添加歌曲到歌单" width="720px">
      <div class="add-songs-tools">
        <el-input
          v-model="songKeyword"
          placeholder="搜索歌曲"
          clearable
          style="width: 240px"
          :prefix-icon="Search"
          @clear="loadAllSongs"
          @keyup.enter="loadAllSongs"
        />
      </div>
      <el-table
        ref="songTableRef"
        v-loading="songsLoading"
        :data="allSongs"
        height="380px"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="46" />
        <el-table-column label="歌曲" min-width="220">
          <template #default="{ row }">{{ row.title }}</template>
        </el-table-column>
        <el-table-column label="歌手" width="120">
          <template #default="{ row }">{{ row.singerName }}</template>
        </el-table-column>
        <el-table-column label="分类" width="100">
          <template #default="{ row }">{{ row.categoryName }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="addSongsVisible = false">取消</el-button>
        <el-button type="primary" :loading="adding" :disabled="selectedIds.length === 0" @click="onAddSongs">
          添加选中的 {{ selectedIds.length }} 首
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as playlistApi from '@/api/playlist'
import * as songApi from '@/api/song'
import * as favoriteApi from '@/api/favorite'
import * as commonApi from '@/api/common'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import { fmtCount } from '@/utils/format'
import { buildPublicPlaylistShareUrl, shareOrCopy } from '@/utils/share'
import SongList from '@/components/SongList.vue'
import ReviewPanel from '@/components/ReviewPanel.vue'
import HoloProjector from '@/components/HoloProjector.vue'
import Cover from '@/components/Cover.vue'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const userStore = useUserStore()

const loading = ref(false)
const playlist = ref(null)
const songs = ref([])
const favoriteIds = ref([])

const editVisible = ref(false)
const editForm = ref({ id: null, name: '', cover: '', description: '', isPublic: 1 })
const saving = ref(false)

const addSongsVisible = ref(false)
const allSongs = ref([])
const songsLoading = ref(false)
const songKeyword = ref('')
const selectedIds = ref([])
const adding = ref(false)

const canManage = computed(() => {
  if (!userStore.isLogin || !playlist.value) return false
  return playlist.value.creatorId === userStore.userInfo?.id || userStore.isAdmin
})
const isPublicPlaylist = computed(() => Number(playlist.value?.isPublic) === 1)

const loadData = async () => {
  loading.value = true
  try {
    const id = route.params.id
    const [detail, songList] = await Promise.all([
      playlistApi.detail(id),
      playlistApi.songsOfPlaylist(id)
    ])
    playlist.value = detail
    songs.value = songList || []
  } finally {
    loading.value = false
  }
  if (userStore.isLogin) {
    try {
      favoriteIds.value = await favoriteApi.ids()
    } catch (e) { /* ignore */ }
  }
}

const playAll = () => {
  if (songs.value.length === 0) return
  playerStore.playAll(songs.value, songs.value[0].id)
}

const addAllToQueue = () => {
  songs.value.forEach((s) => playerStore.addToQueue(s))
  ElMessage.success(`已将 ${songs.value.length} 首歌曲加入播放队列`)
}

const sharePlaylist = async () => {
  const url = buildPublicPlaylistShareUrl(playlist.value, router, window.location.origin)
  if (!url) {
    ElMessage.warning('仅公开歌单可以分享')
    return
  }
  try {
    const result = await shareOrCopy({
      title: playlist.value.name,
      text: `来听听我分享的歌单「${playlist.value.name}」`,
      url
    })
    if (result === 'shared') ElMessage.success('已打开系统分享')
    else if (result === 'copied') ElMessage.success('歌单链接已复制')
  } catch (error) {
    ElMessage.error('无法自动复制，请手动复制地址栏链接')
  }
}

const onPlay = (song) => {
  playerStore.playAll(songs.value, song.id)
}

const onToggleFavorite = async (song) => {
  if (!userStore.isLogin) {
    ElMessage.warning('请先登录后再收藏')
    router.push('/login')
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
  } catch (e) { /* 拦截器已提示 */ }
}

const onAddQueue = (song) => {
  playerStore.addToQueue(song)
  ElMessage.success(`已加入播放队列：《${song.title}》`)
}

// ---------- 歌单管理 ----------
const openEdit = () => {
  editForm.value = {
    id: playlist.value.id,
    name: playlist.value.name,
    cover: playlist.value.cover || '',
    description: playlist.value.description || '',
    isPublic: playlist.value.isPublic ?? 1
  }
  editVisible.value = true
}

const onUploadCover = async ({ file }) => {
  const res = await commonApi.upload(file)
  editForm.value.cover = res.url
  ElMessage.success('封面上传成功')
}

const onSave = async () => {
  if (!editForm.value.name) {
    ElMessage.warning('请输入歌单名称')
    return
  }
  saving.value = true
  try {
    await playlistApi.save(editForm.value)
    ElMessage.success('保存成功')
    editVisible.value = false
    loadData()
  } finally {
    saving.value = false
  }
}

const onDelete = async () => {
  await ElMessageBox.confirm('确定删除该歌单吗？歌单内的歌曲关联也会一并删除。', '提示', { type: 'warning' })
  await playlistApi.remove(playlist.value.id)
  ElMessage.success('歌单已删除')
  router.push('/playlists')
}

const openAddSongs = async () => {
  addSongsVisible.value = true
  songKeyword.value = ''
  await loadAllSongs()
}

const loadAllSongs = async () => {
  songsLoading.value = true
  try {
    const res = await songApi.page({ pageNum: 1, pageSize: 100, keyword: songKeyword.value || undefined })
    allSongs.value = res.records || []
  } finally {
    songsLoading.value = false
  }
}

const onSelectionChange = (rows) => {
  selectedIds.value = rows.map((r) => r.id)
}

const onAddSongs = async () => {
  adding.value = true
  try {
    const added = await playlistApi.addSongs(playlist.value.id, selectedIds.value)
    ElMessage.success(`成功添加 ${added} 首歌曲`)
    addSongsVisible.value = false
    loadData()
  } finally {
    adding.value = false
  }
}

const onRemoveSong = async (song) => {
  await ElMessageBox.confirm(`确定从歌单中移除《${song.title}》吗？`, '提示', { type: 'warning' })
  await playlistApi.removeSong(playlist.value.id, song.id)
  ElMessage.success('已移除')
  loadData()
}

watch(() => route.params.id, () => {
  if (route.params.id) loadData()
})

onMounted(loadData)
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.playlist-header {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 28px 32px;
  position: relative;
  overflow: hidden;
}
.playlist-header::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(500px 260px at 85% 20%, var(--holo-glow), transparent 65%);
  pointer-events: none;
}
.playlist-cover {
  width: 130px;
  height: 130px;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 0 26px var(--holo-glow);
}
.playlist-info {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}
.playlist-name {
  font-size: 26px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
}
.playlist-desc {
  margin-top: 10px;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.8;
  max-width: 560px;
}
.playlist-meta {
  margin-top: 12px;
  display: flex;
  gap: 22px;
  font-size: 12px;
  color: var(--text-sub);
}
.playlist-meta span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.playlist-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
}
.playlist-holo {
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}
.section-title {
  font-size: 20px;
  font-weight: 600;
}
.section-subtitle {
  font-size: 12px;
  color: var(--text-sub);
  margin-top: 4px;
}
.upload-row {
  display: flex;
  gap: 10px;
  width: 100%;
}
.add-songs-tools {
  margin-bottom: 12px;
}
@media (max-width: 900px) {
  .playlist-header {
    flex-wrap: wrap;
  }
  .playlist-holo {
    display: none;
  }
}
</style>
