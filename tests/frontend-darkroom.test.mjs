import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const themeInit = readFileSync(new URL("../theme-init.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

assert.match(html, /data-theme-toggle/, "前台需要 Darkroom 模式按钮入口");
assert.match(html, /theme-init\.js/, "首屏需要加载主题初始化脚本避免闪白");
assert.match(themeInit, /localStorage\.getItem\("echo37-theme"\)/, "首屏需要提前读取主题避免闪白");
assert.match(script, /const THEME_STORAGE_KEY = "echo37-theme"/, "主题选择需要使用稳定的本地存储 key");
assert.match(script, /function applyTheme/, "需要统一应用主题状态");
assert.match(script, /function toggleTheme/, "需要独立切换主题逻辑");
assert.match(script, /localStorage\.setItem\(THEME_STORAGE_KEY/, "切换后需要记住用户选择");
assert.match(script, /data-theme-toggle/, "Darkroom 按钮需要绑定点击事件");
assert.match(styles, /body\.is-darkroom/, "样式需要包含黑夜模式状态类");
assert.match(styles, /--page: #[0-9a-fA-F]{6}/, "黑夜模式需要覆盖页面背景变量");
assert.match(styles, /color-scheme: dark/, "黑夜模式需要声明 dark color-scheme");
assert.doesNotMatch(script, /isSwitching|is-changing|is-photo-loading/, "照片切换不应再使用过渡动效状态");
assert.match(script, /event\.clientX < bounds\.left \+ bounds\.width \/ 2/, "点击图片左右区域需要决定前进或后退");
assert.doesNotMatch(html, /data-photo-nav-hint/, "正式站点不应显示图片左右箭头提示");
assert.doesNotMatch(script, /photoNavHint|photoFrame\.dataset\.direction|w-resize|e-resize/, "正式站点不应显示方向提示或方向鼠标");
assert.match(script, /contextmenu.*preventDefault/, "图片需要禁止右键复制菜单");
assert.match(script, /dragstart.*preventDefault/, "图片需要禁止原生拖拽保存");
