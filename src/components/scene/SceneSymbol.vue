<script setup lang="ts">
import { computed } from 'vue'
import type { SceneDevice, SceneNode } from '../../types/scene'
import { roundedRect, sides, wrapLabel } from './geometry'
import { nodeAttribute, nodeNumber, nodeRange, nodeUnit, nodeValue, sceneVectors } from './scenes'
import { gaugeVisualKind } from './gauge'
import GaugeFace from './GaugeFace.vue'

const props = defineProps<{ node: SceneNode; device?: SceneDevice; running: boolean; uid: string; stationType?: string }>()
const emit = defineEmits<{ action: [command: string, value?: string | number | boolean] }>()
const node = computed(() => props.node)
const legendLabel = computed(() => /^overview-text-(46|47|48|49|50)$/.test(props.node.id))
const w = computed(() => legendLabel.value ? 100 : props.node.id === 'overview-region-19' ? 260 : props.node.width)
const h = computed(() => props.node.height)
const font = computed(() => legendLabel.value ? 17 : nodeNumber(props.node, 'fontSize', 12))
const a = (key: string, fallback = '') => nodeAttribute(props.node, key, fallback)
const n = (key: string, fallback = 0) => nodeNumber(props.node, key, fallback)
const paint = (name: string) => `url(#${props.uid}-${name})`
const value = computed(() => nodeValue(props.node, props.device))
const unit = computed(() => nodeUnit(props.node, props.device))
const enabled = computed(() => props.device?.enabled !== false && props.node.attributes?.enabled !== false)
const working = computed(() => props.device?.working ?? Boolean(props.node.attributes?.checked))
const opened = computed(() => working.value || value.value > 0)
const stateColor = computed(() => !enabled.value ? '#9e9e9e' : props.device?.error ? '#f44336' : working.value || (props.node.kind === 'valve' && value.value > 0) ? '#4caf50' : props.node.kind === 'valve' ? '#f44336' : '#88949b')
const image = computed(() => props.node.kind === 'engine' ? `/simulator-web/assets/controls/${props.device?.error ? 'EngineW' : working.value ? 'Engine' : 'EngineN'}.png` : a('image'))
const vertical = computed(() => a('orientation') === 'Vertical' || h.value > w.value)
const border = computed(() => sides(a('borderThickness', '1')))
const borderEdges = computed(() => [
  { x1: 0, y1: h.value, x2: 0, y2: 0, thickness: border.value[0] },
  { x1: 0, y1: 0, x2: w.value, y2: 0, thickness: border.value[1] },
  { x1: w.value, y1: 0, x2: w.value, y2: h.value, thickness: border.value[2] },
  { x1: 0, y1: h.value, x2: w.value, y2: h.value, thickness: border.value[3] },
])
const vector = computed(() => props.node.symbol ? sceneVectors[props.node.symbol] : undefined)
const roundButton = computed(() => /Round|EmergencyStop|MetalCtrlButton/.test(a('style')) && a('style') !== 'NavButton')
const source = computed(() => a('sourceType'))
const text = computed(() => a('textPath') === 'StationName' ? props.stationType || '加注站' : props.node.label || (props.device ? `${value.value.toFixed(1)} ${unit.value}`.trim() : ''))
const textLines = computed(() => legendLabel.value ? [text.value] : wrapLabel(text.value, Math.max(1, w.value - (a('style') === 'NavButton' ? 10 : 4)), font.value))
const textFont = computed(() => Math.min(font.value, h.value > 0 ? h.value / Math.max(1, textLines.value.length) / 1.15 : font.value))
const fontWeights: Record<string, number> = { Bold: 700, SemiBold: 600, Black: 900, Regular: 400 }
const textWeight = computed(() => fontWeights[a('fontWeight')] ?? 400)
const textCentered = computed(() => a('textAlign') === 'Center' || source.value === 'Label' || props.node.kind === 'button')
const labelDirection = computed(() => a('labelDirection', 'Bottom').toLowerCase())
const sensorLayout = computed(() => {
  const side = ['right', 'left'].includes(labelDirection.value)
  const reserved = side ? n('labelRotate') % 180 ? font.value + 3 : Math.min(w.value * 0.55, props.node.label.length * font.value * 0.57) : font.value * 1.3
  const x = labelDirection.value === 'left' ? reserved : 0
  const y = labelDirection.value === 'top' ? reserved : 0
  return { x, y, width: Math.max(1, w.value - (side ? reserved : 0)), height: Math.max(1, h.value - (side ? 0 : reserved)), labelX: side ? labelDirection.value === 'left' ? reserved / 2 : w.value - reserved / 2 : w.value / 2, labelY: side ? h.value / 2 : labelDirection.value === 'top' ? font.value : h.value - 1 }
})
const circlePrefix = computed(() => a('sensorPrefix') || props.node.label.match(/^[A-Za-z]+/)?.[0] || 'FQ')
const circleNumber = computed(() => a('sensorNumber') || props.node.label.slice(circlePrefix.value.length))
const gaugeSize = computed(() => Math.min(w.value, h.value))
const gaugeKind = computed(() => gaugeVisualKind(props.node))
const readingRange = computed(() => nodeRange(props.node, props.device))
const gaugeMin = computed(() => n('min', props.device?.min ?? 0))
const gaugeMax = computed(() => n('max', props.device?.max ?? 100))
const gaugeRatio = computed(() => {
  const min = props.node.kind === 'level' && props.device ? props.device.min : gaugeMin.value
  const max = props.node.kind === 'level' && props.device ? props.device.max : gaugeMax.value
  return Math.max(0, Math.min(1, (value.value - min) / Math.max(0.000001, max - min)))
})
const tankPercent = computed(() => Math.max(0, Math.min(100, value.value * ((props.device?.max ?? 1) <= 1 ? 100 : 1))))
const stationImage = computed(() => {
  const type = /车|船|岸|站/.test(props.device?.mode ?? '') ? props.device!.mode : props.stationType || a('stationType', '加注车')
  return `/simulator-web/assets/controls/FuelStation/${/船|ship/i.test(type) ? 'FuelShip.png' : /岸|站|coast/i.test(type) ? '1.png' : 'FuelCar.png'}`
})
function inputValue(event: Event) {
  const input = event.target as HTMLInputElement
  emit('action', props.node.command ?? 'set-value', input.type === 'checkbox' ? input.checked : input.type === 'range' || input.type === 'number' ? Number(input.value) : input.value)
}
</script>

<template>
  <!-- This component paints one imported node in its local WPF rectangle. -->
  <g :class="['scene-symbol', `symbol-${node.kind}`, { disabled: !enabled }]">
    <!-- Pipe and hose paths are drawn together by PipeLayer, not animated
         independently from the global running flag. -->
    <template v-if="node.kind === 'valve'">
      <image :href="image" x="0" y="0" :width="w" :height="Math.max(1, h - (source === 'BreatherValve' ? 0 : font * 1.25))" preserveAspectRatio="xMidYMid meet" />
      <circle v-if="source !== 'BreatherValve' && a('stateIndicatorVisibility') !== 'Hidden' && a('stateIndicatorVisibility') !== 'Collapsed'" :cx="Math.max(3, w - Math.min(5, w * 0.12))" :cy="Math.min(7, h * 0.1)" :r="Math.min(5, w * 0.13)" :fill="stateColor" stroke="white" :stroke-width="Math.min(1.5, w * 0.04)" />
      <text v-if="source !== 'BreatherValve' && a('labelVisibility') !== 'Hidden' && a('labelVisibility') !== 'Collapsed'" :x="w / 2" :y="h - 1" :font-size="font" font-weight="700" text-anchor="middle" fill="black">{{ node.label }}</text>
    </template>

    <template v-else-if="node.kind === 'sensor'">
      <template v-if="image">
        <image :href="image" :x="sensorLayout.x" :y="sensorLayout.y" :width="sensorLayout.width" :height="sensorLayout.height" preserveAspectRatio="xMidYMid meet" :transform="n('imageRotate') ? `rotate(${n('imageRotate')} ${sensorLayout.x + sensorLayout.width / 2} ${sensorLayout.y + sensorLayout.height / 2})` : undefined" />
        <text :x="sensorLayout.labelX" :y="sensorLayout.labelY" text-anchor="middle" :dominant-baseline="['left', 'right'].includes(labelDirection) ? 'central' : undefined" :font-size="font" :font-weight="textWeight" fill="black" :transform="n('labelRotate') ? `rotate(${n('labelRotate')} ${sensorLayout.labelX} ${sensorLayout.labelY})` : undefined">{{ node.label }}</text>
      </template>
      <template v-else>
        <ellipse :cx="w / 2" :cy="h / 2" :rx="Math.max(0.5, w / 2 - 1)" :ry="Math.max(0.5, h / 2 - 1)" fill="none" stroke="black" stroke-width="1.5" />
        <line x1="1" :y1="h / 2" :x2="w - 1" :y2="h / 2" stroke="black" :stroke-width="n('lineThickness', 1)" />
        <text :x="w / 2" :y="h * 0.37" text-anchor="middle" :font-size="Math.min(font, h * 0.32)" :font-weight="textWeight">{{ circlePrefix }}</text>
        <text :x="w / 2" :y="h * 0.82" text-anchor="middle" :font-size="Math.min(font, h * 0.32)" :font-weight="textWeight">{{ circleNumber }}</text>
      </template>
    </template>

    <template v-else-if="node.kind === 'pump'">
      <image :href="image" :width="w" :height="Math.max(1, h - Math.min(font * 1.2 * Math.max(1, node.label.split('\n').length), h * 0.35))" preserveAspectRatio="xMidYMid meet" />
      <ellipse :cx="w * 0.34" :cy="h * 0.23" :rx="Math.max(2, w * 0.16)" :ry="Math.max(2, Math.min(w * 0.16, h * 0.055))" :fill="stateColor" />
      <text :x="w / 2" :y="h - font * 1.15 * (node.label.split('\n').length - 1)" :font-size="font" text-anchor="middle" fill="black"><tspan v-for="(line, index) in node.label.split('\n')" :key="index" :x="w / 2" :dy="index ? font * 1.15 : 0">{{ line }}</tspan></text>
    </template>

    <template v-else-if="node.kind === 'fan'">
      <svg :width="w" :height="h" viewBox="0 0 30 30" preserveAspectRatio="xMidYMid meet">
        <circle cx="15" cy="15" r="14" :fill="source === 'FanIndicator' ? working ? '#ffe74b' : '#8e870f' : '#f5f5f5'" stroke="black" stroke-width="1.5" />
        <g :class="{ spinning: running && working }">
          <path d="M7 4.15 15.25 14.5 M18 1.85 15.35 15.5 M27 8.75 15.35 15.5 M28.25 18 15.35 15.5 M23.35 25.5 14.75 15.5 M14 28.5 14.55 15 M5.5 24.5 14.55 15 M1.55 13.5 14.55 14.3" fill="none" stroke="#919191" stroke-width="1.5" />
        </g>
        <circle cx="15" cy="15" r="1.25" fill="silver" />
      </svg>
    </template>

    <template v-else-if="node.kind === 'engine'">
      <image :href="image" :width="w" :height="h" preserveAspectRatio="xMidYMid meet" />
      <circle :cx="w - 10" cy="10" r="6" :fill="stateColor" stroke="white" stroke-width="1.5" />
    </template>

    <template v-else-if="node.kind === 'tank'">
      <rect x="1" y="1" :width="Math.max(0, w - 2)" :height="Math.max(0, h - 2)" :rx="w * 150 / 605" :ry="h * 150 / 405" :fill="paint('tank')" stroke="black" stroke-width="2" />
      <text :x="w / 2" :y="h - Math.max(3, h * 0.025)" text-anchor="middle" :font-size="Math.min(w * 30 / 605, h * 0.08)" fill="black">当前罐体容量：{{ tankPercent.toFixed(2) }}%</text>
    </template>

    <template v-else-if="node.kind === 'water-tank'">
      <image :href="image" :x="w * 0.165" :y="-h * 0.028" :width="w * 0.664" :height="h" preserveAspectRatio="xMidYMid meet" :transform="`rotate(90 ${w * 0.497} ${h * 0.472})`" />
      <rect :x="w * 0.733" :y="h * 0.36" :width="w * 0.221" :height="h * 0.228" fill="white" stroke="black" stroke-width="1" />
      <rect :x="w * 0.739" :y="h * (0.58 - 0.21 * Math.max(0, Math.min(1, value > 1 ? value / 100 : value || 0.5)))" :width="w * 0.207" :height="h * 0.21 * Math.max(0, Math.min(1, value > 1 ? value / 100 : value || 0.5))" fill="#00cc00" opacity="0.7" />
    </template>

    <image v-else-if="['nitrogen-cylinder', 'balance-tank', 'heater', 'filter', 'dual-filter', 'image'].includes(node.kind)" :href="image" :width="w" :height="h" :preserveAspectRatio="['nitrogen-cylinder', 'balance-tank', 'heater', 'dual-filter'].includes(node.kind) ? 'none' : 'xMidYMid meet'" />
    <image v-else-if="node.kind === 'station'" :href="stationImage" :width="w" :height="h" preserveAspectRatio="xMidYMid meet" />

    <template v-else-if="node.kind === 'level'">
      <rect :width="w" :height="h" fill="white" stroke="black" stroke-width="1" />
      <rect x="2" :y="h * (1 - gaugeRatio)" :width="Math.max(0, w - 4)" :height="h * gaugeRatio" fill="#0075c9" opacity="0.8" />
      <line v-for="index in 11" :key="index" x1="0" :x2="index % 5 === 1 ? w * 0.6 : w * 0.3" :y1="h * (index - 1) / 10" :y2="h * (index - 1) / 10" stroke="black" stroke-width="0.7" />
    </template>

    <GaugeFace v-else-if="gaugeKind" :kind="gaugeKind" :width="w" :height="h" :value="value" :unit="unit" :min="readingRange.min" :max="readingRange.max" :attributes="node.attributes" :dial-fill="paint('dial')" />

    <svg v-else-if="node.kind === 'control-button'" :width="w" :height="h" viewBox="0 0 120 102" preserveAspectRatio="xMidYMid meet" overflow="visible">
      <rect width="120" height="38" fill="DimGray" stroke="black" stroke-width="2" />
      <text x="60" y="29" font-size="29" text-anchor="middle" fill="white">{{ node.label }}</text>
      <g v-for="(command, index) in [a('greenCommand', 'OpenCommand'), a('redCommand', 'CloseCommand')]" :key="command" :transform="`translate(${index * 60} 40)`" data-scene-action="true" class="control-face" role="button" tabindex="0" :aria-label="`${index ? '关闭' : '开启'} ${node.deviceId || node.label}`" :data-command="command" @click.stop="enabled && emit('action', command)" @keydown.enter.stop.prevent="enabled && emit('action', command)" @keydown.space.stop.prevent="enabled && emit('action', command)">
        <circle cx="30" cy="30" r="28.5" :fill="paint('metal')" stroke="#606060" stroke-width="3" />
        <circle cx="30" cy="30" r="25" fill="none" stroke="#666" stroke-width="1" />
        <circle cx="30" cy="30" r="24" :fill="index ? opened ? '#8b0000' : '#ff3333' : opened ? '#3df95f' : '#008000'" stroke="#2e5984" stroke-width="1" />
        <circle cx="26" cy="24" r="15" :fill="paint('highlight')" :opacity="index ? opened ? 0.3 : 0.7 : opened ? 0.7 : 0.3" />
      </g>
    </svg>

    <template v-else-if="node.kind === 'button'">
      <template v-if="roundButton">
        <ellipse :cx="w / 2" :cy="h / 2" :rx="Math.max(0, w / 2 - 1.5)" :ry="Math.max(0, h / 2 - 1.5)" :fill="paint('metal')" stroke="#606060" stroke-width="3" />
        <ellipse :cx="w / 2" :cy="h / 2" :rx="Math.max(0, w / 2 - 6)" :ry="Math.max(0, h / 2 - 6)" :fill="a('background', '#808080')" stroke="#535353" stroke-width="1" />
        <ellipse :cx="w * 0.44" :cy="h * 0.4" :rx="w * 0.23" :ry="h * 0.23" :fill="paint('highlight')" opacity="0.55" />
      </template>
      <rect v-else :width="w" :height="h" :rx="n('cornerRadius')" :fill="a('background', '#ff9800')" :stroke="a('borderColor', '#ffff00')" :stroke-width="n('borderThickness', 0.8)" />
      <text v-if="text" :x="w / 2" :y="(h - textLines.length * textFont * 1.15) / 2 + textFont" text-anchor="middle" :font-size="textFont" :font-weight="textWeight" :fill="a('foreground', 'white')"><tspan v-for="(line, index) in textLines" :key="index" :x="w / 2" :dy="index ? textFont * 1.15 : 0">{{ line }}</tspan></text>
    </template>

    <template v-else-if="node.kind === 'led'">
      <ellipse :cx="w / 2" :cy="h / 2" :rx="Math.max(0, w / 2 - 1.5)" :ry="Math.max(0, h / 2 - 1.5)" :fill="paint('metal')" stroke="#333" stroke-width="1.5" />
      <ellipse :cx="w / 2" :cy="h / 2" :rx="Math.max(0, w / 2 - 5)" :ry="Math.max(0, h / 2 - 5)" :fill="working ? a('background', '#32dc5f') : '#3d5555'" />
      <ellipse :cx="w * 0.44" :cy="h * 0.38" :rx="w * 0.2" :ry="h * 0.2" :fill="paint('highlight')" opacity="0.55" />
    </template>

    <template v-else-if="node.kind === 'knob'">
      <circle :cx="w / 2" :cy="h / 2" :r="gaugeSize * 0.47" :fill="paint('metal')" stroke="black" stroke-width="1" />
      <g v-for="index in 13" :key="index" :transform="`rotate(${-90 + (index - 1) * 15} ${w / 2} ${h / 2})`"><line :x1="w / 2" :y1="h / 2 - gaugeSize * 0.46" :x2="w / 2" :y2="h / 2 - gaugeSize * 0.4" stroke="black" stroke-width="1" /></g>
      <circle :cx="w / 2" :cy="h / 2" :r="gaugeSize * 0.35" fill="#3b3b3b" stroke="black" stroke-width="1" />
      <rect :x="w / 2 - gaugeSize * 0.035" :y="h / 2 - gaugeSize * 0.32" :width="gaugeSize * 0.07" :height="gaugeSize * 0.64" fill="#151515" stroke="white" stroke-width="1" :transform="`rotate(${(value || n('value', 1)) === 3 ? 90 : (value || n('value', 1)) === 2 ? 0 : -90} ${w / 2} ${h / 2})`" />
    </template>

    <foreignObject v-else-if="['input', 'slider', 'checkbox'].includes(node.kind)" :width="Math.max(w, 20)" :height="Math.max(h, 20)" data-scene-action="true">
      <div xmlns="http://www.w3.org/1999/xhtml" class="html-control" :style="{ fontSize: `${font}px` }" @click.stop @pointerdown.stop>
        <select v-if="a('inputType') === 'select'" :aria-label="'加注站类型'" :value="stationType || a('stationType', '加注车')" @change="inputValue"><option v-for="option in (node.attributes?.options as string[] || [])" :key="option" :value="option">{{ option }}</option></select>
        <input v-else-if="node.kind === 'slider'" type="range" :aria-label="`${node.deviceId || node.label} 调节`" :min="gaugeMin" :max="gaugeMax" :value="value" :disabled="!enabled" :class="{ vertical: vertical }" @change="inputValue" />
        <label v-else-if="node.kind === 'checkbox'"><input type="checkbox" :checked="opened" @change="inputValue" />{{ node.label }}</label>
        <input v-else type="number" :aria-label="`${node.deviceId || node.label || '设定值'}`" :min="gaugeMin" :max="gaugeMax" :value="value" :disabled="!enabled" @change="inputValue" />
      </div>
    </foreignObject>

    <template v-else-if="node.kind === 'text'">
      <rect v-if="a('background')" :width="w" :height="h" :rx="a('style') === 'InOut' ? 3 : 0" :fill="a('background')" :stroke="a('style') === 'InOut' ? 'black' : a('borderColor', 'none')" :stroke-width="a('style') === 'InOut' ? 1 : n('borderThickness')" />
      <text :x="textCentered ? w / 2 : 1" :y="(h - textLines.length * textFont * 1.15) / 2 + textFont" :text-anchor="textCentered ? 'middle' : 'start'" :font-size="textFont" :font-weight="textWeight" :fill="['InOut', 'PanelLabel'].includes(a('style')) ? 'white' : a('foreground', 'black')"><tspan v-for="(line, index) in textLines" :key="index" :x="textCentered ? w / 2 : 1" :dy="index ? textFont * 1.15 : 0">{{ line }}</tspan></text>
    </template>

    <template v-else-if="node.kind === 'shape' && vector">
      <svg :width="w" :height="h" :viewBox="vector.viewBox" preserveAspectRatio="none"><path v-for="(path, index) in vector.paths" :key="index" :d="path.d" :fill="path.fill" /></svg>
    </template>
    <template v-else-if="node.kind === 'shape'">
      <ellipse v-if="a('shape') === 'ellipse'" :cx="w / 2" :cy="h / 2" :rx="w / 2" :ry="h / 2" :fill="a('fill', 'none')" :stroke="a('stroke', 'none')" :stroke-width="n('strokeWidth', 1)" />
      <path v-else-if="a('shape') === 'path'" :d="a('path')" :fill="a('fill', 'none')" :stroke="a('stroke', 'none')" :stroke-width="n('strokeWidth', 1)" />
      <line v-else-if="w === 0 || h === 0" x1="0" y1="0" :x2="w" :y2="h" :stroke="a('stroke', a('fill', 'black'))" :stroke-width="n('strokeWidth', 1)" :stroke-dasharray="a('dash') ? a('dash').split(/[\s,]+/).map(Number).map(item => item * n('strokeWidth', 1)).join(' ') : undefined" />
      <rect v-else :width="w" :height="h" :fill="a('fill', 'none')" :stroke="a('stroke', 'none')" :stroke-width="n('strokeWidth', 1)" :stroke-dasharray="a('dash') ? a('dash').split(/[\s,]+/).map(Number).map(item => item * n('strokeWidth', 1)).join(' ') : undefined" />
    </template>
    <template v-else-if="node.kind === 'region'">
      <rect :width="w" :height="h" :rx="n('cornerRadius')" :fill="a('background', 'none')" :stroke="n('cornerRadius') ? a('borderColor', 'none') : 'none'" :stroke-width="Math.max(...border)" />
      <template v-if="!n('cornerRadius')"><line v-for="(edge, index) in borderEdges" :key="index" :x1="edge.x1" :y1="index === 0 ? h : edge.y1" :x2="edge.x2" :y2="index === 0 ? 0 : edge.y2" :stroke="a('borderColor', 'none')" :stroke-width="edge.thickness" /></template>
    </template>
  </g>
</template>

<style scoped>
.scene-symbol { font-family: 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif; }
.disabled { opacity: 0.52; }
.spinning { animation: fan-spin 3s linear infinite; transform-box: fill-box; transform-origin: center; }
.control-face { cursor: pointer; }
.control-face:hover { filter: brightness(1.15); }
.control-face:focus { outline: none; filter: drop-shadow(0 0 3px #004ea0); }
.html-control { width: 100%; height: 100%; display: flex; align-items: center; color: black; }
.html-control input, .html-control select { box-sizing: border-box; width: 100%; height: 100%; min-width: 0; padding: 2px; font: inherit; border: 1px solid #777; background: white; }
.html-control input[type='range'] { border: 0; background: transparent; accent-color: #004ea0; padding: 0; }
.html-control input.vertical { writing-mode: vertical-lr; direction: rtl; }
.html-control input[type='checkbox'] { width: auto; height: auto; }
.html-control label { display: flex; align-items: center; gap: 6px; }
@keyframes fan-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinning { animation-duration: 8s; } }
</style>

