const DEFAULT_SITE_CONFIG = {
  name: "",
  activeCollectionIndex: 0,
  collections: [
    {
      name: "Portfolio",
      description: "",
      photos: [
        {
          src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1400&q=90",
          alt: "黑白人像摄影作品",
        },
      ],
    },
  ],
};

// Keep multipart batches below Netlify's effective binary request limit.
const MAX_UPLOAD_BATCH_BYTES = 4 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 500;

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
      description: String(collection.description || "").trim().slice(0, MAX_DESCRIPTION_LENGTH),
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
    credentials: "same-origin",
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

function createUploadBatches(files) {
  const batches = [];
  let batch = [];
  let batchBytes = 0;

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BATCH_BYTES) {
      const error = new Error("SINGLE_FILE_TOO_LARGE");
      error.code = "SINGLE_FILE_TOO_LARGE";
      throw error;
    }

    if (batch.length > 0 && batchBytes + file.size > MAX_UPLOAD_BATCH_BYTES) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }

    batch.push(file);
    batchBytes += file.size;
  }

  if (batch.length > 0) batches.push(batch);
  return batches;
}

function uploadPhotoBatch(files, onProgress) {
  const form = new FormData();
  files.forEach((file) => form.append("photos", file));
  const batchBytes = files.reduce((total, file) => total + file.size, 0);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/upload");
    request.withCredentials = true;

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || typeof onProgress !== "function") return;
      onProgress(Math.min(1, event.loaded / event.total) * batchBytes);
    });

    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        let error;
        try {
          const payload = JSON.parse(request.responseText);
          error = new Error(payload.message || "Upload failed");
          error.code = payload.code || "UPLOAD_FAILED";
        } catch {
          error = new Error("Upload failed");
          error.code = "UPLOAD_FAILED";
        }
        reject(error);
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

async function uploadPhotos(files, onProgress) {
  const batches = createUploadBatches(files);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  let uploadedBytes = 0;
  const photos = [];

  for (const batch of batches) {
    const batchPhotos = await uploadPhotoBatch(batch, (batchUploadedBytes) => {
      if (typeof onProgress !== "function") return;
      onProgress(Math.round(((uploadedBytes + batchUploadedBytes) / totalBytes) * 100));
    });
    photos.push(...batchPhotos);
    uploadedBytes += batch.reduce((total, file) => total + file.size, 0);
  }

  return photos;
}
