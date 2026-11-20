import type { SceneDevice } from '../../types/scene'
import type { PipeVisualState } from '../../types/piping'
import { canonicalPipeId } from '../../state/pipingEngine'
import { normalizedDeviceId } from './scenes'
import type { PipeDrawing } from './pipingGeometry'

/** Display-only adjustments; this function never adds fluid connections. */
export function resolvePipeDrawing(drawing: PipeDrawing, states: Readonly<Record<string, PipeVisualState>>, devices: Readonly<Record<string, SceneDevice>>, running: boolean, freeManual = false): Record<string, PipeVisualState> {
  const result: Record<string, PipeVisualState> = Object.create(null)
  const lookup = new Map(Object.entries(devices).flatMap(([id, device]) => [[normalizedDeviceId(id), device], [normalizedDeviceId(device.id), device]] as [string, SceneDevice][]))
  for (const geometry of drawing.pipes) {
    const id = geometry.pipeId ? canonicalPipeId(geometry.pipeId) : `connector:${geometry.id}`
    const source = states[id]
    const state: PipeVisualState = source ? { ...source } : { pipeId: id, medium: 'empty', filled: false, flowing: false, forward: true }
    const overviewHose = geometry.soft && geometry.node.id.startsWith('overview-') ? ({ '29': 'Rg001', '34': 'Rg002', '52': 'Rg003' } as Record<string, string>)[geometry.pipeId || ''] : undefined
    const controllerId = overviewHose || geometry.node.deviceId
    const controller = controllerId ? lookup.get(normalizedDeviceId(controllerId)) as (SceneDevice & { connected?: boolean }) | undefined : undefined
    if (geometry.node.kind === 'hose' && controller && (geometry.soft || /^rg\d+$/i.test(controller.id))) {
      if (controller.connected === false || (!freeManual && (controller.enabled === false || controller.error === true)) || controller.working !== true || !(controller.value > 0)) {
        state.medium = 'empty'; state.filled = false; state.flowing = false; state.blockedBy = controller.id; state.hoseDisconnected = true
      }
    }
    state.flowing = running && state.flowing && state.filled && state.medium !== 'empty'
    result[geometry.id] = state
  }
  // Old WPF elbow shims without IDs may finish a *drawn* joint. Colour them
  // only when both mapped neighbours already contain the same medium. This
  // never propagates media across the joint or invents an unmapped route.
  for (const geometry of drawing.pipes) {
    if (geometry.pipeId || geometry.neighbours.length < 2) continue
    const neighbours = geometry.neighbours.map(id => result[id]).filter((state): state is PipeVisualState => !!state)
    const first = neighbours[0]
    if (first && neighbours.length >= 2 && neighbours.every(state => state.filled && state.medium === first.medium)) {
      result[geometry.id] = { ...first, pipeId: `connector:${geometry.id}`, flowing: running && neighbours.every(state => state.flowing) }
    }
  }
  return result
}
