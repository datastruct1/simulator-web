<script setup lang="ts">
import { computed } from 'vue'
import { sevenSegmentLayout, sevenSegmentPolygons } from './gauge'

const props = withDefaults(defineProps<{ value: string; width: number; height: number; x?: number; y?: number; color?: string }>(), { x: 0, y: 0, color: '#00ff00' })
const layout = computed(() => sevenSegmentLayout(props.value))
</script>

<template>
  <svg :x="x" :y="y" :width="width" :height="height" :viewBox="`0 0 ${layout.width} 20`" preserveAspectRatio="xMidYMid meet" :data-gauge-digits="value" aria-hidden="true">
    <g v-for="(digit, index) in layout.digits" :key="index" :transform="`translate(${digit.x} 0)`" :data-gauge-digit="digit.char">
      <circle v-if="digit.char === '.'" cx="1.2" cy="19" r="1" :fill="color" />
      <polygon v-for="(polygon, segment) in digit.char === '.' ? [] : sevenSegmentPolygons" :key="segment" :points="polygon" :fill="color" :opacity="digit.lit.includes(segment) ? 1 : 0.09" :data-segment-lit="digit.lit.includes(segment)" />
    </g>
  </svg>
</template>

<style scoped>
svg { overflow: hidden; pointer-events: none; }
</style>
