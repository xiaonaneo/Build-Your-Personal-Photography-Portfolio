import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../admin.js", import.meta.url), "utf8");
const configScript = readFileSync(new URL("../site-config.js", import.meta.url), "utf8");
const allScripts = `${script}\n${configScript}`;

assert.match(html, /data-save-button/, "保存按钮需要可被脚本控制禁用状态");
assert.match(html, /data-upload-progress/, "后台需要上传进度条容器");
assert.match(html, /<progress[^>]+data-upload-progress-bar/, "后台需要原生 progress 进度条");
assert.match(script, /confirmCollectionRemoval/, "删除作品集前需要独立确认逻辑");
assert.match(script, /window\.confirm/, "删除作品集需要调用确认弹窗");
assert.match(script, /markDirty/, "修改后需要统一标记未保存状态");
assert.match(script, /markSaved/, "保存完成后需要统一标记已保存状态");
assert.match(script, /saveButton\.disabled = !isDirty \|\| isSaving/, "无新改动或保存中时保存按钮应禁用");
assert.match(script, /已保存到线上网站/, "保存成功反馈需要明确说明已保存到线上网站");
assert.match(allScripts, /XMLHttpRequest/, "上传进度需要使用支持 upload progress 的请求方式");
assert.match(allScripts, /upload\.addEventListener\("progress"/, "上传时需要监听进度事件");
