import { reactive } from 'vue'
import type { WorkspaceScore } from '../data/workspace'

type SaveStatus = { status: 'saving' | 'saved' | 'failed'; message: string; id?: string }
const state = reactive({ enabled: false, sessionId: '', records: {} as Record<string, SaveStatus> })

async function initialise(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const response = await fetch('/api/internal-test/config', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!response.ok || (await response.json()).mode !== 'internal-test') return false
    let id = sessionStorage.getItem('simulator.internal-test.session')
    if (!id || !/^[a-f0-9-]{36}$/i.test(id)) { id = crypto.randomUUID(); sessionStorage.setItem('simulator.internal-test.session', id) }
    state.sessionId = id; state.enabled = true
    return true
  } catch { return false }
}
async function save(score: WorkspaceScore) {
  if (!state.enabled || state.records[score.id]?.status === 'saving') return
  state.records[score.id] = { status: 'saving', message: '正在保存内部测试成绩…' }
  try {
    const response = await fetch('/api/internal-test/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: state.sessionId, score }), signal: AbortSignal.timeout(15000) })
    const value = await response.json()
    if (!response.ok || value.status !== 'saved' || value.mode !== 'internal-test' || typeof value.id !== 'string') throw new Error(typeof value.error === 'string' ? value.error : '后台未确认保存。')
    state.records[score.id] = { status: 'saved', id: value.id, message: '已保存至内部测试后台；未上传实验空间。' }
  } catch (error) { state.records[score.id] = { status: 'failed', message: `后台保存失败：${error instanceof Error ? error.message : '网络错误'}；本地成绩仍在，可重试。` } }
}
export function useInternalTest() { return { state, initialise, save } }
