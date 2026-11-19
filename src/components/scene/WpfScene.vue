<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import type { SceneDevice, SceneNode, SceneRect } from '../../types/scene'
import SceneSymbol from './SceneSymbol.vue'
import PipeLayer from './PipeLayer.vue'
import { buildPipingGeometry } from './pipingGeometry'
import { resolvePipeDrawing } from './pipeVisual'
import { resolvePiping } from '../../state/pipingEngine'
import { MEDIA, pipingTopology } from '../../data/piping'
import { getScene, isInteractiveNode, nodeAttribute, nodeUnit, nodeValue, normalizedDeviceId } from './scenes'

const props = defineProps<{
  sceneId: string
  devices: Record<string, SceneDevice>
  running: boolean
  flowId?: string
  manualFlowId?: string
  highlightId?: string
}>()
const emit = defineEmits<{
  navigate: [id: string]
  operate: [node: SceneNode]
  action: [command: string, node?: SceneNode]
}>()
const uid = `wpf-${useId().replace(/[^a-z0-9_-]/gi, '')}`
const scene = computed(() => getScene(props.sceneId))
const freeManual = computed(() => props.flowId === '__manual__')
const pipeDrawing = computed(() => buildPipingGeometry(scene.value.nodes))
const manualDefinition = computed(() => pipingTopology.flowProfiles[props.manualFlowId || 'bunkering'])
const piping = computed(() => resolvePiping(props.devices, { flowId: props.flowId || '', running: props.running, manualFlowId: props.manualFlowId }))
const pipeStates = computed(() => resolvePipeDrawing(pipeDrawing.value, piping.value.pipes, props.devices, props.running, freeManual.value))
const filledPipes = computed(() => Object.values(pipeStates.value).filter(pipe => pipe.filled).length)
const flowingPipes = computed(() => Object.values(pipeStates.value).filter(pipe => pipe.flowing).length)
const mediaById = new Map(MEDIA.map(item => [item.id, item]))
const sceneLayers = computed(() => [
  { id: 'background', nodes: scene.value.nodes.filter(node => ['region', 'shape'].includes(node.kind)) },
  { id: 'equipment', nodes: scene.value.nodes.filter(node => !['region', 'shape'].includes(node.kind) && !(node.kind === 'valve' && /^rg00[123]$/i.test(node.deviceId || ''))) },
])
const viewport = ref<HTMLDivElement>()
const svg = ref<SVGSVGElement>()
const size = reactive({ width: 1, height: 1 })
const transform = reactive({ scale: 1, x: 0, y: 0 })
const fittedScale = computed(() => Math.max(0.02, Math.min((size.width - 12) / scene.value.width, (size.height - 12) / scene.value.height)))
const zoom = computed(() => transform.scale / fittedScale.value)
const dragging = ref(false)
const regionSelect = ref(false)
const showMinimap = ref(false)
const hover = ref<{ node: SceneNode; x: number; y: number }>()
const menu = ref<{ node: SceneNode; x: number; y: number }>()
const selection = ref<SceneRect>()
const lookup = computed(() => {
  const index: Record<string, SceneDevice> = {}
  for (const [id, device] of Object.entries(props.devices)) {
    index[normalizedDeviceId(id)] = device
    // Aliases may point to the same central-state object (the three hoses).
    if (!(normalizedDeviceId(device.id) in index)) index[normalizedDeviceId(device.id)] = device
  }
  return index
})
const stationTypes = ['加注车', '加注船', '岸边加注站']
const localStationType = ref('加注车')
const stationType = computed(() => {
  const station = lookup.value[normalizedDeviceId('FuelStation')]
  return /车|船|岸|站/.test(station?.mode ?? '') ? station!.mode : station ? stationTypes[Math.max(0, Math.min(2, Math.round(station.value)))] ?? '加注车' : localStationType.value
})
const hoveredDevice = computed(() => hover.value ? deviceFor(hover.value.node) : undefined)
const hoverPipe = computed(() => hover.value && ['pipe', 'hose'].includes(hover.value.node.kind) ? pipeStates.value[hover.value.node.id] : undefined)
const hoverTitle = computed(() => hover.value ? nodeAttribute(hover.value.node, 'popupTitle', hoveredDevice.value?.name || hover.value.node.label || hover.value.node.command || '设备') : '')
const hoverUnit = computed(() => hover.value ? nodeUnit(hover.value.node, hoveredDevice.value) : '')
const hoverValue = computed(() => hover.value ? nodeValue(hover.value.node, hoveredDevice.value) : 0)
const popupStyle = computed(() => ({ left: `${Math.max(8, Math.min(size.width - 272, (hover.value?.x ?? 0) + 14))}px`, top: `${Math.max(8, Math.min(size.height - 166, (hover.value?.y ?? 0) + 16))}px` }))
const menuStyle = computed(() => ({ left: `${Math.max(6, Math.min(size.width - 225, menu.value?.x ?? 0))}px`, top: `${Math.max(6, Math.min(size.height - 245, menu.value?.y ?? 0))}px` }))
const selectedViewport = computed(() => ({ x: -transform.x / transform.scale, y: -transform.y / transform.scale, width: size.width / transform.scale, height: size.height / transform.scale }))
const highlightedNodes = computed(() => scene.value.nodes.filter(isHighlighted))
let observer: ResizeObserver | undefined
let gesture: { pointer: number; startX: number; startY: number; x: number; y: number; select: boolean } | undefined
let didDrag = false
let spaceHeld = false

function deviceFor(node: SceneNode): SceneDevice | undefined {
  if (node.kind === 'button' && /^Pump(?:Start|StopCommamd)/.test(node.command || '')) return lookup.value[normalizedDeviceId('WaterControlPanel')]
  if (node.kind === 'hose' && nodeAttribute(node, 'material') === 'Soft' && scene.value.id === 'overview') {
    const id = ({ '29': 'Rg001', '34': 'Rg002', '52': 'Rg003' } as Record<string, string>)[nodeAttribute(node, 'pipeId')]
    if (id) return lookup.value[normalizedDeviceId(id)]
  }
  const device = node.deviceId ? lookup.value[normalizedDeviceId(node.deviceId)] : undefined
  const ids = node.attributes?.linkedDevices
  if (Array.isArray(ids)) {
    const linked = ids.map(id => lookup.value[normalizedDeviceId(String(id))]).filter((value): value is SceneDevice => !!value)
    const base = device ?? linked[0]
    if (base) return { ...base, working: linked.some(value => value.working), error: linked.some(value => value.error) }
  }
  return device
}
function isHighlighted(node: SceneNode): boolean {
  if (!props.highlightId) return false
  const id = normalizedDeviceId(props.highlightId)
  return [node.id, node.deviceId, node.label, deviceFor(node)?.id].some(candidate => candidate && normalizedDeviceId(candidate) === id)
}
function ariaLabel(node: SceneNode): string {
  return [node.deviceId, node.label || nodeAttribute(node, 'popupTitle') || node.command].filter(Boolean).join(' · ')
}
function nodeTransform(node: SceneNode): string {
  const x = /^overview-text-(46|47|48|49|50)$/.test(node.id) ? 150 : node.id === 'overview-shape-55' ? 801 : scene.value.id === 'recovery' && node.kind === 'pump' ? 875.5 - node.width / 2 : scene.value.id === 'overview' && node.kind === 'pump' && ['P201', 'P202'].includes(node.deviceId || '') ? 658.5 - node.width / 2 : node.x
  const y = ['overview-valve-27', 'overview-valve-25', 'overview-text-9'].includes(node.id) ? node.y - 7 : node.y
  return `translate(${x} ${y})${node.rotate ? ` rotate(${node.rotate} ${node.width / 2} ${node.height / 2})` : ''}`
}
function localPoint(event: MouseEvent | PointerEvent | WheelEvent): { x: number; y: number } {
  const rect = viewport.value?.getBoundingClientRect()
  return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
}
function constrain() {
  const width = scene.value.width * transform.scale, height = scene.value.height * transform.scale
  transform.x = width <= size.width ? (size.width - width) / 2 : Math.max(size.width - width - 28, Math.min(28, transform.x))
  transform.y = height <= size.height ? (size.height - height) / 2 : Math.max(size.height - height - 28, Math.min(28, transform.y))
}
function fit() {
  transform.scale = fittedScale.value
  transform.x = (size.width - scene.value.width * transform.scale) / 2
  transform.y = (size.height - scene.value.height * transform.scale) / 2
  hover.value = undefined
  menu.value = undefined
  selection.value = undefined
  regionSelect.value = false
}
function setZoom(scale: number, anchorX = size.width / 2, anchorY = size.height / 2) {
  const next = Math.max(fittedScale.value * 0.5, Math.min(fittedScale.value * 12, scale))
  const worldX = (anchorX - transform.x) / transform.scale
  const worldY = (anchorY - transform.y) / transform.scale
  transform.x = anchorX - worldX * next
  transform.y = anchorY - worldY * next
  transform.scale = next
  constrain()
  hover.value = undefined
}
function zoomIn() { setZoom(transform.scale * 1.25) }
function zoomOut() { setZoom(transform.scale / 1.25) }
function zoomToRect(rect: SceneRect, padding = 35) {
  const scale = Math.min((size.width - padding * 2) / Math.max(rect.width, 40), (size.height - padding * 2) / Math.max(rect.height, 40), fittedScale.value * 8)
  transform.scale = Math.max(fittedScale.value, scale)
  transform.x = size.width / 2 - (rect.x + rect.width / 2) * transform.scale
  transform.y = size.height / 2 - (rect.y + rect.height / 2) * transform.scale
  constrain()
  hover.value = undefined
  menu.value = undefined
}
function focusDevice(id: string) {
  const normalized = normalizedDeviceId(id)
  const node = scene.value.nodes.find(node => [node.deviceId, node.id, deviceFor(node)?.id].some(value => value && normalizedDeviceId(value) === normalized))
  if (node) zoomToRect({ x: node.x - 70, y: node.y - 50, width: Math.max(160, node.width + 140), height: Math.max(140, node.height + 100) })
}
function zoomToRegion(id: string) {
  const region = scene.value.regions.find(region => region.id === id)
  if (region) zoomToRect(region, 18)
}
function wheel(event: WheelEvent) {
  const point = localPoint(event)
  setZoom(transform.scale * Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * 0.002), point.x, point.y)
  menu.value = undefined
}
function beginPointer(event: PointerEvent) {
  if (event.button !== 0 && event.button !== 1) return
  if ((event.target as Element).closest('[data-scene-action], input, select, button')) return
  menu.value = undefined
  const point = localPoint(event)
  gesture = { pointer: event.pointerId, startX: point.x, startY: point.y, x: transform.x, y: transform.y, select: regionSelect.value && !spaceHeld }
  didDrag = false
  if (gesture.select) selection.value = { x: point.x, y: point.y, width: 0, height: 0 }
  event.preventDefault()
}
function movePointer(event: PointerEvent) {
  if (!gesture || gesture.pointer !== event.pointerId) return
  const point = localPoint(event)
  const dx = point.x - gesture.startX, dy = point.y - gesture.startY
  if (Math.hypot(dx, dy) > 4) {
    didDrag = true
    dragging.value = true
    hover.value = undefined
    if (!svg.value?.hasPointerCapture(event.pointerId)) svg.value?.setPointerCapture(event.pointerId)
  }
  if (gesture.select) selection.value = { x: Math.min(point.x, gesture.startX), y: Math.min(point.y, gesture.startY), width: Math.abs(dx), height: Math.abs(dy) }
  else if (didDrag) {
    transform.x = gesture.x + dx
    transform.y = gesture.y + dy
    constrain()
  }
}
function endPointer(event: PointerEvent) {
  if (!gesture || gesture.pointer !== event.pointerId) return
  if (gesture.select && selection.value) {
    const rect = selection.value
    if (rect.width > 8 && rect.height > 8) zoomToRect({ x: (rect.x - transform.x) / transform.scale, y: (rect.y - transform.y) / transform.scale, width: rect.width / transform.scale, height: rect.height / transform.scale }, 18)
    else setZoom(transform.scale * 2, rect.x, rect.y)
    didDrag = true
    selection.value = undefined
    regionSelect.value = false
  }
  if (svg.value?.hasPointerCapture(event.pointerId)) svg.value.releasePointerCapture(event.pointerId)
  gesture = undefined
  dragging.value = false
  window.setTimeout(() => { didDrag = false }, 0)
}
function activate(node: SceneNode) {
  if (didDrag) { didDrag = false; return }
  hover.value = undefined
  menu.value = undefined
  if (!freeManual.value && node.kind === 'button' && deviceFor(node)?.enabled === false) return
  const destination = nodeAttribute(node, 'navigateId')
  if (destination) emit('navigate', destination)
  else if (node.kind === 'hose' && nodeAttribute(node, 'material') === 'Soft' && deviceFor(node)) {
    const connected = deviceFor(node)?.connected !== false && !!deviceFor(node)?.working && (deviceFor(node)?.value || 0) > 0
    const index = Number(deviceFor(node)?.id.slice(-1)) - 1
    emit('action', connected ? 'SoftPipeDisConnectCommand' : 'SoftPipeConnectCommand', { ...node, commandParameter: index })
  }
  else if (node.command && node.kind !== 'control-button' && !['sensor', 'valve', 'pump', 'engine', 'tank', 'water-tank', 'balance-tank'].includes(node.kind)) emit('action', node.command, node)
  else if (isInteractiveNode(node)) emit('operate', node)
}
function symbolAction(command: string, node: SceneNode, value?: string | number | boolean) {
  if (command === 'station-type' && typeof value === 'string') localStationType.value = value
  const attributes = { ...node.attributes }
  if (value !== undefined) {
    attributes.value = value
    attributes.commandParameter = typeof value === 'boolean' ? String(value) : value
  }
  const commandParameter = value === undefined ? node.commandParameter : typeof value === 'boolean' ? String(value) : value
  emit('action', command, { ...node, commandParameter, attributes })
  menu.value = undefined
}
function enterNode(event: MouseEvent, node: SceneNode) {
  if (dragging.value || menu.value || !isInteractiveNode(node)) return
  hover.value = { node, ...localPoint(event) }
}
function focusNode(node: SceneNode) {
  hover.value = { node, x: transform.x + (node.x + node.width) * transform.scale, y: transform.y + node.y * transform.scale }
}
function rightClick(event: MouseEvent, node: SceneNode) {
  if (!isInteractiveNode(node)) return
  menu.value = { node, ...localPoint(event) }
  hover.value = undefined
}
function contextAction(command: string) {
  const node = menu.value?.node
  if (!node) return
  if (command === 'operate') { emit('operate', node); menu.value = undefined }
  else if (command === 'focus') focusDevice(node.deviceId || node.id)
  else symbolAction(command, node)
}
function doubleClick(event: MouseEvent) {
  const point = localPoint(event)
  const x = (point.x - transform.x) / transform.scale, y = (point.y - transform.y) / transform.scale
  const region = scene.value.regions.find(region => x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height)
  if (region && zoom.value < 1.05) zoomToRegion(region.id)
  else setZoom(transform.scale * 1.5, point.x, point.y)
}
function keydown(event: KeyboardEvent) {
  if (/INPUT|SELECT|TEXTAREA/.test((event.target as Element).tagName)) return
  if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomIn() }
  else if (event.key === '-') { event.preventDefault(); zoomOut() }
  else if (event.key === '0') { event.preventDefault(); fit() }
  else if (event.key === '1') { event.preventDefault(); setZoom(1) }
  else if (event.key === 'Escape') { menu.value = undefined; hover.value = undefined; selection.value = undefined; regionSelect.value = false }
  else if (event.code === 'Space' && event.target === viewport.value) { event.preventDefault(); spaceHeld = true }
}
function keyup(event: KeyboardEvent) { if (event.code === 'Space') spaceHeld = false }
function minimapClick(event: MouseEvent) {
  const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width * scene.value.width
  const y = (event.clientY - rect.top) / rect.height * scene.value.height
  transform.x = size.width / 2 - x * transform.scale
  transform.y = size.height / 2 - y * transform.scale
  constrain()
}
function resize() {
  if (!viewport.value) return
  const rect = viewport.value.getBoundingClientRect()
  const wasFitted = Math.abs(zoom.value - 1) < 0.05
  const centerX = (size.width / 2 - transform.x) / transform.scale
  const centerY = (size.height / 2 - transform.y) / transform.scale
  size.width = Math.max(1, rect.width)
  size.height = Math.max(1, rect.height)
  if (wasFitted) fit()
  else { transform.x = size.width / 2 - centerX * transform.scale; transform.y = size.height / 2 - centerY * transform.scale; constrain() }
}
watch(() => props.sceneId, async () => { await nextTick(); resize(); fit() })
watch(() => props.highlightId, async id => {
  if (!id) return
  await nextTick()
  const node = highlightedNodes.value[0]
  if (!node) return
  const x = transform.x + (node.x + node.width / 2) * transform.scale, y = transform.y + (node.y + node.height / 2) * transform.scale
  if (x < 0 || y < 0 || x > size.width || y > size.height) focusDevice(id)
})
onMounted(() => {
  resize(); fit()
  observer = new ResizeObserver(resize)
  if (viewport.value) observer.observe(viewport.value)
  window.addEventListener('pointermove', movePointer)
  window.addEventListener('pointerup', endPointer)
  window.addEventListener('pointercancel', endPointer)
  window.addEventListener('keyup', keyup)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('pointermove', movePointer)
  window.removeEventListener('pointerup', endPointer)
  window.removeEventListener('pointercancel', endPointer)
  window.removeEventListener('keyup', keyup)
})
defineExpose({ fit, zoomIn, zoomOut, focusDevice, zoomToRegion })
</script>

<template>
  <section class="wpf-scene" data-testid="wpf-scene" :data-scene-id="scene.id" :data-manual-flow="freeManual ? manualFlowId : undefined" :aria-label="`${scene.title} 工艺原图`">
    <div class="scene-toolbar">
      <div class="scene-caption"><span class="status-led" :class="{ active: running }"></span><strong>{{ scene.title }}</strong><span class="scene-stat">{{ scene.stats.devices }} 台设备 · {{ scene.stats.pipes }} 段管线</span></div>
      <div class="scene-tools" aria-label="工艺图视图控制">
        <button type="button" title="缩小 (-)" aria-label="缩小工艺图" @click="zoomOut">−</button>
        <span class="zoom-readout" aria-live="polite">{{ Math.round(zoom * 100) }}%</span>
        <button type="button" title="放大 (+)" aria-label="放大工艺图" @click="zoomIn">+</button>
        <button type="button" title="全图适配 (0)" aria-label="全图适配" @click="fit"><svg viewBox="0 0 20 20"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4" /></svg><span>适配</span></button>
        <button type="button" title="框选局部区域放大" aria-label="局部放大" :aria-pressed="regionSelect" :class="{ selected: regionSelect }" @click="regionSelect = !regionSelect"><svg viewBox="0 0 20 20"><path d="M3 7V3h4m6 0h4v4M3 13v4h4m10-4v4h-4M7 10h6m-3-3v6" /></svg></button>
        <button type="button" title="原始尺寸 (1)" aria-label="原始尺寸" @click="setZoom(1)">1:1</button>
        <button type="button" title="缩略定位图" aria-label="切换缩略定位图" :aria-pressed="showMinimap" :class="{ selected: showMinimap }" @click="showMinimap = !showMinimap"><svg viewBox="0 0 20 20"><path d="m3 4 5-1 5 2 4-1v12l-4 1-5-2-5 1Z M8 3v12m5-10v12" /></svg></button>
      </div>
    </div>
    <div class="pipe-legend" aria-label="管道介质图例" data-testid="pipe-legend">
      <span v-for="medium in MEDIA.filter(item => item.id !== 'empty')" :key="medium.id" class="medium-key" :data-medium="medium.id"><i :style="{ backgroundColor: medium.color }" />{{ medium.label }}</span>
      <span class="pipe-fill-summary" data-testid="pipe-fill-summary">已填充 {{ filledPipes }} 段 · 流动 {{ flowingPipes }} 段</span>
      <span class="pipe-context" data-testid="pipe-context">{{ freeManual ? `${manualDefinition?.name || '未选择工艺'} · 沿用演示方向 / 介质 · ${running ? '局部流动示意' : '暂停，保留介质'}` : !flowId ? '未启动流程 · 空管' : running ? '按当前流程与阀门连通状态显示' : '流动已停止 · 静态填充保留' }}</span>
      <span v-for="warning in piping.summary.warnings || []" :key="warning" class="pipe-context" role="status">{{ warning }}</span>
    </div>
    <div ref="viewport" class="scene-viewport" :class="{ dragging, 'select-region': regionSelect }" tabindex="0" aria-label="工艺图画布，滚轮缩放，拖动平移，按0全图适配" @keydown="keydown" @mouseleave="hover = undefined">
      <svg ref="svg" class="process-svg" :viewBox="`0 0 ${size.width} ${size.height}`" preserveAspectRatio="none" :data-running="running" @wheel.prevent="wheel" @pointerdown="beginPointer" @dblclick.self.prevent="doubleClick" @click.self="menu = undefined" @contextmenu.self.prevent="menu = undefined">
        <defs>
          <linearGradient :id="`${uid}-pipe-h`" x1="0" y1="0" x2="0" y2="1"><stop offset=".1" stop-color="#cbcbcb" /><stop offset=".5" stop-color="white" /><stop offset=".8" stop-color="#cbcbcb" /></linearGradient>
          <linearGradient :id="`${uid}-pipe-v`" x1="0" y1="0" x2="1" y2="0"><stop offset=".1" stop-color="#cbcbcb" /><stop offset=".5" stop-color="white" /><stop offset=".8" stop-color="#cbcbcb" /></linearGradient>
          <linearGradient :id="`${uid}-tank`"><stop offset="0" stop-color="#efefef" /><stop offset=".15" stop-color="#ccc" /><stop offset=".5" stop-color="#888" /><stop offset=".85" stop-color="#ccc" /><stop offset="1" stop-color="#efefef" /></linearGradient>
          <linearGradient :id="`${uid}-rubber`" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2e2e2e" /><stop offset=".2" stop-color="#4a4a4a" /><stop offset=".5" stop-color="#1a1a1a" /><stop offset="1" stop-color="#0f0f0f" /></linearGradient>
          <radialGradient :id="`${uid}-metal`"><stop stop-color="#e8e8e8" /><stop offset=".3" stop-color="#c0c0c0" /><stop offset=".7" stop-color="#a0a0a0" /><stop offset="1" stop-color="#808080" /></radialGradient>
          <radialGradient :id="`${uid}-highlight`" cx=".3" cy=".3"><stop stop-color="white" /><stop offset=".7" stop-color="white" stop-opacity="0" /></radialGradient>
          <radialGradient :id="`${uid}-dial`"><stop stop-color="white" /><stop offset=".8" stop-color="#ebedef" /><stop offset="1" stop-color="#9ba3a7" /></radialGradient>
        </defs>
        <rect :width="size.width" :height="size.height" fill="white" @dblclick.prevent="doubleClick" @click="menu = undefined" @contextmenu.prevent="menu = undefined" />
        <g :transform="`translate(${transform.x} ${transform.y}) scale(${transform.scale})`" class="diagram-content">
          <rect :width="scene.width" :height="scene.height" :fill="scene.background" @dblclick.prevent="doubleClick" @click="menu = undefined" @contextmenu.prevent="menu = undefined" />
          <template v-for="layer in sceneLayers" :key="layer.id">
            <PipeLayer v-if="layer.id === 'equipment'" :drawing="pipeDrawing" :states="pipeStates" />
          <g v-for="node in layer.nodes" :key="node.id" :transform="nodeTransform(node)" :class="['scene-node', { interactive: isInteractiveNode(node), highlighted: isHighlighted(node), faulted: deviceFor(node)?.error }]" :data-node-id="node.id" :data-device-id="node.deviceId" :data-runtime-device-id="deviceFor(node)?.id" :data-node-kind="node.kind" :data-pipe-id="pipeStates[node.id]?.pipeId" :data-blocked-by="pipeStates[node.id]?.blockedBy" :data-medium="pipeStates[node.id]?.medium" :data-filled="pipeStates[node.id]?.filled" :data-flowing="pipeStates[node.id]?.flowing" :role="isInteractiveNode(node) ? 'button' : undefined" :tabindex="isInteractiveNode(node) ? 0 : undefined" :aria-label="isInteractiveNode(node) ? ariaLabel(node) : undefined" :aria-disabled="!freeManual && deviceFor(node)?.enabled === false ? 'true' : undefined" @click.stop="activate(node)" @keydown.enter.stop.prevent="activate(node)" @keydown.space.stop.prevent="activate(node)" @mouseenter="enterNode($event, node)" @mousemove="enterNode($event, node)" @mouseleave="hover = undefined" @focus="focusNode(node)" @blur="hover = undefined" @contextmenu.stop.prevent="rightClick($event, node)">
            <rect v-if="isInteractiveNode(node)" class="node-hit-area" :x="node.width < 12 ? (node.width - 12) / 2 : 0" :y="node.height < 12 ? (node.height - 12) / 2 : 0" :width="Math.max(12, node.width)" :height="Math.max(12, node.height)" fill="transparent" />
            <SceneSymbol v-if="!['pipe', 'hose'].includes(node.kind)" :node="node" :device="deviceFor(node)" :running="running" :uid="uid" :station-type="stationType" :free-manual="freeManual" @action="(command, value) => symbolAction(command, node, value)" />
            <rect v-if="isHighlighted(node)" class="node-highlight" x="-4" y="-4" :width="Math.max(12, node.width) + 8" :height="Math.max(12, node.height) + 8" rx="5" fill="none" stroke="#004ea0" stroke-width="2.5" vector-effect="non-scaling-stroke" />
          </g>
          </template>
        </g>
        <rect v-if="selection" :x="selection.x" :y="selection.y" :width="selection.width" :height="selection.height" fill="#004ea026" stroke="#004ea0" stroke-dasharray="5 3" pointer-events="none" />
      </svg>

      <div v-if="hover && !menu && !dragging" class="node-tooltip" role="tooltip" :style="popupStyle">
        <div class="tooltip-title"><strong>{{ hover.node.deviceId || hover.node.label }}</strong><span :class="{ error: hoveredDevice?.error }">{{ hoveredDevice?.error ? '故障' : hoveredDevice?.enabled === false ? '禁用' : hoveredDevice?.working ? '运行' : '待机' }}</span></div>
        <p>{{ hoverTitle }}</p>
        <div v-if="hoverPipe" class="tooltip-value"><span>{{ hoverPipe.filled ? mediaById.get(hoverPipe.medium)?.label : '空管 / 未填充' }}</span><small>{{ hoverPipe.flowing ? '流动中' : hoverPipe.filled ? '静态填充' : '无介质可达' }}</small></div>
        <div v-else-if="hoveredDevice" class="tooltip-value">{{ hoverValue.toFixed(2) }} <small>{{ hoverUnit }}</small><span v-if="hoveredDevice.mode">{{ hoveredDevice.mode }}</span></div>
        <small v-if="hoverPipe?.blockedBy">截止 / 阻断设备：{{ hoverPipe.blockedBy }}</small>
        <small>单击操作 · 右键更多{{ nodeAttribute(hover.node, 'valveType') ? ` · ${nodeAttribute(hover.node, 'valveType')}` : '' }}</small>
      </div>

      <div v-if="menu" class="node-context-menu" role="menu" :style="menuStyle" @pointerdown.stop @contextmenu.prevent>
        <strong>{{ menu.node.deviceId || menu.node.label }}</strong>
        <button role="menuitem" type="button" @click="contextAction('operate')">设备操作 / 详细设置</button>
        <template v-if="['valve', 'control-button'].includes(menu.node.kind)"><button role="menuitem" type="button" @click="contextAction('open')">开启阀门</button><button role="menuitem" type="button" @click="contextAction('close')">关闭阀门</button></template>
        <template v-else-if="['pump', 'fan', 'engine'].includes(menu.node.kind)"><button role="menuitem" type="button" @click="contextAction('start')">启动设备</button><button role="menuitem" type="button" @click="contextAction('stop')">停止设备</button></template>
        <button role="menuitem" type="button" @click="contextAction('focus')">定位并放大此设备</button>
        <button role="menuitem" type="button" @click="fit">全图适配</button>
      </div>

      <div v-if="regionSelect" class="selection-hint">拖动框选要放大的工艺区域 · Esc 取消</div>
      <div v-else class="viewer-hint">滚轮缩放 · 拖动平移 · 右键设备操作</div>
      <svg v-if="showMinimap" class="scene-minimap" :viewBox="`0 0 ${scene.width} ${scene.height}`" preserveAspectRatio="none" role="button" tabindex="0" aria-label="缩略图定位" @click.stop="minimapClick" @pointerdown.stop @keydown.enter="fit">
        <rect :width="scene.width" :height="scene.height" :fill="scene.background" />
        <rect v-for="region in scene.regions" :key="region.id" :x="region.x" :y="region.y" :width="region.width" :height="region.height" fill="#ffffff66" stroke="#cc3030" stroke-width="8" />
        <rect :x="selectedViewport.x" :y="selectedViewport.y" :width="selectedViewport.width" :height="selectedViewport.height" fill="#004ea025" stroke="#004ea0" stroke-width="15" />
      </svg>
    </div>
  </section>
</template>

<style scoped>
.wpf-scene { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 280px; overflow: hidden; background: var(--surface, white); border: 1px solid var(--border, #c8d8e8); color: var(--text, #182d45); }
.pipe-legend{display:flex;align-items:center;gap:7px 12px;flex-wrap:wrap;padding:5px 10px;border-bottom:1px solid #d2e0eb;background:#eef5fa;flex-shrink:0;font-size:10px;color:#59748a;min-width:0}
 .medium-key{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.medium-key i{width:10px;height:10px;border-radius:3px;box-shadow:inset 0 0 0 1px #142b4226;flex-shrink:0}.pipe-fill-summary{margin-left:auto;color:#355d7c;font-variant-numeric:tabular-nums;white-space:nowrap}.pipe-context{font-size:9px;color:#7893a7}.pipe-legend::-webkit-scrollbar{height:3px}
@media(max-width:900px){.pipe-legend{flex-wrap:nowrap;overflow-x:auto}.pipe-fill-summary{margin-left:0}.pipe-context{display:none}}
.scene-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 38px; padding: 3px 10px; border-bottom: 1px solid var(--border, #c8d8e8); background: #f7fbff; user-select: none; flex-shrink: 0; }
.scene-caption, .scene-tools { display: flex; align-items: center; gap: 6px; }
.scene-caption { min-width: 0; font-size: 13px; white-space: nowrap; }
.scene-caption strong { font-weight: 600; }
.scene-stat { font-size: 11px; color: #6b8297; margin-left: 5px; }
.status-led { width: 7px; height: 7px; border-radius: 50%; background: #a5b4bf; box-shadow: inset 0 0 2px #526571; flex-shrink: 0; }
.status-led.active { background: #24ae65; box-shadow: 0 0 5px #24ae6550; }
.scene-tools { flex-shrink: 0; }
.scene-tools button { height: 27px; min-width: 27px; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center; gap: 3px; background: white; color: #365b7c; border: 1px solid #c8d8e8; border-radius: 3px; cursor: pointer; font-size: 14px; }
.scene-tools button:hover, .scene-tools button.selected { background: #e3effb; color: var(--primary, #004ea0); border-color: #8fb6dd; }
.scene-tools svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; }
.scene-tools button span { font-size: 11px; }
.zoom-readout { min-width: 36px; text-align: center; font-size: 11px; font-variant-numeric: tabular-nums; }
.scene-viewport { flex: 1; min-height: 0; position: relative; overflow: hidden; background: white; outline: none; touch-action: none; cursor: grab; }
.scene-viewport:focus-visible { box-shadow: inset 0 0 0 2px #004ea0; }
.scene-viewport.dragging { cursor: grabbing; }
.scene-viewport.select-region, .scene-viewport.select-region :deep(.interactive) { cursor: crosshair; }
.process-svg { display: block; width: 100%; height: 100%; user-select: none; }
.scene-node.interactive { cursor: pointer; }
.scene-node:focus { outline: none; }
.scene-node:focus-visible > .node-hit-area { stroke: #004ea0; stroke-width: 2px; vector-effect: non-scaling-stroke; }
.scene-node.faulted :deep(.symbol-valve), .scene-node.faulted :deep(.symbol-pump), .scene-node.faulted :deep(.symbol-engine) { filter: drop-shadow(0 0 2px #ed293950); }
.node-highlight { pointer-events: none; }
.node-tooltip { position: absolute; width: 248px; max-width: calc(100% - 20px); z-index: 4; padding: 10px 12px; border: 1px solid #77a4d3; border-radius: 5px; background: #f6fbfffa; color: #17354f; box-shadow: 0 3px 16px #20384d30; pointer-events: none; }
.tooltip-title { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
.tooltip-title strong { color: #004ea0; }
.tooltip-title span { color: #5c7c6b; font-size: 11px; }
.tooltip-title .error { color: #e53935; }
.node-tooltip p { margin: 6px 0; font-size: 12px; line-height: 1.4; }
.tooltip-value { display: flex; align-items: baseline; gap: 5px; font-size: 19px; font-weight: 600; font-variant-numeric: tabular-nums; margin-bottom: 6px; }
.tooltip-value small { font-size: 11px; font-weight: 400; }
.tooltip-value span { margin-left: auto; font-size: 10px; font-weight: 400; }
.node-tooltip > small { font-size: 10px; color: #74899c; }
.node-context-menu { position: absolute; z-index: 6; width: 210px; border: 1px solid #a8c2dd; border-radius: 5px; background: white; box-shadow: 0 5px 20px #16334e33; overflow: hidden; }
.node-context-menu strong { display: block; padding: 10px 12px; background: #f0f6fd; border-bottom: 1px solid #d8e5f2; color: #004ea0; font-size: 12px; }
.node-context-menu button { display: block; text-align: left; border: 0; width: 100%; padding: 8px 12px; color: #294963; background: white; font: inherit; font-size: 12px; cursor: pointer; }
.node-context-menu button:hover, .node-context-menu button:focus { background: #e9f3fd; outline: none; }
.viewer-hint { position: absolute; bottom: 4px; right: 7px; font-size: 10px; padding: 2px 5px; color: #526b7f; background: #ffffffbd; pointer-events: none; }
.selection-hint { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: #004ea0e8; color: white; border-radius: 4px; padding: 7px 14px; font-size: 12px; pointer-events: none; }
.scene-minimap { position: absolute; width: 180px; height: 94px; right: 9px; bottom: 24px; border: 1px solid #7194b8; border-radius: 3px; background: white; cursor: crosshair; box-shadow: 0 2px 9px #15334e26; }
@media (max-width: 760px) { .scene-stat { display: none; } .scene-toolbar { padding: 3px 5px; } .scene-tools { gap: 3px; } .scene-caption { font-size: 11px; } .scene-tools button span { display: none; } }
@media (max-width: 460px) { .scene-tools button:nth-last-child(2) { display: none; } .scene-caption strong { max-width: 100px; overflow: hidden; text-overflow: ellipsis; } }
</style>
