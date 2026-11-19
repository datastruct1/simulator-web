<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Comparator, ConditionKind, SceneCondition, SceneDefinition } from '../../data/workspace'
import type { DeviceState } from '../../types/simulator'
import { conditionLabels, logicLabels, propertyLabels } from '../../data/workspace'
import { conditionText, emptyCondition, validateCondition } from './lib/domain'
import SceneDeviceSelect from './SceneDeviceSelect.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import UiIcon from '../common/UiIcon.vue'

const model = defineModel<SceneCondition>({ required: true })
const props = withDefaults(defineProps<{ scene: SceneDefinition; label?: string; depth?: number; disabled?: boolean }>(), { label: '条件', depth: 0, disabled: false })
const deleting = ref<string>(''), replacingKind = ref<ConditionKind | null>(null)
const comparisons: { value: Comparator; label: string }[] = [
  { value: '==', label: '等于' }, { value: '!=', label: '不等于' }, { value: '>', label: '大于' }, { value: '>=', label: '大于或等于' },
  { value: '<', label: '小于' }, { value: '<=', label: '小于或等于' }, { value: 'between', label: '范围内（含两端）' },
]
const booleanProperty = computed(() => model.value.property !== 'value')
const error = computed(() => validateCondition(model.value, props.scene, props.depth))
const summary = computed(() => conditionText(model.value, props.scene))
const missingState = computed(() => !!model.value.stateId && !props.scene.states.some(state => state.id === model.value.stateId))

function applyKind(kind: ConditionKind) {
  if (props.disabled) return
  model.value.kind = kind
  if (kind !== 'logic') model.value.children = []
  if (kind === 'sensor') { model.value.deviceType = 'sensor'; model.value.deviceId = ''; model.value.property = 'value'; model.value.source = 'any' }
  if (kind === 'logic' && !model.value.children.length && props.depth < 6) model.value.children.push(emptyCondition())
}
function kindChanged(event: Event) {
  const select = event.target as HTMLSelectElement, kind = select.value as ConditionKind
  select.value = model.value.kind
  if (props.disabled || kind === model.value.kind || (kind === 'logic' && props.depth >= 6)) return
  if (model.value.children.length && kind !== 'logic') replacingKind.value = kind
  else applyKind(kind)
}
function confirmKind() { const kind = replacingKind.value; replacingKind.value = null; if (kind) applyKind(kind) }
function propertyChanged() {
  if (booleanProperty.value && !['==', '!='].includes(model.value.comparator)) model.value.comparator = '=='
}
function deviceChanged(device: DeviceState | undefined) { if (device) model.value.deviceType = device.kind }
function addChild() { if (!props.disabled && props.depth < 6 && model.value.children.length < 50) model.value.children.push(emptyCondition()) }
function replaceChild(index: number, condition: SceneCondition) { if (!props.disabled) model.value.children[index] = condition }
function removeChild() {
  if (!props.disabled) model.value.children = model.value.children.filter(child => child.id !== deleting.value)
  deleting.value = ''
}
</script>

<template>
  <fieldset class="scene-condition" :disabled="disabled" data-testid="scene-condition-editor" :data-condition-id="model.id" :data-depth="depth">
    <legend>{{ label }}</legend>
    <label class="field-group"><span>条件类型</span><select :value="model.kind" class="field" :aria-label="label + '类型'" data-testid="scene-condition-kind" @change="kindChanged"><option v-for="(text, kind) in conditionLabels" :key="kind" :value="kind" :disabled="kind === 'logic' && depth >= 6">{{ text }}</option></select></label>

    <template v-if="model.kind === 'device' || model.kind === 'sensor'">
      <SceneDeviceSelect v-model="model.deviceId" :label="label + (model.kind === 'sensor' ? '传感器' : '设备')" :sensor-only="model.kind === 'sensor'" :disabled="disabled" @selected="deviceChanged" />
      <div class="scene-condition-fields">
        <label class="field-group"><span>设备属性</span><select v-model="model.property" class="field" :aria-label="label + '属性'" data-testid="scene-condition-property" @change="propertyChanged"><option v-for="(text, property) in propertyLabels" :key="property" :value="property">{{ text }}</option></select></label>
        <label class="field-group"><span>比较方式</span><select v-model="model.comparator" class="field" :aria-label="label + '比较方式'" data-testid="scene-condition-comparator"><option v-for="comparison in comparisons.filter(item => !booleanProperty || ['==', '!='].includes(item.value))" :key="comparison.value" :value="comparison.value">{{ comparison.label }}</option></select></label>
        <template v-if="!booleanProperty">
          <label class="field-group"><span>{{ model.comparator === 'between' ? '范围下限' : '目标数值' }}</span><input v-model.number="model.value" class="field" type="number" step="any" :aria-label="label + '目标数值'" data-testid="scene-condition-value" /></label>
          <label v-if="model.comparator === 'between'" class="field-group"><span>范围上限</span><input v-model.number="model.upper" class="field" type="number" step="any" :aria-label="label + '范围上限'" data-testid="scene-condition-upper" /></label>
        </template>
        <label v-else class="field-group"><span>目标布尔值</span><select v-model="model.boolValue" class="field" :aria-label="label + '目标布尔值'" data-testid="scene-condition-bool"><option :value="true">是 / true</option><option :value="false">否 / false</option></select></label>
      </div>
      <label class="field-group"><span>判定来源</span><select v-model="model.source" class="field" :aria-label="label + '判定来源'" data-testid="scene-condition-source"><option value="user">本次手动属性变更</option><option value="any">当前设备属性（任意来源）</option></select></label>
      <small class="scene-condition-help">{{ model.source === 'user' ? '要求本次真实手动变更相应属性并满足条件；仅点过设备、工况加载或场景动作不算手动操作。' : '直接读取当前设备属性，可由初始工况、场景动作或手动操作满足。' }}</small>
    </template>

    <template v-else-if="model.kind === 'time'">
      <label class="field-group"><span>从本次场景开始经过（秒）</span><input v-model.number="model.seconds" class="field" type="number" min="0" step="1" :aria-label="label + '经过秒数'" data-testid="scene-condition-seconds" /></label>
      <small class="scene-condition-help">经过时间达到此值即满足。采用真实时间，不随仿真倍速变化；不是状态激活后的独立计时。</small>
    </template>

    <template v-else-if="model.kind === 'state'">
      <label class="field-group"><span>引用状态</span><select v-model="model.stateId" class="field" :aria-label="label + '引用状态'" data-testid="scene-condition-state"><option value="">请选择状态</option><option v-if="missingState" :value="model.stateId">失效状态引用（请重新选择）</option><option v-for="state in scene.states" :key="state.id" :value="state.id">{{ state.name || '未命名状态' }} · {{ state.kind === 'initial' ? '初始' : state.kind === 'final' ? '终止' : '中间' }}</option></select></label>
      <label class="field-group"><span>要求的状态</span><select v-model="model.stateStatus" class="field" :aria-label="label + '状态判定'" data-testid="scene-condition-state-status"><option value="active">已激活</option><option value="stopped">已停止</option><option value="disabled">已禁用（禁止再激活）</option></select></label>
      <small class="scene-condition-help">通过稳定编号引用状态，重命名不会改变引用。</small>
    </template>

    <template v-else-if="model.kind === 'logic'">
      <label class="field-group"><span>组合逻辑</span><select v-model="model.logic" class="field" :aria-label="label + '组合逻辑'" data-testid="scene-condition-logic"><option v-for="(text, logic) in logicLabels" :key="logic" :value="logic">{{ text }}</option></select></label>
      <small class="scene-condition-help">与：全部成立；或：任一成立；非与：并非全部成立；非或：全部不成立。可组合多层条件，最多嵌套 6 层。</small>
      <div v-if="depth < 6" class="scene-condition-children">
        <div v-for="(child, index) in model.children" :key="child.id" class="scene-condition-child" data-testid="scene-condition-child">
          <div class="scene-condition-child-heading"><span>子条件 {{ index + 1 }}</span><button class="btn btn-sm btn-danger" type="button" :aria-label="label + '删除子条件' + (index + 1)" data-testid="scene-condition-child-delete" @click="deleting = child.id">删除子条件</button></div>
          <SceneConditionEditor :model-value="child" :scene="scene" :label="label + ' / 子条件 ' + (index + 1)" :depth="depth + 1" :disabled="disabled" @update:model-value="replaceChild(index, $event)" />
        </div>
      </div>
      <div v-else-if="model.children.length" class="scene-condition-error" role="status">子条件超出 6 层限制，请删除超深子条件或改用叶子条件。<button v-for="child in model.children" :key="child.id" class="btn btn-sm btn-danger" type="button" @click="deleting = child.id">删除超深子条件</button></div>
      <button class="btn btn-sm" type="button" :disabled="disabled || depth >= 6 || model.children.length >= 50" data-testid="scene-condition-child-add" @click="addChild"><UiIcon name="Plus" :size="13" />添加子条件（{{ model.children.length }} / 50）</button>
    </template>

    <small v-else class="scene-condition-help">始终成立：状态激活且前置条件满足后即可触发此事件，请谨慎用于得分或终止动作。</small>
    <div v-if="error" class="scene-condition-error" role="status" data-testid="scene-condition-error">{{ error }}</div>
    <p v-else class="scene-condition-summary" data-testid="scene-condition-summary">{{ summary }}</p>
  </fieldset>
  <ConfirmDialog v-if="deleting" title="删除逻辑子条件" message="确定删除此子条件及其所有嵌套内容？这会改变组合逻辑的判定含义；不会自动补入始终成立条件，请删除后重新校验。" danger confirm-text="删除子条件" @confirm="removeChild" @close="deleting = ''" />
  <ConfirmDialog v-if="replacingKind" title="改为非逻辑条件" :message="`改为“${conditionLabels[replacingKind]}”将移除此条件的全部子条件和嵌套内容。父条件编号保留，请确认不再需要原组合逻辑。`" danger confirm-text="切换并移除子条件" @confirm="confirmKind" @close="replacingKind = null" />
</template>

<style scoped>
.scene-condition{display:flex;flex-direction:column;gap:10px;min-width:0;margin:0;padding:13px;border:1px solid #d2e3f2;border-radius:7px;background:#fbfdff}.scene-condition legend{padding:0 5px;color:#46759b;font-size:11px;font-weight:600;overflow-wrap:anywhere}.scene-condition .field-group{margin:0}.scene-condition-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.scene-condition-help{color:#7993ac;font-size:11px;line-height:1.8}.scene-condition-children{display:flex;flex-direction:column;gap:10px;border-left:2px solid #bbd8f0;padding-left:10px;min-width:0}.scene-condition-child-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:#6490b4;margin-bottom:5px}.scene-condition-child{min-width:0}.scene-condition-summary{margin:0;padding:8px 10px;background:#edf6ff;border-radius:5px;color:#52799b;font-size:11px;line-height:1.7;overflow-wrap:anywhere}.scene-condition-error{color:#a65850;background:#fff4ef;border:1px solid #ebd4ca;border-radius:5px;padding:8px 10px;font-size:11px;line-height:1.7}.scene-condition-error .btn{margin-top:6px}.scene-condition:disabled{opacity:.82}.scene-condition-children .scene-condition-fields{grid-template-columns:1fr}
@media(max-width:600px){.scene-condition-fields{grid-template-columns:1fr}.scene-condition-children{padding-left:6px}}
</style>
