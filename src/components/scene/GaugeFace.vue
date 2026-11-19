<script setup lang="ts">
import { computed } from 'vue'
import SevenSegment from './SevenSegment.vue'
import { dialPoint } from './geometry'
import { finiteGaugeNumber, fitGaugeFont, formatDigitalReading, formatGaugeReading, gaugeFraction, gaugePrecision, gaugeTicks, type GaugeVisualKind } from './gauge'

const props = withDefaults(defineProps<{ kind: GaugeVisualKind; width: number; height: number; value: number; unit?: string; min?: number; max?: number; attributes?: Record<string, unknown>; dialFill?: string }>(), { unit: '', min: 0, max: 100, attributes: () => ({}), dialFill: '#ebedef' })
const size = computed(() => Math.min(props.width, props.height))
const a = (key: string, fallback = '') => String(props.attributes[key] ?? fallback)
const n = (key: string, fallback: number) => finiteGaugeNumber(props.attributes[key], fallback)
const valueText = computed(() => props.kind === 'gauge' ? formatGaugeReading(props.value, gaugePrecision(props.attributes.valueFormat ?? props.attributes.valueFormatString, /RPM|°C|℃/i.test(props.unit) ? 0 : 2)) : formatDigitalReading(props.value))
const reading = computed(() => `${valueText.value}${props.unit ? ` ${props.unit}` : ''}`)
const ticks = computed(() => gaugeTicks(props.min, props.max, props.attributes).map(tick => ({ ...tick, outer: dialPoint(size.value, tick.ratio, .405), inner: dialPoint(size.value, tick.ratio, tick.major ? .35 : .38), position: dialPoint(size.value, tick.ratio, .285) })))
const needle = computed(() => dialPoint(size.value, gaugeFraction(props.value, props.min, props.max), .33))
const tickFont = computed(() => Math.min(size.value * .075, Math.max(size.value * .06, n('labelFontSize', size.value * .068))))
const readingFont = computed(() => fitGaugeFont(reading.value, size.value * .72, Math.min(size.value * .1, Math.max(size.value * .08, n('valueFontSize', size.value * .08)))))
const labelFont = (text: string) => fitGaugeFont(text, size.value * .8, size.value * .1)
const screen = computed(() => ({ x: (props.width - size.value * .65) / 2, y: (props.height - size.value * .35) / 2, width: size.value * .65, height: size.value * .35 }))
const screenPadding = computed(() => Math.min(props.width, props.height) * .05)
</script>

<template>
  <svg class="gauge-face" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="`${kind === 'gauge' ? '指针仪表' : kind === 'digital-screen' ? '数字屏' : '数字仪表'}：${reading}`" :data-gauge-visual="kind" :data-gauge-value="value" :data-gauge-unit="unit" :data-gauge-min="min" :data-gauge-max="max">
    <g v-if="kind === 'gauge'" :transform="`translate(${(width - size) / 2} ${(height - size) / 2})`">
      <circle :cx="size / 2" :cy="size / 2" :r="size * .475" :fill="dialFill" stroke="#525c60" :stroke-width="size * .02" />
      <circle :cx="size / 2" :cy="size / 2" :r="size * .425" fill="white" stroke="#aaa" :stroke-width="size * .005" />
      <g v-for="tick in ticks" :key="tick.ratio">
        <line :x1="tick.outer.x" :y1="tick.outer.y" :x2="tick.inner.x" :y2="tick.inner.y" stroke="#151515" :stroke-width="size * (tick.major ? .009 : .004)" />
        <text v-if="tick.label !== undefined" data-gauge-tick :x="tick.position.x" :y="tick.position.y" dominant-baseline="central" text-anchor="middle" :font-size="tickFont" fill="#151515">{{ tick.label }}</text>
      </g>
      <line data-gauge-needle :x1="size / 2" :y1="size / 2" :x2="needle.x" :y2="needle.y" :stroke="a('needleColor', 'red')" :stroke-width="size * .017" stroke-linecap="round" />
      <circle :cx="size / 2" :cy="size / 2" :r="size * .035" fill="#333" />
      <text data-gauge-reading :x="size / 2" :y="size * .765" text-anchor="middle" :font-size="readingFont" fill="#151515">{{ reading }}</text>
    </g>
    <template v-else-if="kind === 'digital-gauge'">
      <rect :x="size * .03" :y="size * .03" :width="Math.max(0, width - size * .06)" :height="Math.max(0, height - size * .06)" :rx="size / 2" :fill="a('panBackground', 'none')" :stroke="a('bodyColor', 'green')" :stroke-width="size * .06" />
      <rect :x="screen.x" :y="screen.y" :width="screen.width" :height="screen.height" :rx="size * .06" :fill="a('screenColor', 'black')" />
      <SevenSegment class="digital-number" :value="valueText" :x="screen.x + size * .03" :y="screen.y + size * .05" :width="screen.width - size * .06" :height="screen.height - size * .1" color="#00ff00" />
      <text v-if="a('numberLabel')" :x="width / 2" :y="height / 2 - size * .21" text-anchor="middle" :font-size="labelFont(a('numberLabel'))" fill="#151515">{{ a('numberLabel') }}</text>
      <text v-if="unit" data-gauge-unit-label :x="width / 2" :y="height / 2 + size * .29" text-anchor="middle" :font-size="labelFont(unit)" fill="#151515">{{ unit }}</text>
    </template>
    <template v-else>
      <rect :width="width" :height="height" fill="black" />
      <SevenSegment class="digital-number" :value="valueText" :x="screenPadding" :y="screenPadding" :width="width - screenPadding * 2" :height="height * (unit ? .7 : 1) - screenPadding * 2" color="#00ff00" />
      <text v-if="unit" data-gauge-unit-label :x="width - screenPadding" :y="height - screenPadding" text-anchor="end" :font-size="fitGaugeFont(unit, width - screenPadding * 2, height * .2)" fill="#00ff00">{{ unit }}</text>
    </template>
  </svg>
</template>

<style scoped>
.gauge-face { overflow: hidden; font-family: 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif; }
</style>
