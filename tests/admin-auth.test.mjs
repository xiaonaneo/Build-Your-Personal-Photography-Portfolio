import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const authScript = readFileSync(new URL("../admin-auth.js", import.meta.url), "utf8");
const configFunction = readFileSync(new URL("../netlify/functions/config.ts", import.meta.url), "utf8");
const uploadFunction = readFileSync(new URL("../netlify/functions/upload.ts", import.meta.url), "utf8");

assert.match(html, /data-login-form/, "后台需要登录表单");
assert.match(html, /type="password"/, "后台密码必须使用 password 输入框");
assert.match(html, /data-editor-shell hidden/, "编辑器在认证前必须隐藏");
assert.match(authScript, /fetch\("\/api\/auth"/, "后台需要调用认证接口");
assert.match(authScript, /method: "POST"/, "后台需要提交登录请求");
assert.match(authScript, /method: "DELETE"/, "后台需要支持退出登录");
assert.match(configFunction, /requireAdmin\(request\)/, "配置写入接口必须服务端鉴权");
assert.match(uploadFunction, /requireAdmin\(request\)/, "上传接口必须服务端鉴权");
