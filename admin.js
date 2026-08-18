let draft;
const ALLOWED_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_UPLOAD_SIZE = MAX_UPLOAD_BATCH_BYTES;
const MAX_COLLECTION_DESCRIPTION_LENGTH = 500;
let draggedCollectionIndex = null;
let draggedPhotoIndex = null;
let isDirty = false;
let isSaving = false;

const editor = document.querySelector("[data-editor]");
const collectionList = document.querySelector("[data-collection-list]");
const photoList = document.querySelector("[data-photo-list]");
const photoUpload = document.querySelector("[data-photo-upload]");
const uploadProgress = document.querySelector("[data-upload-progress]");
const uploadProgressBar = document.querySelector("[data-upload-progress-bar]");
const uploadProgressText = document.querySelector("[data-upload-progress-text]");
const uploadProgressCount = document.querySelector("[data-upload-progress-count]");
const currentCollectionName = document.querySelector("[data-current-collection]");
const statusText = document.querySelector("[data-status]");
const saveButton = document.querySelector("[data-save-button]");
const previewName = document.querySelector("[data-preview-name]");
const previewDescription = document.querySelector("[data-preview-description]");
const previewCollections = document.querySelector("[data-preview-collections]");
const previewImage = document.querySelector("[data-preview-image]");
const previewCurrent = document.querySelector("[data-preview-current]");
const previewTotal = document.querySelector("[data-preview-total]");
const previewPrevious = document.querySelector("[data-preview-prev]");
const previewNext = document.querySelector("[data-preview-next]");
let previewPhotoIndex = 0;

function setStatus(message) {
  statusText.textContent = message;
}

function updateSaveButton() {
  saveButton.disabled = !isDirty || isSaving;
  saveButton.textContent = isSaving ? "保存中..." : "保存修改";
}

function markDirty(message = "有未保存修改。") {
  isDirty = true;
  setStatus(message);
  updateSaveButton();
}

function markSaved(message = "已保存到线上网站。") {
  isDirty = false;
  isSaving = false;
  setStatus(message);
  updateSaveButton();
}

function markSaving() {
  isSaving = true;
  setStatus("正在保存到线上网站...");
  updateSaveButton();
}

function confirmCollectionRemoval(collection) {
  const countText = collection.photos.length > 0 ? `，其中包含 ${collection.photos.length} 张图片` : "";
  return window.confirm(`确定删除作品集“${collection.name}”吗${countText}？此操作保存后会同步到线上网站。`);
}

function resetUploadProgress() {
  uploadProgress.hidden = true;
  uploadProgressBar.value = 0;
  uploadProgressText.textContent = "正在上传 0%";
  uploadProgressCount.textContent = "";
}

function updateUploadProgress(percent) {
  uploadProgress.hidden = false;
  uploadProgressBar.value = percent;
  uploadProgressText.textContent = percent >= 100 ? "上传完成 100%" : `正在上传 ${percent}%`;
}

function activeCollection() {
  return draft.collections[draft.activeCollectionIndex];
}

function syncBaseFields() {
  editor.elements.name.value = draft.name;
}

function collectBaseFields() {
  draft.name = editor.elements.name.value.trim() || DEFAULT_SITE_CONFIG.name;
}

function updatePreview() {
  const collection = activeCollection();
  previewPhotoIndex = Math.min(previewPhotoIndex, Math.max(collection.photos.length - 1, 0));
  const previewPhoto = collection.photos[previewPhotoIndex];
  previewName.textContent = draft.name;
  previewCollections.innerHTML = "";
  draft.collections.forEach((item, index) => {
    const name = document.createElement("button");
    name.type = "button";
    name.textContent = item.name;
    name.classList.toggle("is-active", index === draft.activeCollectionIndex);
    name.dataset.previewCollection = index;
    previewCollections.append(name);
  });
  currentCollectionName.textContent = collection.name;
  previewDescription.textContent = collection.description || "";
  previewDescription.hidden = !(collection.description || "").trim();
  previewImage.src = previewPhoto?.src || "";
  previewImage.alt = previewPhoto?.alt || "后台预览图";
  previewCurrent.textContent = collection.photos.length > 0 ? previewPhotoIndex + 1 : 0;
  previewTotal.textContent = collection.photos.length;
  previewPrevious.disabled = collection.photos.length < 2;
  previewNext.disabled = collection.photos.length < 2;
}

function renderCollections() {
  collectionList.innerHTML = "";

  draft.collections.forEach((collection, index) => {
    const item = document.createElement("article");
    const nameInput = document.createElement("input");
    const descriptionInput = document.createElement("textarea");
    const details = document.createElement("div");
    const actions = document.createElement("div");
    const selectButton = document.createElement("button");
    const upButton = document.createElement("button");
    const downButton = document.createElement("button");
    const removeButton = document.createElement("button");

    item.className = "collection-item";
    item.draggable = true;
    item.dataset.collectionIndex = index;
    item.classList.toggle("is-active", index === draft.activeCollectionIndex);
    nameInput.type = "text";
    nameInput.value = collection.name;
    nameInput.dataset.collectionName = index;
    nameInput.setAttribute("aria-label", "作品集名称");
    descriptionInput.value = collection.description || "";
    descriptionInput.dataset.collectionDescription = index;
    descriptionInput.setAttribute("aria-label", "作品集简介");
    descriptionInput.placeholder = "作品集简介（可选）";
    descriptionInput.rows = 2;
    descriptionInput.maxLength = MAX_COLLECTION_DESCRIPTION_LENGTH;
    details.className = "collection-details";
    details.append(nameInput, descriptionInput);
    actions.className = "collection-actions";
    selectButton.type = "button";
    selectButton.textContent = index === draft.activeCollectionIndex ? "当前" : "编辑";
    selectButton.dataset.selectCollection = index;
    upButton.type = "button";
    upButton.textContent = "上移";
    upButton.dataset.moveCollectionUp = index;
    downButton.type = "button";
    downButton.textContent = "下移";
    downButton.dataset.moveCollectionDown = index;
    removeButton.type = "button";
    removeButton.textContent = "删除";
    removeButton.dataset.removeCollection = index;

    actions.append(selectButton, upButton, downButton, removeButton);
    item.append(details, actions);
    collectionList.append(item);
  });
}

function renderPhotos() {
  photoList.innerHTML = "";

  activeCollection().photos.forEach((photo, index) => {
    const item = document.createElement("article");
    const image = document.createElement("img");
    const fields = document.createElement("div");
    const actions = document.createElement("div");
    const dragHandle = document.createElement("span");

    item.className = "photo-item";
    item.draggable = true;
    item.dataset.photoIndex = index;
    image.src = photo.src;
    image.alt = "";
    fields.className = "photo-fields";
    dragHandle.className = "photo-drag-handle";
    dragHandle.textContent = "↕";
    dragHandle.title = "拖拽调整照片顺序";
    dragHandle.setAttribute("aria-label", "拖拽调整照片顺序");

    actions.className = "photo-actions";
    actions.innerHTML = `
      <button type="button" data-move-up="${index}">上移</button>
      <button type="button" data-move-down="${index}">下移</button>
      <button type="button" data-remove="${index}">删除</button>
    `;

    fields.append(dragHandle, actions);
    item.append(image, fields);
    photoList.append(item);
  });

  if (activeCollection().photos.length === 0) {
    const empty = document.createElement("p");
    empty.className = "panel-note";
    empty.textContent = "这个作品集还没有作品。点击“添加作品”从电脑上传图片。";
    photoList.append(empty);
  }

  updatePreview();
}

function renderAll() {
  renderCollections();
  renderPhotos();
}

function addPhoto(photo) {
  activeCollection().photos.push({
    src: photo.src,
    alt: photo.alt || "摄影作品",
  });
}

editor.addEventListener("input", (event) => {
  collectBaseFields();

  if (event.target.matches("[data-collection-name]")) {
    const index = Number(event.target.dataset.collectionName);
    draft.collections[index].name = event.target.value.trim() || `Portfolio ${index + 1}`;
    renderPhotos();
  }

  if (event.target.matches("[data-collection-description]")) {
    const index = Number(event.target.dataset.collectionDescription);
    draft.collections[index].description = event.target.value.slice(0, MAX_COLLECTION_DESCRIPTION_LENGTH);
  }

  updatePreview();
  markDirty();
});

function reorderItems(items, fromIndex, toIndex) {
  const nextItems = [...items];
  const [moved] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, moved);
  return nextItems;
}

collectionList.addEventListener("click", (event) => {
  const select = event.target.closest("[data-select-collection]");
  const up = event.target.closest("[data-move-collection-up]");
  const down = event.target.closest("[data-move-collection-down]");
  const remove = event.target.closest("[data-remove-collection]");

  if (select) {
    draft.activeCollectionIndex = Number(select.dataset.selectCollection);
    renderAll();
    return;
  }

  if (up) {
    const index = Number(up.dataset.moveCollectionUp);
    if (index > 0) {
      [draft.collections[index - 1], draft.collections[index]] = [draft.collections[index], draft.collections[index - 1]];
      draft.activeCollectionIndex = index - 1;
      renderAll();
      markDirty("已调整作品集顺序，记得保存。");
    }
    return;
  }

  if (down) {
    const index = Number(down.dataset.moveCollectionDown);
    if (index < draft.collections.length - 1) {
      [draft.collections[index + 1], draft.collections[index]] = [draft.collections[index], draft.collections[index + 1]];
      draft.activeCollectionIndex = index + 1;
      renderAll();
      markDirty("已调整作品集顺序，记得保存。");
    }
    return;
  }

  if (remove) {
    if (draft.collections.length === 1) {
      setStatus("至少需要保留一个作品集。");
      return;
    }

    const index = Number(remove.dataset.removeCollection);
    const collection = draft.collections[index];
    if (!confirmCollectionRemoval(collection)) {
      setStatus("已取消删除作品集。");
      return;
    }

    draft.collections.splice(index, 1);
    draft.activeCollectionIndex = Math.min(draft.activeCollectionIndex, draft.collections.length - 1);
    renderAll();
    markDirty("已删除作品集，记得保存。");
  }
});

collectionList.addEventListener("dragstart", (event) => {
  const item = event.target.closest("[data-collection-index]");
  if (!item) return;
  draggedCollectionIndex = Number(item.dataset.collectionIndex);
  item.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
});

collectionList.addEventListener("dragover", (event) => {
  if (draggedCollectionIndex === null) return;
  const item = event.target.closest("[data-collection-index]");
  if (!item) return;
  event.preventDefault();
  item.classList.add("is-drop-target");
});

collectionList.addEventListener("dragleave", (event) => {
  event.target.closest("[data-collection-index]")?.classList.remove("is-drop-target");
});

collectionList.addEventListener("drop", (event) => {
  const item = event.target.closest("[data-collection-index]");
  if (!item || draggedCollectionIndex === null) return;
  event.preventDefault();
  const targetIndex = Number(item.dataset.collectionIndex);
  const active = activeCollection();
  draft.collections = reorderItems(draft.collections, draggedCollectionIndex, targetIndex);
  draft.activeCollectionIndex = draft.collections.indexOf(active);
  draggedCollectionIndex = null;
  renderAll();
  markDirty("已拖拽调整作品集顺序，记得保存。");
});

collectionList.addEventListener("dragend", () => {
  draggedCollectionIndex = null;
  document.querySelectorAll(".collection-item").forEach((item) => {
    item.classList.remove("is-dragging", "is-drop-target");
  });
});

photoList.addEventListener("click", (event) => {
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-remove]");
  const photos = activeCollection().photos;
  let changed = false;

  if (up) {
    const index = Number(up.dataset.moveUp);
    if (index > 0) {
      [photos[index - 1], photos[index]] = [photos[index], photos[index - 1]];
      changed = true;
    }
  }

  if (down) {
    const index = Number(down.dataset.moveDown);
    if (index < photos.length - 1) {
      [photos[index + 1], photos[index]] = [photos[index], photos[index + 1]];
      changed = true;
    }
  }

  if (remove) {
    const index = Number(remove.dataset.remove);
    photos.splice(index, 1);
    changed = true;
  }

  if (!changed) return;
  renderPhotos();
  markDirty();
});

photoList.addEventListener("dragstart", (event) => {
  const item = event.target.closest("[data-photo-index]");
  if (!item) return;
  draggedPhotoIndex = Number(item.dataset.photoIndex);
  item.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(draggedPhotoIndex));
});

photoList.addEventListener("dragover", (event) => {
  if (draggedPhotoIndex === null) return;
  const item = event.target.closest("[data-photo-index]");
  if (!item) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const before = event.clientY < item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
  item.classList.toggle("is-drop-before", before);
  item.classList.toggle("is-drop-after", !before);
  item.classList.add("is-drop-target");
});

photoList.addEventListener("dragleave", (event) => {
  event.target.closest("[data-photo-index]")?.classList.remove("is-drop-target", "is-drop-before", "is-drop-after");
});

photoList.addEventListener("drop", (event) => {
  const item = event.target.closest("[data-photo-index]");
  if (!item || draggedPhotoIndex === null) return;
  event.preventDefault();
  const itemRect = item.getBoundingClientRect();
  const targetIndex = Number(item.dataset.photoIndex);
  const targetPosition = event.clientY < itemRect.top + itemRect.height / 2
    ? targetIndex
    : targetIndex + 1;
  const insertIndex = targetPosition > draggedPhotoIndex ? targetPosition - 1 : targetPosition;
  if (insertIndex === draggedPhotoIndex) {
    draggedPhotoIndex = null;
    item.classList.remove("is-drop-target", "is-drop-before", "is-drop-after");
    return;
  }
  activeCollection().photos = reorderItems(activeCollection().photos, draggedPhotoIndex, insertIndex);
  draggedPhotoIndex = null;
  renderPhotos();
  markDirty("已拖拽调整照片顺序，记得保存。");
});

photoList.addEventListener("dragend", () => {
  draggedPhotoIndex = null;
  document.querySelectorAll(".photo-item").forEach((item) => {
    item.classList.remove("is-dragging", "is-drop-target", "is-drop-before", "is-drop-after");
  });
});

previewCollections.addEventListener("click", (event) => {
  const collectionButton = event.target.closest("[data-preview-collection]");
  if (!collectionButton) return;
  draft.activeCollectionIndex = Number(collectionButton.dataset.previewCollection);
  previewPhotoIndex = 0;
  renderAll();
});

function movePreviewPhoto(offset) {
  const photos = activeCollection().photos;
  if (photos.length < 2) return;
  previewPhotoIndex = (previewPhotoIndex + offset + photos.length) % photos.length;
  updatePreview();
}

previewPrevious.addEventListener("click", () => movePreviewPhoto(-1));
previewNext.addEventListener("click", () => movePreviewPhoto(1));

document.querySelector("[data-add-collection]").addEventListener("click", () => {
  draft.collections.push({
    name: `Portfolio ${draft.collections.length + 1}`,
    description: "",
    photos: [],
  });
  draft.activeCollectionIndex = draft.collections.length - 1;
  renderAll();
  markDirty("已创建新的作品集，可以开始上传作品。");
});

document.querySelector("[data-add-photo]").addEventListener("click", () => {
  photoUpload.click();
});

photoUpload.addEventListener("change", async () => {
  const selectedFiles = [...photoUpload.files];
  const invalidType = selectedFiles.find((file) => !ALLOWED_UPLOAD_TYPES.has(file.type));
  const oversized = selectedFiles.find((file) => file.size > MAX_UPLOAD_SIZE);

  if (selectedFiles.length === 0) {
    setStatus("请选择图片文件。");
    return;
  }

  if (invalidType) {
    setStatus(`不支持 ${invalidType.name}。只能上传 JPG、PNG、WebP。`);
    photoUpload.value = "";
    return;
  }

  if (oversized) {
    setStatus(`${oversized.name} 超过 4MB，请压缩后再上传。`);
    photoUpload.value = "";
    return;
  }

  uploadProgress.hidden = false;
  uploadProgressBar.value = 0;
  uploadProgressText.textContent = "正在上传 0%";
  uploadProgressCount.textContent = `${selectedFiles.length} 张图片`;
  setStatus("正在上传本地图片。");

  try {
    const photos = await uploadPhotos(selectedFiles, updateUploadProgress);
    updateUploadProgress(100);
    photos.forEach(addPhoto);
    renderPhotos();
    markDirty(`已添加 ${photos.length} 张作品，记得保存。`);
  } catch (error) {
    if (error?.code === "SINGLE_FILE_TOO_LARGE") {
      setStatus("单张图片超过 4MB，请压缩后再上传。");
    } else if (error?.code === "REQUEST_TOO_LARGE") {
      setStatus("本批图片总大小超过平台限制，请减少图片或压缩后再试。");
    } else {
      setStatus("上传失败，请检查图片大小或网络连接后再试。");
    }
  } finally {
    photoUpload.value = "";
  }
});

editor.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isDirty || isSaving) return;
  collectBaseFields();

  (async () => {
    try {
      markSaving();
      await writeSiteConfig(draft);
      draft = await readSiteConfig();
      syncBaseFields();
      renderAll();
      markSaved("已保存到线上网站，前台刷新后即可看到修改。");
    } catch {
      isSaving = false;
      setStatus("保存失败，请检查后端服务是否正常。");
      updateSaveButton();
    }
  })();
});

async function initAdmin() {
  draft = await readSiteConfig();
  syncBaseFields();
  renderAll();
  resetUploadProgress();
  markSaved("已加载线上配置。");
}

window.initAdmin = initAdmin;
