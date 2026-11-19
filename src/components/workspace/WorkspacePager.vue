<script setup lang="ts">
import { computed } from 'vue'
import UiIcon from '../common/UiIcon.vue'
const props = withDefaults(defineProps<{ total: number; page: number; pageSize: number; sizes?: number[] }>(), { sizes: () => [5, 10, 20, 50] })
const emit = defineEmits<{ 'update:page': [page: number]; 'update:pageSize': [size: number] }>()
const count = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const numbers = computed(() => Array.from({ length: Math.min(5, count.value) }, (_, index) => Math.max(1, Math.min(props.page - 2, count.value - 4)) + index))
function changeSize(event: Event) { emit('update:pageSize', Number((event.target as HTMLSelectElement).value)); emit('update:page', 1) }
</script>
<template>
  <div class="ws-pager">
    <div class="ws-inline"><span>共 {{ total }} 条</span><select class="field" aria-label="每页条数" :value="pageSize" @change="changeSize"><option v-for="size in sizes" :key="size" :value="size">{{ size }} 条 / 页</option></select></div>
    <nav class="ws-pager-pages" aria-label="分页">
      <button class="btn btn-sm" title="第一页" :disabled="page <= 1" @click="emit('update:page', 1)"><UiIcon name="ChevronsLeft" :size="14" /></button>
      <button class="btn btn-sm" title="上一页" :disabled="page <= 1" @click="emit('update:page', page - 1)"><UiIcon name="ChevronLeft" :size="14" /></button>
      <button v-for="number in numbers" :key="number" class="btn btn-sm" :class="{ active: page === number }" :aria-current="page === number ? 'page' : undefined" @click="emit('update:page', number)">{{ number }}</button>
      <button class="btn btn-sm" title="下一页" :disabled="page >= count" @click="emit('update:page', page + 1)"><UiIcon name="ChevronRight" :size="14" /></button>
      <button class="btn btn-sm" title="最后一页" :disabled="page >= count" @click="emit('update:page', count)"><UiIcon name="ChevronsRight" :size="14" /></button>
    </nav>
  </div>
</template>
