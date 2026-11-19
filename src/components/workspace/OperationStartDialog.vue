<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AssessmentMode, ReturnPage } from '../../data/workspace'
import { workflows } from '../../data/catalog'
import { useWorkspace } from '../../state/workspace'
import { conditionText } from './lib/domain'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'
const props = withDefaults(defineProps<{ operationId: string; title?: string; mode?: AssessmentMode; returnPage?: ReturnPage; minutes?: number; note?: string }>(), { title: '', mode: 'practice', returnPage: 'student', minutes: 20, note: '' })
const emit = defineEmits<{ close: []; started: [] }>()
const workspace = useWorkspace(), mode = ref<AssessmentMode>(props.mode), minutes = ref(props.minutes), agreed = ref(false), tab = ref('attention')
watch(mode, () => { tab.value = 'attention'; agreed.value = false })
const item = computed(() => workspace.operationItems.value.find(item => item.id === props.operationId))
const flow = computed(() => workflows.find(flow => flow.id === (item.value?.flowId || props.operationId)))
const attention = ['本界面为本地前端操作训练，不等同于真实船舶操作或正式认证考评。', '需要惰化 / 加注安全检查的流程，必须完成加注作业前安全检查表，未通过时不能开始。', '按工艺步骤手动操作设备。自动演示和其他流程的进度不会计入本次手动考核。', '考评时采用真实时间计时，离开工作台或切换工艺页面不会暂停。练习模式显示提示并记录用时。', '操作完成后返回工作台点击“交卷 / 提交练习”。系统根据本次实际步骤、设备条件或操作次序自动评分，并保存历史。']
function start() {
  if (!agreed.value) return
  const started = workspace.requestOperation({ operationId: props.operationId, title: props.title || item.value?.name, mode: mode.value, returnPage: props.returnPage, durationMinutes: minutes.value })
  if (started || workspace.data.pendingLaunch) { emit('started'); emit('close') }
}
</script>
<template>
  <BaseModal :title="(title || item?.name || flow?.name || '操作题') + ' · 模式选择 / 注意事项'" :width="930" :close-on-backdrop="false" @close="emit('close')">
    <div class="ws-modal-content">
      <div class="tabs"><button :class="{ active: tab === 'attention' }" @click="tab = 'attention'">模式选择 / 注意事项</button><button v-if="mode === 'practice'" :class="{ active: tab === 'steps' }" @click="tab = 'steps'">步骤和条件</button></div>
      <section v-if="tab === 'attention'" class="ws-stack"><div class="form-grid"><label class="field-group"><span>训练模式</span><select v-model="mode" class="field"><option value="practice">单机操作训练 / 练习</option><option value="exam">限时操作考评</option></select></label><label class="field-group"><span>考评时限（分钟）</span><input v-model.number="minutes" class="field" type="number" min="1" max="1440" /></label></div><div class="ws-details"><div class="ws-detail-item"><span>对应工艺界面</span><strong>{{ flow?.page || '未找到' }} · {{ flow?.name }}</strong></div><div class="ws-detail-item"><span>总分 / 步骤</span><strong>{{ item?.scene?.maxScore || 100 }} 分 · {{ item?.scene ? item.scene.mode === 'sequence' ? item.scene.legacyOps.length + ' 个操作' : item.scene.states.length + ' 个状态' : (flow?.steps.length || 0) + ' 个步骤' }}</strong></div></div><div v-if="note" class="ws-note warning">{{ note }}</div><div v-if="item?.scene" class="ws-note">自编操作题：{{ item.scene.description || '按教师编辑的本地事件条件评分。' }}</div><div class="card"><h3>注意事项</h3><ol style="padding-left:24px;line-height:2.1;color:#577a9b"><li v-for="text in attention" :key="text">{{ text }}</li></ol><label class="checkbox-label"><input v-model="agreed" type="checkbox" />我已阅读以上注意事项，确认开始本地训练</label></div></section>
      <section v-else><template v-if="item?.scene"><div v-for="state in item.scene.states" :key="state.id" class="ws-condition-box" style="margin-bottom:12px"><strong>{{ state.name }}</strong><p v-for="condition in state.conditions" :key="condition.id" style="margin:5px 0">⚠ 前置 / 终止条件：{{ conditionText(condition, item.scene) }}</p><p v-for="event in state.groups.flatMap(group => group.events)" :key="event.id" style="margin:5px 0">✓ {{ event.name }} · {{ conditionText(event.condition, item.scene) }}</p></div><div v-if="item.scene.mode === 'sequence'" class="ws-table-wrap"><table class="data-table"><thead><tr><th>时间序号</th><th>设备</th><th>操作</th><th>分数权重</th></tr></thead><tbody><tr v-for="op in item.scene.legacyOps" :key="op.id"><td>{{ op.index }}</td><td>{{ op.deviceId }}</td><td>{{ op.operation }}</td><td>{{ op.weight }}</td></tr></tbody></table></div></template><template v-else-if="flow"><div v-for="(step, index) in flow.steps" :key="index" class="ws-condition-box" style="margin-bottom:12px"><strong>{{ index + 1 }}. {{ step.name }}</strong><p style="margin:5px 0">{{ step.description }}</p><small>完成条件 {{ step.rules.length }} 项 · {{ step.deviceId || '传感器 / 状态判定' }}</small></div></template><p class="ws-source">来源：{{ item?.source || flow?.source }}。所有条件在浏览器内计算，不保证 WPF 后端仿真行为完全一致。</p></section>
    </div>
    <template #footer><button class="btn" @click="emit('close')">返回</button><button class="btn btn-primary" :disabled="!agreed || !flow || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440" @click="start"><UiIcon name="Play" :size="15" />{{ mode === 'exam' ? '开始考评' : '确认开始' }}</button></template>
  </BaseModal>
</template>
