export type SceneId = 'overview' | 'nitrogen' | 'bunkering-front' | 'bunkering' | 'fuel-tank' | 'lfss' | 'engine' | 'water' | 'recovery' | 'control'

export type SceneNodeKind =
  | 'pipe' | 'hose' | 'valve' | 'pump' | 'fan' | 'engine' | 'sensor'
  | 'tank' | 'water-tank' | 'nitrogen-cylinder' | 'balance-tank'
  | 'heater' | 'filter' | 'dual-filter' | 'station' | 'level'
  | 'gauge' | 'digital-gauge' | 'control-button' | 'button' | 'led'
  | 'knob' | 'slider' | 'checkbox' | 'input' | 'text' | 'shape' | 'region' | 'image'

export type SceneAttribute = string | number | boolean | null | string[] | number[]

export interface SceneRect {
  x: number
  y: number
  width: number
  height: number
}

/** Coordinates are the original WPF DIP coordinates, after parent layout. */
export interface SceneNode extends SceneRect {
  id: string
  kind: SceneNodeKind
  label: string
  deviceId?: string
  /** Original RelayCommand property name, e.g. StartPumpCommand / 导航命令. */
  command?: string
  /** Original CommandParameter, also retained in attributes.commandParameter. */
  commandParameter?: string | number
  /** Optional clockwise transform, around the allocated rectangle's centre. */
  rotate?: number
  /** Shared original XAML Path/Viewbox symbol, not a redrawn approximation. */
  symbol?: string
  /** Short literal visual properties and resolved Binding paths (no XAML markup). */
  attributes?: Record<string, SceneAttribute>
}

/** Deliberately independent of the application's central state. */
export interface SceneDevice {
  id: string
  name: string
  kind: string
  value: number
  unit: string
  working: boolean
  error: boolean
  enabled: boolean
  mode: string
  min: number
  max: number
  connected?: boolean
  [key: string]: unknown
}

export interface SceneRegion extends SceneRect {
  id: string
  label: string
}

export interface SceneStats {
  nodes: number
  devices: number
  interactive: number
  pipes: number
  valves: number
  sensors: number
  popupsExcluded: number
  duplicatesRemoved: number
  unresolvedTextExcluded: number
}

export interface SceneDefinition {
  id: SceneId
  title: string
  source: string
  width: number
  height: number
  background: string
  nodes: SceneNode[]
  regions: SceneRegion[]
  stats: SceneStats
  unsupported: Record<string, number>
}

export interface SceneVector {
  viewBox: string
  paths: { d: string; fill: string; stroke?: string }[]
}

export interface SceneArchive {
  version: number
  coordinateSystem: string
  sources: Record<string, string>
  symbols: Record<string, SceneVector>
  scenes: Record<SceneId, SceneDefinition>
}
