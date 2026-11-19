export type AiDeployment = '公有云服务' | '私有化部署' | '混合服务' | '本地运行'

export interface AiModel {
  model: string
  version: string
  deployment: AiDeployment
  provider?: string
}

export interface AiData {
  ai_call_count: number
  ai_models_used: AiModel[]
  ai_usage_scenarios: string[]
  ai_input_token_count?: number
  ai_output_token_count?: number
  ai_remark?: string
}

export type ValidationResult = { code: 19; msg: string } | null

const deployments = ['公有云服务', '私有化部署', '混合服务', '本地运行']
const fields = ['ai_call_count', 'ai_models_used', 'ai_usage_scenarios', 'ai_input_token_count', 'ai_output_token_count', 'ai_remark']
const modelFields = ['model', 'version', 'deployment', 'provider']
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0
const error = (message: string): ValidationResult => ({ code: 19, msg: `数据错误：${message}` })

/** Validate only when the project is subject to the 2026 rules and the experiment is complete. */
export function validateAiData(value: unknown, required: boolean): ValidationResult {
  if (!required) return null
  if (value === undefined) return error('ai_data缺失')
  if (!object(value)) return error('ai_data格式错误')
  const unknownField = Object.keys(value).find(key => !fields.includes(key))
  if (unknownField !== undefined) return error(`ai_data字段名称[${unknownField}]错误`)
  if (value.ai_call_count === undefined) return error('ai_call_count缺失')
  if (!integer(value.ai_call_count)) return error('ai_call_count格式错误')
  if (value.ai_models_used === undefined) return error('ai_models_used缺失')
  if (!Array.isArray(value.ai_models_used)) return error('ai_models_used格式错误')
  if ((value.ai_call_count as number) > 0 && value.ai_models_used.length === 0) return error('ai_models_used不能为空')
  for (const model of value.ai_models_used) {
    if (!object(model)) return error('ai_models_used格式错误')
    const unknownModelField = Object.keys(model).find(key => !modelFields.includes(key))
    if (unknownModelField !== undefined) return error(`ai_models_used字段名称[${unknownModelField}]错误`)
    for (const key of ['model', 'version', 'deployment']) {
      if (typeof model[key] !== 'string' || !model[key].trim()) return error(`ai_models_used中${key}缺失`)
    }
    if (!deployments.includes(model.deployment as string)) return error('ai_models_used中deployment错误')
    if (model.provider !== undefined && typeof model.provider !== 'string') return error('ai_models_used中provider格式错误')
  }
  if (value.ai_usage_scenarios === undefined) return error('ai_usage_scenarios缺失')
  if (!Array.isArray(value.ai_usage_scenarios) || value.ai_usage_scenarios.some(item => typeof item !== 'string' || !item.trim())) return error('ai_usage_scenarios格式错误')
  if ((value.ai_call_count as number) > 0 && value.ai_usage_scenarios.length === 0) return error('ai_usage_scenarios不能为空')
  for (const key of ['ai_input_token_count', 'ai_output_token_count']) {
    if (value[key] !== undefined && !integer(value[key])) return error(`${key}格式错误`)
  }
  if (value.ai_remark !== undefined && typeof value.ai_remark !== 'string') return error('ai_remark格式错误')
  return null
}

export async function uploadExperimentResult(
  accessToken: string,
  result: Record<string, unknown>,
  options: { requiresAiData: boolean; fetch?: typeof fetch },
): Promise<unknown> {
  const validation = validateAiData(result.ai_data, options.requiresAiData && result.status === 1)
  if (validation) throw new Error(validation.msg)
  const url = new URL('https://www.ilab-x.com/open/api/v2/data_upload')
  url.searchParams.set('access_token', accessToken)
  const response = await (options.fetch ?? fetch)(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  })
  if (!response.ok) throw new Error(`实验结果回传失败：HTTP ${response.status}`)
  return response.json()
}
