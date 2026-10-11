<template>
  <div class="integration-panel">
    <el-alert
      v-if="!isDesktop"
      type="info"
      show-icon
      :closable="false"
      title="桌面集成能力只在 Music Holo 桌面客户端中可用"
      description="网页版受浏览器沙箱限制，无法使用系统托盘、全局快捷键、置顶歌词窗、本机 HTTP API 与 music-holo:// 启动参数。"
    />
    <template v-else>
      <div class="integration-row">
        <div class="row-copy">
          <strong>系统托盘</strong>
          <small>在托盘显示当前曲目，并提供播放 / 暂停 / 上下首 / 显示窗口 / 退出。</small>
        </div>
        <el-switch :model-value="config.tray" @change="update({ tray: $event })" />
      </div>

      <div class="integration-row">
        <div class="row-copy">
          <strong>全局快捷键</strong>
          <small>媒体键（播放/暂停、上一首、下一首、停止）默认开启；自定义组合键会占用全局按键，请谨慎设置。</small>
        </div>
        <el-switch :model-value="config.mediaKeys" @change="update({ mediaKeys: $event })" />
      </div>

      <div class="shortcut-grid">
        <div v-for="command in CUSTOMIZABLE" :key="command.key" class="shortcut-row">
          <span class="shortcut-label">{{ command.label }}</span>
          <el-input
            :model-value="custom[command.key] || ''"
            placeholder="未设置（如 Ctrl+Alt+P）"
            class="shortcut-input"
            clearable
            @change="setShortcut(command.key, $event)"
          />
        </div>
      </div>
      <div class="integration-row">
        <div class="row-copy">
          <strong>桌面歌词窗</strong>
          <small>独立置顶窗口显示歌词，可双击切换鼠标穿透；只接收当前曲目与歌词，不接收凭据或音源脚本内容。</small>
        </div>
        <el-switch :model-value="config.lyricWindow" @change="update({ lyricWindow: $event })" />
      </div>
      <div v-if="config.lyricWindow" class="lyric-options">
        <span class="option-label">不透明度</span>
        <el-slider :model-value="opacity" :min="30" :max="100" :step="5" class="opacity-slider" @input="setOpacity($event)" />
        <el-switch :model-value="clickThrough" active-text="鼠标穿透" @change="setClickThrough($event)" />
      </div>

      <div class="integration-row">
        <div class="row-copy">
          <strong>本机开放 HTTP API</strong>
          <small>
            只监听 127.0.0.1，必须带令牌；可让本机脚本或快捷键工具控制播放、读取状态与队列。默认关闭。
          </small>
        </div>
        <el-switch :model-value="config.localApi" @change="update({ localApi: $event })" />
      </div>
      <div v-if="config.localApi" class="api-detail">
        <div class="api-line">
          <span class="option-label">端口</span>
          <el-input-number :model-value="config.localApiPort" :min="1024" :max="65535" size="small" @change="update({ localApiPort: $event })" />
          <span class="option-hint">修改端口会立即重启本机服务</span>
        </div>
        <div class="api-line">
          <span class="option-label">访问令牌</span>
          <code class="api-token">{{ config.localApiToken || '（生成中）' }}</code>
          <el-button size="small" round @click="regenerate">重新生成</el-button>
        </div>
        <pre class="api-sample">curl -H "Authorization: Bearer {{config.localApiToken}}" http://127.0.0.1:{{config.localApiPort}}/api/status
curl -X POST -H "Authorization: Bearer {{config.localApiToken}}" -H "content-type: application/json" \
  -d '{"value":0.5}' http://127.0.0.1:{{config.localApiPort}}/api/volume
curl -N -H "Authorization: Bearer {{config.localApiToken}}" http://127.0.0.1:{{config.localApiPort}}/api/events</pre>
        <small class="option-hint">可用命令：status / queue / lyrics / toggle / play / pause / next / prev / stop / volume / seek / search / navigate</small>
      </div>

      <div class="integration-row">
        <div class="row-copy">
          <strong>music-holo:// 启动参数</strong>
          <small>
            支持 music-holo://search?q=关键词、//import?url=歌单链接、//lyrics、//open?path=/queue、//play?id=曲目ID。
          </small>
        </div>
        <el-tag size="small" :type="config.protocolRegistered ? 'success' : 'info'" effect="plain">
          {{ config.protocolRegistered ? '已注册为默认协议' : '本次会话未注册' }}
        </el-tag>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { desktopIntegration } from '@/utils/desktopIntegration'

const CUSTOMIZABLE = [
  { key: 'toggle', label: '播放 / 暂停' },
  { key: 'next', label: '下一首' },
  { key: 'prev', label: '上一首' },
  { key: 'stop', label: '停止' },
  { key: 'volumeUp', label: '音量 +' },
  { key: 'volumeDown', label: '音量 -' },
  { key: 'show', label: '显示窗口' }
]

const integration = desktopIntegration()
const isDesktop = Boolean(integration)
const config = ref({
  tray: false,
  mediaKeys: true,
  lyricWindow: false,
  localApi: false,
  localApiPort: 17320,
  localApiToken: '',
  localApiPortActual: 0,
  protocolRegistered: false
})
const opacity = ref(100)
const clickThrough = ref(false)
const custom = computed(() => config.value.customShortcuts || {})

async function refresh() {
  if (!integration) return
  try {
    config.value = { ...config.value, ...(await integration.get()) }
    opacity.value = Math.round((config.value.lyricOpacity ?? 1) * 100)
    clickThrough.value = Boolean(config.value.lyricClickThrough)
  } catch (error) {
    ElMessage.warning(String(error?.message || error))
  }
}

async function update(patch) {
  if (!integration) return
  await integration.configure(patch)
  await refresh()
}

async function setShortcut(command, accelerator) {
  const value = String(accelerator || '').trim()
  if (value && !(await integration.probeShortcut(value))) {
    ElMessage.warning(`${value} 不是有效的快捷键组合`)
    await refresh()
    return
  }
  const next = { ...(config.value.customShortcuts || {}) }
  if (value) next[command] = value
  else delete next[command]
  await integration.configure({ customShortcuts: next })
  await refresh()
}

async function setOpacity(value) {
  opacity.value = Number(value) || 100
  await integration.setLyricOptions({ opacity: opacity.value / 100 })
}

async function setClickThrough(value) {
  clickThrough.value = Boolean(value)
  await integration.setLyricOptions({ clickThrough: clickThrough.value })
}

async function regenerate() {
  if (!integration) return
  const token = await integration.regenerateToken()
  config.value.localApiToken = token
  ElMessage.success('已重新生成本机 API 令牌')
}

onMounted(refresh)
</script>

<style scoped>
.integration-panel {
  display: grid;
  gap: 14px;
}
.integration-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 16%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--holo-primary) 6%, transparent);
}
.row-copy {
  display: grid;
  gap: 4px;
}
.row-copy small {
  color: var(--text-sub);
  font-size: 12px;
  line-height: 1.5;
}
.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}
.shortcut-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.shortcut-label {
  width: 92px;
  color: var(--text-sub);
  font-size: 13px;
}
.shortcut-input {
  flex: 1;
}
.lyric-options,
.api-detail {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--text-main) 4%, transparent);
}
.option-label {
  width: 92px;
  color: var(--text-sub);
  font-size: 13px;
}
.opacity-slider {
  flex: 1;
}
.api-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.api-token {
  font-size: 12px;
  word-break: break-all;
  color: var(--holo-primary);
}
.api-sample {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  color: var(--text-sub);
  font-size: 11px;
  overflow-x: auto;
}
.option-hint {
  color: var(--text-sub);
  font-size: 12px;
}
</style>
