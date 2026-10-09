<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">歌手</div>
        <div class="page-subtitle">探索全息舞台上的声音</div>
      </div>
      <div class="page-tools">
        <el-input
          v-model="keyword"
          placeholder="搜索歌手"
          clearable
          style="width: 220px"
          :prefix-icon="Search"
          @clear="loadData"
          @keyup.enter="loadData"
        />
        <el-select v-model="gender" placeholder="性别" clearable style="width: 110px" @change="loadData">
          <el-option label="男" :value="1" />
          <el-option label="女" :value="2" />
        </el-select>
        <el-select v-model="region" placeholder="地区" clearable style="width: 110px" @change="loadData">
          <el-option v-for="r in regions" :key="r" :label="r" :value="r" />
        </el-select>
      </div>
    </div>

    <div v-loading="loading" class="singer-grid">
      <div
        v-for="singer in list"
        :key="singer.id"
        class="singer-card glass-panel"
        @click="$router.push(`/singers/${singer.id}`)"
      >
        <div class="singer-avatar">
          <Cover :src="singer.avatar" :text="singer.name" :size="96" />
        </div>
        <div class="singer-name">{{ singer.name }}</div>
        <div class="singer-tags">
          <el-tag size="small" effect="plain">{{ genderText(singer.gender) }}</el-tag>
          <el-tag size="small" effect="plain" type="info">{{ singer.region || '未知地区' }}</el-tag>
        </div>
        <div class="singer-intro">{{ singer.intro || '暂无简介' }}</div>
        <div class="singer-count">
          <el-icon><Headset /></el-icon> {{ singer.songCount || 0 }} 首歌曲
        </div>
      </div>
      <el-empty v-if="!loading && list.length === 0" description="没有找到相关歌手" />
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
import * as singerApi from '@/api/singer'
import Cover from '@/components/Cover.vue'

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(12)
const keyword = ref('')
const gender = ref(null)
const region = ref('')

const regions = ['内地', '港台', '欧美', '日韩']
const genderText = (g) => ({ 0: '保密', 1: '男', 2: '女' })[g] || '保密'

const loadData = async () => {
  loading.value = true
  try {
    const res = await singerApi.page({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      gender: gender.value ?? undefined,
      region: region.value || undefined
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
  gap: 10px;
}
.singer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 16px;
  min-height: 200px;
}
.singer-card {
  padding: 24px 16px 18px;
  text-align: center;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.singer-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px var(--holo-glow);
}
.singer-avatar {
  width: 96px;
  height: 96px;
  margin: 0 auto;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, var(--holo-primary) 50%, transparent);
  box-shadow: 0 0 22px var(--holo-glow);
}
.singer-name {
  margin-top: 14px;
  font-size: 16px;
  font-weight: 600;
}
.singer-tags {
  margin-top: 8px;
  display: flex;
  justify-content: center;
  gap: 6px;
}
.singer-intro {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-sub);
  line-height: 1.7;
  height: 40px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.singer-count {
  margin-top: 10px;
  font-size: 12px;
  color: var(--holo-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.pagination-wrap {
  display: flex;
  justify-content: center;
}
</style>
