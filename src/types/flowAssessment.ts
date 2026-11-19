import type { ScoreDetail } from '../data/workspace'

export type FlowAssessmentRuleRole = 'condition' | 'trigger'
// Strings only record invalid/non-finite legacy weights without serializing NaN.
export type FlowAssessmentRawWeight = number | null | string

export interface FlowAssessmentRule {
  name: string
  type: string
  value?: number | null
  sourceValue?: number | null
  weight?: number | null
  rawWeight?: FlowAssessmentRawWeight
  message?: string | null
  source?: string
}

export interface FlowAssessmentStage {
  name: string
  watch?: string[]
  source?: string
  conditions: FlowAssessmentRule[]
  triggers: FlowAssessmentRule[]
}

/** Original WPF stages, not the flattened steps used by the Web demo. */
export interface FlowAssessmentDefinition {
  schemaVersion: 1
  name: string
  score: number
  source: string
  stages: FlowAssessmentStage[]
  notes?: string[]
}

/** Structural subset of DeviceState; no simulator state or Vue dependency. */
export interface FlowAssessmentDevice {
  id?: string
  kind?: string
  value?: number
  working?: boolean
}
export type FlowAssessmentDevices = Readonly<Record<string, FlowAssessmentDevice>>

export interface FlowAssessmentReading {
  deviceId: string
  /** Web value (valve/hose opening is a percentage). */
  value: number | null
  /** Recorder-compatible scalar: opening / 100, motor working 0/1, or sensor value. */
  stateValue: number | null
}

export interface FlowAssessmentRuleResult {
  id: string
  stageIndex: number
  role: FlowAssessmentRuleRole
  ruleIndex: number
  rawWeight: FlowAssessmentRawWeight
  weightSpecified: boolean
  /** Non-negative normalized share of the whole playbook, not of this stage. */
  weight: number
  maxScore: number
  /** null means the stage has not settled; false is a permanent condition failure. */
  passed: boolean | null
  score: number
  evaluatedAt: number | null
  completedAt: number | null
  readings: FlowAssessmentReading[]
}

export interface FlowAssessmentWeightConfiguration {
  strategy: 'original' | 'residual' | 'normalized' | 'mean-fallback' | 'equal-fallback' | 'empty'
  /** null only when finite raw weights overflow their aggregate sum. */
  rawExplicitSum: number | null
  missingCount: number
  /** Base weight assigned to missing/invalid rules before final normalization. */
  defaultWeight: number | null
  notes: string[]
}

/** Persist this whole JSON-safe snapshot to resume, rather than recreating it. */
export interface FlowAssessmentRuntime {
  schemaVersion: 1
  definition: FlowAssessmentDefinition
  maxScore: number
  nextStageIndex: number
  stageCompletedAt: (number | null)[]
  rules: FlowAssessmentRuleResult[]
  weightConfiguration: FlowAssessmentWeightConfiguration
  notes: string[]
}

export interface FlowAssessmentFeedResult {
  runtime: FlowAssessmentRuntime
  advanced: boolean
  completed: boolean
}

/** Compatible with workspace ScoreDetail[], with assessment audit metadata. */
export interface FlowAssessmentScoreDetail extends ScoreDetail {
  stageIndex: number
  role: FlowAssessmentRuleRole
  weight: number
  rawWeight: FlowAssessmentRawWeight
  evaluatedAt: number | null
  completedAt: number | null
  source: string
}
