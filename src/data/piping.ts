import generated from './piping.generated.json'
import type { MediaDef, PipingTopology } from '../types/piping'

const legendColors: Record<string, string> = {
  nitrogen: '#DBB620', methanol: '#990000', 'cold-water': '#0000FF', 'hot-water': '#FF0000',
  'water-glycol': '#00CC00', 'cold-water-glycol': '#00CC00', 'hot-water-glycol': '#00CC00',
}
export const MEDIA = (generated.media as MediaDef[]).map(medium => ({ ...medium, color: legendColors[medium.id] || medium.color }))
export const pipingTopology = generated as PipingTopology
export const pipingGenerated = generated
