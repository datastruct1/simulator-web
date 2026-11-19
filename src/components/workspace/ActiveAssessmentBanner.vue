<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
import { formatDuration } from './lib/domain'
import ConfirmDialog from './ConfirmDialog.vue'
import UiIcon from '../common/UiIcon.vue'
const workspace = useWorkspace(), simulator = useSimulator(), confirming = ref(false)
const session = computed(() => workspace.data.activeTheory ?? workspace.data.activeOperation ?? workspace.data.pendingLaunch)
const pending = computed(() => !!workspace.data.pendingLaunch && !workspace.data.activeOperation)
const time = computed(() => {
  const active = workspace.data.activeTheory ?? workspace.data.activeOperation
  return active ? active.deadlineAt ? `剩余 ${formatDuration((active.deadlineAt - workspace.now.value) / 1000)}` : `已练习 ${formatDuration((workspace.now.value - active.startedAt) / 1000)}` : '安全检查通过后才开始计时'
})
function goBack() {
  if (!session.value) return
  if (session.value.returnPage === 'student') workspace.data.studentTab = workspace.data.activeTheory ? workspace.data.activeTheory.mode === 'exam' ? 'exam' : 'practice' : 'operation'
  else workspace.data.examTab = workspace.data.activeTheory ? 'answer' : 'operation'
  simulator.navigate(session.value.returnPage)
}
function cancel() { workspace.cancelAssessment(); confirming.value = false }
</script>
<template>
  <section v-if="session" class="ws-active-banner" aria-live="polite">
    <div><strong><UiIcon :name="pending ? 'ShieldCheck' : 'Timer'" :size="15" /> {{ pending ? '待开始操作' : '正在进行' }} · {{ session.title }}</strong><span class="ws-subtext">{{ time }} · {{ pending ? '请勿跳过安全门禁' : '切换页面不会暂停真实计时，答案已本地保存' }}</span></div>
    <div class="ws-inline">
      <button v-if="pending" class="btn btn-primary" @click="workspace.resumePendingOperation">{{ simulator.state.safetyComplete ? '继续训练' : '前往安全检查' }}</button>
      <button v-else class="btn btn-primary" @click="goBack">继续{{ session.mode === 'exam' ? '考核' : '练习' }}</button>
      <button class="btn btn-sm" @click="confirming = true">{{ pending ? '取消选择' : '结束本次' }}</button>
    </div>
    <ConfirmDialog v-if="confirming" title="结束本次练习 / 考核" message="确定结束吗？未提交的本次答案不会生成成绩。已保存的历史记录不受影响。" danger confirm-text="结束本次" @confirm="cancel" @close="confirming = false" />
  </section>
</template>
