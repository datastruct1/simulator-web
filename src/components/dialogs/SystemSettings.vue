<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { autoSettingItems, promptSettingItems, settingTabs } from '../../data/tools'
import { useSimulator } from '../../state/simulator'
import { clone, errorMessage, readJsonFile } from './toolHelpers'
import UiIcon from '../common/UiIcon.vue'

const { state, record, notify, downloadJson } = useSimulator()

type SettingValue = string | number | boolean
// Keep in sync with the runtime defaults in src/state/simulator.ts (Web runtime uses an http address, not the WPF ws endpoint).
const DEFAULTS: Record<string, SettingValue> = {
  bunkerFlow: 600, serverAddress: 'http://127.0.0.1:25565', localCoach: true, imageQuality: '高',
  autoNitrogenFan: true, autoFuelCutoff: true, autoFuelPump: true, autoPreparationFan: true, autoCofferdamFan: true, autoWater: true,
  successAutoClose: true, successCloseMs: 3500, informationAutoClose: true, informationCloseMs: 3500,
  warningAutoClose: false, warningCloseMs: 3500, errorAutoClose: false, errorCloseMs: 3500, criticalAutoClose: false, criticalCloseMs: 3500,
  highlightMs: 5000, showDeviceLabels: true, sound: true,
}
const activeTab = ref(settingTabs[0])
const draft = reactive<Record<string, any>>({ ...DEFAULTS, ...(state.settings as Record<string, unknown>) })
const fileInput = ref<HTMLInputElement>()
const confirming = ref('')
const importedCount = ref(0)
const dirty = computed(() => Object.keys(DEFAULTS).some(key => draft[key] !== state.settings[key]))
const changedKeys = computed(() => Object.keys(DEFAULTS).filter(key => draft[key] !== state.settings[key]))

function revert() { Object.assign(draft, clone(state.settings)); importedCount.value = 0; notify('已撤销未保存的设置修改。', 'success') }
function restoreDefaults() { Object.assign(draft, DEFAULTS); importedCount.value = 0; notify('已载入默认设置草稿，点击“保存设置”后生效。', 'warning') }
function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback
}
function save() {
  draft.bunkerFlow = clampNumber(draft.bunkerFlow, 0, 100000, 600)
  draft.highlightMs = clampNumber(draft.highlightMs, 500, 60000, 5000)
  for (const prompt of promptSettingItems) draft[`${prompt.key}CloseMs`] = clampNumber(draft[`${prompt.key}CloseMs`], 0, 60000, 3500)
  draft.serverAddress = String(draft.serverAddress ?? '').trim().slice(0, 200)
  Object.assign(state.settings, clone(draft))
  importedCount.value = 0
  record('保存系统设置（本地浏览器存储，不连接服务器）')
  notify('设置已保存到本地浏览器，立即生效。', 'success')
}
function toggleAutoClose(key: string) {
  draft[`${key}AutoClose`] = draft[`${key}AutoClose`] !== true
}
function exportDraft() {
  downloadJson(`simulator_web.settings_${new Date().toISOString().slice(0, 10)}.json`, { schemaVersion: 1, exportedAt: new Date().toISOString(), settings: clone(draft) })
  record('导出系统设置 JSON（草稿）')
  notify('设置草稿已导出为 JSON 文件。', 'success')
}
async function importFile(event: Event) {
  try {
    const data = await readJsonFile(event, 1024 * 1024)
    if (data === undefined) return
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('设置文件必须是 JSON 对象。')
    const root = data as Record<string, unknown>
    const source = root.settings && typeof root.settings === 'object' && !Array.isArray(root.settings)
      ? root.settings as Record<string, unknown>
      : root
    let applied = 0
    const ignored: string[] = []
    for (const [key, value] of Object.entries(source)) {
      if (!Object.hasOwn(DEFAULTS, key)) { ignored.push(key); continue }
      const expected = typeof DEFAULTS[key]
      if (expected === 'number') {
        const number = Number(value)
        if (!Number.isFinite(number)) throw new Error(`设置 ${key} 必须是有限数字。`)
        draft[key] = number
      } else if (expected === 'boolean') {
        if (typeof value !== 'boolean') throw new Error(`设置 ${key} 必须是布尔值 true / false。`)
        draft[key] = value
      } else {
        if (typeof value !== 'string') throw new Error(`设置 ${key} 必须是文本。`)
        draft[key] = value.slice(0, 200)
      }
      applied++
    }
    if (!applied) throw new Error('设置文件中没有本 Web 版本支持的字段。')
    importedCount.value = applied
    record(`导入系统设置草稿 ${applied} 项${ignored.length ? `，忽略 ${ignored.length} 项未知字段` : ''}`)
    notify(`已导入 ${applied} 项设置草稿${ignored.length ? `，忽略未知字段：${ignored.slice(0, 4).join('、')}` : ''}。点击“保存设置”生效。`, 'success')
  } catch (error) { notify(errorMessage(error), 'error') }
}
function recordLocalCleanup() {
  confirming.value = ''
  const cleared = state.logs.length
  const alarms = state.alarms.length
  state.logs = []
  state.alarms = []
  state.toasts = []
  record(`清理本地日志 ${cleared} 条、告警 ${alarms} 条（仅浏览器内存，不影响任何服务器）`)
  notify('本地日志与告警已清理。', 'success')
}
function packageExport() {
  downloadJson(`simulator_web.data_${new Date().toISOString().replace(/[:.]/g, '-')}.json`, {
    schemaVersion: 1, exportedAt: new Date().toISOString(), source: 'Simulator.Web 本地浏览器',
    settings: clone(state.settings), snapshots: clone(state.snapshots), logs: clone(state.logs), alarms: clone(state.alarms),
    devices: clone(state.devices),
  })
  record('打包导出本地数据（设置 / 工况 / 日志 / 告警 / 设备状态）')
  notify('本地数据包已导出，未上传到任何服务器。', 'success')
}
</script>

<template>
  <div class="system-settings">
    <nav class="tabs setting-tabs"><button v-for="tab in settingTabs" :key="tab" :class="{ active: activeTab === tab }" type="button" @click="activeTab = tab">{{ tab }}</button></nav>

    <div v-if="activeTab === '流程'" class="setting-layout">
      <section class="card">
        <h3>流程参数</h3>
        <div class="form-grid">
          <label class="field-group"><span class="field-label">加注流量设定（bunkerFlow，m³/h）</span><input v-model.number="draft.bunkerFlow" class="field" type="number" min="0" max="100000" step="10"></label>
          <div class="field-group"><span class="field-label">参数说明</span><p class="hint">用于计算仿真中的液位变化趋势，不代表实际作业数据。</p></div>
        </div>
      </section>
      <section class="card">
        <h3>异常自动处置</h3>
        <div class="toggle-list"><label v-for="item in autoSettingItems" :key="item.key" class="checkbox-label"><input v-model="draft[item.key]" type="checkbox">{{ item.label }}<span class="key-note">{{ item.key }}</span></label></div>
      </section>
    </div>

    <div v-else-if="activeTab === '学员端'" class="setting-layout">
      <section class="card">
        <h3>学员端</h3>
        <div class="toggle-list"><label class="checkbox-label"><input v-model="draft.localCoach" type="checkbox">启用本地教练提示（localCoach）<span class="key-note">不连接服务器</span></label></div>
        <div class="form-grid">
          <label class="field-group"><span class="field-label">图像质量（imageQuality）</span><select v-model="draft.imageQuality" class="field"><option>低</option><option>中</option><option>高</option></select></label>
          <div class="field-group"><span class="field-label">当前说明</span><p class="hint">该选项仅保存显示偏好，当前不改变图像质量。</p></div>
        </div>
      </section>
      <section class="card server-card">
        <h3>服务器地址 <span class="badge badge-warning">未连接</span></h3>
        <div class="form-grid">
          <label class="field-group full"><span class="field-label">serverAddress</span><input v-model="draft.serverAddress" class="field" type="text" maxlength="200" placeholder="http://127.0.0.1:25565"></label>
        </div>
        <p class="hint warning"><UiIcon name="TriangleAlert" :size="14" />该地址仅保存于本地设置，不用于建立连接。</p>
      </section>
    </div>

    <div v-else-if="activeTab === '教练端'" class="setting-layout">
      <section class="card">
        <h3>教练端显示与提示</h3>
        <div class="form-grid">
          <label class="field-group"><span class="field-label">设备高亮保持时间（highlightMs）</span><input v-model.number="draft.highlightMs" class="field" type="number" min="500" max="60000" step="500"></label>
          <div class="field-group"><span class="field-label">说明</span><p class="hint">定位设备时工艺图高亮保持时长，500～60000 ms。</p></div>
        </div>
        <div class="toggle-list">
          <label class="checkbox-label"><input v-model="draft.showDeviceLabels" type="checkbox">在工艺图显示设备名称标签（showDeviceLabels）</label>
          <label class="checkbox-label"><input v-model="draft.sound" type="checkbox">启用本地提示音（sound）</label>
        </div>
      </section>
    </div>

    <div v-else-if="activeTab === '其它设置'" class="setting-layout">
      <section class="card">
        <h3>提示自动关闭</h3>
        <div class="prompt-table">
          <div class="prompt-head"><span>提示类型</span><span>自动关闭</span><span>关闭延时（ms）</span></div>
          <div v-for="item in promptSettingItems" :key="item.key" class="prompt-row">
            <span>{{ item.symbol }} {{ item.label }} <small>{{ item.key }}</small></span>
            <button class="btn btn-sm" :class="{ 'btn-success': draft[item.key + 'AutoClose'] === true }" type="button" @click="toggleAutoClose(item.key)">{{ draft[item.key + 'AutoClose'] === true ? '已开启' : '已关闭' }}</button>
            <input v-model.number="draft[item.key + 'CloseMs']" class="field" type="number" min="0" max="60000" step="250">
          </div>
        </div>
      </section>
      <section class="card">
        <h3>本地数据</h3>
        <div class="data-actions">
          <button class="btn" type="button" @click="confirming = 'clean'"><UiIcon name="Trash2" :size="14" />清理本地日志</button>
          <button class="btn" type="button" @click="packageExport"><UiIcon name="Download" :size="14" />打包导出本地数据</button>
        </div>
        <div v-if="confirming === 'clean'" class="confirm-strip"><span>确认清空浏览器内存中的 {{ state.logs.length }} 条日志、{{ state.alarms.length }} 条告警与提示？该操作不涉及服务器。</span><button class="btn btn-danger btn-sm" type="button" @click="recordLocalCleanup">确认清理</button><button class="btn btn-sm" type="button" @click="confirming = ''">取消</button></div>
        <p class="hint">导出当前设置、工况快照、日志、告警与设备状态。</p>
      </section>
    </div>

    <div v-else class="setting-layout">
      <section class="card about-card">
        <h3>Simulator.Web · 甲醇燃料加注仿真训练平台</h3>
        <p>甲醇燃料加注仿真训练平台提供工艺操作、理论练习与考评功能。</p>
        <ul>
          <li>设置和工况保存在当前浏览器中，可导出备份。</li>
          <li>本地工作台数据保存在当前浏览器；平台接入状态请查看连接信息。</li>
          <li>安全门禁：加注相关流程仍需先完成 247 项安全检查与双方签收。</li>
        </ul>
        <div class="about-actions"><button class="btn" type="button" @click="exportDraft"><UiIcon name="FileJson" :size="14" />导出现有设置</button><button class="btn" type="button" @click="packageExport"><UiIcon name="Download" :size="14" />导出完整本地数据</button></div>
      </section>
    </div>

    <footer class="settings-footer">
      <span class="dirty-note" :class="{ dirty }">{{ dirty ? `未保存修改：${changedKeys.length} 项` : '当前草稿与已保存设置一致' }}<span v-if="importedCount" class="import-note"> · 已导入 {{ importedCount }} 项</span></span>
      <button class="btn" type="button" @click="revert" :disabled="!dirty">撤销修改</button>
      <button class="btn" type="button" @click="restoreDefaults">恢复默认</button>
      <button class="btn" type="button" @click="exportDraft"><UiIcon name="FileJson" :size="14" />导出 JSON</button>
      <button class="btn" type="button" @click="fileInput?.click()"><UiIcon name="Upload" :size="14" />导入 JSON</button>
      <input ref="fileInput" class="visually-hidden" type="file" accept="application/json,.json" @change="importFile">
      <button class="btn btn-primary" type="button" @click="save"><UiIcon name="Save" :size="14" />保存设置</button>
    </footer>
  </div>
</template>

<style scoped>
.system-settings { color: #405e75; }
.setting-tabs { margin-bottom: 16px; }
.setting-layout { display: flex; flex-direction: column; gap: 14px; }
.setting-layout .card { padding: 18px 20px; }
.setting-layout h3 { margin: 0 0 14px; color: #2f6f99; font-size: 15px; }
.hint { margin: 0; color: #849aab; font-size: 11px; line-height: 1.7; }
.hint.warning { display: flex; align-items: flex-start; gap: 6px; margin-top: 10px; padding: 9px 11px; border-radius: 6px; background: #fff8e9; color: #92682c; }
.toggle-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin-top: 14px; }
.toggle-list .checkbox-label { font-size: 12px; color: #4f6c85; }
.key-note { margin-left: 7px; color: #9aadbc; font-size: 10px; }
.server-card .badge { margin-left: 6px; vertical-align: middle; }
.prompt-table { display: flex; flex-direction: column; gap: 7px; }
.prompt-head, .prompt-row { display: grid; grid-template-columns: 1.4fr 110px 130px; gap: 10px; align-items: center; }
.prompt-head { font-size: 11px; color: #8299ab; padding: 0 2px 4px; border-bottom: 1px solid #e4edf5; }
.prompt-row { font-size: 12px; color: #4f6c85; }
.prompt-row small { color: #9aadbc; font-size: 10px; }
.prompt-row .field { min-height: 31px; padding: 5px 8px; }
.data-actions { display: flex; gap: 9px; flex-wrap: wrap; }
.data-actions .btn { display: inline-flex; align-items: center; gap: 6px; }
.confirm-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 11px; padding: 10px 12px; border: 1px solid #ecc5c8; border-radius: 7px; background: #fff6f6; font-size: 11px; color: #a25058; }
.confirm-strip span { margin-right: auto; }
.about-card { line-height: 1.8; font-size: 12px; color: #5c7489; }
.about-card p { margin: 0 0 10px; }
.about-card ul { margin: 0; padding-left: 19px; }
.about-card code { padding: 1px 5px; border-radius: 4px; background: #eef4fa; color: #35709c; font-size: 11px; }
.about-actions { display: flex; gap: 9px; margin-top: 14px; flex-wrap: wrap; }
.about-actions .btn { display: inline-flex; align-items: center; gap: 6px; }
.settings-footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 16px; padding-top: 14px; border-top: 1px solid #dce7f1; }
.settings-footer .btn { display: inline-flex; align-items: center; gap: 5px; }
.dirty-note { margin-right: auto; font-size: 11px; color: #90a4b4; }
.dirty-note.dirty { color: #b97f26; font-weight: 600; }
.import-note { color: #4f9d85; }
@media (max-width: 760px) { .toggle-list { grid-template-columns: 1fr; } .prompt-head, .prompt-row { grid-template-columns: 1fr 96px 110px; } .settings-footer .dirty-note { flex-basis: 100%; } }
</style>
