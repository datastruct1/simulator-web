import { reactive, watch } from 'vue'
import type { OperationSession, WorkspaceScore } from '../data/workspace'
import type { IlabExperimentResult } from '../integrations/result'
import { validateExperimentResult } from '../integrations/result'
import { buildOperationResult, collectAiData, type AiCallRecord, type IlabOperationContext } from '../integrations/operationResult'

export interface IlabSession {
  username: string
  displayName: string
  csrfToken: string
  expiresAt: number
  mode: 'test' | 'production'
  projectTitle: string
  sessionId: string
}
interface IlabConfig { enabled: boolean; mode: 'test' | 'production'; appid: string; projectTitle: string; requiresAiData: boolean }
export interface IlabUploadJob {
  scoreId: string
  operationId: string
  username: string
  appid: string
  mode: 'test' | 'production'
  originId: string
  status: 'pending' | 'uploading' | 'uploaded' | 'failed' | 'blocked' | 'uncertain'
  message: string
  result?: IlabExperimentResult
  id?: string
  platformResponse?: { code: number; id?: string | number }
  report?: { status: 'uploading' | 'uploaded' | 'failed' | 'uncertain'; message: string; id?: string }
}
const storageKey = 'simulator_web.ilab.v1'
function readRecords(): { contexts: IlabOperationContext[]; jobs: IlabUploadJob[] } {
  if (typeof localStorage === 'undefined') return { contexts: [], jobs: [] }
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    if (value.schema !== 1 || !Array.isArray(value.contexts) || !Array.isArray(value.jobs)) return { contexts: [], jobs: [] }
    const contexts = value.contexts.filter((item: IlabOperationContext) => item && typeof item.operationId === 'string' && typeof item.username === 'string' && typeof item.appid === 'string' && Array.isArray(item.aiCalls))
    const jobs = value.jobs.filter((item: IlabUploadJob) => item && typeof item.scoreId === 'string' && typeof item.username === 'string' && typeof item.originId === 'string')
      .map((item: IlabUploadJob) => ({ ...item,
        status: item.status === 'uploading' ? 'uncertain' : item.status,
        message: item.status === 'uploading' ? '页面在回传期间关闭；需查询确认，不能直接重复提交。' : item.message,
        report: item.report?.status === 'uploading' ? { status: 'uncertain' as const, message: '页面在报告上传期间关闭，请在平台人工确认，不能重复上传。' } : item.report,
      }))
    return { contexts: contexts.slice(-200), jobs: jobs.slice(0, 200) }
  } catch { return { contexts: [], jobs: [] } }
}
const saved = readRecords()
const state = reactive({
  phase: 'idle' as 'idle' | 'local' | 'authenticating' | 'authenticated' | 'error',
  message: '',
  config: null as IlabConfig | null,
  session: null as IlabSession | null,
  contexts: saved.contexts,
  jobs: saved.jobs,
  storageError: '',
})
// Only public identity, real operation metadata and result snapshots are stored here. No ticket/token/SECRET/CSRF persistence.
watch(() => [state.contexts, state.jobs], () => {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(storageKey, JSON.stringify({ schema: 1, contexts: state.contexts, jobs: state.jobs })); state.storageError = '' }
  catch { state.storageError = '实验空间回传记录未能保存到本地，请勿在回传期间关闭页面。' }
}, { deep: true, flush: 'sync' })
let entryTicket: string | null = null
let initialising: Promise<boolean> | null = null
let transport: typeof fetch = (...args) => fetch(...args)
const busy = new Set<string>()

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await transport(`/api/ilab/${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(state.session ? { 'X-CSRF-Token': state.session.csrfToken } : {}), ...init.headers },
    signal: AbortSignal.timeout(25000),
  })
  const value = await response.json()
  if (!response.ok) {
    const error = new Error(typeof value.error === 'string' ? value.error : '实验空间对接服务请求失败。')
    Object.assign(error, { status: response.status, uncertain: value.status === 'uncertain', platformResponse: value.platformResponse })
    throw error
  }
  return value as T
}

function platformLabel() { return state.session ? `${state.session.displayName || state.session.username}（${state.session.username}）` : '' }
function ownsOperation(operationId: string) {
  const context = state.contexts.find(item => item.operationId === operationId)
  return !!context && !!state.session && !!state.config && context.username === state.session.username && context.appid === state.config.appid && context.mode === state.config.mode
}
function jobForScore(scoreId: string) {
  return state.jobs.find(item => item.scoreId === scoreId && item.username === state.session?.username && item.appid === state.config?.appid && item.mode === state.session?.mode)
}

async function initialise(): Promise<boolean> {
  if (initialising) return initialising
  initialising = (async () => {
    if (typeof window === 'undefined') return false
    const url = new URL(window.location.href)
    if (url.searchParams.has('ticket')) {
      // URLSearchParams has already decoded the value once; a second decode breaks literal % characters.
      entryTicket = url.searchParams.get('ticket')
      url.searchParams.delete('ticket')
      url.searchParams.delete('token') // Legacy 2018 credential is not used.
      window.history.replaceState(window.history.state, '', url)
    }
    state.phase = 'authenticating'; state.message = '正在检查实验空间登录…'
    try {
      state.config = await request<IlabConfig>('config')
      if (!state.config.enabled) {
        if (entryTicket !== null) throw new Error('实验空间服务端尚未配置 APPID、SECRET 和项目名称。')
        state.phase = 'local'; state.message = ''; return false
      }
      try {
        const session = entryTicket !== null
          ? await request<IlabSession>('auth', { method: 'POST', body: JSON.stringify({ ticket: entryTicket }) })
          : await request<IlabSession>('session')
        if (!session.username || !session.csrfToken || session.mode !== state.config.mode) throw new Error('实验空间登录响应无效。')
        state.session = session
        entryTicket = null
        state.phase = 'authenticated'; state.message = '已通过实验空间身份认证。'
        return true
      } catch (error) {
        if (entryTicket === null && (error as { status?: number }).status === 401) {
          state.phase = 'local'; state.message = ''; return false
        }
        throw error
      }
    } catch (error) {
      state.session = null
      if (entryTicket !== null) {
        state.phase = 'error'; state.message = error instanceof Error ? error.message : '实验空间登录失败。'
      } else { state.phase = 'local'; state.message = '' }
      return false
    }
  })().finally(() => { initialising = null })
  return initialising
}

async function logout() {
  const pending = state.session ? request('logout', { method: 'POST', body: '{}' }) : Promise.resolve()
  // Unbind synchronously so late timers cannot send a previous user's experiment during logout.
  state.session = null; state.phase = 'local'; state.message = ''; entryTicket = null
  await pending
}

function beginOperation(operationId: string, startedAt: number) {
  if (!state.session || !state.config || state.contexts.some(item => item.operationId === operationId)) return
  state.contexts.push({ operationId, startedAt, username: state.session.username, appid: state.config.appid, mode: state.session.mode,
    projectTitle: state.config.projectTitle, requiresAiData: state.config.requiresAiData, aiCalls: [] })
  if (state.contexts.length > 200) state.contexts.shift()
}

/** Hook for a future real AI provider: record once per actual call, with actual model and usage metadata. */
function recordAiCall(operationId: string, call: AiCallRecord) {
  if (!ownsOperation(operationId)) throw new Error('AI 调用不属于当前实验空间操作会话。')
  const context = state.contexts.find(item => item.operationId === operationId)!
  collectAiData([...context.aiCalls, call])
  context.aiCalls.push(structuredClone(call))
}

async function retry(job: IlabUploadJob) {
  if (!state.session || !state.config || job.username !== state.session.username || job.mode !== state.config.mode || job.appid !== state.config.appid) return
  if (!job.result || ['uploaded', 'blocked'].includes(job.status) || busy.has(job.originId)) return
  const failure = validateExperimentResult(job.result, state.config.requiresAiData)
  if (failure) { job.status = 'blocked'; job.message = failure.msg; return }
  busy.add(job.originId)
  job.status = 'uploading'; job.message = '正在回传；若上次状态不明确，服务端会先查询确认。'
  job.platformResponse = undefined
  try {
    const response = await request<{ status: string; originId: string; id?: string; confirmed?: boolean; platformResponse?: { code: number; id?: string | number } }>('results', { method: 'POST', body: JSON.stringify({ result: job.result }) })
    job.platformResponse = response.platformResponse
    if (response.status !== 'uploaded' || response.originId !== job.originId || (!response.id && response.confirmed !== true)) throw new Error('回传响应未确认成功，请检查平台记录。')
    job.status = 'uploaded'; job.id = response.id
    job.message = response.id
      ? `实验空间已接收${job.result.status === 1 ? '已完成' : '未完成'}实验记录，平台记录 ID：${response.id}`
      : '已通过平台查询确认实验记录存在；查询未返回平台记录 ID，AI 字段仍应在平台核查。'
  } catch (error) {
    const info = error as { status?: number; uncertain?: boolean; platformResponse?: { code: number; id?: string | number } }
    job.platformResponse = info.platformResponse
    job.status = info.uncertain || !info.status ? 'uncertain' : 'failed'
    job.message = error instanceof Error ? error.message : '回传失败。'
  } finally { busy.delete(job.originId) }
}

function submitOperation(session: OperationSession, score: WorkspaceScore): IlabUploadJob | undefined {
  // Old/local/offline experiments must never be adopted into a newly authenticated platform identity.
  const context = state.contexts.find(item => item.operationId === session.id)
  if (!context) return
  const existing = state.jobs.find(item => item.operationId === session.id)
  if (existing) return existing
  const job: IlabUploadJob = { scoreId: score.id, operationId: session.id, username: context.username, appid: context.appid, mode: context.mode,
    originId: `sim_${session.id.replace(/[^A-Za-z0-9_]/g, '_')}`, status: 'pending', message: '待回传' }
  try {
    if (!ownsOperation(session.id)) throw new Error('实验空间身份或环境已变更；本次数据已保留，但不会回传到其他账号。')
    job.result = JSON.parse(JSON.stringify(buildOperationResult(context, session, score))) as IlabExperimentResult
    const failure = validateExperimentResult(job.result, context.requiresAiData)
    if (failure) throw new Error(failure.msg)
  } catch (error) { job.status = 'blocked'; job.message = error instanceof Error ? error.message : '本次实验不满足回传要求。' }
  state.jobs.unshift(job)
  if (state.jobs.length > 200) state.jobs.length = 200
  const reactiveJob = state.jobs[0]!
  if (reactiveJob.status === 'pending') void retry(reactiveJob)
  return reactiveJob
}

async function uploadReport(job: IlabUploadJob, file: File) {
  if (job.status !== 'uploaded' || job.username !== state.session?.username || job.appid !== state.config?.appid || job.mode !== state.session?.mode) throw new Error('请先以本次实验身份成功回传结果，再上传报告。')
  if (job.report?.status === 'uploading' || job.report?.status === 'uploaded') return
  if (job.report?.status === 'uncertain') throw new Error('上次报告上传结果不明确，请在平台人工确认，不能重复上传。')
  if (!file.size || file.size > 5 * 1024 * 1024 || !/\.[A-Za-z0-9]{1,12}$/.test(file.name)) throw new Error('请选择带扩展名、非空且不超过 5MB 的真实实验报告文件。')
  const username = state.session!.username
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  if (state.session?.username !== username || job.mode !== state.session?.mode || job.appid !== state.config?.appid) throw new Error('读取文件期间实验空间身份发生变化，未上传报告。')
  // Read again after the asynchronous file read: another selection may have started an upload.
  if (['uploading', 'uploaded'].includes(job.report?.status ?? '')) return
  job.report = { status: 'uploading', message: '正在上传报告…' }
  try {
    const response = await request<{ status: string; originId: string; id: string }>('reports', { method: 'POST', body: JSON.stringify({ originId: job.originId, filename: file.name, title: file.name.slice(0, 100), remarks: '', contentBase64: btoa(binary) }) })
    if (response.status !== 'uploaded' || response.originId !== job.originId || !response.id) throw new Error('报告响应未明确确认成功，请在平台人工确认。')
    job.report = { status: 'uploaded', id: response.id, message: `报告已上传，平台附件 ID：${response.id}` }
  } catch (error) {
    const info = error as { status?: number; uncertain?: boolean }
    job.report = { status: info.uncertain || !info.status ? 'uncertain' : 'failed', message: error instanceof Error ? error.message : '报告上传失败。' }
  }
}

export function useIlab() {
  return { state, initialise, logout, platformLabel, ownsOperation, jobForScore, beginOperation, submitOperation, recordAiCall, retry, uploadReport }
}

/** Test seam; production defaults to the browser's real same-origin fetch. */
export function setIlabTransportForTests(fetcher: typeof fetch) { transport = fetcher }
