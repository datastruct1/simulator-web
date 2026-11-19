<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Box, HeartPulse, ShieldCheck, Search } from 'lucide-vue-next'
import { cabinetItems, type CabinetItem } from '../../data/tools'
import { useSimulator } from '../../state/simulator'
import { clone } from './toolHelpers'
import ModelViewer from './ModelViewer.vue'

interface ModelAsset { name: string; category: string; url: string; format: string; bytes: number }
interface CabinetEntry extends CabinetItem { available: boolean; bytes: number }
interface ItemRecord { checked: boolean; checkedAt: string; borrowed: boolean; user: string }
const { state, record, notify, downloadJson } = useSimulator()
const category = ref(String(state.modal?.payload?.category || '医疗用品'))
const categories = ['医疗用品', '消防设施', '设备组件']
const search = ref('')
const showUnchecked = ref(false)
const sort = ref('原列表顺序')
const manifest = ref<ModelAsset[]>([])
const manifestError = ref('')
const records = reactive<Record<string, ItemRecord>>({})
const selectedId = ref('')
const page = ref(1)
const PAGE_SIZE = 8
try {
  const saved = state.workspaces.inventory || JSON.parse(localStorage.getItem('simulator_web.inventory.v1') || '{}')
  if (saved && typeof saved === 'object') for (const item of cabinetItems) {
    const value = saved[item.id]
    if (value && typeof value === 'object') records[item.id] = { checked: value.checked === true, borrowed: value.borrowed === true, checkedAt: String(value.checkedAt || '').slice(0,120), user: String(value.user || '').slice(0,100) }
  }
} catch { /* Damaged inventory records are ignored. */ }
const catalog = computed<CabinetEntry[]>(() => {
  const original = cabinetItems.map(item => { const asset = manifest.value.find(model => model.url === item.url); return { ...item, available: Boolean(asset), bytes: asset?.bytes || 0 } })
  const extras = manifest.value.filter(asset => !original.some(item => item.url === asset.url)).map((asset,index) => ({ id: `asset-${index}`, name: asset.name, category: asset.category, url: asset.url, format: asset.format, description: '原桌面资源包中提供的单体模型，可进行旋转、缩放与线框查看。', available: true, bytes: asset.bytes }))
  return [...original, ...extras]
})
const filtered = computed(() => {
  const list = catalog.value.filter(item => item.category === category.value && (!search.value || `${item.name} ${item.description}`.toLowerCase().includes(search.value.toLowerCase())) && (!showUnchecked.value || !records[item.id]?.checked))
  if (sort.value === '名称升序') list.sort((a,b) => a.name.localeCompare(b.name,'zh-CN',{numeric:true}))
  if (sort.value === '模型大小') list.sort((a,b) => b.bytes - a.bytes)
  return list
})
const pageCount = computed(() => Math.max(1,Math.ceil(filtered.value.length / PAGE_SIZE)))
const visible = computed(() => filtered.value.slice((page.value-1)*PAGE_SIZE,page.value*PAGE_SIZE))
const selected = computed(() => catalog.value.find(item => item.id === selectedId.value) || filtered.value[0])
const checkedCount = computed(() => catalog.value.filter(item => records[item.id]?.checked).length)
watch([category,search,showUnchecked,sort], () => { page.value = 1; selectedId.value = '' })
watch(pageCount, value => { if (page.value > value) page.value = value })
watch(records, () => {
  state.workspaces.inventory = clone(records)
  try { localStorage.setItem('simulator_web.inventory.v1', JSON.stringify(records)) } catch { /* Changes remain usable for this session. */ }
}, { deep: true })
function itemRecord(item: CabinetEntry) { return records[item.id] || (records[item.id] = { checked: false, borrowed: false, checkedAt: '', user: '' }) }
function checkItem(item: CabinetEntry) {
  const value = itemRecord(item)
  value.checked = !value.checked
  value.checkedAt = value.checked ? new Date().toLocaleString('zh-CN',{hour12:false}) : ''
  value.user = state.userName
  state.checklist[`inventory:${item.id}:checked`] = value.checked
  record(`${value.checked ? '检查确认' : '撤销检查'}物品柜：${item.name}`)
  notify(`${item.name}${value.checked ? '已检查确认' : '检查已撤销'}。`, value.checked ? 'success' : 'info')
}
function borrow(item: CabinetEntry) {
  const value = itemRecord(item)
  value.borrowed = !value.borrowed; value.user = state.userName
  record(`${value.borrowed ? '取用' : '归还'}物品：${item.name}`)
  notify(`${item.name}${value.borrowed ? '已取用' : '已归还'}（本地物品记录）。`, 'success')
}
function checkCategory() {
  const items = catalog.value.filter(item => item.category === category.value)
  for (const item of items) {
    const value = itemRecord(item)
    value.checked = true; value.checkedAt = new Date().toLocaleString('zh-CN',{hour12:false}); value.user = state.userName
    state.checklist[`inventory:${item.id}:checked`] = true
  }
  record(`检查确认物品柜：${category.value}全部 ${items.length} 项`)
  notify(`${category.value}的 ${items.length} 项物品已核实。`, 'success')
}
function exportInventory() { downloadJson('物品柜检查记录.json', { schemaVersion: 1, type: 'inventory-record', exportedAt: new Date().toISOString(), items: catalog.value.map(item => ({ ...item, record: records[item.id] || null })) }); record('导出物品柜检查记录') }
onMounted(async () => {
  try {
    const response = await fetch('/simulator-web/assets/models/manifest.json')
    if (!response.ok) throw new Error('本地模型清单无法读取。')
    const data: unknown = await response.json()
    if (!Array.isArray(data)) throw new Error('本地模型清单格式无效。')
    manifest.value = data.filter((item): item is ModelAsset => Boolean(item && typeof item === 'object' && typeof item.name === 'string' && categories.includes(item.category) && typeof item.url === 'string' && item.url.startsWith('/simulator-web/assets/models/') && ['obj','3ds'].includes(item.format) && typeof item.bytes === 'number'))
  } catch (error) { manifestError.value = error instanceof Error ? error.message : '模型清单读取失败。' }
})
</script>

<template>
  <div class="inventory-dialog"><div class="cabinet-heading"><div><span class="eyebrow">原桌面模型展示柜</span><h3>医疗用品、消防设施与设备组件</h3></div><span class="badge">已核实 {{ checkedCount }} / {{ catalog.length }}</span></div><nav class="tabs cabinet-tabs"><button v-for="name in categories" :key="name" class="tab" :class="{ active: category === name }" type="button" @click="category = name"><HeartPulse v-if="name === '医疗用品'" :size="15"/><ShieldCheck v-else-if="name === '消防设施'" :size="15"/><Box v-else :size="15"/>{{ name }}</button></nav><div class="toolbar"><label class="search"><Search :size="15"/><input v-model="search" class="field" placeholder="搜索物品名称 / 用途"></label><select v-model="sort" class="field" aria-label="物品排序"><option>原列表顺序</option><option>名称升序</option><option>模型大小</option></select><label class="check-option"><input v-model="showUnchecked" type="checkbox">仅未核实</label><button class="btn" type="button" @click="checkCategory">本类全部核实</button><button class="btn" type="button" @click="exportInventory">导出记录</button></div><p v-if="manifestError" class="asset-warning">{{ manifestError }} 物品介绍与本地检查记录仍可使用。</p><div class="cabinet-layout"><section><div class="locker-grid"><button v-for="item in visible" :key="item.id" class="locker" :class="{ selected: selected?.id === item.id, checked: records[item.id]?.checked }" type="button" @click="selectedId = item.id"><div class="locker-art"><HeartPulse v-if="item.category === '医疗用品'" :size="33"/><ShieldCheck v-else-if="item.category === '消防设施'" :size="33"/><Box v-else :size="33"/><span v-if="records[item.id]?.checked" class="verified">✓</span></div><strong>{{ item.name }}</strong><small>{{ item.available ? `${item.format.toUpperCase()} · ${(item.bytes/1024/1024).toFixed(1)} MB` : '查看物品介绍' }}</small><span v-if="records[item.id]?.borrowed" class="borrowed">已取用</span></button><div v-if="!visible.length" class="empty-state">没有符合条件的物品。</div></div><div class="cabinet-pagination"><span>共 {{ filtered.length }} 件 · 第 {{ page }} / {{ pageCount }} 页</span><button class="btn" type="button" :disabled="page <= 1" @click="page--">上一页</button><button class="btn" type="button" :disabled="page >= pageCount" @click="page++">下一页</button></div></section><section v-if="selected" class="model-detail card"><h3>{{ selected.name }}<span class="badge">{{ selected.category }}</span></h3><ModelViewer v-if="selected.available" :key="selected.url" :url="selected.url" :name="selected.name" :format="selected.format"/><div v-else class="model-explanation"><Box :size="42"/><strong>{{ selected.name === '模型组' ? '原整体模型组未包含在轻量资源包中' : manifestError ? '当前模型清单不可用' : '此物品原模型未包含在本地资源包中' }}</strong><p>请选择其它单体设备查看真实三维结构。该物品的原中文介绍和核实 / 取用记录仍保留。</p></div><p class="description">{{ selected.description }}</p><div class="detail-actions"><button class="btn" :class="records[selected.id]?.checked ? '' : 'btn-success'" type="button" @click="checkItem(selected)">{{ records[selected.id]?.checked ? '撤销核实' : '检查确认' }}</button><button class="btn btn-primary" type="button" @click="borrow(selected)">{{ records[selected.id]?.borrowed ? '归还物品' : '取用物品' }}</button><a v-if="selected.available" class="btn" :href="selected.url" :download="selected.name + '.' + selected.format">下载原模型</a></div><small v-if="records[selected.id]?.checkedAt" class="checked-at">{{ records[selected.id]?.user }} · {{ records[selected.id]?.checkedAt }} 核实</small></section></div></div>
</template>

<style scoped>
.inventory-dialog { color: #3d5b73; }.cabinet-heading { display: flex; gap: 15px; align-items: center; justify-content: space-between; padding-bottom: 12px; }.eyebrow { color: #81a3ba; letter-spacing: 2px; font-size: 10px; }.cabinet-heading h3 { margin: 7px 0; font-size: 17px; color: #3b7095; }.cabinet-tabs { display: flex; gap: 4px; padding: 0; border-bottom: 1px solid #d9e7f2; margin-bottom: 17px; }.tab { display: flex; gap: 7px; align-items: center; padding: 10px 17px; background: none; border: none; border-bottom: 2px solid transparent; color: #8ba1b2; cursor: pointer; font: inherit; font-size: 13px; }.tab.active { border-color: #2b82b6; background: #f1f8fe; color: #307fae; }.toolbar { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-bottom: 19px; }.search { display: flex; align-items: center; gap: 7px; flex: 1; color: #8aa3b5; }.search input { width: 100%; }.field { padding: 8px 10px; border: 1px solid #d7e4ee; border-radius: 6px; color: #587388; font-size: 12px; background: white; }.check-option { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #8498a8; white-space: nowrap; }.check-option input { accent-color: #3b87b3; }.toolbar .btn { font-size: 11px; padding: 8px 10px; }.cabinet-layout { display: grid; grid-template-columns: minmax(280px,1fr) minmax(330px,1.12fr); gap: 20px; }.locker-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }.locker { position: relative; padding: 14px 11px; border: 1px solid #dce7f0; background: linear-gradient(#f5f9fc,white); border-radius: 9px; display: flex; flex-direction: column; align-items: center; gap: 9px; color: #5a819d; text-align: center; cursor: pointer; transition: .2s; }.locker:hover { border-color: #a8c9df; transform: translateY(-1px); }.locker.selected { border-color: #75afd4; box-shadow: 0 0 0 2px #87b7d52b; background: #edf6fc; }.locker-art { position: relative; width: 72px; height: 66px; border-radius: 9px; background: #e7eff5; display: grid; place-items: center; color: #84a8c0; }.locker.checked .locker-art { background: #e3f4ed; color: #83b39f; }.verified { position: absolute; right: -3px; bottom: -3px; border-radius: 50%; background: #56a587; color: white; font-size: 10px; padding: 3px 5px; }.locker strong { font-size: 12px; font-weight: 500; }.locker small { font-size: 9px; color: #9bafbe; }.borrowed { font-size: 9px; padding: 3px 7px; background: #fff2d9; color: #b79357; border-radius: 8px; }.cabinet-pagination { display: flex; align-items: center; gap: 7px; padding: 15px 0; font-size: 11px; color: #93a6b5; }.cabinet-pagination span { margin-right: auto; }.cabinet-pagination .btn { font-size: 10px; padding: 6px 8px; }.model-detail { padding: 17px; border: 1px solid #dce8f1; border-radius: 10px; background: white; }.model-detail h3 { display: flex; align-items: center; gap: 10px; margin: 0 0 15px; font-size: 16px; color: #427496; }.model-detail h3 .badge { margin-left: auto; font-size: 10px; font-weight: 400; }.description { font-size: 12px; color: #718c9f; line-height: 1.9; }.detail-actions { display: flex; gap: 7px; flex-wrap: wrap; }.detail-actions .btn { font-size: 11px; padding: 8px 10px; text-decoration: none; }.checked-at { display: block; margin-top: 14px; color: #97ae9f; font-size: 10px; }.model-explanation { min-height: 265px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #9bb1c1; background: #f4f8fc; border-radius: 8px; gap: 15px; padding: 20px; }.model-explanation strong { font-size: 13px; color: #7291a9; }.model-explanation p { font-size: 11px; line-height: 1.8; margin: 0; }.asset-warning { color: #b58c58; font-size: 11px; }
@media (max-width: 850px) { .cabinet-layout { grid-template-columns: 1fr; }.locker-grid { grid-template-columns: repeat(4,minmax(0,1fr)); } }@media (max-width: 600px) { .locker-grid { grid-template-columns: 1fr 1fr; }.cabinet-heading h3 { font-size: 15px; }.tab { padding: 10px 12px; }.toolbar .search { flex-basis: 100%; } }
</style>
