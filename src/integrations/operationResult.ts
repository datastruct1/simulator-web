import type { OperationSession, WorkspaceScore } from '../data/workspace'
import type { AiData, AiModel } from './ilab'
import { validateAiData } from './ilab'
import type { IlabExperimentResult, IlabExperimentStep } from './result'

export interface IlabOperationContext {
  operationId: string
  username: string
  appid: string
  mode: 'test' | 'production'
  projectTitle: string
  requiresAiData: boolean
  startedAt: number
  aiCalls: AiCallRecord[]
}

export interface AiCallRecord {
  model: AiModel
  scenario: string
  inputTokens?: number
  outputTokens?: number
}

/** Call this with actual provider response metadata, never with the documentation's example values. */
export function collectAiData(calls: AiCallRecord[]): AiData {
  const models = new Map<string, AiModel>()
  const scenarios = new Set<string>()
  for (const call of calls) {
    for (const key of ['inputTokens', 'outputTokens'] as const) {
      if (call[key] !== undefined && (!Number.isSafeInteger(call[key]) || call[key]! < 0)) throw new Error('AI token 使用量必须为非负安全整数。')
    }
    models.set(JSON.stringify(call.model), { ...call.model })
    scenarios.add(call.scenario)
  }
  const data: AiData = {
    ai_call_count: calls.length,
    ai_models_used: [...models.values()],
    ai_usage_scenarios: [...scenarios],
  }
  for (const [source, target] of [
    ['inputTokens', 'ai_input_token_count'],
    ['outputTokens', 'ai_output_token_count'],
  ] as const) {
    // Unknown token usage must stay unknown, rather than being reported as zero.
    if (calls.length && calls.every(call => call[source] !== undefined)) {
      data[target] = calls.reduce((sum, call) => sum + call[source]!, 0)
    }
  }
  const failure = validateAiData(data, true)
  if (failure) throw new Error(failure.msg)
  return data
}

/** Map recorded human actions, not animation progress, to process-only steps. No padding or invented step scores. */
export function buildOperationResult(context: IlabOperationContext, session: OperationSession, score: WorkspaceScore): IlabExperimentResult {
  if (context.operationId !== session.id || context.startedAt !== session.startedAt || score.startedAt !== session.startedAt) throw new Error('实验空间记录与本次操作会话不一致。')
  if (session.returnPage !== 'student' || score.kind !== 'operation') throw new Error('离线考核和理论答题不参与本次实验回传。')
  if (session.autoDemoDetected) throw new Error('本次检测到自动演示，不能作为真实手动实验回传。')
  const endTime = Date.parse(score.submittedAt)
  if (!Number.isFinite(endTime) || endTime <= session.startedAt || !Number.isFinite(score.maxScore) || score.maxScore <= 0 || !Number.isFinite(score.score)) throw new Error('实验时间或成绩无效，不能回传。')
  const seen = new Set<string>()
  const operations = session.recordedOps.filter(op => {
    if (op.sequenceEligible !== true || !op.logId || seen.has(op.logId) || !Number.isSafeInteger(op.at) || op.at < session.startedAt || op.at > endTime) return false
    seen.add(op.logId)
    return true
  }).sort((a, b) => a.at - b.at)
  const groups = new Map<number, typeof operations>()
  for (const operation of operations) {
    const group = groups.get(operation.at) ?? []
    group.push(operation)
    groups.set(operation.at, group)
  }
  const steps: IlabExperimentStep[] = []
  let startTime = session.startedAt
  let pending: typeof operations = []
  for (const [at, group] of groups) {
    pending.push(...group)
    // Multiple changes in the same millisecond are one observed interval, not fabricated extra steps.
    if (at <= startTime) continue
    steps.push({
      seq: steps.length + 1,
      title: pending.map(op => `${op.operation}${op.deviceId}`).join('；').slice(0, 100),
      startTime,
      endTime: at,
      timeUsed: Math.ceil((at - startTime) / 1000),
      expectTime: 0,
      maxScore: 0,
      score: 0,
      repeatCount: pending.length,
      evaluation: '已记录实际手动设备操作；本条过程记录不单独计分。',
      scoringModel: '真实手动操作过程记录，不单独赋分；实验总分沿用现有操作考核评分。',
      remarks: '步骤用时是上一个操作边界至本操作的墙钟观测区间，不代表设备动作持续时间；合理用时尚未配置。',
      ext_data: { actions: pending.map(op => ({ logId: op.logId, deviceId: op.deviceId, operation: op.operation, at: op.at, changes: op.changes ?? {} })) },
    })
    startTime = at
    pending = []
  }
  // Actions at the exact start timestamp can only be attached to an actual elapsed interval.
  if (pending.length && endTime > startTime) {
    steps.push({ seq: steps.length + 1, title: pending.map(op => `${op.operation}${op.deviceId}`).join('；').slice(0, 100), startTime, endTime,
      timeUsed: Math.ceil((endTime - startTime) / 1000), expectTime: 0, maxScore: 0, score: 0, repeatCount: pending.length,
      evaluation: '已记录实际手动设备操作；本条过程记录不单独计分。', scoringModel: '真实手动操作过程记录，不单独赋分；实验总分沿用现有操作考核评分。',
      remarks: '步骤用时是会话开始至本操作记录结束的墙钟观测区间，不代表设备动作持续时间；合理用时尚未配置。',
      ext_data: { actions: pending.map(op => ({ logId: op.logId, deviceId: op.deviceId, operation: op.operation, at: op.at, changes: op.changes ?? {} })) } })
  }
  const status = session.finished ? 1 : 2
  if (!steps.length) throw new Error('没有可回传的真实手动操作记录。')
  if (steps.length > 200) throw new Error('真实操作记录超过接口的 200 步上限，需要先配置经审核的教学步骤分组，不能直接截断。')
  if (status === 1 && steps.length < 10) throw new Error(`已完成实验仅有 ${steps.length} 条真实操作步骤，接口要求至少 10 步；不会补造步骤。`)
  return {
    username: context.username,
    appid: context.appid,
    title: context.projectTitle,
    childProjectTitle: session.title.slice(0, 100),
    status,
    score: Math.round(Math.min(100, Math.max(0, score.score / score.maxScore * 100))),
    startTime: session.startedAt,
    endTime,
    timeUsed: Math.ceil((endTime - session.startedAt) / 1000),
    originId: `sim_${session.id.replace(/[^A-Za-z0-9_]/g, '_')}`,
    steps,
    ai_data: collectAiData(context.aiCalls),
    ext_data: {
      scoreId: score.id,
      flowId: session.flowId,
      source: 'browser_manual_operation',
      scoreSource: 'existing_workspace_assessment',
      completed: session.finished,
      submissionReason: score.reason,
      rawScore: score.score,
      rawMaxScore: score.maxScore,
      gradingNotes: score.notes,
      assessmentDetails: score.details,
    },
  }
}
