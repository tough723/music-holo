<template>
  <div class="sync-panel">
    <el-alert
      type="warning"
      show-icon
      :closable="false"
      title="关于 LX 同步协议"
      description="LX 桌面端与官方 lx-music-sync-server 之间走的是未公开的 WebSocket 私有协议。这里实现的是同一安全模型（客户端加密 + 快照密钥）的 REST 快照同步，可与你自己部署的兼容服务对接；未与官方服务端做过互通测试。"
    />

    <div class="sync-form">
      <el-input v-model="serverUrl" placeholder="同步服务地址，例如 https://sync.example.org" clearable>
        <template #prepend>服务地址</template>
      </el-input>
      <el-input v-model="token" placeholder="可选：服务端要求的访问令牌（Bearer）" show-password clearable>
        <template #prepend>访问令牌</template>
      </el-input>
      <div class="key-row">
        <el-input v-model="key" placeholder="快照密钥：多设备填写同一个密钥即可共享" clearable>
          <template #prepend>快照密钥</template>
        </el-input>
        <el-button round @click="generateKey">生成</el-button>
      </div>
      <el-input v-model="password" type="password" placeholder="加密口令：只在本机使用，永远不上传" show-password clearable>
        <template #prepend>加密口令</template>
      </el-input>
      <div class="sync-options">
        <el-select v-model="strategy" class="strategy-select">
          <el-option label="合并（取并集，推荐）" value="merge" />
          <el-option label="以本地覆盖远程" value="local" />
          <el-option label="以远程覆盖本地" value="remote" />
        </el-select>
        <el-checkbox v-model="includeSourceScripts">同步自定义音源脚本全文</el-checkbox>
        <el-checkbox v-model="allowInsecure">允许本机 HTTP 服务（仅 127.0.0.1）</el-checkbox>
        <el-checkbox v-model="autoSync">启动时自动同步一次</el-checkbox>
      </div>
      <p v-if="includeSourceScripts" class="sync-warning">
        开启后脚本全文会加密上传；脚本可能包含第三方接口地址与作者信息，请确认服务端可信。
      </p>
      <div class="sync-actions">
        <el-button type="primary" round :loading="syncing" @click="syncNow">立即同步</el-button>
        <el-button round :loading="syncing" @click="pullOnly">仅拉取远程快照</el-button>
        <el-button round @click="exportSnapshot">导出快照文件</el-button>
        <el-button round @click="importSnapshot">导入快照文件</el-button>
      </div>
      <p class="sync-status">{{ status }}</p>
      <ul v-if="log.length" class="sync-log">
        <li v-for="(entry, index) in log" :key="index">{{ entry }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import { readCustomSources, customSourceStorageKeyForOwner } from '@/utils/customSources'
import {
  buildSnapshot,
  createSnapshotKey,
  createSyncClient,
  decryptSnapshot,
  encryptSnapshot,
  normalizeSyncBaseUrl
} from '@/utils/lxSync'

const SETTINGS_KEY = 'mh_sync_settings_v1'
const playerStore = usePlayerStore()
const userStore = useUserStore()

const serverUrl = ref('')
const token = ref('')
const key = ref('')
const password = ref('')
const strategy = ref('merge')
const includeSourceScripts = ref(false)
const allowInsecure = ref(false)
const autoSync = ref(false)
const syncing = ref(false)
const status = ref('尚未同步')
const log = ref([])

function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function persist() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    serverUrl: serverUrl.value,
    key: key.value,
    strategy: strategy.value,
    includeSourceScripts: includeSourceScripts.value,
    allowInsecure: allowInsecure.value,
    autoSync: autoSync.value,
    lastSyncAt: readSettings().lastSyncAt || ''
  }))
}

onMounted(() => {
  const saved = readSettings()
  serverUrl.value = saved.serverUrl || ''
  key.value = saved.key || ''
  strategy.value = saved.strategy || 'merge'
  includeSourceScripts.value = Boolean(saved.includeSourceScripts)
  allowInsecure.value = Boolean(saved.allowInsecure)
  autoSync.value = Boolean(saved.autoSync)
  if (saved.lastSyncAt) status.value = `上次同步：${saved.lastSyncAt}`
})

function generateKey() {
  key.value = createSnapshotKey()
  ElMessage.success('已生成新的快照密钥，请在其它设备填写同一个密钥')
}

function collectLocalSnapshot() {
  const owner = userStore.userInfo?.id ?? userStore.userInfo?.username ?? 'local'
  const sources = readCustomSources(localStorage, customSourceStorageKeyForOwner(owner))
  return buildSnapshot({
    favorites: [],
    dislikes: [],
    queue: playerStore.queue || [],
    preferences: {},
    customSources: sources || [],
    includeSourceScripts: includeSourceScripts.value
  })
}

function requireClient() {
  if (!serverUrl.value || !key.value || !password.value) {
    throw new Error('请填写同步服务地址、快照密钥与加密口令')
  }
  normalizeSyncBaseUrl(serverUrl.value, { allowInsecure: allowInsecure.value })
  return createSyncClient({
    baseUrl: serverUrl.value,
    key: key.value,
    password: password.value,
    token: token.value,
    allowInsecure: allowInsecure.value
  })
}

async function syncNow() {
  if (syncing.value) return
  syncing.value = true
  try {
    const client = requireClient()
    const local = collectLocalSnapshot()
    const result = await client.sync(local, { strategy: strategy.value })
    log.value.unshift(`${new Date().toLocaleString()} 同步完成：${result.remoteEmpty ? '远程为空，已上传本地快照' : '已合并远程快照'}（收藏 ${result.snapshot.favorites.length} / 队列 ${result.snapshot.queue.length} / 音源 ${result.snapshot.customSources.length}）`)
    status.value = `上次同步：${new Date().toLocaleString()}`
    persist()
    ElMessage.success('同步完成')
  } catch (error) {
    ElMessage.warning(String(error?.message || error))
  } finally {
    syncing.value = false
  }
}

async function pullOnly() {
  if (syncing.value) return
  syncing.value = true
  try {
    const client = requireClient()
    const { snapshot } = await client.fetchSnapshot()
    if (!snapshot) {
      ElMessage.info('远程还没有快照')
      return
    }
    log.value.unshift(`${new Date().toLocaleString()} 拉取成功：队列 ${snapshot.queue?.length || 0} 首，音源 ${snapshot.customSources?.length || 0} 个（未自动写入本地，需确认后应用）`)
    ElMessage.success('已拉取远程快照（未自动覆盖本地数据）')
  } catch (error) {
    ElMessage.warning(String(error?.message || error))
  } finally {
    syncing.value = false
  }
}

async function exportSnapshot() {
  try {
    if (!password.value) throw new Error('请先填写加密口令')
    const blob = await encryptSnapshot(collectLocalSnapshot(), password.value)
    const file = new Blob([JSON.stringify(blob, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `music-holo-snapshot-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('快照已导出（内容已加密）')
  } catch (error) {
    ElMessage.warning(String(error?.message || error))
  }
}

async function importSnapshot() {
  try {
    if (!password.value) throw new Error('请先填写加密口令')
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    const file = await new Promise((resolve) => {
      input.onchange = () => resolve(input.files?.[0] || null)
      input.click()
    })
    if (!file) return
    const text = await file.text()
    const snapshot = await decryptSnapshot(JSON.parse(text), password.value)
    log.value.unshift(`${new Date().toLocaleString()} 已解密本地快照文件：队列 ${snapshot.queue?.length || 0} 首，音源 ${snapshot.customSources?.length || 0} 个`)
    ElMessage.success('快照文件解密成功（未自动覆盖本地数据）')
  } catch (error) {
    ElMessage.warning(String(error?.message || error))
  }
}
</script>

<style scoped>
.sync-panel {
  display: grid;
  gap: 14px;
}
.sync-form {
  display: grid;
  gap: 10px;
}
.key-row {
  display: flex;
  gap: 10px;
}
.sync-options {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.strategy-select {
  width: 220px;
}
.sync-warning {
  margin: 0;
  color: var(--el-color-warning);
  font-size: 12px;
}
.sync-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.sync-status {
  margin: 0;
  color: var(--text-sub);
  font-size: 13px;
}
.sync-log {
  margin: 0;
  padding-left: 18px;
  color: var(--text-sub);
  font-size: 12px;
  display: grid;
  gap: 4px;
}
</style>
