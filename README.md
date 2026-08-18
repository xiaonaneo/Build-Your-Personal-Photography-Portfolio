# Personal Photography Site

一个可复制部署的个人摄影作品网站：前台展示作品，后台登录后管理姓名、作品集和图片。每个部署者拥有自己的站点、管理员密码、配置数据和图片存储。

## 一键部署到 Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/xiaonaneo/photography-webside)

点击按钮后：

1. 登录或注册自己的 Netlify 账号。
2. 选择自己的 Team，填写自己的站点名并完成部署。
3. 在 Netlify 项目中打开 `Project configuration → Environment variables`，添加以下两个 **Production** 变量，并勾选 Secret：

   - `ADMIN_PASSWORD`：你自己的后台密码。
   - `SESSION_SECRET`：至少 32 个字符的随机字符串。可以用下面的命令生成：

     ```bash
     python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
     ```

4. 保存变量后重新部署一次。打开 `https://你的站点名.netlify.app/admin.html`，使用自己的 `ADMIN_PASSWORD` 登录。

不要把密码或 `SESSION_SECRET` 写进仓库。环境变量修改后需要重新构建并部署才能被 Functions 使用。

后台支持一次选择多张照片，并会自动按每批不超过 4 MB 的总大小串行上传；单张照片也需要控制在 4 MB 以内。

### 每个部署者的数据是独立的

Netlify Functions 使用 Netlify Blobs 保存数据：

- `portfolio-config`：网站名称、作品集和图片引用。
- `portfolio-uploads`：后台上传的图片。

这些 Blob store 绑定在各自的 Netlify 站点上。Fork 或一键部署后，其他人的后台、图片和配置不会与原站点共享。

## 本地预览

安装依赖并生成前台发布目录：

```bash
npm install
npm run build
```

使用 Python 本地预览时，需要设置本地后台密钥：

```bash
export ADMIN_PASSWORD='local-only-password'
export SESSION_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
python3 app.py
```

然后打开：

- 前台：`http://127.0.0.1:4173`
- 后台：`http://127.0.0.1:4173/admin.html`

使用 Netlify Functions 本地预览：

```bash
npm run build
npx netlify dev
```

## 手动部署

```bash
npm install
npm run build
npx netlify deploy --prod
```

`netlify.toml` 将 `public/` 作为发布目录，只发布前台和后台运行所需的白名单文件；Python 源码、测试、文档和本地数据不会作为静态文件公开。Functions 位于 `netlify/functions/`，由 Netlify 自动打包。

## Render 部署

项目也保留了 Python + SQLite 的 Render 路径。使用 Render Blueprint 或 Web Service 部署时：

- Build Command 留空。
- Start Command：`python3 app.py`。
- `DATA_DIR=/var/data`。
- 配置持久磁盘并挂载到 `/var/data`。

SQLite 数据库和上传图片需要持久磁盘。纯静态托管应使用上面的 Netlify Functions + Blobs 路径。

## 开发检查

```bash
npm run build
node --test tests/*.mjs
git diff --check
```
