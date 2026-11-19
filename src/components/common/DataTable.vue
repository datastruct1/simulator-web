<script setup lang="ts">
import { computed, ref } from 'vue'
import UiIcon from './UiIcon.vue'

export interface Column { key: string; label: string; width?: string; sortable?: boolean }
const props = withDefaults(defineProps<{ rows: any[]; columns: Column[]; pageSize?: number; searchable?: boolean; emptyText?: string }>(), { pageSize: 12, searchable: false, emptyText: '暂无数据' })
const emit = defineEmits<{ rowClick: [row: any] }>()
const query = ref(''), page = ref(1), sort = ref(''), ascending = ref(true)
const filtered = computed(() => {
  const values = props.rows.filter(row => !query.value || JSON.stringify(row).toLowerCase().includes(query.value.toLowerCase()))
  if (sort.value) values.sort((a, b) => String(a[sort.value] ?? '').localeCompare(String(b[sort.value] ?? ''), 'zh-CN', { numeric: true }) * (ascending.value ? 1 : -1))
  return values
})
const count = computed(() => Math.max(1, Math.ceil(filtered.value.length / props.pageSize)))
const visible = computed(() => filtered.value.slice((Math.min(page.value, count.value) - 1) * props.pageSize, Math.min(page.value, count.value) * props.pageSize))
function sortColumn(column: Column) { if (column.sortable === false) return; ascending.value = sort.value === column.key ? !ascending.value : true; sort.value = column.key }
</script>

<template>
  <div class="table-wrapper">
    <div v-if="searchable" class="toolbar"><label class="search-input"><UiIcon name="Search" :size="16" /><input v-model="query" class="field" placeholder="搜索当前表格…" @input="page = 1" /></label><span class="muted">{{ filtered.length }} 条记录</span></div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th v-for="column in columns" :key="column.key" :style="{ width: column.width }" @click="sortColumn(column)">{{ column.label }}<span v-if="sort === column.key"> {{ ascending ? '↑' : '↓' }}</span></th><th v-if="$slots.actions">操作</th></tr></thead><tbody>
      <tr v-for="(row, index) in visible" :key="row.id ?? index" @click="emit('rowClick', row)"><td v-for="column in columns" :key="column.key"><slot :name="column.key" :row="row" :value="row[column.key]">{{ row[column.key] ?? '—' }}</slot></td><td v-if="$slots.actions" @click.stop><slot name="actions" :row="row" /></td></tr>
      <tr v-if="!visible.length"><td :colspan="columns.length + ($slots.actions ? 1 : 0)" class="empty-state">{{ emptyText }}</td></tr>
    </tbody></table></div>
    <div class="pagination"><span>共 {{ filtered.length }} 条</span><div><button class="btn btn-sm" :disabled="page <= 1" @click="page--"><UiIcon name="ChevronLeft" :size="15" /></button><span>{{ Math.min(page, count) }} / {{ count }}</span><button class="btn btn-sm" :disabled="page >= count" @click="page++"><UiIcon name="ChevronRight" :size="15" /></button></div></div>
  </div>
</template>

<style scoped>.table-wrapper{min-width:0}.table-scroll{overflow:auto}.pagination{display:flex;align-items:center;justify-content:space-between;padding:12px 0;font-size:12px;color:var(--muted)}.pagination>div{display:flex;gap:14px;align-items:center}.data-table th{cursor:pointer;white-space:nowrap}.data-table tbody tr:hover{background:#e9f3ff}.search-input{max-width:300px}.empty-state{text-align:center!important;padding:36px!important}</style>
