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
const randomPhotoButton = document.querySelector("[data-random-photo]");
const themeToggleButton = document.querySelector("[data-theme-toggle]");
const siteName = document.querySelector("[data-site-name]");
const siteTitle = document.querySelector("[data-site-title]");
const collectionDescription = document.querySelector("[data-collection-description]");

function applyTheme(theme) {
  const isDarkroom = theme === "darkroom";
  document.documentElement.classList.toggle("is-darkroom", isDarkroom);
  document.body.classList.toggle("is-darkroom", isDarkroom);
  themeToggleButton.setAttribute("aria-pressed", String(isDarkroom));
  themeToggleButton.textContent = isDarkroom ? "Light" : "Darkroom";
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

function preloadPhoto(index) {
  if (photos.length === 0) return;
  const photo = photos[(index + photos.length) % photos.length];
  const image = new Image();
  image.src = photo.src;
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
  activePhoto.src = photo.src;
}

function syncActivePhoto() {
  loadActivePhoto();
  preloadPhoto(activeIndex + 1);
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

  loadActivePhoto();
  preloadPhoto(activeIndex + 1);
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
randomPhotoButton.addEventListener("click", showRandomPhoto);
themeToggleButton.addEventListener("click", toggleTheme);
activePhoto.addEventListener("click", (event) => {
  const bounds = activePhoto.getBoundingClientRect();
  const clickedLeftSide = event.clientX < bounds.left + bounds.width / 2;
  showPhoto(clickedLeftSide ? activeIndex - 1 : activeIndex + 1);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") showPhoto(activeIndex - 1);
  if (event.key === "ArrowRight") showPhoto(activeIndex + 1);
});

initSite();
