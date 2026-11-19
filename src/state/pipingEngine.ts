// Pure piping rule engine: computes per-pipe medium / fill / flow from the
// imported WPF topology and a device snapshot. It never mutates `devices`.
import { pipingTopology } from '../data/piping'
import type {
  ActivePipe,
  DeviceState,
  FlowAnimationGroup,
  FlowProfile,
  FlowSource,
  MediumId,
  PipeRoute,
  PipingConflict,
  PipingResolveOptions,
  PipingResult,
  PipingSummary,
  PipingTopology,
  PipeVisualState,
} from '../types/piping'

const EMPTY: MediumId = 'empty'

interface Graph {
  routes: PipeRoute[]
  adjacency: Map<string, Array<{ routeIndex: number; route: PipeRoute; other: string }>>
  routeByPipe: Map<string, number[]>
  allPipes: Set<string>
  virtualSources: Set<string>
  sinkTanks: Set<string>
  innerJunctions: Set<string>
  canonical: (pipe: string) => string
}

interface FillEntry {
  medium: MediumId
  sourceId: string
  distance: number
  priority: number
  forward: boolean
  throughInner?: boolean
}

const PIPE_PREFIX = /^pipe/i
const OUTDOOR_PREFIX = 'Outdoor@'
const CHECK_VALVE = /^d\d/i
// These are the existing decorative N2 jacket IDs. They are never used as
// inner-tube junctions or given additional inner-connection filling.
const NITROGEN_JACKETS = new Set(['116', '118', '120', '122', '124', '126', '128', '130', '1756782337', '370', '376', '378', '380', '386', '388'])

// ---------------------------------------------------------------------------
// canonical pipe ids
// ---------------------------------------------------------------------------
export function canonicalPipeId(value: string, topology: PipingTopology = pipingTopology): string {
  let v = String(value).trim()
  if (PIPE_PREFIX.test(v)) v = v.slice(4)
  const canon = topology.canonicalPipes || {}
  let guard = 0
  while (typeof canon[v] === 'string' && canon[v] !== v && guard++ < 1000) v = canon[v]!
  return v
}

export function emptyPipeVisualState(pipeId: string): PipeVisualState {
  return { pipeId, medium: EMPTY, filled: false, flowing: false, forward: false }
}

// ---------------------------------------------------------------------------
// graph construction
// ---------------------------------------------------------------------------
function buildGraph(topology: PipingTopology): Graph {
  const innerJunctions = new Set<string>()
  const joins = [
    { pipe: '117', pairs: [['M1302', 'Engine02'], ['D1421', 'H1302']] },
    { pipe: '125', pairs: [['M1301', 'Engine01'], ['D1411', 'H1301']] },
  ].filter(join => join.pairs.every(([from, to]) => topology.routes.some(route => route.from === from && route.to === to && route.segments.some(segment => canonicalPipeId(segment.pipe, topology) === join.pipe))))
  // The WPF supply and purge paths share their inner tube mid-route. Splitting
  // only these two verified joins lets filling reach the main pipe up to its
  // next closed valve, without joining overlapping outer nitrogen jackets.
  const routes = topology.routes.flatMap(route => {
    const join = joins.find(join => join.pairs.some(([from, to]) => route.from === from && route.to === to))
    if (!join) return [route]
    const index = route.segments.findIndex(segment => canonicalPipeId(segment.pipe, topology) === join.pipe)
    if (index < 0) return [route]
    const junction = `InnerTube@${join.pipe}`
    innerJunctions.add(junction)
    return [
      { from: route.from, to: junction, segments: route.segments.slice(0, index + 1) },
      { from: junction, to: route.to, segments: route.segments.slice(index) },
    ]
  })
  const adjacency: Graph['adjacency'] = new Map()
  const routeByPipe: Graph['routeByPipe'] = new Map()
  const allPipes = new Set<string>()

  routes.forEach((route, routeIndex) => {
    const add = (node: string) => {
      if (!adjacency.has(node)) adjacency.set(node, [])
    }
    add(route.from)
    add(route.to)
    adjacency.get(route.from)!.push({ routeIndex, route, other: route.to })
    adjacency.get(route.to)!.push({ routeIndex, route, other: route.from })
    for (const seg of route.segments) {
      const cp = canonicalPipeId(seg.pipe, topology)
      allPipes.add(cp)
      if (!routeByPipe.has(cp)) routeByPipe.set(cp, [])
      routeByPipe.get(cp)!.push(routeIndex)
    }
  })

  return {
    routes,
    adjacency,
    routeByPipe,
    allPipes,
    virtualSources: new Set(topology.virtualSources || []),
    sinkTanks: new Set((topology.sinkTanks || []).map(n => n.toUpperCase())),
    innerJunctions,
    canonical: pipe => canonicalPipeId(pipe, topology),
  }
}

function deviceIndex(devices: Record<string, DeviceState>): Map<string, DeviceState> {
  const index = new Map<string, DeviceState>()
  for (const device of Object.values(devices)) {
    if (device && typeof device.id === 'string') index.set(device.id.toUpperCase(), device)
  }
  return index
}

function findDevice(node: string, index: Map<string, DeviceState>): DeviceState | undefined {
  return index.get(node.toUpperCase())
}

// ---------------------------------------------------------------------------
// node passability rules
// ---------------------------------------------------------------------------
function isValveOpen(device: DeviceState): boolean {
  return (device.value ?? 0) > 0 && device.error !== true && device.enabled !== false &&
    (device.id.toUpperCase() !== 'C1401' || tripleValvePorts(device) !== 0)
}

function isHoseConnected(device: DeviceState): boolean {
  return (device.value ?? 0) > 0 && device.working === true && device.connected !== false &&
    device.error !== true && device.enabled !== false
}

// The WPF three-way valve is a port selector, not a 0..100 throttling valve.
// DoubleExtensions.HundredValveDegreeToTripleValveState defines these bands.
function tripleValvePorts(device: DeviceState): number {
  const value = device.value ?? 0
  if (value > 20 && value < 30) return 1 // bottom -> top (heat exchanger)
  if (value > 45 && value < 55) return 2 // right -> top (bypass)
  if (value > 70 && value < 80) return 3
  return 0
}

function tripleValveRouteOpen(node: string, route: PipeRoute, index: Map<string, DeviceState>): boolean {
  if (node.toUpperCase() !== 'C1401') return true
  const device = findDevice(node, index)
  if (!device || !isValveOpen(device)) return false
  const ports = tripleValvePorts(device)
  if (route.from.toUpperCase() === 'V1402' || route.to.toUpperCase() === 'V1402') return (ports & 1) !== 0
  if (route.from.toUpperCase() === 'V1403' && route.to.toUpperCase() === 'C1401') return (ports & 2) !== 0
  return true // C1401 -> V1403 is the separate, common top-port return route.
}

function canLeaveNode(node: string, route: PipeRoute, index: Map<string, DeviceState>): boolean {
  // Arriving at a check valve from its inlet must not allow a later hop back
  // through another inlet route. Its outlet-side pipes may still be filled.
  if (CHECK_VALVE.test(node) && route.from !== node) return false
  return tripleValveRouteOpen(node, route, index)
}

function isBlockingDevice(node: string, index: Map<string, DeviceState>): boolean {
  const device = findDevice(node, index)
  if (!device) return false
  if (device.kind === 'valve') return !isValveOpen(device)
  if (device.kind === 'hose') return !isHoseConnected(device)
  return false
}

function canEnterNode(
  node: string,
  route: PipeRoute,
  index: Map<string, DeviceState>,
  virtualSources: Set<string>,
  sinkTanks: Set<string>,
  innerJunctions: Set<string>,
): boolean {
  if (node.startsWith(OUTDOOR_PREFIX)) return false
  if (virtualSources.has(node)) return false
  if (sinkTanks.has(node.toUpperCase())) return false
  if (innerJunctions.has(node)) return true
  const device = findDevice(node, index)
  if (!device) return false
  if (device.kind === 'valve') {
    if (!isValveOpen(device)) return false
    if (CHECK_VALVE.test(node) && route.from === node) return false
    return tripleValveRouteOpen(node, route, index)
  }
  if (device.kind === 'hose') return isHoseConnected(device)
  return true
}

// ---------------------------------------------------------------------------
// fill propagation
// ---------------------------------------------------------------------------
function fillFromSources(
  sources: FlowSource[],
  graph: Graph,
  devices: Record<string, DeviceState>,
): { fills: Map<string, FillEntry>; conflicts: PipingConflict[]; blockedBy: Map<string, string> } {
  const fills = new Map<string, FillEntry>()
  const blockedBy = new Map<string, string>()
  const conflictByPipe = new Map<string, { pipe: string; media: MediumId[]; winner: FillEntry }>()
  const index = deviceIndex(devices)

  const record = (cp: string, entry: FillEntry) => {
    const existing = fills.get(cp)
    if (!existing) {
      fills.set(cp, entry)
      return
    }
    if (entry.medium === existing.medium && entry.sourceId === existing.sourceId) {
      entry.throughInner = entry.throughInner || existing.throughInner
      existing.throughInner = entry.throughInner
    }
    // Keep each source's inlet its own colour. Only equal-distance shared
    // segments use declaration order as a deterministic, non-mixing tie-break.
    const better = entry.distance < existing.distance ||
      (entry.distance === existing.distance && entry.priority < existing.priority)
    if (entry.medium !== existing.medium) {
      let conflict = conflictByPipe.get(cp)
      if (!conflict) {
        conflict = { pipe: cp, media: [existing.medium], winner: existing }
        conflictByPipe.set(cp, conflict)
      }
      if (!conflict.media.includes(entry.medium)) conflict.media.push(entry.medium)
    }
    if (better) {
      fills.set(cp, entry)
      const conflict = conflictByPipe.get(cp)
      if (conflict) conflict.winner = entry
    }
  }

  const markBlocked = (node: string, viaRouteIndex: number) => {
    const adjacent = graph.adjacency.get(node)
    if (!adjacent) return
    for (const { routeIndex, route } of adjacent) {
      if (routeIndex === viaRouteIndex) continue
      for (const seg of route.segments) {
        const cp = graph.canonical(seg.pipe)
        if (!fills.has(cp) && !blockedBy.has(cp)) blockedBy.set(cp, node)
      }
    }
  }

  sources.forEach((source, priority) => {
    const seed = source.kind === 'root' ? source.node : (source.terminal ?? source.node)
    const restrictTo = source.kind === 'root' ? source.via : undefined
    if (isBlockingDevice(seed, index)) { markBlocked(seed, -1); return }
    const queue: Array<{ node: string; distance: number; restricted: boolean; throughInner: boolean }> = [
      { node: seed, distance: 0, restricted: restrictTo !== undefined, throughInner: graph.innerJunctions.has(seed) },
    ]
    const visited = new Set<string>([seed])
    const visitedRoutes = new Set<number>()
    let steps = 0
    while (queue.length && steps++ < 100000) {
      const { node, distance, restricted, throughInner } = queue.shift()!
      const adjacent = graph.adjacency.get(node) ?? []
      for (const { routeIndex, route, other } of adjacent) {
        if (restricted && other !== restrictTo) continue
        if (visitedRoutes.has(routeIndex) || !canLeaveNode(node, route, index)) continue
        visitedRoutes.add(routeIndex)
        const movingForward = node === route.from
        const inner = throughInner || graph.innerJunctions.has(node) || graph.innerJunctions.has(other)
        for (const seg of route.segments) {
          const cp = graph.canonical(seg.pipe)
          record(cp, {
            medium: source.medium,
            sourceId: seed,
            distance,
            priority,
            forward: movingForward ? seg.forward : !seg.forward,
            throughInner: inner,
          })
        }
        if (visited.has(other)) continue
        const enter = canEnterNode(other, route, index, graph.virtualSources, graph.sinkTanks, graph.innerJunctions)
        if (enter) {
          visited.add(other)
          queue.push({ node: other, distance: distance + 1, restricted: false, throughInner: inner })
        } else if (isBlockingDevice(other, index)) {
          markBlocked(other, routeIndex)
        }
      }
    }
  })

  const conflicts: PipingConflict[] = [...conflictByPipe.values()].map(c => ({
    pipe: c.pipe,
    media: c.media,
    winner: c.winner.medium,
    winnerSource: c.winner.sourceId,
  }))
  return { fills, conflicts, blockedBy }
}

function pumpsOk(profile: FlowProfile, devices: Record<string, DeviceState>): boolean {
  if (!profile.pumps || profile.pumps.length === 0) return true
  const index = deviceIndex(devices)
  return profile.pumps.some(id => {
    const device = findDevice(id, index)
    return isDeviceRunning(device)
  })
}

function isDeviceRunning(device: DeviceState | undefined): boolean {
  return !!device && device.working === true && device.error !== true && device.enabled !== false
}

// The WPF route lists group pipes around a pump without making it a graph
// vertex. Keep each physical bank independent; an unrelated running pump is
// not permission for another branch to animate.
function routePump(route: PipeRoute): string | undefined {
  const from = route.from.toUpperCase(), to = route.to.toUpperCase()
  if (from === 'V1201' && to === 'D1201') return 'P101'
  if (from === 'V1202' && to === 'D1202') return 'P102'
  if (from === 'D1501' && ['H1503', 'V1608'].includes(to)) return 'P201'
  if (from === 'D1502' && ['H1503', 'V1608'].includes(to)) return 'P202'
  if (from === 'C1401' && to === 'V1403') return 'P401'
  if (['H1401', 'H1403', 'H1404'].includes(from) && ['H1402', 'H1405', 'H1406'].includes(to)) return 'P402'
  return undefined
}

interface TransportResult {
  pipes: Map<string, Set<MediumId>>
  reachedTanks: Set<string>
  warnings: string[]
}

/** Only proven source-to-outlet paths or powered circulation loops may move. */
function transportFromSources(sources: FlowSource[], graph: Graph, devices: Record<string, DeviceState>, profile: FlowProfile): TransportResult {
  const index = deviceIndex(devices)
  const authored = new Set(profile.activePipes.map(pipe => graph.canonical(pipe.pipe)))
  const result: TransportResult = { pipes: new Map(), reachedTanks: new Set(), warnings: [] }
  const openNode = (node: string) => {
    if (graph.innerJunctions.has(node) || graph.virtualSources.has(node) || graph.sinkTanks.has(node.toUpperCase()) || node.startsWith(OUTDOOR_PREFIX)) return true
    const device = findDevice(node, index)
    if (!device) return false
    if (device.kind === 'valve') return isValveOpen(device)
    if (device.kind === 'hose') return isHoseConnected(device)
    if (['pump', 'engine'].includes(device.kind || '')) return isDeviceRunning(device)
    return device.enabled !== false
  }
  // Explicit pump nodes in custom topologies follow upstream -> pump -> downstream.
  // Keep WPF banks whose pumps are implicit on a route independently gated too.
  const driveForRoute = (route: PipeRoute) => routePump(route) ||
    [route.from, route.to].find(node => findDevice(node, index)?.kind === 'pump')
  const traverse = (node: string, route: PipeRoute, other: string) => {
    if (!openNode(node) || !openNode(other) || !canLeaveNode(node, route, index)) return false
    if (CHECK_VALVE.test(other) && route.from === other) return false
    if (!tripleValveRouteOpen(other, route, index)) return false
    const pump = driveForRoute(route)
    return !pump || node === route.from && isDeviceRunning(findDevice(pump, index))
  }
  const mark = (routes: PipeRoute[], medium: MediumId) => {
    for (const route of routes) for (const segment of route.segments) {
      const id = graph.canonical(segment.pipe)
      const media = result.pipes.get(id) || new Set<MediumId>()
      media.add(medium); result.pipes.set(id, media)
    }
  }
  for (const source of sources) {
    const seed = source.kind === 'root' ? source.node : source.terminal || source.node
    if (!openNode(seed)) continue
    const nodes = [seed], routes: PipeRoute[] = [], used = new Set<number>()
    let visits = 0
    const walk = (node: string) => {
      if (++visits > 50000) return
      for (const edge of graph.adjacency.get(node) || []) {
        if (used.has(edge.routeIndex) || !traverse(node, edge.route, edge.other)) continue
        if (!routes.length && source.kind === 'root' && source.via && edge.other !== source.via) continue
        const nextRoutes = [...routes, edge.route]
        const endAuthored = !profile.animationGroups.length || edge.route.segments.some(segment => authored.has(graph.canonical(segment.pipe)))
        const pumpOnPath = nextRoutes.some(route => !!driveForRoute(route))
        const hasDrive = !profile.pumps.length || pumpOnPath
        const cycleAt = nodes.indexOf(edge.other)
        if (cycleAt >= 0) {
          const cycle = nextRoutes.slice(cycleAt)
          // The same edge backwards isn't circulation. A real loop needs a
          // running, correctly oriented pump and an authored final connection.
          if (cycle.length >= 2 && cycle.some(route => !!driveForRoute(route)) && endAuthored) mark(cycle, source.medium)
          continue
        }
        const device = findDevice(edge.other, index)
        const tank = graph.sinkTanks.has(edge.other.toUpperCase())
        const outlet = edge.other.startsWith(OUTDOOR_PREFIX) || tank || device?.kind === 'engine'
        if (outlet) {
          if (hasDrive && endAuthored && (device?.kind !== 'engine' || source.medium === 'methanol')) {
            mark(nextRoutes, source.medium)
            if (tank) result.reachedTanks.add(edge.other.toUpperCase())
          }
          continue
        }
        if (graph.virtualSources.has(edge.other)) continue
        used.add(edge.routeIndex); nodes.push(edge.other); routes.push(edge.route)
        walk(edge.other)
        routes.pop(); nodes.pop(); used.delete(edge.routeIndex)
      }
    }
    walk(seed)
    if (visits > 50000) result.warnings.push(`${profile.name}：复杂回路只显示已验证的连通流动，不推测其他支路。`)
  }
  return result
}

function processSources(profile: FlowProfile): { fill: FlowSource[]; vent: FlowSource[] } {
  // Tank headspace is the real source of displaced vent gas. It can fill the
  // vent line, but moves only while a liquid inlet actually reaches the tank.
  const vent: FlowSource[] = profile.id === 'bunkering' ? [{ kind: 'root', node: 'T101', via: 'M1101', medium: 'nitrogen' }] : []
  return { fill: [...profile.sources, ...vent], vent }
}

function processTransport(profile: FlowProfile, graph: Graph, devices: Record<string, DeviceState>): TransportResult {
  const result = transportFromSources(profile.sources, graph, devices, profile)
  const vent = processSources(profile).vent
  if (vent.length && result.reachedTanks.has('T101')) {
    const displaced = transportFromSources(vent, graph, devices, profile)
    for (const [id, media] of displaced.pipes) {
      const existing = result.pipes.get(id) || new Set<MediumId>()
      for (const medium of media) existing.add(medium)
      result.pipes.set(id, existing)
    }
    result.warnings.push(...displaced.warnings)
  }
  return result
}

function flowGroupOpen(group: FlowAnimationGroup, index: Map<string, DeviceState>): boolean {
  if (!group.valves.every(id => {
    const device = findDevice(id, index)
    if (!device) return false
    return device.kind === 'hose' ? isHoseConnected(device) : device.kind === 'valve' && isValveOpen(device) && (device.value ?? 0) > 1
  })) return false
  if (!group.runningDevices.every(id => isDeviceRunning(findDevice(id, index)))) return false
  if (group.tripleValve) {
    const device = findDevice(group.tripleValve.node, index)
    if (!device || !isValveOpen(device)) return false
    const port = group.tripleValve.path === 'exchanger' ? 1 : 2
    if ((tripleValvePorts(device) & port) === 0) return false
  }
  return true
}

function activeFlowPipes(profile: FlowProfile, devices: Record<string, DeviceState>, topology: PipingTopology): Map<string, ActivePipe[]> {
  const flowMap = new Map<string, ActivePipe[]>()
  const candidates: ActivePipe[] = []
  if (topology.flowGroups) {
    const index = deviceIndex(devices)
    for (const name of profile.animationGroups) {
      const group = topology.flowGroups[name]
      // An unimported gate is not permission to animate an entire branch.
      if (group && flowGroupOpen(group, index)) candidates.push(...group.activePipes)
    }
  } else if (pumpsOk(profile, devices)) {
    // Small/custom topologies can author an explicit mask without WPF groups.
    candidates.push(...profile.activePipes)
  }
  for (const pipe of candidates) {
    const cp = canonicalPipeId(pipe.pipe, topology)
    if (!flowMap.has(cp)) flowMap.set(cp, [])
    flowMap.get(cp)!.push(pipe)
  }
  return flowMap
}

// ---------------------------------------------------------------------------
// Use the SAME authored pipe metadata as the demo. Local traversal determines
// visibility only; it must never choose a medium or reverse an animation.
function manualFlowPalette(profile: FlowProfile, devices: Record<string, DeviceState>, topology: PipingTopology): { pipes: Map<string, ActivePipe>; warnings: string[] } {
  const variants = new Map<string, ActivePipe[]>()
  for (const pipe of profile.activePipes) {
    const id = canonicalPipeId(pipe.pipe, topology)
    const entries = variants.get(id) || []
    if (!entries.some(entry => entry.medium === pipe.medium && entry.flowForward === pipe.flowForward)) entries.push(pipe)
    variants.set(id, entries)
  }
  const active = activeFlowPipes(profile, devices, topology)
  const pipes = new Map<string, ActivePipe>()
  const warnings: string[] = []
  for (const [id, entries] of variants) {
    if (entries.length === 1) pipes.set(id, entries[0]!)
    else {
      const candidates = active.get(id) || []
      const first = candidates[0]
      if (first && candidates.every(pipe => pipe.medium === first.medium && pipe.flowForward === first.flowForward)) pipes.set(id, first)
      else warnings.push(`${profile.name}：管段 ${id} 的演示方向 / 介质定义存在多种变体，暂不显示，避免猜测。`)
    }
  }
  return { pipes, warnings }
}

// Freedom applies to user operations, not to inventing fluid sources. Filling
// starts at configured process sources; movement needs a complete open path.
// Fault flags remain advisory and are never mutated in free manual mode.
function resolveManualPiping(devices: Record<string, DeviceState>, options: PipingResolveOptions, topology: PipingTopology): PipingResult {
  const graph = buildGraph(topology)
  const profileId = options.manualFlowId ?? 'bunkering'
  const profile = topology.flowProfiles[profileId]
  const sandbox = Object.fromEntries(Object.entries(devices).map(([id, device]) => [id, { ...device, error: false, enabled: true }]))
  const palette = profile ? manualFlowPalette(profile, sandbox, topology) : { pipes: new Map<string, ActivePipe>(), warnings: ['请选择一个有效的手动工艺；未选择时不推测介质和方向。'] }
  // A missing device snapshot is not a plant with every valve closed; leave it blank until initialized.
  const sources = profile && Object.values(sandbox).some(device => typeof device.id === 'string' && device.id.length > 0) ? processSources(profile).fill : []
  const resolved = fillFromSources(sources, graph, sandbox)
  const transport = profile ? processTransport(profile, graph, sandbox) : { pipes: new Map<string, Set<MediumId>>(), warnings: [] }
  const conflicts = new Set(resolved.conflicts.map(conflict => conflict.pipe))
  const pipes: Record<string, PipeVisualState> = {}
  for (const id of graph.allPipes) {
    const fill = resolved.fills.get(id)
    const authored = palette.pipes.get(id)
    pipes[id] = fill && authored
      ? { pipeId: id, medium: fill.medium, filled: true, flowing: options.running && !conflicts.has(id) && fill.medium === authored.medium && transport.pipes.get(id)?.has(fill.medium) === true, forward: authored.flowForward, sourceId: fill.sourceId }
      : fill?.throughInner && profile && !NITROGEN_JACKETS.has(id)
        ? { pipeId: id, medium: fill.medium, filled: true, flowing: false, forward: fill.forward, sourceId: fill.sourceId, fillOrigin: 'inner-connection' }
      : { ...emptyPipeVisualState(id), blockedBy: resolved.blockedBy.get(id) }
  }
  const rows = Object.values(pipes)
  return { pipes, summary: {
    flowId: options.flowId, running: options.running, medium: profile?.medium || EMPTY, pumpsOk: true,
    filledCount: rows.filter(pipe => pipe.filled).length, flowingCount: rows.filter(pipe => pipe.flowing).length,
    blockedCount: rows.filter(pipe => pipe.blockedBy).length, conflicts: resolved.conflicts,
    sources: sources.map(source => source.node), warnings: [...palette.warnings, ...transport.warnings, ...resolved.conflicts.map(conflict => `管段 ${conflict.pipe} 的介质来源存在冲突，未播放流动，请检查对应管路和阀门连接。`)],
  } }
}

// public API
// ---------------------------------------------------------------------------
export function resolvePiping(
  devices: Record<string, DeviceState>,
  options: PipingResolveOptions,
  topology: PipingTopology = pipingTopology,
): PipingResult {
  if (options.flowId === '__manual__') return resolveManualPiping(devices, options, topology)
  const graph = buildGraph(topology)
  const pipes: Record<string, PipeVisualState> = {}
  for (const cp of graph.allPipes) pipes[cp] = emptyPipeVisualState(cp)

  const profile = topology.flowProfiles?.[options.flowId]
  const conflicts: PipingConflict[] = []
  let fills = new Map<string, FillEntry>()
  let blockedBy = new Map<string, string>()
  let pOk = true

  if (profile) {
    const resolved = fillFromSources(processSources(profile).fill, graph, devices)
    fills = resolved.fills
    blockedBy = resolved.blockedBy
    conflicts.push(...resolved.conflicts)
    pOk = pumpsOk(profile, devices)
    const transport = processTransport(profile, graph, devices)
    const flowMap = options.running ? activeFlowPipes(profile, devices, topology) : new Map<string, ActivePipe[]>()

    for (const cp of graph.allPipes) {
      const state = pipes[cp]!
      const fill = fills.get(cp)
      if (fill) {
        state.medium = fill.medium
        state.filled = true
        state.forward = fill.forward
        state.sourceId = fill.sourceId
      } else if (blockedBy.has(cp)) {
        state.blockedBy = blockedBy.get(cp)
      }
      const active = fill && flowMap.get(cp)?.find(pipe => pipe.medium === fill.medium)
      if (active && transport.pipes.get(cp)?.has(state.medium) && !resolved.conflicts.some(conflict => conflict.pipe === cp)) {
        state.flowing = true
        state.forward = active.flowForward
      }
    }
  }

  let filledCount = 0
  let flowingCount = 0
  let blockedCount = 0
  for (const state of Object.values(pipes)) {
    if (state.filled) filledCount++
    if (state.flowing) flowingCount++
    if (state.blockedBy) blockedCount++
  }

  const summary: PipingSummary = {
    flowId: options.flowId,
    running: options.running,
    medium: profile?.medium ?? EMPTY,
    pumpsOk: pOk,
    filledCount,
    flowingCount,
    blockedCount,
    conflicts,
    sources: profile ? profile.sources.map(s => `${s.kind}:${s.node}(${s.medium})`) : [],
  }
  return { pipes, summary }
}

export { pipingTopology as topology }
