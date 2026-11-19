# 实验空间对接测试

## 直接查看界面效果

```powershell
cd D:\OXY\simulator-web-publish
npm run ilab:preview
```

该命令会自动启动 Vite、打开浏览器，用模拟接口演示 ticket 登录、实际操作交卷和报告上传，然后停在成绩详情页供查看。无需另外启动服务端，也不需要配置密钥；截图保存到 `test-results/ilab-preview.png`。页面有“本地模拟预览”标识，不代表真实平台已经接通。

查看完在 Playwright 调试窗口点击 Resume / 继续结束预览。若缺少浏览器，安装 Chrome/Edge，或执行 `npm exec playwright -- install chromium`。


## 一键本地验证（不向平台提交数据）

在项目目录打开 PowerShell，使用 Node.js **22.19+**：

```powershell
cd D:\OXY\simulator-web-publish
npm run test:ilab
npm run typecheck
npm run typecheck:ilab
npm run build
npm exec playwright -- test tests/e2e/ilab.spec.ts
```

依赖尚未安装时先 `npm ci`。浏览器测试使用本机 Chrome/Edge，或者按项目 Playwright 配置安装 Chromium。

本轮预期结果：

- `test:ilab`：**159 项通过，0 项失败**。
- Vue 和服务端类型检查：无错误。
- 生产构建：成功，仍可能提示现有大资源 chunk 警告。
- `ilab.spec.ts`：**5 项浏览器测试通过**。

测试直接调用实际模块。服务端测试仅请求本机临时 HTTP 服务，其对实验空间的 fetch 全部模拟；浏览器测试截获 `/api/ilab/**`。不需要申报账号、正式 SECRET 或真实 access_token，也不会写入正式平台。

## 测试文件及覆盖范围

| 文件 | 验证内容 |
| --- | --- |
| `tests/ilab.test.mjs` | 前三张图片的 AI 字段、四种部署、18 项错误原因、类型/数值边界、独立上传封装 |
| `tests/ilab-result.test.mjs` | 完整 2022 必填字段、步骤数量及时间、来源过滤、总分保留、未知 token 不伪装为 0 |
| `tests/ilab-client.test.mjs` | ticket 一次解码、去除地址栏凭据、不持久化 CSRF、身份隔离、冻结结果、成功判定及安全重试 |
| `tests/ilab-server.test.mjs` | MD5 大写签名、cookie/Origin/CSRF、原 token 刷新、平台业务错误、幂等、重启确认、实际查询数组格式、报告二进制及防重 |
| `tests/e2e/ilab.spec.ts` | 认证进入学员、实际设备日志至交卷挂钩、状态与报告 UI、刷新恢复、拒绝 demo 绕过、不补造 10 步、禁止读取敏感文件 |

测试中的模型、调用次数、用户、成绩和报告均是合成测试数据，不能用作正式验收记录。

本地预校验采用官方公开字段说明，但部分更严格的防御性规则和错误提示并非平台实现的精确副本；正式服务端的校验和返回码始终是最终依据。

## 如何故意验证测试会失败

在 `tests/ilab.test.mjs` 的 `validData()` 中，临时将 `ai_call_count: 2` 改成 `-1`，运行 `npm run test:ilab`。

“完整合法的 ai_data 校验通过”等用例应报出实际结果与预期的差异。改回 `2` 后重新运行，应全部通过。不要修改正式校验规则或真实实验数据来让测试通过。

## 测试真实平台接口

请按 [配置与联调指南](ilab-integration.md) 先启动 TypeScript 服务端和前端，再使用官方公测流程。不要直接把单元测试 fixture 回传正式平台。

检查以下实测链路：

1. 从课程页「我要做实验」进入带 ticket 的本系统链接；自动进入正确的学员身份。
2. 页面顶栏明确显示测试/正式环境；刷新后仍是原用户和同一操作会话。
3. 真正手动运行实验后交卷；核对完成状态、真实步骤、总成绩和用时。
4. 成绩详情显示回传成功或具体失败原因；导出的回传 JSON 含完整原有字段及 ai_data，不含认证凭据。
5. 按 originId 在平台核查记录；上传报告时核对原始附件内容。
6. 未使用 AI 时次数为 0；使用真实模型后再核对实际模型、场景和用量。
7. 模拟断网时确认“不明确”状态不会自动重复提交完成实验。

只看到 HTTP 200、本地“成绩已保存”或自动测试通过，均不能视为平台接入验收成功。正式项目还须完成域名部署、链接配置、教学步骤/评分审核及平台要求的真实实验数据验收。
