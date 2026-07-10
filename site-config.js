const DEFAULT_SITE_CONFIG = {
  name: "",
  activeCollectionIndex: 0,
  collections: [
    {
      name: "Portfolio",
      photos: [
        {
          src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1400&q=90",
          alt: "黑白人像摄影作品",
        },
      ],
    },
  ],
};

function normalizePhotos(photos) {
  return photos
    .map((photo) => ({
      src: String(photo.src || "").trim(),
      alt: String(photo.alt || "摄影作品").trim(),
    }))
    .filter((photo) => photo.src);
}

function normalizeSiteConfig(config) {
  const fallback = structuredClone(DEFAULT_SITE_CONFIG);
  const merged = {
    ...fallback,
    ...config,
  };
  const collections = Array.isArray(config.collections) ? config.collections : [];
  const normalizedCollections = collections
    .map((collection, index) => ({
      name: String(collection.name || `Portfolio ${index + 1}`).trim(),
      photos: normalizePhotos(Array.isArray(collection.photos) ? collection.photos : []),
    }))
    .filter((collection) => collection.name);

  merged.collections = normalizedCollections.length > 0
    ? normalizedCollections
    : structuredClone(DEFAULT_SITE_CONFIG.collections);
  merged.activeCollectionIndex = Math.min(
    Math.max(Number(merged.activeCollectionIndex) || 0, 0),
    merged.collections.length - 1,
  );

  return merged;
}

async function readSiteConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) throw new Error("API unavailable");
    return normalizeSiteConfig(await response.json());
  } catch {
    return normalizeSiteConfig(structuredClone(DEFAULT_SITE_CONFIG));
  }
}

async function writeSiteConfig(config) {
  const response = await fetch("/api/config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(normalizeSiteConfig(config)),
  });

  if (!response.ok) {
    throw new Error("Save failed");
  }
}

async function resetSiteConfig() {
  await writeSiteConfig(structuredClone(DEFAULT_SITE_CONFIG));
}

async function uploadPhotos(files, onProgress) {
  const form = new FormData();
  files.forEach((file) => form.append("photos", file));

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/upload");

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || typeof onProgress !== "function") return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    });

    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error("Upload failed"));
        return;
      }

      try {
        const payload = JSON.parse(request.responseText);
        resolve(Array.isArray(payload.photos) ? payload.photos : []);
      } catch {
        reject(new Error("Upload response invalid"));
      }
    });

    request.addEventListener("error", () => reject(new Error("Upload failed")));
    request.send(form);
  });
}
