<script setup lang="ts">
import { computed } from 'vue'
import type { SceneAction, SceneDefinition } from '../../data/workspace'
import { propertyLabels } from '../../data/workspace'
import { actionText, validateAction } from './lib/domain'
import SceneDeviceSelect from './SceneDeviceSelect.vue'
import SceneWorkloadEditor from './SceneWorkloadEditor.vue'

const model = defineModel<SceneAction>({ required: true })
const props = withDefaults(defineProps<{ scene: SceneDefinition; label?: string; disabled?: boolean }>(), { label: '动作', disabled: false })
const actionLabels: Record<SceneAction['kind'], string> = { score: '得分 / 扣分', activate: '激活状态', stop: '停止状态', disable: '禁用状态（禁止再激活）', load: '加载工况', device: '设备属性设置', notify: '消息提示' }
const direction = computed({
  get: () => model.value.score < 0 ? 'penalty' : 'award',
  set: (value: string) => { const amount = Number.isFinite(model.value.score) ? Math.abs(model.value.score) || 1 : 1; model.value.score = value === 'penalty' ? -amount : amount },
})
const error = computed(() => validateAction(model.value, props.scene))
const summary = computed(() => actionText(model.value, props.scene))
const missingState = computed(() => !!model.value.stateId && !props.scene.states.some(state => state.id === model.value.stateId))
</script>

<template>
  <fieldset class="scene-action" :disabled="disabled" data-testid="scene-action-editor" :data-action-id="model.id">
    <legend>{{ label }}</legend>
    <label class="field-group"><span>动作类型</span><select v-model="model.kind" class="field" :aria-label="label + '类型'" data-testid="scene-action-kind"><option v-for="(text, kind) in actionLabels" :key="kind" :value="kind">{{ text }}</option></select></label>

    <template v-if="model.kind === 'score'">
      <label class="field-group"><span>得分或扣分</span><select v-model="direction" class="field" :aria-label="label + '得扣分方向'" data-testid="scene-action-score-direction"><option value="award">得分（正系数）</option><option value="penalty">扣分（负系数）</option></select></label>
      <div class="scene-action-fields">
        <label class="field-group"><span>分值系数（正数得分 / 负数扣分）</span><input v-model.number="model.score" class="field" type="number" min="-10000" max="10000" step="any" :aria-label="label + '分值系数'" data-testid="scene-action-score" /></label>
        <label class="field-group"><span>评分权重（大于 0）</span><input v-model.number="model.weight" class="field" type="number" min="0.01" max="10000" step="any" :aria-label="label + '评分权重'" data-testid="scene-action-weight" /></label>
      </div>
      <small class="scene-action-help">按“分值系数 × 权重”分配总分：所有加分事件的份额合计为场景总分，扣分按同一比例折算。每个事件在本次测试中只触发一次。</small>
    </template>

    <template v-else-if="model.kind === 'activate' || model.kind === 'stop' || model.kind === 'disable'">
      <label class="field-group"><span>目标状态</span><select v-model="model.stateId" class="field" :aria-label="label + '目标状态'" data-testid="scene-action-state"><option value="">请选择目标状态</option><option v-if="missingState" :value="model.stateId">失效状态引用（请重新选择）</option><option v-for="state in scene.states" :key="state.id" :value="state.id">{{ state.name || '未命名状态' }} · {{ state.kind === 'initial' ? '初始' : state.kind === 'final' ? '终止' : '中间' }}</option></select></label>
      <small class="scene-action-help">{{ model.kind === 'activate' ? '目标进入激活列表；已禁用的状态不能再次激活。终止状态也必须先被激活，才检查终止条件。' : model.kind === 'stop' ? '停止目标状态，之后可由其它动作重新激活；已触发事件不会重复计分。' : '停止并禁用目标状态，本次测试中不允许再次激活。' }}</small>
    </template>

    <div v-else-if="model.kind === 'load'" data-testid="scene-action-workload"><SceneWorkloadEditor :key="model.id" v-model="model.workload" v-model:name="model.workloadName" title="动作加载工况" :initial="false" :disabled="disabled" /></div>

    <template v-else-if="model.kind === 'device'">
      <SceneDeviceSelect v-model="model.deviceId" :label="label + '设备'" :disabled="disabled" />
      <label class="field-group"><span>要设置的属性</span><select v-model="model.property" class="field" :aria-label="label + '设备属性'" data-testid="scene-action-property"><option v-for="(text, property) in propertyLabels" :key="property" :value="property">{{ text }}</option></select></label>
      <label v-if="model.property === 'value'" class="field-group"><span>设置数值</span><input v-model.number="model.value" class="field" type="number" step="any" :aria-label="label + '设置数值'" data-testid="scene-action-value" /></label>
      <label v-else class="field-group"><span>设置布尔值</span><select v-model="model.boolValue" class="field" :aria-label="label + '设置布尔值'" data-testid="scene-action-bool"><option :value="true">是 / true</option><option :value="false">否 / false</option></select></label>
      <small class="scene-action-help">只设置所选属性，不会记为学员手动操作。数值 / 开度与运行开关是不同属性；需要同时改变时请添加另一个事件。</small>
    </template>

    <template v-else-if="model.kind === 'notify'">
      <label class="field-group"><span>提示内容</span><textarea v-model="model.message" class="field" rows="3" maxlength="2000" :aria-label="label + '提示内容'" placeholder="事件触发时显示的本地提示" data-testid="scene-action-message" /></label>
      <small class="scene-action-help">在当前浏览器中显示提示，不向 WPF 教师端或其它客户端发送消息。</small>
    </template>

    <div v-if="error" class="scene-action-error" role="status" data-testid="scene-action-error">{{ error }}</div>
    <p v-else class="scene-action-summary" data-testid="scene-action-summary">{{ summary }}</p>
  </fieldset>
</template>

<style scoped>
.scene-action{display:flex;flex-direction:column;gap:10px;min-width:0;margin:0;padding:13px;border:1px solid #d2e3f2;border-radius:7px;background:#fbfdff}.scene-action legend{padding:0 5px;color:#46759b;font-size:11px;font-weight:600;overflow-wrap:anywhere}.scene-action .field-group{margin:0}.scene-action-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.scene-action-help{font-size:11px;line-height:1.8;color:#7993ac}.scene-action-summary{margin:0;padding:8px 10px;background:#edf6ff;border-radius:5px;color:#52799b;font-size:11px;line-height:1.7;overflow-wrap:anywhere}.scene-action-error{color:#a65850;background:#fff4ef;border:1px solid #ebd4ca;border-radius:5px;padding:8px 10px;font-size:11px;line-height:1.7}.scene-action:disabled{opacity:.82}
@media(max-width:600px){.scene-action-fields{grid-template-columns:1fr}}
</style>
