# Connection Finder Web

Connection Finder 的 React + TypeScript Web 应用。前端由 Vite 构建，后端使用轻量 Node HTTP 服务；领域、应用、基础设施和展示层保持独立。

## 运行要求

- Node.js `>=22.13.0`
- npm

## 本地运行

```powershell
npm install
npm run dev
```

开发服务默认监听 `http://127.0.0.1:3000`。

## 企业 AI 配置

复制根目录的 `.env.example` 为 `.env.local`，填写：

```dotenv
ENTERPRISE_AI_URL=https://your-enterprise-ai.example.com/v1/chat/completions
ENTERPRISE_AI_MODEL=your-model-name
ENTERPRISE_AI_API_KEY=your-api-key
```

`ENTERPRISE_AI_URL` 是完整的 OpenAI 兼容 Chat Completions 接口地址，使用 Bearer 密钥认证。远程地址必须使用 HTTPS；本机测试服务支持 HTTP。其他协议需要新增服务端适配器。

`npm run dev` 和 `npm run start` 自动读取可选的 `.env.local`。修改配置后需要重启服务；已有进程不会自动重载环境变量。密钥仅由服务端读取，不能使用 `VITE_` 前缀；`.env.local` 已被 Git 忽略。

登录后点击右下角“企业 AI”开始聊天。未配置时显示配置提示；配置状态检查只检查配置完整性，实际可用性在发送消息时确认。聊天支持多轮对话、停止和清空；仅发送手动输入的对话，不自动读取人才库，服务端不保存聊天内容。AI 服务本身的数据保留规则取决于企业平台。此功能不改变现有规则匹配引擎。

## 单份简历匹配

在 `/candidate/new` 拖入或选择一份 PDF、DOCX、UTF-8 TXT（最大 5 MB），立即自动上传、解析并匹配，无需点击提交或开始匹配。员工资料直接显示在上传区下方，高、中、低置信度三组默认展开，包含姓名、部门、职位、邮箱与匹配依据。粘贴文本仍需点击“解析并匹配”。匹配失败可以直接重试，不重复上传；无生效员工库时保留已解析简历，导入员工后重试。处理中请保持页面打开。

## 批量导入与匹配

- 员工：管理员在 `/admin/employee-data` 下载模板，用一份 Excel 导入完整员工名单。最多 10,000 位员工、10 MB，成功发布后整体替代当前生效数据，失败不影响旧版本。
- 候选人：在 `/candidates/import` 选择多份 PDF、DOCX、UTF-8 TXT，每批最多 50 份、总大小 25 MB，每份最大 5 MB。可选择仅导入解析，或导入后立即匹配。
- 候选人 Excel：在同一页面切换到“Excel 候选人表格”，可拖入自己的 `.xlsx` 或使用中文示例模板。自动识别前 20 行中的常见中英文表头和列顺序，忽略无关列；工作／教育经历既可整段填写，也可将公司、职位、学校、专业、起止时间分列，多段用数字编号。每行一人，整个文件最多 1,000 人、10 MB；问题行显示工作表和行号，其余行继续。重复上传会新增重复记录。
- 已有候选人：在 `/candidates` 勾选记录后批量匹配，支持跨页选择，每批最多 200 位；每条记录均检查提交人和到期时间。
- 查看匹配结果：`/results` 按“已找到匹配”和“未找到可用匹配”分成两类，显示各类总数，支持搜索与分页。信息不足的记录保留原因；尚未生成匹配运行的资料在候选人库查看。
- Excel 自动导出：选择文件后点击“导入、匹配并下载 Excel”，完成后自动下载结果。汇总表按候选人展示高、中、低置信度员工及邮箱，每档预览前 3 位；员工明细表保留全部匹配员工的姓名、邮箱、部门、职位和分数。错误行、无匹配、资料不足均有明确状态，来源工作表和行号用于区分同名候选人。下载失败可重试导出，无需重复导入。
- 每条处理结果实时显示，单条失败不影响其他记录。无员工数据时先保存简历，导入员工后可以批量重试匹配。
- 处理期间保持页面打开。停止、刷新或连接中断时，已经保存的记录仍在候选人库，正在处理的一条可能继续保存；先检查记录再重试，避免重复导入。这一版没有持久化后台任务队列或自动断点续传。
- 候选人和匹配结果沿用 7 天保留期。Excel 结果以独立工作簿导出；内嵌简历附件、图片、外部链接提取及原表固定 Top 5 回填暂不支持。

详细说明见 [AI 与批量处理文档](docs/AI_AND_BATCH.md)。

## 构建与启动

```powershell
npm run typecheck
npm run lint
npm run verify:candidate-intake
npm run verify:resume-parser
npm run verify:matching
npm run verify:results
npm run verify:audit-retention
npm run verify:evaluation
npm run verify:library
npm run verify:ai-batch
npm run verify:candidate-workbook
npm run verify:batch-report
npm run build
npm run start
```

`npm run start` 会提供 `dist/` 中的 React 单页应用，并在同一进程中提供 `/api/*` 接口。

## 代码结构

```text
server/
  index.ts                      服务启动、静态文件与保留任务
  api.ts                        全部后端 HTTP 接口实现与请求处理
src/
  client/                       浏览器 API 客户端
  modules/
    auth/
      domain/                   权限与用户规则
      application/              登录用例与端口
      infrastructure/           测试用户、签名会话实现
      presentation/             React 页面和组件
      composition.ts            依赖组装
    employee-data/
      domain/                   员工数据模型和策略
      application/              导入、查询用例与端口
      infrastructure/           Excel 解析和 SQLite 存储
      presentation/             React 页面、组件和展示契约
      composition.ts            依赖组装
    candidate-intake/
      domain/                   候选人输入规则与标准查询对象
      application/              readiness、提交用例与端口
      infrastructure/           文件真实性校验与 SQLite 存储
      presentation/             单人候选人提交与状态页面
      composition.ts            依赖组装
    resume-parser/
      domain/                   画像、日期精度与标准化规则
      application/              解析和画像读取用例
      infrastructure/           PDF/DOCX/TXT 提取、结构化解析与存储
      composition.ts            依赖组装
    matching/
      domain/                   规则配置、日期重叠、证据、评分和置信度
      application/              匹配运行与结果读取用例
      infrastructure/           版本快照读取和 SQLite 运行存储
      composition.ts            依赖组装
    results/
      domain/                   置信度分组与展示不变量
      presentation/             全部结果、证据、空状态与重试页面
    audit/
      domain/                   最小审计事件与保留任务模型
      application/              审计记录与候选人到期删除编排
      infrastructure/           SQLite 审计和保留任务记录
      composition.ts            依赖组装
    evaluation/
      domain/                   标注集、指标、错误和门禁模型
      application/              离线匹配评估与上线判定
      infrastructure/           严格 JSON 数据集校验
```

页面层统一通过 `src/client/api.ts` 调用接口（模板下载使用同源链接）。全部后端 HTTP 接口实现在 `server/api.ts`，由 `server/index.ts` 调用 `handleApi`，并通过各模块的 `composition.ts` 调用应用层。领域层不依赖 React、HTTP、数据库或文件解析库。
