<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { historyFor, useHistoryRecorder, type TrendPoint, type TrendSeries } from '../dialogs/history'
import { downloadCsv, findDevice } from '../dialogs/toolHelpers'

const props = withDefaults(defineProps<{
  deviceId?: string
  points?: readonly TrendPoint[]
  data?: readonly (number | TrendPoint)[]
  series?: readonly TrendSeries[]
  title?: string
  unit?: string
  color?: string
  min?: number
  max?: number
  height?: number
  windowSeconds?: number
  showControls?: boolean
}>(), { title: '', unit: '', color: '#267eb8', height: 210, windowSeconds: 300, showControls: false })
useHistoryRecorder()
const colors = ['#267eb8', '#dd934d', '#6eac86', '#a584c8', '#cf6d7c']
const paused = ref(false)
const frozen = ref<TrendSeries[]>([])
const hoverIndex = ref<number | null>(null)
const showSamples = ref(false)
const windowSize = ref(props.windowSeconds)
watch(() => props.windowSeconds, value => { windowSize.value = value })
const liveSeries = computed<TrendSeries[]>(() => {
  if (props.series?.length) return props.series.map((series, index) => ({ ...series, color: series.color || colors[index % colors.length] }))
  const device = props.deviceId ? findDevice(props.deviceId) : undefined
  const points = props.points || (props.data ? props.data.map((point, index) => typeof point === 'number' ? { time: index * 1000, value: point } : point) : props.deviceId ? historyFor(props.deviceId) : [])
  return [{ name: props.title || device?.name || props.deviceId || '测量值', unit: props.unit || device?.unit || '', color: props.color, points }]
})
const plottedSeries = computed(() => (paused.value ? frozen.value : liveSeries.value).map(series => {
  const valid = series.points.filter(point => Number.isFinite(point.value) && Number.isFinite(point.time))
  const end = valid[valid.length - 1]?.time || 0
  return { ...series, points: windowSize.value > 0 ? valid.filter(point => point.time >= end - windowSize.value * 1000) : valid }
}))
const allPoints = computed(() => plottedSeries.value.flatMap(series => series.points))
const bounds = computed(() => {
  const values = allPoints.value.map(point => point.value)
  const low = props.min ?? (values.length ? Math.min(...values) : 0)
  let high = props.max ?? (values.length ? Math.max(...values) : 100)
  if (high <= low) high = low + Math.max(Math.abs(low) * 0.1, 1)
  const times = allPoints.value.map(point => point.time)
  const left = times.length ? Math.min(...times) : 0
  const right = times.length ? Math.max(...times) : 1
  return { low, high, left, right: right === left ? left + 1000 : right }
})
const width = 760, plotLeft = 60, plotRight = 735, plotTop = 16, plotBottom = 168
const x = (time: number) => plotLeft + (time - bounds.value.left) / (bounds.value.right - bounds.value.left) * (plotRight - plotLeft)
const y = (value: number) => Math.max(plotTop, Math.min(plotBottom, plotBottom - (value - bounds.value.low) / (bounds.value.high - bounds.value.low) * (plotBottom - plotTop)))
const line = (points: readonly TrendPoint[]) => points.map(point => `${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ')
const ticks = computed(() => Array.from({ length: 5 }, (_, index) => ({ value: bounds.value.low + (bounds.value.high - bounds.value.low) * index / 4, y: plotBottom - (plotBottom - plotTop) * index / 4 })))
const mainPoints = computed(() => plottedSeries.value[0]?.points || [])
const hovered = computed(() => hoverIndex.value === null ? undefined : mainPoints.value[hoverIndex.value])
const latest = computed(() => mainPoints.value[mainPoints.value.length - 1])
const axisUnit = computed(() => props.unit || plottedSeries.value[0]?.unit || '')
const sampleRows = computed(() => mainPoints.value.slice(-12).reverse())
const format = (number: number) => Math.abs(number) >= 10000 ? number.toExponential(1) : Number(number.toFixed(2)).toLocaleString('zh-CN')
const timeLabel = (time: number) => time < 86400000 ? `${(time / 1000).toFixed(0)} s` : new Date(time).toLocaleTimeString('zh-CN', { hour12: false })
function togglePause() {
  if (!paused.value) frozen.value = liveSeries.value.map(series => ({ ...series, points: series.points.map(point => ({ ...point })) }))
  paused.value = !paused.value
  hoverIndex.value = null
}
function hover(event: MouseEvent) {
  if (!mainPoints.value.length) return
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const cursorX = (event.clientX - rect.left) / rect.width * width
  let index = 0, distance = Infinity
  mainPoints.value.forEach((point, current) => { const delta = Math.abs(x(point.time) - cursorX); if (delta < distance) { distance = delta; index = current } })
  hoverIndex.value = index
}
function exportData() {
  downloadCsv(`${props.title || props.deviceId || '历史趋势'}.csv`, ['数据源', '采集时间', '仿真时间(s)', '测量值', '单位'],
    plottedSeries.value.flatMap(series => series.points.map(point => [series.name, new Date(point.time).toISOString(), point.elapsed ?? '', point.value, series.unit || axisUnit.value])))
}
defineExpose({ exportData })
</script>

<template>
  <section class="trend-chart" :aria-label="title || `${deviceId || ''}历史趋势`">
    <div v-if="title || showControls" class="chart-heading"><strong>{{ title || deviceId }}</strong><span class="unit">单位：{{ axisUnit || '无量纲' }}</span></div>
    <div v-if="showControls" class="chart-controls">
      <label>时间范围 <select v-model.number="windowSize" class="field"><option :value="60">近 1 分钟</option><option :value="300">近 5 分钟</option><option :value="900">近 15 分钟</option><option :value="0">全部采样</option></select></label>
      <button class="btn" type="button" @click="togglePause">{{ paused ? '继续刷新' : '冻结曲线' }}</button>
      <button class="btn" type="button" :disabled="!allPoints.length" @click="exportData">导出 CSV</button>
      <button class="btn" type="button" @click="showSamples = !showSamples">{{ showSamples ? '收起采样' : '采样数据' }}</button>
    </div>
    <div class="chart-plot" :style="{ minHeight: `${height}px` }">
      <svg :viewBox="`0 0 ${width} 200`" role="img" :aria-label="`${title || deviceId}，最新值 ${latest?.value ?? '无采样'} ${axisUnit}`" @mousemove="hover" @mouseleave="hoverIndex = null">
        <g v-for="tick in ticks" :key="tick.y"><line :x1="plotLeft" :x2="plotRight" :y1="tick.y" :y2="tick.y" stroke="#e3edf5" stroke-dasharray="4 4"/><text :x="plotLeft - 8" :y="tick.y + 4" text-anchor="end">{{ format(tick.value) }}</text></g>
        <line :x1="plotLeft" :x2="plotRight" :y1="plotBottom" :y2="plotBottom" stroke="#bdcfdd"/>
        <g v-for="seriesItem in plottedSeries" :key="seriesItem.name"><polyline :points="line(seriesItem.points)" fill="none" :stroke="seriesItem.color" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><circle v-if="seriesItem.points.length === 1" :cx="x(seriesItem.points[0]!.time)" :cy="y(seriesItem.points[0]!.value)" r="3.5" :fill="seriesItem.color"/></g>
        <g v-if="hovered"><line :x1="x(hovered.time)" :x2="x(hovered.time)" :y1="plotTop" :y2="plotBottom" stroke="#7ea6c7" stroke-dasharray="3 3"/><circle :cx="x(hovered.time)" :cy="y(hovered.value)" r="4" :fill="color" stroke="white" stroke-width="2"/></g>
        <text :x="plotLeft" y="188">{{ allPoints.length ? timeLabel(bounds.left) : '开始采样' }}</text><text :x="plotRight" y="188" text-anchor="end">{{ allPoints.length > 1 ? timeLabel(bounds.right) : '' }}</text>
        <text v-if="!allPoints.length" x="395" y="98" text-anchor="middle" class="no-samples">尚无采样 · 设备数值变化后记录真实趋势</text>
      </svg>
      <div v-if="hovered" class="chart-tooltip"><span>{{ timeLabel(hovered.time) }}</span><strong>{{ format(hovered.value) }} {{ axisUnit }}</strong></div>
    </div>
    <div class="chart-summary"><span v-for="seriesItem in plottedSeries" :key="seriesItem.name"><i :style="{ background: seriesItem.color }"/>{{ seriesItem.name }}</span><span class="sample-count">{{ mainPoints.length }} 个真实采样</span><strong v-if="latest">{{ format(latest.value) }} {{ axisUnit }}</strong><span v-if="paused" class="frozen">已冻结</span></div>
    <table v-if="showSamples" class="sample-table"><thead><tr><th>采集时间</th><th>仿真时间(s)</th><th>测量值</th></tr></thead><tbody><tr v-for="(point, index) in sampleRows" :key="`${point.time}-${index}`"><td>{{ timeLabel(point.time) }}</td><td>{{ point.elapsed?.toFixed(1) ?? '—' }}</td><td>{{ format(point.value) }} {{ axisUnit }}</td></tr></tbody></table>
  </section>
</template>

<style scoped>
.trend-chart { min-width: 0; color: #31536f; }.chart-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; }.unit { font-size: 11px; color: #8397a9; }
.chart-controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0; }.chart-controls label { display: flex; align-items: center; gap: 6px; font-size: 12px; }.chart-controls .field { padding: 5px; }.chart-controls .btn { padding: 5px 8px; font-size: 11px; }
.chart-plot { position: relative; display: grid; align-items: center; background: linear-gradient(#fff, #fafcff); border-radius: 6px; }.chart-plot svg { width: 100%; height: auto; min-height: 160px; overflow: visible; }.chart-plot text { font-family: inherit; font-size: 10px; fill: #889eaf; }.chart-plot text.no-samples { font-size: 12px; fill: #a1b4c3; }
.chart-summary { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 11px; padding-top: 5px; }.chart-summary span { display: flex; align-items: center; gap: 5px; }.chart-summary i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }.sample-count { margin-left: auto; color: #8b9cac; }.chart-summary strong { font-size: 13px; }.frozen { color: #b57e27; }
.chart-tooltip { pointer-events: none; position: absolute; right: 12px; top: 8px; display: flex; gap: 12px; font-size: 11px; color: #426079; padding: 6px 10px; border: 1px solid #dce8f3; background: #fffffff2; border-radius: 6px; box-shadow: 0 2px 10px #31536f14; }
.sample-table { margin-top: 10px; width: 100%; border-collapse: collapse; font-size: 11px; }.sample-table td, .sample-table th { padding: 5px 8px; text-align: left; border-bottom: 1px solid #e4edf5; }
</style>
