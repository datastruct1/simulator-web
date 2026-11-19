<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DeviceState } from '../../types/simulator'
import { useSimulator } from '../../state/simulator'
import { matches } from './lib/domain'

const model = defineModel<string>({ required: true })
const props = withDefaults(defineProps<{ label?: string; sensorOnly?: boolean; operationOnly?: boolean; disabled?: boolean }>(), {
  label: '设备', sensorOnly: false, operationOnly: false, disabled: false,
})
const emit = defineEmits<{ selected: [device: DeviceState | undefined] }>()
const simulator = useSimulator(), query = ref(''), kind = ref('')
const kindLabels: Record<string, string> = { valve: '阀门', pump: '泵', fan: '风机', engine: '发动机', heater: '加热器', sensor: '传感器', hose: '软管', tank: '储罐', pipe: '管路', device: '其它设备' }
const devices = computed(() => {
  const unique = new Map<string, DeviceState>()
  for (const device of Object.values(simulator.state.devices)) unique.set(device.id.toLowerCase(), device)
  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id, 'zh-CN', { numeric: true }))
})
const available = computed(() => devices.value.filter(device => props.sensorOnly ? device.kind === 'sensor' : props.operationOnly ? ['valve', 'pump', 'fan', 'engine', 'heater', 'hose', 'device'].includes(device.kind) : true))
const kinds = computed(() => [...new Set(available.value.map(device => device.kind))])
const filtered = computed(() => available.value.filter(device => (props.sensorOnly || !kinds.value.includes(kind.value) || device.kind === kind.value) && matches(`${device.id} ${device.name}`, query.value)))
const selected = computed(() => devices.value.find(device => device.id.toLowerCase() === model.value.toLowerCase()))
const outsideFilter = computed(() => !!model.value && !filtered.value.some(device => device.id === model.value))
function changed() { emit('selected', selected.value) }
</script>

<template>
  <div class="scene-device-select" data-testid="scene-device-select">
    <div class="scene-device-filter">
      <input v-model="query" class="field" type="search" :disabled="disabled" :aria-label="label + '搜索'" placeholder="搜索编号 / 名称" data-testid="scene-device-search" />
      <select v-if="!sensorOnly" v-model="kind" class="field" :disabled="disabled" :aria-label="label + '类型筛选'">
        <option value="">全部类型</option>
        <option v-for="item in kinds" :key="item" :value="item">{{ kindLabels[item] || item }}</option>
      </select>
    </div>
    <label class="field-group">
      <span>{{ label }}</span>
      <select v-model="model" class="field" :disabled="disabled" :aria-label="label" data-testid="scene-device-id" @change="changed">
        <option value="">请选择{{ sensorOnly ? '传感器' : '设备' }}</option>
        <option v-if="outsideFilter" :value="model">{{ selected ? `${model} · ${selected.name}（当前选择）` : `${model}（未识别，请重新选择）` }}</option>
        <option v-for="device in filtered" :key="device.id" :value="device.id">{{ device.id }} · {{ device.name === device.id ? kindLabels[device.kind] || device.kind : device.name }}</option>
      </select>
    </label>
    <small v-if="selected" class="scene-device-detail">{{ kindLabels[selected.kind] || selected.kind }}{{ selected.unit ? ' · 单位 ' + selected.unit : '' }}</small>
    <small v-else-if="model" class="scene-device-warning" role="status">编号未在本地设备表中找到；保留原引用，请重新选择后校验。</small>
    <small v-else-if="!filtered.length" class="scene-device-detail">没有匹配设备，请调整搜索或类型筛选。</small>
  </div>
</template>

<style scoped>
.scene-device-select{display:flex;flex-direction:column;gap:7px;min-width:0}.scene-device-filter{display:flex;gap:6px;min-width:0}.scene-device-filter input{min-width:0;flex:1}.scene-device-filter select{width:110px;flex-shrink:0}.scene-device-detail{font-size:11px;color:#7d93a9;line-height:1.6}.scene-device-warning{font-size:11px;color:#a45d45;line-height:1.6}.scene-device-select .field-group{margin:0}.scene-device-select .field{width:100%}
@media(max-width:600px){.scene-device-filter{flex-wrap:wrap}.scene-device-filter select{width:100%}}
</style>
