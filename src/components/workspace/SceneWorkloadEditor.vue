<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { LocalWorkload } from '../../data/workspace'
import { useSimulator } from '../../state/simulator'
import { normaliseWorkload, safeName } from './lib/domain'
import ConfirmDialog from './ConfirmDialog.vue'
import UiIcon from '../common/UiIcon.vue'

const model = defineModel<LocalWorkload | undefined>()
const name = defineModel<string>('name', { required: true })
const props = withDefaults(defineProps<{ title?: string; initial?: boolean; disabled?: boolean }>(), { title: '初始工况', initial: true, disabled: false })
const simulator = useSimulator(), input = ref<HTMLInputElement>(), busy = ref(false), error = ref('')
const pending = ref<{ workload: LocalWorkload | undefined; name: string } | null>(null)
const deviceCount = computed(() => Object.keys(model.value?.devices || {}).length)
let alive = true
onBeforeUnmount(() => { alive = false })
watch(name, value => { if (model.value) model.value.name = value })

function commit(workload: LocalWorkload | undefined, workloadName: string) {
  if (!alive || props.disabled) { error.value = '录制期间不能替换工况，请先停录。'; return }
  model.value = workload; name.value = workloadName; error.value = ''
}
function propose(workload: LocalWorkload | undefined, workloadName: string) {
  if (props.disabled || busy.value) return
  if (model.value) pending.value = { workload, name: workloadName }
  else commit(workload, workloadName)
}
function confirmChange() {
  const change = pending.value
  pending.value = null
  if (change) commit(change.workload, change.name)
}
function capture() {
  if (props.disabled || busy.value) return
  try {
    const workload = normaliseWorkload({ schemaVersion: 1, name: `当前工艺捕获 · ${new Date().toLocaleString('zh-CN', { hour12: false })}`, elapsed: simulator.state.elapsed, devices: simulator.state.devices })
    propose(workload, workload.name)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '捕获工况失败。' }
}
async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file || props.disabled || busy.value) return
  if (file.size > 10 * 1024 * 1024) { error.value = '工况 JSON 不得超过 10 MB。'; return }
  const original = model.value
  busy.value = true; error.value = ''
  try {
    const text = await file.text()
    if (!alive) return
    if (props.disabled || model.value !== original) throw new Error('工况编辑目标已变化，未载入文件。请停录后重新选择。')
    const workload = normaliseWorkload(JSON.parse(text.replace(/^\uFEFF/, '')))
    busy.value = false
    propose(workload, workload.name)
  } catch (cause) { if (alive) error.value = cause instanceof Error ? cause.message : '工况 JSON 无法读取。' }
  finally { busy.value = false }
}
function exportWorkload() {
  if (model.value) simulator.downloadJson(`工况-${safeName(name.value || model.value.name)}.json`, normaliseWorkload({ ...model.value, name: name.value }))
}
</script>

<template>
  <section class="scene-workload" :aria-label="title" data-testid="scene-workload-editor">
    <header class="scene-workload-heading"><strong>{{ title }}</strong><span class="badge" :class="model ? 'badge-success' : 'badge-muted'">{{ model ? deviceCount + ' 个设备属性快照' : '未指定工况' }}</span></header>
    <label v-if="model" class="field-group"><span>工况名称</span><input v-model="name" class="field" :disabled="disabled || busy" maxlength="150" :aria-label="title + '名称'" data-testid="scene-workload-name" /></label>
    <p class="scene-workload-help">{{ model ? '工况数据已嵌入此草稿，替换或清除不会改动当前工艺。' : initial ? '未指定时使用关联流程的初始设备工况；捕获只复制当前设备属性，不操作设备。' : '加载动作必须嵌入有效工况；导入或捕获不会立即加载到当前工艺。' }}</p>
    <div class="ws-inline">
      <button class="btn btn-sm" type="button" :disabled="disabled || busy" data-testid="scene-workload-import" @click="input?.click()"><UiIcon name="FolderOpen" :size="14" />{{ busy ? '读取中…' : '导入工况 JSON' }}</button>
      <button class="btn btn-sm" type="button" :disabled="disabled || busy" data-testid="scene-workload-capture" @click="capture"><UiIcon name="Camera" :size="14" />从当前工艺捕获</button>
      <button v-if="model" class="btn btn-sm" type="button" :disabled="busy" @click="exportWorkload">导出工况</button>
      <button v-if="model" class="btn btn-sm btn-danger" type="button" :disabled="disabled || busy" data-testid="scene-workload-clear" @click="propose(undefined, '')">清除工况</button>
    </div>
    <input ref="input" class="scene-file-input" type="file" accept=".json,application/json" :disabled="disabled || busy" :aria-label="title + ' JSON 文件'" data-testid="scene-workload-file" @change="importFile" />
    <small class="scene-workload-help">仅支持本 Web 导出的 schemaVersion: 1 工况 JSON；不支持 WPF 工况或引用图格式。快照保留设备开关、数值及本地传感器 / 设备参数，不含 WPF 物理仿真状态。</small>
    <div v-if="error" class="ws-form-error scene-workload-error" role="alert">{{ error }}</div>
  </section>
  <ConfirmDialog v-if="pending" :title="pending.workload ? '替换草稿工况' : '清除草稿工况'" :message="pending.workload ? `将用“${pending.name}”替换当前嵌入的工况“${name}”？不会加载到当前工艺设备。` : initial ? '确定清除此草稿中的工况？当前工艺设备不会重置；测试时将使用关联流程的初始工况。' : '确定移除此加载动作的工况？动作会保留，重新导入有效工况后才能通过校验。'" :danger="!pending.workload" :confirm-text="pending.workload ? '替换工况' : '清除工况'" @confirm="confirmChange" @close="pending = null" />
</template>

<style scoped>
.scene-workload{display:flex;flex-direction:column;gap:10px;padding:14px;background:#f8fbff;border:1px solid #d2e4f3;border-radius:8px;min-width:0}.scene-workload-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;color:#2f628d;font-size:13px}.scene-workload-help{margin:0;font-size:11px;line-height:1.8;color:#7991a9;overflow-wrap:anywhere}.scene-workload .field-group{margin:0}.scene-workload-error{margin:0}.scene-file-input{display:none}
</style>
