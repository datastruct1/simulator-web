<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { safetyGateEnabled, useSimulator } from '../../state/simulator'
import { safetySections, safetyTabs, requiredSafetyKeys, itemKey, type SafetyItem, type SafetySection } from './checklist'
import { createFormValues, safetyForms, validateSafetyForm } from './forms'
import { clone, downloadCsv, errorMessage, readJsonFile } from '../dialogs/toolHelpers'
import SafetyForms from './SafetyForms.vue'

interface Signature { initiator: string; receiver: string; dateI: string; dateR: string; reviewed: boolean; confirmed: boolean }
const { state, currentFlow, completeSafety, notify, record, navigate, openModal, downloadJson } = useSimulator()
const activeTab = ref('prepare')
const search = ref('')
const onlyIncomplete = ref(false)
const notes = reactive<Record<string, string>>({})
const formValues = reactive(createFormValues())
const signatures = reactive<Record<string, Signature>>(Object.fromEntries(safetyTabs.map(tab => [tab.id, { initiator: '', receiver: '', dateI: '', dateR: '', reviewed: false, confirmed: false }])))
const errors = ref<string[]>([])
const hint = ref<{ section: SafetySection; item: SafetyItem } | null>(null)
const confirmation = ref<'all' | 'revoke' | null>(null)
const fileInput = ref<HTMLInputElement>()
const STORAGE = 'simulator_web.safety.v1'
state.requiredSafetyKeys = [...requiredSafetyKeys]

function applyMetadata(raw: unknown, restoreChecks = false) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
  const data = raw as Record<string, any>
  for (const tab of safetyTabs) {
    const incoming = data.signatures?.[tab.id]
    if (incoming && typeof incoming === 'object') {
      for (const key of ['initiator', 'receiver', 'dateI', 'dateR'] as const) if (typeof incoming[key] === 'string') signatures[tab.id]![key] = incoming[key].slice(0, 120)
      signatures[tab.id]!.reviewed = incoming.reviewed === true
      signatures[tab.id]!.confirmed = incoming.confirmed === true
    }
    const incomingForm = data.forms?.[tab.id]
    if (incomingForm && formValues[tab.id]) for (const key of Object.keys(formValues[tab.id]!)) if (typeof incomingForm[key] === 'string') formValues[tab.id]![key] = incomingForm[key].slice(0, 180)
  }
  if (data.notes && typeof data.notes === 'object') for (const section of safetySections) for (const item of section.items) {
    const key = `${section.id}:${item.id}`
    if (typeof data.notes[key] === 'string') notes[key] = data.notes[key].slice(0, 400)
  }
  if (restoreChecks && data.checklist && typeof data.checklist === 'object') for (const key of requiredSafetyKeys) state.checklist[key] = data.checklist[key] === true
}
if (state.workspaces.safety) applyMetadata(state.workspaces.safety)
else {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null')
    applyMetadata(saved, !Object.keys(state.checklist).some(key => key.startsWith('safety:')))
  } catch { /* An invalid local draft does not grant safety approval. */ }
}
for (const key of requiredSafetyKeys) if (state.checklist[key] === undefined) state.checklist[key] = false

const currentSection = computed(() => safetySections.find(section => section.id === activeTab.value))
const currentSignature = computed(() => signatures[activeTab.value]!)
const completedCount = computed(() => requiredSafetyKeys.filter(key => state.checklist[key] === true).length)
const remaining = computed(() => requiredSafetyKeys.length - completedCount.value)
const percentage = computed(() => Math.round(completedCount.value / requiredSafetyKeys.length * 100))
const visibleItems = computed(() => currentSection.value?.items.filter(item => {
  if (onlyIncomplete.value && rowCompleted(currentSection.value!, item)) return false
  return !search.value || item.name.toLowerCase().includes(search.value.toLowerCase()) || String(item.id).includes(search.value)
}) || [])
const currentFormErrors = computed(() => safetyForms[activeTab.value] ? validateSafetyForm(activeTab.value, formValues[activeTab.value]!) : [])
const allSectionsComplete = computed(() => safetySections.every(section => section.items.every(item => rowCompleted(section, item))))
function tabCount(tabId: string) { const keys = requiredSafetyKeys.filter(key => key.startsWith(`safety:${tabId}:`)); return { total: keys.length, checked: keys.filter(key => state.checklist[key]).length } }
function rowCompleted(section: SafetySection, item: SafetyItem) { return Boolean(state.checklist[itemKey(section.id, item.id, 'initiator')] && (!section.bilateral || state.checklist[itemKey(section.id, item.id, 'receiver')])) }
function invalidateApproval() {
  if (safetyGateEnabled && state.safetyComplete && state.flowRunning && currentFlow.value?.requiresSafety) { state.paused = true; notify('安全检查被撤销，当前加注相关流程已暂停，请重新确认安全条件。', 'warning') }
  state.safetyComplete = false
}
function changeCheck(section: SafetySection, item: SafetyItem, side: 'initiator' | 'receiver', checked: boolean) {
  state.checklist[itemKey(section.id, item.id, side)] = checked
  if (!checked) { state.checklist[`safety:${section.id}:signed`] = false; signatures[section.id]!.confirmed = false; invalidateApproval() }
  record(`${checked ? '确认' : '撤销'}安全检查 · ${section.bilateral ? side === 'initiator' ? '加注方' : '受注船' : '状态确认'}：${item.name}`)
}
function confirmItem(section: SafetySection, item: SafetyItem) {
  state.checklist[itemKey(section.id, item.id, 'initiator')] = true
  if (section.bilateral) state.checklist[itemKey(section.id, item.id, 'receiver')] = true
  record(`检查无误：${section.title} · ${item.name}`)
  notify('该检查项目已确认。', 'success')
  hint.value = null
  if (item.target && safetyTabs.some(tab => tab.id === item.target)) selectTab(item.target)
}
function inspectItem(section: SafetySection, item: SafetyItem) {
  hint.value = { section, item }
  if (item.cabinet) openModal('inventory', '模型展示柜 · 消防设施', { category: item.cabinet })
}
function bulkCheck(section?: SafetySection) {
  const targets = section ? [section] : safetySections
  for (const target of targets) for (const item of target.items) {
    state.checklist[itemKey(target.id, item.id, 'initiator')] = true
    if (target.bilateral) state.checklist[itemKey(target.id, item.id, 'receiver')] = true
  }
  if (!section) {
    const defaults = createFormValues()
    const date = new Date()
    const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    for (const tab of safetyTabs) {
      if (safetyForms[tab.id] && validateSafetyForm(tab.id, formValues[tab.id]!).length) Object.assign(formValues[tab.id]!, defaults[tab.id])
      Object.assign(signatures[tab.id]!, { initiator: '模拟加注方', receiver: '模拟受注方', dateI: today, dateR: today, reviewed: true, confirmed: true })
      state.checklist[`safety:${tab.id}:signed`] = true
      if (safetyForms[tab.id]) state.checklist[`safety:${tab.id}:data`] = validateSafetyForm(tab.id, formValues[tab.id]!).length === 0
    }
  }
  confirmation.value = null
  record(`${section ? section.title : '全部安全检查表'} · 一键确认检查项目`)
  if (section) notify(`${section.title}检查项目已勾选，请核实表单并签名。`, 'success')
  else finishSafety()
}
function validSignature(id: string): string[] {
  const signature = signatures[id]!
  const missing: string[] = []
  for (const [key, label] of [['initiator', '加注方代表签名'], ['receiver', '受注船代表签名']] as const) {
    const value = signature[key].trim()
    if (!value || /^(N\/A|待签字|未签字|签名|[-—]+)$/i.test(value)) missing.push(`请填写${label}。`)
  }
  for (const [key, label] of [['dateI', '加注方签名日期'], ['dateR', '受注船签名日期']] as const) if (!/^\d{4}-\d{2}-\d{2}$/.test(signature[key]) || Number.isNaN(Date.parse(signature[key]))) missing.push(`请填写有效的${label}。`)
  if (!signature.reviewed) missing.push('请勾选“已核实本表所有项目和数据”。')
  return missing
}
function confirmTab() {
  const id = activeTab.value
  const section = currentSection.value
  const missing = validSignature(id)
  if (section && !section.items.every(item => rowCompleted(section, item))) missing.unshift('该检查表尚有未确认的检查项目。')
  if (safetyForms[id]) missing.unshift(...currentFormErrors.value)
  errors.value = missing
  if (missing.length) { notify(`不能通过：${missing[0]}`, 'warning'); return }
  signatures[id]!.confirmed = true
  state.checklist[`safety:${id}:signed`] = true
  if (safetyForms[id]) state.checklist[`safety:${id}:data`] = true
  record(`${safetyTabs.find(tab => tab.id === id)?.title} · 双方签字确认：${signatures[id]!.initiator} / ${signatures[id]!.receiver}`)
  notify('本表检查、数据及双方签名已确认。', 'success')
  persist()
}
function verifyMetadata() {
  for (const tab of safetyTabs) {
    const id = tab.id
    if (!signatures[id]!.confirmed || validSignature(id).length) state.checklist[`safety:${id}:signed`] = false
    if (safetyForms[id] && validateSafetyForm(id, formValues[id]!).length) { state.checklist[`safety:${id}:data`] = false; state.checklist[`safety:${id}:signed`] = false }
    const section = safetySections.find(item => item.id === id)
    if (section && !section.items.every(item => rowCompleted(section, item))) state.checklist[`safety:${id}:signed`] = false
  }
  if (remaining.value) state.safetyComplete = false
}
verifyMetadata()
function finishSafety() {
  verifyMetadata()
  if (remaining.value) {
    const first = safetyTabs.find(tab => { const count = tabCount(tab.id); return count.checked < count.total })
    if (first) selectTab(first.id)
    notify(`还需完成 ${remaining.value} 个确认项（含数据及双方签名），未完成不能通过。`, 'warning')
    return
  }
  if (completeSafety(requiredSafetyKeys)) persist()
}
function revoke() {
  invalidateApproval()
  for (const key of requiredSafetyKeys) state.checklist[key] = false
  for (const signature of Object.values(signatures)) { signature.confirmed = false; signature.reviewed = false }
  confirmation.value = null
  record('撤销全部安全检查及签收确认，保留编辑内容供复核', '', '警告')
  notify('已撤销安全检查，重新确认前不能开始加注。', 'warning')
  persist()
}
function selectTab(id: string) { activeTab.value = id; search.value = ''; errors.value = []; hint.value = null }
function fillToday() { const date = new Date(); const today = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; currentSignature.value.dateI = today; currentSignature.value.dateR = today }
function calculateMass() {
  const values = formValues.receipt!
  const density = Number(values.density), volume = Number(values.standardVolume)
  if (!Number.isFinite(density) || !Number.isFinite(volume) || density <= 0 || volume < 0) return notify('请填写有效的密度与总标准体积。', 'warning')
  values.totalMass = (density * volume / 1000).toFixed(3).replace(/\.?0+$/, '')
  notify(`总加注质量已计算为 ${values.totalMass} t。`, 'success')
}
function metadata() { return { forms: clone(formValues), signatures: clone(signatures), notes: clone(notes), checklist: Object.fromEntries(requiredSafetyKeys.map(key => [key, Boolean(state.checklist[key])])) } }
function persist() {
  const data = metadata()
  state.workspaces.safety = data
  try { localStorage.setItem(STORAGE, JSON.stringify(data)) } catch { /* Editable checks remain in memory if browser storage is full. */ }
}
let persistTimer: ReturnType<typeof setTimeout> | undefined
for (const tab of safetyTabs) {
  watch(() => [formValues[tab.id], signatures[tab.id]!.initiator, signatures[tab.id]!.receiver, signatures[tab.id]!.dateI, signatures[tab.id]!.dateR], () => {
    state.checklist[`safety:${tab.id}:signed`] = false
    if (safetyForms[tab.id]) state.checklist[`safety:${tab.id}:data`] = false
    signatures[tab.id]!.confirmed = false
    signatures[tab.id]!.reviewed = false
    invalidateApproval()
  }, { deep: true, flush: 'sync' })
  watch(() => signatures[tab.id]!.reviewed, value => { if (!value) { state.checklist[`safety:${tab.id}:signed`] = false; signatures[tab.id]!.confirmed = false; invalidateApproval() } }, { flush: 'sync' })
}
watch(() => [formValues, signatures, notes, state.checklist], () => { if (persistTimer) clearTimeout(persistTimer); persistTimer = setTimeout(persist, 250) }, { deep: true })
onUnmounted(() => { if (persistTimer) clearTimeout(persistTimer); persist() })
function exportJson() { downloadJson('甲醇加注安全检查表.json', { schemaVersion: 1, type: 'safety-checklist', exportedAt: new Date().toISOString(), user: state.userName, safetyComplete: state.safetyComplete, ...metadata() }); record('导出安全检查表 JSON') }
function exportCsv() {
  const rows: unknown[][] = safetySections.flatMap(section => section.items.map(item => [section.title, item.id, item.name, state.checklist[itemKey(section.id,item.id,'initiator')] ? '已确认' : '未确认', section.bilateral ? state.checklist[itemKey(section.id,item.id,'receiver')] ? '已确认' : '未确认' : '不适用', notes[`${section.id}:${item.id}`] || '']))
  for (const [id, form] of Object.entries(safetyForms)) for (const field of form.groups.flatMap(group => group.fields)) rows.push([form.title, field.key, field.label, formValues[id]![field.key], field.unit || '', ''])
  for (const tab of safetyTabs) rows.push([tab.title, '签字确认', signatures[tab.id]!.initiator, signatures[tab.id]!.dateI, signatures[tab.id]!.receiver, signatures[tab.id]!.dateR])
  downloadCsv('安全检查及签收记录.csv', ['检查表','原编号 / 字段','检查项目 / 参数','加注方 / 数值','受注船 / 单位','备注 / 日期'], rows)
  record('导出安全检查记录 CSV')
}
async function importChecks(event: Event) {
  try {
    const raw = await readJsonFile(event)
    if (raw === undefined) return
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw as any).type !== 'safety-checklist' || (raw as any).schemaVersion !== 1) throw new Error('请选择本页面导出的安全检查表 JSON。')
    invalidateApproval()
    applyMetadata(raw, true)
    // Vue synchronous validation intentionally invalidates imported confirmations; only validated metadata may restore them.
    const data = raw as Record<string, any>
    for (const tab of safetyTabs) {
      const incoming = data.signatures?.[tab.id]
      signatures[tab.id]!.reviewed = incoming?.reviewed === true
      signatures[tab.id]!.confirmed = incoming?.confirmed === true
      state.checklist[`safety:${tab.id}:signed`] = data.checklist?.[`safety:${tab.id}:signed`] === true
      if (safetyForms[tab.id]) state.checklist[`safety:${tab.id}:data`] = data.checklist?.[`safety:${tab.id}:data`] === true
    }
    verifyMetadata()
    persist()
    record('导入安全检查表（仍须再次申请安全通过）')
    notify('检查表已导入。已校验数据及签名，请再次点击检查是否完成。', 'success')
  } catch (error) { notify(errorMessage(error), 'error') }
}
</script>

<template>
  <main class="safety-page">
    <header class="safety-heading"><div class="heading-icon">✓</div><div><span>作业许可 · BUNKERING SAFETY</span><h1>加注作业安全检查</h1><p>按原桌面版本九张检查 / 数据表逐项核实，双方签字确认后方可通过。</p></div><div class="heading-state" :class="{ approved: state.safetyComplete }">{{ state.safetyComplete ? '安全检查已通过' : '安全检查未完成' }}</div><button class="btn" type="button" @click="navigate(state.previousPage === 'safety' ? 'overview' : state.previousPage || 'overview')">返回工艺图</button></header>
    <section class="progress-card card"><div><strong>{{ percentage }}%</strong><span>全部 {{ requiredSafetyKeys.length }} 个确认项 · 已完成 {{ completedCount }} · 尚需 {{ remaining }}</span></div><div class="progress-track"><span :style="{ width: `${percentage}%` }"/></div><div class="progress-actions"><button class="btn" type="button" @click="confirmation = 'all'">全部确认</button><button class="btn" type="button" @click="exportCsv">导出 CSV</button><button class="btn" type="button" @click="exportJson">导出检查表</button><button class="btn" type="button" @click="fileInput?.click()">导入检查表</button><button class="btn btn-danger" type="button" @click="confirmation = 'revoke'">撤销安全检查</button><input ref="fileInput" class="hidden-file" type="file" accept=".json,application/json" @change="importChecks"></div></section>
    <div v-if="confirmation" class="confirm-panel card" role="status"><div><strong>{{ confirmation === 'all' ? '确认全部 183 个检查项目？' : '撤销全部安全检查？' }}</strong><p>{{ confirmation === 'all' ? '训练模式将使用模拟签名；无效数据表会恢复为示例数据。这不代表实际作业安全确认。' : '将取消所有勾选、数据核实和签收确认。保留表单编辑内容，正在运行的加注相关流程会暂停。' }}</p></div><button class="btn" type="button" @click="confirmation = null">取消</button><button class="btn" :class="confirmation === 'all' ? 'btn-primary' : 'btn-danger'" type="button" @click="confirmation === 'all' ? bulkCheck() : revoke()">{{ confirmation === 'all' ? '我已核实，确认勾选' : '确认撤销' }}</button></div>
    <nav class="safety-tabs tabs" aria-label="九张安全检查表"><button v-for="(tab,index) in safetyTabs" :key="tab.id" class="safety-tab" :class="{ active: activeTab === tab.id, done: tabCount(tab.id).checked === tabCount(tab.id).total }" type="button" @click="selectTab(tab.id)"><span>{{ String(index+1).padStart(2,'0') }}</span>{{ tab.title }}<small>{{ tabCount(tab.id).checked === tabCount(tab.id).total ? '✓ 已确认' : `${tabCount(tab.id).checked}/${tabCount(tab.id).total}` }}</small></button></nav>
    <section v-if="currentSection" class="checklist-card card">
      <div class="checklist-toolbar"><div><h2>{{ currentSection.title }}</h2><small>{{ currentSection.bilateral ? '加注方与受注船分别确认' : '逐项状态确认' }} · 原检查项目 {{ currentSection.items.length }} 项</small></div><label class="search-field"><input v-model="search" class="field" placeholder="搜索检查项目 / 原编号" aria-label="搜索检查项目"></label><label class="check-label"><input v-model="onlyIncomplete" type="checkbox">仅看未完成</label><button class="btn" type="button" @click="bulkCheck(currentSection)">一键检查完成</button></div>
      <div class="checklist-scroll"><table class="data-table checklist-table"><thead><tr><th>检查项目</th><th>{{ currentSection.bilateral ? '加注方' : '状态确认' }}</th><th v-if="currentSection.bilateral">受注船</th><th>操作</th><th>备注</th></tr></thead><tbody><tr v-for="item in visibleItems" :key="item.id" :class="{ checked: rowCompleted(currentSection,item) }"><td><span class="item-id">{{ item.id }}</span>{{ item.name }}</td><td><input type="checkbox" :checked="state.checklist[itemKey(currentSection.id,item.id,'initiator')]" :aria-label="`${item.name} ${currentSection.bilateral ? '加注方' : '状态确认'}`" @change="changeCheck(currentSection,item,'initiator',($event.target as HTMLInputElement).checked)"></td><td v-if="currentSection.bilateral"><input type="checkbox" :checked="state.checklist[itemKey(currentSection.id,item.id,'receiver')]" :aria-label="`${item.name} 受注船`" @change="changeCheck(currentSection,item,'receiver',($event.target as HTMLInputElement).checked)"></td><td><button class="btn inspect-button" type="button" @click="inspectItem(currentSection,item)">{{ rowCompleted(currentSection,item) ? '查看' : '检查' }}</button></td><td><input v-model="notes[`${currentSection.id}:${item.id}`]" class="field remark" :aria-label="`${item.id} 备注`" placeholder="填写备注" maxlength="400"></td></tr><tr v-if="!visibleItems.length"><td :colspan="currentSection.bilateral ? 5 : 4"><div class="empty-state">{{ onlyIncomplete && currentSection.items.every(item => rowCompleted(currentSection!, item)) ? '本表检查项目全部完成，请完成下方双方签字。' : '没有匹配的检查项目。' }}</div></td></tr></tbody></table></div>
    </section>
    <SafetyForms v-else v-model="formValues[activeTab]!" :form-id="activeTab" :errors="errors" @calculate="calculateMass"/>
    <section v-if="hint" class="inspection-card card"><div class="inspection-heading"><h3>检查提示 · 原项目 {{ hint.item.id }}</h3><button class="btn" type="button" @click="hint = null">收起</button></div><p>{{ hint.item.name }}</p><p v-if="hint.item.id === 1">需向加注方提供受注船基本信息，并确认已按规定向主管机关报备；作业前核实加注方计量员的计量培训证明材料。</p><img v-if="hint.item.image" :src="hint.item.image" :alt="hint.item.name"><div class="inspection-actions"><button v-if="hint.item.cabinet" class="btn" type="button" @click="openModal('inventory','模型展示柜 · 消防设施',{category: hint.item.cabinet})">核实消防与个人防护装备</button><button class="btn btn-success" type="button" @click="confirmItem(hint.section,hint.item)">检查无误并确认</button><button class="btn" type="button" @click="hint = null">暂不确认</button></div></section>
    <section class="signature-card card"><div class="signature-heading"><div><h3>双方签字确认</h3><p>请由实际核实本表的代表填写姓名和日期；示例姓名不会自动填入。</p></div><span class="badge" :class="{ 'signed-badge': state.checklist[`safety:${activeTab}:signed`] }">{{ state.checklist[`safety:${activeTab}:signed`] ? '双方已签收' : '待签字核实' }}</span></div><div class="signature-grid"><label>加注设施代表签字确认<input v-model="currentSignature.initiator" class="field signature-input" placeholder="请填写代表姓名（原示例：张三）" maxlength="120"></label><label>日期<input v-model="currentSignature.dateI" class="field" type="date"></label><label>受注船代表签字确认<input v-model="currentSignature.receiver" class="field signature-input" placeholder="请填写代表姓名（原示例：李四）" maxlength="120"></label><label>日期<input v-model="currentSignature.dateR" class="field" type="date"></label></div><div class="signature-tools"><button class="btn" type="button" @click="fillToday">填写今日日期</button><button class="btn" type="button" @click="currentSignature.initiator = state.userName">使用当前用户签名</button><label class="check-label"><input v-model="currentSignature.reviewed" type="checkbox">已核实本表所有项目和数据</label><button class="btn btn-primary" type="button" @click="confirmTab">核实数据并签字确认</button></div><div v-if="errors.length && currentSection" class="signature-errors"><p v-for="error in errors" :key="error">{{ error }}</p></div></section>
    <footer class="safety-footer card"><div><strong>{{ state.safetyComplete ? '安全检查完成，具备作业许可' : allSectionsComplete ? '检查项已勾选，请核实九张表单与双方签名' : '未完成安全检查，暂不具备作业许可' }}</strong><span>撤销任意项目或修改已签收数据，都会撤销本次安全通过状态。</span></div><button class="btn btn-primary complete-button" type="button" @click="finishSafety">检查是否完成{{ remaining ? `（尚缺${remaining}项）` : ' · 安全通过' }}</button><button v-if="state.safetyComplete" class="btn btn-success" type="button" @click="navigate('bunkering-front')">进入加注作业</button></footer>
  </main>
</template>

<style scoped>
.safety-page { color: #3a566d; padding: 22px; background: #f4f8fc; min-height: 100%; }.safety-heading { display: flex; gap: 16px; align-items: center; margin-bottom: 22px; }.heading-icon { height: 52px; width: 52px; border-radius: 14px; background: #dfedf9; display: grid; place-items: center; color: #2d7caf; font-size: 27px; flex-shrink: 0; }.safety-heading span { font-size: 10px; color: #88a4b8; letter-spacing: 1.6px; }.safety-heading h1 { margin: 4px 0 6px; color: #265f89; font-size: 24px; }.safety-heading p { margin: 0; font-size: 12px; color: #8a9caf; }.heading-state { margin-left: auto; font-size: 12px; padding: 8px 14px; border: 1px solid #eccda5; border-radius: 20px; color: #b58b4c; white-space: nowrap; background: #fff9ee; }.heading-state.approved { color: #329878; border-color: #b9dfd0; background: #eef9f4; }.card { background: #fff; border: 1px solid #dce8f2; border-radius: 12px; box-shadow: none; }.progress-card { padding: 18px 22px; display: grid; grid-template-columns: 1fr 260px; gap: 12px 25px; align-items: center; margin-bottom: 18px; }.progress-card > div:first-child { display: flex; gap: 18px; align-items: baseline; }.progress-card strong { font-size: 25px; color: #2a7dad; }.progress-card span { font-size: 12px; color: #8b9fae; }.progress-track { height: 8px; background: #edf4f9; border-radius: 8px; overflow: hidden; }.progress-track span { display: block; height: 100%; background: linear-gradient(90deg,#66a6d1,#459b9f); transition: width .3s; }.progress-actions { grid-column: 1/-1; display: flex; flex-wrap: wrap; gap: 8px; }.progress-actions .btn { font-size: 12px; }.hidden-file { display: none; }.confirm-panel { display: flex; align-items: center; gap: 13px; padding: 18px 22px; margin-bottom: 18px; border-color: #e6d2aa; background: #fffaf0; }.confirm-panel > div { flex: 1; }.confirm-panel p { font-size: 12px; line-height: 1.7; color: #a58e67; margin: 7px 0 0; }.confirm-panel strong { color: #997337; }
.safety-tabs { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 20px; border-bottom: 1px solid #d5e3ef; padding: 0; background: transparent; }.safety-tab { padding: 12px 14px; min-width: 120px; display: flex; flex-direction: column; align-items: flex-start; gap: 5px; border: none; border-bottom: 3px solid transparent; border-radius: 8px 8px 0 0; background: #edf3f9; cursor: pointer; color: #7290a6; font-size: 12px; white-space: nowrap; }.safety-tab > span { font-size: 10px; letter-spacing: 1px; color: #a3b4c2; }.safety-tab > small { font-size: 10px; color: #9aabb7; }.safety-tab.active { background: #fff; color: #2878ab; border-bottom-color: #3389b8; }.safety-tab.done > small { color: #4b9c80; }.checklist-card { overflow: hidden; margin-bottom: 16px; }.checklist-toolbar { display: flex; padding: 19px 20px; align-items: center; gap: 16px; flex-wrap: wrap; }.checklist-toolbar > div:first-child { margin-right: auto; }.checklist-toolbar h2 { font-size: 18px; color: #346e96; margin: 0 0 6px; }.checklist-toolbar small { color: #95a6b4; font-size: 11px; }.search-field { width: 245px; }.field { padding: 9px 11px; border: 1px solid #d9e4ee; background: #fcfdff; border-radius: 6px; color: #3e5d74; box-sizing: border-box; font: inherit; font-size: 12px; width: 100%; }.check-label { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; color: #7892a6; }.checklist-scroll { overflow: auto; max-height: 660px; }.checklist-table { width: 100%; border-collapse: collapse; font-size: 12px; }.checklist-table th { position: sticky; top: 0; z-index: 1; background: #eaf3fb; color: #537998; padding: 12px 15px; white-space: nowrap; border-top: 1px solid #dbe8f2; border-bottom: 1px solid #dbe8f2; }.checklist-table th:first-child { text-align: left; width: 60%; }.checklist-table td { border-bottom: 1px solid #e8eff5; padding: 12px 14px; line-height: 1.7; text-align: center; }.checklist-table td:first-child { text-align: left; min-width: 360px; }.checklist-table td:last-child { min-width: 160px; width: 200px; }.checklist-table tbody tr:hover { background: #f6faff; }.checklist-table tr.checked td:first-child { color: #5a8a7b; }.item-id { display: inline-block; font-size: 10px; color: #9badbd; background: #eff4f8; min-width: 28px; text-align: center; padding: 0 4px; margin-right: 11px; border-radius: 4px; }.checklist-table input[type=checkbox] { height: 17px; width: 17px; accent-color: #4592bb; cursor: pointer; }.inspect-button { padding: 5px 10px; font-size: 11px; white-space: nowrap; }.remark { font-size: 11px; padding: 7px 9px; }.empty-state { padding: 40px; color: #92a9ba; }.inspection-card { padding: 20px; margin-bottom: 16px; border-color: #b4d4ea; background: #f9fcff; }.inspection-heading { display: flex; align-items: center; justify-content: space-between; }.inspection-heading h3 { font-size: 15px; margin: 0; color: #277cb0; }.inspection-card p { line-height: 1.8; font-size: 13px; }.inspection-card img { max-width: 100%; max-height: 480px; object-fit: contain; display: block; margin: 15px auto; }.inspection-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.signature-card { padding: 20px 22px; margin-top: 18px; }.signature-heading { display: flex; justify-content: space-between; gap: 15px; align-items: center; margin-bottom: 22px; }.signature-heading h3 { margin: 0 0 6px; font-size: 16px; color: #4b7290; }.signature-heading p { font-size: 11px; color: #97a7b4; margin: 0; }.badge { padding: 5px 10px; border-radius: 14px; font-size: 11px; color: #8c9dab; background: #f1f5f8; white-space: nowrap; }.signed-badge { color: #32957c; background: #edf8f4; }.signature-grid { display: grid; grid-template-columns: 1.5fr 1fr 1.5fr 1fr; gap: 18px; }.signature-grid label { display: flex; flex-direction: column; gap: 9px; font-size: 12px; color: #6d8598; }.signature-input { border: none; border-bottom: 1px solid #bacede; border-radius: 0; background: #fff; font-size: 15px; }.signature-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 21px; }.signature-tools .btn { font-size: 12px; }.signature-tools .check-label { margin-left: auto; }.signature-errors { margin-top: 15px; color: #b47a55; font-size: 12px; }.signature-errors p { margin: 5px 0; }.safety-footer { display: flex; align-items: center; gap: 15px; padding: 22px; margin-top: 20px; }.safety-footer > div { display: flex; flex-direction: column; gap: 7px; margin-right: auto; }.safety-footer strong { font-size: 14px; color: #587b94; }.safety-footer span { color: #9aaeba; font-size: 11px; }.complete-button { min-height: 42px; padding: 10px 18px; font-size: 13px; }
@media (max-width: 1000px) { .safety-heading { flex-wrap: wrap; }.heading-state { margin-left: 0; }.signature-grid { grid-template-columns: 1.5fr 1fr; }.progress-card { grid-template-columns: 1fr; }.progress-track { grid-row: 2; }.safety-footer { flex-wrap: wrap; } }@media (max-width: 650px) { .safety-page { padding: 12px; }.safety-heading h1 { font-size: 21px; }.safety-heading p { font-size: 11px; }.confirm-panel { flex-wrap: wrap; }.confirm-panel > div { flex-basis: 100%; }.signature-tools .check-label { margin-left: 0; }.checklist-toolbar { padding: 15px; gap: 10px; }.search-field { flex-basis: 100%; }.safety-footer { padding: 16px; }.progress-card > div:first-child { flex-wrap: wrap; gap: 7px; }.signature-grid { gap: 15px 10px; } }
</style>
