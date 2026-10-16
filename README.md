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
