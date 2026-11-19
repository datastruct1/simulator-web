import type { WorkspaceFile } from '../../../data/workspace'

const memoryFiles = new Map<string, Blob>()
let databasePromise: Promise<IDBDatabase> | undefined
function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('浏览器不支持 IndexedDB。')); return }
    const request = indexedDB.open('simulator_web.workspace.files', 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files') }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); databasePromise = undefined }
      resolve(db)
    }
    request.onerror = () => reject(request.error || new Error('无法打开本地文件存储。'))
    request.onblocked = () => reject(new Error('本地文件库被其他窗口占用，请关闭相关窗口再重试。'))
  })
  databasePromise.catch(() => { databasePromise = undefined })
  return databasePromise
}
export async function storeFile(id: string, blob: Blob): Promise<'indexeddb' | 'memory'> {
  memoryFiles.set(id, blob)
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('files', 'readwrite')
      transaction.objectStore('files').put(blob, id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    memoryFiles.delete(id)
    return 'indexeddb'
  } catch { return 'memory' }
}
export async function getFile(file: WorkspaceFile): Promise<Blob> {
  if (file.origin === 'builtin' && typeof file.builtinText === 'string') return new Blob([file.builtinText], { type: 'text/plain;charset=utf-8' })
  const memory = memoryFiles.get(file.id)
  if (memory) return memory
  const db = await openDatabase()
  const blob = await new Promise<unknown>((resolve, reject) => {
    const request = db.transaction('files').objectStore('files').get(file.id)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  if (!(blob instanceof Blob)) throw new Error('本地文件内容不存在（浏览器数据可能已清除，或文件只保存在上次会话内存）。请由教师重新添加原文件。')
  return blob
}
export async function removeStoredFile(id: string) {
  memoryFiles.delete(id)
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('files', 'readwrite')
      transaction.objectStore('files').delete(id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } catch { /* Removing metadata remains valid if the browser no longer has the content. */ }
}
