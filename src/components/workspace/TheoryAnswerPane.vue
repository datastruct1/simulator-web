<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ReturnPage, WorkspaceQuestion } from '../../data/workspace'
import { useWorkspace } from '../../state/workspace'
import { answerIsCorrect, answerLetters, correctIds, formatDate, formatDuration } from './lib/domain'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'

const props = withDefaults(defineProps<{ returnPage?: ReturnPage }>(), { returnPage: 'student' })
const workspace = useWorkspace()
const session = computed(() => workspace.data.activeTheory?.returnPage === props.returnPage ? workspace.data.activeTheory : null)
const question = computed(() => session.value?.questions[Math.floor(session.value.currentIndex)])
const heading = ref<HTMLElement>()
const cardFilter = ref<'all' | 'unanswered' | 'favourites'>('all')
const confirmation = ref<{ action: 'submit' | 'cancel'; sessionId: string } | null>(null)
const answered = computed(() => session.value?.questions.filter(item => (session.value?.answers[item.id] || []).length > 0).length || 0)
const unanswered = computed(() => (session.value?.questions.length || 0) - answered.value)
const elapsed = computed(() => session.value ? Math.max(0, (workspace.now.value - session.value.startedAt) / 1000) : 0)
const remaining = computed(() => session.value?.deadlineAt != null ? Math.max(0, Math.ceil((session.value.deadlineAt - workspace.now.value) / 1000)) : null)
const favourites = computed(() => workspace.data.favourites[session.value?.studentId || ''] || [])
const selected = computed(() => question.value ? session.value?.answers[question.value.id] || [] : [])
const revealed = computed(() => !!question.value && isRevealed(question.value))
const answerLocked = computed(() => session.value?.mode === 'practice' && !!question.value && session.value.revealed.includes(question.value.id))
const correctAnswer = computed(() => revealed.value && question.value ? answerLetters(question.value, correctIds(question.value)) : '')
const cardQuestions = computed(() => session.value?.questions.map((item, index) => ({ question: item, index })).filter(({ question: item }) => cardFilter.value === 'unanswered' ? !(session.value?.answers[item.id] || []).length : cardFilter.value === 'favourites' ? favourites.value.includes(item.id) : true) || [])
function isRevealed(item: WorkspaceQuestion) { return session.value?.mode === 'practice' && session.value.scoreVisible && session.value.revealed.includes(item.id) }
function isAnswered(item: WorkspaceQuestion) { return !!session.value?.answers[item.id]?.length }
function isCorrect(item: WorkspaceQuestion) { return isRevealed(item) && answerIsCorrect(item, session.value?.answers[item.id] || []) }
function cardLabel(item: WorkspaceQuestion, index: number) {
  return `第 ${index + 1} 题，${isAnswered(item) ? '已作答' : '未作答'}${isRevealed(item) ? isCorrect(item) ? '，答案正确' : '，答案错误或未答' : ''}${favourites.value.includes(item.id) ? '，已收藏' : ''}`
}
function expireIfNeeded() {
  if (session.value?.deadlineAt != null && Date.now() >= session.value.deadlineAt) { workspace.submitTheory('timeout'); return true }
  return false
}
function choose(optionId: string) {
  if (!question.value || expireIfNeeded()) return
  workspace.selectAnswer(question.value.id, optionId)
  workspace.persist()
}
async function jump(index: number) {
  const active = session.value
  if (!active || index < 0 || index >= active.questions.length || expireIfNeeded()) return
  active.currentIndex = index
  workspace.persist()
  await nextTick()
  heading.value?.focus({ preventScroll: true })
}
function nextUnanswered() {
  const active = session.value
  if (!active) return
  const indices = active.questions.map((item, index) => ({ item, index })).filter(({ item }) => !isAnswered(item))
  const next = indices.find(({ index }) => index > active.currentIndex) || indices[0]
  if (next) void jump(next.index)
}
function reveal() { if (question.value && session.value?.scoreVisible && !expireIfNeeded()) workspace.revealAnswer(question.value.id) }
function favourite() {
  if (!question.value || !session.value || expireIfNeeded()) return
  workspace.toggleFavourite(question.value.id, session.value.studentId)
  workspace.persist()
}
function ask(action: 'submit' | 'cancel') {
  if (!session.value || expireIfNeeded()) return
  confirmation.value = { action, sessionId: session.value.id }
}
function confirm() {
  if (!confirmation.value || session.value?.id !== confirmation.value.sessionId) { confirmation.value = null; return }
  if (!expireIfNeeded()) {
    if (confirmation.value.action === 'submit') workspace.submitTheory()
    else workspace.cancelAssessment()
  }
  confirmation.value = null
}
watch(() => session.value?.id, () => { confirmation.value = null; cardFilter.value = 'all' })
watch(() => session.value?.currentIndex, value => {
  const active = session.value
  if (active && value != null && (!Number.isInteger(value) || value < 0 || value >= active.questions.length)) active.currentIndex = Math.max(0, Math.min(active.questions.length - 1, Math.floor(value)))
}, { immediate: true })
</script>

<template>
  <section v-if="session && question" class="ws-stack theory-answer" data-testid="theory-answer" :aria-label="session.mode === 'exam' ? '理论考试作答' : '理论练习作答'">
    <div class="ws-title-line">
      <div><h2>{{ session.title }}</h2><p class="ws-subtext session-identity">{{ session.studentName }} · {{ session.studentNo }} · {{ session.mode === 'exam' ? '限时理论考评' : '理论练习' }} · 本次题目采用开始时快照</p></div>
      <div class="ws-inline"><span class="badge" :class="session.mode === 'exam' || !session.scoreVisible ? 'badge-warning' : 'badge-success'">{{ !session.scoreVisible ? '本次成绩及答案暂不可见' : session.mode === 'exam' ? '交卷前不显示答案' : '练习可查看答案' }}</span><button type="button" class="btn btn-sm" data-testid="theory-end" @click="ask('cancel')">结束本次</button></div>
    </div>
    <div class="ws-question-layout">
      <div class="ws-stack">
        <article class="ws-panel">
          <header class="ws-panel-header"><h3 data-testid="theory-current-number">第 {{ session.currentIndex + 1 }} / {{ session.questions.length }} 题</h3><div class="ws-inline"><span class="badge badge-muted">{{ question.type }}</span><button type="button" class="btn btn-sm" :aria-pressed="favourites.includes(question.id)" :aria-label="favourites.includes(question.id) ? '取消收藏本题' : '收藏本题'" data-testid="theory-favourite" @click="favourite"><UiIcon name="Star" :size="15" :class="{ 'favourite-star': favourites.includes(question.id) }" />{{ favourites.includes(question.id) ? '已收藏' : '收藏题目' }}</button></div></header>
          <div class="ws-panel-body">
            <h3 :id="`question-${session.id}`" ref="heading" class="ws-question-title" tabindex="-1" data-testid="theory-question">{{ question.content }}</h3>
            <fieldset class="ws-options answer-fieldset" :aria-labelledby="`question-${session.id}`" :disabled="answerLocked || remaining === 0">
              <legend class="visually-hidden">{{ question.type === '多选题' ? '可选多项，全部选对才计分' : '请选择一个答案' }}</legend>
              <label v-for="(option, index) in question.options" :key="option.id" class="ws-answer-option" :class="{ selected: selected.includes(option.id), correct: revealed && option.correct, wrong: revealed && selected.includes(option.id) && !option.correct }" :data-testid="`theory-option-${index}`">
                <input :type="question.type === '多选题' ? 'checkbox' : 'radio'" :name="`answer-${session.id}-${question.id}`" :value="option.id" :checked="selected.includes(option.id)" :aria-label="`${String.fromCharCode(65 + index)}. ${option.text}`" @change="choose(option.id)" />
                <span class="ws-option-letter" aria-hidden="true">{{ String.fromCharCode(65 + index) }}</span><span class="option-text">{{ option.text }}</span><UiIcon v-if="revealed && option.correct" name="Check" :size="18" class="ws-success" aria-label="正确选项" />
              </label>
            </fieldset>
            <div class="ws-inline selected-answer"><span class="ws-subtext">已选择：<strong data-testid="theory-selected-answer">{{ answerLetters(question, selected) }}</strong></span><span class="spacer" /><span class="ws-subtext">{{ question.type === '多选题' ? '多选题：可勾选 / 取消多项，须全部选对' : '单选 / 判断：只能选择一项' }}</span></div>
            <div v-if="revealed" class="ws-analysis-answer" data-testid="theory-answer-explanation" aria-live="polite"><strong :class="isCorrect(question) ? 'ws-success' : 'ws-danger'">{{ isCorrect(question) ? '本题回答正确' : selected.length ? '本题答案不一致' : '本题未作答' }}</strong><p>正确答案：<strong>{{ correctAnswer }}</strong></p><p>解析：{{ question.explanation || '本题暂无解析，请以经审核的教材为准。' }}</p><small>答案揭示后本题已锁定，查看答案不会自动替你作答。</small></div>
            <div class="ws-inline question-actions"><button type="button" class="btn" :disabled="session.currentIndex === 0" data-testid="theory-previous" @click="jump(session.currentIndex - 1)"><UiIcon name="ChevronLeft" :size="15" />上一题</button><button type="button" class="btn btn-primary" :disabled="session.currentIndex >= session.questions.length - 1" data-testid="theory-next" @click="jump(session.currentIndex + 1)">下一题<UiIcon name="ChevronRight" :size="15" /></button><span class="spacer" /><button v-if="session.mode === 'practice' && session.scoreVisible" type="button" class="btn" :disabled="revealed" data-testid="theory-reveal" @click="reveal"><UiIcon name="Eye" :size="15" />{{ revealed ? '已显示答案 / 解析' : '查看本题答案 / 解析' }}</button></div>
          </div>
        </article>
        <div class="ws-note">{{ !session.scoreVisible ? '本次任务设置成绩及答案暂不可见，答题卡只显示作答与收藏状态，不显示正确 / 错误判定。' : session.mode === 'exam' ? '考试模式不显示答案解析。通过上一题 / 下一题或答题卡切换题目，选择的答案会本地保存。' : '练习可揭示当前题答案，揭示后禁止修改。答题卡蓝色为已选但未揭示，绿色为揭示后正确，红色为揭示后错误或未答。' }}<br />{{ session.deadlineAt != null ? '采用真实截止时间，离开页面、刷新或调整仿真速度均不暂停倒计时，时间到自动提交。' : '用时按真实时钟累计，切换页面和刷新不会重新开始计时。' }}<br />本地前端练习不提供服务器监考或防篡改保证；答案仅作学习参考。</div>
      </div>
      <aside class="ws-panel ws-question-side">
        <header class="ws-panel-header"><h3><UiIcon name="Timer" :size="17" />{{ remaining == null ? '已练习时间' : '剩余时间' }}</h3></header>
        <div class="ws-panel-body ws-stack">
          <div class="ws-time" :class="{ warning: remaining != null && remaining <= 300 }" role="timer" aria-live="off" :aria-label="remaining == null ? '真实练习用时' : '真实剩余时间'" data-testid="theory-timer">{{ formatDuration(remaining == null ? elapsed : remaining) }}</div>
          <div v-if="session.deadlineAt != null" class="ws-subtext">截止：{{ formatDate(session.deadlineAt) }}<br />已用时 {{ formatDuration(elapsed) }}</div>
          <div class="ws-small-stack"><div class="ws-inline"><strong>已答 {{ answered }} / {{ session.questions.length }}</strong><span class="spacer" /><span class="badge badge-muted">未答 {{ unanswered }}</span></div><progress class="ws-progress" :value="answered" :max="session.questions.length" aria-label="理论答题进度" /></div>
          <div class="ws-inline card-controls"><h3>答题卡</h3><select v-model="cardFilter" class="field" aria-label="答题卡筛选"><option value="all">全部题目</option><option value="unanswered">仅未答题</option><option value="favourites">仅收藏题</option></select></div>
          <nav class="ws-question-numbers answer-card" aria-label="理论答题卡" data-testid="theory-answer-card"><button v-for="item in cardQuestions" :key="item.question.id" type="button" class="ws-question-number" :class="{ answered: isAnswered(item.question), current: session.currentIndex === item.index, correct: isCorrect(item.question), wrong: isRevealed(item.question) && !isCorrect(item.question) }" :aria-label="cardLabel(item.question, item.index)" :aria-current="session.currentIndex === item.index ? 'step' : undefined" :data-testid="`theory-question-number-${item.index + 1}`" @click="jump(item.index)">{{ item.index + 1 }}<span v-if="favourites.includes(item.question.id)" class="star" aria-hidden="true">★</span></button></nav>
          <p v-if="!cardQuestions.length" class="ws-subtext">此筛选下没有题目。<button type="button" class="btn btn-sm" @click="cardFilter = 'all'">显示全部</button></p>
          <button type="button" class="btn" :disabled="!unanswered" data-testid="theory-next-unanswered" @click="nextUnanswered">跳到下一道未答题</button>
          <button type="button" class="btn btn-primary" data-testid="theory-submit" @click="ask('submit')"><UiIcon name="Send" :size="16" />{{ session.mode === 'exam' ? '交卷' : '提交练习' }}</button>
          <p v-if="!session.scoreVisible" class="ws-subtext"><UiIcon name="LockKeyhole" :size="13" />教师设置本次成绩暂不可见；提交后不会展示分数、正确率或答案详情。</p>
          <small class="ws-subtext">开始时间：{{ formatDate(session.startedAt) }}<br />{{ workspace.storage.persistent ? '答案已保存在本浏览器' : '浏览器保存不可用，请勿关闭页面' }}</small>
        </div>
      </aside>
    </div>
    <BaseModal v-if="confirmation && confirmation.sessionId === session.id" :title="confirmation.action === 'submit' ? session.mode === 'exam' ? '确认交卷' : '确认提交练习' : '结束本次理论练习 / 考评'" :width="530" :close-on-backdrop="false" @close="confirmation = null">
      <div class="ws-modal-content ws-stack" :data-testid="confirmation.action === 'submit' ? 'theory-submit-confirmation' : 'theory-end-confirmation'">
        <template v-if="confirmation.action === 'submit'"><p>共 {{ session.questions.length }} 题，已答 {{ answered }} 题，<strong :class="{ 'ws-danger': unanswered > 0 }">仍有 {{ unanswered }} 题未作答</strong>。</p><p>{{ remaining == null ? '已用时' : '剩余时间' }}：{{ formatDuration(remaining == null ? elapsed : remaining) }}。</p><div class="ws-note warning">确定提交吗？未答题按未通过计分，交卷后无法修改本次答案。{{ session.scoreVisible ? '成绩与详情会保存到本地历史记录。' : '教师设置成绩暂不可见；仅保存提交记录，不向学员展示分数及答案。' }}</div></template>
        <template v-else><div class="ws-note danger">确定结束本次吗？{{ answered }} 道题的本次答案将不生成成绩，已提交的历史成绩和收藏不受影响。</div><p>如需保存本次作答成绩，请取消此对话框并选择“{{ session.mode === 'exam' ? '交卷' : '提交练习' }}”。倒计时在确认期间仍继续，时间到会自动交卷。</p></template>
      </div>
      <template #footer><button type="button" class="btn" @click="confirmation = null">继续作答</button><button type="button" class="btn" :class="confirmation.action === 'submit' ? 'btn-primary' : 'btn-danger'" :data-testid="confirmation.action === 'submit' ? 'theory-confirm-submit' : 'theory-confirm-end'" @click="confirm">{{ confirmation.action === 'submit' ? session.mode === 'exam' ? '确认交卷' : '确认提交练习' : '结束本次，不保存成绩' }}</button></template>
    </BaseModal>
  </section>
  <div v-else class="empty-state" data-testid="theory-no-session"><UiIcon name="BookOpen" :size="46" class="ws-empty-icon" /><p>当前没有属于此工作台的理论答题会话，请先选择题目或领取任务。</p></div>
</template>

<style scoped>
.theory-answer>.ws-title-line{margin-bottom:0}.theory-answer h2{font-size:20px}.session-identity{margin:8px 0 0}.answer-fieldset{border:0;padding:0;margin:0;min-width:0}.answer-fieldset:disabled .ws-answer-option{cursor:default}.answer-fieldset input{flex-shrink:0;accent-color:#1778c4}.answer-fieldset .option-text{flex:1;white-space:pre-wrap;overflow-wrap:anywhere}.selected-answer{margin-top:16px}.question-actions{margin-top:22px}.favourite-star{color:#c69735;fill:#f8df94}.answer-card{max-height:390px;overflow:auto;padding:4px}.card-controls{justify-content:space-between}.card-controls h3{margin:0;font-size:15px}.card-controls select{width:130px;min-height:30px;padding:4px 8px}.theory-answer .ws-note{margin:0}.ws-analysis-answer p{margin:8px 0}.ws-modal-content p{margin:0;line-height:1.9}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.ws-question-title:focus-visible{outline:2px solid #77b5e6;outline-offset:5px}
@media(min-width:901px){.ws-question-side{position:sticky;top:12px}}@media(max-width:900px){.answer-card{max-height:175px}.ws-question-side .ws-stack{gap:12px}}
</style>
