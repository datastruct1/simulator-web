import type { OperationSession, RecordedOperation, SceneCondition, ScoreDetail, TheorySession, WorkspaceScore } from '../../../data/workspace'
import { answerIsCorrect, answerLetters, compareValue, conditionText, correctIds, newId, round } from './domain'
import { flowAssessmentDetails } from './flowAssessment'

export interface DeviceValue { id: string; kind?: string; value: number; working: boolean; error: boolean; enabled: boolean }
export interface ConditionContext {
  devices: Record<string, DeviceValue>; elapsedSeconds: number; recordedOps: RecordedOperation[]
  activeStateIds: string[]; stoppedStateIds: string[]; disabledStateIds: string[]
}
export function evaluateCondition(condition: SceneCondition, context: ConditionContext, depth = 0): boolean {
  if (depth > 6) return false
  if (condition.kind === 'always') return true
  if (condition.kind === 'time') return context.elapsedSeconds >= condition.seconds
  if (condition.kind === 'state') return (condition.stateStatus === 'active' ? context.activeStateIds : condition.stateStatus === 'stopped' ? context.stoppedStateIds : context.disabledStateIds).includes(condition.stateId)
  if (condition.kind === 'logic') {
    if (!condition.children.length) return false
    const values = condition.children.map(child => evaluateCondition(child, context, depth + 1))
    if (condition.logic === 'and') return values.every(Boolean)
    if (condition.logic === 'or') return values.some(Boolean)
    if (condition.logic === 'nand') return !values.every(Boolean)
    return !values.some(Boolean)
  }
  const ids = condition.deviceId.trim().split(/\s+/).filter(Boolean)
  if (!ids.length) return false
  return ids.every(id => {
    const device = (Object.hasOwn(context.devices, id) ? context.devices[id] : undefined) ?? Object.values(context.devices).find(item => item.id.toLowerCase() === id.toLowerCase())
    if (!device) return false
    const expected = condition.property === 'value' ? condition.value : condition.boolValue
    if (condition.source === 'user') {
      // A prior click on the device is not evidence of a later automatic change.
      const operation = [...context.recordedOps].reverse().find(op => op.deviceId.toLowerCase() === device.id.toLowerCase() && op.changes?.[condition.property] !== undefined)
      const manualValue = operation?.changes?.[condition.property]
      if (manualValue === undefined || !compareValue(manualValue, condition.comparator, expected, condition.upper)) return false
    }
    return compareValue(device[condition.property], condition.comparator, expected, condition.upper)
  })
}

export function theoryDetails(session: TheorySession): ScoreDetail[] {
  const totalWeight = session.questions.reduce((sum, question) => sum + question.points, 0) || 1
  return session.questions.map((question, index) => {
    const answers = session.answers[question.id] || [], passed = answerIsCorrect(question, answers), maxScore = session.maxScore * question.points / totalWeight
    return { id: question.id, kind: 'question', title: `第 ${index + 1} 题 · ${question.content}`, type: question.type, deviceId: '',
      response: answerLetters(question, answers), expected: answerLetters(question, correctIds(question)), passed,
      maxScore, score: passed ? maxScore : 0, message: passed ? '与本地题库答案一致' : answers.length ? '答案不一致（多选题采用全部选对计分）' : '本题未作答', explanation: question.explanation, question }
  })
}
export function sequenceDetails(session: OperationSession): ScoreDetail[] {
  const expected = [...(session.scene?.legacyOps || [])].sort((a, b) => a.index - b.index), actual = session.recordedOps.filter(op => op.sequenceEligible !== false).slice(0, 3000)
  const dp = Array.from({ length: expected.length + 1 }, () => new Uint16Array(actual.length + 1))
  const same = (i: number, j: number) => expected[i]!.deviceId.toLowerCase() === actual[j]!.deviceId.toLowerCase() && expected[i]!.operation === actual[j]!.operation
  for (let i = 1; i <= expected.length; i++) for (let j = 1; j <= actual.length; j++) dp[i]![j] = same(i - 1, j - 1) ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
  const matched = new Set<number>(); let i = expected.length, j = actual.length
  while (i > 0 && j > 0) {
    if (same(i - 1, j - 1)) { matched.add(i - 1); i--; j-- }
    else if (dp[i - 1]![j]! > dp[i]![j - 1]!) i--
    else j--
  }
  const totalWeight = expected.reduce((sum, op) => sum + op.weight, 0) || 1
  return expected.map((op, index) => {
    const passed = matched.has(index), maxScore = session.maxScore * op.weight / totalWeight
    return { id: op.id, kind: 'operation', title: `时间序号 ${op.index} · ${op.operation}${op.deviceId}`, type: '顺序操作', deviceId: op.deviceId,
      response: passed ? '匹配到本次手动操作序列' : '未匹配到符合顺序的操作', expected: `${op.operation}${op.deviceId}`, passed,
      maxScore, score: passed ? maxScore : 0, message: passed ? 'LCS 顺序匹配通过' : '遗漏步骤或操作顺序不一致', explanation: '' }
  })
}
export function operationDetails(session: OperationSession): ScoreDetail[] {
  if (session.scene?.mode === 'sequence') return sequenceDetails(session)
  if (session.scene) {
    const events = session.scene.states.flatMap(state => state.groups.flatMap(group => group.events.filter(event => event.action.kind === 'score').map(event => ({ event, state }))))
    const weight = events.reduce((sum, { event }) => sum + Math.max(0, event.action.score * event.action.weight), 0) || 1
    return events.map(({ event, state }) => {
      const fired = session.runtimeEvents[event.id] !== undefined, amount = event.action.score * event.action.weight * session.maxScore / weight
      const penalty = amount < 0, passed = penalty ? !fired : fired
      return { id: event.id, kind: penalty ? 'penalty' : 'operation', title: `${state.name} · ${event.name || '分数记录'}`, type: penalty ? '扣分条件' : '场景条件', deviceId: event.condition.deviceId,
        response: fired ? `事件于 ${round((session.runtimeEvents[event.id]! - session.startedAt) / 1000)} 秒触发` : '事件未触发', expected: conditionText(event.condition, session.scene),
        passed, maxScore: penalty ? 0 : amount, score: fired ? amount : 0, message: penalty ? fired ? '命中扣分条件' : '未命中扣分条件' : fired ? '满足本地场景得分条件' : '未满足条件或对应状态尚未激活', explanation: '' }
    })
  }
  if (session.flowAssessment) return flowAssessmentDetails(session.flowAssessment)
  return session.steps.map(step => {
    const passed = session.completedSteps.includes(step.id)
    return { id: step.id, kind: 'operation', title: step.name, type: '操作步骤', deviceId: step.deviceId,
      response: passed ? '本次手动流程已完成该步骤' : '未记录到该步骤完成', expected: step.description,
      passed, maxScore: step.maxScore, score: passed ? step.maxScore : 0,
      message: passed ? '按流程次序满足设备状态条件' : session.autoDemoDetected ? '自动演示完成的步骤不计入手动考核' : '尚未满足流程次序和完成条件', explanation: '' }
  })
}
export function makeScore(session: TheorySession | OperationSession, kind: 'theory' | 'operation', details: ScoreDetail[], reason: 'manual' | 'timeout', now = Date.now()): WorkspaceScore {
  const positive = details.filter(detail => detail.kind !== 'penalty'), score = round(Math.max(0, Math.min(session.maxScore, details.reduce((sum, detail) => sum + detail.score, 0))))
  const accuracy = positive.length ? round(positive.filter(detail => detail.passed).length / positive.length * 100) : 0
  return { id: newId('score'), studentId: session.studentId, studentNo: session.studentNo, studentName: session.studentName, title: session.title, kind,
    mode: session.mode, taskId: session.taskId, category: kind === 'theory' ? session.mode === 'exam' ? '理论考评' : '理论练习' : session.mode === 'exam' ? '操作考评' : '操作练习',
    startedAt: session.startedAt, submittedAt: new Date(now).toISOString(), durationSeconds: Math.max(0, Math.round((now - session.startedAt) / 1000)), score, maxScore: session.maxScore,
    accuracy, passed: score / session.maxScore * 100 >= session.passPercent, scoreVisible: session.scoreVisible, reason,
    notes: kind === 'theory' ? '本地自动评分；原 WPF 题库答案及解析可能需要教师校核，不构成认证成绩。' : '按本次手动流程进度 / 设备条件 / 操作记录在浏览器内评估，不替代 WPF 物理仿真引擎或正式考核。',
    details: details.map(detail => ({ ...detail, maxScore: round(detail.maxScore), score: round(detail.score) })) }
}
