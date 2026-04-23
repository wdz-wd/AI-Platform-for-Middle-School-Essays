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
- `BAIDU_OCR_KEY_FILE` 或 `BAIDU_OCR_ACCESS_TOKEN`
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

- 当前不接 Redis，OCR 使用百度手写作文识别异步接口。
- 文本型 `pdf` 会优先直接提取正文并进入 AI 批改。
- `jpg/png` 与扫描版 `pdf` 会先自动提交到百度 OCR，识别成功后自动进入 AI 批改。
- 当 OCR 识别失败或文本过短时，作文会进入“待补录正文”状态。
- 默认会从 `backend/作文管理平台key.txt` 读取 `access_token`；如果 `.env` 中配置了 `BAIDU_OCR_ACCESS_TOKEN`，则以 `.env` 为准。
- DeepSeek 负责题目讲解和作文点评，不负责图片 OCR。
