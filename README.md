# Personal Photography Site

一个贴近 `www.jmfranceschi.fr` 视觉结构的极简个人摄影网站：白底、左侧固定导航、中央大幅黑白作品、Previous / Next 作品切换和轻量联系层。

## 本地预览

```bash
python3 app.py
```

然后打开：

```text
http://127.0.0.1:4173
```

后台入口：

```text
http://127.0.0.1:4173/admin.html
```

## 后端和数据库

- 后端入口：`app.py`
- 数据库：`data/site.sqlite3`
- 上传目录：`data/uploads/`
- 配置接口：`GET /api/config`、`POST /api/config`
- 图片上传接口：`POST /api/upload`

后台保存后会写入 SQLite；上传图片会保存成文件并返回 `/uploads/...` 路径。

## 部署到 Render

项目已包含 `render.yaml`。在 Render 新建 Blueprint 或 Web Service 时使用这个仓库：

- Build Command 留空
- Start Command: `python3 app.py`
- Environment: `DATA_DIR=/var/data`
- Persistent Disk: 挂载到 `/var/data`

SQLite 数据库和上传图片都放在持久磁盘里。不要部署到没有持久磁盘的纯静态托管，否则后台上传的图片会丢失。

## 替换成你的内容

- 打开后台后，可以编辑姓名、作品集和作品图片。
- 点击“创建新的作品集”可以新增作品集；点击“添加作品”可以从电脑选择图片上传到当前作品集。
- 后台会把配置保存到 SQLite，刷新前台即可看到修改。
