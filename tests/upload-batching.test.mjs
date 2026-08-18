import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../site-config.js", import.meta.url), "utf8");
const context = { structuredClone };
vm.runInNewContext(`${source}\nthis.uploadBatchTestApi = { createUploadBatches, MAX_UPLOAD_BATCH_BYTES };`, context);

const { createUploadBatches, MAX_UPLOAD_BATCH_BYTES } = context.uploadBatchTestApi;
const file = (size) => ({ size });

assert.equal(MAX_UPLOAD_BATCH_BYTES, 4 * 1024 * 1024);
assert.deepEqual(
  Array.from(createUploadBatches([file(3 * 1024 * 1024), file(1 * 1024 * 1024), file(2 * 1024 * 1024)]), (batch) => batch.length),
  [2, 1],
  "文件应按总大小拆分成多个批次",
);
assert.throws(
  () => createUploadBatches([file(4 * 1024 * 1024 + 1)]),
  /SINGLE_FILE_TOO_LARGE/,
  "超过单批安全大小的单张图片应被明确拒绝",
);
