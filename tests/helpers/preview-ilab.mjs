import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const cli = fileURLToPath(new URL('../../node_modules/@playwright/test/cli.js', import.meta.url))
const smoke = process.argv.includes('--smoke')
console.log('实验空间本地模拟预览：不需要账号/密钥，不连接真实平台。')
console.log(smoke ? '自动验证预览流程并保存截图，随后关闭浏览器。' : '正在打开浏览器，自动演示后停在成绩详情页。可手动查看界面；查看完在调试窗口点击 Resume / 继续结束。')
const child = spawn(process.execPath, [
  cli, 'test', 'tests/e2e/ilab.spec.ts',
  '--headed', '--workers=1', '--timeout=0', '--grep', 'ticket认证进入学员',
], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ILAB_UI_PREVIEW: '1', ILAB_PREVIEW_AUTOCLOSE: smoke ? '1' : '0' },
})
child.on('error', error => { console.error(`预览启动失败：${error.message}`); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
process.once('SIGINT', () => child.kill('SIGINT'))
process.once('SIGTERM', () => child.kill('SIGTERM'))
