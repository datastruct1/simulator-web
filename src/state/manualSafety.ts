import type { DeviceState } from '../types/piping'

export interface ManualSafetyWarning {
  id: string
  title: string
  message: string
  deviceIds: string[]
  source: string
}

/** WPF checks are advisory in the free sandbox; this function never operates devices. */
export function evaluateManualSafety(devices: Readonly<Record<string, DeviceState>>, safetyComplete: boolean): ManualSafetyWarning[] {
  const index = new Map(Object.values(devices).map(device => [device.id.toUpperCase(), device]))
  const get = (id: string) => index.get(id.toUpperCase())
  const open = (id: string) => (get(id)?.value ?? 0) > 0
  const connected = (id: string) => open(id) && get(id)?.working === true && get(id)?.connected !== false
  const warnings: ManualSafetyWarning[] = []
  const add = (id: string, title: string, message: string, deviceIds: string[], source: string) => warnings.push({ id, title, message, deviceIds, source })
  const check = (items: string) => `WPF CheckViewModel · ${items}`
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

  if (!safetyComplete) add('checklist', '安全检查尚未确认', '仪表、控制、切断和安全设备工作正常；参与作业的人员应熟悉操作程序。本模式允许跳过检查继续操作。', [], check('检查项 6、8'))

  const bunkering = ['V1002', 'M1002', 'V1602', 'M1602', 'M1102'].some(open) || get('FuelStation')?.working === true
  if (bunkering) {
    for (const id of ['Rg001', 'Rg002']) {
      const hose = get(id)
      if (!connected(id)) add(`connection:${id}`, `${id} 软管未连接`, '软管及管路应状态良好并正确连接。当前仍允许开阀和局部流动示意，不表示已形成完整加注通路。', [id], check('甲醇传输项 25'))
      else if (hose?.pressureTested !== true) add(`test:${id}`, `${id} 未确认泄漏测试`, '加注系统连接好后应经过泄漏测试，测试结果无泄漏。可继续操作，也可在软管设置中执行泄漏测试。', [id], check('甲醇传输项 26'))
    }
    const station = get('FuelStation')
    if (station?.grounded === false) add('grounding', '加注设施尚未接地', '已商定电气接地的模式；槽罐加注车应电气接地，且车轮被楔住。', ['FuelStation'], check('甲醇传输项 7、30'))
    if (station?.moored === false) add('mooring', '系泊 / 槽罐车就位尚未确认', '加注双方应就系泊和护舷安排达成协议，并确认槽罐车位置合适。', ['FuelStation'], check('检查项 9、槽罐车就位流程'))
    if (station?.emergencyStop === true && station.working === true) add('emergency-stop', '急停状态下继续供给', '急停信号和紧急切断程序应商定且经过测试。当前是自由试验中的强制供给，不表示真实急停已复位。', ['FuelStation'], check('甲醇传输项 15'))
    const fans = ['FanForPit1AMaster', 'FanForPit1ABackup']
    if (fans.some(id => get(id)) && !fans.some(id => get(id)?.working === true && get(id)?.error !== true)) add('ventilation', '燃料隔离空舱通风未运行', '检查通风设备状态；原 WPF 配置了主 / 备风机及异常切换。本模式仅提醒，不自动启动风机。', fans, 'WPF FanSettingViewModel / ErrorAutoTriggerService')
    const tank = get('T101')
    const capacity = tank?.currentCapacity, maximum = tank?.maxCapacity
    const ratio = finite(capacity) && finite(maximum) && maximum > 0 ? capacity / maximum : (tank?.value ?? 0) / 100
    if (ratio > .95) add('overfill', '燃料舱液位超过 95%', '受注船燃料舱应防止过充，持续监测舱容并正确设置报警装置。原 WPF 在超过 95% 时发出警报；本模式不自动关阀。', ['T101', 'Lit101', 'M1102', 'M1602'], 'WPF AutomationTicktock.CheckT101TankLevelAsync / 甲醇传输项 20')
  }

  const pressure = get('Pit101')
  if (finite(pressure?.value) && pressure.value > 16 && !open('B11')) add('pressure-relief', '燃料舱压力高，B11 尚未打开', '原 WPF 自动控制规则在 Pit101 > 16 时打开 B11，并在低于 14 时关闭。自由模式只提示，不替你改变阀门。', ['Pit101', 'B11'], 'WPF 自动控制Ruleset · Pit101 > 16')
  if (get('P101')?.error === true && get('P102')?.error === true && open('M1201')) add('dual-pump', '供应泵全故障，M1201 仍开启', '原 WPF 在两台供应泵全部故障时自动关闭 M1201。本模式保留你的操作，只提示故障风险。', ['P101', 'P102', 'M1201'], 'WPF ErrorAutoTriggerService · 燃料供应泵全坏后自动断流')

  for (const device of new Set(index.values())) {
    const operated = ['valve', 'hose'].includes(device.kind || '') ? (device.value ?? 0) > 0 : device.working === true
    if (operated && (device.error === true || device.enabled === false)) add(`device:${device.id}`, `${device.id} 故障 / 锁定状态下操作`, '仪表、控制、切断和安全设备应工作正常。自由模式允许强制操作，原故障标记保留，不会自动复位。', [device.id], check('检查项 6、甲醇传输项 18'))
    if (operated && ['pump', 'fan', 'engine', 'heater'].includes(device.kind || '') && (device.powered === false || device.hasContent === false || device.hasFuel === false)) add(`supply:${device.id}`, `${device.id} 运行条件不足`, '设备未通电或缺少入口介质 / 燃料。当前允许启停及流动示意，不能将动画视为真实设备运行。', [device.id], 'WPF PumpViewModel / EngineViewModel · 通电、入口介质和燃料状态')
    if (device.leaking === true) add(`leak:${device.id}`, `${device.id} 存在泄漏标记`, '加注系统泄漏测试结果应无泄漏；甲醇探测设备应运行良好。建议停止供给、隔离并处置泄漏，但本模式不强制停机。', [device.id], check('甲醇传输项 21、26'))
    if (device.kind !== 'sensor' || !finite(device.value) || device.alarmEnabled === false) continue
    const threshold = finite(device.highHigh) ? device.highHigh : device.highTrigger
    if (finite(threshold) && device.value >= threshold) add(`high:${device.id}`, `${device.id} 达到高高阈值`, `测量值 ${device.value} 达到设定 ${threshold}。应检查切断和安全设备；本模式只提示，不自动改变设备。`, [device.id], 'WPF SensorViewModel 高高触发 / 传感器原配置')
  }
  return warnings
}
