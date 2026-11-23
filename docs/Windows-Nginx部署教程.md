# 作文批改系统：Windows 服务器 Nginx 部署（简版）

适合学校服务器上已经能用 `npm run dev` 的情况。**Nginx 负责网页，`npm run start:prod` 负责后端。** 继续用现有账号、数据库和作文文件。

下面用你之前的服务器路径举例。如果实际路径不同，换成有 `package.json`、`frontend` 和 `backend` 的项目目录。

## 1. 停掉旧版本，构建一次

选没人上传或批阅的时候，在原来的前端、后端窗口按 **Ctrl+C**。保留服务器的 `backend\.env` 和作文上传目录。

打开 PowerShell：

```powershell
cd 'D:\作文批改系统\作文批改系统'
npm run build
```

等构建成功再继续。如果你已经在开发电脑构建好了，也可以直接复制完整的 `frontend\dist`、`backend\dist` 和修正过的 `backend\package.json`，不用在服务器重复构建。如果依赖有更新，先同步项目的 `package.json` 和 `package-lock.json`，在项目根目录运行 `npm ci --include=dev`。

> **如果还要上线教师账号新版**：构建前先同步完整的 `backend\prisma` 和 `backend\prisma.config.ts`，在 `backend` 运行 `npm run prisma:generate`。如果学校数据库还没迁移，先备份，再在 `backend` 运行 `npx prisma migrate deploy`，成功后再启动。只换启动方式就跳过这一段。不要运行 `db:seed`。

## 2. 启动后端

```powershell
cd 'D:\作文批改系统\作文批改系统\backend'
npm run start:prod
```

保留这个窗口，关闭后后端会停止。

## 3. 启动 Nginx

1. 从 [Nginx 官网](https://nginx.org/en/download.html) 下载 **nginx/Windows**，解压后确认 `C:\nginx\nginx.exe` 存在。
2. 把 [配置模板](./nginx.windows.example.conf) 的内容放进 `C:\nginx\conf\nginx.conf`。只需核对模板的 `root` 指向服务器上的 `frontend/dist`；如果 `backend\.env` 的端口不是 `3000`，把模板中两个 `3000` 改成实际端口。若服务器已有 Nginx 和其他网站，请网管把模板中的 `server` 加进去。
3. 另开 PowerShell，检查配置：

```powershell
cd C:\nginx
.\nginx.exe -t
```

看到 `test is successful` 后启动：

```powershell
Start-Process 'C:\nginx\nginx.exe' -WorkingDirectory 'C:\nginx' -WindowStyle Hidden
```

如果 Nginx 已在运行，用 `.\nginx.exe -s reload` 加载配置。

## 4. 试一下

先在服务器打开 **http://127.0.0.1:8080**，能登录后，再从老师电脑访问 **http://服务器IP:8080**。用原账号登录，打开一篇旧作文看原图，再上传一张测试图。

- **服务器能打开，老师电脑打不开**：请网管给教师网段放行 TCP `8080`。服务器 IP 可用 `ipconfig` 查看。
- **报 `502`**：检查后端窗口是否还在运行，以及端口是否和 Nginx 一致。
- **登录请求还在访问 `localhost:3000`**：把前端的 `VITE_API_BASE_URL` 设为 `/api`，重新构建前端。

确认能用后，再用 Windows 任务计划程序给 Nginx 和后端设置开机自启。
