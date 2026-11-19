<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export interface ToolColumn { key: string; label: string; numeric?: boolean; width?: string; sortable?: boolean }
const props = withDefaults(defineProps<{
  rows: any[]
  columns: ToolColumn[]
  rowKey?: string
  pageSize?: number
  selectable?: boolean
  emptyText?: string
  defaultSort?: string
}>(), { rowKey: 'id', pageSize: 12, selectable: false, emptyText: '没有符合条件的记录。', defaultSort: '' })
const emit = defineEmits<{ select: [ids: string[]]; rowClick: [row: any] }>()
const page = ref(1)
const size = ref(props.pageSize)
const sortKey = ref(props.defaultSort)
const descending = ref(false)
const selection = ref(new Set<string>())
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })
const rowId = (row: any) => String(row[props.rowKey])
const sortedRows = computed(() => {
  if (!sortKey.value) return props.rows
  const column = props.columns.find(item => item.key === sortKey.value)
  return props.rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const left = a.row[sortKey.value], right = b.row[sortKey.value]
    let delta = column?.numeric ? Number(left ?? 0) - Number(right ?? 0) : collator.compare(String(left ?? ''), String(right ?? ''))
    if (!Number.isFinite(delta)) delta = 0
    return (descending.value ? -delta : delta) || a.index - b.index
  }).map(item => item.row)
})
const pageCount = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / size.value)))
const pageRows = computed(() => sortedRows.value.slice((page.value - 1) * size.value, page.value * size.value))
const pageSelected = computed(() => pageRows.value.length > 0 && pageRows.value.every(row => selection.value.has(rowId(row))))
const partialSelected = computed(() => !pageSelected.value && pageRows.value.some(row => selection.value.has(rowId(row))))
watch(() => props.rows, () => {
  page.value = Math.min(page.value, pageCount.value)
  const valid = new Set(props.rows.map(rowId))
  selection.value = new Set([...selection.value].filter(id => valid.has(id)))
  emit('select', [...selection.value])
})
watch(size, () => { page.value = 1 })
function sort(column: ToolColumn) {
  if (column.sortable === false) return
  if (sortKey.value === column.key) descending.value = !descending.value
  else { sortKey.value = column.key; descending.value = false }
  page.value = 1
}
function selectRow(row: any, checked: boolean) {
  const next = new Set(selection.value)
  if (checked) next.add(rowId(row)); else next.delete(rowId(row))
  selection.value = next
  emit('select', [...next])
}
function selectPage(checked: boolean) {
  const next = new Set(selection.value)
  for (const row of pageRows.value) { if (checked) next.add(rowId(row)); else next.delete(rowId(row)) }
  selection.value = next
  emit('select', [...next])
}
function goPage(value: unknown) { page.value = Math.max(1, Math.min(pageCount.value, Math.floor(Number(value) || 1))) }
function clearSelection() { selection.value = new Set(); emit('select', []) }
function resetPage() { page.value = 1 }
defineExpose({ clearSelection, resetPage })
</script>

<template>
  <div class="tool-table">
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th v-if="selectable" class="selection-cell"><input type="checkbox" :checked="pageSelected" :indeterminate="partialSelected" aria-label="选择本页全部记录" @change="selectPage(($event.target as HTMLInputElement).checked)"></th>
            <th v-for="column in columns" :key="column.key" :style="{ width: column.width }" :aria-sort="sortKey === column.key ? (descending ? 'descending' : 'ascending') : 'none'">
              <button class="sort-button" type="button" :disabled="column.sortable === false" @click="sort(column)">{{ column.label }}<span v-if="column.sortable !== false" :class="{ active: sortKey === column.key }">{{ sortKey === column.key ? (descending ? '↓' : '↑') : '↕' }}</span></button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in pageRows" :key="rowId(row)" :class="{ selected: selection.has(rowId(row)) }" @click="emit('rowClick', row)">
            <td v-if="selectable" class="selection-cell" @click.stop><input type="checkbox" :checked="selection.has(rowId(row))" :aria-label="`选择 ${rowId(row)}`" @change="selectRow(row, ($event.target as HTMLInputElement).checked)"></td>
            <td v-for="column in columns" :key="column.key"><slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">{{ row[column.key] ?? '—' }}</slot></td>
          </tr>
          <tr v-if="!pageRows.length"><td :colspan="columns.length + (selectable ? 1 : 0)"><div class="empty-state">{{ emptyText }}</div></td></tr>
        </tbody>
      </table>
    </div>
    <div class="pagination">
      <span>共 <strong>{{ rows.length }}</strong> 条<span v-if="selectable && selection.size"> · 已选 {{ selection.size }} 条</span></span>
      <label>每页 <select v-model.number="size" class="field" aria-label="每页记录数"><option v-for="count in [...new Set([pageSize, 10, 20, 50, 100])].sort((a,b) => a-b)" :key="count" :value="count">{{ count }}</option></select> 条</label>
      <div class="page-buttons">
        <button class="btn" type="button" :disabled="page <= 1" aria-label="第一页" @click="goPage(1)">«</button>
        <button class="btn" type="button" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
        <input class="field page-input" type="number" min="1" :max="pageCount" :value="page" aria-label="当前页码" @change="goPage(($event.target as HTMLInputElement).value)">
        <span>/ {{ pageCount }}</span>
        <button class="btn" type="button" :disabled="page >= pageCount" @click="goPage(page + 1)">下一页</button>
        <button class="btn" type="button" :disabled="page >= pageCount" aria-label="最后一页" @click="goPage(pageCount)">»</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-table { border: 1px solid #dce7f2; border-radius: 10px; overflow: hidden; background: #fff; }
.table-scroll { overflow: auto; max-height: 470px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { position: sticky; top: 0; z-index: 1; background: #eaf3fb; color: #245477; white-space: nowrap; }
.data-table td, .data-table th { padding: 10px 11px; border-bottom: 1px solid #e6edf5; text-align: left; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover { background: #f2f8fd; }
.data-table tbody tr.selected { background: #eaf4ff; }
.sort-button { border: 0; background: none; color: inherit; padding: 0; display: flex; align-items: center; gap: 7px; font: inherit; font-weight: 600; cursor: pointer; }
.sort-button:disabled { cursor: default; }
.sort-button span { color: #a2b7ca; font-size: 12px; }.sort-button span.active { color: #176cb6; }
.selection-cell { width: 30px; text-align: center !important; }
input[type=checkbox] { accent-color: #2075b7; width: 15px; height: 15px; cursor: pointer; }
.pagination { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 12px; background: #f9fbfe; font-size: 12px; color: #667d92; flex-wrap: wrap; }
.pagination label { display: flex; align-items: center; gap: 5px; }.pagination select { width: 64px; padding: 4px; }
.page-buttons { display: flex; align-items: center; gap: 5px; }.page-buttons .btn { padding: 5px 9px; font-size: 12px; }
.page-input { width: 52px; padding: 5px; text-align: center; }
.empty-state { padding: 45px 12px; text-align: center; color: #92a5b6; }
</style>
