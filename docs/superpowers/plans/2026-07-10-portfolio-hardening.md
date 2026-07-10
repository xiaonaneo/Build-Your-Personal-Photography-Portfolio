# Echo37 Portfolio Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Secure the shared admin, manage uploaded images safely, improve first-screen and image performance, prevent accidental edits, and finish SEO and accessibility without changing the portfolio's established visual style.

**Architecture:** Keep the vanilla HTML/CSS/JavaScript frontend and Netlify Functions/Blobs backend. Add small TypeScript shared modules for authentication, validation, configuration revisions, and image lifecycle logic; keep public reads open while requiring a signed seven-day cookie for every mutation. Deliver the work in the exact five-stage order approved in the design.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, TypeScript, Node test runner with `tsx`, Netlify Functions, Netlify Blobs, Netlify Image CDN, Netlify CLI.

---

## File Map

- `netlify/functions/_shared/auth.ts`: password verification, session token signing, cookie parsing, authorization.
- `netlify/functions/_shared/http.ts`: consistent JSON responses and API errors.
- `netlify/functions/_shared/config-model.ts`: normalize, validate, revise, and diff portfolio configuration.
- `netlify/functions/_shared/image-file.ts`: extension, MIME, signature, dimension, and blob-key validation.
- `netlify/functions/_shared/rate-limit.ts`: login and mutation request counters.
- `netlify/functions/auth.ts`: login, session check, and logout endpoint.
- `netlify/functions/config.ts`: public read plus authenticated, revision-safe writes and image cleanup.
- `netlify/functions/upload.ts`: authenticated one-file uploads.
- `netlify/functions/cleanup-uploads.ts`: daily orphan cleanup.
- `netlify/functions/history.ts`: authenticated ten-version history and restore.
- `netlify/functions/og-image.ts`: current public share image redirect.
- `admin-auth.js`: login/logout UI and authenticated editor bootstrap.
- `admin.js`: editor state, sequential uploads, undo, conflict handling, and history UI.
- `site-config.js`: public configuration cache, API errors, upload queue, and responsive URL helpers.
- `script.js`: public rendering, URL state, keyboard and swipe interactions.
- `index.html`, `styles.css`: metadata, responsive image markup, focus and reduced-motion behavior.
- `admin.html`, `admin.css`: login, warning, undo, history, and accessible status UI.
- `tests/*.test.mts`: unit tests for server logic.
- `tests/*.test.mjs`: DOM-contract tests for static frontend behavior.

## Task 0: Capture the Existing Application Baseline

**Files:**
- Track: `.gitignore`, `.netlifyignore`, `README.md`, `index.html`, `styles.css`, `script.js`, `site-config.js`, `admin.html`, `admin.css`, `admin.js`, `default-config.json`, `netlify.toml`, `netlify/functions/*.ts`, `package.json`, `package-lock.json`, `tests/*.test.mjs`

- [ ] **Step 1: Verify the current baseline**

Run:

```bash
node tests/frontend-darkroom.test.mjs
node tests/frontend-random.test.mjs
node tests/admin-behavior.test.mjs
node --check script.js
node --check admin.js
npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Commit only the active Netlify application baseline**

```bash
git add .gitignore .netlifyignore README.md index.html styles.css script.js site-config.js admin.html admin.css admin.js default-config.json netlify.toml netlify/functions package.json package-lock.json tests
git commit -m "chore: capture portfolio application baseline"
```

Do not add `app.py`, `render.yaml`, preview screenshots, or reference imagery because they are outside the active Netlify deployment.

## Stage 1: Admin Login and API Protection

### Task 1: Add the Test and TypeScript Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tsconfig.json`
- Create: `tests/auth.test.mts`

- [ ] **Step 1: Write a failing authentication contract test**

Create tests that import `createSessionToken`, `verifySessionToken`, and `verifyPassword` from `_shared/auth.ts` and assert:

```ts
assert.equal(verifyPassword("correct", "correct", "secret"), true);
assert.equal(verifyPassword("wrong", "correct", "secret"), false);
const token = createSessionToken("password", "secret", 1_000, 7 * 86_400_000);
assert.equal(verifySessionToken(token, "password", "secret", 2_000), true);
assert.equal(verifySessionToken(token, "new-password", "secret", 2_000), false);
assert.equal(verifySessionToken(token, "password", "secret", 700_000_001), false);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --import tsx --test tests/auth.test.mts`

Expected: FAIL because `tsx` or `_shared/auth.ts` is missing.

- [ ] **Step 3: Install the test loader and add scripts**

Run: `npm install --save-dev tsx`

Add:

```json
"test": "node --import tsx --test tests/*.test.mjs tests/*.test.mts",
"check": "tsc --noEmit"
```

Configure `tsconfig.json` for ES2022, DOM, NodeNext modules, `strict: true`, and `noEmit: true`.

- [ ] **Step 4: Confirm the test now fails only because auth is unimplemented**

Run: `node --import tsx --test tests/auth.test.mts`

Expected: FAIL with missing module/export.

### Task 2: Implement Signed Seven-Day Sessions

**Files:**
- Create: `netlify/functions/_shared/auth.ts`
- Create: `netlify/functions/_shared/http.ts`
- Test: `tests/auth.test.mts`

- [ ] **Step 1: Implement the minimum auth primitives**

Use `createHmac`, `timingSafeEqual`, and SHA-256 from `node:crypto`. Token format must be `v1.<expires>.<passwordVersion>.<signature>`, with base64url encoding. Export:

```ts
export const SESSION_COOKIE = "echo37_admin";
export function verifyPassword(input: string, expected: string, secret: string): boolean;
export function createSessionToken(password: string, secret: string, now?: number, ttlMs?: number): string;
export function verifySessionToken(token: string, password: string, secret: string, now?: number): boolean;
export function readSession(request: Request): string | null;
export function requireAdmin(request: Request): Response | null;
```

`requireAdmin` reads `ADMIN_PASSWORD` and `SESSION_SECRET` from `Netlify.env`, returns HTTP 500 with `AUTH_NOT_CONFIGURED` when missing, HTTP 401 with `AUTH_REQUIRED` when invalid, and `null` when authorized.

- [ ] **Step 2: Run authentication tests and verify GREEN**

Run: `node --import tsx --test tests/auth.test.mts`

Expected: PASS.

- [ ] **Step 3: Add cookie tests**

Test missing cookie, valid cookie, expired cookie, and password rotation. Verify cookie attributes contain `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, and `Max-Age=604800`.

- [ ] **Step 4: Run tests and commit**

```bash
npm test
npm run check
git add package.json package-lock.json tsconfig.json tests/auth.test.mts netlify/functions/_shared
git commit -m "feat: add signed admin sessions"
```

### Task 3: Add Login Rate Limiting and Auth Endpoint

**Files:**
- Create: `netlify/functions/_shared/rate-limit.ts`
- Create: `netlify/functions/auth.ts`
- Create: `tests/rate-limit.test.mts`
- Create: `tests/auth-endpoint.test.mts`

- [ ] **Step 1: Write failing tests**

Test a pure `nextAttempt(record, now)` function: attempts 1-9 remain allowed, attempt 10 blocks until fifteen minutes after the first attempt, expired records reset, and success clears the record. Test endpoint behavior with dependency-injected secrets/store: GET returns auth state, POST rejects invalid passwords, POST sets a cookie for a valid password, DELETE clears it.

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/rate-limit.test.mts tests/auth-endpoint.test.mts`

Expected: FAIL because modules are missing.

- [ ] **Step 3: Implement rate limiter and `/api/auth`**

Hash `context.ip` with `SESSION_SECRET` before using it as a Blob key. Store `{ count, firstAttemptAt, blockedUntil }` in `portfolio-auth-rate`. Export the same counter primitive and allow no more than 120 authenticated mutations per session in fifteen minutes. Return Chinese JSON errors with 401/429. On success return `{ authenticated: true }` and the session cookie; on logout return an expired cookie.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test
npm run check
git add netlify/functions/_shared/rate-limit.ts netlify/functions/auth.ts tests
git commit -m "feat: add protected admin login endpoint"
```

### Task 4: Protect Mutations and Add the Login UI

**Files:**
- Modify: `netlify/functions/config.ts`
- Modify: `netlify/functions/upload.ts`
- Create: `admin-auth.js`
- Modify: `admin.html`
- Modify: `admin.css`
- Modify: `admin.js`
- Modify: `site-config.js`
- Create: `tests/admin-auth.test.mjs`

- [ ] **Step 1: Write failing static and endpoint tests**

Assert that config POST and upload call `requireAdmin`, config GET remains public, admin HTML contains `data-login-form`, password input, logout button, and hidden editor shell, and `admin-auth.js` calls `/api/auth` with POST/DELETE.

- [ ] **Step 2: Verify RED**

Run: `node tests/admin-auth.test.mjs`

Expected: FAIL on missing login contract.

- [ ] **Step 3: Implement login bootstrap**

`admin-auth.js` checks `GET /api/auth`; authenticated users reveal the editor and call `initAdmin()`. Unauthenticated users see the password form. Login errors use a live status element. Logout asks for confirmation if the editor reports dirty/busy state, then calls DELETE and returns to login.

Update protected client requests to use `credentials: "same-origin"` and throw a typed `ApiError` carrying status/code/message. Apply the authenticated mutation counter to configuration writes and uploads. Do not initialize or expose portfolio content before authentication succeeds.

- [ ] **Step 4: Run all tests and commit Stage 1**

```bash
npm test
npm run check
node --check admin-auth.js
git add admin.html admin.css admin.js admin-auth.js site-config.js netlify/functions/config.ts netlify/functions/upload.ts tests/admin-auth.test.mjs
git commit -m "feat: protect portfolio administration"
```

## Stage 2: Image Deletion and Upload Limits

### Task 5: Validate One Image Per Request

**Files:**
- Create: `netlify/functions/_shared/image-file.ts`
- Rewrite: `netlify/functions/upload.ts`
- Create: `tests/image-file.test.mts`

- [ ] **Step 1: Write failing binary-signature tests**

Provide byte fixtures for JPEG (`ff d8 ff`), PNG (`89 50 4e 47 0d 0a 1a 0a`), WebP (`RIFF....WEBP`), mismatched signatures, unsupported extensions, zero dimensions, dimensions over 50,000, two-file requests, and files above 5 MB.

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/image-file.test.mts`

Expected: FAIL because validators are missing.

- [ ] **Step 3: Implement validation**

Export `detectImageType(bytes)`, `validateImageUpload(file, width, height)`, and `safeImageKey(type)`. Require exactly one `photo` field, verify extension/MIME/signature agreement, enforce 5 MB, and store `uploadedAt`, `width`, `height`, and trusted content type in Blob metadata. Return only `{ src, width, height }`.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test
npm run check
git add netlify/functions/_shared/image-file.ts netlify/functions/upload.ts tests/image-file.test.mts
git commit -m "feat: validate portfolio image uploads"
```

### Task 6: Upload Sequentially With an Overall Limit

**Files:**
- Modify: `site-config.js`
- Modify: `admin.js`
- Modify: `admin.html`
- Create: `tests/admin-upload-queue.test.mjs`

- [ ] **Step 1: Write a failing frontend contract test**

Assert `MAX_UPLOAD_FILES = 20`, one `FormData` request per file, image dimensions obtained before upload, loop progress includes file index and total count, and controls are disabled while uploading.

- [ ] **Step 2: Verify RED**

Run: `node tests/admin-upload-queue.test.mjs`

Expected: FAIL because uploads are still batched.

- [ ] **Step 3: Implement the sequential queue**

Replace `uploadPhotos(files)` with `uploadPhoto(file, dimensions, onProgress)`. Validate all selected files before starting. Decode each local image to obtain width/height, upload one at a time, append successful results in selection order, and show `正在上传 3 / 12（42%）`. Preserve successful uploads if a later file fails and provide a retry message.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test
node --check admin.js
node --check site-config.js
git add admin.html admin.js site-config.js tests/admin-upload-queue.test.mjs
git commit -m "feat: upload portfolio images sequentially"
```

### Task 7: Delete Unreferenced Blobs and Clean Orphans

**Files:**
- Create: `netlify/functions/_shared/config-model.ts`
- Modify: `netlify/functions/config.ts`
- Create: `netlify/functions/cleanup-uploads.ts`
- Create: `tests/config-model.test.mts`
- Create: `tests/orphan-cleanup.test.mts`

- [ ] **Step 1: Write failing reference-diff tests**

Test that `removedUploadKeys(oldConfig, newConfig, retainedHistory)` deletes only local `/uploads/<key>` references removed from the current configuration and all ten retained snapshots, retains shared or restorable references, ignores external URLs, and rejects malformed upload paths. Test configuration limits of 50 collections, 500 photos per collection, and 80 characters for site and collection names. Test `selectOrphans(blobs, referencedKeys, historyKeys, now)` removes only blobs absent from current/history references and older than 24 hours.

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/config-model.test.mts tests/orphan-cleanup.test.mts`

Expected: FAIL because helpers are missing.

- [ ] **Step 3: Implement save-time and scheduled deletion**

Normalize/validate configuration before writing. Save the new configuration first; then call `context.waitUntil` to delete only keys absent from current and retained-history references. Add a daily scheduled function that lists `portfolio-uploads`, reads `uploadedAt`, compares against current and history references, and deletes only stale orphans.

- [ ] **Step 4: Verify GREEN and commit Stage 2**

```bash
npm test
npm run check
git add netlify/functions/_shared/config-model.ts netlify/functions/config.ts netlify/functions/cleanup-uploads.ts tests
git commit -m "feat: clean removed and abandoned portfolio images"
```

## Stage 3: First-Screen Cache and Responsive Images

### Task 8: Add Last-Known-Good Configuration Cache

**Files:**
- Modify: `default-config.json`
- Modify: `site-config.js`
- Modify: `script.js`
- Modify: `index.html`
- Modify: `netlify.toml`
- Create: `tests/frontend-cache.test.mjs`

- [ ] **Step 1: Write failing cache tests**

Assert a stable cache key, cached render before network completion, schema/version validation, no bundled Unsplash fallback, retry state when neither cache nor API exists, and specific cache headers for HTML versus CSS/JS.

- [ ] **Step 2: Verify RED**

Run: `node tests/frontend-cache.test.mjs`

Expected: FAIL because the fallback still includes Unsplash and all static files use `no-store`.

- [ ] **Step 3: Implement stale-while-refresh client behavior**

Make the bundled default neutral and empty. `readCachedSiteConfig()` returns only valid cached JSON. `initSite()` renders cached content synchronously when available, fetches current content, updates cache, and rerenders only on a changed revision. Add a visible-but-minimal retry state for first-visit failure.

In `netlify.toml`, keep HTML revalidated, make CSS/JS use `public, max-age=0, must-revalidate`, keep uploaded images immutable, and add security headers in Stage 5 rather than duplicating them here.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test
node --check script.js
node --check site-config.js
git add default-config.json index.html script.js site-config.js netlify.toml tests/frontend-cache.test.mjs
git commit -m "perf: render cached portfolio configuration first"
```

### Task 9: Add Responsive Netlify Image URLs

**Files:**
- Modify: `site-config.js`
- Modify: `script.js`
- Modify: `admin.js`
- Modify: `netlify.toml`
- Create: `tests/responsive-images.test.mjs`

- [ ] **Step 1: Write failing URL and markup tests**

Assert `/uploads/key.jpg` transforms to `/.netlify/images?url=%2Fuploads%2Fkey.jpg&w=...&q=82`, external URLs remain usable, the active image receives 480/960/1440 `srcset`, `sizes`, width/height, `decoding`, and first-image fetch priority, and admin thumbnails request width 160.

- [ ] **Step 2: Verify RED**

Run: `node tests/responsive-images.test.mjs`

Expected: FAIL because responsive helpers and attributes are missing.

- [ ] **Step 3: Implement responsive rendering**

Add `imageCdnUrl(src, width, quality = 82)` and `imageSrcSet(src)`. Preserve raw `src` in saved configuration. Use transformed URLs only for display and preload. Reserve aspect ratio when dimensions exist and capture dimensions for legacy images in the admin draft without marking unrelated content dirty.

- [ ] **Step 4: Verify GREEN and commit Stage 3**

```bash
npm test
node --check script.js
node --check admin.js
git add site-config.js script.js admin.js netlify.toml tests/responsive-images.test.mjs
git commit -m "perf: serve responsive portfolio images"
```

## Stage 4: Admin Safeguards

### Task 10: Add Revisions and Ten-Version History

**Files:**
- Modify: `netlify/functions/_shared/config-model.ts`
- Modify: `netlify/functions/config.ts`
- Create: `netlify/functions/history.ts`
- Create: `tests/config-revision.test.mts`
- Create: `tests/history.test.mts`

- [ ] **Step 1: Write failing revision/history tests**

Assert a matching revision saves as `revision + 1`, a stale revision returns a conflict result without writing, the previous configuration is snapshotted before write, history retains the ten newest records, and restore creates a new revision rather than replacing history.

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/config-revision.test.mts tests/history.test.mts`

Expected: FAIL because revision/history behavior is missing.

- [ ] **Step 3: Implement revision-safe writes and history endpoint**

Migrate legacy configuration to revision 0 on read. POST requires `revision`; mismatch returns `{ code: "CONFIG_CONFLICT", message: "线上内容已被其他人更新。" }` with 409. Store snapshots in `portfolio-config-history`, list newest-first, delete entries beyond ten, and protect GET/POST history operations with `requireAdmin`.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test
npm run check
git add netlify/functions/_shared/config-model.ts netlify/functions/config.ts netlify/functions/history.ts tests
git commit -m "feat: prevent conflicting portfolio saves"
```

### Task 11: Add Unsaved Warnings, Undo, and History UI

**Files:**
- Modify: `admin.html`
- Modify: `admin.css`
- Modify: `admin.js`
- Modify: `site-config.js`
- Create: `tests/admin-safeguards.test.mjs`

- [ ] **Step 1: Write failing UI contract tests**

Assert `beforeunload` checks dirty/uploading/saving state, deletion stores an undo record, the save path confirms removed-image count, 409 produces a reload action, and history UI has timestamp and restore controls without JSON import/export or restore-default controls.

- [ ] **Step 2: Verify RED**

Run: `node tests/admin-safeguards.test.mjs`

Expected: FAIL on missing safeguards.

- [ ] **Step 3: Implement safeguards**

Expose `hasPendingAdminWork()` for logout checks. Add an eight-second undo banner for photo deletion. Count removed upload references against the loaded baseline before save. Disable editor actions while busy. On 409 retain the local draft and show a deliberate reload button. Render version history on demand and confirm restore.

- [ ] **Step 4: Verify GREEN and commit Stage 4**

```bash
npm test
node --check admin.js
node --check site-config.js
git add admin.html admin.css admin.js site-config.js tests/admin-safeguards.test.mjs
git commit -m "feat: guard against accidental admin changes"
```

## Stage 5: SEO and Accessibility

### Task 12: Add Metadata, Share Image, Robots, and Sitemap

**Files:**
- Modify: `index.html`
- Modify: `admin.html`
- Create: `favicon.svg`
- Create: `theme-init.js`
- Create: `robots.txt`
- Create: `sitemap.xml`
- Create: `netlify/functions/og-image.ts`
- Modify: `netlify.toml`
- Create: `tests/seo.test.mjs`

- [ ] **Step 1: Write failing metadata tests**

Assert canonical URL `https://echo37.netlify.app/`, Chinese description, Open Graph title/type/url/image, theme color, favicon, admin `noindex,nofollow`, robots/sitemap content, and public `/api/og-image` behavior.

- [ ] **Step 2: Verify RED**

Run: `node tests/seo.test.mjs`

Expected: FAIL because metadata and files are missing.

- [ ] **Step 3: Implement SEO assets and security headers**

Move the early darkroom initialization out of inline HTML into `theme-init.js` and move critical loading styles into `styles.css`, so the page can use `script-src 'self'` without unsafe inline scripts. The OG endpoint reads current config and redirects to the first local image, returning 404 only when no public photo exists. Add CSP limited to self plus `data:` and `blob:` for local image previews; add `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test
npm run check
git add index.html admin.html styles.css theme-init.js favicon.svg robots.txt sitemap.xml netlify/functions/og-image.ts netlify.toml tests/seo.test.mjs
git commit -m "feat: add portfolio metadata and sharing support"
```

### Task 13: Add URL State, Keyboard Semantics, Swipe, and Contrast

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `script.js`
- Create: `tests/frontend-accessibility.test.mjs`

- [ ] **Step 1: Write failing interaction tests**

Assert URL parameters restore collection/photo indexes safely, navigation calls `history.replaceState`, the photo has button semantics and an automatic collection/position label, Enter/Space advance, touch gestures have a horizontal threshold and vertical-cancel rule, mobile controls remain visible, `:focus-visible` exists, and `prefers-reduced-motion` disables transitions/animation.

- [ ] **Step 2: Verify RED**

Run: `node tests/frontend-accessibility.test.mjs`

Expected: FAIL because these contracts are missing.

- [ ] **Step 3: Implement accessible interactions**

Use `?collection=<index>&photo=<index>` with numeric bounds checking. Add `role="button"`, `tabindex="0"`, and dynamic `aria-label` to the active photo. Handle Enter and Space without interfering with form controls. Advance on left swipe and go back on right swipe only when horizontal movement exceeds 45px and dominates vertical movement. Darkroom remains stored independently.

Use light-theme active green `#3f7f6e`, add a two-pixel focus-visible outline, keep the counter visible under `hover: none`, and remove nonessential motion under reduced-motion preference.

- [ ] **Step 4: Verify GREEN and commit Stage 5**

```bash
npm test
node --check script.js
git add index.html styles.css script.js tests/frontend-accessibility.test.mjs
git commit -m "feat: improve portfolio accessibility and deep links"
```

## Task 14: Full Verification, Preview, and Production Deployment

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the complete local verification suite**

```bash
npm test
npm run check
node --check script.js
node --check admin.js
node --check admin-auth.js
npm run build
git diff --check
```

Expected: all commands pass and the worktree contains no unintended files.

- [ ] **Step 2: Configure secrets without committing them**

The user sets `ADMIN_PASSWORD` in Netlify's Environment variables UI. Generate a 32-byte-or-longer `SESSION_SECRET` locally and set it through the same protected UI or another approved secret-entry mechanism. Never place either value in a command captured in logs, print it, or commit it.

- [ ] **Step 3: Deploy a preview and run browser verification**

Run: `npx netlify deploy`

Verify desktop 1440x900 and mobile 390x844: unauthenticated admin, valid/invalid login, logout, protected POST/upload, sequential upload, save/delete/undo, revision conflict behavior, darkroom, random, click/keyboard/swipe navigation, URL restoration, responsive image requests, metadata, and no console errors.

- [ ] **Step 4: Deploy production and verify live headers/endpoints**

Run: `npx netlify deploy --prod`

Verify:

```text
https://echo37.netlify.app/
https://echo37.netlify.app/admin.html
https://echo37.netlify.app/robots.txt
https://echo37.netlify.app/sitemap.xml
```

Confirm public GET config remains 200, unauthenticated config POST/upload/history return 401, static resources revalidate, uploaded originals remain immutable, Image CDN variants return images, and security headers are present.

- [ ] **Step 5: Update operator documentation and commit**

Document the admin URL, seven-day session, password-change command, logout behavior, friend login steps, upload limits, deletion timing, revision conflicts, and history restore. Do not document secret values.

```bash
git add README.md
git commit -m "docs: document secured portfolio administration"
```
