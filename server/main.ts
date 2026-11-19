import { createIlabServer } from './ilab.ts'

const env = process.env
const mode = env.ILAB_MODE ?? 'test'
if (mode !== 'test' && mode !== 'production') throw new Error('ILAB_MODE must be test or production')
// The documented shared test credentials are public. Never send a project's private production key to the HTTP test host.
if (mode === 'test' && env.ILAB_APPID && env.ILAB_APPID !== '10000') throw new Error('测试环境只能使用官方公测 APPID 10000；正式项目请选择 production。')
if (mode === 'test' && env.ILAB_SECRET && env.ILAB_SECRET !== 'DDO7jw9TAZlLwRLRKSpBWXIlYZe9PKaD5Wc1S5ZQ0U8=') throw new Error('测试环境只能使用官方公测密钥，禁止使用正式项目密钥。')
if (env.ILAB_PROJECT_TITLE && (!env.ILAB_PROJECT_TITLE.trim() || env.ILAB_PROJECT_TITLE.length > 100)) throw new Error('ILAB_PROJECT_TITLE 必须是 1～100 字符的实际申报项目名称。')
const server = createIlabServer({
  mode, appid: env.ILAB_APPID, secret: env.ILAB_SECRET, projectTitle: env.ILAB_PROJECT_TITLE,
  requiresAiData: env.ILAB_REQUIRES_AI_DATA !== 'false',
  allowedOrigins: (env.ILAB_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(v => v.trim()).filter(Boolean),
  cookieSecure: mode === 'production' || env.ILAB_COOKIE_SECURE === 'true',
}, { dataDir: env.ILAB_DATA_DIR })
server.requestTimeout = 15000
server.headersTimeout = 10000
const port = Number(env.ILAB_PORT ?? 8787)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ILAB_PORT 必须为有效端口。')
server.listen(port, env.ILAB_HOST ?? '127.0.0.1', () => {
  console.log(`实验空间对接服务已启动：${mode} 环境，端口 ${port}（未打印任何密钥）`)
})
