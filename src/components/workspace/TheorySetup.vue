<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AssessmentMode, ReturnPage, WorkspaceQuestion } from '../../data/workspace'
import { useWorkspace } from '../../state/workspace'
import { shuffled } from './lib/domain'
import UiIcon from '../common/UiIcon.vue'

type QuestionSource = 'bank' | 'paper' | 'wrong' | 'favourites'
const props = withDefaults(defineProps<{
  returnPage?: ReturnPage
  mode?: AssessmentMode
  bank?: string
  initialSource?: QuestionSource
  defaultCount?: number
  defaultOrder?: 'ordered' | 'random'
  minutes?: number
  title?: string
}>(), { returnPage: 'student', mode: 'practice', bank: '', initialSource: 'bank', defaultCount: 100, defaultOrder: 'random', minutes: 60, title: '' })
const emit = defineEmits<{ started: []; cancel: [] }>()
const workspace = useWorkspace()
const source = ref<QuestionSource>(props.bank ? 'bank' : props.initialSource)
const tag = ref(props.bank)
const paperId = ref(workspace.data.papers[0]?.id || '')
const count = ref(props.defaultCount)
const order = ref(props.defaultOrder)
const minutes = ref(props.minutes)
const agreed = ref(false)
const error = ref('')
const student = computed(() => props.returnPage === 'exam' ? workspace.offlineStudent.value : workspace.currentStudent.value)
const records = computed(() => workspace.data.scores.filter(score => score.studentId === student.value?.id))
const visibleRecords = computed(() => records.value.filter(score => score.scoreVisible))
// Never turn hidden-score snapshots into an answer-bearing revision source.
const restrictedIds = computed(() => new Set([
  ...records.value.filter(score => !score.scoreVisible).flatMap(score => score.details.filter(detail => detail.kind === 'question').map(detail => detail.question?.id || detail.id)),
  ...(workspace.data.activeTheory?.studentId === student.value?.id && !workspace.data.activeTheory.scoreVisible ? workspace.data.activeTheory.questions.map(question => question.id) : []),
]))
const permittedQuestions = computed(() => {
  const questions = new Map<string, WorkspaceQuestion>(workspace.data.questions.map(question => [question.id, question]))
  for (const score of visibleRecords.value) for (const detail of score.details) {
    if (detail.question && !questions.has(detail.question.id)) questions.set(detail.question.id, detail.question)
  }
  return questions
})
const wrongQuestions = computed(() => {
  const questions = new Map<string, WorkspaceQuestion>()
  for (const score of visibleRecords.value) for (const detail of score.details) {
    if (detail.kind === 'question' && !detail.passed && detail.question && !restrictedIds.value.has(detail.question.id) && !questions.has(detail.question.id)) questions.set(detail.question.id, detail.question)
  }
  return [...questions.values()]
})
const favouriteQuestions = computed(() => (workspace.data.favourites[student.value?.id || ''] || []).flatMap(id => {
  const question = permittedQuestions.value.get(id)
  return question && !restrictedIds.value.has(id) ? [question] : []
}))
const sources = computed(() => [
  { id: 'bank' as const, name: '题库标签', icon: 'Library', count: workspace.data.questions.length },
  { id: 'paper' as const, name: '试卷练习', icon: 'Files', count: workspace.data.papers.length },
  { id: 'wrong' as const, name: '错题复习', icon: 'CircleX', count: wrongQuestions.value.length },
  { id: 'favourites' as const, name: '我的收藏', icon: 'Star', count: favouriteQuestions.value.length },
])
const paper = computed(() => workspace.data.papers.find(item => item.id === paperId.value))
const pool = computed(() => {
  let questions: WorkspaceQuestion[]
  if (source.value === 'paper') questions = paper.value?.questionIds.flatMap(id => {
    const question = workspace.data.questions.find(item => item.id === id)
    return question ? [question] : []
  }) || []
  else if (source.value === 'wrong') questions = wrongQuestions.value
  else if (source.value === 'favourites') questions = favouriteQuestions.value
  else questions = workspace.data.questions
  return source.value !== 'paper' && tag.value ? questions.filter(question => question.tags.includes(tag.value)) : questions
})
const blocked = computed(() => !!(workspace.data.activeTheory || workspace.data.activeOperation || workspace.data.pendingLaunch || workspace.data.recording.active))
const validation = computed(() => {
  if (!student.value) return '没有可用的本地学员身份。'
  if (!pool.value.length) return source.value === 'wrong' ? '暂无可复习错题。错题只来自当前身份可见的已提交成绩，包含未作答题。' : source.value === 'favourites' ? '暂无可练习收藏。隐藏成绩的题目快照不提供收藏复习来源。' : '此来源没有可用题目，请调整标签或试卷。'
  if (!Number.isInteger(count.value) || count.value < 1 || count.value > pool.value.length) return `题目数量须为 1～${pool.value.length} 的正整数，不重复抽题。`
  if (props.mode === 'exam' && (!Number.isInteger(minutes.value) || minutes.value < 1 || minutes.value > 1440)) return '考评时限须为 1～1440 分钟的整数。'
  return ''
})
const maxScore = computed(() => source.value === 'paper' ? paper.value?.maxScore || 100 : 100)
const passPercent = computed(() => source.value === 'paper' ? paper.value?.passPercent ?? 60 : 60)
const sourceName = computed(() => source.value === 'paper' ? paper.value?.title || '试卷' : `${source.value === 'wrong' ? '错题复习' : source.value === 'favourites' ? '收藏复习' : tag.value || '全部题库'}`)
function resetCount() {
  count.value = source.value === 'paper' ? pool.value.length : Math.min(props.defaultCount, pool.value.length)
  if (source.value === 'paper' && paper.value) { minutes.value = paper.value.durationMinutes; order.value = paper.value.shuffle ? 'random' : 'ordered' }
  error.value = ''
}
resetCount()
watch([source, tag, paperId], resetCount)
watch([count, order, minutes, agreed], () => { error.value = '' })
function start() {
  error.value = validation.value
  if (error.value || !agreed.value || blocked.value) return
  const questions = (order.value === 'random' ? shuffled(pool.value) : pool.value).slice(0, count.value)
  if (workspace.startTheory({
    questions, title: props.title || `${sourceName.value} · ${props.mode === 'exam' ? '理论考评' : '理论练习'}`,
    mode: props.mode, returnPage: props.returnPage, durationMinutes: minutes.value, maxScore: maxScore.value, passPercent: passPercent.value,
  })) emit('started')
}
</script>

<template>
  <section class="ws-panel theory-setup" data-testid="theory-setup" aria-label="理论题来源及练习设置">
    <header class="ws-panel-header">
      <h2><UiIcon name="BookOpenCheck" :size="20" /> {{ title || (mode === 'exam' ? '理论考评设置 / 注意事项' : '练习题目设置') }}</h2>
      <span class="badge">{{ mode === 'exam' ? '单机限时考评' : '本地理论练习' }}</span>
    </header>
    <div class="ws-panel-body ws-stack">
      <p class="ws-subtext setup-description">{{ student?.name }} · {{ student?.studentNo }}。选择真实的本地题目来源与数量，然后开始{{ mode === 'exam' ? '考评' : '练习' }}。</p>
      <nav v-if="!bank" class="source-grid" aria-label="理论题来源">
        <button v-for="item in sources" :key="item.id" type="button" class="ws-quick" :class="{ selected: source === item.id }" :aria-pressed="source === item.id" :data-testid="`theory-source-${item.id}`" @click="source = item.id">
          <span class="ws-quick-icon"><UiIcon :name="item.icon" :size="21" /></span>
          <span><strong>{{ item.name }}</strong><small>{{ item.count }} {{ item.id === 'paper' ? '套本地试卷' : '道可用题目' }}</small></span>
        </button>
      </nav>
      <div class="form-grid">
        <label v-if="source !== 'paper'" class="field-group"><span>题库标签</span>
          <select v-model="tag" class="field" :disabled="!!bank" aria-label="理论题库标签" data-testid="theory-tag">
            <option value="">全部标签</option><option v-for="item in workspace.tags.value" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label v-else class="field-group"><span>本地试卷</span><select v-model="paperId" class="field" aria-label="选择理论试卷" data-testid="theory-paper"><option value="" disabled>请选择试卷</option><option v-for="item in workspace.data.papers" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
        <label class="field-group"><span>题目数量（当前可用 {{ pool.length }} 题）</span><input v-model.number="count" class="field" type="number" min="1" :max="pool.length || 1" step="1" aria-label="理论题目数量" data-testid="theory-count" /></label>
        <label class="field-group"><span>抽题 / 答题顺序</span><select v-model="order" class="field" aria-label="理论题目顺序" data-testid="theory-order"><option value="ordered">顺序练习（按来源顺序取前 N 题）</option><option value="random">随机抽题并打乱顺序（不重复）</option></select></label>
        <label v-if="mode === 'exam'" class="field-group"><span>真实考评时限（分钟）</span><input v-model.number="minutes" class="field" type="number" min="1" max="1440" step="1" aria-label="理论考评时限" data-testid="theory-minutes" /></label>
      </div>
      <div class="ws-inline"><span class="ws-subtext">快捷数量：</span><button v-for="value in [10, 20, 50, 100].filter(value => value <= pool.length)" :key="value" type="button" class="ws-chip" :class="{ active: count === value }" @click="count = value">{{ value }} 题</button><button v-if="pool.length" type="button" class="ws-chip" :class="{ active: count === pool.length }" @click="count = pool.length">全部 {{ pool.length }} 题</button><span class="spacer" /><span class="badge badge-muted">总分 {{ maxScore }} · 通过比例 {{ passPercent }}%</span></div>
      <p v-if="source === 'paper' && paper?.description" class="ws-note">{{ paper.description }}<br />仅从当前仍存在的题目中选取；已发布任务会使用发布时快照，和这里的自由练习不同。</p>
      <p v-if="source === 'wrong'" class="ws-note">错题来自可见历史成绩中的错误或未作答题，同题去重并保留最近一次错误快照。隐藏成绩及其题目不参与错题复习。</p>
      <p v-if="source === 'favourites'" class="ws-note">收藏按本地学员身份保存。已删除题目仅在有可见历史快照时可复习；隐藏成绩的题目暂不提供收藏复习。</p>
      <div class="ws-condition-box">
        <strong>注意事项</strong>
        <ol class="attention-list">
          <li>题目、答案、成绩仅保存在当前浏览器，不连接教师服务器，不构成正式认证考评。题目答案及解析请经教师校核后使用。</li>
          <li>{{ mode === 'exam' ? '考评按真实时钟倒计时；切换页面或刷新不会重置时限，时间到自动交卷。交卷前不显示答案与解析。' : '练习累计真实用时，不设自由练习倒计时。可查看本题答案与解析，揭示后该题不能再改答案。' }}</li>
          <li>单选和判断只能选一项；多选须全部选对才计分。查看答案不等于作答，未选择的题目仍计为未答。</li>
          <li>交卷会确认未答题；结束本次不会生成成绩。清除浏览器数据会丢失未导出的记录。</li>
        </ol>
        <label class="checkbox-label"><input v-model="agreed" type="checkbox" data-testid="theory-agreement" />我已了解以上本地模式、计时和交卷规则</label>
      </div>
      <div v-if="blocked" class="ws-note warning" role="status">当前浏览器已有未结束的练习、考评或操作录制。请通过活动会话继续、交卷或结束后再开始。</div>
      <div v-if="error || validation" class="ws-form-error" role="status" data-testid="theory-setup-error">{{ error || validation }}</div>
      <div class="ws-inline setup-actions"><button type="button" class="btn" @click="emit('cancel')">返回</button><button type="button" class="btn btn-primary" :disabled="!!validation || blocked || !agreed" data-testid="theory-start" @click="start"><UiIcon name="Play" :size="16" />{{ mode === 'exam' ? '开始考评' : '开始练习' }}</button></div>
    </div>
  </section>
</template>

<style scoped>
.setup-description{margin:0}.source-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.source-grid .selected{background:#e7f3ff;border-color:#77b5e6}.attention-list{padding-left:22px;margin:8px 0 14px;line-height:2}.setup-actions{justify-content:flex-end}.theory-setup .ws-note{margin:0}.theory-setup h2{font-size:18px;display:flex;align-items:center;gap:8px}.source-grid .ws-quick{padding:15px}.source-grid strong{font-size:13px}
@media(max-width:1000px){.source-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:550px){.source-grid .ws-quick{padding:11px;gap:7px}.source-grid .ws-quick-icon{width:30px;height:30px}}
</style>
