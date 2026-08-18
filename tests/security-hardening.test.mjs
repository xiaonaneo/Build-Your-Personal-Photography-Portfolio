import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const netlifyConfig = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const pythonApp = readFileSync(new URL("../app.py", import.meta.url), "utf8");
const configFunction = readFileSync(new URL("../netlify/functions/config.ts", import.meta.url), "utf8");
const uploadFunction = readFileSync(new URL("../netlify/functions/upload.ts", import.meta.url), "utf8");

assert.match(netlifyConfig, /Content-Security-Policy\s*=/, "Netlify 需要配置 CSP");
assert.match(netlifyConfig, /X-Content-Type-Options\s*=\s*"nosniff"/, "Netlify 需要禁止 MIME 嗅探");
assert.doesNotMatch(indexHtml, /<style[\s>]/, "CSP 下不能依赖内联 style");
assert.doesNotMatch(indexHtml, /<script(?![^>]+src=)[^>]*>/, "CSP 下不能依赖内联 script");
assert.match(pythonApp, /MAX_CONFIG_BODY_SIZE/);
assert.match(pythonApp, /MAX_UPLOAD_BODY_SIZE/);
assert.match(pythonApp, /detect_image_type/);
assert.match(pythonApp, /MAX_FILES_PER_REQUEST/);
assert.doesNotMatch(pythonApp, /str\(exc\)/, "配置错误响应不能泄露异常文本");
assert.match(pythonApp, /target\.is_relative_to\(UPLOAD_DIR\)/, "上传路径必须使用目录边界校验");
assert.match(configFunction, /validateConfig/);
assert.match(configFunction, /MAX_DESCRIPTION_LENGTH/);
assert.match(uploadFunction, /detectImageType/);
assert.match(uploadFunction, /maxFilesPerRequest/);
