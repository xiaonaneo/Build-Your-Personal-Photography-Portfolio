import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { requireAdmin } from "./_shared/auth.js";
import { requestExceedsLimit, securityHeaders, MAX_UPLOAD_BODY_BYTES } from "./_shared/http.js";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxUploadSize = 4 * 1024 * 1024;
const maxFilesPerRequest = 20;

function detectImageType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return "image/png";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

function extensionFor(type: string) {
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  return ".jpg";
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders,
    },
  });
}

export default async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (requestExceedsLimit(request, MAX_UPLOAD_BODY_BYTES)) {
    return jsonResponse({ code: "REQUEST_TOO_LARGE", message: "上传请求过大。" }, 413);
  }

  const store = getStore({ name: "portfolio-uploads", consistency: "strong" });
  const form = await request.formData();
  const files = form.getAll("photos").filter((item): item is File => item instanceof File);
  if (files.length === 0) return jsonResponse({ code: "NO_FILES", message: "没有找到图片文件。" }, 400);
  if (files.length > maxFilesPerRequest) return jsonResponse({ code: "TOO_MANY_FILES", message: "单次最多上传 20 张图片。" }, 413);
  if (files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_BODY_BYTES) {
    return jsonResponse({ code: "REQUEST_TOO_LARGE", message: "上传请求过大。" }, 413);
  }
  const photos = [];

  for (const file of files) {
    if (!allowedTypes.has(file.type)) {
      return jsonResponse({ error: `${file.name} is not JPG, PNG, or WebP.` }, 400);
    }

    if (file.size > maxUploadSize) {
      return jsonResponse({ code: "SINGLE_FILE_TOO_LARGE", message: `${file.name} 超过 4MB。` }, 400);
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const detectedType = detectImageType(bytes);
    if (!detectedType || detectedType !== file.type) {
      return jsonResponse({ code: "INVALID_IMAGE", message: `${file.name} 不是有效的 JPG、PNG 或 WebP 图片。` }, 400);
    }

    const id = crypto.randomUUID().replaceAll("-", "");
    const key = `${id}${extensionFor(detectedType)}`;
    await store.set(key, buffer, {
      metadata: {
        contentType: detectedType,
        originalName: file.name,
      },
    });
    photos.push({
      src: `/uploads/${key}`,
      alt: file.name.replace(/\.[^.]+$/, "") || "摄影作品",
    });
  }

  return jsonResponse({ photos });
};

export const config: Config = {
  path: "/api/upload",
  method: ["POST"],
};
