import generated from '../../data/scenes.generated.json'
import type { SceneArchive, SceneDefinition, SceneDevice, SceneId, SceneNode, SceneStats } from '../../types/scene'
import { finiteGaugeNumber, gaugeValueScale } from './gauge'

const archive = generated as unknown as SceneArchive

// The left-of-canvas H1241/H1242/H1243 branch is a redundant diagram fragment
// in the nitrogen page (dev-pic/pic1.png). Remove its drawings only: keep the
// imported archive, global piping definitions and all other device controls.
const redundantNitrogenNodes = new Set([
  'nitrogen-pipe-13', 'nitrogen-pipe-14', 'nitrogen-pipe-15',
  'nitrogen-pipe-23', 'nitrogen-pipe-24', 'nitrogen-text-2',
  'nitrogen-valve-9', 'nitrogen-valve-10', 'nitrogen-valve-11',
])
const nitrogen = archive.scenes.nitrogen
const nitrogenNodes = nitrogen.nodes.filter(node => !redundantNitrogenNodes.has(node.id))

/** Imported scenes with explicit, page-local presentation cleanup. */
export const scenes: SceneArchive['scenes'] = {
  ...archive.scenes,
  nitrogen: {
    ...nitrogen,
    nodes: nitrogenNodes,
    stats: {
      ...nitrogen.stats,
      nodes: nitrogenNodes.length,
      devices: new Set(nitrogenNodes.filter(node => !['pipe', 'hose'].includes(node.kind)).map(node => node.deviceId).filter(Boolean)).size,
      interactive: nitrogenNodes.filter(isInteractiveNode).length,
      pipes: nitrogenNodes.filter(node => ['pipe', 'hose'].includes(node.kind)).length,
      valves: nitrogenNodes.filter(node => node.kind === 'valve').length,
    },
  },
}
export const sceneVectors = archive.symbols
export const sceneSources = archive.sources
export const sceneIds = Object.keys(scenes) as SceneId[]

export function getScene(id: string): SceneDefinition {
  return scenes[id as SceneId] ?? scenes.overview
}

export const sceneStatistics = Object.fromEntries(sceneIds.map(id => [id, scenes[id].stats])) as Record<SceneId, SceneStats>

export function sceneStats(id?: string): SceneStats {
  if (id) return getScene(id).stats
  const totals: SceneStats = { nodes: 0, devices: 0, interactive: 0, pipes: 0, valves: 0, sensors: 0, popupsExcluded: 0, duplicatesRemoved: 0, unresolvedTextExcluded: 0 }
  for (const scene of Object.values(scenes)) {
    for (const key of Object.keys(totals) as (keyof SceneStats)[]) totals[key] += scene.stats[key]
  }
  totals.devices = new Set(Object.values(scenes).flatMap(scene => scene.nodes.filter(node => !['pipe', 'hose'].includes(node.kind)).map(node => node.deviceId).filter(Boolean))).size
  return totals
}

export function sceneDeviceIds(id?: string): string[] {
  const selected = id ? [getScene(id)] : Object.values(scenes)
  return [...new Set(selected.flatMap(scene => scene.nodes.map(node => node.deviceId).filter((value): value is string => !!value)))].sort()
}

/** WPF bindings mix PIT101/Pit101 and P-101/P101; match all consistently. */
export function normalizedDeviceId(id: string): string {
  return id.replace(/[\s_-]/g, '').toLocaleLowerCase()
}

export function nodeAttribute(node: SceneNode, key: string, fallback = ''): string {
  const value = node.attributes?.[key]
  return value === undefined || value === null ? fallback : String(value)
}

export function nodeNumber(node: SceneNode, key: string, fallback = 0): number {
  return finiteGaugeNumber(node.attributes?.[key], fallback)
}

export function nodeValue(node: SceneNode, device?: SceneDevice): number {
  const value = finiteGaugeNumber(device?.value, nodeNumber(node, 'value', 0))
  return finiteGaugeNumber(value * gaugeValueScale(node, device))
}

export function nodeUnit(node: SceneNode, device?: SceneDevice): string {
  return nodeAttribute(node, 'unit', nodeAttribute(node, 'popupUnit', device?.unit ?? ''))
}

/** Bound ranges use the same display-unit conversion as the reading. */
export function nodeRange(node: SceneNode, device?: SceneDevice): { min: number; max: number } {
  const scale = gaugeValueScale(node, device)
  return { min: nodeNumber(node, 'min', finiteGaugeNumber(device?.min) * scale), max: nodeNumber(node, 'max', finiteGaugeNumber(device?.max, 100) * scale) }
}

export function isInteractiveNode(node: SceneNode): boolean {
  return Boolean(node.deviceId || node.command || ['control-button', 'slider', 'input', 'checkbox', 'knob'].includes(node.kind))
}
