import type { FlowAssessmentRuntime } from '../types/flowAssessment'

import originalT11 from './questions/T11Exam.json'
import originalT12 from './questions/T12Exam.json'

/** Versioned, browser-local business data. The original WPF question keys are not independently certified. */
export const WORKSPACE_SCHEMA = 3
export const WORKSPACE_STORAGE_KEY = 'simulator_web.workspace.v3'
export const questionTypes = ['单选题', '多选题', '判断题'] as const
export type QuestionType = typeof questionTypes[number]
export type AssessmentMode = 'practice' | 'exam'
export type ReturnPage = 'student' | 'exam'
export interface QuestionOption { id: string; text: string; correct: boolean }
export interface WorkspaceQuestion {
  id: string; type: QuestionType; content: string; options: QuestionOption[]; explanation: string
  tags: string[]; points: number; locked: boolean; source: string; updatedAt: string
}
export interface WorkspaceStudent { id: string; studentNo: string; name: string; group: string }
export interface WorkspacePaper {
  id: string; title: string; description: string; questionIds: string[]; durationMinutes: number
  maxScore: number; passPercent: number; shuffle: boolean; createdAt: string; updatedAt: string
}
export interface WorkspaceFile {
  id: string; name: string; type: string; size: number; addedAt: string; publishedAt: string | null
  allStudents: boolean; participants: string[]; origin: 'builtin' | 'uploaded'; storage: 'builtin' | 'indexeddb' | 'memory'
  builtinText?: string
}
export type ConditionKind = 'device' | 'sensor' | 'time' | 'state' | 'logic' | 'always'
export type DeviceProperty = 'value' | 'working' | 'error' | 'enabled'
export type Comparator = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'between'
export interface SceneCondition {
  id: string; kind: ConditionKind; deviceType: string; deviceId: string; property: DeviceProperty
  comparator: Comparator; value: number; upper: number; boolValue: boolean; seconds: number
  stateId: string; stateStatus: 'active' | 'stopped' | 'disabled'; source: 'user' | 'any'
  logic: 'and' | 'or' | 'nand' | 'nor'; children: SceneCondition[]
}
export interface LocalWorkload {
  schemaVersion: 1; name: string; elapsed: number
  devices: Record<string, { value: number; working: boolean; error: boolean; enabled: boolean; mode?: string }>
}
export interface SceneAction {
  id: string; kind: 'score' | 'activate' | 'stop' | 'disable' | 'load' | 'device' | 'notify'
  score: number; weight: number; stateId: string; workloadName: string; workload?: LocalWorkload
  deviceId: string; property: DeviceProperty; value: number; boolValue: boolean; message: string
}
export interface SceneEvent { id: string; name: string; condition: SceneCondition; action: SceneAction }
export interface SceneEventGroup { id: string; name: string; kind: 'score' | 'transfer'; events: SceneEvent[] }
export interface SceneState {
  id: string; name: string; kind: 'initial' | 'transition' | 'final'; groups: SceneEventGroup[]; conditions: SceneCondition[]
}
export interface SequenceOperation { id: string; index: number; weight: number; deviceId: string; operation: '打开' | '关闭' }
export interface SceneDefinition {
  id: string; name: string; description: string; flowId: string; page: string; requiresSafety: boolean
  durationMinutes: number; maxScore: number; passPercent: number; mode: 'state' | 'sequence'
  states: SceneState[]; initialActiveStates: string[]; workloadName: string; workload?: LocalWorkload
  legacyOps: SequenceOperation[]; createdAt: string; updatedAt: string
}
export interface WorkspaceTask {
  id: string; title: string; description: string; kind: 'theory' | 'operation'; mode: AssessmentMode
  paperId: string; operationId: string; startAt: string; endAt: string; durationMinutes: number
  allStudents: boolean; participants: string[]; attachmentIds: string[]; scoreVisible: boolean; remark: string
  publishedAt: string | null; createdAt: string; updatedAt: string
  snapshot?: { questions?: WorkspaceQuestion[]; scene?: SceneDefinition; flowId?: string; maxScore?: number; passPercent?: number }
}
export interface ScoreDetail {
  id: string; kind: 'question' | 'operation' | 'penalty'; title: string; type: string; deviceId: string
  response: string; expected: string; passed: boolean; maxScore: number; score: number; message: string
  explanation: string; question?: WorkspaceQuestion
}
export interface WorkspaceScore {
  id: string; studentId: string; studentNo: string; studentName: string; title: string
  kind: 'theory' | 'operation'; mode: AssessmentMode; taskId: string; category: string
  startedAt: number; submittedAt: string; durationSeconds: number; score: number; maxScore: number
  accuracy: number; passed: boolean; scoreVisible: boolean; reason: 'manual' | 'timeout'; notes: string; details: ScoreDetail[]
}
export interface TheorySession {
  id: string; studentId: string; studentNo: string; studentName: string; title: string; mode: AssessmentMode
  questions: WorkspaceQuestion[]; answers: Record<string, string[]>; revealed: string[]; currentIndex: number
  startedAt: number; deadlineAt: number | null; durationMinutes: number; maxScore: number; passPercent: number
  returnPage: ReturnPage; taskId: string; scoreVisible: boolean
}
export interface LocalFlowRule { name: string; type: string; value?: number; weight?: number; message?: string }
export interface OperationStep { id: string; name: string; description: string; deviceId: string; rules: LocalFlowRule[]; maxScore: number }
export interface OperationLaunch {
  id: string; operationId: string; flowId: string; title: string; mode: AssessmentMode; returnPage: ReturnPage
  durationMinutes: number; maxScore: number; passPercent: number; taskId: string; scoreVisible: boolean
  studentId: string; studentNo: string; studentName: string; scene?: SceneDefinition
  taskDeadlineAt?: number
}
export interface RecordedOperation {
  deviceId: string; operation: '打开' | '关闭'; at: number; logId: string
  changes?: Partial<Record<DeviceProperty, number | boolean>>
  sequenceEligible?: boolean
}
export interface OperationSession extends OperationLaunch {
  startedAt: number; deadlineAt: number | null; steps: OperationStep[]; completedSteps: string[]; observedStepIndex: number
  recordedOps: RecordedOperation[]; lastLogId: string; runtimeEvents: Record<string, number>
  activeStateIds: string[]; stoppedStateIds: string[]; disabledStateIds: string[]
  finished: boolean; autoDemoDetected: boolean; runReady: boolean
  flowAssessment?: FlowAssessmentRuntime
  lastFlowAssessmentAt?: number
  flowAssessmentReadyAfter?: number
}
export interface WorkspaceState {
  questions: WorkspaceQuestion[]; papers: WorkspacePaper[]; tasks: WorkspaceTask[]; students: WorkspaceStudent[]
  files: WorkspaceFile[]; scores: WorkspaceScore[]; scenes: SceneDefinition[]; hiddenFlowIds: string[]
  favourites: Record<string, string[]>; activeTheory: TheorySession | null; activeOperation: OperationSession | null
  submittedTaskKeys: string[]
  pendingLaunch: OperationLaunch | null; lastScoreId: string; offlineStudentId: string
  teacherTab: string; studentTab: string; examTab: string; editorDraft: SceneDefinition | null
  editorSelectedState: string; recording: { active: boolean; autoIncrement: boolean; nextIndex: number; lastLogId: string }
}
export const conditionLabels: Record<ConditionKind, string> = {
  device: '设备操作', sensor: '传感器数值', time: '时间条件', state: '状态变更', logic: '逻辑条件', always: '始终成立',
}
export const propertyLabels: Record<DeviceProperty, string> = { value: '数值 / 开度', working: '运行 / 打开', error: '故障', enabled: '启用' }
export const logicLabels = { and: '逻辑与（全部满足）', or: '逻辑或（任一满足）', nand: '逻辑非与', nor: '逻辑非或' }
export const builtinMaterials = [
  { id: 'material-guide', name: '本地工作台使用说明.txt', text: '甲醇加注模拟平台 Web 本地工作台\n\n教师：管理题库、组卷、设置任务并发布到本浏览器。\n学生：领取分配任务、练习或考试，交卷后根据实际答案和操作自动评分。\n文件内容保存在当前浏览器，不向远程客户端发送。\n开始惰化或加注操作必须完成安全检查。\n考试计时采用真实时间，切换页面不暂停。\n本地题库保留原 WPF 的 T11/T12 答案和解析；部分内容可能需要教师校核，不构成认证考试或安全作业指导。\n成绩与文件可导出备份。清除浏览器数据会丢失本地记录。' },
  { id: 'material-safety', name: '甲醇加注学习提示.txt', text: '甲醇加注学习提示（本地演示资料）\n\n本平台用于界面与流程训练，不替代实际作业程序。\n练习开始前，完成加注作业前安全检查表，确认人员防护、通信、应急设施与双方签收。\n按流程提示操作阀门、泵和通风设备；遇到异常应先采取安全隔离措施。\n提交考核后可在成绩详情查看已完成步骤与遗漏得分点。\n请以经审核的船舶/加注站操作规程为准。' },
] as const

/** Bundle all 590 original questions without changing any WPF file. Vite includes them in the production build. */
export function createSeedQuestions(): WorkspaceQuestion[] {
  return [{ tag: 'T11', rows: originalT11 }, { tag: 'T12', rows: originalT12 }].flatMap(({ tag, rows }) =>
    rows.map(row => ({
      id: `${tag.toLowerCase()}-${row.Qid}`, type: row.QType as QuestionType, content: row.Title,
      options: row.Options.map((option, index) => ({ id: `${tag.toLowerCase()}-${row.Qid}-${index}`, text: option.Content, correct: row.Answer.includes(String.fromCharCode(65 + index)) })),
      explanation: row.Explain, tags: [tag], points: 1, locked: false,
      source: `${tag} 题库（答案待教师校核）`, updatedAt: '',
    })),
  )
}
export interface NativeExamItem { id: number; type: string; name: string; minutes: number; flowId: string; note: string }
const nativeNote = '该题未提供独立完整评分定义；可练习关联流程，考评规则需教师配置。'
export const nativePracticeItems: NativeExamItem[] = [
  { id: 1, type: '操作题', name: '完成惰化操作练习', minutes: 10, flowId: 'shore-inerting', note: '' },
  { id: 2, type: '操作题', name: '完成注操作练习', minutes: 10, flowId: 'bunkering', note: '' },
  { id: 3, type: '操作题', name: '完成扫气操作练习', minutes: 10, flowId: 'bunkering-purge', note: '' },
  { id: 4, type: '操作题', name: '完成供应供应操作练习', minutes: 10, flowId: 'supply', note: '' },
  { id: 5, type: '操作题', name: '完成供应端扫气操作练习', minutes: 10, flowId: 'supply-purge', note: '' },
  { id: 6, type: '操作题', name: '完成风机启动操作练习', minutes: 20, flowId: 'shore-inerting', note: nativeNote },
  { id: 7, type: '操作题', name: '完成燃料回收操作练习', minutes: 5, flowId: 'recovery-all', note: '' },
  { id: 8, type: '操作题', name: '完成水醇操作练习', minutes: 20, flowId: 'heating', note: '' },
  { id: 9, type: '操作题', name: '完成冷热水撬块操作练习', minutes: 20, flowId: 'cooling', note: '' },
  { id: 10, type: '故障模拟', name: '完成主泵供应出现泵故障操作练习', minutes: 20, flowId: 'pump-failure', note: '' },
  { id: 11, type: '故障模拟', name: '完成副泵供应出现泵故障操作练习', minutes: 20, flowId: 'pump-failure', note: nativeNote },
  { id: 12, type: '故障模拟', name: '完成维修扫气操作练习', minutes: 20, flowId: 'supply-purge', note: nativeNote },
  { id: 13, type: '故障模拟', name: '完成发动机故障操作练习', minutes: 20, flowId: 'stop', note: nativeNote },
  { id: 14, type: '故障模拟', name: '完成传感器警报操作练习', minutes: 20, flowId: 'supply', note: nativeNote },
]
export const nativeExamItems: NativeExamItem[] = [
  { id: 1, type: 'T11选择题', name: 'T11题库随机题目', minutes: 60, flowId: '', note: '默认时长为 60 分钟，开始前可调整。' },
  { id: 2, type: 'T12选择题', name: 'T12题库随机题目', minutes: 60, flowId: '', note: '默认时长为 60 分钟，开始前可调整。' },
  { id: 3, type: '实际操作题', name: '完成惰化操作', minutes: 10, flowId: 'shore-inerting', note: '' },
  { id: 4, type: '实际操作题', name: '完成加注操作', minutes: 10, flowId: 'bunkering', note: '' },
  { id: 5, type: '实际操作题', name: '完成扫气操作', minutes: 10, flowId: 'bunkering-purge', note: '' },
  { id: 6, type: '实际操作题', name: '完成供应操作', minutes: 10, flowId: 'supply', note: '' },
  { id: 7, type: '实际操作题', name: '完成扫气操作', minutes: 10, flowId: 'supply-purge', note: '' },
  { id: 8, type: '实际操作题', name: '完成燃料回收操作', minutes: 10, flowId: 'recovery-all', note: '' },
  { id: 9, type: '实际操作题', name: '完成泵支路切换操作', minutes: 10, flowId: 'load-balance', note: '' },
  { id: 10, type: '故障模拟题', name: '完成主泵供应出现泵故障', minutes: 20, flowId: 'pump-failure', note: '' },
  { id: 11, type: '故障模拟题', name: '完成副泵供应出现泵故障', minutes: 20, flowId: 'pump-failure', note: nativeNote },
  { id: 12, type: '故障模拟题', name: '完成维修扫气', minutes: 20, flowId: 'supply-purge', note: nativeNote },
  { id: 13, type: '故障模拟题', name: '完成发动机故障', minutes: 20, flowId: 'stop', note: nativeNote },
  { id: 14, type: '故障模拟题', name: '完成传感器警报', minutes: 20, flowId: 'supply', note: nativeNote },
]
