import { onMounted, onUnmounted, reactive, watch, type WatchStopHandle } from 'vue'
import { useSimulator } from '../../state/simulator'
import { checkSensorAlarms, findDevice } from './toolHelpers'

export interface TrendPoint { time: number; value: number; elapsed?: number }
export interface TrendSeries { name: string; points: readonly TrendPoint[]; color?: string; unit?: string }
const histories = reactive<Record<string, TrendPoint[]>>({})
let users = 0
let stopWatch: WatchStopHandle | undefined
let timer: ReturnType<typeof setInterval> | undefined
let lastSample = 0
let revision = 0

export function historyFor(id: string): TrendPoint[] {
  const key = findDevice(id)?.id || id
  return histories[key] ?? (histories[key] = [])
}
export function sampleHistory(force = false) {
  const { state } = useSimulator()
  const now = Date.now()
  if (!force && now - lastSample < 150) return
  lastSample = now
  for (const device of new Set(Object.values(state.devices))) {
    const points = historyFor(device.id)
    const previous = points[points.length - 1]
    if (!previous || force || previous.value !== device.value || previous.elapsed !== state.elapsed) {
      points.push({ time: now, value: device.value, elapsed: state.elapsed })
      if (points.length > 900) points.splice(0, points.length - 900)
    }
    if (['sensor', 'gauge', 'digital-gauge'].includes(device.kind)) checkSensorAlarms(device)
  }
}
export function clearHistory(id?: string) {
  if (id) histories[findDevice(id)?.id || id] = []
  else for (const key of Object.keys(histories)) histories[key] = []
  revision++
  sampleHistory(true)
}
export function historyRevision() { return revision }
export function useHistoryRecorder() {
  onMounted(() => {
    users++
    if (users !== 1) return
    const { state } = useSimulator()
    sampleHistory(true)
    // Record real central-state changes, not random synthetic chart data.
    stopWatch = watch(() => [state.elapsed, Object.values(state.devices).map(device => [device.id, device.value, device.working, device.alarmEnabled])], () => sampleHistory(), { deep: true })
    timer = setInterval(() => { if (!state.paused) sampleHistory() }, 1000)
  })
  onUnmounted(() => {
    users = Math.max(0, users - 1)
    if (users) return
    stopWatch?.()
    stopWatch = undefined
    if (timer) clearInterval(timer)
    timer = undefined
  })
}
