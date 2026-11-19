export type MediumId =
  | 'empty'
  | 'air'
  | 'methanol'
  | 'nitrogen'
  | 'cold-water'
  | 'hot-water'
  | 'water-glycol'
  | 'cold-water-glycol'
  | 'hot-water-glycol'

export interface MediaDef {
  id: MediumId
  label: string
  color: string
  flowColor: string
}

export interface RouteSegment {
  pipe: string
  forward: boolean
}

export interface PipeRoute {
  from: string
  to: string
  segments: RouteSegment[]
}

export interface FlowSource {
  kind: 'root' | 'boundary'
  node: string
  medium: MediumId
  /** For a root: restrict the first hop to this neighbour. For a boundary: the terminal node that feeds `node`. */
  via?: string
  terminal?: string
}

export interface ActivePipe {
  pipe: string
  medium: MediumId
  /** Animation-authored direction; the rule engine recomputes forward from propagation x rule.forward. */
  flowForward: boolean
}

/** One WPF animation list with its own valve/device/path gates. */
export interface FlowAnimationGroup {
  id: string
  activePipes: ActivePipe[]
  valves: string[]
  runningDevices: string[]
  tripleValve?: { node: string; path: 'exchanger' | 'bypass' }
  notes?: string
}

export interface FlowProfile {
  id: string
  name: string
  medium: MediumId
  sources: FlowSource[]
  pumps: string[]
  activePipes: ActivePipe[]
  animationGroups: string[]
  notes?: string
}

export interface PipingTopology {
  schemaVersion: number
  media: MediaDef[]
  substanceType: Record<string, MediumId>
  routes: PipeRoute[]
  aliases: Record<string, string>
  canonicalPipes: Record<string, string>
  virtualSources: string[]
  sinkTanks: string[]
  flowProfiles: Record<string, FlowProfile>
  /** Optional only for legacy/custom topologies authored before group-level gates. */
  flowGroups?: Record<string, FlowAnimationGroup>
  extraProfiles: Record<string, FlowProfile>
  sourceNotes: string[]
  audit: Record<string, unknown>
}

/** Structural view of a simulator device; the engine only reads, never mutates. */
export interface DeviceState {
  id: string
  kind?: string
  value?: number
  working?: boolean
  error?: boolean
  enabled?: boolean
  connected?: boolean
  [key: string]: unknown
}

export interface PipingResolveOptions {
  flowId: string
  running: boolean
  /** Free manual preview uses this demo's authored media and flow directions. */
  manualFlowId?: string
}

export interface PipeVisualState {
  pipeId: string
  medium: MediumId
  filled: boolean
  flowing: boolean
  forward: boolean
  sourceId?: string
  blockedBy?: string
}

export interface PipingConflict {
  pipe: string
  media: MediumId[]
  winner: MediumId
  winnerSource: string
}

export interface PipingSummary {
  flowId: string
  running: boolean
  medium: MediumId
  pumpsOk: boolean
  filledCount: number
  flowingCount: number
  blockedCount: number
  conflicts: PipingConflict[]
  sources: string[]
  warnings?: string[]
}

export interface PipingResult {
  pipes: Record<string, PipeVisualState>
  summary: PipingSummary
}
