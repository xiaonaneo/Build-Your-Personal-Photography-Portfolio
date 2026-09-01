let siteConfig;
let publicCollections = [];
let activeCollectionIndex = 0;
let photos = [];
let activeIndex = 0;
const THEME_STORAGE_KEY = "echo37-theme";

const activePhoto = document.querySelector("#activePhoto");
const current = document.querySelector("#current");
const total = document.querySelector("#total");
const collectionNav = document.querySelector("[data-collection-nav]");
const randomPhotoButtons = document.querySelectorAll("[data-random-photo]");
const themeToggleButtons = document.querySelectorAll("[data-theme-toggle]");
const siteName = document.querySelector("[data-site-name]");
const siteTitle = document.querySelector("[data-site-title]");
const collectionDescription = document.querySelector("[data-collection-description]");
const preloadedPhotos = new Map();

const RESPONSIVE_IMAGE_WIDTHS = [480, 768, 1200];
const RESPONSIVE_IMAGE_SIZES = "(max-width: 760px) calc(100vw - 36px), 575px";

function isImageCdnSource(source) {
  return source.startsWith("/uploads/") || source.includes("images.unsplash.com/");
}

function optimizedImageSource(source, width) {
  if (source.startsWith("/uploads/")) {
    const params = new URLSearchParams({ url: source, w: String(width), q: "78" });
    return `/.netlify/images?${params.toString()}`;
  }

  if (source.includes("images.unsplash.com/")) {
    try {
      const url = new URL(source);
      url.searchParams.set("w", String(width));
      url.searchParams.set("q", "78");
      url.searchParams.set("auto", "format");
      return url.toString();
    } catch {}
  }

  return source;
}

function responsiveImageSrcSet(source) {
  if (!isImageCdnSource(source)) return "";
  return RESPONSIVE_IMAGE_WIDTHS
    .map((width) => `${optimizedImageSource(source, width)} ${width}w`)
    .join(", ");
}

function applyTheme(theme) {
  const isDarkroom = theme === "darkroom";
  document.documentElement.classList.toggle("is-darkroom", isDarkroom);
  document.body.classList.toggle("is-darkroom", isDarkroom);
  themeToggleButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(isDarkroom));
    button.textContent = isDarkroom ? "Light" : "Darkroom";
  });
}

function readSavedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "darkroom" ? "darkroom" : "light";
  } catch {
    return "light";
  }
}

function toggleTheme() {
  const nextTheme = document.documentElement.classList.contains("is-darkroom") ? "light" : "darkroom";
  applyTheme(nextTheme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {}
}

function preloadPhoto(index, priority = "low") {
  if (photos.length === 0) return;
  const photo = photos[(index + photos.length) % photos.length];
  if (preloadedPhotos.has(photo.src)) return;

  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = priority;
  image.sizes = RESPONSIVE_IMAGE_SIZES;
  image.srcset = responsiveImageSrcSet(photo.src);
  image.src = optimizedImageSource(photo.src, 480);
  preloadedPhotos.set(photo.src, image);

  while (preloadedPhotos.size > 4) {
    const oldestSource = preloadedPhotos.keys().next().value;
    preloadedPhotos.delete(oldestSource);
  }
}

function loadActivePhoto() {
  if (photos.length === 0) {
    activePhoto.removeAttribute("src");
    activePhoto.alt = "当前作品集暂无作品";
    current.textContent = 0;
    total.textContent = 0;
    return;
  }

  const photo = photos[activeIndex];
  current.textContent = activeIndex + 1;
  total.textContent = photos.length;
  activePhoto.alt = photo.alt;
  activePhoto.sizes = RESPONSIVE_IMAGE_SIZES;
  activePhoto.srcset = responsiveImageSrcSet(photo.src);
  activePhoto.src = optimizedImageSource(photo.src, 1200);
}

function syncActivePhoto() {
  loadActivePhoto();
  preloadPhoto(activeIndex + 1, "high");
  preloadPhoto(activeIndex - 1);
}

function renderCollectionNav() {
  collectionNav.innerHTML = "";
  const description = publicCollections[activeCollectionIndex]?.description?.trim() || "";
  collectionDescription.textContent = description;
  collectionDescription.hidden = !description;

  publicCollections.forEach((collection, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = collection.name;
    button.classList.toggle("is-active", index === activeCollectionIndex);
    button.addEventListener("click", () => {
      activeCollectionIndex = index;
      photos = publicCollections[activeCollectionIndex].photos;
      activeIndex = 0;
      syncActivePhoto();
      renderCollectionNav();
    });
    collectionNav.append(button);
  });
}

function buildRandomPhotoTargets() {
  return publicCollections.flatMap((collection, collectionIndex) => (
    collection.photos.map((photo, photoIndex) => ({
      collectionIndex,
      photoIndex,
      src: photo.src,
    }))
  ));
}

function showRandomPhoto() {
  const targets = buildRandomPhotoTargets();
  if (targets.length === 0) return;

  const currentSrc = photos[activeIndex]?.src;
  const availableTargets = targets.length > 1
    ? targets.filter((target) => target.src !== currentSrc)
    : targets;
  const target = availableTargets[Math.floor(Math.random() * availableTargets.length)];

  activeCollectionIndex = target.collectionIndex;
  photos = publicCollections[activeCollectionIndex].photos;
  activeIndex = target.photoIndex;
  syncActivePhoto();
  renderCollectionNav();
}

function showPhoto(nextIndex) {
  if (photos.length === 0) return;
  activeIndex = (nextIndex + photos.length) % photos.length;

  syncActivePhoto();
}

async function initSite() {
  try {
    applyTheme(readSavedTheme());
    siteConfig = await readSiteConfig();
    publicCollections = siteConfig.collections.filter((collection) => collection.photos.length > 0);
    if (publicCollections.length === 0) {
      publicCollections = siteConfig.collections;
    }
    activeCollectionIndex = 0;
    photos = publicCollections[activeCollectionIndex].photos;

    const displayName = siteConfig.name.trim();
    siteName.textContent = displayName;
    siteTitle.textContent = displayName ? `${displayName} - Portfolio` : "Portfolio";
    syncActivePhoto();
    renderCollectionNav();
  } finally {
    document.body.classList.remove("is-loading");
  }
}

document.querySelector("[data-prev]").addEventListener("click", () => showPhoto(activeIndex - 1));
document.querySelector("[data-next]").addEventListener("click", () => showPhoto(activeIndex + 1));
randomPhotoButtons.forEach((button) => button.addEventListener("click", showRandomPhoto));
themeToggleButtons.forEach((button) => button.addEventListener("click", toggleTheme));
activePhoto.addEventListener("click", (event) => {
  const bounds = activePhoto.getBoundingClientRect();
  const direction = event.clientX < bounds.left + bounds.width / 2 ? "left" : "right";
  showPhoto(direction === "left" ? activeIndex - 1 : activeIndex + 1);
});
activePhoto.addEventListener("contextmenu", (event) => event.preventDefault());
activePhoto.addEventListener("dragstart", (event) => event.preventDefault());

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") showPhoto(activeIndex - 1);
  if (event.key === "ArrowRight") showPhoto(activeIndex + 1);
});

initSite();
