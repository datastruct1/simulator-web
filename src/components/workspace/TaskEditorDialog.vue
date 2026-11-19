<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WorkspaceTask } from '../../data/workspace'
import { workflows } from '../../data/catalog'
import { useWorkspace } from '../../state/workspace'
import { clone, conditionText, matches, toDateInput } from './lib/domain'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'
import RosterManager from './RosterManager.vue'
const props = defineProps<{ task: WorkspaceTask }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()
const workspace = useWorkspace(), draft = ref(clone(props.task)), step = ref(0), error = ref(''), query = ref(''), operationQuery = ref(''), studentQuery = ref(''), availableSelected = ref<string[]>([]), assignedSelected = ref<string[]>([]), publishAfter = ref(false)
const startInput = ref(toDateInput(draft.value.startAt) + ':00'), endInput = ref(toDateInput(draft.value.endAt) + ':00')
const papers = computed(() => workspace.data.papers.filter(paper => paper.questionIds.length && matches(`${paper.title} ${paper.description}`, query.value)))
const selectedPaper = computed(() => workspace.data.papers.find(paper => paper.id === draft.value.paperId))
const paperQuestions = computed(() => selectedPaper.value?.questionIds.flatMap(id => { const question = workspace.data.questions.find(question => question.id === id); return question ? [question] : [] }) || [])
const operations = computed(() => workspace.operationItems.value.filter(item => matches(`${item.name} ${item.category}`, operationQuery.value)))
const selectedOperation = computed(() => workspace.operationItems.value.find(item => item.id === draft.value.operationId))
const operationFlow = computed(() => workflows.find(flow => flow.id === selectedOperation.value?.flowId))
const availableStudents = computed(() => workspace.data.students.filter(student => !draft.value.participants.includes(student.id) && matches(`${student.name} ${student.studentNo} ${student.group}`, studentQuery.value)))
const assignedStudents = computed(() => workspace.data.students.filter(student => draft.value.participants.includes(student.id)))
function choosePaper(id: string) { draft.value.paperId = id; const paper = workspace.data.papers.find(item => item.id === id); if (paper) draft.value.durationMinutes = paper.durationMinutes }
function kindChanged() { if (draft.value.kind === 'operation') draft.value.paperId = ''; else draft.value.operationId = '' }
function validate(): boolean {
  error.value = ''
  if (step.value === 0 && draft.value.kind === 'theory' && !selectedPaper.value) error.value = '请选择试卷，或选择“任务为操作任务”。'
  if (step.value === 1 && !selectedOperation.value) error.value = '请选择操作题。'
  if (step.value === 2) {
    if (!startInput.value || !endInput.value || new Date(endInput.value).getTime() <= new Date(startInput.value).getTime()) error.value = '结束时间必须晚于开始时间。'
    else if (new Date(endInput.value).getTime() <= Date.now()) error.value = '结束时间必须晚于当前时间。'
    else if (!draft.value.allStudents && !draft.value.participants.length) error.value = '请选择参与人员，或勾选“全体人员”。'
  }
  return !error.value
}
function next() { if (!validate()) return; if (step.value < 3) step.value = step.value === 0 && draft.value.kind === 'theory' ? 2 : step.value + 1; else save() }
function previous() { error.value = ''; if (!step.value) emit('close'); else step.value = step.value === 2 && draft.value.kind === 'theory' ? 0 : step.value - 1 }
function addStudents(all = false) { draft.value.participants = [...new Set([...draft.value.participants, ...(all ? availableStudents.value.map(student => student.id) : availableSelected.value)])]; availableSelected.value = [] }
function removeStudents(all = false) { draft.value.participants = all ? [] : draft.value.participants.filter(id => !assignedSelected.value.includes(id)); assignedSelected.value = [] }
function save() {
  if (!draft.value.title.trim() || !draft.value.description.trim()) { error.value = '任务名称和描述不能为空。'; return }
  try { draft.value.startAt = new Date(startInput.value).toISOString(); draft.value.endAt = new Date(endInput.value).toISOString() } catch { error.value = '时间格式不正确。'; return }
  if (!workspace.saveTask(draft.value)) return
  if (publishAfter.value && !workspace.publishTask(draft.value.id)) return
  emit('saved', draft.value.id)
}
</script>
<template>
  <BaseModal :title="(task.title ? '编辑任务 · ' + task.title : '新增任务')" :width="1160" :close-on-backdrop="false" @close="emit('close')">
    <div class="ws-modal-content">
      <div class="ws-steps"><div v-for="(title, index) in ['选择试卷', '选择操作题', '设置条件', '保存任务']" :key="title" class="ws-step" :class="{ active: step === index, done: step > index }"><span class="ws-step-number">{{ index + 1 }}</span>{{ title }}<small v-if="index === 1 && draft.kind === 'theory'">（跳过）</small></div></div>
      <div v-if="error" class="ws-form-error" role="alert">{{ error }}</div>
      <div v-if="task.publishedAt" class="ws-note warning">编辑已发布任务会将其保存为草稿，需要重新发布。正在作答和历史成绩使用独立快照，不会因本次编辑改变。</div>
      <section v-if="step === 0">
        <div class="ws-inline" style="margin-bottom:17px"><label class="checkbox-label"><input v-model="draft.kind" type="radio" value="theory" @change="kindChanged" />理论任务</label><label class="checkbox-label"><input v-model="draft.kind" type="radio" value="operation" @change="kindChanged" />✓ 任务为操作任务</label></div>
        <div v-if="draft.kind === 'operation'" class="ws-note">操作任务不需要选择理论试卷。点击“下一步”选择操作题和完成条件。</div>
        <div v-else class="ws-split"><div class="card"><h3>试卷列表</h3><input v-model="query" class="field" placeholder="搜索试卷" style="margin-bottom:12px" /><div class="ws-list" style="max-height:350px"><button v-for="paper in papers" :key="paper.id" class="ws-list-row" :class="{ active: draft.paperId === paper.id }" @click="choosePaper(paper.id)"><div><strong>{{ paper.title }}</strong><small>{{ paper.questionIds.length }} 题 · {{ paper.maxScore }} 分</small></div></button><div v-if="!papers.length" class="empty-state">无可用试卷，请先组卷保存</div></div></div><div class="card"><h3>试卷预览</h3><template v-if="selectedPaper"><h3>{{ selectedPaper.title }}</h3><p class="ws-subtext">{{ selectedPaper.description }}</p><div class="ws-list" style="max-height:300px"><div v-for="(question, index) in paperQuestions" :key="question.id" class="ws-check-row">{{ index + 1 }}. {{ question.content }}</div></div></template><div v-else class="empty-state">请从左侧选择试卷</div></div></div>
      </section>
      <section v-if="step === 1" class="ws-split"><div class="card"><h3>操作题列表</h3><input v-model="operationQuery" class="field" placeholder="搜索操作题" style="margin-bottom:12px" /><div class="ws-list" style="max-height:400px"><button v-for="item in operations" :key="item.id" class="ws-list-row" :class="{ active: draft.operationId === item.id }" @click="draft.operationId = item.id; draft.durationMinutes = item.scene?.durationMinutes || 20"><div><strong>{{ item.name }}</strong><small>{{ item.category }} · {{ item.scene?.maxScore || 100 }} 分</small></div></button></div></div><div class="card"><h3>{{ selectedOperation?.name || '操作完成条件' }}</h3><template v-if="selectedOperation?.scene"><p class="ws-subtext">{{ selectedOperation.scene.description }}</p><div v-for="state in selectedOperation.scene.states" :key="state.id" class="ws-condition-box" style="margin-bottom:9px"><strong>{{ state.name }}</strong><p v-for="condition in state.conditions" :key="condition.id" style="margin:5px 0">⚠ {{ conditionText(condition, selectedOperation.scene) }}</p><p v-for="event in state.groups.flatMap(group => group.events).filter(event => event.action.kind === 'score')" :key="event.id" style="margin:5px 0">✓ {{ conditionText(event.condition, selectedOperation.scene) }}</p></div></template><template v-else-if="operationFlow"><div class="ws-note">共 {{ operationFlow.steps.length }} 个步骤 · {{ operationFlow.requiresSafety ? '需先完成安全检查' : '手动操作考核' }}</div><div class="ws-list" style="max-height:330px"><div v-for="(item, index) in operationFlow.steps" :key="index" class="ws-condition-box"><strong>{{ index + 1 }}. {{ item.name }}</strong><p style="margin:5px 0">{{ item.description }}</p><small>完成条件 {{ item.rules.length }} 项</small></div></div></template><div v-else class="empty-state">请选择操作题</div></div></section>
      <section v-if="step === 2" class="ws-stack">
        <div class="form-grid"><label class="field-group"><span>开始时间（年月日时分秒）</span><input v-model="startInput" type="datetime-local" step="1" class="field" /></label><label class="field-group"><span>结束时间 / 截止时间</span><input v-model="endInput" type="datetime-local" step="1" class="field" /></label><label class="field-group"><span>考核 / 练习模式</span><select v-model="draft.mode" class="field"><option value="exam">考试（限时、不显示答案）</option><option value="practice">练习（可查看答案、允许重练）</option></select></label><label class="field-group"><span>考试时长（分钟）</span><input v-model.number="draft.durationMinutes" type="number" min="1" max="1440" class="field" /></label><label class="checkbox-label full"><input v-model="draft.scoreVisible" type="checkbox" />成绩可见性：提交后允许学员查看成绩和详情</label><label class="field-group full"><span>备注</span><textarea v-model="draft.remark" class="field" rows="2" /></label></div>
        <div class="ws-title-line"><h3>参与人员</h3><RosterManager /></div><label class="checkbox-label"><input v-model="draft.allStudents" type="checkbox" />全体人员（本地名册的所有学员）</label>
        <div v-if="!draft.allStudents"><input v-model="studentQuery" class="field" placeholder="搜索姓名 / 学号 / 班级" style="max-width:350px;margin-bottom:12px" /><div class="ws-transfer"><div><div class="ws-transfer-title">可选人员</div><div class="ws-transfer-list" style="height:235px"><label v-for="student in availableStudents" :key="student.id" class="checkbox-label"><input v-model="availableSelected" type="checkbox" :value="student.id" /><span>{{ student.name }} · {{ student.studentNo }}<small class="ws-subtext" style="display:block">{{ student.group }}</small></span></label></div></div><div class="ws-transfer-arrows"><button class="btn btn-sm" @click="addStudents()">添加 ⇛</button><button class="btn btn-sm" @click="addStudents(true)">全部 ⇛</button><button class="btn btn-sm" @click="removeStudents()">⇚ 移除</button><button class="btn btn-sm" @click="removeStudents(true)">⇚ 清空</button></div><div><div class="ws-transfer-title">已选人员 · {{ assignedStudents.length }} 人</div><div class="ws-transfer-list" style="height:235px"><label v-for="student in assignedStudents" :key="student.id" class="checkbox-label"><input v-model="assignedSelected" type="checkbox" :value="student.id" /><span>{{ student.name }} · {{ student.studentNo }}</span></label></div></div></div></div>
        <div><h3>任务附件</h3><div class="ws-tag-row"><label v-for="file in workspace.data.files" :key="file.id" class="checkbox-label ws-tag"><input v-model="draft.attachmentIds" type="checkbox" :value="file.id" />{{ file.name }}</label><span v-if="!workspace.data.files.length" class="ws-subtext">请先在文件管理中添加用户文件</span></div></div>
      </section>
      <section v-if="step === 3" class="ws-stack"><div class="form-grid"><label class="field-group full"><span>任务名称 *</span><input v-model="draft.title" class="field" maxlength="120" placeholder="请输入任务名称" /></label><label class="field-group full"><span>任务描述 *</span><textarea v-model="draft.description" class="field" rows="4" placeholder="向参与学员说明任务要求" /></label></div><div class="ws-details"><div class="ws-detail-item"><span>试卷 / 操作题</span><strong>{{ draft.kind === 'theory' ? selectedPaper?.title : selectedOperation?.name }}</strong></div><div class="ws-detail-item"><span>参与人员</span><strong>{{ draft.allStudents ? '全体人员' : assignedStudents.map(student => student.name).join('、') }}</strong></div><div class="ws-detail-item"><span>时间范围</span><strong>{{ startInput.replace('T', ' ') }} 至 {{ endInput.replace('T', ' ') }}</strong></div><div class="ws-detail-item"><span>模式与时限</span><strong>{{ draft.mode === 'exam' ? '考试' : '练习' }} · {{ draft.durationMinutes }} 分钟</strong></div></div><label class="checkbox-label"><input v-model="publishAfter" type="checkbox" />保存后立即发布到本地学员列表</label><div class="ws-note">“发布”只改变当前浏览器内的任务可见性，不发送网络请求，不保证任何其他设备收到任务。</div></section>
    </div>
    <template #footer><button class="btn" @click="previous">{{ step === 0 ? '返回' : '上一步' }}</button><button class="btn btn-primary" @click="next"><UiIcon :name="step === 3 ? 'Save' : 'ArrowRight'" :size="15" />{{ step === 3 ? '保存任务' : '下一步' }}</button></template>
  </BaseModal>
</template>
