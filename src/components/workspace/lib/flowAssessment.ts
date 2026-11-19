import type {
  FlowAssessmentDefinition, FlowAssessmentDevice, FlowAssessmentDevices, FlowAssessmentFeedResult,
  FlowAssessmentRawWeight, FlowAssessmentReading, FlowAssessmentRule, FlowAssessmentRuleResult,
  FlowAssessmentRuntime, FlowAssessmentScoreDetail, FlowAssessmentWeightConfiguration,
} from '../../../types/flowAssessment'

const motorKinds = new Set(['pump', 'fan', 'engine', 'heater'])
const percentageKinds = new Set(['valve', 'hose'])
const weightTolerance = 1e-12
const semanticsNotes = [
  '按原 RuleEngine：下一阶段全部触发器同时满足才结算；条件失败也推进，失败项不再补分；每帧最多推进一个阶段。',
  '原 RecorderService 将阀门开度除以 100，故原状态 >0.01 / <0.01 对应 Web 开度 >1% / <1%；等于 1% 时开关均不满足。',
  '设备编号优先原 ID 精确匹配，再匹配无歧义的大小写别名；空格分隔的多设备规则必须全部满足。数值比较保留原严格边界，缺少目标值不判通过。',
  '只应 feed 经调用方确认的手动考核快照；须隔离自动演示、工况加载和外部控制（禁止这些变更或维护手动影子快照），而非只过滤其 feed。最终明细不会重新扫描设备补分。',
]

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
function numberText(value: number): string {
  return String(Number(value.toPrecision(12)))
}
function rawWeight(rule: FlowAssessmentRule): FlowAssessmentRawWeight {
  const raw = Object.hasOwn(rule, 'rawWeight') ? rule.rawWeight : rule.weight
  return raw == null ? null : finite(raw) ? raw : String(raw)
}
function copyRule(rule: FlowAssessmentRule): FlowAssessmentRule {
  const copy = { ...rule, rawWeight: rawWeight(rule) }
  for (const key of ['value', 'sourceValue', 'weight'] as const) {
    if (copy[key] != null && !finite(copy[key])) copy[key] = null
  }
  return copy
}

function configureWeights(rules: FlowAssessmentRuleResult[]): { weights: number[]; configuration: FlowAssessmentWeightConfiguration } {
  const notes: string[] = []
  const missing = rules.map(rule => !finite(rule.rawWeight) || rule.rawWeight < 0)
  const missingCount = missing.filter(Boolean).length
  const bases = rules.map((rule, index) => missing[index] ? 0 : rule.rawWeight as number)
  const explicitSum = bases.reduce((sum, weight) => sum + weight, 0)
  const rawSum = rules.reduce((sum, rule) => sum + (finite(rule.rawWeight) ? rule.rawWeight : 0), 0)
  const rawExplicitSum = finite(rawSum) ? rawSum : null
  let strategy: FlowAssessmentWeightConfiguration['strategy'] = 'original'
  let defaultWeight: number | null = null

  for (const rule of rules) {
    if (rule.rawWeight !== null && (!finite(rule.rawWeight) || rule.rawWeight < 0)) {
      notes.push(`规则 ${rule.id} 原权重 ${rule.rawWeight} 无效，保留 rawWeight 并按缺失权重修正。`)
    }
  }
  if (!rules.length) {
    strategy = 'empty'
    notes.push('原流程无评分规则，不分配分数，不因流程为空给予满分。')
  } else if (missingCount && explicitSum <= 1 + weightTolerance) {
    strategy = 'residual'
    defaultWeight = (1 - Math.min(1, explicitSum)) / missingCount
    notes.push(`${missingCount} 条 null / 未定义 / 无效权重按原剩余份额等分：缺省权重 ${numberText(defaultWeight)}；不使用零分母。`)
  } else if (missingCount) {
    strategy = 'mean-fallback'
    const largest = bases.reduce((max, weight) => Math.max(max, weight), 0)
    const positiveCount = bases.filter(weight => weight > 0).length
    // Scaling first avoids overflow when individually finite legacy weights are huge.
    defaultWeight = largest * (bases.reduce((sum, weight) => sum + weight / largest, 0) / positiveCount)
    notes.push(`显式权重合计 ${finite(explicitSum) ? numberText(explicitSum) : '溢出'} 超过 1，不能分配负的剩余权重；缺失项取正权重均值 ${numberText(defaultWeight)} 后全局归一化。`)
  } else {
    notes.push('所有规则已显式设置权重；跳过原默认权重公式的零分母。')
    if (!finite(explicitSum) || Math.abs(explicitSum - 1) > weightTolerance) {
      strategy = 'normalized'
      notes.push(`原显式权重合计 ${finite(explicitSum) ? numberText(explicitSum) : '溢出'} 不为 1，按原非负权重比例全局归一化至外部 maxScore。`)
    }
  }
  if (defaultWeight !== null) for (let index = 0; index < bases.length; index++) if (missing[index]) bases[index] = defaultWeight
  let largest = bases.reduce((max, weight) => Math.max(max, weight), 0)
  if (rules.length && largest === 0) {
    strategy = 'equal-fallback'
    bases.fill(1)
    largest = 1
    notes.push('原权重全部为 0，无法归一化；确定性回退为所有规则等分（原零权重仍保留用于审计）。')
  }
  const scaledSum = largest > 0 ? bases.reduce((sum, weight) => sum + weight / largest, 0) : 0
  const weights = bases.map(weight => weight / largest / scaledSum)
  if (weights.length) {
    const largestIndex = bases.indexOf(largest)
    // Put floating-point residue on a positive rule, never on a deliberate zero rule.
    weights[largestIndex] = Math.max(0, 1 - weights.reduce((sum, weight, index) => sum + (index === largestIndex ? 0 : weight), 0))
  }
  return { weights, configuration: { strategy, rawExplicitSum, missingCount, defaultWeight, notes } }
}

/** Creates a frozen-in-time definition/weight ledger, with all rules initially unscored. */
export function createFlowAssessment(definition: FlowAssessmentDefinition, maxScore = definition.score): FlowAssessmentRuntime {
  if (!finite(maxScore) || maxScore < 0) throw new RangeError('maxScore 必须是非负有限数字。')
  if (!finite(definition.score) || definition.score < 0) throw new RangeError('原 playbook score 必须是非负有限数字。')
  const snapshot: FlowAssessmentDefinition = {
    ...definition,
    notes: [...(definition.notes ?? [])],
    stages: definition.stages.map(stage => ({ ...stage, watch: [...(stage.watch ?? [])], conditions: stage.conditions.map(copyRule), triggers: stage.triggers.map(copyRule) })),
  }
  const rules: FlowAssessmentRuleResult[] = snapshot.stages.flatMap((stage, stageIndex) =>
    (['condition', 'trigger'] as const).flatMap(role => (role === 'condition' ? stage.conditions : stage.triggers).map((rule, ruleIndex) => ({
      id: `${stageIndex}:${role}:${ruleIndex}`, stageIndex, role, ruleIndex, rawWeight: rawWeight(rule), weightSpecified: Object.hasOwn(rule, 'weight'),
      weight: 0, maxScore: 0, passed: null, score: 0, evaluatedAt: null, completedAt: null, readings: [],
    }))))
  const { weights, configuration } = configureWeights(rules)
  rules.forEach((rule, index) => { rule.weight = weights[index]!; rule.maxScore = maxScore * rule.weight })
  return {
    schemaVersion: 1, definition: snapshot, maxScore, nextStageIndex: 0,
    stageCompletedAt: snapshot.stages.map(() => null), rules, weightConfiguration: configuration,
    notes: [...new Set([...(snapshot.notes ?? []), ...configuration.notes, ...semanticsNotes])],
  }
}

function validId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 150 && !/\s|[\u0000-\u001f]/.test(id)
    && !['__proto__', 'constructor', 'prototype'].includes(id.toLowerCase())
}
type DeviceLookup = { exact: Map<string, FlowAssessmentDevice | null>; folded: Map<string, FlowAssessmentDevice | null> }
function deviceLookup(devices: FlowAssessmentDevices): DeviceLookup {
  const exact = new Map<string, FlowAssessmentDevice | null>(), folded = new Map<string, FlowAssessmentDevice | null>()
  const add = (id: unknown, device: FlowAssessmentDevice) => {
    if (!validId(id)) return
    if (!exact.has(id)) exact.set(id, device)
    else if (exact.get(id) !== device) exact.set(id, null)
    const key = id.toLowerCase()
    if (!folded.has(key)) folded.set(key, device)
    else if (folded.get(key) !== device) folded.set(key, null)
  }
  for (const [key, device] of Object.entries(devices)) {
    if (!validId(key) || !device || typeof device !== 'object' || Array.isArray(device)) continue
    add(key, device)
    add(device.id, device)
  }
  // The imported catalog has real Tit42/TIT42 and RG001/Rg001 duplicates.
  // Preserve exact WPF identifiers; only unambiguous aliases use case folding.
  return { exact, folded }
}
function inferredKind(id: string): string {
  if (/^p\d+$/i.test(id)) return 'pump'
  if (/^engine/i.test(id)) return 'engine'
  if (/^fan/i.test(id)) return 'fan'
  if (/^rg/i.test(id)) return 'hose'
  if (/^(pit|tit|lit|dit|di|do|fit)/i.test(id)) return 'sensor'
  if (/^t\d+$/i.test(id) || /tank|pipe/i.test(id)) return 'tank'
  return 'valve'
}
function reading(id: string, device: FlowAssessmentDevice | null | undefined): FlowAssessmentReading {
  const value = finite(device?.value) ? device.value : null
  const kind = typeof device?.kind === 'string' ? device.kind.toLowerCase() : inferredKind(id)
  const stateValue = motorKinds.has(kind)
    ? typeof device?.working === 'boolean' ? Number(device.working) : null
    : value === null ? null : percentageKinds.has(kind) ? value / 100 : value
  return { deviceId: id, value, stateValue }
}
function targetValue(rule: FlowAssessmentRule): number | null {
  const value = Object.hasOwn(rule, 'sourceValue') ? rule.sourceValue : rule.value
  return finite(value) ? value : null
}
function evaluate(rule: FlowAssessmentRule, lookup: DeviceLookup): { passed: boolean; readings: FlowAssessmentReading[] } {
  const ids = typeof rule.name === 'string' ? rule.name.trim().split(/\s+/).filter(Boolean) : []
  const readings = ids.map(id => reading(id, validId(id) ? lookup.exact.has(id) ? lookup.exact.get(id) : lookup.folded.get(id.toLowerCase()) : undefined))
  const target = targetValue(rule)
  const passed = readings.length > 0 && readings.every(({ stateValue }) => {
    if (stateValue === null) return false
    switch (rule.type) {
      // .NET double.Epsilon is the smallest positive double, NOT JS Number.EPSILON.
      case 'EqualsTo': return target !== null && Math.abs(stateValue - target) < Number.MIN_VALUE
      case 'LessThan': return target !== null && target - stateValue > Number.MIN_VALUE
      case 'GreaterThan': return target !== null && stateValue - target > Number.MIN_VALUE
      case 'ValveOpen': case 'DeviceOpen': return stateValue > 0.01
      case 'ValveClose': case 'DeviceClose': return stateValue < 0.01
      default: return false
    }
  })
  return { passed, readings }
}
function ruleDefinition(runtime: FlowAssessmentRuntime, result: FlowAssessmentRuleResult): FlowAssessmentRule {
  const stage = runtime.definition.stages[result.stageIndex]!
  return (result.role === 'condition' ? stage.conditions : stage.triggers)[result.ruleIndex]!
}

/**
 * Feed one complete eligible MANUAL devices snapshot, with a caller-provided timestamp.
 * No initial-device loading, demo-step completion or final-device rescan earns points.
 * Like WPF Feed, only the next stage may settle, and its conditions are not gates.
 */
export function feedFlowAssessment(runtime: FlowAssessmentRuntime, devices: FlowAssessmentDevices, at: number): FlowAssessmentFeedResult {
  if (!finite(at) || at < 0) throw new RangeError('评估时间必须是非负有限数字。')
  const index = runtime.nextStageIndex, stage = runtime.definition.stages[index]
  if (!stage) return { runtime, advanced: false, completed: true }
  const lookup = deviceLookup(devices)
  const triggers = stage.triggers.map(rule => evaluate(rule, lookup))
  if (!triggers.every(result => result.passed)) return { runtime, advanced: false, completed: false }
  const rules = runtime.rules.map(result => {
    if (result.stageIndex !== index) return result
    const evaluation = result.role === 'trigger' ? triggers[result.ruleIndex]! : evaluate(ruleDefinition(runtime, result), lookup)
    return {
      ...result, passed: evaluation.passed, score: evaluation.passed ? result.maxScore : 0,
      evaluatedAt: at, completedAt: evaluation.passed ? at : null, readings: evaluation.readings,
    }
  })
  const stageCompletedAt = [...runtime.stageCompletedAt]
  stageCompletedAt[index] = at
  const next = { ...runtime, nextStageIndex: index + 1, stageCompletedAt, rules }
  return { runtime: next, advanced: true, completed: next.nextStageIndex >= next.definition.stages.length }
}

function expectedText(rule: FlowAssessmentRule): string {
  if (rule.type === 'ValveOpen' || rule.type === 'DeviceOpen') return '原判分状态 > 0.01（阀门开度 >1%，电机运行）'
  if (rule.type === 'ValveClose' || rule.type === 'DeviceClose') return '原判分状态 < 0.01（阀门开度 <1%，电机停机）'
  const target = targetValue(rule)
  const comparator = { EqualsTo: '=', LessThan: '<', GreaterThan: '>' }[rule.type as 'EqualsTo' | 'LessThan' | 'GreaterThan']
  if (!comparator) return `不支持的原规则类型 ${rule.type}`
  if (target === null) return `${rule.type} 比较目标未定义（不判通过）`
  const normalized = rule.sourceValue != null && finite(rule.value) ? `；Web 目标 ${numberText(rule.value)}，sourceValue ${numberText(target)}` : ''
  return `原判分状态 ${comparator} ${numberText(target)}${normalized}`
}

/** All original rules, including zero-score pending stages; never reevaluates devices. */
export function flowAssessmentDetails(runtime: FlowAssessmentRuntime): FlowAssessmentScoreDetail[] {
  return runtime.rules.map(result => {
    const rule = ruleDefinition(runtime, result), stage = runtime.definition.stages[result.stageIndex]!, expected = expectedText(rule)
    const pending = result.passed === null, passed = result.passed === true
    const response = pending ? '阶段尚未触发结算' : result.readings.map(item => {
      if (item.stateValue === null) return `${item.deviceId}=无有效状态`
      const web = item.value === null ? '无数值' : numberText(item.value)
      return `${item.deviceId}=${web}${item.value !== item.stateValue ? `（原判分状态 ${numberText(item.stateValue)}）` : ''}`
    }).join('；')
    const weight = result.rawWeight === null ? result.weightSpecified ? 'null' : '未定义' : String(result.rawWeight)
    return {
      id: result.id, kind: 'operation', title: `${stage.name} · ${result.role === 'condition' ? '条件' : '触发器'} ${rule.name}`,
      type: rule.type, deviceId: rule.name, response, expected, passed, maxScore: result.maxScore, score: result.score,
      message: pending ? `阶段未触发，未结算得分${rule.message ? `；${rule.message}` : ''}` : passed ? 'OK' : rule.message ?? `条件未满足：${expected}`,
      explanation: `原总分 ${runtime.definition.score}；原权重 ${weight}；全流程归一化权重 ${numberText(result.weight)}。`,
      stageIndex: result.stageIndex, role: result.role, weight: result.weight, rawWeight: result.rawWeight,
      evaluatedAt: result.evaluatedAt, completedAt: result.completedAt, source: rule.source ?? stage.source ?? runtime.definition.source,
    }
  })
}
