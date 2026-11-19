import { svgPathProperties } from 'svg-path-properties'
import type { SceneNode } from '../../types/scene'
import { wpfBend } from './geometry'
import { nodeAttribute, nodeNumber } from './scenes'

export interface PipePoint { x: number; y: number }
export interface PipeGeometry {
  id: string
  node: SceneNode
  pipeId?: string
  path: string
  diameter: number
  length: number
  start: PipePoint
  end: PipePoint
  neighbours: string[]
  curved: boolean
  soft: boolean
}
export interface PipeDrawing { pipes: PipeGeometry[]; roundedJunctions: number; teeJunctions: number; junctions?: { x: number; y: number; radius: number }[] }
interface Fillet { midpoint: PipePoint; trim: PipePoint; control: PipePoint }
interface WorkingPipe {
  node: SceneNode; pipeId?: string; start: PipePoint; end: PipePoint; diameter: number
  curved: boolean; soft: boolean; path: string; neighbours: Set<string>
  startFillet?: Fillet; endFillet?: Fillet
}
interface Port { pipe: WorkingPipe; end: 'start' | 'end'; point: PipePoint; outward: PipePoint }

const f = (n: number) => Number(n.toFixed(3))
const xy = (p: PipePoint) => `${f(p.x)},${f(p.y)}`
const distance = (a: PipePoint, b: PipePoint) => Math.hypot(a.x - b.x, a.y - b.y)
const middle = (a: PipePoint, b: PipePoint): PipePoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const plus = (p: PipePoint, v: PipePoint, amount: number): PipePoint => ({ x: p.x + v.x * amount, y: p.y + v.y * amount })
function unit(a: PipePoint, b: PipePoint): PipePoint {
  const length = distance(a, b) || 1
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
}
function rotated(point: PipePoint, node: SceneNode): PipePoint {
  const angle = (node.rotate || 0) * Math.PI / 180
  const cx = node.x + node.width / 2, cy = node.y + node.height / 2
  return { x: cx + (point.x - cx) * Math.cos(angle) - (point.y - cy) * Math.sin(angle), y: cy + (point.x - cx) * Math.sin(angle) + (point.y - cy) * Math.cos(angle) }
}
function family(node: SceneNode): string {
  const fluid = nodeAttribute(node, 'fluid')
  if (/乙二醇|Glycol/i.test(fluid)) return 'glycol'
  if (/水|Water/i.test(fluid)) return 'water'
  return 'fuel-gas'
}
function compatible(a: WorkingPipe, b: WorkingPipe) { return family(a.node) === family(b.node) || !!a.pipeId && a.pipeId === b.pipeId }
function ports(pipe: WorkingPipe): Port[] {
  return [
    { pipe, end: 'start', point: pipe.start, outward: unit(pipe.end, pipe.start) },
    { pipe, end: 'end', point: pipe.end, outward: unit(pipe.start, pipe.end) },
  ]
}
function straightPath(pipe: WorkingPipe): string {
  const start = pipe.startFillet?.midpoint || pipe.start
  const end = pipe.endFillet?.midpoint || pipe.end
  const trimStart = pipe.startFillet?.trim || pipe.start
  const trimEnd = pipe.endFillet?.trim || pipe.end
  return `M ${xy(start)}${pipe.startFillet ? ` Q ${xy(pipe.startFillet.control)} ${xy(trimStart)}` : ''} L ${xy(trimEnd)}${pipe.endFillet ? ` Q ${xy(pipe.endFillet.control)} ${xy(end)}` : ''}`
}
function nativeBend(node: SceneNode): { path: string; start: PipePoint; end: PipePoint } {
  // Some old WPF hoses contain EndAngle=1600. Normalize the angle before using
  // the original arc rather than drawing several rotations or a clipped loop.
  const normalized: SceneNode = { ...node, attributes: { ...node.attributes } }
  for (const key of ['startAngle', 'endAngle']) if (typeof normalized.attributes?.[key] === 'number') normalized.attributes[key] = Number(normalized.attributes[key]) % 360
  const bend = wpfBend(normalized), box = bend.viewBox.split(/\s+/).map(Number)
  const scale = Math.min(node.width / box[2]!, node.height / box[3]!) || 1
  const dx = node.x + (node.width - box[2]! * scale) / 2 - box[0]! * scale
  const dy = node.y + (node.height - box[3]! * scale) / 2 - box[1]! * scale
  const properties = new svgPathProperties(bend.path), length = properties.getTotalLength()
  const points = Array.from({ length: 49 }, (_, index) => {
    const p = properties.getPointAtLength(length * index / 48)
    return rotated({ x: dx + p.x * scale, y: dy + p.y * scale }, node)
  })
  return { path: points.map((p, index) => `${index ? 'L' : 'M'} ${xy(p)}`).join(' '), start: points[0]!, end: points[points.length - 1]! }
}
function createPipe(node: SceneNode, nominalDiameter: number): WorkingPipe {
  const vertical = nodeAttribute(node, 'orientation') === 'Vertical' || nodeAttribute(node, 'orientation') !== 'Horizontal' && node.height > node.width
  const soft = nodeAttribute(node, 'material') === 'Soft'
  const squareElbow = node.kind === 'pipe' && !node.deviceId && !['overview-pipe-102', 'overview-pipe-165', 'engine-pipe-1', 'engine-pipe-21'].includes(node.id) && Math.min(node.width, node.height) > nominalDiameter * 1.5 && Math.max(node.width, node.height) < Math.min(node.width, node.height) * 2.5
  const curved = node.kind === 'hose' || squareElbow
  const diameter = Math.max(1, Math.min(48, curved ? nodeNumber(node, 'diameter', nominalDiameter) : vertical ? node.width : node.height))
  let start = rotated({ x: vertical ? node.x + node.width / 2 : node.x, y: vertical ? node.y : node.y + node.height / 2 }, node)
  let end = rotated({ x: vertical ? node.x + node.width / 2 : node.x + node.width, y: vertical ? node.y + node.height : node.y + node.height / 2 }, node)
  let path = `M ${xy(start)} L ${xy(end)}`
  if (curved && !soft) ({ path, start, end } = nativeBend(node))
  if (soft) {
    const y = node.y + node.height * 0.26
    start = rotated({ x: node.x, y }, node); end = rotated({ x: node.x + node.width, y }, node)
  }
  return { node, pipeId: nodeAttribute(node, 'pipeId') || node.deviceId?.replace(/^Pipe/i, '') || undefined, start, end, diameter, curved, soft, path, neighbours: new Set() }
}
function fitConnectors(pipes: WorkingPipe[]) {
  const lines = pipes.filter(pipe => !pipe.curved)
  const overviewBridges: Record<string, [string, string, number]> = {
    'overview-hose-9': ['overview-pipe-129', 'overview-pipe-130', 1],
    'overview-hose-10': ['overview-pipe-130', 'overview-pipe-131', -1],
    'overview-hose-12': ['overview-pipe-205', 'overview-pipe-204', 1],
    'overview-hose-13': ['overview-pipe-211', 'overview-pipe-212', 1],
    'overview-hose-8': ['overview-pipe-235', 'overview-pipe-234', 1],
    'bunkering-front-hose-1': ['bunkering-front-pipe-21', 'bunkering-front-pipe-22', 1],
    'recovery-hose-6': ['recovery-pipe-31', 'recovery-pipe-30', 1],
    'recovery-hose-7': ['recovery-pipe-30', 'recovery-pipe-26', 1],
    'recovery-hose-8': ['recovery-pipe-33', 'recovery-pipe-19', 1],
    'overview-hose-23': ['overview-pipe-273', 'overview-pipe-272', 1],
    'overview-hose-24': ['overview-pipe-272', 'overview-pipe-266', 1],
    'lfss-hose-1': ['lfss-pipe-132', 'lfss-pipe-10', 1],
    'lfss-hose-2': ['lfss-pipe-133', 'lfss-pipe-131', 1],
    'lfss-hose-3': ['lfss-pipe-85', 'lfss-pipe-14', 1],
    'lfss-hose-4': ['lfss-pipe-136', 'lfss-pipe-135', 1],
    'lfss-hose-5': ['lfss-pipe-134', 'lfss-pipe-136', 1],
    'lfss-hose-6': ['lfss-pipe-139', 'lfss-pipe-138', 1],
    'lfss-hose-7': ['lfss-pipe-141', 'lfss-pipe-140', 1],
    'lfss-hose-8': ['lfss-pipe-123', 'lfss-pipe-122', 1],
    'overview-hose-16': ['overview-pipe-199', 'overview-pipe-200', 1],
  }
  for (const pipe of pipes.filter(pipe => pipe.curved)) {
    const bridge = overviewBridges[pipe.node.id]
    if (bridge) {
      const pair = lines.filter(line => line.node.id === bridge[0] || line.node.id === bridge[1]).sort((a, b) => a.node.y - b.node.y)
      const upper = pair[0], lower = pair[1]
      if (upper && lower) {
        const trim = Math.min(10, upper.node.height * 0.2, lower.node.height * 0.2)
        const start = { x: upper.node.x + upper.node.width / 2, y: upper.node.y + upper.node.height - trim }
        const end = { x: lower.node.x + lower.node.width / 2, y: lower.node.y + trim }
        upper.end = start
        lower.start = end
        const depth = Math.max(upper.diameter, lower.diameter, (end.y - start.y) * 0.55)
        pipe.start = start; pipe.end = end
        pipe.diameter = (upper.diameter + lower.diameter) / 2
        pipe.path = `M ${xy(start)} C ${xy({ x: start.x + bridge[2] * depth, y: start.y })} ${xy({ x: end.x + bridge[2] * depth, y: end.y })} ${xy(end)}`
        connect(pipe, upper); connect(pipe, lower)
      }
      continue
    }
    if (['overview-hose-8', 'overview-hose-9', 'overview-hose-10', 'overview-hose-12', 'overview-hose-13', 'overview-hose-23', 'overview-hose-24', 'overview-engine-bridge'].includes(pipe.node.id)) continue
    if (pipe.node.id.startsWith('recovery-') && pipe.node.kind === 'hose' && !pipe.soft) {
      continue
    }
    const pad = Math.min(90, Math.max(pipe.diameter * 5, Math.min(pipe.node.width, pipe.node.height) * 0.65))
    const candidates = lines.filter(line => compatible(pipe, line)).flatMap(ports).filter(port => port.point.x >= pipe.node.x - pad && port.point.x <= pipe.node.x + pipe.node.width + pad && port.point.y >= pipe.node.y - pad && port.point.y <= pipe.node.y + pipe.node.height + pad)
    const ranked = (point: PipePoint) => [...candidates].sort((a, b) => distance(a.point, point) - distance(b.point, point))
    const a = ranked(pipe.start).find(port => distance(port.point, pipe.start) <= pad)
    const b = ranked(pipe.end).find(port => port.pipe !== a?.pipe && distance(port.point, pipe.end) <= pad)
    if (a && b) {
      pipe.start = { ...a.point }; pipe.end = { ...b.point }
      if (!pipe.soft && Math.abs(a.pipe.diameter - b.pipe.diameter) <= Math.max(a.pipe.diameter, b.pipe.diameter) * 0.25) {
        pipe.diameter = (a.pipe.diameter + b.pipe.diameter) / 2
      }
      pipe.neighbours.add(a.pipe.node.id); pipe.neighbours.add(b.pipe.node.id)
      a.pipe.neighbours.add(pipe.node.id); b.pipe.neighbours.add(pipe.node.id)
      if (!pipe.soft && pipe.node.kind === 'hose') {
        const trim = Math.min(pipe.diameter * 0.35, distance(a.pipe.start, a.pipe.end) * 0.1, distance(b.pipe.start, b.pipe.end) * 0.1)
        a.pipe[a.end] = plus(a.point, a.outward, -trim)
        b.pipe[b.end] = plus(b.point, b.outward, -trim)
        pipe.path = `M ${xy(a.pipe[a.end])} ${pipe.path.replace(/^M\s+/, 'L ')} L ${xy(b.pipe[b.end])}`
      } else if (!pipe.soft) {
        const amount = Math.min(distance(a.point, b.point) * 0.55, Math.max(pipe.node.width, pipe.node.height) * 0.7)
        pipe.path = `M ${xy(a.point)} C ${xy(plus(a.point, a.outward, amount))} ${xy(plus(b.point, b.outward, amount))} ${xy(b.point)}`
      }
    }
    if (pipe.soft) {
      // A real U-shaped hose with horizontal tangents at the connectors. The
      // connected path meets neighbouring pipe ports, not its old clipped box.
      const start = pipe.start, end = pipe.end, width = Math.abs(end.x - start.x)
      const depth = Math.max(pipe.diameter * 2, Math.min(pipe.node.height * 0.62, Math.max(width * 0.5, 30)))
      const sign = end.x >= start.x ? 1 : -1, amount = Math.max(pipe.diameter, width * 0.22)
      const bottom = { x: (start.x + end.x) / 2, y: Math.max(start.y, end.y) + depth }
      pipe.path = `M ${xy(start)} C ${xy({ x: start.x + sign * amount, y: start.y })} ${xy({ x: bottom.x - sign * amount, y: bottom.y })} ${xy(bottom)} C ${xy({ x: bottom.x + sign * amount, y: bottom.y })} ${xy({ x: end.x - sign * amount, y: end.y })} ${xy(end)}`
    }
  }
}
function axis(pipe: WorkingPipe): 'x' | 'y' | undefined {
  if (Math.abs(pipe.start.y - pipe.end.y) < 0.1) return 'x'
  if (Math.abs(pipe.start.x - pipe.end.x) < 0.1) return 'y'
  return undefined
}
function connect(pipe: WorkingPipe, other: WorkingPipe) { pipe.neighbours.add(other.node.id); other.neighbours.add(pipe.node.id) }
function nearestEnd(pipe: WorkingPipe, point: PipePoint, tolerance: number): 'start' | 'end' | undefined {
  if (distance(pipe.start, point) <= tolerance) return 'start'
  if (distance(pipe.end, point) <= tolerance) return 'end'
  return undefined
}
function snapStraightJunctions(pipes: WorkingPipe[]) {
  const lines = pipes.filter(pipe => !pipe.curved)
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i]!, b = lines[j]!, aa = axis(a), ba = axis(b)
    if (!aa || !ba || !compatible(a, b)) continue
    const tolerance = (a.diameter + b.diameter) / 2 + 0.75
    if (aa === ba) {
      for (const ap of ports(a)) for (const bp of ports(b)) {
        if (distance(ap.point, bp.point) > tolerance) continue
        const perpendicular = aa === 'x' ? Math.abs(ap.point.y - bp.point.y) : Math.abs(ap.point.x - bp.point.x)
        if (perpendicular > Math.min(a.diameter, b.diameter) * 0.3 + 0.5) continue
        const joint = middle(ap.point, bp.point)
        a[ap.end] = joint; b[bp.end] = joint; connect(a, b)
      }
      continue
    }
    const horizontal = aa === 'x' ? a : b, vertical = aa === 'y' ? a : b
    const point = { x: vertical.start.x, y: horizontal.start.y }
    const inside = point.x >= Math.min(horizontal.start.x, horizontal.end.x) - tolerance && point.x <= Math.max(horizontal.start.x, horizontal.end.x) + tolerance && point.y >= Math.min(vertical.start.y, vertical.end.y) - tolerance && point.y <= Math.max(vertical.start.y, vertical.end.y) + tolerance
    if (!inside) continue
    const ae = nearestEnd(a, point, tolerance), be = nearestEnd(b, point, tolerance)
    // Interior/interior crossings are intentionally NOT made into junctions.
    // Geometry never determines medium reachability; the WPF path graph does.
    if (!ae && !be) continue
    if (ae) a[ae] = point
    if (be) b[be] = point
    connect(a, b)
  }
}
function filletCorners(pipes: WorkingPipe[]): { rounded: number; tees: number; junctions: { x: number; y: number; radius: number }[] } {
  const groups = new Map<string, Port[]>()
  for (const pipe of pipes.filter(pipe => !pipe.curved)) for (const port of ports(pipe)) {
    const key = `${f(port.point.x)}:${f(port.point.y)}`
    groups.set(key, [...(groups.get(key) || []), port])
  }
  let rounded = 0, tees = 0
  const junctions: { x: number; y: number; radius: number }[] = []
  for (const group of groups.values()) {
    const joint = group[0]!.point
    const through = pipes.find(pipe => !pipe.curved && !group.some(port => port.pipe === pipe) && group.some(port => port.pipe.neighbours.has(pipe.node.id)) && (axis(pipe) === 'x' ? Math.abs(pipe.start.y - joint.y) < 0.1 && joint.x > Math.min(pipe.start.x, pipe.end.x) + 0.1 && joint.x < Math.max(pipe.start.x, pipe.end.x) - 0.1 : axis(pipe) === 'y' && Math.abs(pipe.start.x - joint.x) < 0.1 && joint.y > Math.min(pipe.start.y, pipe.end.y) + 0.1 && joint.y < Math.max(pipe.start.y, pipe.end.y) - 0.1))
    if (group.length > 2 || through) {
      tees++
      if (through) for (const port of group) {
        if (axis(port.pipe) === axis(through) || !port.pipe.neighbours.has(through.node.id)) continue
        const trim = Math.min(Math.max(0, (through.diameter - port.pipe.diameter) / 2), distance(port.pipe.start, port.pipe.end) * 0.2)
        port.pipe[port.end] = plus(joint, port.outward, -trim)
      }
      if (group.every(port => compatible(group[0]!.pipe, port.pipe))) junctions.push({ ...joint, radius: Math.min(...group.map(port => port.pipe.diameter)) * 0.48 })
      continue
    }
    if (group.length !== 2) continue
    const a = group[0]!, b = group[1]!
    if (a.pipe === b.pipe || !compatible(a.pipe, b.pipe) || Math.abs(a.outward.x * b.outward.x + a.outward.y * b.outward.y) > 0.05) continue
    const radius = Math.min(Math.max(a.pipe.diameter, b.pipe.diameter) * 1.1, distance(a.pipe.start, a.pipe.end) * 0.25, distance(b.pipe.start, b.pipe.end) * 0.25)
    if (radius < 0.25) continue
    const at = plus(joint, a.outward, -radius), bt = plus(joint, b.outward, -radius)
    const ac = middle(at, joint), bc = middle(joint, bt), midpoint = middle(ac, bc)
    a.pipe[`${a.end}Fillet`] = { midpoint, trim: at, control: ac }
    b.pipe[`${b.end}Fillet`] = { midpoint, trim: bt, control: bc }
    rounded++
  }
  return { rounded, tees, junctions }
}

/** Builds display geometry only. Do not use screen intersections as fluid edges. */
export function buildPipingGeometry(nodes: readonly SceneNode[]): PipeDrawing {
  const seen = new Set<string>()
  const selected = nodes.filter(node => {
    if (node.kind !== 'pipe' && node.kind !== 'hose') return false
    if (node.id === 'overview-hose-2') return false
    if (['overview-hose-33', 'overview-hose-34', 'water-hose-2'].includes(node.id)) return false
    if (['overview-pipe-102', 'overview-pipe-162', 'overview-pipe-165', 'engine-pipe-1', 'engine-pipe-21'].includes(node.id)) return false
    if (['overview-hose-18', 'overview-hose-19', 'overview-hose-20', 'overview-hose-21', 'overview-hose-22'].includes(node.id)) return false
    if (node.id.startsWith('recovery-') && node.kind === 'hose' && !node.deviceId) return false
    if (node.kind !== 'hose' || nodeAttribute(node, 'material') === 'Soft') return true
    const key = JSON.stringify([node.x, node.y, node.width, node.height, node.rotate, node.deviceId, node.attributes])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const widths = selected.filter(node => node.kind === 'pipe' && Math.max(node.width, node.height) > Math.min(node.width, node.height) * 2.5).map(node => Math.min(node.width, node.height)).filter(width => width > 0 && width < 24).sort((a, b) => a - b)
  const nominal = widths[Math.floor(widths.length / 2)] || 8
  const pipes = selected.map(node => createPipe(node, nominal))
  for (const pipe of pipes) {
    if (['overview-pipe-49', 'overview-pipe-50', 'overview-pipe-51'].includes(pipe.node.id)) {
      pipe.start.y = 35.5
      pipe.end.y = 35.5
      pipe.diameter = 5
    }
    if (pipe.node.id === 'overview-pipe-60') {
      pipe.start = { x: 662.5, y: 35.5 }
      pipe.end = { x: 705.5, y: 35.5 }
      pipe.diameter = 5
    }
    if (pipe.node.id === 'overview-pipe-61') {
      pipe.start = { x: 705.5, y: 35.5 }
      pipe.diameter = 5
    }
    if (pipe.node.id === 'overview-pipe-84') {
      pipe.start = { x: 662.5, y: 35.5 }
      pipe.end.y -= 7
      pipe.diameter = 5
    }
    if (pipe.node.id === 'overview-pipe-85') pipe.start.y -= 7
  }
  const engineCorner = pipes.find(pipe => pipe.node.id === 'overview-pipe-161')
  if (engineCorner) {
    engineCorner.start.x = 1666
    engineCorner.end.x = 1666
    engineCorner.end.y = 572.5
  }
  snapStraightJunctions(pipes)
  fitConnectors(pipes)
  for (const pipe of pipes) {
    if (pipe.node.id === 'overview-pipe-332') {
      pipe.curved = true
      pipe.path = 'M 1746.5,816 L 1746.5,771 Q 1746.5,761 1756.5,761 L 1768,761 Q 1778,761 1778,751 L 1778,725'
    }
    if (pipe.node.id === 'water-pipe-44') {
      pipe.curved = true
      pipe.path = 'M 1354,353 L 1354,286 Q 1354,274 1366,274 L 1388,274 Q 1400,274 1400,262 L 1400,208'
    }
    if (['overview-pipe-255', 'overview-pipe-257'].includes(pipe.node.id)) pipe.end.x = 658.5
    if (['overview-pipe-254', 'overview-pipe-256'].includes(pipe.node.id)) pipe.start.x = 658.5
    if (['recovery-pipe-15', 'recovery-pipe-17'].includes(pipe.node.id)) pipe.end.x = 875.5
    if (['recovery-pipe-14', 'recovery-pipe-16'].includes(pipe.node.id)) pipe.start.x = 875.5
  }
  const counts = filletCorners(pipes)
  const result = pipes.map(pipe => {
    const path = pipe.curved ? pipe.path : straightPath(pipe), properties = new svgPathProperties(path)
    const length = properties.getTotalLength()
    return { id: pipe.node.id, node: pipe.node, pipeId: pipe.pipeId, path, diameter: pipe.diameter, length, start: properties.getPointAtLength(0), end: properties.getPointAtLength(length), neighbours: [...pipe.neighbours], curved: pipe.curved || !!pipe.startFillet || !!pipe.endFillet, soft: pipe.soft }
  })
  return { pipes: result, roundedJunctions: counts.rounded, teeJunctions: counts.tees, junctions: counts.junctions }
}

export function samplePipe(geometry: PipeGeometry, fraction: number) {
  return new svgPathProperties(geometry.path).getPropertiesAtLength(geometry.length * Math.max(0, Math.min(1, fraction)))
}
