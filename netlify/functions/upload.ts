import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxUploadSize = 5 * 1024 * 1024;

function extensionFor(file: File) {
  const byName = file.name.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
  if (byName && [".jpg", ".jpeg", ".png", ".webp"].includes(byName)) {
    return byName;
  }

  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  return ".jpg";
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

export default async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const store = getStore({ name: "portfolio-uploads", consistency: "strong" });
  const form = await request.formData();
  const files = form.getAll("photos").filter((item): item is File => item instanceof File);
  const photos = [];

  for (const file of files) {
    if (!allowedTypes.has(file.type)) {
      return jsonResponse({ error: `${file.name} is not JPG, PNG, or WebP.` }, 400);
    }

    if (file.size > maxUploadSize) {
      return jsonResponse({ error: `${file.name} is larger than 5MB.` }, 400);
    }

    const id = crypto.randomUUID().replaceAll("-", "");
    const key = `${id}${extensionFor(file)}`;
    await store.set(key, await file.arrayBuffer(), {
      metadata: {
        contentType: file.type || "application/octet-stream",
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
