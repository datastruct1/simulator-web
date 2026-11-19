import generated from './piping.generated.json'
import type { MediaDef, PipingTopology } from '../types/piping'

const legendColors: Record<string, string> = {
  nitrogen: '#DBB620', methanol: '#990000', 'cold-water': '#0000FF', 'hot-water': '#FF0000',
  'water-glycol': '#00CC00', 'cold-water-glycol': '#00CC00', 'hot-water-glycol': '#00CC00',
}
export const MEDIA = (generated.media as MediaDef[]).map(medium => ({ ...medium, color: legendColors[medium.id] || medium.color }))
// Verified active WPF aliases (PipeCombineRule.cs): one missing alias and one
// alias captured from a commented-out rule must not display another pipe bank.
const canonicalPipes: Record<string, string> = { ...generated.canonicalPipes, '19875226841': '1', '42554': '162' }
delete canonicalPipes['250']
delete canonicalPipes['252']
export const pipingTopology: PipingTopology = {
  ...generated as PipingTopology,
  canonicalPipes,
  routes: (generated.routes as PipingTopology['routes'])
    // This reverse duplicate is commented out in VertexToVertexRule.cs.
    .filter(route => !(route.from === 'C1401' && route.to === 'V1402'))
    .map(route => route.from === 'D1604' && route.to === 'M1602' && !route.segments.some(segment => segment.pipe === '1756445276570')
      ? { ...route, segments: [{ pipe: '1756445276570', forward: false }, ...route.segments] }
      : route),
}
export const pipingGenerated = generated
