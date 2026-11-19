<script setup lang="ts">
import { newId } from './lib/domain'
withDefaults(defineProps<{ title?: string; progress?: number; compact?: boolean }>(), { title: '甲醇加注模拟平台', progress: 0, compact: false })
const gradientId = newId('preview')
</script>
<template>
  <svg viewBox="0 0 560 300" role="img" :aria-label="`${title} · 本地示意图，不是远程屏幕`">
    <defs><linearGradient :id="gradientId" x2="1" y2="1"><stop stop-color="#e7f3ff" /><stop offset="1" stop-color="#c6e0f6" /></linearGradient></defs>
    <rect width="560" height="300" rx="7" :fill="`url(#${gradientId})`" /><rect width="560" height="27" rx="5" fill="#0b4d92" />
    <text x="15" y="18" fill="white" font-size="11" font-family="Microsoft YaHei">{{ title }}</text><text x="457" y="18" fill="#b9dcf4" font-size="9">本地示意 / 非图传</text>
    <g stroke="#7fabc7" stroke-width="1"><path d="M0 75H560M0 125H560M0 175H560M0 225H560" opacity=".18" /></g>
    <g fill="none" stroke-linecap="round"><path d="M65 150H180V96H376V150H477V233H262V195H65Z" stroke="#648fb1" stroke-width="9" /><path d="M65 150H180V96H376V150H477" stroke="#a9dbff" stroke-width="5" /><path d="M376 96V48M263 96V235" stroke="#7daace" stroke-width="6" /><path d="M65 195H477" stroke="#68aecb" stroke-width="5" /></g>
    <g fill="#e7f1ff" stroke="#6b9bbb" stroke-width="2"><rect x="39" y="115" width="60" height="84" rx="17" /><rect x="436" y="109" width="78" height="87" rx="19" /><rect x="325" y="53" width="103" height="57" rx="5" /></g>
    <path d="M40 171H98V181Q98 198 80 198H56Q40 198 40 181Z" fill="#6bbee6" /><path d="M438 157H512V180Q512 194 497 194H453Q438 194 438 180Z" fill="#83c7e8" />
    <g fill="#2d7bbb" font-size="10" text-anchor="middle" font-family="Microsoft YaHei"><text x="69" y="139">氮气罐</text><text x="475" y="137">燃料储舱</text><text x="377" y="84">燃料准备间</text><text x="75" y="219">氮气供应</text><text x="474" y="218">甲醇系统</text></g>
    <g v-for="(position, index) in [[140,150],[215,96],[292,96],[413,150],[324,233],[170,195]]" :key="index" :transform="`translate(${position[0]} ${position[1]})`"><path d="M-9-8L9 8V-8L-9 8Z" :fill="progress > index * 16 ? '#61bb98' : '#d8eaf7'" stroke="#447eab" stroke-width="1.6" /><circle r="2.5" fill="#3474a7" /></g>
    <g transform="translate(262 195)"><circle r="14" fill="#e0f0ff" stroke="#4485b5" stroke-width="2" /><path d="M-7-7L9 0L-7 7Z" :fill="progress > 40 ? '#3ea780' : '#6c9ec3'" /></g>
    <rect x="22" y="261" width="516" height="19" rx="4" fill="#ffffff99" /><rect x="25" y="265" :width="Math.max(0, Math.min(100, progress)) * 4.28" height="10" rx="3" fill="#3f9ade" />
    <text x="527" y="275" fill="#3e77a3" font-size="10" text-anchor="end">{{ Math.round(progress) }}%</text>
  </svg>
</template>
