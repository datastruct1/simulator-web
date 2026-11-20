<script setup lang="ts">
import { computed, ref } from 'vue'
import { presets } from '../../data/catalog'
import { useSimulator } from '../../state/simulator'
import type { DeviceState } from '../../types/simulator'
import { clone, errorMessage, readJsonFile } from './toolHelpers'
import ToolTable from './ToolTable.vue'
import UiIcon from '../common/UiIcon.vue'

const props = withDefaults(defineProps<{ type?: string }>(), { type: '' })
const { state, saveSnapshot, loadSnapshot, applyPreset, downloadJson: exportJson, record, notify } = useSimulator()
const requested = props.type || String(state.modal?.type || 'load')
const view = ref(requested === 'save' ? 'save' : 'load')
const snapshotName = ref('')
const fileInput = ref<HTMLInputElement>()
const importedFile = ref('')
const pending = ref<{ kind: 'preset' | 'snapshot'; key: string; label: string } | null>(null)

interface SnapshotRecord { name?: unknown; time?: unknown; elapsed?: unknown; devices?: unknown; schemaVersion?: unknown; [key: string]: unknown }
interface PresetRow { id: string; key: string; label: string; count: number }
const presetLabels: Record<string, string> = { init: '初始', jiazhu: '开始加注', '甲醇供应1': '开始供应', '甲醇供应2': '甲醇供应（备机）' }
const presetRows = computed<PresetRow[]>(() => Object.entries(presets as Record<string, Record<string, Partial<DeviceState>>>).map(([key, devices]) => ({
  id: key, key, label: presetLabels[key] || key, count: Object.keys(devices || {}).length,
})))
const snapshots = computed<SnapshotRecord[]>(() => (Array.isArray(state.snapshots) ? state.snapshots : []).map(item => item && typeof item === 'object' ? item as SnapshotRecord : {}))
const snapshotRows = computed(() => snapshots.value.map((item, index) => ({
  id: `snapshot-${index}`, index, name: String(item.name || '未命名工况'), time: String(item.time || '—'),
  elapsed: Number.isFinite(Number(item.elapsed)) ? Number(item.elapsed).toFixed(1) : '—',
  count: item.devices && typeof item.devices === 'object' ? Object.keys(item.devices as Record<string, unknown>).length : 0,
})))
const presetColumns = [{ key: 'label', label: '原工况名称' }, { key: 'key', label: '文件标识' }, { key: 'count', label: '设备数量', numeric: true }, { key: 'actions', label: '操作', sortable: false }]
const snapshotColumns = [{ key: 'name', label: '工况名称' }, { key: 'time', label: '保存时间' }, { key: 'elapsed', label: '仿真时长(s)', numeric: true }, { key: 'count', label: '设备数量', numeric: true }, { key: 'actions', label: '操作', sortable: false }]

function saveAndDownload() {
  const name = snapshotName.value.trim() || '手动保存'
  try {
    const snapshot = saveSnapshot(name)
    exportJson(`${name}.json`, snapshot)
    snapshotName.value = ''
    notify(`工况“${snapshot.name}”已保存到浏览器并下载为 JSON。`, 'success')
  } catch (error) { notify(errorMessage(error), 'error') }
}
function downloadSnapshotAt(index: number) {
  const item = snapshots.value[index]
  if (!item) { notify('该工况快照已不存在，请刷新列表。', 'error'); return }
  exportJson(String(item.name || '工况'), item)
  record(`下载工况 JSON：${String(item.name || '未命名工况')}`)
  notify('工况 JSON 已由浏览器下载。', 'success')
}
function askPreset(row: PresetRow) { pending.value = { kind: 'preset', key: row.key, label: row.label } }
function askSnapshot(row: { index: number; name: string }) { pending.value = { kind: 'snapshot', key: String(row.index), label: row.name } }
function confirmLoad() {
  const request = pending.value
  pending.value = null
  if (!request) return
  if (request.kind === 'preset') { applyPreset(request.key); return }
  const item = snapshots.value[Number(request.key)]
  if (!item) { notify('该工况快照已不存在，请刷新列表。', 'error'); return }
  loadSnapshot(clone(item))
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  importedFile.value = input.files?.[0]?.name || ''
  try {
    const data = await readJsonFile(event, 20 * 1024 * 1024)
    if (data === undefined) return
    if (!loadSnapshot(data)) return
    notify(`文件“${importedFile.value || '工况'}”已作为 Web 工况载入。`, 'success')
    record(`从文件载入工况：${importedFile.value || '未命名文件'}`)
  } catch (error) { notify(errorMessage(error), 'error') }
}
</script>

<template>
  <div class="condition-tools">
    <nav class="tabs condition-tabs">
      <button :class="{ active: view === 'save' }" type="button" @click="view = 'save'"><UiIcon name="Save" :size="14" />保存工况</button>
      <button :class="{ active: view === 'load' }" type="button" @click="view = 'load'"><UiIcon name="FolderOpen" :size="14" />加载工况</button>
    </nav>

    <div v-if="pending" class="confirm-strip">
      <span>载入“{{ pending.label }}”会覆盖当前设备状态、仿真时长与流程进度，是否继续？</span>
      <button class="btn btn-primary btn-sm" type="button" @click="confirmLoad">确认载入</button>
      <button class="btn btn-sm" type="button" @click="pending = null">取消</button>
    </div>

    <template v-if="view === 'save'">
      <section class="card save-card">
        <h3>保存当前工况</h3>
        <p>把当前全部设备状态、仿真时长保存到浏览器（最多保留 20 组），并可同时下载为本 Web 版本可载入的 JSON 文件。</p>
        <div class="save-form">
          <input v-model="snapshotName" class="field" maxlength="60" placeholder="工况名称，例如：加注 60% 训练节点" aria-label="工况名称" @keyup.enter="saveAndDownload">
          <button class="btn btn-primary" type="button" @click="saveAndDownload"><UiIcon name="Save" :size="14" />保存并下载 JSON</button>
        </div>
        <p class="hint">当前设备 {{ Object.keys(state.devices).length }} 台 · 仿真时长 {{ state.elapsed.toFixed(1) }} s · 已有快照 {{ snapshots.length }} 组</p>
      </section>
      <section class="snapshot-list">
        <div class="panel-heading"><h3>浏览器中的工况快照</h3><span class="count-note">{{ snapshotRows.length }} / 20 组</span></div>
        <ToolTable :rows="snapshotRows" :columns="snapshotColumns" empty-text="还没有保存过工况；填写名称后点击“保存并下载 JSON”。">
          <template #cell-actions="{ row }"><div class="row-actions"><button class="btn btn-sm" type="button" @click="askSnapshot(row)">载入</button><button class="btn btn-sm" type="button" @click="downloadSnapshotAt(row.index)">下载</button></div></template>
        </ToolTable>
      </section>
    </template>

    <template v-else>
      <section class="card note-card">
        <h3>加载方式</h3>
        <p>可选择 {{ presetRows.length }} 组预置工况、本浏览器保存的工况快照，或导入工况文件。载入后会停止当前流程并覆盖设备状态。</p>
        <div class="import-row">
          <button class="btn btn-primary" type="button" @click="fileInput?.click()"><UiIcon name="Upload" :size="14" />选择工况 JSON 文件</button>
          <input ref="fileInput" class="visually-hidden" type="file" accept="application/json,.json" @change="importFile">
          <span v-if="importedFile" class="file-note">最近选择：{{ importedFile }}</span>
          <span class="hint">请选择本系统导出的工况文件。</span>
        </div>
      </section>
      <section class="preset-list">
        <div class="panel-heading"><h3>预置工况（{{ presetRows.length }} 组）</h3></div>
        <ToolTable :rows="presetRows" :columns="presetColumns" default-sort="label" empty-text="没有可用的预置工况。">
          <template #cell-actions="{ row }"><button class="btn btn-sm" type="button" @click="askPreset(row)">载入</button></template>
        </ToolTable>
      </section>
      <section class="snapshot-list">
        <div class="panel-heading"><h3>浏览器中的工况快照（{{ snapshotRows.length }} 组）</h3></div>
        <ToolTable :rows="snapshotRows" :columns="snapshotColumns" empty-text="本浏览器还没有保存过工况。">
          <template #cell-actions="{ row }"><div class="row-actions"><button class="btn btn-sm" type="button" @click="askSnapshot(row)">载入</button><button class="btn btn-sm" type="button" @click="downloadSnapshotAt(row.index)">下载</button></div></template>
        </ToolTable>
      </section>
    </template>
  </div>
</template>

<style scoped>
.condition-tools { color: #405e75; }
.condition-tabs { margin-bottom: 16px; }
.condition-tabs button { display: inline-flex; align-items: center; gap: 6px; }
.condition-tools section { margin-bottom: 16px; }
.condition-tools .card { padding: 17px 20px; }
.condition-tools h3 { margin: 0 0 10px; color: #2f6f99; font-size: 15px; }
.condition-tools p { margin: 0 0 10px; font-size: 12px; color: #70899d; line-height: 1.75; }
.save-form { display: flex; gap: 9px; flex-wrap: wrap; margin: 12px 0 9px; }
.save-form .field { flex: 1; min-width: 220px; }
.save-form .btn { display: inline-flex; align-items: center; gap: 6px; }
.hint { color: #8ba0b0; font-size: 11px; line-height: 1.7; }
.import-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.import-row .btn { display: inline-flex; align-items: center; gap: 6px; }
.import-row .hint { flex-basis: 100%; margin: 0; }
.file-note { font-size: 11px; color: #4f8f74; }
.panel-heading h3 { color: #2f6f99; font-size: 14px; }
.count-note { font-size: 11px; color: #93a8b8; }
.row-actions { display: flex; gap: 5px; }
.row-actions .btn { font-size: 10px; padding: 4px 7px; }
.confirm-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 13px; padding: 11px 13px; border: 1px solid #c9dff0; border-radius: 7px; background: #eff8ff; font-size: 12px; color: #3f739c; }
.confirm-strip span { margin-right: auto; }
</style>
