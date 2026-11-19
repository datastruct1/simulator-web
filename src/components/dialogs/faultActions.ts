import { useSimulator } from '../../state/simulator'
import type { DeviceState } from '../../types/simulator'
import { fanRooms, faultKinds } from '../../data/tools'
import { clone, deviceView, numberValue, checkSensorAlarms } from './toolHelpers'

export type FaultType = typeof faultKinds[number]['id']
export function injectConfiguredFault(id: string, type: FaultType, value = 0, message = '') {
  const { state, ensureDevice, setDevice, injectFault, record, isFreeManual } = useSimulator()
  const view = deviceView(id)
  const device = ensureDevice(view.id, view.kind, view.name)
  const old = device.faultBackup && typeof device.faultBackup === 'object' ? device.faultBackup : {
    value: device.value, working: device.working, enabled: device.enabled, frozen: Boolean(device.frozen), mode: device.mode,
  }
  const description = message.trim() || faultKinds.find(fault => fault.id === type)?.name || '设备故障'
  // Fault configuration is an explicit privileged local operation; retain a recoverable baseline.
  setDevice(device.id, { enabled: true, faultBackup: clone(old) }, false)
  if (type === 'freeze') setDevice(device.id, { value, frozen: true }, false)
  if (type === 'bias') setDevice(device.id, { value: Math.max(view.min, Math.min(view.max, device.value + value)), frozen: true, bias: value }, false)
  if (type === 'stuck') setDevice(device.id, { value, direction: '', frozen: false }, false)
  injectFault(device.id, description)
  setDevice(device.id, { faultType: type, faultMessage: description, faultTime: new Date().toLocaleString('zh-CN',{hour12:false}),
    enabled: !['disabled','stuck'].includes(type), leaking: type === 'leak', frozen: ['freeze','bias'].includes(type) }, false)
  const fanRoom = fanRooms.find(room => room.masterId.toLowerCase() === device.id.toLowerCase() || room.backupId.toLowerCase() === device.id.toLowerCase())
  if (fanRoom) {
    const setting = fanRoom.sensorId === 'Pit7A' ? 'autoNitrogenFan' : fanRoom.sensorId === 'Pit1A' ? 'autoCofferdamFan' : 'autoPreparationFan'
    const backupId = fanRoom.masterId.toLowerCase() === device.id.toLowerCase() ? fanRoom.backupId : fanRoom.masterId
    const backup = ensureDevice(backupId,'fan',`${fanRoom.name}备用风机`)
    if (!isFreeManual() && state.settings[setting] !== false && !backup.error && backup.enabled) {
      setDevice(backup.id,{working:true,value:100,startRequested:true},false)
      record(`风机异常自动切换：${device.id} → ${backup.id}`,backup.id)
      const pressure = ensureDevice(fanRoom.sensorId,'sensor')
      if (!pressure.frozen) setDevice(pressure.id,{value:-70},false)
    }
  }
  if (view.kind === 'sensor') checkSensorAlarms(device)
}
export function resetConfiguredFault(id: string) {
  const { ensureDevice, setDevice, clearFault, record } = useSimulator()
  const device = ensureDevice(id)
  const backup = device.faultBackup && typeof device.faultBackup === 'object' ? device.faultBackup as Partial<DeviceState> : undefined
  clearFault(device.id)
  const motor = ['pump','fan','engine','heater','station'].includes(device.kind)
  setDevice(device.id, { enabled:true, error:false, frozen:false, leaking:false, bias:0, faultType:'', faultMessage:'', faultTime:'', faultBackup:null,
    ...(backup?.value !== undefined ? {value:numberValue(backup.value)} : {}), ...(motor ? {working:false,value:0,startRequested:false} : {working:numberValue(backup?.value,device.value)>0}) },false)
  record('解除设备锁定 / 冻结并复位异常；动力设备保持停止',device.id)
}
