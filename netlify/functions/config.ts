import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

import defaultConfig from "../../default-config.json" with { type: "json" };
import { requireAdmin } from "./_shared/auth.js";
import { jsonResponse, readJson, securityHeaders, MAX_CONFIG_BODY_BYTES } from "./_shared/http.js";

const MAX_COLLECTIONS = 50;
const MAX_PHOTOS_PER_COLLECTION = 200;
const MAX_TOTAL_PHOTOS = 500;
const MAX_NAME_LENGTH = 200;
const MAX_ALT_LENGTH = 300;
const MAX_SOURCE_LENGTH = 2048;

function isAllowedImageSource(source: string) {
  if (source.startsWith("/uploads/") && !source.includes("..")) return true;
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateConfig(config: unknown) {
  if (typeof config !== "object" || config === null) return "配置格式无效。";
  const value = config as any;
  if (typeof value.name === "string" && value.name.length > MAX_NAME_LENGTH) return "网站名称过长。";
  if (!Array.isArray(value.collections)) return null;
  if (value.collections.length > MAX_COLLECTIONS) return "作品集数量超过上限。";

  let totalPhotos = 0;
  for (const collection of value.collections) {
    if (typeof collection !== "object" || collection === null) return "作品集格式无效。";
    if (String(collection.name || "").length > MAX_NAME_LENGTH) return "作品集名称过长。";
    if (!Array.isArray(collection.photos)) return "作品集图片格式无效。";
    if (collection.photos.length > MAX_PHOTOS_PER_COLLECTION) return "单个作品集图片数量超过上限。";
    totalPhotos += collection.photos.length;
    for (const photo of collection.photos) {
      if (typeof photo !== "object" || photo === null) return "图片格式无效。";
      const source = String(photo.src || "").trim();
      const alt = String(photo.alt || "摄影作品").trim();
      if (source.length > MAX_SOURCE_LENGTH || !isAllowedImageSource(source)) return "图片地址无效。";
      if (alt.length > MAX_ALT_LENGTH) return "图片描述过长。";
    }
  }
  return totalPhotos > MAX_TOTAL_PHOTOS ? "图片总数超过上限。" : null;
}

function normalizeConfig(config: unknown) {
  const value = typeof config === "object" && config !== null ? config as any : {};
  const collections = Array.isArray(value.collections) ? value.collections : defaultConfig.collections;
  return {
    name: String(value.name || defaultConfig.name),
    activeCollectionIndex: Number.isFinite(Number(value.activeCollectionIndex))
      ? Number(value.activeCollectionIndex)
      : 0,
    collections: collections.map((collection: any, index: number) => ({
      name: String(collection?.name || `Portfolio ${index + 1}`),
      photos: Array.isArray(collection?.photos)
        ? collection.photos
            .map((photo: any) => ({
              src: String(photo?.src || ""),
              alt: String(photo?.alt || "摄影作品"),
            }))
            .filter((photo: { src: string }) => photo.src)
        : [],
    })),
  };
}

export default async (request: Request) => {
  const store = getStore({ name: "portfolio-config", consistency: "strong" });

  if (request.method === "GET") {
    const config = await store.get("site-config", { type: "json" }) ?? defaultConfig;
    return jsonResponse(normalizeConfig(config));
  }

  if (request.method === "POST") {
    const unauthorized = requireAdmin(request);
    if (unauthorized) return unauthorized;
    const parsed = await readJson(request, MAX_CONFIG_BODY_BYTES);
    if (!parsed.ok) return jsonResponse({ code: parsed.code, message: parsed.message }, parsed.status);
    const validationError = validateConfig(parsed.value);
    if (validationError) return jsonResponse({ code: "INVALID_CONFIG", message: validationError }, 400);
    const config = normalizeConfig(parsed.value);
    await store.setJSON("site-config", config);
    return jsonResponse({ ok: true });
  }

  return new Response("Method not allowed", { status: 405, headers: securityHeaders });
};

export const config: Config = {
  path: "/api/config",
  method: ["GET", "POST"],
};
