# Personal Photography Site

一个可复制部署的个人摄影作品网站：前台展示作品，后台登录后管理姓名、作品集和图片。每个部署者拥有自己的站点、管理员密码、配置数据和图片存储。

## 一键部署到 Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/xiaonaneo/Build-Your-Personal-Photography-Portfolio)

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

也可以直接把本仓库地址发送给 AI Agent，并告诉它“按照 README 的流程部署这个网站”，让 AI Agent 按照部署、环境变量配置和后台验证流程完成设置。

不要把密码或 `SESSION_SECRET` 写进仓库。环境变量修改后需要重新构建并部署才能被 Functions 使用。

后台支持一次选择多张照片，并会自动按每批不超过 4 MB 的总大小串行上传；单张照片也需要控制在 4 MB 以内。

### 当前功能

- 后台可编辑网站名称、作品集名称和作品集简介。
- 后台照片列表支持拖拽排序，也可以使用“上移 / 下移”。
- 移动端作品集名称在图片上方横向滚动排列。
- 移动端图片下方左侧显示 `Random / Darkroom`，右侧显示 `Previous / Next`。
- 图片使用响应式尺寸和 Netlify Image CDN，移动端优先加载较小图片。
- 点击图片左半区切换上一张，点击右半区切换下一张。
- 前台会阻止图片右键菜单和原生拖拽保存；这不能阻止截图或开发者工具保存。

### 每个部署者的数据是独立的

Netlify Functions 使用 Netlify Blobs 保存数据：

- `portfolio-config`：网站名称、作品集和图片引用。
- `portfolio-uploads`：后台上传的图片。

这些 Blob store 绑定在各自的 Netlify 站点上。Fork 或一键部署后，其他人的后台、图片和配置不会与原站点共享。

## 让已部署网站自动同步 GitHub 更新

一键部署后，如果希望以后 GitHub 的最新代码自动同步到自己的 Netlify 网站，需要把 Netlify 项目连接到这个 GitHub 仓库：

1. 打开自己的 Netlify 项目。
2. 进入 `Project configuration → Build & deploy → Continuous deployment → Repository`。
3. 点击 `Link repository` 或 `Connect to Git provider`，选择 GitHub。
4. 选择仓库 `xiaonaneo/Build-Your-Personal-Photography-Portfolio`，生产分支选择 `main`。
5. 保存并完成一次部署。

连接成功后，每次仓库 `main` 分支有新提交，Netlify 会自动执行 `npm run build`，发布 `public/` 并重新部署 Functions。直接连接主仓库的项目不需要手动同步，主仓库更新后会自动更新。

如果你使用的是自己的 Fork，需要先添加主仓库为 `upstream`，再同步更新：

```bash
git remote add upstream https://github.com/xiaonaneo/Build-Your-Personal-Photography-Portfolio.git
git fetch upstream
git switch main
git merge upstream/main
git push origin main
```

如果 GitHub 提示存在冲突，需要先解决冲突，再执行 `git add`、`git commit` 和 `git push`。也可以在自己的 GitHub Fork 页面点击 `Sync fork` 同步上游。同步完成后，连接该 Fork 的 Netlify 项目会自动重新部署。也可以在 Netlify 的 `Deploys` 页面查看每次自动部署的提交记录。

自动同步的是代码、样式、前台功能和 Functions，不会覆盖自己后台已经保存的作品、简介、图片或管理员密码；这些数据保存在自己 Netlify 项目的 Blob store 中。

如果项目没有连接 GitHub，手动执行 `netlify deploy --prod` 只能更新当次部署，之后不会自动跟随仓库更新。详见 [Netlify Continuous Deployment 文档](https://docs.netlify.com/deploy/create-deploys/)。

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
