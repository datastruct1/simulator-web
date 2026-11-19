import type { FlowAssessmentDefinition } from './flowAssessment'

export interface DeviceState {
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
  [key: string]: unknown
}

export interface FlowRule {
  name: string
  type: string
  value?: number
  message?: string
  weight?: number
}

export interface FlowStep {
  name: string
  description: string
  deviceId?: string
  rules: FlowRule[]
  stage: string
}

export interface Workflow {
  id: string
  name: string
  category: string
  page: string
  requiresSafety: boolean
  source: string
  steps: FlowStep[]
  initial: Record<string, Partial<DeviceState>>
  final?: Record<string, Partial<DeviceState>>
  assessment?: FlowAssessmentDefinition
}

export interface Alarm {
  id: string
  time: string
  deviceId: string
  level: '警告' | '严重' | '提示'
  message: string
  acknowledged: boolean
}

export type DeviceChanges = Partial<Pick<DeviceState, 'value' | 'working' | 'error' | 'enabled'>>

export interface OperationLog {
  id: string
  time: string
  user: string
  action: string
  deviceId: string
  level: string
  at?: number
  changes?: DeviceChanges
  before?: DeviceChanges
}

export interface ModalState {
  type: string
  title: string
  payload: any
}
