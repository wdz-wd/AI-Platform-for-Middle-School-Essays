# 作文批改平台 MVP

前端：`React + Vite + TypeScript + Tailwind CSS`  
后端：`NestJS + Prisma + PostgreSQL`

## 目录

- `frontend/`：教师操作台与管理页面
- `backend/`：认证、任务、上传、批改、打印、档案 API
- `docs/`：PRD 与架构设计文档
- `uploads/`：本地上传目录

## 当前实现范围

- 账号密码登录
- 管理员在「教师账号」新增教师、分配未分配班级、重置密码和停用账号；教师首次登录需换掉初始密码
- 管理员在「班级管理」查看或更换负责老师，每班一位；历史作文任务仍归原创建人
- 班级与学生基础管理
- 作文任务创建
- 作文题上传与题目讲解生成
- 学生作文批量上传
- PDF 自动提文本
- 百度 OCR 自动识别图片与扫描 PDF
- DeepSeek 结构化作文点评
- 教师终稿编辑
- 单篇/整任务打印
- 作文档案列表

## 本地启动

### 1. 配置后端环境变量

复制并编辑：

```powershell
Copy-Item .\backend\.env.example .\backend\.env
```

至少修改：

- `DATABASE_URL`
- `JWT_SECRET`
- `OCR_PROVIDER`：可选 `baidu` 或 `paddle`
- `OCR_CONCURRENCY`、`REVIEW_CONCURRENCY`：识别与批阅各自的最大并发数，均默认为 2，填写正整数；修改后重启后端生效
- `BAIDU_OCR_API_KEY`
- `BAIDU_OCR_SECRET_KEY`
- 如果 `OCR_PROVIDER="paddle"`，需配置 AI Studio 的 `PADDLE_OCR_TOKEN`；`PADDLE_OCR_MODEL` 默认为 `PaddleOCR-VL-1.6`，`PADDLE_OCR_API_URL` 默认为官方异步任务地址
- `PADDLE_OCR_POLL_INTERVAL_MS` 和 `PADDLE_OCR_MAX_ATTEMPTS` 可调整后台任务轮询间隔与次数，默认分别为 5000 毫秒和 120 次
- `PADDLE_OCR_REQUEST_INTERVAL_MS`：所有 Paddle 提交和查询共用的最小请求间隔，默认 2000 毫秒；同一后端进程内 API 请求依次发出，远端解析任务仍可并行。这是应用的保守限速配置，不代表 Paddle 官方配额
- 遇到限流会自动将请求间隔翻倍，最多增至 30000 毫秒（若配置的初始间隔更长则以其为准），不同任务共享连续限流记录和逐步延长的冷却时间。连续成功 20 次后才将请求间隔减半，最低恢复到配置值；单次成功不会立即恢复原速。当前启动日志为 `Paddle OCR 单次全文识别 v4`，包含限流和断点续接保护
- `PADDLE_OCR_MAX_RETRIES`、`PADDLE_OCR_RETRY_BASE_MS`：临时限流的重试次数和初始等待时间，默认 5 次、5000 毫秒；等待逐次翻倍、基础等待最多 60 秒并加入随机错峰，同时遵守 `Retry-After`。429、业务码 12002 和提交队列满（10010）会触发全进程共享冷却；查询的临时网络/服务异常也会重试原任务，不重复上传。无效 Token、参数错误、每日额度用尽不自动重试；提交网络异常或未明确拒绝的服务错误不自动重发，以免重复创建远端任务
- 上述 Paddle 参数均填写正整数，修改后重启后端；限速只覆盖当前进程，同一 Token 被多台机器或多个后端进程使用时请求仍会叠加
- `OCR_AUTO_RETRY_MAX_ATTEMPTS`、`OCR_AUTO_RETRY_BASE_MS`：单轮 Paddle 重试耗尽后，后台自动续接的最大轮数和初始等待时间，默认 10 轮、60000 毫秒。后台等待按 1/2/4/8/15 分钟逐步延长，最多 15 分钟；等待时释放 OCR 并发名额。界面显示“等待重试”，不增加失败数；后台重启后按数据库中保存的下次重试时间恢复
- OCR 断点保存在 `Submission.ocrProgress` 中，记录全文 OCR 的远端任务 ID、输入指纹和已完成结果；改变图片、模型、接口或 Token 时不会误用旧结果。短暂查询故障、轮询超时和结果下载故障会继续查询原任务，已完成结果直接复用；旧版过滤过页眉的完成结果会沿用原任务 ID 重新获取完整输出，不直接重复上传。只有远端明确返回任务过期/不存在时才清除旧 ID 并允许重新提交。原始进度不返回前端
- 永久错误（无效 Token、额度用尽、文件无效、远端任务明确解析失败）和后台续接轮数耗尽会显示失败并保留进度与原因；详情页可点击“重试识别”。旧版失败记录没有保存任务 ID，只能重新提交；新版开始记录后才可续接。上传请求断网且没有收到任务 ID 时，无法确认远端是否接受，不自动重发，以免创建重复任务；远端创建和本地保存之间极短的进程崩溃窗口也无法保证恰好一次
- 断点续接需部署迁移 `202610280001_ocr_resume` 并重新生成 Prisma Client；已部署 v3 的服务器升级 v4 无需新增迁移。迁移仅增加进度、重试次数、下次重试时间和最后错误字段，不重新初始化账号或作文数据
- `DEEPSEEK_API_KEY`

### 2. 生成 Prisma Client

```powershell
npm run prisma:generate
```

### 3. 执行数据库迁移

如果你要直接使用仓库内的首个迁移：

```powershell
cd backend
npx prisma migrate deploy
```

开发阶段也可以：

```powershell
cd backend
npx prisma migrate dev
```

### 4. 写入种子账号

```powershell
npm run db:seed
```

默认账号：

- `admin / Admin@123456`
- `teacher / Teacher@123456`

已有数据库升级教师账号功能时，在 `backend` 目录执行 `npm run prisma:generate` 和 `npx prisma migrate deploy`，然后更新并重启前后端。初始化脚本仅用于新环境，会重设默认账号密码，已有环境请勿再次执行。已有账号可从侧栏账号菜单修改密码。

### 5. 启动前后端

后端：

```powershell
npm run dev:backend
```

前端：

```powershell
npm run dev:frontend
```

默认地址：

- 前端：[http://localhost:5173](http://localhost:5173)
- 后端：[http://localhost:3000](http://localhost:3000)

## 说明

- 当前不接 Redis，OCR 可通过 `OCR_PROVIDER` 在百度手写作文识别和 PaddleOCR AI Studio 异步文档解析之间切换。
- 文本型 `pdf` 会优先直接提取正文并进入 AI 批改。
- `jpg/png` 与扫描版 `pdf` 会先自动提交到配置的 OCR 服务，识别成功后自动进入 AI 批改。
- 识别与批阅使用两个独立的先进先出队列，各阶段一有空位就启动下一篇；每篇识别完成后即可开始批阅，无需等待整批识别。默认最多同时运行 2 篇识别和 2 篇批阅，两阶段互不占用并发名额。这里的识别阶段包括全文 OCR 和姓名、正文整理；并发上限针对单个后端进程。
- 当 OCR 识别失败或文本过短时，作文会进入“待补录正文”状态。
- 百度 OCR 现在通过 `BAIDU_OCR_API_KEY` 和 `BAIDU_OCR_SECRET_KEY` 自动换取并缓存 `access_token`，不再依赖本地 key 文本文件。
- Paddle OCR v4 对每张图片正常只提交一个全文解析任务，轮询状态并读取 JSONL 结果，不再自动裁剪姓名栏另行识别。完整原始文本保留姓名栏、页眉等内容，现有的一次 DeepSeek 整理同时提取 studentName、title、body。姓名仅取页眉/姓名栏中实际出现的文字，不纠正或补写姓名，不把正文人物当作者，也不把“年级班”等模板标签当姓名；提取姓名后才从标题和正文中去掉模板信息。给 AI 的文本压缩作文格下划线，不丢弃姓名文字。若 AI 整理失败或输出的字词不能按原顺序在 OCR 原文中找到，使用规则清洗正文及本地姓名提取兜底，不追加 OCR 请求。
- 页眉姓名与当前任务所选全部班级的学生名单匹配，自动绑定候选列表中排名第一的学生；没有识别到姓名或没有有效候选时保留未绑定状态。后端启动时，也会用已保存的页眉姓名补齐已有未绑定作文，保留老师已绑定的学生。
- 作文详情页按姓名位置匹配与离线 Unihan 部首、笔画线索显示最多 5 名候选学生及匹配度，老师仍可点击其他候选更正。匹配度是排序分数而非概率；最高分并列时使用候选列表中的稳定排序。Unihan 数据来自 Unicode 18.0.0，版权许可见 `backend/UNICODE-LICENSE.txt`。
- DeepSeek 负责题目讲解和作文点评，不负责图片 OCR。
- 作文批阅采用 OCR 容错提示词：不点评错别字、标点或疑似识别造成的局部语病，不据此降低总分或语言分；存在问题与修改建议聚焦扣题、选材、立意、结构。正文整理仍忠实保留转写内容，原有评语需重新生成后才应用新规则。

admin
Admin@123456