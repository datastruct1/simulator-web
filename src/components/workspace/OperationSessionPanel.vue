<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { workflows } from '../../data/catalog'
import type { OperationSession, ReturnPage } from '../../data/workspace'
import type { FlowAssessmentDefinition, FlowAssessmentRuntime } from '../../types/flowAssessment'
import type { Workflow } from '../../types/simulator'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
import { operationDetails } from './lib/assessment'
import { flowAssessmentDetails } from './lib/flowAssessment'
import { conditionText, formatDate, formatDuration, round } from './lib/domain'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'

const props = withDefaults(defineProps<{ returnPage?: ReturnPage }>(), { returnPage: 'student' })
const workspace = useWorkspace(), simulator = useSimulator()
const session = computed(() => workspace.data.activeOperation?.returnPage === props.returnPage ? workspace.data.activeOperation : null)
const pending = computed(() => workspace.data.pendingLaunch?.returnPage === props.returnPage ? workspace.data.pendingLaunch : null)
const launch = computed(() => session.value || pending.value)
const flow = computed(() => workflows.find(item => item.id === launch.value?.flowId))
const flowRuntime = computed(() => (session.value as (OperationSession & { flowAssessment?: FlowAssessmentRuntime }) | null)?.flowAssessment)
const flowDefinition = computed(() => !launch.value?.scene ? flowRuntime.value?.definition || (!session.value ? (flow.value as (Workflow & { assessment?: FlowAssessmentDefinition }) | undefined)?.assessment : undefined) : undefined)
const kind = computed(() => launch.value?.scene ? launch.value.scene.mode === 'sequence' ? 'sequence' : 'state' : flowDefinition.value ? 'stages' : 'derived')
const kindName = computed(() => kind.value === 'sequence' ? '自编顺序操作题（录制操作）' : kind.value === 'state' ? '自编状态 / 事件操作题' : kind.value === 'stages' ? '原 WPF Playbook 阶段考核' : '工况派生训练（步骤评估）')
const canShowPractice = computed(() => session.value?.mode === 'practice' && session.value.scoreVisible)
const progress = computed(() => canShowPractice.value && session.value ? workspace.operationProgress(session.value) : null)
const details = computed(() => canShowPractice.value && session.value ? operationDetails(session.value) : [])
const originalStages = computed(() => {
  const runtime = flowRuntime.value
  if (!canShowPractice.value || !runtime) return []
  const evaluated = flowAssessmentDetails(runtime)
  return runtime.definition.stages.map((stage, index) => ({
    name: stage.name, index, settled: index < runtime.nextStageIndex,
    details: evaluated.filter(detail => detail.stageIndex === index).map(detail => ({ ...detail, settled: runtime.rules.find(rule => rule.id === detail.id)?.passed != null })),
  }))
})
const sequence = computed(() => [...(launch.value?.scene?.legacyOps || [])].sort((a, b) => a.index - b.index))
const eventCount = computed(() => launch.value?.scene?.states.reduce((sum, state) => sum + state.groups.reduce((total, group) => total + group.events.length, 0), 0) || 0)
const elapsed = computed(() => session.value ? Math.max(0, (workspace.now.value - session.value.startedAt) / 1000) : 0)
const remaining = computed(() => session.value?.deadlineAt != null ? Math.max(0, Math.ceil((session.value.deadlineAt - workspace.now.value) / 1000)) : null)
const pendingTask = computed(() => workspace.data.tasks.find(task => task.id === pending.value?.taskId))
const pendingUnavailable = computed(() => !session.value && !!pendingTask.value && (workspace.now.value < Date.parse(pendingTask.value.startAt) || workspace.now.value >= Date.parse(pendingTask.value.endAt)))
const needsSafety = computed(() => !!(flow.value?.requiresSafety || launch.value?.scene?.requiresSafety) && !simulator.state.safetyComplete)
const confirmation = ref<{ action: 'submit' | 'cancel'; sessionId: string } | null>(null)
function expired() {
  if (session.value?.deadlineAt != null && Date.now() >= session.value.deadlineAt) { workspace.submitOperation('timeout'); return true }
  return false
}
function resume() {
  if (expired() || pendingUnavailable.value) return
  if (session.value) workspace.resumeOperation()
  else workspace.resumePendingOperation()
}
function ask(action: 'submit' | 'cancel') {
  if (!launch.value || expired() || (action === 'submit' && !session.value)) return
  confirmation.value = { action, sessionId: launch.value.id }
}
function confirm() {
  if (!confirmation.value || launch.value?.id !== confirmation.value.sessionId) { confirmation.value = null; return }
  if (!expired()) {
    if (confirmation.value.action === 'submit' && session.value) workspace.submitOperation()
    else workspace.cancelAssessment()
  }
  confirmation.value = null
}
function stateStatus(id: string) {
  return session.value?.disabledStateIds.includes(id) ? '禁用' : session.value?.activeStateIds.includes(id) ? '激活' : session.value?.stoppedStateIds.includes(id) ? '停止' : '未激活'
}
watch(() => launch.value?.id, () => { confirmation.value = null })
</script>

<template>
  <section v-if="launch" class="ws-panel operation-session" :data-testid="session ? 'operation-session' : 'operation-pending'" aria-label="当前手动操作会话">
    <header class="ws-panel-header"><div><h2><UiIcon name="Workflow" :size="20" /> {{ session ? '当前手动操作会话' : '待开始操作 / 安全检查' }}</h2><p class="ws-subtext identity">{{ launch.studentName }} · {{ launch.studentNo }} · {{ launch.mode === 'exam' ? '操作考评' : '操作练习' }}</p></div><span class="badge" :class="session?.finished ? 'badge-success' : 'badge-warning'">{{ !session ? '尚未开始计时' : session.finished ? '已达到结束条件，待交卷' : !session.runReady ? '待恢复工艺' : '会话进行中' }}</span></header>
    <div class="ws-panel-body ws-stack">
      <div class="ws-title-line"><h3>{{ launch.title }}</h3><span class="badge badge-muted" data-testid="operation-definition-kind">{{ kindName }}</span></div>
      <div v-if="!session" class="ws-note" role="status">已保留本次选择，尚未建立作答会话。{{ needsSafety ? '请先完成加注作业前安全检查，检查通过后点击继续训练。' : '点击继续训练，载入本地初始工况后才开始计时。' }}任务截止时间仍然有效。</div>
      <div v-else-if="!session.runReady" class="ws-note warning" role="status" data-testid="operation-recovery-note">已恢复原会话用时及已记录得分点，但不保证完整设备快照恢复。需要点击“重新初始化工艺 / 继续操作”载入初始工况，考评计时不会重置，已记录的手动操作与分数记录保留。</div>
      <div v-if="pendingUnavailable" class="ws-note danger" role="status">关联任务不在可开始时间范围内，不能继续启动。请取消本次选择并返回任务列表查看时间安排。</div>
      <div v-if="session && simulator.state.paused" class="ws-note warning" role="status">仿真画面当前已暂停，但本次考评的真实时钟不会暂停。</div>
      <div v-if="session?.autoDemoDetected" class="ws-note warning" role="status">本次曾检测到自动演示；自动推进不计入手动考核。最终以保存的手动操作与本地规则评估结果为准。</div>
      <div class="ws-details">
        <div class="ws-detail-item"><span>{{ kind === 'stages' ? '原阶段考核流程' : kind === 'derived' ? '工况派生训练流程' : '关联工艺 / 初始工况' }}</span><strong>{{ flow?.name || launch.flowId }}<small v-if="kind === 'state' || kind === 'sequence'" class="ws-subtext">（关联流程不自动推进得分，按自编定义运行）</small></strong></div>
        <div class="ws-detail-item"><span>考核定义 / 结算进度</span><strong data-testid="operation-stage-summary">{{ kind === 'sequence' ? `${sequence.length} 个录制操作，按时间序号与操作次序匹配` : kind === 'state' ? `${launch.scene?.states.length || 0} 个状态 / ${eventCount} 个事件` : kind === 'stages' ? `${flowDefinition?.stages.length || 0} 个原阶段 · 已结算 ${flowRuntime?.nextStageIndex || 0} 个` : `${session?.steps.length || flow?.steps.length || 0} 个派生训练步骤（不是原 Playbook 阶段定义）` }}</strong></div>
        <div class="ws-detail-item"><span>{{ remaining == null ? session ? '真实操作用时' : '开始时机' : '真实剩余时间' }}</span><strong v-if="!session">安全检查 / 初始工况就绪后开始</strong><div v-else class="ws-time" :class="{ warning: remaining != null && remaining <= 300 }" role="timer" aria-live="off" aria-label="操作会话真实时钟" data-testid="operation-timer">{{ formatDuration(remaining == null ? elapsed : remaining) }}</div></div>
        <div class="ws-detail-item"><span>{{ session ? '开始 / 截止时间' : '设置的考评时限' }}</span><strong v-if="session">{{ formatDate(session.startedAt) }}<br />{{ session.deadlineAt != null ? formatDate(session.deadlineAt) : '自由练习无倒计时' }}</strong><strong v-else>{{ launch.durationMinutes }} 分钟{{ launch.mode === 'practice' ? '（自由练习仅累计真实用时）' : '' }}<span v-if="pendingTask"><br />任务截止：{{ formatDate(pendingTask.endAt) }}</span></strong></div>
        <div v-if="session" class="ws-detail-item"><span>本次实际手动操作记录</span><strong>{{ session.recordedOps.length }} 次设备打开 / 关闭记录</strong></div>
        <div class="ws-detail-item"><span>成绩可见性</span><strong>{{ launch.scoreVisible ? '交卷后可查看成绩与详细评分' : '教师设置为暂不可见（不显示分数或评分详情）' }}</strong></div>
      </div>
      <div class="ws-note">按工艺画面手动操作设备，完成后返回此工作台交卷。切换页面、重新载入工艺或改变仿真速度不重置真实计时；仅点击“结束本次”会丢弃尚未提交的成绩。{{ kind === 'sequence' ? '自编顺序题按本次手动操作与录制序列匹配，不以关联流程步骤推进评分。' : kind === 'state' ? '自编状态题按状态条件和事件记录评分，不以关联内置流程完成度评分。' : kind === 'stages' ? '原阶段考核仅按保存的阶段 / 逐条规则结算记录评分，不以演示步骤完成度替代原考核。' : '工况派生训练按本次手动步骤评估，不冒充原 Playbook 的独立完整阶段考核。' }}</div>
      <div class="ws-inline session-actions"><button type="button" class="btn btn-primary" :disabled="pendingUnavailable" data-testid="operation-return-flow" @click="resume"><UiIcon :name="needsSafety ? 'ShieldCheck' : 'ExternalLink'" :size="16" />{{ needsSafety ? '前往 / 完成安全检查' : !session ? '继续训练' : !session.runReady ? '重新初始化工艺 / 继续操作' : '返回工艺 / 继续操作' }}</button><button v-if="session" type="button" class="btn btn-primary" data-testid="operation-submit" @click="ask('submit')"><UiIcon name="Send" :size="16" />{{ session.mode === 'exam' ? '交卷 / 提交操作考评' : '提交操作练习' }}</button><span class="spacer" /><button type="button" class="btn btn-danger" data-testid="operation-end" @click="ask('cancel')">{{ session ? '结束本次，不保存成绩' : '取消本次选择' }}</button></div>
      <template v-if="canShowPractice && session">
        <div v-if="progress != null" class="ws-small-stack"><div class="ws-inline"><strong>已记录总分比例</strong><span class="spacer" /><span class="badge" data-testid="operation-score-progress">{{ progress }}%</span></div><progress class="ws-progress" :value="progress" max="100" aria-label="本次练习实际记录得分比例" /><small class="ws-subtext">由工作台统一评分 API 计算；这是练习过程记录，不是演示步骤完成百分比。</small></div>
        <div class="ws-title-line"><h3>{{ kind === 'stages' ? '原阶段 / Conditions 条件 / Triggers 触发器' : kind === 'derived' ? '工况派生训练步骤 / 提示进度' : kind === 'sequence' ? '录制顺序 / 本次手动匹配' : '状态和事件 / 本次触发记录' }}</h3><span class="badge badge-success">练习提示（非最终成绩）</span></div>
        <div v-if="kind === 'stages'" class="ws-stack" data-testid="operation-original-stages">
          <div class="ws-note">同一原阶段的全部 Triggers 同时满足才结算；结算时 Conditions 逐条评估并分别计分，条件失败不阻止阶段推进。尚未结算的规则不虚给分，结算后不因稍后改设备而重新判分。</div>
          <article v-for="stage in originalStages" :key="stage.index" class="ws-condition-box">
            <div class="ws-inline"><strong>阶段 {{ stage.index + 1 }}. {{ stage.name }}</strong><span class="spacer" /><span class="badge" :class="stage.settled ? 'badge-success' : 'badge-muted'">{{ stage.settled ? '已结算（不等于全对）' : '等待触发结算' }}</span></div>
            <div class="ws-table-wrap stage-rule-table"><table class="data-table" :aria-label="`原阶段 ${stage.index + 1} 的规则与实际记录`"><thead><tr><th>规则类别 / 设备</th><th>原条件 / 目标</th><th>本次实际记录</th><th>结算结果</th><th>实际分数 / 分值</th></tr></thead><tbody>
              <tr v-for="detail in stage.details" :key="detail.id"><td>{{ detail.role === 'condition' ? 'Conditions 条件' : 'Triggers 触发器' }}<small class="ws-subtext rule-device">{{ detail.deviceId }}</small></td><td>{{ detail.expected }}</td><td>{{ detail.response }}</td><td><span class="badge" :class="!detail.settled ? 'badge-muted' : detail.passed ? 'badge-success' : 'badge-danger'">{{ !detail.settled ? '尚未结算' : detail.passed ? '通过' : '条件未满足' }}</span></td><td>{{ round(detail.score) }} / {{ round(detail.maxScore) }}</td></tr>
            </tbody></table></div>
          </article>
          <p v-if="flowRuntime?.definition.source" class="ws-source">原定义来源：{{ flowRuntime.definition.source }}</p>
        </div>
        <div v-else-if="kind === 'derived'" class="ws-small-stack"><div class="ws-note">这些步骤用于工况派生的本地训练，并非原 Playbook 的阶段 / Conditions / Triggers 定义。</div><div v-for="(step, index) in session.steps" :key="step.id" class="ws-condition-box"><div class="ws-inline"><strong>{{ index + 1 }}. {{ step.name }}</strong><span class="spacer" /><span class="badge" :class="session.completedSteps.includes(step.id) ? 'badge-success' : 'badge-muted'">{{ session.completedSteps.includes(step.id) ? '本次已完成' : '本次尚未完成' }}</span></div><p>{{ step.description }}</p><small>{{ step.deviceId || '按传感器 / 状态条件判断' }}</small></div></div>
        <div v-else-if="kind === 'sequence'" class="ws-table-wrap"><table class="data-table" aria-label="自编顺序题录制操作"><thead><tr><th>时间序号</th><th>设备</th><th>录制操作</th><th>权重</th><th>本次顺序匹配</th></tr></thead><tbody><tr v-for="op in sequence" :key="op.id"><td>{{ op.index }}</td><td>{{ op.deviceId }}</td><td>{{ op.operation }}</td><td>{{ op.weight }}</td><td><span class="badge" :class="details.find(detail => detail.id === op.id)?.passed ? 'badge-success' : 'badge-muted'">{{ details.find(detail => detail.id === op.id)?.passed ? '已匹配手动操作' : '未匹配 / 次序不一致' }}</span></td></tr></tbody></table></div>
        <div v-else class="ws-small-stack"><article v-for="state in session.scene?.states" :key="state.id" class="ws-condition-box"><div class="ws-inline"><strong>{{ state.name }}</strong><span class="badge badge-muted">{{ state.kind === 'initial' ? '初始状态' : state.kind === 'final' ? '终止状态' : '中间状态' }}</span><span class="spacer" /><span class="badge">{{ stateStatus(state.id) }}</span></div><p v-for="condition in state.conditions" :key="condition.id">状态条件：{{ conditionText(condition, session.scene) }}</p><div v-for="group in state.groups" :key="group.id" class="event-group"><strong>{{ group.name }} · {{ group.kind === 'score' ? '分数记录' : '状态变更' }}</strong><p v-for="event in group.events" :key="event.id">{{ session.runtimeEvents[event.id] !== undefined ? '✓ 已触发' : '○ 未触发' }} · {{ event.name || '未命名事件' }}：{{ conditionText(event.condition, session.scene) }}</p></div></article></div>
      </template>
      <div v-else-if="session" class="ws-note"><UiIcon name="LockKeyhole" :size="15" />{{ !session.scoreVisible ? '本次成绩暂不可见，不展示过程评分、得分比例或得分点详情。' : '考评交卷前不展示过程评分；完成后可在结果和历史成绩查看实际详细评分。' }}</div>
      <p class="ws-source">本地演示边界：使用浏览器内的流程条件、事件或顺序记录评估，不伪造 WPF 固定示例分数，也不替代真实作业程序或完整后端物理仿真。</p>
    </div>
    <BaseModal v-if="confirmation && confirmation.sessionId === launch.id" :title="confirmation.action === 'submit' ? '确认提交操作成绩' : session ? '结束本次操作练习 / 考评' : '取消待开始操作'" :width="550" :close-on-backdrop="false" @close="confirmation = null">
      <div class="ws-modal-content ws-stack" :data-testid="confirmation.action === 'submit' ? 'operation-submit-confirmation' : 'operation-end-confirmation'">
        <template v-if="confirmation.action === 'submit' && session"><p>{{ session.title }} · 本次已用时 {{ formatDuration(elapsed) }}，记录 {{ session.recordedOps.length }} 次手动设备操作。</p><p v-if="remaining != null">剩余时间 {{ formatDuration(remaining) }}；确认期间继续计时。</p><div class="ws-note warning">确定交卷吗？系统将按已记录的实际{{ kind === 'stages' ? '原阶段 / 逐条规则结算' : kind === 'derived' ? '工况派生步骤' : kind === 'sequence' ? '手动顺序操作' : '状态 / 事件' }}评分，未完成项不自动补分，提交后不能继续修改本次成绩。{{ launch.scoreVisible ? '结果保存在本地历史记录。' : '教师设置成绩暂不可见，不显示实际分数及评分详情。' }}</div></template>
        <template v-else><div class="ws-note danger">{{ session ? '结束后未提交的本次操作不生成成绩，工艺流程将停止。' : '取消后不会启动计时或生成成绩，已填写的安全检查不会作为本次成绩提交。' }}历史成绩不受影响。</div><p v-if="session">如需保存本次操作考核成绩，请选择继续操作并交卷。</p></template>
      </div>
      <template #footer><button type="button" class="btn" @click="confirmation = null">{{ session ? '继续操作' : '返回' }}</button><button type="button" class="btn" :class="confirmation.action === 'submit' ? 'btn-primary' : 'btn-danger'" :data-testid="confirmation.action === 'submit' ? 'operation-confirm-submit' : 'operation-confirm-end'" @click="confirm">{{ confirmation.action === 'submit' ? '确认交卷' : session ? '确定结束，不保存成绩' : '取消选择' }}</button></template>
    </BaseModal>
  </section>
  <div v-else class="empty-state" data-testid="operation-no-session"><UiIcon name="Workflow" :size="46" class="ws-empty-icon" /><p>当前没有属于此工作台的操作会话。</p></div>
</template>

<style scoped>
.operation-session h2{font-size:18px;display:flex;gap:8px;align-items:center}.operation-session h3{font-size:17px;margin:0}.identity{margin:8px 0 0}.operation-session .ws-title-line{margin-bottom:0}.operation-session .ws-note{margin:0}.ws-condition-box p{margin:7px 0;white-space:pre-wrap}.event-group{border-top:1px solid #d6e5f1;padding-top:9px;margin-top:9px}.ws-modal-content p{margin:0;line-height:1.9}.ws-source{margin:0}.session-actions{padding:5px 0}.ws-detail-item small{display:block}.operation-session .ws-time{font-size:28px}
.stage-rule-table{margin-top:12px}.stage-rule-table td:nth-child(2),.stage-rule-table td:nth-child(3){min-width:180px}.rule-device{display:block;margin-top:5px}
</style>
