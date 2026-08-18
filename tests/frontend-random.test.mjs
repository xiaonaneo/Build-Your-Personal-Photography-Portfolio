import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");

assert.match(html, /data-random-photo/, "前台需要 Random 按钮入口");
assert.match(script, /function buildRandomPhotoTargets/, "需要把所有作品集图片整理成随机候选池");
assert.match(script, /function showRandomPhoto/, "需要独立的随机跳转逻辑");
assert.match(script, /Math\.random/, "随机跳转应使用随机索引");
assert.match(script, /data-random-photo/, "Random 按钮需要绑定点击事件");
assert.match(script, /renderCollectionNav\(\);/, "随机跨作品集后需要刷新导航高亮");
assert.match(script, /data-collection-description/, "前台需要展示当前作品集简介");
assert.match(html, /class="showcase"/, "作品集简介需要位于主视觉区域而不是左侧导航");
