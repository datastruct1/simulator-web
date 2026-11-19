# 实验空间对接：2022 基础接口 + 2026 AI 数据

## 已实现的接入链路

```text
实验空间课程页「我要做实验」
  → /simulator-web/?ticket=...（浏览器只解码一次，随后移除地址栏中的凭据）
  → POST /api/ilab/auth（本项目服务端）
  → MD5(ticket + APPID + SECRET)，十六进制大写
  → 实验空间 /open/api/v2/token，取得用户与 access_token
  → 自动进入学员工作台，以 mode + APPID + username 绑定本地身份
  → 开始操作实验，绑定本次会话；记录真实手动操作
  → 手动交卷/超时交卷，冻结已有成绩与操作证据
  → POST /api/ilab/results
  → 服务端校验并直接 POST 到实验空间 /open/api/v2/data_upload
  → 成绩详情展示平台确认、查询/重试、导出回传 JSON
  → 若有真实实验报告，选择文件后通过 /api/ilab/reports 上传附件
```

没有通过第三方平台转接。Node.js/TypeScript 服务端是本实验系统自己的组成部分；前端不直接调用实验空间接口。

## 代码位置

| 路径 | 职责 |
| --- | --- |
| `src/integrations/ilab.ts` | 前三张图片的 AI 类型与校验；原独立请求封装保留供兼容，不是当前浏览器的直接上传入口 |
| `src/integrations/result.ts` | 完整 2022 结果、步骤类型及本地预校验 |
| `src/integrations/operationResult.ts` | 从实际记录生成结果、AI 元数据汇总；不复制文档示例数据 |
| `src/state/ilab.ts` | 同源服务端调用、公开身份、会话绑定、冻结结果与上传状态 |
| `src/state/workspace.ts` | 操作开始、交卷的实际挂钩；保留现有评分算法 |
| `src/App.vue` | ticket 启动认证、登录投影、退出解绑 |
| `src/components/layout/IlabConnection.vue` | 当前环境、账号及最新回传状态 |
| `src/components/workspace/ScoreDetailModal.vue` | 单条成绩回传状态、JSON 导出和报告文件上传 |
| `server/ilab.ts` | 签名、token/刷新、cookie/CSRF、直接回传、确认查询和持久化防重复 |
| `server/main.ts` | 服务端配置和启动入口 |

## 本地启动

需要 Node.js **22.19+**，安装依赖后在 PowerShell 操作：

```powershell
Copy-Item .env.ilab.example .env.ilab.local
```

编辑 `.env.ilab.local`，把 `ILAB_PROJECT_TITLE` 设置为实际申报项目名称（1～100 字符）。这个名称没有从截图中取得，不能猜测填报名称。

默认使用官方公开测试 APPID 与测试密钥，**不是 pic.jpg 中的正式密钥**。项目名称为空时服务保持 disabled，不向实验空间请求认证或上传。

终端一：

```powershell
npm run ilab:server
```

终端二：

```powershell
npm run dev
```

前端地址为 `http://localhost:5173/simulator-web/`，服务端默认监听 `127.0.0.1:8787`；Vite 将 `/api/ilab` 转发到服务端。不要只启动前端而期待正式回传。

测试平台与正式平台不互通。按照[官方测试流程](https://shenbao.ilab-x.com/declare/wiki/v2#2-1)，从公测课程页带 ticket 进入本实验链接。随便填写 `?ticket=test` 不会通过真实认证，也不能用申报用户名/密码代替 ticket。

不带 ticket 且没有已有平台会话时，教师/学员演示仍可本地运行；这些操作不会自动回传。

## 正式配置与部署

公测联通后，在服务器本地配置：

```dotenv
ILAB_MODE=production
ILAB_APPID=110602
ILAB_SECRET=<pic.jpg 中的项目密钥，仅在服务器本地配置>
ILAB_PROJECT_TITLE=<实际申报项目名称>
ILAB_ALLOWED_ORIGINS=https://<你的实验网站域名>
ILAB_HOST=127.0.0.1
ILAB_PORT=8787
ILAB_COOKIE_SECURE=true
```

- mode 只能是 test/production；上游地址固定为官方测试地址或 `https://www.ilab-x.com`。
- 启动入口拒绝把正式项目的 APPID/密钥误发到 HTTP 测试服务器。
- 正式模式强制 Secure cookie，需要 **HTTPS**。直接用 HTTP localhost 配正式模式会导致浏览器不发送会话 cookie。
- 将前端和 `/api/ilab` 部署为同源；不能只把 dist 上传到 GitHub Pages。GitHub Pages 无法运行 Node 服务端。
- 只公开 `dist` 内容，不公开项目根目录、`.ilab-data`、`.env` 或截图目录。

Nginx 同源部署示意（证书配置另按部署环境提供）：

```nginx
# 将 dist 的内容部署到 /srv/site/simulator-web/
root /srv/site;

location /simulator-web/ {
    try_files $uri $uri/ /simulator-web/index.html;
}

location /api/ilab/ {
    # 报告在本系统内以 JSON/base64 传输，解码文件最大 5MB。
    client_max_body_size 7m;
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

在平台将实验链接配置为该 HTTPS 站点的 `/simulator-web/`，由平台生成 ticket 跳转。最终域名、平台链接配置和联调均未在本次操作中完成。

## 数据真实性与当前评分边界

- 只采集本次平台身份下的学员操作会话。旧本地成绩、理论题、离线考核、自动演示不自动回传。
- 总成绩来自现有操作评分并折算为百分制整数，不另外赠分。
- 完成状态使用原会话 `finished`，不是“交卷就算完成”或“及格就算完成”；未完成实验交卷回传 `status=2`。
- 当前 steps 为真实手动设备操作的**过程记录**，只采用明确标记 `sequenceEligible=true` 的记录，按 logId 去重、过滤会话时间范围；同毫秒的动作合并，不拆成虚构步骤。
- 步骤时间为会话开始/上一动作至当前动作的墙钟观测区间，正时长向上取整秒；不是平均分配实验时间，也不是声称设备动作持续了这些秒。
- 此类动作过程不单独赋分，步骤 score/maxScore 为 0；实际总成绩与完整评分明细保留在 ext_data。合理用时尚未配置，expectTime 为 0 并在备注中声明。**正式教学步骤分组、合理用时及逐步评分需要负责人审核并在联调中确认。**
- 完成实验不足 10 条真实步骤时阻止回传并保留原因；超过 200 步也阻止，不凑数、不重复日志或截断数据来满足接口。
- 浏览器已有评分不构成服务端重新判分或正式认证成绩。服务端校验协议和身份，不能把可修改的浏览器记录当作不可篡改的教学审计。
- 当前没有实验内真实 AI 服务调用，因此正常记录为次数 0、两个空数组。已提供 `useIlab().recordAiCall(operationId, metadata)`，后续接真实模型时在真实调用发生后记录实际模型、场景和用量；这不是新增了 AI 教学功能。未知 token 用量不伪装成 0。

## 失败、重试与报告

- HTTP 200 本身不是成功；结果接口必须明确返回 code=0 与 id。
- 服务端按 mode/APPID/username/originId 持久化结果快照，同一成功结果重复提交直接返回已有状态；内容改变则拒绝。
- 超时、网络中断、非 JSON、成功码缺少 ID 都可能已经写入平台，保存为 uncertain。下一次「查询确认 / 重试」先用官方 data_get 查询，不盲目重传完成记录。
- 官方 data_get 的公开成功示例是 `{meta, data:[...]}`，未提供记录 ID；查询核对实验字段及步骤后，可标记已确认，但不会编造一个平台 ID。查询未返回 AI 字段时不能据此声称已核验 AI 数据。
- 未完成记录当前仅在交卷时回传，不支持同一次会话的持续分步骤增量上传。
- token 过期按返回 expires_time 判断，刷新最多两次并始终使用原始 token；超过限制需从平台重新进入。
- 报告最大 5MB，要求有效扩展名，先回传实验结果再上传原始文件字节。报告成功重复提交幂等；未知状态不自动重传，须在平台人工确认。文件内容不保存在本项目的上传状态文件中。
- 幂等锁为**单服务进程**锁；多实例部署必须换成共享数据库事务/锁，不能直接启动多个写同一目录的实例。

## 凭据与本地数据

`.env.ilab.local`、所有 `.env.*`（模板除外）、`.ilab-data/` 和 `src/dev-pic/` 已忽略。Vite 开发服务器也禁止读取环境文件、截图和上传数据目录；没有删除用户的原图。

SECRET 和 access_token 只在服务端；cookie 为 HttpOnly/SameSite=Lax，POST 检查 Origin、JSON 与 CSRF。浏览器持久化中没有 ticket、token、SECRET 或 CSRF。服务端不打印含 token 的上游 URL，拒绝上游重定向，错误不透传可能含凭据的原文。

服务端会话/token 在内存中，重启后须重新从平台进入；上传状态在 `.ilab-data` 恢复。该目录含真实实验和用户信息，部署时限制权限并安排备份、保留期限。若截图或密钥曾公开，请联系平台更换密钥。

## 验收与官方依据

本次没有登录申报账号、提交申报或回传正式实验数据。自动测试全部为模拟请求，见 [ilab-testing.md](ilab-testing.md)。

pic.jpg 要求 5 条真实数据；当前公开 2022 指南「正式接入」另写不少于 3 个用户、10 条实测数据。两者不一致，须由当前项目平台技术人员确认最终验收要求，不能用测试样例代替实测，也不自行认定 5 条必然足够。

公开官方说明：

- [2026 AI 数据补充](https://shenbao.ilab-x.com/declare/wiki/v2#1-3)
- [ticket 获取](https://shenbao.ilab-x.com/declare/wiki/v2#4)
- [用户与 access_token](https://shenbao.ilab-x.com/declare/wiki/v2#5)
- [2022 实验结果字段及返回码](https://shenbao.ilab-x.com/declare/wiki/v2#6)
- [实验报告附件](https://shenbao.ilab-x.com/declare/wiki/v2#7)
- [结果查询](https://shenbao.ilab-x.com/declare/wiki/v2#8)
- [token 刷新](https://shenbao.ilab-x.com/declare/wiki/v2#9)
- [正式接入与验收](https://shenbao.ilab-x.com/declare/wiki/v2#2-2)
