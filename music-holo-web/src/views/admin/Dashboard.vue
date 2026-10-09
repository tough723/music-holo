<template>
  <div class="page" v-loading="loading">
    <div class="page-head">
      <div>
        <div class="page-title">仪表盘</div>
        <div class="page-subtitle">平台运营数据总览</div>
      </div>
      <el-button round @click="loadData">
        <el-icon><Refresh /></el-icon> 刷新
      </el-button>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-grid">
      <div class="stat-card glass-panel">
        <div class="stat-icon" style="color: #22d3ee"><el-icon><User /></el-icon></div>
        <div class="stat-info">
          <div class="stat-num holo-text">{{ stats.userCount ?? 0 }}</div>
          <div class="stat-label">注册用户</div>
        </div>
      </div>
      <div class="stat-card glass-panel">
        <div class="stat-icon" style="color: #f472b6"><el-icon><Microphone /></el-icon></div>
        <div class="stat-info">
          <div class="stat-num holo-text">{{ stats.singerCount ?? 0 }}</div>
          <div class="stat-label">入驻歌手</div>
        </div>
      </div>
      <div class="stat-card glass-panel">
        <div class="stat-icon" style="color: #fbbf24"><el-icon><Headset /></el-icon></div>
        <div class="stat-info">
          <div class="stat-num holo-text">{{ stats.songCount ?? 0 }}</div>
          <div class="stat-label">歌曲总数</div>
        </div>
      </div>
      <div class="stat-card glass-panel">
        <div class="stat-icon" style="color: #a3e635"><el-icon><Collection /></el-icon></div>
        <div class="stat-info">
          <div class="stat-num holo-text">{{ stats.playlistCount ?? 0 }}</div>
          <div class="stat-label">歌单总数</div>
        </div>
      </div>
      <div class="stat-card glass-panel">
        <div class="stat-icon" style="color: #c084fc"><el-icon><CaretRight /></el-icon></div>
        <div class="stat-info">
          <div class="stat-num holo-text">{{ fmtCount(stats.totalPlayCount) }}</div>
          <div class="stat-label">累计播放</div>
        </div>
      </div>
    </div>

    <!-- 图表 -->
    <div class="chart-grid">
      <div class="chart-card glass-panel">
        <div class="chart-title">各分类歌曲数量</div>
        <div ref="categoryChartRef" class="chart"></div>
      </div>
      <div class="chart-card glass-panel">
        <div class="chart-title">歌手播放量分布</div>
        <div ref="playChartRef" class="chart"></div>
      </div>
      <div class="chart-card glass-panel">
        <div class="chart-title">歌手歌曲数量 Top10</div>
        <div ref="singerChartRef" class="chart"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as echarts from 'echarts'
import * as commonApi from '@/api/common'
import { fmtCount } from '@/utils/format'

const loading = ref(false)
const stats = ref({})

const categoryChartRef = ref(null)
const playChartRef = ref(null)
const singerChartRef = ref(null)
let charts = []

const chartTheme = () => ({
  textColor: '#94a3b8',
  colors: ['#22d3ee', '#818cf8', '#f472b6', '#fbbf24', '#a3e635', '#34d399', '#60a5fa', '#c084fc']
})

const renderCharts = () => {
  const { colors } = chartTheme()

  if (categoryChartRef.value) {
    const chart = echarts.init(categoryChartRef.value)
    chart.setOption({
      color: colors,
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 30, bottom: 40 },
      xAxis: {
        type: 'category',
        data: (stats.value.categoryStats || []).map((x) => x.name),
        axisLabel: { color: '#94a3b8' }
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(148,163,184,.15)' } } },
      series: [{
        type: 'bar',
        data: (stats.value.categoryStats || []).map((x) => x.value),
        barWidth: '45%',
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#22d3ee' },
            { offset: 1, color: '#818cf8' }
          ])
        }
      }]
    })
    charts.push(chart)
  }

  if (playChartRef.value) {
    const chart = echarts.init(playChartRef.value)
    chart.setOption({
      color: colors,
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: '#94a3b8' } },
      series: [{
        type: 'pie',
        radius: ['38%', '68%'],
        center: ['50%', '45%'],
        itemStyle: { borderColor: '#0d1430', borderWidth: 2 },
        label: { color: '#94a3b8' },
        data: (stats.value.playStats || []).map((x) => ({ name: x.name, value: x.value }))
      }]
    })
    charts.push(chart)
  }

  if (singerChartRef.value) {
    const chart = echarts.init(singerChartRef.value)
    const data = stats.value.singerStats || []
    chart.setOption({
      color: colors,
      tooltip: { trigger: 'axis' },
      grid: { left: 90, right: 30, top: 20, bottom: 30 },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(148,163,184,.15)' } } },
      yAxis: {
        type: 'category',
        data: data.map((x) => x.name).reverse(),
        axisLabel: { color: '#94a3b8' }
      },
      series: [{
        type: 'bar',
        data: data.map((x) => x.value).reverse(),
        barWidth: '50%',
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#f472b6' },
            { offset: 1, color: '#c084fc' }
          ])
        }
      }]
    })
    charts.push(chart)
  }
}

const loadData = async () => {
  loading.value = true
  try {
    stats.value = await commonApi.stats()
    charts.forEach((c) => c.dispose())
    charts = []
    // 等 DOM 更新后再渲染图表
    await new Promise((r) => setTimeout(r, 50))
    renderCharts()
  } finally {
    loading.value = false
  }
}

const onResize = () => charts.forEach((c) => c.resize())

onMounted(() => {
  loadData()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  charts.forEach((c) => c.dispose())
  charts = []
})
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
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 16px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 22px;
}
.stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  background: rgba(148, 163, 184, 0.1);
}
.stat-num {
  font-size: 26px;
  font-weight: 700;
}
.stat-label {
  font-size: 12px;
  color: var(--text-sub);
  margin-top: 2px;
}
.chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 16px;
}
.chart-card {
  padding: 20px;
}
.chart-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}
.chart {
  width: 100%;
  height: 320px;
}
</style>
