<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">歌单</div>
        <div class="page-subtitle">每一张歌单都是一场全息演出</div>
      </div>
      <div class="page-tools">
        <el-input
          v-model="keyword"
          placeholder="搜索歌单"
          clearable
          style="width: 220px"
          :prefix-icon="Search"
          @clear="loadData"
          @keyup.enter="loadData"
        />
        <el-checkbox v-if="userStore.isLogin" v-model="onlyMine" @change="loadData">只看我的</el-checkbox>
      </div>
    </div>

    <div v-loading="loading" class="playlist-grid">
      <div
        v-for="pl in list"
        :key="pl.id"
        class="playlist-card glass-panel"
        @click="$router.push(`/playlists/${pl.id}`)"
      >
        <div class="playlist-cover">
          <Cover :src="pl.cover" :text="pl.name" :size="140" />
          <div class="playlist-mask">
            <el-icon><VideoPlay /></el-icon>
          </div>
          <div class="playlist-count">
            <el-icon><Headset /></el-icon> {{ pl.songCount || 0 }} 首
          </div>
        </div>
        <div class="playlist-name">{{ pl.name }}</div>
        <div class="playlist-desc">{{ pl.description || '暂无描述' }}</div>
        <div class="playlist-meta">
          <span>{{ pl.creatorName || '神秘人' }}</span>
          <el-tag v-if="pl.isPublic === 0" size="small" type="warning" effect="plain">私密</el-tag>
        </div>
      </div>
      <el-empty v-if="!loading && list.length === 0" description="没有找到相关歌单" />
    </div>

    <div class="pagination-wrap">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[12, 24, 48]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="loadData"
        @size-change="loadData"
      />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import * as playlistApi from '@/api/playlist'
import { useUserStore } from '@/store/user'
import Cover from '@/components/Cover.vue'

const userStore = useUserStore()

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(12)
const keyword = ref('')
const onlyMine = ref(false)

const loadData = async () => {
  loading.value = true
  try {
    const res = await playlistApi.page({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      onlyMine: onlyMine.value || undefined
    })
    list.value = res.records || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.page-tools {
  display: flex;
  align-items: center;
  gap: 14px;
}
.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  min-height: 200px;
}
.playlist-card {
  padding: 14px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.playlist-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px var(--holo-glow);
}
.playlist-cover {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
}
.playlist-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  color: #fff;
  background: rgba(5, 8, 22, 0.45);
  opacity: 0;
  transition: opacity 0.2s;
}
.playlist-card:hover .playlist-mask {
  opacity: 1;
}
.playlist-count {
  position: absolute;
  right: 8px;
  bottom: 8px;
  font-size: 11px;
  color: #fff;
  background: rgba(5, 8, 22, 0.6);
  border-radius: 999px;
  padding: 2px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.playlist-name {
  margin-top: 10px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.playlist-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.playlist-meta {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-sub);
}
.pagination-wrap {
  display: flex;
  justify-content: center;
}
</style>
