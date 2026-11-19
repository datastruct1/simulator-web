import type { DeviceState, FlowRule } from '../types/simulator.ts'

export function isDeviceId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 150 && !/\s|[\u0000-\u001f]/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id)
}

export function inferDeviceKind(id: string): string {
  const name = id.toLowerCase()
  if (name.startsWith('fan')) return 'fan'
  if (name.startsWith('engine')) return 'engine'
  if (/^p\d+$/.test(name)) return 'pump'
  if (/^(pit|tit|lit|dit|di|do|fit)/.test(name)) return 'sensor'
  if (name.startsWith('rg')) return 'hose'
  if (/^t\d+$/.test(name) || name.includes('tank')) return 'tank'
  if (name.includes('pipe')) return 'pipe'
  return 'valve'
}

export function createDevice(id: string, kind = inferDeviceKind(id), name = id): DeviceState {
  if (!isDeviceId(id)) throw new Error('设备编号无效。')
  const sensor = kind === 'sensor'
  const temperature = /^tit/i.test(id)
  const oxygen = /^(do|di)/i.test(id)
  return {
    id, name, kind, value: temperature ? 23.5 : oxygen ? 0.21 : 0,
    unit: sensor ? temperature ? '°C' : /^pit/i.test(id) ? 'MPa' : /^lit/i.test(id) ? 'mm' : oxygen ? '体积分数' : 'L/min' : ['valve', 'tank'].includes(kind) ? '%' : '',
    working: false, error: false, enabled: true, mode: '手动',
    min: temperature ? -20 : 0, max: sensor ? temperature ? 80 : oxygen ? 1 : /^lit/i.test(id) ? 3000 : 10 : 100,
  }
}

export function evaluateRule(rule: FlowRule, devices: Record<string, DeviceState>): boolean {
  const names = rule.name.trim().split(/\s+/).filter(Boolean)
  if (!names.length) return true
  return names.every(id => {
    if (!isDeviceId(id)) return false
    const device = (Object.hasOwn(devices, id) ? devices[id] : undefined) ?? Object.values(devices).find(d => d.id.toLowerCase() === id.toLowerCase())
    if (!device) return false
    const on = ['pump', 'fan', 'engine', 'heater'].includes(device.kind) ? device.working : device.value > 0
    if (rule.type === 'ValveClose' || rule.type === 'DeviceClose') return !on
    if ((rule.type === 'EqualsTo' || rule.type === 'EqualTo') && rule.value === 0) return device.value === 0
    if (device.error || !device.enabled) return false
    switch (rule.type) {
      case 'ValveOpen': case 'DeviceOpen': return on
      case 'LessThan': return rule.value === undefined || device.value < rule.value
      case 'GreaterThan': return rule.value === undefined || device.value > rule.value
      case 'EqualsTo': case 'EqualTo': return rule.value === undefined || Math.abs(device.value - rule.value) < 0.0001
      default: return false
    }
  })
}

export function rulePatch(rule: FlowRule, device: DeviceState): Partial<DeviceState> {
  const motor = ['pump', 'fan', 'engine', 'heater'].includes(device.kind)
  switch (rule.type) {
    case 'ValveOpen': case 'DeviceOpen': return motor ? { working: true, value: 100 } : { value: 100, working: true }
    case 'ValveClose': case 'DeviceClose': return { value: 0, working: false }
    case 'EqualsTo': case 'EqualTo': return { value: rule.value ?? device.value, working: (rule.value ?? device.value) > 0 }
    case 'GreaterThan': return { value: rule.value === undefined ? device.value : rule.value + Math.max(Math.abs(rule.value) * 0.01, 0.001) }
    case 'LessThan': return { value: rule.value === undefined ? device.value : Math.max(device.min, rule.value - Math.max(Math.abs(rule.value) * 0.01, 0.001)) }
    default: return {}
  }
}

export function validateSnapshot(data: unknown): { devices: Record<string, Partial<DeviceState>>; name: string; elapsed: number } {
  if (!data || typeof data !== 'object') throw new Error('工况文件必须是 JSON 对象。')
  const input = data as Record<string, unknown>
  if (input.schemaVersion !== 1 || !input.devices || typeof input.devices !== 'object' || Array.isArray(input.devices)) {
    throw new Error('不支持的工况格式，请选择本 Web 版本导出的工况文件。')
  }
  const entries = Object.entries(input.devices)
  if (!entries.length || entries.length > 10000) throw new Error('工况中的设备数量不合法。')
  const devices: Record<string, Partial<DeviceState>> = Object.create(null)
  for (const [id, raw] of entries) {
    if (!isDeviceId(id)) throw new Error('工况含不合法设备编号。')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`设备 ${id} 的工况数据不合法。`)
    const item = raw as Record<string, unknown>
    if (typeof item.value !== 'number' || !Number.isFinite(item.value)) throw new Error(`设备 ${id} 的数值必须是有限数字。`)
    if (typeof item.working !== 'boolean' || typeof item.enabled !== 'boolean' || typeof item.error !== 'boolean') throw new Error(`设备 ${id} 的状态字段不合法。`)
    const result: Partial<DeviceState> = { value: item.value, working: item.working, enabled: item.enabled, error: item.error }
    const numberKeys = ['min', 'max', 'rpm', 'power', 'load', 'flow', 'targetTemperature', 'heatingPower', 'length', 'diameter', 'maxCapacity', 'currentCapacity', 'area', 'tankPressure', 'tankTemperature', 'oxygen', 'setPressure', 'differentialPressure', 'bias']
    const nullableKeys = ['lowLow', 'low', 'high', 'highHigh', 'lowTrigger', 'lowAlert', 'highAlert', 'highTrigger']
    const booleanKeys = ['frozen', 'alarmEnabled', 'powered', 'startRequested', 'hasContent', 'hasFuel', 'connected', 'pressureTested', 'purged', 'grounded', 'moored', 'emergencyStop', 'leaking', 'canSupply']
    const stringKeys = ['name', 'kind', 'unit', 'mode', 'duty', 'fuelMode', 'engineState', 'heatingMode', 'medium', 'from', 'to', 'sourceType', 'activeFilter', 'filterState', 'valveType', 'direction', 'room', 'sensorType', 'faultType']
    for (const key of [...numberKeys, ...nullableKeys]) {
      if (!Object.hasOwn(item, key)) continue
      const value = item[key]
      if (nullableKeys.includes(key) && value === null) result[key] = null
      else if (typeof value === 'number' && Number.isFinite(value)) result[key] = value
      else throw new Error(`设备 ${id} 的 ${key} 参数不合法。`)
    }
    for (const key of booleanKeys) {
      if (!Object.hasOwn(item, key)) continue
      if (typeof item[key] !== 'boolean') throw new Error(`设备 ${id} 的 ${key} 参数必须为布尔值。`)
      result[key] = item[key]
    }
    for (const key of stringKeys) {
      if (!Object.hasOwn(item, key)) continue
      if (typeof item[key] !== 'string' || (item[key] as string).length > 300) throw new Error(`设备 ${id} 的 ${key} 参数不合法。`)
      result[key] = item[key]
    }
    if (typeof result.min === 'number' && typeof result.max === 'number' && result.min >= result.max) throw new Error(`设备 ${id} 的量程下限必须小于上限。`)
    devices[id] = result
  }
  return { devices, name: typeof input.name === 'string' ? input.name : '导入工况', elapsed: typeof input.elapsed === 'number' && Number.isFinite(input.elapsed) && input.elapsed >= 0 ? input.elapsed : 0 }
}
