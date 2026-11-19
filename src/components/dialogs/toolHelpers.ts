import { sensorDefinitions, valveDefinitions, deviceKindLabels, type SensorDefinition } from '../../data/tools'
import { useSimulator } from '../../state/simulator'
import type { DeviceState } from '../../types/simulator'
import { normalizedDeviceId } from '../scene/scenes'
import { gaugeVisualKind } from '../scene/gauge'

export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
export function numberValue(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}
export function nullableNumber(value: unknown): number | null {
  return value === '' || value === null || value === undefined ? null : numberValue(value, Number.NaN)
}
export function findDevice(id: string): DeviceState | undefined {
  const { state } = useSimulator()
  return state.devices[id] ?? Object.values(state.devices).find(device => normalizedDeviceId(device.id) === normalizedDeviceId(id))
}
export function sensorDefinition(id: string): SensorDefinition | undefined {
  return sensorDefinitions.find(sensor => normalizedDeviceId(sensor.id) === normalizedDeviceId(id))
}
export function deviceView(id: string, kind?: string, name?: string): DeviceState {
  const existing = findDevice(id)
  const sensor = sensorDefinition(id)
  const valve = valveDefinitions.find(item => item.id.toLowerCase() === id.toLowerCase())
  const actualKind = sensor || existing?.kind === 'sensor' || gaugeVisualKind({ kind: kind || existing?.kind }) ? 'sensor' : kind || existing?.kind || 'valve'
  const title = name || sensor?.name || valve?.name || existing?.name || id
  return {
    id, value: 0, unit: sensor?.unit ?? (actualKind === 'valve' ? '%' : ''),
    working: false, error: false, enabled: true, mode: '手动', min: sensor?.min ?? 0, max: sensor?.max ?? 100,
    ...existing,
    kind: actualKind,
    name: existing?.name && existing.name !== existing.id ? existing.name : title,
    // Definitions supply defaults, never overwrite values/units/ranges edited in central state.
    ...(sensor ? { room: existing?.room ?? sensor.room, sensorType: existing?.sensorType ?? sensor.sensorType } : {}),
    ...(valve ? { valveType: valve.valveType || valve.section, size: valve.size, pressure: valve.pressure, material: valve.material, certificate: valve.certificate } : {}),
  }
}
export function kindLabel(kind: string): string { return deviceKindLabels[kind] || kind }
export function deviceStatus(device: DeviceState): string {
  if (!device.enabled) return '操作锁定'
  if (device.error) return '运行异常'
  if (device.frozen) return '数值冻结'
  if (['sensor', 'gauge', 'digital-gauge'].includes(device.kind)) return '监测正常'
  if (['valve', 'hose', 'pipe'].includes(device.kind)) return device.value > 0 ? '开启 / 连通' : '关闭 / 断开'
  return device.working ? '正常运行' : '停止'
}
export function devicePage(device: DeviceState): string {
  const room = String(device.room || sensorDefinition(device.id)?.room || '')
  if (room.includes('氮气')) return 'nitrogen'
  if (room.includes('燃料舱') || room.includes('隔离')) return 'fuel-tank'
  if (room.includes('准备')) return 'lfss'
  if (room.includes('发动机')) return 'engine'
  if (room.includes('水')) return 'water'
  if (room.includes('回收')) return 'recovery'
  if (room === '加注站') return 'bunkering-front'
  if (room.includes('加注')) return 'bunkering'
  const digit = /^[VDHMCA]1([1-7])/i.exec(device.id)?.[1]
  return ({ '1': 'fuel-tank', '2': 'lfss', '3': 'engine', '4': 'water', '5': 'recovery', '6': 'bunkering-front', '7': 'nitrogen' } as Record<string, string>)[digit || ''] || 'overview'
}
export function locateDevice(id: string) {
  const { state, navigate, closeModal, record } = useSimulator()
  const device = deviceView(id)
  state.highlightId = device.id
  navigate(devicePage(device))
  closeModal()
  record('高亮查看设备', device.id)
}
export function openDevice(id: string, kind?: string) {
  const { openModal } = useSimulator()
  const device = deviceView(id, kind)
  openModal('device', `${device.id} · ${device.name}`, { id: device.id, kind: kind || device.kind })
}
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  // Neutralize spreadsheet formulas in user-supplied cells while preserving real numeric values.
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? '' : String(value)
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  const body = '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')
  downloadText(filename.endsWith('.csv') ? filename : `${filename}.csv`, body, 'text/csv;charset=utf-8')
}
export function downloadText(filename: string, body: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}
export async function readJsonFile(event: Event, maxBytes = 10 * 1024 * 1024): Promise<unknown | undefined> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return undefined
  try {
    if (file.size > maxBytes) throw new Error(`文件大于 ${Math.round(maxBytes / 1024 / 1024)} MB，请选择较小的 JSON 文件。`)
    return JSON.parse((await file.text()).replace(/^\uFEFF/, '')) as unknown
  } finally { input.value = '' }
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : '文件内容无法读取。' }

export const thresholdLabels = [
  { key: 'lowLow', label: '低低切断或投入' }, { key: 'low', label: '低报警点' },
  { key: 'high', label: '高报警点' }, { key: 'highHigh', label: '高高切断' },
] as const
export type ThresholdKey = typeof thresholdLabels[number]['key']
export interface SensorConfiguration {
  lowLow: number | null
  low: number | null
  high: number | null
  highHigh: number | null
  alarmEnabled: boolean
}
export function sensorConfiguration(sensor: SensorDefinition): SensorConfiguration {
  const device = findDevice(sensor.id)
  return {
    lowLow: device?.lowLow !== undefined ? nullableNumber(device.lowLow) : sensor.lowLow,
    low: device?.low !== undefined ? nullableNumber(device.low) : sensor.low,
    high: device?.high !== undefined ? nullableNumber(device.high) : sensor.high,
    highHigh: device?.highHigh !== undefined ? nullableNumber(device.highHigh) : sensor.highHigh,
    alarmEnabled: device?.alarmEnabled !== false,
  }
}
export function thresholdErrors(config: SensorConfiguration, min: number, max: number): string[] {
  const errors: string[] = []
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return ['量程下限必须小于上限。']
  for (const threshold of thresholdLabels) {
    const value = config[threshold.key]
    if (value !== null && (!Number.isFinite(value) || value < min || value > max)) errors.push(`${threshold.label}超出量程 ${min}～${max}。`)
  }
  const values = thresholdLabels.map(threshold => config[threshold.key]).filter((value): value is number => value !== null)
  if (values.some((value, index) => index > 0 && value < values[index - 1]!)) errors.push('报警阈值应按低低 ≤ 低 ≤ 高 ≤ 高高排列。')
  return errors
}

export function checkSensorAlarms(device: DeviceState) {
  // Only explicitly configured sensors raise alerts here; uninitialized diagram symbols are not treated as measurements.
  if (device.alarmEnabled !== true || device.enabled === false) return
  const { state, record } = useSimulator()
  const lowLow = nullableNumber(device.lowLow), low = nullableNumber(device.low)
  const high = nullableNumber(device.high), highHigh = nullableNumber(device.highHigh)
  const conditions = [
    { active: lowLow !== null && device.value <= lowLow, label: '低低切断或投入', value: lowLow, level: '严重' as const },
    { active: low !== null && device.value <= low, label: '低报警', value: low, level: '警告' as const },
    { active: high !== null && device.value >= high, label: '高报警', value: high, level: '警告' as const },
    { active: highHigh !== null && device.value >= highHigh, label: '高高切断', value: highHigh, level: '严重' as const },
  ]
  for (const condition of conditions) {
    if (!condition.active) continue
    const code = `${device.id} · ${condition.label}`
    if (state.alarms.some(alarm => alarm.deviceId === device.id && alarm.message.startsWith(code) && !alarm.acknowledged)) continue
    state.alarms.unshift({ id: `sensor-${Date.now()}-${condition.label}-${device.id}`, time: new Date().toLocaleString('zh-CN', { hour12: false }), deviceId: device.id,
      level: condition.level, message: `${code}：${device.value.toFixed(2)} ${device.unit}（设定 ${condition.value}）`, acknowledged: false })
    record(`${condition.label}：测量值 ${device.value} ${device.unit}`, device.id, condition.level)
  }
}
