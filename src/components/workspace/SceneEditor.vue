<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { SceneCondition, SceneDefinition, SceneEventGroup, SceneState, SequenceOperation } from '../../data/workspace'
import { WORKSPACE_SCHEMA } from '../../data/workspace'
import { pages, workflows } from '../../data/catalog'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
import { asObject, clone, emptyAction, emptyCondition, formatDate, matches, newId, normaliseScene, safeName, usePagination, validateAction, validateCondition, validateScene } from './lib/domain'
import WorkspaceFrame from './WorkspaceFrame.vue'
import WorkspacePager from './WorkspacePager.vue'
import ActiveAssessmentBanner from './ActiveAssessmentBanner.vue'
import OperationStartDialog from './OperationStartDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import SceneConditionEditor from './SceneConditionEditor.vue'
import SceneActionEditor from './SceneActionEditor.vue'
import SceneDeviceSelect from './SceneDeviceSelect.vue'
import SceneWorkloadEditor from './SceneWorkloadEditor.vue'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'

const workspace = useWorkspace(), simulator = useSimulator()
const draft = computed(() => workspace.data.editorDraft)
const recording = computed(() => workspace.data.recording.active)
const busy = ref(false), recordBusy = ref(false), message = ref(''), validationRequested = ref(false)
const locked = computed(() => recording.value || busy.value)
const flow = computed(() => workflows.find(item => item.id === draft.value?.flowId))
const savedScene = computed(() => workspace.data.scenes.find(item => item.id === draft.value?.id))
const hasChanges = computed(() => !!draft.value && JSON.stringify(draft.value) !== JSON.stringify(savedScene.value))
const selectedState = computed(() => draft.value?.states.find(state => state.id === workspace.data.editorSelectedState) ?? draft.value?.states[0])
const transitionStates = computed(() => draft.value?.states.filter(state => state.kind === 'transition') || [])
const events = computed(() => draft.value?.states.flatMap(state => state.groups.flatMap(group => group.events)) || [])
const scoredEvents = computed(() => events.value.filter(event => event.action.kind === 'score' && event.action.score > 0))
const operations = computed(() => [...(draft.value?.legacyOps || [])].sort((a, b) => a.index - b.index))
const sequenceWeight = computed(() => operations.value.reduce((total, op) => total + (Number.isFinite(op.weight) && op.weight > 0 ? op.weight : 0), 0))
const { page: sequencePage, pageSize: sequencePageSize, rows: operationRows } = usePagination(operations, 10)
const validationError = computed(() => {
  if (!draft.value) return '请先新建或打开操作题。'
  try { return validateScene(draft.value) }
  catch { return '草稿结构异常。请先导出备份，再新建或导入有效的 Web 场景 JSON。' }
})
const conditionTitle = computed(() => selectedState.value?.kind === 'final' ? '终止条件' : selectedState.value?.kind === 'initial' ? '全局前置条件' : '状态前置条件')
const sceneInput = ref<HTMLInputElement>(), copyOpen = ref(false), copySource = ref('supply'), libraryOpen = ref(false), libraryQuery = ref(''), testId = ref('')
const libraryScenes = computed(() => workspace.data.scenes.filter(scene => matches(`${scene.name} ${scene.description}`, libraryQuery.value)))
const newGroupKind = ref<SceneEventGroup['kind']>('score')
const confirmation = ref<{ title: string; message: string; confirmText: string; danger: boolean; action: () => void } | null>(null)
let alive = true

watch(() => draft.value?.states.map(state => state.id).join('|'), () => {
  if (!draft.value?.states.some(state => state.id === workspace.data.editorSelectedState)) workspace.data.editorSelectedState = draft.value?.states[0]?.id || ''
}, { immediate: true })
watch(() => draft.value?.id, () => { message.value = ''; validationRequested.value = false; sequencePage.value = 1; testId.value = ''; confirmation.value = null })
watch(() => draft.value?.legacyOps.length, (count, previous) => {
  if (recording.value && count) {
    sequencePage.value = Math.ceil(count / sequencePageSize.value)
    if (count >= 500 && (previous || 0) < 500) simulator.notify('录制已达到 500 个操作上限，请停录并整理操作列表。', 'warning')
  }
})
onBeforeUnmount(() => { alive = false; workspace.persist() })

function warn(text: string) { message.value = text; simulator.notify(text, 'warning') }
function canChangeDraft() {
  if (recording.value) { warn('录制中的草稿已锁定。请先停止录制，再新建、打开、导入或修改场景结构。'); return false }
  if (busy.value) { warn('正在读取场景文件，请稍候。'); return false }
  return true
}
function currentDraft() { return canChangeDraft() ? draft.value : null }
function ask(title: string, text: string, action: () => void, confirmText = '确定', danger = true) {
  const id = draft.value?.id
  confirmation.value = { title, message: text, confirmText, danger, action: () => {
    if (!alive || !canChangeDraft()) return
    if (draft.value?.id !== id) { warn('编辑目标已变化，此操作已取消，请重新选择。'); return }
    action()
  } }
}
function confirm() { const action = confirmation.value?.action; confirmation.value = null; action?.() }
function afterReplacement() {
  const values = draft.value?.legacyOps.map(op => op.index).filter(index => Number.isInteger(index) && index >= 0) || []
  workspace.data.recording.nextIndex = values.length ? Math.max(...values) + 1 : 1
  validationRequested.value = false; message.value = ''; sequencePage.value = 1; workspace.persist()
}
function replaceDraft(action: () => boolean, title: string, extra = '') {
  if (!canChangeDraft()) return
  const proceed = () => { if (action()) afterReplacement() }
  const warning = hasChanges.value ? '当前草稿虽已自动暂存，但本浏览器只保留一份编辑草稿。继续会替换尚未保存到场景库的修改；如需保留，请先校验保存或导出 JSON。' : ''
  if (warning || extra) ask(title, [extra, warning].filter(Boolean).join('\n\n'), proceed, '继续并替换草稿', true)
  else proceed()
}
function createScene() { replaceDraft(() => workspace.editScene(), '新建操作题') }
function showCopy() { if (!canChangeDraft()) return; copySource.value = draft.value?.flowId || 'supply'; copyOpen.value = true }
function copyWorkflow() { const source = copySource.value; copyOpen.value = false; replaceDraft(() => workspace.editScene(source), '从流程复制场景') }
function showLibrary() { if (!canChangeDraft()) return; libraryQuery.value = ''; libraryOpen.value = true }
function openScene(id: string) { libraryOpen.value = false; replaceDraft(() => workspace.editScene(`scene:${id}`), '打开已保存操作题') }
async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file || !canChangeDraft()) return
  if (file.size > 10 * 1024 * 1024) { warn('场景 JSON 不得超过 10 MB。'); return }
  const id = draft.value?.id
  busy.value = true; message.value = ''
  try {
    const text = (await file.text()).replace(/^\uFEFF/, '')
    if (!alive) return
    if (recording.value || draft.value?.id !== id) throw new Error('读取期间编辑目标已变化，未导入文件。请先停录，再重新选择。')
    const object = asObject(JSON.parse(text))
    if (object.scene && object.schemaVersion !== undefined && object.schemaVersion !== WORKSPACE_SCHEMA) throw new Error(`场景文件版本不兼容，当前需要 Web 版本 ${WORKSPACE_SCHEMA}。`)
    const imported = normaliseScene(object.scene ?? object)
    const existing = workspace.data.scenes.find(scene => scene.id === imported.id)
    busy.value = false
    replaceDraft(() => workspace.importScene(text), '导入 Web 本地场景', existing ? `导入的编号已存在于本地场景库：“${existing.name}”。继续会覆盖该已保存版本，已发布任务与历史快照不变。` : `将“${imported.name}”导入本地场景库并作为当前草稿。只执行本 Web 场景定义，不连接 WPF 引擎。`)
  } catch (cause) { if (alive) warn(cause instanceof Error ? cause.message : '无法读取场景 JSON。') }
  finally { busy.value = false }
}
function exportScene() {
  if (!draft.value) return
  simulator.downloadJson(`操作题-${safeName(draft.value.name)}.json`, { schemaVersion: WORKSPACE_SCHEMA, scene: clone(draft.value), note: 'Web 前端本地场景格式，不支持 WPF JSON 引用图。此文件是当前草稿快照；未通过校验的草稿只能用作备份，修正后才能导入或执行。' })
}
function validateDraft() {
  validationRequested.value = true; message.value = ''
  const scene = draft.value
  if (!scene || !validationError.value) return !!scene
  const invalid = scene.states.find(state => !state.name.trim() || state.conditions.some(condition => !!validateCondition(condition, scene)) || state.groups.some(group => group.events.some(event => !!validateCondition(event.condition, scene) || !!validateAction(event.action, scene))))
  if (invalid) workspace.data.editorSelectedState = invalid.id
  return false
}
function save() {
  const scene = currentDraft()
  if (!scene || !validateDraft()) return false
  return workspace.saveScene(scene)
}
function localTest() {
  if (workspace.active.value || workspace.data.pendingLaunch) { warn('已有未结束的本地练习 / 考核。请先继续、提交或取消，再测试此草稿。'); return }
  if (save() && draft.value) testId.value = `scene:${draft.value.id}`
}
function changeFlow() {
  const scene = draft.value
  if (!scene || locked.value) return
  const selected = workflows.find(item => item.id === scene.flowId)
  if (selected) { scene.page = selected.page; if (selected.requiresSafety) scene.requiresSafety = true }
}
function changeMode(mode: SceneDefinition['mode']) {
  const scene = currentDraft()
  if (scene) { scene.mode = mode; validationRequested.value = false; message.value = '' }
}
function toggleInitial(id: string, event: Event) {
  const scene = currentDraft()
  if (!scene || !scene.states.some(state => state.id === id && state.kind === 'transition')) return
  const checked = (event.target as HTMLInputElement).checked
  scene.initialActiveStates = checked ? [...new Set([...scene.initialActiveStates, id])] : scene.initialActiveStates.filter(value => value !== id)
}
function addState() {
  const scene = currentDraft()
  if (!scene || scene.states.length >= 500) return
  let index = 1
  while (scene.states.some(state => state.name === `状态 ${index}`)) index++
  const state: SceneState = { id: newId('state'), kind: 'transition', name: `状态 ${index}`, conditions: [], groups: [] }
  const finalIndex = scene.states.findIndex(item => item.kind === 'final')
  scene.states.splice(finalIndex < 0 ? scene.states.length : finalIndex, 0, state)
  workspace.data.editorSelectedState = state.id
}
function stateReferences(scene: SceneDefinition, target: string) {
  const references: string[] = []
  if (scene.initialActiveStates.includes(target)) references.push('初始化激活状态列表')
  const inspect = (condition: SceneCondition, path: string) => {
    if (condition.kind === 'state' && condition.stateId === target) references.push(path)
    if (condition.kind === 'logic') condition.children.forEach((child, index) => inspect(child, `${path} / 子条件 ${index + 1}`))
  }
  for (const state of scene.states.filter(item => item.id !== target)) {
    state.conditions.forEach((condition, index) => inspect(condition, `${state.name} / 前置或终止条件 ${index + 1}`))
    for (const group of state.groups) for (const event of group.events) {
      const path = `${state.name} / ${group.name} / ${event.name || '未命名事件'}`
      inspect(event.condition, `${path} / 条件`)
      if (['activate', 'stop', 'disable'].includes(event.action.kind) && event.action.stateId === target) references.push(`${path} / 动作`)
    }
  }
  return references
}
function deleteState(state: SceneState) {
  const scene = currentDraft()
  if (!scene || state.kind !== 'transition') return
  const references = stateReferences(scene, state.id)
  const details = references.length ? `\n将清空 ${references.length} 处引用：\n${references.slice(0, 8).map(path => `• ${path}`).join('\n')}${references.length > 8 ? '\n…其余引用也会清空。' : ''}\n引用条件和动作会保留，但须重新选择目标才能保存；不自动删除事件或放宽逻辑条件。` : '\n没有其它状态引用此中间状态。'
  ask('删除中间状态', `确定删除“${state.name}”及其全部条件、事件组和事件？${details}\n初始化列表删除后仍需保留至少一个有效中间状态。`, () => {
    const clear = (condition: SceneCondition) => {
      if (condition.stateId === state.id) condition.stateId = ''
      condition.children.forEach(clear)
    }
    scene.states = scene.states.filter(item => item.id !== state.id)
    scene.initialActiveStates = scene.initialActiveStates.filter(id => id !== state.id)
    for (const other of scene.states) {
      other.conditions.forEach(clear)
      for (const group of other.groups) for (const event of group.events) { clear(event.condition); if (event.action.stateId === state.id) event.action.stateId = '' }
    }
    workspace.data.editorSelectedState = scene.states.find(item => item.kind === 'transition')?.id || scene.states[0]?.id || ''
    validationRequested.value = true
  }, '删除并清空引用')
}
function addCondition() { if (currentDraft() && selectedState.value && selectedState.value.conditions.length < 100) selectedState.value.conditions.push(emptyCondition()) }
function replaceCondition(state: SceneState, id: string, condition: SceneCondition) {
  if (!currentDraft()) return
  const index = state.conditions.findIndex(item => item.id === id)
  if (index >= 0) state.conditions.splice(index, 1, condition)
}
function removeCondition(state: SceneState, condition: SceneCondition) {
  if (!currentDraft()) return
  ask('删除状态条件', `确定删除“${state.name}”的此项条件及嵌套内容？剩余条件仍按逻辑与判断；删除可能放宽进入或终止要求，请重新校验。`, () => { state.conditions = state.conditions.filter(item => item.id !== condition.id) }, '删除条件')
}
function addGroup() {
  if (!currentDraft() || !selectedState.value || selectedState.value.groups.length >= 100) return
  selectedState.value.groups.push({ id: newId('group'), name: `${newGroupKind.value === 'score' ? '分数记录' : '状态与设备动作'} ${selectedState.value.groups.length + 1}`, kind: newGroupKind.value, events: [] })
}
function removeGroup(state: SceneState, group: SceneEventGroup) {
  if (!currentDraft()) return
  ask('删除事件组', `确定删除“${group.name}”及其 ${group.events.length} 个事件？已保存场景与已发布快照不会随草稿一起删除。`, () => { state.groups = state.groups.filter(item => item.id !== group.id) }, '删除事件组')
}
function addEvent(group: SceneEventGroup) {
  if (!currentDraft() || events.value.length >= 5000) return
  const action = emptyAction()
  if (group.kind === 'transfer') action.kind = 'activate'
  group.events.push({ id: newId('event'), name: `${group.kind === 'score' ? '得分' : '动作'}事件 ${group.events.length + 1}`, condition: emptyCondition(), action })
}
function removeEvent(group: SceneEventGroup, id: string) {
  if (!currentDraft()) return
  const event = group.events.find(item => item.id === id)
  ask('删除场景事件', `确定删除“${event?.name || '未命名事件'}”及其条件和动作？不会删除其它事件引用的状态。`, () => { group.events = group.events.filter(item => item.id !== id) }, '删除事件')
}
function setNextIndex(event: Event) {
  const input = event.target as HTMLInputElement, index = input.valueAsNumber
  if (!Number.isInteger(index) || index < 0 || index > 1000000) { input.value = String(workspace.data.recording.nextIndex); warn('录制起始 / 下一序号必须是 0～1000000 的整数。'); return }
  workspace.data.recording.nextIndex = index
}
function addOperation() {
  const scene = currentDraft(), index = workspace.data.recording.nextIndex
  if (!scene || scene.legacyOps.length >= 500) return
  if (!Number.isInteger(index) || index < 0 || index > 1000000) { warn('请先设置 0～1000000 范围内的有效下一操作序号。'); return }
  const op: SequenceOperation = { id: newId('op'), index, weight: 2, deviceId: '', operation: '打开' }
  scene.legacyOps.push(op)
  if (workspace.data.recording.autoIncrement) workspace.data.recording.nextIndex++
  sequencePage.value = Math.floor(operations.value.findIndex(item => item.id === op.id) / sequencePageSize.value) + 1
}
function removeOperation(op: SequenceOperation) {
  const scene = currentDraft()
  if (!scene) return
  ask('删除顺序操作', `确定删除序号 ${op.index} 的“${op.operation}${op.deviceId || '未选择设备'}”？其它操作的序号不会自动变化。`, () => { scene.legacyOps = scene.legacyOps.filter(item => item.id !== op.id) }, '删除操作')
}
function clearOperations() {
  const scene = currentDraft()
  if (!scene) return
  ask('清空操作列表', `确定清空草稿中的全部 ${scene.legacyOps.length} 个操作？初始化工况与状态式内容保留。`, () => { scene.legacyOps = []; workspace.data.recording.nextIndex = 1 }, '清空操作列表')
}
function reindexOperations() {
  if (!currentDraft()) return
  ask('重排操作序号', '将按当前排序把序号重排为 1、2、3…，不改变设备、开关或权重。同序号项按原列表顺序排列。', () => { operations.value.forEach((op, index) => { op.index = index + 1 }); workspace.data.recording.nextIndex = operations.value.length + 1 }, '重排序号', false)
}
async function toggleRecord() {
  if (recordBusy.value || busy.value) return
  if (recording.value) {
    recordBusy.value = true
    try { await nextTick(); if (alive && workspace.data.recording.active) workspace.toggleRecording() }
    finally { recordBusy.value = false }
    return
  }
  const scene = currentDraft(), index = workspace.data.recording.nextIndex
  if (!scene) return
  if (scene.legacyOps.length >= 500) { warn('操作列表已达到 500 项上限，请先整理。'); return }
  if (!Number.isInteger(index) || index < 0 || index > 1000000) { warn('请先设置 0～1000000 范围内的有效下一操作序号。'); return }
  const start = () => { workspace.toggleRecording() }
  if (simulator.state.flowRunning) ask('开始手动设备录制', '当前工艺流程将停止，保留当前设备属性，避免自动推进或结束工况干扰录制。只记录本浏览器内真实手动设备开关操作，录制到当前草稿。', start, '停止流程并录制', false)
  else start()
}
function returnToProcess() {
  if (!draft.value) return
  workspace.persist()
  simulator.navigate(draft.value.page || flow.value?.page || 'overview')
}
function operationShare(op: SequenceOperation) { return draft.value && sequenceWeight.value > 0 && Number.isFinite(op.weight) && Number.isFinite(draft.value.maxScore) ? (draft.value.maxScore * op.weight / sequenceWeight.value).toFixed(1) + ' 分' : '待校验' }
</script>

<template>
  <WorkspaceFrame title="操作题 / 场景编辑器" subtitle="参照 WPF 状态与录制编辑器 · 草稿自动暂存 · 所有执行和评分仅在本浏览器完成" icon="Workflow">
    <div class="scene-editor" data-testid="scene-editor">
      <ActiveAssessmentBanner />
      <div class="ws-note scene-local-note">自编题<strong>只按本场景的事件或手动操作序列评分</strong>，不把关联内置流程步骤算作得分。关联流程仅提供初始设备工况和默认页面，不会自动推进或用其结束工况覆盖自编题；可单独选择进入页面。此 JSON 是 Web 本地定义，不兼容 WPF 对象引用图，也不连接 WPF 物理仿真引擎。</div>
      <div class="scene-toolbar" aria-label="场景文件操作">
        <button class="btn" :disabled="locked" data-testid="scene-new" @click="createScene"><UiIcon name="Plus" :size="15" />新建</button>
        <button class="btn" :disabled="locked" data-testid="scene-copy-workflow" @click="showCopy"><UiIcon name="Copy" :size="15" />从流程复制</button>
        <button class="btn" :disabled="locked" data-testid="scene-open" @click="showLibrary"><UiIcon name="FolderOpen" :size="15" />打开已保存</button>
        <button class="btn" :disabled="locked" data-testid="scene-import" @click="sceneInput?.click()"><UiIcon name="Upload" :size="15" />{{ busy ? '读取中…' : 'JSON 导入' }}</button>
        <button class="btn" :disabled="!draft" data-testid="scene-export" @click="exportScene"><UiIcon name="Download" :size="15" />JSON 导出</button>
        <span class="scene-toolbar-spacer" />
        <button class="btn" :disabled="!draft || locked" data-testid="scene-validate" @click="validateDraft"><UiIcon name="CheckCheck" :size="15" />校验</button>
        <button class="btn btn-primary" :disabled="!draft || locked" data-testid="scene-save" @click="save"><UiIcon name="Save" :size="15" />校验保存</button>
        <button class="btn" :disabled="!draft || locked || !!workspace.active.value || !!workspace.data.pendingLaunch" data-testid="scene-test" @click="localTest"><UiIcon name="Play" :size="15" />进入本地测试</button>
      </div>
      <input ref="sceneInput" class="scene-file-input" type="file" accept=".json,application/json" :disabled="locked" aria-label="导入 Web 场景 JSON 文件" data-testid="scene-import-file" @change="importFile" />
      <div v-if="message" class="ws-note warning" role="alert" data-testid="scene-error">{{ message }}</div>
      <div v-if="recording" class="scene-recording-banner" role="status" data-testid="scene-recording-banner"><div><strong><span class="ws-rec-dot" />正在录制 · {{ draft?.name }}</strong><p>只录制本次手动设备开关；草稿与序号持续暂存。新建、打开、导入、切换模式和结构编辑已锁定。离开编辑器不会自动停录。</p></div><div class="ws-inline"><button class="btn" :disabled="recordBusy" data-testid="scene-recording-stop" @click="toggleRecord">停止录制</button><button class="btn btn-primary" data-testid="scene-recording-process" @click="returnToProcess">返回工艺画面</button></div></div>
      <div v-if="validationRequested" :class="validationError ? 'ws-form-error' : 'ws-note scene-validation-success'" :role="validationError ? 'alert' : 'status'" data-testid="scene-validation">{{ validationError || '校验通过。可保存到本地场景库或进入本地测试；实际成绩按本次场景事件或手动操作记录计算。' }}</div>

      <div v-if="!draft" class="ws-panel scene-empty"><UiIcon name="FilePenLine" :size="46" /><h2>尚未打开操作题草稿</h2><p>新建场景、从流程复制、打开本地已保存题目，或导入本 Web 编辑器的 JSON。</p><button class="btn btn-primary" :disabled="locked" @click="createScene">新建操作题</button></div>
      <template v-else>
        <section class="ws-panel scene-basics" data-testid="scene-basics">
          <header class="ws-panel-header"><h3>场景基本信息</h3><span class="badge" :class="hasChanges ? 'badge-warning' : 'badge-success'">{{ hasChanges ? '草稿有未保存到场景库的修改' : '与已保存版本一致' }}</span></header>
          <div class="ws-panel-body scene-basics-grid">
            <div class="form-grid">
              <label class="field-group full"><span>操作题 / 场景名称 *</span><input v-model="draft.name" class="field" :disabled="locked" maxlength="120" aria-label="场景名称" data-testid="scene-name" /></label>
              <label class="field-group"><span>对应工艺流程 *</span><select v-model="draft.flowId" class="field" :disabled="locked" aria-label="对应工艺流程" data-testid="scene-flow" @change="changeFlow"><option value="">请选择流程</option><option v-for="item in workflows" :key="item.id" :value="item.id">{{ item.name }} · {{ item.category }}</option></select></label>
              <label class="field-group"><span>进入工艺页面 *</span><select v-model="draft.page" class="field" :disabled="locked" aria-label="场景进入工艺页面" data-testid="scene-page"><option v-for="page in pages" :key="page.id" :value="page.id">{{ page.title }}</option></select></label>
              <label class="field-group"><span>时限（分钟，限时测试有效）</span><input v-model.number="draft.durationMinutes" class="field" type="number" min="1" max="1440" step="1" :disabled="locked" aria-label="场景时限分钟" data-testid="scene-duration" /></label>
              <label class="field-group"><span>总分</span><input v-model.number="draft.maxScore" class="field" type="number" min="0.1" max="10000" step="any" :disabled="locked" aria-label="场景总分" data-testid="scene-max-score" /></label>
              <label class="field-group"><span>通过比例（%）</span><input v-model.number="draft.passPercent" class="field" type="number" min="0" max="100" step="any" :disabled="locked" aria-label="场景通过比例" data-testid="scene-pass-percent" /></label>
              <div class="field-group"><span>安全检查</span><label class="checkbox-label"><input type="checkbox" :checked="draft.requiresSafety || flow?.requiresSafety" :disabled="locked || !!flow?.requiresSafety" aria-label="开始前必须完成安全检查" data-testid="scene-safety" @change="draft.requiresSafety = ($event.target as HTMLInputElement).checked" />开始前必须完成安全检查</label><small class="ws-subtext">关联流程的强制安全门禁不能关闭。</small></div>
              <label class="field-group full"><span>题目描述 / 学员操作要求</span><textarea v-model="draft.description" class="field" rows="3" maxlength="10000" :disabled="locked" aria-label="场景描述" data-testid="scene-description" /></label>
              <small class="ws-subtext full">切换关联流程会更新默认进入页面，不会重建事件或操作列表；如需复制其规则，请用“从流程复制”。草稿自动暂存{{ workspace.storage.persistent ? '于本浏览器' : '于内存，请及时导出' }}。{{ workspace.storage.savedAt ? '最近暂存：' + formatDate(workspace.storage.savedAt) : '' }}</small>
            </div>
            <div data-testid="scene-initial-workload"><SceneWorkloadEditor :key="draft.id" v-model="draft.workload" v-model:name="draft.workloadName" title="初始工况" :disabled="locked" /><p class="ws-source">保存只影响本地场景库；已发布任务、正在测试的场景快照和 WPF 文件不会同步修改。导出当前草稿不等于通过校验。</p></div>
          </div>
        </section>

        <div class="scene-mode-switch" role="tablist" aria-label="操作题编辑模式">
          <button class="ws-chip" role="tab" :aria-selected="draft.mode === 'state'" :class="{ active: draft.mode === 'state' }" :disabled="locked" data-testid="scene-mode-state" @click="changeMode('state')">状态式编辑</button>
          <button class="ws-chip" role="tab" :aria-selected="draft.mode === 'sequence'" :class="{ active: draft.mode === 'sequence' }" :disabled="locked" data-testid="scene-mode-sequence" @click="changeMode('sequence')">操作顺序 / 录制</button>
          <span class="ws-subtext">切换模式保留另一模式的内容，但运行只使用当前模式。</span>
        </div>

        <section v-if="draft.mode === 'state'" class="scene-state-layout" role="tabpanel" aria-label="状态式编辑" data-testid="scene-state-panel">
          <aside class="ws-panel">
            <header class="ws-panel-header"><h3>状态列表</h3><span class="badge">{{ draft.states.length }} 个状态</span></header>
            <div class="ws-panel-body scene-state-sidebar">
              <div class="ws-editor-states">
                <div v-for="state in draft.states" :key="state.id" class="ws-state-item" :class="{ active: selectedState?.id === state.id }" data-testid="scene-state-row" :data-state-id="state.id" :data-kind="state.kind">
                  <button :aria-label="'编辑状态 ' + state.name" :aria-pressed="selectedState?.id === state.id" data-testid="scene-state-select" @click="workspace.data.editorSelectedState = state.id"><span class="ws-state-dot" :class="state.kind" /><span class="scene-state-name">{{ state.name || '未命名状态' }}<small>{{ state.kind === 'initial' ? '唯一初始状态' : state.kind === 'final' ? '唯一终止状态' : draft.initialActiveStates.includes(state.id) ? '初始化激活' : '等待动作激活' }}</small></span></button>
                  <button v-if="state.kind === 'transition'" class="btn btn-sm btn-danger" :disabled="locked" :aria-label="'删除状态 ' + state.name" data-testid="scene-state-delete" @click="deleteState(state)"><UiIcon name="Trash2" :size="13" /></button>
                </div>
              </div>
              <button class="btn" :disabled="locked || draft.states.length >= 500" data-testid="scene-state-add" @click="addState"><UiIcon name="Plus" :size="14" />添加中间状态</button>
              <div class="scene-initial-states" data-testid="scene-initial-active"><h4>初始化激活状态 *</h4><label v-for="state in transitionStates" :key="state.id" class="checkbox-label"><input type="checkbox" :checked="draft.initialActiveStates.includes(state.id)" :disabled="locked" :aria-label="'初始化激活 ' + state.name" @change="toggleInitial(state.id, $event)" />{{ state.name || '未命名状态' }}</label><p v-if="!transitionStates.length" class="ws-subtext">请先添加中间状态。</p><small class="ws-subtext">初始状态自动激活；至少勾选一个中间状态。初始与终止状态不能删除或改为其它类型。</small></div>
            </div>
          </aside>

          <section v-if="selectedState" class="ws-panel" data-testid="scene-selected-state">
            <header class="ws-panel-header"><h3>{{ selectedState.name || '未命名状态' }}</h3><span class="badge">{{ selectedState.kind === 'initial' ? '初始' : selectedState.kind === 'final' ? '终止' : '中间' }}状态</span></header>
            <div class="ws-panel-body">
              <label class="field-group"><span>状态名称</span><input v-model="selectedState.name" class="field" :disabled="locked" maxlength="150" aria-label="状态名称" data-testid="scene-state-name" /></label>
              <p class="scene-state-rule">{{ selectedState.kind === 'initial' ? '这些全局前置条件全部满足后才评估场景事件；初始工况和初始化激活选择见上方与左侧。' : selectedState.kind === 'final' ? '终止状态必须由“激活状态”动作激活，再全部满足下列条件才结束本地测试。未配置条件时，激活即满足终止条件。' : '中间状态处于激活状态，且全部前置条件满足时，才判断本状态中的事件。' }}</p>
              <div class="scene-section-heading"><h4>{{ conditionTitle }}</h4><button class="btn btn-sm" :disabled="locked || selectedState.conditions.length >= 100" data-testid="scene-state-condition-add" @click="addCondition"><UiIcon name="Plus" :size="13" />{{ selectedState.kind === 'final' ? '添加终止条件' : '添加前置条件' }}</button></div>
              <p class="ws-subtext">同级条件按“逻辑与”组合；需要或、非与、非或时添加逻辑条件并编辑其子条件。</p>
              <div v-if="!selectedState.conditions.length" class="scene-empty-inline">未配置条件，默认全部满足。</div>
              <div v-for="(condition, index) in selectedState.conditions" :key="condition.id" class="scene-state-condition" data-testid="scene-state-condition">
                <div class="scene-section-heading"><span class="ws-subtext">{{ conditionTitle }} {{ index + 1 }}</span><button class="btn btn-sm btn-danger" :disabled="locked" :aria-label="'删除' + conditionTitle + (index + 1)" data-testid="scene-state-condition-delete" @click="removeCondition(selectedState, condition)">删除条件</button></div>
                <SceneConditionEditor :model-value="condition" :scene="draft" :label="conditionTitle + ' ' + (index + 1)" :disabled="locked" @update:model-value="replaceCondition(selectedState, condition.id, $event)" />
              </div>
              <hr class="ws-divider" />
              <div class="scene-section-heading"><h4>多事件组</h4><div class="ws-inline"><select v-model="newGroupKind" class="field scene-group-type" :disabled="locked" aria-label="新事件组类型" data-testid="scene-group-new-kind"><option value="score">分数记录组</option><option value="transfer">状态 / 设备动作组</option></select><button class="btn btn-sm" :disabled="locked || selectedState.groups.length >= 100" data-testid="scene-group-add" @click="addGroup"><UiIcon name="Plus" :size="13" />添加事件组</button></div></div>
              <p class="ws-subtext">组类型用于组织事件和选择新动作默认值；运行按各事件条件与动作判断。事件每次测试仅触发一次，不按内置流程步骤计分。当前场景有 {{ scoredEvents.length }} 个加分事件。</p>
              <div v-if="!selectedState.groups.length" class="scene-empty-inline">尚无事件组，请添加分数记录或状态 / 设备动作组。</div>
              <section v-for="group in selectedState.groups" :key="group.id" class="ws-event-group" data-testid="scene-event-group" :data-group-id="group.id">
                <header class="ws-event-group-header scene-group-header"><label><span class="scene-visually-hidden">事件组类型</span><select v-model="group.kind" class="field" :disabled="locked" aria-label="事件组类型"><option value="score">分数记录组</option><option value="transfer">状态 / 设备动作组</option></select></label><label class="scene-group-name"><span class="scene-visually-hidden">事件组名称</span><input v-model="group.name" class="field" :disabled="locked" maxlength="150" aria-label="事件组名称" data-testid="scene-group-name" /></label><span class="scene-toolbar-spacer" /><button class="btn btn-sm" :disabled="locked || events.length >= 5000" data-testid="scene-event-add" @click="addEvent(group)">添加事件</button><button class="btn btn-sm btn-danger" :disabled="locked" :aria-label="'删除事件组 ' + group.name" data-testid="scene-group-delete" @click="removeGroup(selectedState, group)">删除组</button></header>
                <div v-if="!group.events.length" class="scene-empty-inline">此组暂无事件，点击“添加事件”配置条件与动作。</div>
                <article v-for="event in group.events" :key="event.id" class="scene-event" data-testid="scene-event" :data-event-id="event.id">
                  <div class="scene-event-title"><label class="field-group"><span>事件名称</span><input v-model="event.name" class="field" :disabled="locked" maxlength="150" aria-label="事件名称" data-testid="scene-event-name" /></label><button class="btn btn-sm btn-danger" :disabled="locked" :aria-label="'删除事件 ' + event.name" data-testid="scene-event-delete" @click="removeEvent(group, event.id)">删除事件</button></div>
                  <div class="scene-event-editors"><SceneConditionEditor v-model="event.condition" :scene="draft" label="事件条件" :disabled="locked" /><SceneActionEditor v-model="event.action" :scene="draft" label="事件动作" :disabled="locked" /></div>
                </article>
              </section>
            </div>
          </section>
        </section>

        <section v-else class="ws-panel" role="tabpanel" aria-label="操作顺序编辑与录制" data-testid="scene-sequence-panel">
          <header class="ws-panel-header"><h3>操作顺序编辑 / 手动设备录制</h3><span class="badge">{{ draft.legacyOps.length }} / 500 个操作</span></header>
          <div class="ws-panel-body">
            <div class="ws-note">按序号排序后，与本次真实手动设备“打开 / 关闭”记录作 LCS 顺序匹配；仅匹配到的操作按权重计分。<strong>序号不是秒数，同序号不是并发操作组</strong>，相同序号仍按原列表顺序判断。状态式条件和事件在此模式不执行。</div>
            <div class="scene-record-toolbar">
              <label class="checkbox-label"><input v-model="workspace.data.recording.autoIncrement" type="checkbox" :disabled="busy || recordBusy" aria-label="录制与添加操作序号自增" data-testid="scene-record-auto-increment" />序号自增</label>
              <label class="field-group scene-next-index"><span>起始 / 下一操作序号</span><input :value="workspace.data.recording.nextIndex" class="field" type="number" min="0" max="1000000" step="1" :disabled="busy || recordBusy" aria-label="录制起始或下一序号" data-testid="scene-record-next-index" @change="setNextIndex" /></label>
              <button class="btn" :class="recording ? 'btn-danger' : 'btn-primary'" :disabled="busy || recordBusy || (!recording && (!!workspace.active.value || !!workspace.data.pendingLaunch || draft.legacyOps.length >= 500))" data-testid="scene-record-toggle" @click="toggleRecord"><UiIcon :name="recording ? 'Square' : 'Circle'" :size="14" />{{ recording ? '停止录制' : '开始手动录制' }}</button>
              <button class="btn" :disabled="busy" data-testid="scene-return-process" @click="returnToProcess"><UiIcon name="ArrowLeft" :size="14" />返回工艺画面</button>
              <span class="scene-toolbar-spacer" />
              <button class="btn" :disabled="locked || draft.legacyOps.length >= 500" data-testid="scene-operation-add" @click="addOperation"><UiIcon name="Plus" :size="14" />添加操作</button>
              <button class="btn" :disabled="locked || !draft.legacyOps.length" data-testid="scene-operation-reindex" @click="reindexOperations">重排为连续序号</button>
              <button class="btn btn-danger" :disabled="locked || !draft.legacyOps.length" data-testid="scene-operation-clear" @click="clearOperations">清空操作列表</button>
            </div>
            <p class="ws-subtext">录制依赖工作台已有的手动设备记录；初始化、自动流程和场景动作不会冒充手动记录。返回工艺只切换页面，不重新加载流程或丢弃草稿；可通过导航“返回考核”回到此编辑器停录。</p>
            <div class="ws-table-wrap scene-operation-table"><table class="data-table"><thead><tr><th>时间序号（仅排序）</th><th>分数权重</th><th>设备</th><th>设备开关操作</th><th>预计得分份额</th><th>删除</th></tr></thead><tbody>
              <tr v-for="(op, index) in operationRows" :key="op.id" data-testid="scene-operation-row" :data-operation-id="op.id"><td><input v-model.number="op.index" class="field" type="number" min="0" max="1000000" step="1" :disabled="locked" :aria-label="'操作 ' + ((sequencePage - 1) * sequencePageSize + index + 1) + ' 时间序号'" data-testid="scene-operation-index" /></td><td><input v-model.number="op.weight" class="field" type="number" min="0.01" max="10000" step="any" :disabled="locked" :aria-label="'操作 ' + ((sequencePage - 1) * sequencePageSize + index + 1) + ' 分数权重'" data-testid="scene-operation-weight" /></td><td><SceneDeviceSelect v-model="op.deviceId" :label="'操作 ' + ((sequencePage - 1) * sequencePageSize + index + 1) + ' 设备'" operation-only :disabled="locked" /></td><td><select v-model="op.operation" class="field" :disabled="locked" :aria-label="'操作 ' + ((sequencePage - 1) * sequencePageSize + index + 1) + ' 开关'" data-testid="scene-operation-switch"><option value="打开">打开</option><option value="关闭">关闭</option></select></td><td class="ws-nowrap">{{ operationShare(op) }}</td><td><button class="btn btn-sm btn-danger" :disabled="locked" :aria-label="'删除操作序号 ' + op.index" data-testid="scene-operation-delete" @click="removeOperation(op)">删除</button></td></tr>
              <tr v-if="!draft.legacyOps.length"><td colspan="6" class="empty-state">尚无操作。添加操作后选择设备，或开始手动录制并返回工艺操作设备。</td></tr>
            </tbody></table></div>
            <WorkspacePager v-model:page="sequencePage" v-model:page-size="sequencePageSize" :total="operations.length" />
          </div>
        </section>
      </template>
    </div>
  </WorkspaceFrame>

  <BaseModal v-if="copyOpen" title="从工艺流程复制本地场景" :width="610" :close-on-backdrop="false" @close="copyOpen = false"><div class="ws-modal-content ws-stack"><div class="ws-note">复制流程的设备条件为可编辑的中间状态与得分 / 转移事件，不修改原 WPF。生成条件默认判断当前属性（任意来源）；需要真实手动变更时，请将条件来源改为“本次手动属性变更”。</div><label class="field-group"><span>来源工艺流程</span><select v-model="copySource" class="field" aria-label="复制来源工艺流程" data-testid="scene-copy-source"><option v-for="item in workflows" :key="item.id" :value="item.id">{{ item.name }} · {{ item.category }}</option></select></label><p class="ws-subtext">已有草稿不会自动合并；复制会生成新的本地场景编号，之后须校验保存。</p></div><template #footer><button class="btn" @click="copyOpen = false">取消</button><button class="btn btn-primary" :disabled="!copySource || locked" data-testid="scene-copy-confirm" @click="copyWorkflow">创建流程副本</button></template></BaseModal>
  <BaseModal v-if="libraryOpen" title="打开本地已保存操作题" :width="730" :close-on-backdrop="false" @close="libraryOpen = false"><div class="ws-modal-content ws-stack"><input v-model="libraryQuery" class="field" type="search" placeholder="搜索名称 / 描述" aria-label="搜索已保存操作题" /><div class="ws-list"><button v-for="scene in libraryScenes" :key="scene.id" class="ws-list-row" data-testid="scene-library-item" :data-scene-id="scene.id" :disabled="locked" @click="openScene(scene.id)"><UiIcon name="FilePenLine" :size="19" /><div><strong>{{ scene.name }}</strong><small>{{ scene.mode === 'sequence' ? scene.legacyOps.length + ' 个顺序操作' : scene.states.length + ' 个状态' }} · {{ scene.maxScore }} 分 · {{ formatDate(scene.updatedAt) }}</small><small>{{ scene.description || '未填写描述' }}</small></div><span class="badge">打开编辑</span></button><div v-if="!libraryScenes.length" class="empty-state">没有匹配的本地已保存操作题。请先新建、校验保存或导入 JSON。</div></div></div><template #footer><button class="btn" @click="libraryOpen = false">关闭</button></template></BaseModal>
  <OperationStartDialog v-if="testId && draft" :operation-id="testId" :title="draft.name + ' · 本地测试'" :minutes="draft.durationMinutes" return-page="exam" note="此测试先保存当前草稿，再以独立快照在浏览器内执行。只按自编场景事件 / 手动操作序列评分，不是 WPF 引擎考核；提交后产生本地测试成绩。" @close="testId = ''" />
  <ConfirmDialog v-if="confirmation" :title="confirmation.title" :message="confirmation.message" :danger="confirmation.danger" :confirm-text="confirmation.confirmText" @confirm="confirm" @close="confirmation = null" />
</template>

<style scoped>
.scene-editor{display:flex;flex-direction:column;gap:16px;min-width:0}.scene-editor>.ws-note,.scene-editor>.ws-form-error{margin:0}.scene-local-note strong{color:#315f88}.scene-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.scene-toolbar-spacer{flex:1}.scene-file-input{display:none}.scene-empty{display:flex;flex-direction:column;align-items:center;gap:14px;padding:46px 20px;color:#6d8aa7;text-align:center}.scene-empty h2,.scene-empty p{margin:0}.scene-empty>svg{color:#8eb5d7}.scene-basics-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,1fr);gap:20px;align-items:start}.scene-basics-grid .full{grid-column:1/-1}.scene-basics .form-grid{margin:0}.scene-mode-switch{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.scene-state-layout{display:grid;grid-template-columns:275px minmax(0,1fr);gap:18px;align-items:start}.scene-state-sidebar{display:flex;flex-direction:column;gap:14px}.scene-state-name{overflow-wrap:anywhere;min-width:0;flex:1}.scene-state-name small{display:block;font-size:10px;color:#7897b0;margin-top:3px}.scene-initial-states{display:flex;flex-direction:column;gap:10px;border-top:1px solid #dae7f2;padding-top:15px}.scene-initial-states h4{margin:0;color:#426c91;font-size:13px}.scene-initial-states .checkbox-label{align-items:flex-start;overflow-wrap:anywhere}.scene-initial-states input{flex-shrink:0;margin-top:2px}.scene-section-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:12px 0}.scene-section-heading h4{font-size:14px;color:#376589;margin:0}.scene-state-rule{background:#f1f7fe;border:1px solid #d5e6f5;border-radius:6px;padding:10px 12px;color:#6a86a1;font-size:12px;line-height:1.8;margin:14px 0}.scene-state-condition{margin-top:13px}.scene-empty-inline{padding:16px;color:#8299ae;font-size:12px;text-align:center;background:#f8fbff;border:1px dashed #cbdfee;border-radius:6px;margin:12px}.scene-group-type{width:auto;max-width:230px}.scene-group-header{flex-wrap:wrap}.scene-group-name{flex:1;min-width:130px}.scene-group-name .field{width:100%;max-width:none}.scene-group-header select{max-width:200px}.scene-event{padding:15px;border-bottom:1px solid #dce8f2}.scene-event:last-child{border-bottom:0}.scene-event-title{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:13px}.scene-event-title .field-group{flex:1;min-width:0;margin:0}.scene-event-editors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;align-items:start}.scene-record-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.scene-next-index{max-width:175px;margin:0}.scene-operation-table th{white-space:nowrap}.scene-operation-table td:first-child .field,.scene-operation-table td:nth-child(2) .field{min-width:100px;width:115px}.scene-operation-table td:nth-child(3){min-width:290px}.scene-operation-table td:nth-child(4) .field{min-width:90px}.scene-recording-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px;background:#fff6f3;border:1px solid #e7c4b9;border-left:4px solid #cd725b;border-radius:8px;color:#8f6254}.scene-recording-banner strong{font-size:13px}.scene-recording-banner p{font-size:11px;line-height:1.8;margin:5px 0 0}.scene-validation-success{border-color:#b8d9cb;background:#eff9f5;color:#3d8267}.scene-visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
@media(max-width:1250px){.scene-basics-grid{grid-template-columns:1fr 1fr}.scene-state-layout{grid-template-columns:240px minmax(0,1fr)}.scene-event-editors{grid-template-columns:1fr}}
@media(max-width:900px){.scene-basics-grid,.scene-state-layout{grid-template-columns:1fr}.scene-state-sidebar .ws-editor-states{max-height:300px;overflow:auto}.scene-toolbar-spacer{display:none}.scene-recording-banner{flex-wrap:wrap}.scene-mode-switch .ws-subtext{width:100%}}
@media(max-width:600px){.scene-editor{gap:12px}.scene-toolbar .btn{font-size:11px}.scene-basics-grid{gap:14px}.scene-event{padding:10px}.scene-event-title{align-items:center}.scene-next-index{max-width:160px}}
</style>
