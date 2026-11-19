import { validateAiData, type AiData } from './ilab.ts'

export interface IlabExperimentStep {
  seq: number
  title: string
  startTime: number
  endTime: number
  timeUsed: number
  expectTime: number
  maxScore: number
  score: number
  repeatCount: number
  evaluation: string
  scoringModel: string
  remarks?: string
  ext_data?: Record<string, unknown>
}

export interface IlabExperimentResult {
  username: string
  title: string
  status: 1 | 2
  score: number
  startTime: number
  endTime: number
  timeUsed: number
  appid: string
  originId: string
  steps: IlabExperimentStep[]
  childProjectTitle?: string
  group_id?: string
  group_name?: string
  role_in_group?: string
  group_members?: string
  ext_data?: Record<string, unknown>
  ai_data?: AiData
}

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max = Infinity) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max
const timestamp = (v: unknown) => integer(v, 1000000000000, 9999999999999)
const error = (code: number, reason: string) => ({ code, msg: `数据错误：${reason}` })
const stepFields = ['seq', 'title', 'startTime', 'endTime', 'timeUsed', 'expectTime', 'maxScore', 'score', 'repeatCount', 'evaluation', 'scoringModel', 'remarks', 'ext_data']

/** Local preflight, based on the official 2022 field table; the platform remains the final authority. */
export function validateExperimentResult(value: unknown, requiresAiData: boolean): { code: number; msg: string } | null {
  if (!object(value)) return error(6, '未发现有效的JSON格式实验数据')
  for (const field of ['username', 'title', 'appid', 'originId'] as const) {
    if (!text(value[field])) return error(6, `${field}缺失或格式错误`)
  }
  if ((value.title as string).length > 100) return error(6, 'title超出100字符')
  if (!/^[A-Za-z0-9_]+$/.test(value.originId as string)) return error(6, 'originId格式错误')
  if (!integer(value.status, 0)) return error(6, 'status格式错误')
  if (value.status !== 1 && value.status !== 2) return error(7, '非法实验状态')
  if (!integer(value.score, Number.MIN_SAFE_INTEGER)) return error(6, 'score格式错误')
  if ((value.score as number) < 0 || (value.score as number) > 100) return error(9, '实验成绩不符合[0,100]范围')
  if (!timestamp(value.startTime) || !timestamp(value.endTime) || (value.startTime as number) >= (value.endTime as number) || !integer(value.timeUsed, 1)) return error(6, '实验时间格式错误')
  if ((value.timeUsed as number) > Math.ceil(((value.endTime as number) - (value.startTime as number)) / 1000)) return error(8, '实验用时超出实验时间')
  for (const [field, max] of [['childProjectTitle', 100], ['group_id', 20], ['group_name', 20], ['role_in_group', 20], ['group_members', 20]] as const) {
    if (value[field] !== undefined && (typeof value[field] !== 'string' || (value[field] as string).length > max)) return error(6, `${field}格式或长度错误`)
  }
  if (value.ext_data !== undefined && !object(value.ext_data)) return error(6, 'ext_data格式错误')
  if (!Array.isArray(value.steps)) return error(6, 'steps缺失或格式错误')
  if (value.steps.length > 200) return error(10, '实验步骤数据超出[0,200]范围')
  if (value.status === 1 && value.steps.length < 10) return error(14, '已完成实验不少于十步')
  const sequences = new Set<number>()
  for (const step of value.steps) {
    if (!object(step)) return error(11, '实验步骤格式错误')
    if (Object.keys(step).some(field => !stepFields.includes(field))) return error(11, '实验步骤字段名称错误')
    if (!integer(step.seq, 0) || sequences.has(step.seq as number)) return error(11, 'seq缺失、非法或重复')
    sequences.add(step.seq as number)
    if (!text(step.title, 100)) return error(11, '实验步骤title缺失或超出100字符')
    if (!timestamp(step.startTime) || !timestamp(step.endTime) ||
      (step.startTime as number) < (value.startTime as number) || (step.endTime as number) > (value.endTime as number) ||
      (step.startTime as number) >= (step.endTime as number) || !integer(step.timeUsed, 1) ||
      (step.timeUsed as number) > Math.ceil(((step.endTime as number) - (step.startTime as number)) / 1000)) return error(11, '实验步骤时间格式或范围错误')
    for (const field of ['expectTime', 'repeatCount'] as const) {
      if (!integer(step[field], 0)) return error(11, `实验步骤${field}格式错误`)
    }
    for (const field of ['score', 'maxScore'] as const) {
      if (!integer(step[field], 0, 100)) return error(11, `实验步骤${field}不符合[0,100]要求`)
    }
    for (const field of ['evaluation', 'scoringModel'] as const) {
      if (!text(step[field], 200)) return error(11, `实验步骤${field}缺失或超出200字符`)
    }
    if (step.remarks !== undefined && (typeof step.remarks !== 'string' || step.remarks.length > 200)) return error(11, 'remarks格式或长度错误')
    if (step.ext_data !== undefined && !object(step.ext_data)) return error(11, '实验步骤ext_data格式错误')
  }
  return validateAiData(value.ai_data, requiresAiData && value.status === 1)
}
