import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

import defaultConfig from "../../default-config.json" with { type: "json" };

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

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
    return new Response(JSON.stringify(normalizeConfig(config)), {
      headers: jsonHeaders,
    });
  }

  if (request.method === "POST") {
    const config = normalizeConfig(await request.json());
    await store.setJSON("site-config", config);
    return new Response(JSON.stringify({ ok: true }), {
      headers: jsonHeaders,
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/config",
  method: ["GET", "POST"],
};
