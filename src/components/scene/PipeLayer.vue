<script setup lang="ts">
import { computed } from 'vue'
import { MEDIA } from '../../data/piping'
import type { PipeVisualState } from '../../types/piping'
import type { PipeDrawing } from './pipingGeometry'
import { samplePipe } from './pipingGeometry'

const props = defineProps<{ drawing: PipeDrawing; states: Readonly<Record<string, PipeVisualState>> }>()
const media = new Map(MEDIA.map(item => [item.id, item]))
const jacketIds = new Set(['116', '118', '120', '122', '124', '126', '128', '130', '1756782337', '370', '376', '378', '380', '386', '388'])
const rows = computed(() => props.drawing.pipes.map(shape => {
  const state = props.states[shape.id]
  const medium = state?.filled ? media.get(state.medium) : undefined
  const phase = (state?.forward === false ? shape.end.x + shape.end.y : shape.start.x + shape.start.y) % 26
  const connected = !state?.hoseDisconnected
  const doubleWall = !shape.soft && /^(engine|lfss|overview)-/.test(shape.id) && shape.diameter >= 15 && jacketIds.has(shape.pipeId || '')
  const start = samplePipe(shape, 0), end = samplePipe(shape, 1)
  const disconnectedEnd = { ...end, x: end.x - (end.x - start.x) * 0.3, y: end.y + shape.diameter * 3 }
  const path = shape.soft && !connected ? `M ${start.x},${start.y} Q ${(start.x + disconnectedEnd.x) / 2},${Math.max(start.y, disconnectedEnd.y) + shape.diameter * 3} ${disconnectedEnd.x},${disconnectedEnd.y}` : shape.path
  return { shape, state, medium, phase, connected, start, end, disconnectedEnd, path, doubleWall }
}))
</script>

<template>
  <g class="pipe-layer" data-testid="pipe-layer" :data-rounded-junctions="drawing.roundedJunctions" :data-tee-junctions="drawing.teeJunctions" pointer-events="none" aria-hidden="true">
    <!-- Draw ALL shells before ALL interiors: neighbouring strokes have no
         black end-cap seams. All paths share world coordinates and round joins. -->
    <g class="pipe-shells">
      <path v-for="row in rows" :key="row.shape.id" :d="row.path" :stroke-width="row.shape.diameter + 1.4" :class="{ 'pipe-rubber-shell': row.shape.soft }" />
    </g>
    <g class="double-wall-jackets">
      <path v-for="row in rows.filter(item => item.doubleWall)" :key="row.shape.id" :d="row.path" :stroke="media.get('nitrogen')?.color" :stroke-width="row.shape.diameter - 1" :data-nitrogen-jacket="row.shape.id" />
    </g>
    <g class="pipe-empty-bores">
      <path v-for="row in rows" :key="row.shape.id" :d="row.path" :stroke-width="row.doubleWall ? Math.max(1, row.shape.diameter * .5) : Math.max(0.7, row.shape.diameter - 0.6)" :class="{ 'pipe-rubber-bore': row.shape.soft }" />
    </g>
    <g class="pipe-fills">
      <path v-for="row in rows.filter(item => item.medium && item.state?.filled)" :key="row.shape.id" :d="row.path" :stroke="row.medium!.color" :stroke-width="row.doubleWall ? Math.max(1, row.shape.diameter * .5) : Math.max(0.7, row.shape.diameter - 0.6)" :data-pipe-fill="row.shape.id" :data-pipe-id="row.state!.pipeId" :data-medium="row.state!.medium" :data-source="row.state!.sourceId" />
    </g>
    <g class="pipe-motions">
      <path v-for="row in rows.filter(item => item.medium && item.state?.flowing)" :key="row.shape.id" class="pipe-flow" :class="{ reverse: row.state?.forward === false }" :d="row.path" stroke="white" :stroke-width="Math.max(1.5, row.shape.diameter * 0.42)" :style="{ '--pipe-phase': `${-row.phase}px` }" />
      <path v-for="row in rows.filter(item => item.medium && item.state?.flowing)" :key="`color-${row.shape.id}`" class="pipe-flow" :class="{ reverse: row.state?.forward === false }" :d="row.path" :stroke="row.medium!.color" :stroke-width="Math.max(0.7, row.shape.diameter * 0.22)" :style="{ '--pipe-phase': `${-row.phase}px` }" :data-pipe-flow="row.shape.id" :data-pipe-id="row.state!.pipeId" :data-medium="row.state!.medium" :data-forward="row.state!.forward" />
    </g>
    <g v-for="row in rows.filter(item => item.shape.node.kind === 'hose' && !item.shape.soft)" :key="`bridge-${row.shape.id}`" class="pipe-bridge" :data-pipe-bridge="row.shape.id">
      <path :d="row.path" pathLength="100" stroke="#526776" :stroke-width="row.shape.diameter + 1.4" stroke-dasharray="0 8 84 8" stroke-linecap="butt" />
      <path :d="row.path" :stroke="row.medium?.color || '#e8eff3'" :stroke-width="Math.max(.7, row.shape.diameter - .6)" />
      <path v-if="row.state?.flowing && row.medium" class="pipe-flow" :class="{ reverse: row.state.forward === false }" :d="row.path" stroke="white" :stroke-width="Math.max(1.5, row.shape.diameter * .42)" :style="{ '--pipe-phase': `${-row.phase}px` }" />
      <path v-if="row.state?.flowing && row.medium" class="pipe-flow" :class="{ reverse: row.state.forward === false }" :d="row.path" :stroke="row.medium.color" :stroke-width="Math.max(.7, row.shape.diameter * .22)" :style="{ '--pipe-phase': `${-row.phase}px` }" />
    </g>
    <g v-for="row in rows.filter(item => item.shape.soft)" :key="`flanges-${row.shape.id}`" class="hose-flanges" :data-hose-connected="row.connected">
      <g v-if="!row.connected" :transform="`translate(${row.end.x} ${row.end.y}) rotate(${Math.atan2(row.end.tangentY || 0, row.end.tangentX || 1) * 180 / Math.PI})`">
        <rect :x="-row.shape.diameter * .22" :y="-row.shape.diameter * .72" :width="row.shape.diameter * .44" :height="row.shape.diameter * 1.44" fill="#d7dfe2" stroke="#43525a" stroke-width="1" />
      </g>
      <g v-for="(point, index) in [row.start, row.connected ? row.end : row.disconnectedEnd]" :key="index" :transform="`translate(${point.x} ${point.y}) rotate(${Math.atan2(point.tangentY || 0, point.tangentX || 1) * 180 / Math.PI})`">
        <rect :x="-row.shape.diameter * .22" :y="-row.shape.diameter * .72" :width="row.shape.diameter * .44" :height="row.shape.diameter * 1.44" fill="#aab5bb" stroke="#43525a" stroke-width="1" />
      </g>
      <circle :cx="row.disconnectedEnd.x" :cy="row.disconnectedEnd.y" :r="row.shape.diameter * .28" fill="#e87535" v-if="!row.connected" />
    </g>
  </g>
</template>

<style scoped>
.pipe-layer path{fill:none;stroke-linecap:round;stroke-linejoin:round}
.pipe-shells path{stroke:#526776}
.pipe-shells .pipe-rubber-shell{stroke:#343d44}
.pipe-empty-bores path{stroke:#e8eff3}
.pipe-empty-bores .pipe-rubber-bore{stroke:#30383c}
.pipe-flow{stroke-dasharray:8 18;stroke-dashoffset:var(--pipe-phase,0px);animation:pipe-motion 1.15s linear infinite;opacity:.82}
.pipe-flow.reverse{animation-direction:reverse}
.pipe-bridge path:first-child{stroke-linecap:butt}
@keyframes pipe-motion{from{stroke-dashoffset:var(--pipe-phase,0px)}to{stroke-dashoffset:calc(var(--pipe-phase,0px) + 26px)}}
@media(prefers-reduced-motion:reduce){.pipe-flow{animation:none;opacity:.65}}
</style>
