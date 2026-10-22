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

非生产环境提供普通招聘测试账号 `test1`、`test2`、`test3`、`test4`，密码均为 `1234`，共用候选人库；原管理员账号 `test` 保留。

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

## 单人与多人匹配

登录后进入 `/candidates/new`，在同一界面切换“单人匹配”和“多人匹配”，切换时保留当前资料与结果，处理中暂时锁定切换。旧地址 `/candidate/new` 和 `/candidates/import` 继续使用统一界面，后者默认打开多人匹配。

单人匹配：拖入或选择一份 PDF、DOC、DOCX、UTF-8 TXT（最大 5 MB），立即自动上传、解析并匹配。员工资料直接显示在上传区下方，高、中、低置信度三组默认展开，包含姓名、部门、职位、邮箱与匹配依据。粘贴文本仍需点击“解析并匹配”。匹配失败可直接重试；没有可用员工库时保留已解析简历，导入员工后重试。

多人匹配：上传候选人 Excel 或多份简历后，点击“开始匹配并下载 Excel”。完成后自动下载含候选人匹配汇总、全部员工明细的结果文件，包含来源工作表或简历文件、候选人姓名、处理状态和员工邮箱；失败项保留原因。导出失败可重试，中断时可手动导出已处理部分。处理中请保持页面打开。

DOC 支持旧版 Word 二进制文档，校验文件格式后提取正文、页眉和文本框内容；损坏或加密文件提示另存为 DOCX。无需安装 Word 或 LibreOffice。

## 英文简历解析

中英文简历共用解析流程，无需切换语言。英文规则支持 `Professional Experience`、`Employment History`、`Education`、`Academic Background` 等标题，`Company / Employer / Organization`、`Job Title`、`Institution`、`Degree / Programme`、`Dates / Duration` 等字段标签。

日期支持英文月份全称、缩写、`MM/YYYY`，以及 `Present / Current / Ongoing`；例如 `Jan 2020 – Present`、`September 2016 – June 2020`、`09/2016 - 06/2020`。工作经历支持公司、职位、日期分行，或通过竖线分隔，亦支持 `Software Engineer at Microsoft`。教育经历识别学校、学位与专业，保留 `University of California, Berkeley` 这类带校区名称的学校；学位文字会与专业分开处理。

例如以下格式可用于英文简历：

```text
Full Name: Jane Smith
Professional Experience
Microsoft
Senior Software Engineer
Jan 2020 – Present

Education
University of Oxford
MSc in Computer Science
September 2016 – June 2018
```

PDF 按页面文字坐标重建行与表格列，减少文档内部文字顺序导致的错位。支持学术任职、博士后经历及教育培训标题；科研项目、论文和获奖章节不会重复生成工作或教育记录。英文表格中的单位、专业和职位分别识别，DOC 中日期后的重复毕业年份不会干扰教育识别。

明确的工作／教育章节标题优先于单位名与学位关键词。例如 `WORKING EXPERIENCE` 下的大学任职和 `Ph.D. Fellowship` 保留为工作经历，不额外生成教育经历；缺少章节标题时才通过内容推断分类。

解析器版本为 `resume-heuristic-v10`，同时保存各段工作中的职责与研究内容。职能依据候选人自己的简历计算，解析后即保存，不依赖员工库或内部人脉匹配。缺少职能结果的旧记录会自动读取原简历补算，无需用户重新上传或手动重新匹配。解析依赖提取出的文字和排版线索，扫描图片仍需先转为文字。

### 候选人 Research 职能优先级

单人匹配结果、结果详情和批量 Excel 返回候选人职能优先级、规则得分、高／中／低置信度及原文依据。词库直接使用 `docs/research.json` v1.4，仅覆盖药物发现阶段的七类 Research 职能；与内部员工关系的置信度分别展示，职能分数不是概率或准确率。

候选人管理及匹配历史增加“可能职能”列，显示前三个有正分证据的方向、得分、置信度和复核状态。表头支持按职能或证据不足／待复核等状态多选筛选，作用于全部记录；搜索框也支持职能中英文关键词。点击该列直接打开侧栏的职能依据，完整资料页同样可查看。列表在筛选与分页前为未过期的旧资料补齐职能结果，详情、匹配和批量入口也会按需补算；并发读取复用同一个补算任务。补算只更新职能字段和匹配记录中的职能元数据，保留原匹配 ID、员工结果和到期时间。原文不可读或证据不足时保存相应原因，不要求先生成内部人脉匹配。

- 逐段工作计分：强词 +3、辅助词 +2、职位词 +3、排除词 −3；同义词与重复词合并，职位只取一个最具体的命中。学校名称、教育专业、独立技能表和论文列表不单独决定职能。
- `combo_rules` 的可执行实现位于 `research-functions/domain/classify-functions.ts`：疾病生物学词需要同段药物发现／靶点证据，蛋白纯化与有机合成按词库要求检查共现；计算职能还受 Biomarker / Clinical Samples 排除条件限制。明确否定与合作方语境保留为 0 分证据，供人工复核。
- 在词库的 6 分门槛外，增加明确职能强词或专属职位门槛，避免通用 Scientist 职位与通用实验技能直接归类。满足归类条件的方向优先排序，再按分数排序；前两项均满足归类条件且分差 ≤2 时标记歧义，不给出确定的主要职能。
- 优先使用最近一段证据充分的工作，不跨任职单位累加。若借助较早经历，明确标记历史依据且置信度最高为中。日期无法确认时同样不赋予高置信度。
- 高置信度要求无歧义、至少 12 分、至少两个明确职能证据、无扣分、日期完整且不是历史回退；普通达标为中，证据不足或有歧义为低。这些是规则等级，尚未经过准确率校准。
- API：画像中的 `researchFunctions` 与匹配结果中的 `candidateFunctions` 包含状态、主要职能 ID、来源工作经历、版本和 `priorities`；每项保留排序、分数、置信度、是否达标、说明与带原文的逐条计分依据。旧记录缺少字段时自动补算并持久化。
- Excel 在汇总表追加职能列，并增加“职能依据”工作表，逐行列出关键词、原文、加减分、所属经历和归类说明，即使没有匹配到员工也可查看职能结果。

## 批量导入与匹配

- 员工：管理员在 `/admin/employee-data` 下载模板，用一份 Excel 导入完整员工名单。最多 10,000 位员工、10 MB，成功发布后整体替代当前生效数据，失败不影响旧版本。
- 候选人：在统一匹配页面选择“多人匹配 → 多份简历文件”，选择多份 PDF、DOCX、UTF-8 TXT，每批最多 50 份、总大小 25 MB，每份最大 5 MB，自动解析、匹配并导出 Excel。
- 候选人 Excel：在多人匹配中选择“Excel 候选人表格”，可拖入自己的 `.xlsx` 或使用中文示例模板。自动识别前 20 行中的常见中英文表头和列顺序，忽略无关列；工作／教育经历既可整段填写，也可将公司、职位、学校、专业、起止时间分列，多段用数字编号。每行一人，不设候选人人数上限，文件最大 10 MB；问题行显示工作表和行号，其余行继续。团队内相同资料复用已有候选人与匹配结果。
- 已有候选人：在 `/candidates` 勾选团队共享记录后批量匹配，支持跨页选择，每批最多 200 位，过期记录不可用。
- 导入人：候选人库与匹配历史显示首次导入人的名称，可在表头按名称或账号 ID 筛选。新记录保存导入时的名称，旧记录缺少名称时显示账号 ID；重复导入不覆盖首次导入人。
- 候选人表格：移除左侧筛选栏，默认全部显示。各列表头提供下拉筛选：姓名或编号支持包含文字，解析状态、简历来源、匹配状态支持多选，提交与到期时间支持日期范围。多列条件可组合，覆盖全库并同步分页总数，可清除单列或全部列筛选。
- 查看匹配结果：`/results` 默认展示全部匹配记录，通过“内部人脉匹配”列表头筛选已找到匹配、未找到匹配或信息不足的记录，支持模糊搜索与分页。尚未生成匹配运行的资料在候选人库查看。
- 库内模糊搜索：候选人库与匹配历史支持按姓名、编号、公司、职位、学校、专业搜索；员工库还支持邮箱、部门和历史任职资料。输入部分关键词即可匹配，多个词用空格分隔并同时满足，不区分大小写、全半角或字段内空格。查询覆盖全部可用记录，分页及分类数量按搜索结果计算。
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
