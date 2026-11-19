<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import GaugeFace from '../scene/GaugeFace.vue'
import { gaugeVisualKind } from '../scene/gauge'
const props = withDefaults(defineProps<{ kind: string; value?: number; working?: boolean; error?: boolean; source?: string; valveType?: string; min?: number; max?: number; sensorType?: string; unit?: string; attributes?: Record<string, unknown>; gaugeWidth?: number; gaugeHeight?: number }>(), { value: 0, working: false, error: false, source: '', valveType: '', min: 0, max: 100, sensorType: '', unit: '', attributes: () => ({}), gaugeWidth: 180, gaugeHeight: 180 })
const gaugeKind = computed(() => gaugeVisualKind({ kind: props.kind, attributes: props.attributes }))
const failed = ref(false)
const image = computed(() => {
  if (props.source.startsWith('/simulator-web/assets/')) return props.source
  if (props.kind === 'valve') return props.valveType.includes('气') ? '/simulator-web/assets/controls/Valve/气阀.png' : props.valveType.includes('电') ? '/simulator-web/assets/controls/Valve/ElectricValve.png' : '/simulator-web/assets/controls/Valve/ManualValve.png'
  if (props.kind === 'sensor') return props.sensorType.includes('温度') ? '/simulator-web/assets/controls/Sensor/温度变送器.png' : props.sensorType.includes('氧') ? '/simulator-web/assets/controls/Sensor/氧浓度传感器.png' : props.sensorType.includes('可燃') ? '/simulator-web/assets/controls/Sensor/可燃气体传感器.png' : '/simulator-web/assets/controls/Sensor/压力变送器.png'
  return ({ pump: '/simulator-web/assets/controls/Pump.png', engine: props.error ? '/simulator-web/assets/controls/EngineW.png' : props.working ? '/simulator-web/assets/controls/Engine.png' : '/simulator-web/assets/controls/EngineN.png',
    heater: '/simulator-web/assets/controls/Heater/Heater.png', 'water-tank': '/simulator-web/assets/controls/WaterTank.png', 'nitrogen-cylinder': '/simulator-web/assets/controls/NitrogenCan.png',
    'balance-tank': '/simulator-web/assets/controls/BTCan.png', filter: '/simulator-web/assets/controls/Filter.png', 'dual-filter': '/simulator-web/assets/controls/双联滤器.png', station: '/simulator-web/assets/controls/FuelStation/FuelShip.png' } as Record<string, string>)[props.kind] || ''
})
watch(image, () => { failed.value = false })
const fraction = computed(() => Math.max(0, Math.min(1, (props.value - props.min) / Math.max(props.max - props.min, 1))))
</script>

<template>
  <div class="device-visual" :class="{ working: working && !error, faulty: error }">
    <svg v-if="kind === 'fan'" viewBox="0 0 140 140" class="fan-visual" aria-hidden="true"><circle cx="70" cy="70" r="60" fill="#f1f7fb" stroke="#657e91" stroke-width="3"/><circle cx="70" cy="70" r="53" fill="white" stroke="#d5e2ec"/><g class="rotor"><path v-for="degree in [0,120,240]" :key="degree" d="M70 70 C45 20 92 16 98 45 C103 66 84 74 70 70" :transform="`rotate(${degree} 70 70)`" :fill="error ? '#d19385' : '#609bb5'" stroke="#477b94" stroke-width="1.5"/></g><circle cx="70" cy="70" r="12" fill="#718ba0" stroke="white" stroke-width="2"/></svg>
    <GaugeFace v-else-if="gaugeKind" :kind="gaugeKind" :width="gaugeWidth" :height="gaugeHeight" :value="value" :unit="unit" :min="min" :max="max" :attributes="attributes" />
    <svg v-else-if="kind === 'tank'" viewBox="0 0 180 160" aria-hidden="true"><rect x="33" y="21" width="114" height="117" rx="15" fill="#f1f6fa" stroke="#7d95a8" stroke-width="3"/><rect x="38" :y="132 - fraction * 102" width="104" :height="fraction * 102 + 1" rx="10" fill="#87b9d2"/><path d="M33 32 C33 7 147 7 147 32 M33 128 C33 151 147 151 147 128" fill="none" stroke="#7d95a8" stroke-width="2"/><path d="M55 137 V151 M125 137 V151 M82 13 V3 H103" fill="none" stroke="#6e899d" stroke-width="5"/><text x="90" y="88" text-anchor="middle" fill="#305572" font-size="20" font-family="inherit">{{ value.toFixed(1) }}%</text></svg>
    <svg v-else-if="['hose','pipe'].includes(kind)" viewBox="0 0 200 140" aria-hidden="true"><path d="M15 25 C70 25 46 107 101 107 S130 29 185 29" fill="none" stroke="#c4cdd4" stroke-width="18"/><path d="M15 25 C70 25 46 107 101 107 S130 29 185 29" fill="none" :stroke="working ? '#64a3c0' : '#8799a7'" stroke-width="10" stroke-dasharray="3 3"/><rect x="5" y="11" width="22" height="29" rx="3" fill="#758493"/><rect x="174" y="15" width="22" height="29" rx="3" fill="#758493"/></svg>
    <img v-else-if="image && !failed" :src="image" alt="原 WPF 设备图示" @error="failed = true">
    <svg v-else viewBox="0 0 160 140" aria-hidden="true"><rect x="25" y="35" width="110" height="74" rx="10" fill="#deebf4" stroke="#698da6" stroke-width="3"/><circle cx="80" cy="72" r="24" fill="#fff" stroke="#789aaf" stroke-width="3"/><path d="M80 50 V95 M57 73 H104 M18 52 H4 M140 88 H154" stroke="#7095ad" stroke-width="5"/></svg>
    <span v-if="working || error" class="status-light" :class="error ? 'red' : 'green'"/>
  </div>
</template>

<style scoped>
.device-visual { position: relative; min-height: 80px; display: flex; justify-content: center; align-items: center; }.device-visual img, .device-visual svg { width: 100%; height: 100%; max-height: 185px; object-fit: contain; }.status-light { position: absolute; width: 12px; height: 12px; right: 10px; top: 10px; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px #d6e3ed; }.green { background: #41b387; }.red { background: #e26757; }.working .rotor { transform-origin: 70px 70px; animation: rotate 2s linear infinite; }.faulty { filter: saturate(.7); }@keyframes rotate { to { transform: rotate(360deg); } }@media (prefers-reduced-motion: reduce) { .working .rotor { animation: none; } }
</style>
