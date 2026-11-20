<script setup lang="ts">
import { computed } from 'vue'
import { autoSettingItems, fanRooms } from '../../data/tools'
import { useSimulator } from '../../state/simulator'
import type { DeviceState } from '../../types/simulator'
import { injectConfiguredFault, resetConfiguredFault } from './faultActions'
import { deviceView, deviceStatus, locateDevice, openDevice } from './toolHelpers'
import DeviceVisual from './DeviceVisual.vue'
import UiIcon from '../common/UiIcon.vue'

const { state, ensureDevice, setDevice, record, notify, isFreeManual } = useSimulator()

function autoKeyFor(sensorId: string): string {
  if (sensorId === 'Pit7A') return 'autoNitrogenFan'
  if (sensorId === 'Pit1A') return 'autoCofferdamFan'
  return 'autoPreparationFan'
}
function healthy(device: DeviceState) { return isFreeManual() || !device.error && device.enabled }
interface FanRoomView {
  config: (typeof fanRooms)[number]
  autoKey: string
  autoLabel: string
  sensor: DeviceState
  master: DeviceState
  backup: DeviceState
}
const rooms = computed<FanRoomView[]>(() => fanRooms.map(config => {
  const autoKey = autoKeyFor(config.sensorId)
  return {
    config,
    autoKey,
    autoLabel: autoSettingItems.find(item => item.key === autoKey)?.label || autoKey,
    sensor: deviceView(config.sensorId),
    master: deviceView(config.masterId, 'fan', `${config.name}主风机`),
    backup: deviceView(config.backupId, 'fan', `${config.name}备用风机`),
  }
}))
const fans = computed(() => rooms.value.flatMap(room => [room.master, room.backup]))
const counters = computed(() => ({
  total: fans.value.length,
  running: fans.value.filter(fan => fan.working).length,
  faults: fans.value.filter(fan => fan.error || !fan.enabled).length,
}))
function start(device: DeviceState, name: string) {
  const actual = ensureDevice(device.id, 'fan', name)
  if (!isFreeManual() && (actual.error || !actual.enabled)) { notify(`${actual.id} 故障或已锁定，不能启动。`, 'warning'); return }
  setDevice(actual.id, { working: true, value: 100, startRequested: true })
  notify(`${name}（${actual.id}）已启动。`, 'success')
}
function stop(device: DeviceState, name: string) {
  const actual = ensureDevice(device.id, 'fan', name)
  setDevice(actual.id, { working: false, value: 0, startRequested: false })
  notify(`${name}（${actual.id}）已停止。`, 'success')
}
function toggle(device: DeviceState, name: string) { if (device.working) stop(device, name); else start(device, name) }
function setMode(device: DeviceState, name: string, mode: string) {
  const actual = ensureDevice(device.id, 'fan', name)
  if (actual.mode === mode) return
  setDevice(actual.id, { mode })
  notify(`${name}（${actual.id}）切换为${mode}模式。`, 'success')
}
function toggleAuto(room: FanRoomView) {
  const enabled = state.settings[room.autoKey] === false
  state.settings[room.autoKey] = enabled
  record(`通风系统异常自动切换：${enabled ? '开启' : '关闭'}（${room.autoLabel}）`, room.master.id)
  notify(`${room.config.name}异常自动切换已${enabled ? '开启' : '关闭'}。`, enabled ? 'success' : 'warning')
}
function takeover(room: FanRoomView) {
  const master = ensureDevice(room.config.masterId, 'fan', `${room.config.name}主风机`)
  const backup = ensureDevice(room.config.backupId, 'fan', `${room.config.name}备用风机`)
  const running = [master, backup].filter(device => device.working)
  let target: DeviceState
  let source: DeviceState | undefined
  if (running.length === 1) {
    source = running[0]!
    target = source.id === master.id ? backup : master
  } else if (running.length === 2) {
    target = healthy(master) ? master : healthy(backup) ? backup : master
    source = target.id === master.id ? backup : master
  } else {
    target = healthy(master) ? master : backup
    source = undefined
  }
  if (!healthy(target)) {
    notify(`${room.config.name}：${target.id} 处于故障或锁定状态，无法接替${source?.working ? `；${source.id} 仍在运行` : ''}。`, 'warning')
    return
  }
  if (source?.working && !setDevice(source.id, { working: false, value: 0, startRequested: false })) return
  if (!setDevice(target.id, { working: true, value: 100, startRequested: true })) return
  record(`通风系统主备切换：${source?.id || '无运行机'} → ${target.id}`, target.id)
  notify(`${room.config.name}已切换至 ${target.id}（${target.id === master.id ? '主风机' : '备用风机'}）。`, 'success')
}
function drill(device: DeviceState, name: string) {
  injectConfiguredFault(device.id, 'failure')
  notify(`${name}（${device.id}）故障演练已注入，可观察自动/手动主备切换。`, 'warning')
}
function recover(device: DeviceState, name: string) {
  resetConfiguredFault(device.id)
  notify(`${name}（${device.id}）异常已复位。`, 'success')
}
function nameOf(room: FanRoomView, device: DeviceState) {
  return device.id === room.config.masterId ? `${room.config.name}主风机` : `${room.config.name}备用风机`
}
function slotOf(room: FanRoomView, device: DeviceState) { return device.id === room.config.masterId ? '主风机' : '备用风机' }
</script>

<template>
  <div class="fan-settings">
    <div class="fan-counters">
      <div><small>配置风机</small><strong>{{ counters.total }}</strong></div>
      <div class="green"><small>正在运行</small><strong>{{ counters.running }}</strong></div>
      <div class="orange"><small>故障 / 锁定</small><strong>{{ counters.faults }}</strong></div>
    </div>

    <section v-for="room in rooms" :key="room.config.name" class="card fan-room">
      <header class="room-heading">
        <div>
          <h3>{{ room.config.name }}</h3>
          <p>风压传感器 {{ room.sensor.id }} · {{ room.sensor.name }}：
            <strong>{{ Number(room.sensor.value).toFixed(2) }} {{ room.sensor.unit }}</strong>
            <span class="badge" :class="room.sensor.error ? 'badge-danger' : 'badge-muted'">{{ deviceStatus(room.sensor) }}</span>
          </p>
        </div>
        <div class="room-actions">
          <label class="auto-toggle"><input type="checkbox" :checked="state.settings[room.autoKey] !== false" @change="toggleAuto(room)">异常自动切换</label>
          <button class="btn btn-sm" type="button" @click="takeover(room)"><UiIcon name="RefreshCw" :size="13" />主备切换</button>
          <button class="btn btn-sm" type="button" @click="locateDevice(room.master.id)"><UiIcon name="Eye" :size="13" />定位</button>
        </div>
      </header>
      <div class="fan-slots">
        <article v-for="device in [room.master, room.backup]" :key="device.id" class="fan-slot" :class="{ running: device.working, faulty: device.error || !device.enabled }">
          <div class="slot-visual"><DeviceVisual kind="fan" :working="device.working" :error="device.error" :value="device.value" /></div>
          <div class="slot-body">
            <div class="slot-title">
              <span class="slot-tag" :class="{ primary: device.id === room.config.masterId }">{{ slotOf(room, device) }}</span>
              <strong>{{ device.id }}</strong>
              <span class="badge" :class="device.error || !device.enabled ? 'badge-danger' : device.working ? 'badge-success' : 'badge-muted'">{{ deviceStatus(device) }}</span>
            </div>
            <p class="slot-meta">{{ nameOf(room, device) }} · 模式：{{ String(device.mode || '手动') }} · 输出：{{ Number(device.value).toFixed(0) }}%</p>
            <div class="slot-controls">
              <button class="btn btn-sm" :class="{ 'btn-success': !device.working, 'btn-danger': device.working }" type="button" :disabled="(!device.working && (device.error || !device.enabled))" @click="toggle(device, nameOf(room, device))">
                <UiIcon :name="device.working ? 'Square' : 'Play'" :size="13" />{{ device.working ? '停止' : '启动' }}
              </button>
              <button class="btn btn-sm" type="button" :disabled="device.mode === '自动'" @click="setMode(device, nameOf(room, device), '自动')">自动</button>
              <button class="btn btn-sm" type="button" :disabled="device.mode === '手动'" @click="setMode(device, nameOf(room, device), '手动')">手动</button>
              <button class="btn btn-sm" type="button" @click="openDevice(device.id, 'fan')">参数</button>
              <button v-if="device.error || !device.enabled" class="btn btn-sm" type="button" @click="recover(device, nameOf(room, device))">复位</button>
              <button v-else class="btn btn-sm btn-warning" type="button" @click="drill(device, nameOf(room, device))">故障演练</button>
            </div>
          </div>
        </article>
      </div>
    </section>
    <p class="foot-note"><UiIcon name="Info" :size="14" />“{{ autoSettingItems.find(item => item.key === rooms[0]?.autoKey)?.label || '自动切换' }}”等自动策略在保存系统设置后持久化到浏览器；当前风机发生故障时，健康备机会自动接替（可在“系统设置 / 流程”中关闭）。</p>
  </div>
</template>

<style scoped>
.fan-settings { color: #405e75; }
.fan-counters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
.fan-counters > div { display: flex; align-items: center; justify-content: space-between; padding: 13px 18px; background: #f2f8fd; border: 1px solid #dce9f3; border-radius: 9px; }
.fan-counters small { color: #8ca1b2; font-size: 11px; }
.fan-counters strong { color: #4283ac; font-size: 23px; }
.fan-counters .green strong { color: #4f9d85; }
.fan-counters .orange strong { color: #c48b59; }
.source-note { margin: 0 0 16px; color: #879dad; font-size: 11px; line-height: 1.7; }
.source-note code { padding: 1px 4px; border-radius: 4px; background: #eef4fa; color: #35709c; }
.fan-room { padding: 17px 20px; margin-bottom: 15px; }
.room-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 13px; flex-wrap: wrap; }
.room-heading h3 { margin: 0 0 5px; color: #2f6f99; font-size: 15px; }
.room-heading p { margin: 0; font-size: 11px; color: #7d94a7; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.room-heading strong { color: #2d6f9b; }
.room-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.room-actions .btn { display: inline-flex; align-items: center; gap: 5px; }
.auto-toggle { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #6c879b; }
.auto-toggle input { accent-color: #4188b5; }
.fan-slots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
.fan-slot { display: flex; gap: 13px; padding: 13px; border: 1px solid #dfe9f2; border-radius: 9px; background: #f8fbfd; }
.fan-slot.running { border-color: #a9d6c4; background: #f2fbf7; }
.fan-slot.faulty { border-color: #ecc8c2; background: #fff7f4; }
.slot-visual { width: 86px; min-width: 86px; display: grid; place-items: center; background: white; border: 1px solid #e4edf5; border-radius: 8px; }
.slot-visual :deep(.device-visual) { min-height: 76px; height: 76px; }
.slot-body { min-width: 0; flex: 1; }
.slot-title { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-size: 12px; color: #3f6684; }
.slot-tag { padding: 2px 6px; border-radius: 4px; background: #e9f3fb; color: #3f7faa; font-size: 10px; }
.slot-tag.primary { background: #e4f0fa; color: #1f6d9e; }
.slot-title strong { font-family: Consolas, monospace; font-size: 12px; }
.slot-meta { margin: 7px 0 9px; font-size: 11px; color: #8299ab; }
.slot-controls { display: flex; flex-wrap: wrap; gap: 5px; }
.slot-controls .btn { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; padding: 5px 7px; }
.foot-note { display: flex; align-items: flex-start; gap: 7px; margin: 4px 0 0; padding: 10px 12px; border-radius: 6px; background: #eef5fc; color: #6c869b; font-size: 11px; line-height: 1.7; }
@media (max-width: 760px) { .fan-slots { grid-template-columns: 1fr; } .fan-counters { grid-template-columns: 1fr 1fr; } }
</style>
