const storageKey = "local-watermark-camera-state-v1";
const views = ["projects", "album", "capture", "settings"];
const now = new Date();

const state = loadState();
let currentImage = null;
let previewTimestamp = new Date().toISOString();
let pendingImages = [];
let cameraStream = null;
let cameraFacingMode = "environment";
let cameraClock = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingFrame = null;
let viewerPhotoId = null;
let editingProjectId = null;
let longPressTimer = null;
let suppressPhotoClick = false;
let lastProjectSubmitAt = 0;
const selectedPhotoIds = new Set();
let currentReportDataUrl = "";
let reportPhotoItems = [];
let pendingConfirmResolve = null;
let activeProjectActionId = null;

const el = {
  title: document.querySelector("#pageTitle"),
  projectList: document.querySelector("#projectList"),
  projectSearch: document.querySelector("#projectSearch"),
  projectTabs: document.querySelectorAll("[data-project-tab]"),
  defaultLocationButton: document.querySelector("#defaultLocationButton"),
  addProject: document.querySelector("#addProject"),
  floatingAdd: document.querySelector("#floatingAdd"),
  floatingCamera: document.querySelector("#floatingCamera"),
  quickCapture: document.querySelector("#quickCapture"),
  exportProject: document.querySelector("#exportProject"),
  albumProjectName: document.querySelector("#albumProjectName"),
  albumGrid: document.querySelector("#albumGrid"),
  groupByTime: document.querySelector("#groupByTime"),
  groupByPlace: document.querySelector("#groupByPlace"),
  projectSelect: document.querySelector("#projectSelect"),
  placeInput: document.querySelector("#placeInput"),
  noteInput: document.querySelector("#noteInput"),
  coordInput: document.querySelector("#coordInput"),
  locateButton: document.querySelector("#locateButton"),
  timeStartInput: document.querySelector("#timeStartInput"),
  timeEndInput: document.querySelector("#timeEndInput"),
  backHome: document.querySelector("#backHome"),
  cameraBack: document.querySelector("#cameraBack"),
  cameraSwitch: document.querySelector("#cameraSwitch"),
  cameraShutter: document.querySelector("#cameraShutter"),
  cameraRecord: document.querySelector("#cameraRecord"),
  startCamera: document.querySelector("#startCamera"),
  capturePhoto: document.querySelector("#capturePhoto"),
  fileInput: document.querySelector("#fileInput"),
  importButton: document.querySelector(".import-button"),
  saveCurrent: document.querySelector("#saveCurrent"),
  batchStatus: document.querySelector("#batchStatus"),
  watermarkLivePreview: document.querySelector("#watermarkLivePreview"),
  video: document.querySelector("#cameraVideo"),
  cameraWatermark: document.querySelector("#cameraWatermark"),
  canvas: document.querySelector("#watermarkCanvas"),
  batchPreview: document.querySelector("#batchPreview"),
  emptyPreview: document.querySelector("#emptyPreview"),
  watermarkTitle: document.querySelector("#watermarkTitle"),
  weatherInput: document.querySelector("#weatherInput"),
  addressInput: document.querySelector("#addressInput"),
  accentInput: document.querySelector("#accentInput"),
  projectDialog: document.querySelector("#projectDialog"),
  projectDialogForm: document.querySelector("#projectDialogForm"),
  newProjectName: document.querySelector("#newProjectName"),
  cancelProjectDialog: document.querySelector("#cancelProjectDialog"),
  confirmProjectDialog: document.querySelector("#confirmProjectDialog"),
  locationDialog: document.querySelector("#locationDialog"),
  locationDialogForm: document.querySelector("#locationDialogForm"),
  defaultLocationSelect: document.querySelector("#defaultLocationSelect"),
  defaultLocationEditor: document.querySelector("#defaultLocationEditor"),
  defaultLocationInput: document.querySelector("#defaultLocationInput"),
  cancelLocationDialog: document.querySelector("#cancelLocationDialog"),
  confirmLocationDialog: document.querySelector("#confirmLocationDialog"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmDialogTitle: document.querySelector("#confirmDialogTitle"),
  confirmDialogMessage: document.querySelector("#confirmDialogMessage"),
  cancelConfirmDialog: document.querySelector("#cancelConfirmDialog"),
  confirmDialogAction: document.querySelector("#confirmDialogAction"),
  projectActionSheet: document.querySelector("#projectActionSheet"),
  projectActionTitle: document.querySelector("#projectActionTitle"),
  projectActionEdit: document.querySelector("#projectActionEdit"),
  projectActionDelete: document.querySelector("#projectActionDelete"),
  projectActionCancel: document.querySelector("#projectActionCancel"),
  albumCamera: document.querySelector("#albumCamera"),
  photoViewer: document.querySelector("#photoViewer"),
  photoViewerImage: document.querySelector("#photoViewerImage"),
  closePhotoViewer: document.querySelector("#closePhotoViewer"),
  viewerEditTab: document.querySelector("#viewerEditTab"),
  viewerInfoTab: document.querySelector("#viewerInfoTab"),
  viewerEditPanel: document.querySelector("#viewerEditPanel"),
  viewerInfoPanel: document.querySelector("#viewerInfoPanel"),
  viewerTitleInput: document.querySelector("#viewerTitleInput"),
  viewerPlaceInput: document.querySelector("#viewerPlaceInput"),
  viewerNoteInput: document.querySelector("#viewerNoteInput"),
  viewerCoordInput: document.querySelector("#viewerCoordInput"),
  viewerTimeInput: document.querySelector("#viewerTimeInput"),
  viewerEditHint: document.querySelector("#viewerEditHint"),
  saveViewerWatermark: document.querySelector("#saveViewerWatermark"),
  albumSelection: document.querySelector("#albumSelection"),
  selectionGrid: document.querySelector("#selectionGrid"),
  selectionCount: document.querySelector("#selectionCount"),
  closeSelection: document.querySelector("#closeSelection"),
  selectByDate: document.querySelector("#selectByDate"),
  selectAllPhotos: document.querySelector("#selectAllPhotos"),
  shareSelected: document.querySelector("#shareSelected"),
  moveSelected: document.querySelector("#moveSelected"),
  deleteSelected: document.querySelector("#deleteSelected"),
  collageSelected: document.querySelector("#collageSelected"),
  collageReport: document.querySelector("#collageReport"),
  closeReport: document.querySelector("#closeReport"),
  saveReport: document.querySelector("#saveReport"),
  reportImage: document.querySelector("#reportImage"),
  reportTitleInput: document.querySelector("#reportTitleInput"),
  reportSubtitleInput: document.querySelector("#reportSubtitleInput"),
  reportReporterInput: document.querySelector("#reportReporterInput"),
  reportContentInput: document.querySelector("#reportContentInput"),
  reportFileInput: document.querySelector("#reportFileInput")
};

bindEvents();
syncSettingsFields();
setDefaultTimeRange();
renderAll();
refreshWatermarkPreview();
showView("projects");

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  el.quickCapture.addEventListener("click", openCamera);
  el.floatingCamera.addEventListener("click", openCamera);
  el.albumCamera.addEventListener("click", openCamera);
  el.addProject.addEventListener("click", () => openProjectDialog());
  el.floatingAdd.addEventListener("click", () => openProjectDialog());
  el.cancelProjectDialog.addEventListener("click", closeProjectDialog);
  el.projectDialogForm.addEventListener("submit", confirmProjectDialog);
  el.defaultLocationButton.addEventListener("click", openLocationDialog);
  el.cancelLocationDialog.addEventListener("click", closeLocationDialog);
  el.locationDialogForm.addEventListener("submit", confirmLocationDialog);
  el.defaultLocationSelect.addEventListener("change", selectDefaultLocationOption);
  el.locationDialog.addEventListener("click", (event) => {
    if (event.target === el.locationDialog) closeLocationDialog();
  });
  el.defaultLocationInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLocationDialog();
  });
  el.confirmDialog.addEventListener("click", (event) => {
    if (event.target === el.confirmDialog) closeConfirmDialog(false);
  });
  el.cancelConfirmDialog.addEventListener("click", () => closeConfirmDialog(false));
  el.confirmDialogAction.addEventListener("click", () => closeConfirmDialog(true));
  el.projectActionSheet.addEventListener("click", (event) => {
    if (event.target === el.projectActionSheet) closeProjectMenus();
  });
  el.projectActionCancel.addEventListener("click", closeProjectMenus);
  el.projectActionEdit.addEventListener("click", () => {
    const projectId = activeProjectActionId;
    closeProjectMenus();
    if (projectId) openProjectDialog(projectId);
  });
  el.projectActionDelete.addEventListener("click", () => {
    const projectId = activeProjectActionId;
    closeProjectMenus();
    if (projectId) deleteProject(projectId);
  });
  el.projectDialog.addEventListener("click", (event) => {
    if (event.target === el.projectDialog) closeProjectDialog();
  });
  el.newProjectName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") confirmProjectDialog(event);
    if (event.key === "Escape") closeProjectDialog();
  });
  el.projectSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") openProjectDialog();
  });
  el.projectTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.projectTab = button.dataset.projectTab;
      saveState();
      renderProjects();
    });
  });
  el.groupByTime.addEventListener("click", () => setAlbumGroup("time"));
  el.groupByPlace.addEventListener("click", () => setAlbumGroup("place"));
  el.projectSelect.addEventListener("change", () => {
    state.activeProjectId = el.projectSelect.value;
    syncCaptureFieldsFromProject();
    saveState();
    renderAll();
    refreshWatermarkPreview();
  });

  el.startCamera.addEventListener("click", openCamera);
  el.backHome.addEventListener("click", () => showView("projects"));
  el.cameraBack.addEventListener("click", () => showView("projects"));
  el.cameraSwitch.addEventListener("click", switchCamera);
  el.video.addEventListener("click", focusCameraAtPoint);
  el.video.addEventListener("touchend", focusCameraAtPoint);
  el.cameraShutter.addEventListener("click", saveCameraPhoto);
  el.cameraRecord.addEventListener("click", toggleVideoRecording);
  el.capturePhoto.addEventListener("click", captureFromCamera);
  el.importButton.addEventListener("click", startNativeBatchImport, true);
  el.fileInput.addEventListener("change", importPhoto);
  el.saveCurrent.addEventListener("click", saveCurrentPhoto);
  el.exportProject.addEventListener("click", exportProjectData);
  el.locateButton.addEventListener("click", requestDeviceLocation);
  el.closePhotoViewer.addEventListener("click", closePhotoViewer);
  el.photoViewer.addEventListener("click", (event) => {
    if (event.target === el.photoViewer) closePhotoViewer();
  });
  el.viewerEditTab.addEventListener("click", () => setViewerPanel("edit"));
  el.viewerInfoTab.addEventListener("click", () => setViewerPanel("info"));
  el.saveViewerWatermark.addEventListener("click", saveViewerWatermark);
  el.closeSelection.addEventListener("click", closeSelectionMode);
  el.selectAllPhotos.addEventListener("click", selectAllPhotos);
  el.selectByDate.addEventListener("click", selectPhotosByCurrentGroup);
  el.deleteSelected.addEventListener("click", deleteSelectedPhotos);
  el.collageSelected.addEventListener("click", createCollageReport);
  el.shareSelected.addEventListener("click", () => showToast("分享功能稍后接入"));
  el.moveSelected.addEventListener("click", () => showToast("移动功能稍后接入"));
  el.closeReport.addEventListener("click", closeCollageReport);
  el.saveReport.addEventListener("click", saveCollageReport);
  el.reportFileInput.addEventListener("change", addReportPhotos);
  [el.reportTitleInput, el.reportSubtitleInput, el.reportReporterInput, el.reportContentInput].forEach((input) => {
    input.addEventListener("input", refreshCollageReportPreview);
  });

  [el.watermarkTitle, el.weatherInput, el.addressInput, el.accentInput].forEach((input) => {
    input.addEventListener("input", () => {
      state.settings.title = el.watermarkTitle.value;
      state.settings.weather = el.weatherInput.value;
      state.settings.address = el.addressInput.value;
      state.settings.accent = el.accentInput.value;
      saveState();
      refreshWatermarkPreview();
      refreshCameraWatermark();
      if (pendingImages.length) refreshPendingPreview();
    });
  });

  [el.placeInput, el.noteInput, el.coordInput, el.timeStartInput, el.timeEndInput].forEach((input) => {
    input.addEventListener("input", refreshCapturePreviewState);
    input.addEventListener("change", refreshCapturePreviewState);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".project-action-sheet") && !event.target.closest("[data-project-more]")) {
      closeProjectMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeProjectMenus();
      if (!el.confirmDialog.hidden) closeConfirmDialog(false);
    }
  });
}

window.confirmProjectDialogFromDom = confirmProjectDialog;

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (saved) return normalizeState(JSON.parse(saved));

  const projectId = createId();
  return normalizeState({
    activeView: "projects",
    activeProjectId: projectId,
    projectTab: "created",
    albumGroup: "place",
    settings: {
      title: "施工记录",
      weather: "晴 12℃ 空气良 82%",
      address: "武汉市洪山区花山一路9号生态山居九峰李家山",
      locationOptions: ["武汉市洪山区花山一路9号生态山居九峰李家山"],
      accent: "#2259f2"
    },
    projects: [
      {
        id: projectId,
        name: "松滋专用线检查",
        location: "花山一路",
        lastOpenedAt: now.toISOString(),
        createdAt: now.toISOString(),
        photos: []
      },
      {
        id: createId(),
        name: "松滋消防设施检查",
        location: "332省道",
        lastOpenedAt: null,
        createdAt: now.toISOString(),
        photos: []
      }
    ]
  });
}

function normalizeState(loadedState) {
  loadedState.settings ||= {};
  loadedState.settings.title ||= "施工记录";
  loadedState.settings.weather ||= "晴 12℃ 空气良 82%";
  loadedState.settings.address ||= "武汉市洪山区花山一路9号生态山居九峰李家山";
  loadedState.settings.accent ||= "#2259f2";
  loadedState.settings.locationOptions = normalizeLocationOptions(
    loadedState.settings.locationOptions,
    loadedState.settings.address
  );
  return loadedState;
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function showView(view) {
  if (!views.includes(view)) return;
  closeProjectMenus();
  const leavingCapture = state.activeView === "capture" && view !== "capture";
  if (leavingCapture) stopCameraPreview();
  if (view === "capture" && !document.body.classList.contains("camera-live")) {
    stopCameraPreview();
  }
  state.activeView = view;
  document.body.dataset.view = view;
  saveState();
  document.querySelectorAll(".view").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  el.title.textContent = viewTitle(view);
  renderAll();
}

async function openCamera() {
  if (window.AndroidBridge?.startNativeCamera) {
    startNativeCameraCapture();
    return;
  }
  showView("capture");
  window.scrollTo({ top: 0, behavior: "auto" });
  await startCamera();
}

function viewTitle(view) {
  return {
    projects: "工程",
    album: "相册",
    capture: "拍照",
    settings: "设置"
  }[view];
}

function renderAll() {
  renderProjects();
  renderProjectSelect();
  renderAlbum();
  syncCaptureFieldsFromProject();
}

function refreshCapturePreviewState() {
  refreshWatermarkPreview();
  refreshCameraWatermark();
  if (pendingImages.length) refreshPendingPreview();
  updateBatchStatus();
}

function watermarkPlace() {
  const project = activeProject();
  return el.placeInput?.value?.trim()
    || project?.location
    || state.settings.address
    || "未设置地点";
}

function syncCaptureFieldsFromProject() {
  const project = activeProject();
  if (!project || !el.placeInput) return;
  const projectPlace = project.location && project.location !== "未设置地点"
    ? project.location
    : state.settings.address;
  el.placeInput.value = projectPlace || "未设置地点";
  refreshCapturePreviewState();
}

function refreshWatermarkPreview() {
  const project = activeProject();
  if (!project || !el.watermarkLivePreview) return;
  const sampleTime = formatFullTime(randomTimestampInRange());
  el.watermarkLivePreview.style.setProperty("--watermark-accent", state.settings.accent);
  el.watermarkLivePreview.innerHTML = `
    <div class="watermark-title">${escapeHtml(state.settings.title || "施工记录")}</div>
    <dl>
      <div><dt>天气</dt><dd>${escapeHtml(state.settings.weather)}</dd></div>
      <div><dt>经纬</dt><dd>${escapeHtml(el.coordInput.value)}</dd></div>
      <div><dt>地点</dt><dd>${escapeHtml(watermarkPlace())}</dd></div>
      <div><dt>工程名称</dt><dd>${escapeHtml(project.name)}</dd></div>
      <div><dt>时间</dt><dd>${escapeHtml(sampleTime)}</dd></div>
    </dl>
  `;
}

function refreshCameraWatermark() {
  const project = activeProject();
  if (!project || !el.cameraWatermark) return;
  const capturedAt = formatFullTime(new Date().toISOString());
  el.cameraWatermark.style.setProperty("--watermark-accent", state.settings.accent);
  el.cameraWatermark.innerHTML = `
    <div class="watermark-title">${escapeHtml(state.settings.title || "施工记录")}</div>
    <dl>
      <div><dt>天气</dt><dd>${escapeHtml(state.settings.weather)}</dd></div>
      <div><dt>经纬</dt><dd>${escapeHtml(el.coordInput.value)}</dd></div>
      <div><dt>地点</dt><dd>${escapeHtml(watermarkPlace())}</dd></div>
      <div><dt>工程名称</dt><dd>${escapeHtml(project.name)}</dd></div>
      <div><dt>时间</dt><dd>${escapeHtml(capturedAt)}</dd></div>
    </dl>
  `;
}

function activeProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0];
}

function renderProjects() {
  const tab = state.projectTab || "created";
  el.projectTabs.forEach((button) => {
    button.classList.toggle("active-accent", button.dataset.projectTab === tab);
  });
  const projects = state.projects
    .sort((a, b) => {
      if (tab === "recent") {
        return new Date(b.lastOpenedAt || 0) - new Date(a.lastOpenedAt || 0);
      }
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  el.projectList.innerHTML = projects.map((project) => {
    const cover = project.photos[0]?.dataUrl;
    const avatar = cover ? `<img src="${cover}" alt="">` : project.name.slice(0, 1);
    return `
      <article class="project-row ${project.id === state.activeProjectId ? "active" : ""}" data-project="${project.id}">
        <button class="project-open" data-project-open="${project.id}" type="button" aria-label="进入 ${escapeHtml(project.name)} 拍照">
          <span class="avatar">${avatar}</span>
          <span>
            <h3>${escapeHtml(project.name)}</h3>
            <p>${project.photos.length} 张照片 · ${escapeHtml(project.location || "未设置地点")}</p>
          </span>
        </button>
        <button class="more project-more" data-project-more="${project.id}" type="button" aria-label="工程操作">⋮</button>
      </article>
    `;
  }).join("");

  el.projectList.querySelectorAll("[data-project-open]").forEach((row) => {
    row.addEventListener("click", () => {
      state.activeProjectId = row.dataset.projectOpen;
      markProjectOpened(state.activeProjectId);
      saveState();
      renderAll();
      openCamera();
    });
  });

  el.projectList.querySelectorAll("[data-project-more]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openProjectActionSheet(button.dataset.projectMore);
    });
  });
}

function openProjectActionSheet(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  activeProjectActionId = projectId;
  el.projectActionTitle.textContent = project.name;
  el.projectActionSheet.hidden = false;
}

function closeProjectMenus() {
  if (el.projectActionSheet) el.projectActionSheet.hidden = true;
  activeProjectActionId = null;
}

function markProjectOpened(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (project) project.lastOpenedAt = new Date().toISOString();
}

function renderProjectSelect() {
  el.projectSelect.innerHTML = state.projects.map((project) => (
    `<option value="${project.id}" ${project.id === state.activeProjectId ? "selected" : ""}>${escapeHtml(project.name)}</option>`
  )).join("");
}

function renderAlbum() {
  const project = activeProject();
  if (!project) return;
  el.albumProjectName.textContent = project.name;
  const photos = project.photos;

  if (!photos.length) {
    el.albumGrid.innerHTML = `
      <section class="album-empty" aria-label="空相册">
        <span class="album-empty-icon"><span class="camera-icon"></span></span>
        <h3>还没有照片</h3>
        <p>${escapeHtml(project.name)} 的照片会在拍照或批量导入后，自动按地点/时间归档到这里。</p>
        <div class="album-empty-actions">
          <button class="primary" data-empty-action="capture" type="button">去导入照片</button>
          <button class="ghost" data-empty-action="projects" type="button">返回工程</button>
        </div>
        <small>${escapeHtml(project.location || "未设置地点")} · 本地保存</small>
      </section>
    `;
    el.albumGrid.querySelectorAll("[data-empty-action]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.emptyAction === "capture") openCamera();
        else showView(button.dataset.emptyAction);
      });
    });
    return;
  }

  const groups = groupPhotos(photos);
  el.albumGrid.innerHTML = Object.entries(groups).map(([group, items]) => `
    <section>
      <h3 class="group-title">${escapeHtml(group)}</h3>
      <div class="photo-grid">
        ${items.map((photo, index) => `
          <article class="photo-card">
            <button class="photo-preview-button" data-preview-photo-id="${photo.id}" type="button" aria-label="预览照片">
              <img src="${photo.dataUrl}" alt="${escapeHtml(photo.note)}">
            </button>
            <footer>
              <span>${formatTime(photo.createdAt)}</span>
              <button class="export-photo" data-photo-id="${photo.id}" type="button">导出</button>
            </footer>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  el.albumGrid.querySelectorAll("[data-photo-id]").forEach((button) => {
    button.addEventListener("click", () => exportPhoto(button.dataset.photoId));
  });
  el.albumGrid.querySelectorAll("[data-preview-photo-id]").forEach((button) => {
    const photoId = button.dataset.previewPhotoId;
    button.addEventListener("click", () => {
      if (suppressPhotoClick) {
        suppressPhotoClick = false;
        return;
      }
      openPhotoViewer(photoId);
    });
    button.addEventListener("pointerdown", () => {
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        suppressPhotoClick = true;
        openSelectionMode(photoId);
      }, 560);
    });
    button.addEventListener("contextmenu", (event) => event.preventDefault());
    ["pointerup", "pointerleave", "pointercancel"].forEach((eventName) => {
      button.addEventListener(eventName, () => clearTimeout(longPressTimer));
    });
  });
}

function groupPhotos(photos) {
  return photos.reduce((groups, photo) => {
    const key = state.albumGroup === "time" ? formatDate(photo.createdAt) : photo.place;
    groups[key] ||= [];
    groups[key].push(photo);
    return groups;
  }, {});
}

function setAlbumGroup(group) {
  state.albumGroup = group;
  saveState();
  el.groupByTime.classList.toggle("active", group === "time");
  el.groupByPlace.classList.toggle("active", group === "place");
  renderAlbum();
}

function openSelectionMode(photoId) {
  selectedPhotoIds.clear();
  if (photoId) selectedPhotoIds.add(photoId);
  renderSelectionGrid();
  el.albumSelection.hidden = false;
  document.body.classList.add("selection-open");
}

function closeSelectionMode() {
  el.albumSelection.hidden = true;
  document.body.classList.remove("selection-open");
  selectedPhotoIds.clear();
  updateSelectionCount();
}

function renderSelectionGrid() {
  const project = activeProject();
  el.selectionGrid.innerHTML = project.photos.map((photo) => `
    <button class="selection-tile ${selectedPhotoIds.has(photo.id) ? "selected" : ""}" data-select-photo="${photo.id}" type="button">
      <img src="${photo.dataUrl}" alt="">
      <span></span>
    </button>
  `).join("");
  el.selectionGrid.querySelectorAll("[data-select-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      if (selectedPhotoIds.has(button.dataset.selectPhoto)) selectedPhotoIds.delete(button.dataset.selectPhoto);
      else selectedPhotoIds.add(button.dataset.selectPhoto);
      renderSelectionGrid();
    });
  });
  updateSelectionCount();
}

function updateSelectionCount() {
  el.selectionCount.textContent = `选中(${selectedPhotoIds.size})`;
}

function selectAllPhotos() {
  activeProject().photos.forEach((photo) => selectedPhotoIds.add(photo.id));
  renderSelectionGrid();
}

function selectPhotosByCurrentGroup() {
  const photos = activeProject().photos;
  const first = photos.find((photo) => selectedPhotoIds.has(photo.id)) || photos[0];
  if (!first) return;
  const targetDate = formatDate(first.createdAt);
  photos.forEach((photo) => {
    if (formatDate(photo.createdAt) === targetDate) selectedPhotoIds.add(photo.id);
  });
  renderSelectionGrid();
}

async function deleteSelectedPhotos() {
  if (!selectedPhotoIds.size) {
    showToast("请先选择照片");
    return;
  }
  const accepted = await openConfirmDialog({
    title: "删除照片",
    message: `删除选中的 ${selectedPhotoIds.size} 张照片？照片会从 App 内相册移除。`,
    confirmText: "删除"
  });
  if (!accepted) return;
  const project = activeProject();
  project.photos = project.photos.filter((photo) => !selectedPhotoIds.has(photo.id));
  saveState();
  renderAll();
  if (!project.photos.length) closeSelectionMode();
  else renderSelectionGrid();
  showToast("已从 App 相册删除");
}

async function createCollageReport() {
  if (!selectedPhotoIds.size) {
    showToast("请先选择照片");
    return;
  }
  reportPhotoItems = activeProject().photos
    .filter((photo) => selectedPhotoIds.has(photo.id))
    .map((photo) => ({ dataUrl: photo.dataUrl, name: photo.sourceName || "watermark-photo.jpg" }));
  hydrateReportFields();
  await refreshCollageReportPreview();
  el.collageReport.hidden = false;
  document.body.classList.add("report-open");
}

function closeCollageReport() {
  el.collageReport.hidden = true;
  document.body.classList.remove("report-open");
  el.reportFileInput.value = "";
}

function saveCollageReport() {
  if (!currentReportDataUrl) return;
  const fileName = `${safeFileName(activeProject().name)}-拼图汇报-${formatFullTime(new Date()).replaceAll(":", "-")}.jpg`;
  const saved = saveToNativeGallery(currentReportDataUrl, fileName);
  if (!saved) downloadBlob(dataUrlToBlob(currentReportDataUrl), fileName);
  showToast(saved ? "已保存到本地相册" : "未取得相册权限，已下载图片");
}

function hydrateReportFields() {
  const project = activeProject();
  el.reportTitleInput.value = "工作汇报";
  el.reportSubtitleInput.value = "现场照片汇总报告";
  el.reportReporterInput.value = "";
  el.reportContentInput.value = project.name || "";
}

async function addReportPhotos(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  const imported = [];
  for (const file of files) {
    imported.push({ dataUrl: await readFileAsDataUrl(file), name: file.name });
  }
  reportPhotoItems.push(...imported);
  await refreshCollageReportPreview();
  el.reportFileInput.value = "";
}

async function refreshCollageReportPreview() {
  if (!reportPhotoItems.length) {
    currentReportDataUrl = "";
    el.reportImage.removeAttribute("src");
    return;
  }
  currentReportDataUrl = await renderCollageReportDataUrl(reportPhotoItems, {
    title: el.reportTitleInput.value || "工作汇报",
    subtitle: el.reportSubtitleInput.value || "现场照片汇总报告",
    reporter: el.reportReporterInput.value,
    content: el.reportContentInput.value,
    dateText: new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
    weather: state.settings.weather || "晴 27℃"
  });
  el.reportImage.src = currentReportDataUrl;
}

async function renderCollageReportDataUrl(photos, meta) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1600;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const accent = "#34c8df";
  const deepBlue = "#347df1";
  context.fillStyle = deepBlue;
  context.textAlign = "center";
  context.font = "800 82px sans-serif";
  context.fillText(meta.title, 540, 170);
  context.font = "700 42px sans-serif";
  context.fillStyle = "#2d8fe8";
  context.fillText(meta.subtitle, 540, 232);

  context.textAlign = "left";
  context.fillStyle = "#111111";
  context.font = "500 34px sans-serif";
  context.fillText("汇 报 人：", 60, 318);
  context.fillText(fitCanvasText(context, meta.reporter || "未填写", 320), 250, 318);
  context.fillText("日    期：", 60, 374);
  context.fillText(fitCanvasText(context, `${meta.dateText}  ${meta.weather}`, 720), 250, 374);
  drawReportLine(context, 60, 396, 1020, "#52b8df");
  context.fillText("汇报内容：", 60, 452);
  context.fillText(fitCanvasText(context, meta.content || "未填写", 720), 250, 452);
  drawReportLine(context, 60, 474, 1020, "#52b8df");
  context.fillStyle = accent;
  context.fillRect(60, 496, 960, 7);

  const images = await Promise.all(photos.slice(0, 8).map((photo) => imageFromSrc(photo.dataUrl)));
  const gap = 18;
  const tileWidth = (960 - gap) / 2;
  const tileHeight = 300;
  images.forEach((image, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 60 + col * (tileWidth + gap);
    const y = 526 + row * (tileHeight + gap);
    drawImageCover(context, image, x, y, tileWidth, tileHeight);
  });
  return canvas.toDataURL("image/jpeg", 0.9);
}

function fitCanvasText(context, value, maxWidth) {
  const text = String(value || "");
  if (context.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && context.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}...`;
}

function drawReportLine(context, x1, y, x2, color = "#52b8df") {
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x1, y);
  context.lineTo(x2, y);
  context.stroke();
}

function drawImageCover(context, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sw = width / scale;
  const sh = height / scale;
  const sx = (image.width - sw) / 2;
  const sy = (image.height - sh) / 2;
  context.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function openProjectDialog(projectId = null) {
  editingProjectId = projectId;
  const project = state.projects.find((item) => item.id === projectId);
  document.querySelector("#projectDialogTitle").textContent = project ? "修改工程" : "创建工程";
  el.confirmProjectDialog.textContent = project ? "保存" : "确定";
  el.newProjectName.value = project?.name || el.projectSearch.value.trim();
  el.projectDialog.hidden = false;
  document.body.classList.add("dialog-open");
  requestAnimationFrame(() => {
    el.newProjectName.focus();
    el.newProjectName.select();
  });
}

function quickCreateProject() {
  const typedName = el.projectSearch.value.trim();
  if (!typedName && window.AndroidBridge?.promptProjectName) {
    window.AndroidBridge.promptProjectName();
    return;
  }
  const name = typedName || window.prompt("输入工程名称")?.trim();
  if (!name) {
    showToast("请输入工程名称");
    return;
  }
  addProject(name);
}

window.createProjectFromNative = (name) => {
  const projectName = String(name || "").trim();
  if (!projectName) {
    showToast("请输入工程名称");
    return;
  }
  addProject(projectName);
};

function openLocationDialog() {
  renderDefaultLocationOptions();
  el.defaultLocationInput.value = "";
  el.defaultLocationEditor.open = false;
  el.locationDialog.hidden = false;
  document.body.classList.add("dialog-open");
  requestAnimationFrame(() => {
    el.defaultLocationSelect.focus();
  });
}

function closeLocationDialog() {
  el.locationDialog.hidden = true;
  document.body.classList.remove("dialog-open");
}

function confirmLocationDialog(event) {
  event.preventDefault();
  const customAddress = el.defaultLocationInput.value.trim();
  const selectedAddress = el.defaultLocationSelect.value.trim();
  const address = customAddress || selectedAddress || state.settings.address || "";
  if (!address) {
    el.defaultLocationSelect.focus();
    return;
  }
  applyDefaultLocation(address);
  closeLocationDialog();
}

function selectDefaultLocationOption() {
  const address = el.defaultLocationSelect.value.trim();
  if (!address) return;
  el.defaultLocationInput.value = "";
}

function applyDefaultLocation(address) {
  const project = activeProject();
  state.settings.locationOptions = normalizeLocationOptions(state.settings.locationOptions, address);
  state.settings.address = address;
  el.addressInput.value = address;
  el.placeInput.value = address;
  if (project) project.location = address;
  saveState();
  refreshCapturePreviewState();
  renderAll();
  showToast(`默认地点已设为：${address}`);
}

function normalizeLocationOptions(options = [], preferredAddress = "") {
  const values = [preferredAddress, ...options]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return [...new Set(values)];
}

function renderDefaultLocationOptions() {
  state.settings.locationOptions = normalizeLocationOptions(
    state.settings.locationOptions,
    state.settings.address
  );
  el.defaultLocationSelect.innerHTML = "";

  state.settings.locationOptions.forEach((address) => {
    const option = document.createElement("option");
    option.value = address;
    option.textContent = address;
    el.defaultLocationSelect.append(option);
  });

  if (!state.settings.locationOptions.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无常用地点";
    el.defaultLocationSelect.append(option);
  }

  el.defaultLocationSelect.value = state.settings.address || state.settings.locationOptions[0] || "";
}

function closeProjectDialog() {
  el.projectDialog.hidden = true;
  document.body.classList.remove("dialog-open");
  editingProjectId = null;
}

function openConfirmDialog({ title = "确认操作", message = "", confirmText = "确定" } = {}) {
  closeProjectMenus();
  el.confirmDialogTitle.textContent = title;
  el.confirmDialogMessage.textContent = message;
  el.confirmDialogAction.textContent = confirmText;
  el.confirmDialog.hidden = false;
  document.body.classList.add("dialog-open");
  return new Promise((resolve) => {
    pendingConfirmResolve = resolve;
  });
}

function closeConfirmDialog(result) {
  if (el.confirmDialog.hidden) return;
  el.confirmDialog.hidden = true;
  document.body.classList.remove("dialog-open");
  const resolve = pendingConfirmResolve;
  pendingConfirmResolve = null;
  if (resolve) resolve(Boolean(result));
}

function confirmProjectDialog(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const submittedAt = Date.now();
  if (submittedAt - lastProjectSubmitAt < 650) return;
  lastProjectSubmitAt = submittedAt;
  const name = el.newProjectName.value.trim();
  if (!name) {
    el.newProjectName.focus();
    return;
  }
  try {
    if (editingProjectId) updateProjectName(editingProjectId, name);
    else addProject(name);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    closeProjectDialog();
  } catch (error) {
    alert(`创建工程失败：${error?.message || "未知错误"}`);
    lastProjectSubmitAt = 0;
  }
}

function updateProjectName(projectId, name) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  project.name = name;
  saveState();
  renderAll();
}

async function deleteProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  const accepted = await openConfirmDialog({
    title: "删除工程",
    message: `删除工程「${project.name}」？照片也会从 App 内相册移除。`,
    confirmText: "删除"
  });
  if (!accepted) return;
  state.projects = state.projects.filter((item) => item.id !== projectId);
  if (!state.projects.length) {
    addProject("新工程");
    return;
  }
  if (state.activeProjectId === projectId) {
    state.activeProjectId = state.projects[0].id;
  }
  saveState();
  renderAll();
}

function addProject(name) {
  const createdAt = new Date().toISOString();
  const project = {
    id: createId(),
    name,
    location: state.settings.address || "未设置地点",
    createdAt,
    lastOpenedAt: createdAt,
    photos: []
  };
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  state.projectTab = "created";
  el.projectSearch.value = "";
  saveState();
  renderAll();
  showView("projects");
  showToast(`已创建工程：${name}`);
}

async function startCamera() {
  if (window.AndroidBridge?.startNativeCamera) {
    startNativeCameraCapture();
    return;
  }
  if (location.protocol === "file:") {
    setEmptyPreview("文件预览不能开启摄像头", "请用本地预览地址 http://127.0.0.1:4193/ 测试摄像头，APK 真机里会走本机相机。");
    showToast("请用本地预览地址测试摄像头");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setEmptyPreview("当前浏览器不支持摄像头", "可以先用批量导入照片完成水印流程。");
    return;
  }
  document.body.classList.add("camera-live");
  window.scrollTo({ top: 0, behavior: "auto" });
  setEmptyPreview("正在请求摄像头权限", "请在浏览器弹窗中允许访问摄像头。");
  el.emptyPreview.style.display = "";
  el.canvas.style.display = "none";
  el.cameraWatermark.hidden = true;
  el.batchPreview.hidden = true;
  el.batchPreview.parentElement.classList.remove("has-batch");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia(cameraConstraints(cameraFacingMode));
    el.video.srcObject = cameraStream;
    el.video.style.display = "";
    await el.video.play();
    await enhanceCameraTrack();
    refreshCameraWatermark();
    clearInterval(cameraClock);
    cameraClock = setInterval(refreshCameraWatermark, 1000);
    el.cameraWatermark.hidden = false;
    el.emptyPreview.style.display = "none";
  } catch {
    document.body.classList.remove("camera-live");
    cameraStream = null;
    setEmptyPreview("摄像头未授权", "请允许浏览器访问摄像头，或使用批量导入照片。");
  }
}

function startNativeCameraCapture() {
  const settings = {
    ...nativeBatchImportSettings(),
    capturedAt: new Date().toISOString()
  };
  showToast("正在打开本机相机");
  try {
    window.AndroidBridge.startNativeCamera(JSON.stringify(settings));
  } catch {
    showToast("无法打开本机相机");
  }
}

function cameraConstraints(facingMode) {
  return {
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
      resizeMode: "none"
    },
    audio: false
  };
}

async function switchCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  const nextFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
  stopCameraPreview();
  cameraFacingMode = nextFacingMode;
  await startCamera();
  showToast(cameraFacingMode === "environment" ? "已切换后置镜头" : "已切换前置镜头");
}

async function enhanceCameraTrack() {
  const track = cameraStream?.getVideoTracks?.()[0];
  if (!track?.applyConstraints) return;
  const capabilities = track.getCapabilities?.() || {};
  const advanced = [];
  if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
    advanced.push({ focusMode: "continuous" });
  }
  if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes("continuous")) {
    advanced.push({ exposureMode: "continuous" });
  }
  if (Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes("continuous")) {
    advanced.push({ whiteBalanceMode: "continuous" });
  }
  if (!advanced.length) return;
  try {
    await track.applyConstraints({ advanced });
  } catch {
  }
}

async function focusCameraAtPoint(event) {
  if (!document.body.classList.contains("camera-live")) return;
  const track = cameraStream?.getVideoTracks?.()[0];
  if (!track?.applyConstraints) return;
  const rect = el.video.getBoundingClientRect();
  const point = event.changedTouches?.[0] || event;
  const x = Math.min(1, Math.max(0, (point.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (point.clientY - rect.top) / rect.height));
  const capabilities = track.getCapabilities?.() || {};
  const advanced = [];
  if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("single-shot")) {
    advanced.push({ focusMode: "single-shot" });
  } else if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
    advanced.push({ focusMode: "continuous" });
  }
  if ("pointsOfInterest" in capabilities) {
    advanced.push({ pointsOfInterest: [{ x, y }] });
  }
  if (!advanced.length) {
    showToast("当前设备未开放手动对焦能力");
    return;
  }
  try {
    await track.applyConstraints({ advanced });
    showToast("已尝试对焦");
  } catch {
    showToast("当前设备不支持手动对焦");
  }
}

function stopCameraPreview() {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  el.video.pause();
  el.video.srcObject = null;
  el.video.style.display = "none";
  el.cameraWatermark.hidden = true;
  document.body.classList.remove("camera-live");
  clearInterval(cameraClock);
  cameraClock = null;
  el.cameraRecord.classList.remove("recording");
  el.cameraRecord.setAttribute("aria-label", "录制视频");
  if (!pendingImages.length && el.canvas.style.display !== "block") {
    el.emptyPreview.style.display = "";
  }
}

function requestDeviceLocation() {
  if (!navigator.geolocation) {
    alert("当前设备不支持定位。");
    return;
  }
  el.locateButton.disabled = true;
  el.locateButton.textContent = "正在定位...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const longitude = position.coords.longitude.toFixed(6);
      const latitude = position.coords.latitude.toFixed(6);
      const coord = `${longitude}, ${latitude}`;
      el.coordInput.value = coord;
      saveState();
      refreshCapturePreviewState();
      showToast("已获取经纬度，地点保持默认地点");
      el.locateButton.disabled = false;
      el.locateButton.textContent = "获取本机定位";
    },
    () => {
      alert("定位失败：请允许应用访问位置权限。");
      el.locateButton.disabled = false;
      el.locateButton.textContent = "获取本机定位";
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  );
}

function saveCameraPhoto() {
  if (!cameraStream) {
    alert("摄像头还没有开启。");
    return;
  }
  const project = activeProject();
  const capturedAt = new Date().toISOString();
  const originalCanvas = document.createElement("canvas");
  renderVideoFrame(originalCanvas);
  const originalDataUrl = originalCanvas.toDataURL("image/jpeg", 0.9);
  const canvas = document.createElement("canvas");
  renderVideoFrameToCanvas(canvas, capturedAt);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
  const fileName = galleryFileName(project, capturedAt);
  project.location = el.placeInput.value || project.location || "未设置地点";
  const photo = {
    id: createId(),
    dataUrl,
    originalDataUrl,
    title: state.settings.title || "施工记录",
    weather: state.settings.weather,
    address: state.settings.address,
    place: project.location,
    note: "",
    coord: el.coordInput.value,
    sourceName: fileName,
    createdAt: capturedAt
  };
  project.photos.unshift(photo);
  try {
    saveState();
    const nativeUri = saveToNativeGallery(dataUrl, fileName);
    if (nativeUri) {
      photo.galleryUri = nativeUri;
      saveState();
    }
    renderAll();
    showToast(nativeUri ? "已保存到本机相册" : "已保存到 App 相册");
  } catch {
    project.photos.shift();
    saveState();
    alert("保存失败：当前浏览器本地空间不够。");
  }
}

function toggleVideoRecording() {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    return;
  }
  startWatermarkRecording();
}

function startWatermarkRecording() {
  if (!cameraStream) {
    alert("摄像头还没有开启。");
    return;
  }
  if (!window.MediaRecorder) {
    alert("当前浏览器不支持视频录制。");
    return;
  }
  const canvas = document.createElement("canvas");
  const stream = canvas.captureStream(24);
  const mimeType = preferredVideoMimeType();
  recordedChunks = [];

  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", () => {
    cancelAnimationFrame(recordingFrame);
    recordingFrame = null;
    el.cameraRecord.classList.remove("recording");
    el.cameraRecord.setAttribute("aria-label", "录制视频");
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "video/webm" });
    downloadBlob(blob, `${safeFileName(activeProject().name)}-${formatFullTime(new Date()).replaceAll(":", "-")}.webm`);
    showToast("已导出带水印视频");
  });

  const paint = () => {
    renderVideoFrameToCanvas(canvas, new Date().toISOString());
    recordingFrame = requestAnimationFrame(paint);
  };
  paint();
  mediaRecorder.start(1000);
  el.cameraRecord.classList.add("recording");
  el.cameraRecord.setAttribute("aria-label", "停止录制");
  showToast("开始录制带水印视频");
}

function preferredVideoMimeType() {
  const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function renderVideoFrameToCanvas(canvas, capturedAt) {
  renderVideoFrame(canvas);
  drawWatermarkOverlay(canvas.getContext("2d"), canvas.width, canvas.height, capturedAt);
}

function renderVideoFrame(canvas) {
  const width = el.video.videoWidth || 1280;
  const height = el.video.videoHeight || 720;
  const maxWidth = 1080;
  const scale = Math.min(1, maxWidth / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  context.drawImage(el.video, 0, 0, canvas.width, canvas.height);
}

function captureFromCamera() {
  if (!cameraStream) {
    alert("请先开启摄像头，或导入一张照片。");
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = el.video.videoWidth || 1280;
  canvas.height = el.video.videoHeight || 960;
  const context = canvas.getContext("2d");
  context.drawImage(el.video, 0, 0, canvas.width, canvas.height);
  loadImage(canvas.toDataURL("image/jpeg", 0.92), "camera-shot.jpg");
}

async function importPhoto(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  const imported = [];
  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await imageFromSrc(dataUrl);
    imported.push({ image, name: file.name, originalDataUrl: dataUrl });
  }
  setPendingImages(imported);
}

async function loadImage(src, name = "photo.jpg") {
  const image = await imageFromSrc(src);
  setPendingImages([{ image, name, originalDataUrl: src }]);
}

function setPendingImages(items) {
  pendingImages = items.map((item) => ({
    ...item,
    previewTimestamp: randomTimestampInRange()
  }));
  currentImage = pendingImages[0]?.image || null;
  previewTimestamp = pendingImages[0]?.previewTimestamp || new Date().toISOString();
  refreshPendingPreview();
  updateBatchStatus();
}

function drawWatermark(image, capturedAt = new Date().toISOString()) {
  const canvas = el.canvas;
  renderWatermarkToCanvas(canvas, image, capturedAt);
  el.emptyPreview.style.display = "none";
  el.batchPreview.hidden = true;
  el.cameraWatermark.hidden = true;
  el.video.pause();
  el.video.style.display = "none";
  canvas.style.display = "block";
}

function renderWatermarkToCanvas(canvas, image, capturedAt) {
  const context = canvas.getContext("2d");
  const maxWidth = 1080;
  const scale = Math.min(1, maxWidth / image.width);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  drawWatermarkOverlay(context, canvas.width, canvas.height, capturedAt);
}

function drawWatermarkOverlay(context, width, height, capturedAt) {
  const unit = Math.max(14, Math.round(width / 40));
  const panelWidth = width * 0.59;
  const barHeight = unit * 2.75;
  const bodyTopGap = unit * 0.95;
  const lineHeight = unit * 1.34;
  const project = activeProject();
  const lines = [
    `天    气：${state.settings.weather}`,
    `经    纬：${el.coordInput.value}`,
    `地    点：${watermarkPlace()}`,
    `工程名称：${project.name}`,
    `时    间：${formatFullTime(capturedAt)}`
  ];
  const panelHeight = barHeight + bodyTopGap + lines.length * lineHeight + unit * 0.35;
  const y = height - panelHeight;
  context.fillStyle = "rgba(0, 0, 0, 0.46)";
  context.fillRect(0, y, panelWidth, panelHeight);
  context.fillStyle = state.settings.accent;
  context.fillRect(0, y, panelWidth, barHeight);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.font = `700 ${unit * 1.2}px sans-serif`;
  context.fillText(state.settings.title || "施工记录", panelWidth / 2, y + unit * 1.78);

  context.textAlign = "left";
  context.font = `600 ${unit * 1.02}px sans-serif`;
  lines.forEach((line, index) => {
    const text = fitCanvasText(context, line, panelWidth - unit * 1.2);
    context.fillText(text, unit * 0.45, y + barHeight + bodyTopGap + index * lineHeight);
  });
}

function refreshPendingPreview() {
  if (!pendingImages.length) {
    el.batchPreview.hidden = true;
    return;
  }

  const thumbnails = pendingImages.map((item, index) => {
    const dataUrl = renderPreviewDataUrl(item.image, item.previewTimestamp);
    return `
      <article class="pending-card">
        <img src="${dataUrl}" alt="${escapeHtml(item.name)}">
        <span>${index + 1}</span>
        <b>${escapeHtml(truncateFileName(item.name))}</b>
        <small>${formatFullTime(item.previewTimestamp)}</small>
      </article>
    `;
  }).join("");

  el.batchPreview.innerHTML = `
    <header>
      <strong>已导入 ${pendingImages.length} 张</strong>
      <small>请核对缩略图，确认没有漏选。</small>
    </header>
    <div class="pending-grid">${thumbnails}</div>
  `;
  el.emptyPreview.style.display = "none";
  el.video.pause();
  el.video.style.display = "none";
  el.cameraWatermark.hidden = true;
  el.canvas.style.display = "none";
  el.batchPreview.parentElement.classList.add("has-batch");
  el.batchPreview.hidden = false;
}

function renderPreviewDataUrl(image, capturedAt) {
  const previewCanvas = document.createElement("canvas");
  renderWatermarkToCanvas(previewCanvas, image, capturedAt);
  return previewCanvas.toDataURL("image/jpeg", 0.82);
}

function startNativeBatchImport(event) {
  if (!window.AndroidBridge?.startNativeBatchImport) return;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const settings = nativeBatchImportSettings();
  el.batchStatus.textContent = "正在打开本机相册，选中后会直接保存到手机相册。";
  try {
    window.AndroidBridge.startNativeBatchImport(JSON.stringify(settings));
  } catch {
    el.batchStatus.textContent = "原生相册打开失败，请使用浏览器导入兜底。";
  }
}

function nativeBatchImportSettings() {
  const project = activeProject();
  return {
    projectId: project.id,
    projectName: project.name,
    title: state.settings.title || "施工记录",
    weather: state.settings.weather || "",
    address: watermarkPlace(),
    place: watermarkPlace(),
    coord: el.coordInput.value || "",
    accent: state.settings.accent || "#2259f2",
    timeStart: el.timeStartInput.value || "",
    timeEnd: el.timeEndInput.value || ""
  };
}

window.receiveNativeBatchImport = (payload) => {
  let result = payload;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      result = { ok: false, message: "原生导入结果解析失败" };
    }
  }
  if (!result?.ok) {
    const message = result?.message || "原生导入失败";
    el.batchStatus.textContent = message;
    showToast(message);
    return;
  }
  const project = activeProject();
  const imported = (result.photos || []).map((photo) => ({
    id: createId(),
    dataUrl: photo.thumbDataUrl,
    originalDataUrl: null,
    galleryUri: photo.uri,
    nativeOnly: true,
    title: photo.title || state.settings.title || "施工记录",
    weather: photo.weather || state.settings.weather || "",
    address: photo.address || state.settings.address || "",
    place: photo.place || el.placeInput.value || project.location || "未设置地点",
    note: "",
    coord: photo.coord || el.coordInput.value || "",
    sourceName: photo.sourceName || "watermark-photo.jpg",
    createdAt: photo.createdAt || new Date().toISOString()
  }));
  if (!imported.length) {
    el.batchStatus.textContent = "未导入照片。";
    return;
  }
  project.location = imported[0].place;
  project.photos.unshift(...imported.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  pendingImages = [];
  currentImage = null;
  saveState();
  updateBatchStatus();
  renderAll();
  showView("album");
  showToast(`已保存 ${imported.length} 张到本机相册`);
};

window.receiveNativeCameraPhoto = (payload) => {
  let result = payload;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      result = { ok: false, message: "本机相机结果解析失败" };
    }
  }
  if (!result?.ok) {
    showToast(result?.message || "本机相机拍照失败");
    return;
  }
  const project = activeProject();
  const nativePhoto = result.photo || {};
  const photo = {
    id: createId(),
    dataUrl: nativePhoto.thumbDataUrl,
    originalDataUrl: null,
    galleryUri: nativePhoto.uri,
    nativeOnly: true,
    title: nativePhoto.title || state.settings.title || "施工记录",
    weather: nativePhoto.weather || state.settings.weather || "",
    address: nativePhoto.address || state.settings.address || "",
    place: nativePhoto.place || el.placeInput.value || project.location || "未设置地点",
    note: "",
    coord: nativePhoto.coord || el.coordInput.value || "",
    sourceName: nativePhoto.sourceName || "watermark-photo.jpg",
    createdAt: nativePhoto.createdAt || new Date().toISOString()
  };
  if (!photo.dataUrl || !photo.galleryUri) {
    showToast("本机相机照片保存失败");
    return;
  }
  project.location = photo.place;
  project.photos.unshift(photo);
  saveState();
  renderAll();
  showView("album");
  showToast("已保存到本机相册");
};

function saveCurrentPhoto() {
  if (!pendingImages.length) {
    alert("请先拍照或导入照片。");
    return;
  }
  const project = activeProject();
  const saved = pendingImages.map((item) => {
    const capturedAt = randomTimestampInRange();
    renderWatermarkToCanvas(el.canvas, item.image, capturedAt);
    const dataUrl = el.canvas.toDataURL("image/jpeg", 0.82);
    return {
      id: createId(),
      dataUrl,
      originalDataUrl: item.originalDataUrl,
      title: state.settings.title || "施工记录",
      weather: state.settings.weather,
      address: state.settings.address,
      place: el.placeInput.value || project.location || "未设置地点",
      note: "",
      coord: el.coordInput.value,
      sourceName: item.name,
      createdAt: capturedAt
    };
  });
  const previousPhotos = [...project.photos];
  project.location = saved[0].place;
  project.photos.unshift(...saved.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  try {
    saveState();
    const nativeSaved = saved.map((photo) => {
      const nativeUri = saveToNativeGallery(photo.dataUrl, galleryFileName(project, photo.createdAt));
      if (nativeUri) photo.galleryUri = nativeUri;
      return nativeUri;
    });
    if (nativeSaved.some(Boolean)) saveState();
    showToast(nativeSaved.some(Boolean) ? `已保存 ${saved.length} 张到本机相册` : `已保存 ${saved.length} 张到 App 相册`);
  } catch {
    project.photos = previousPhotos;
    saveState();
    alert("保存失败：照片太大或数量太多，当前浏览器本地空间不够。请先少选几张，后续会改成原生 App 存储。");
    return;
  }
  currentImage = null;
  pendingImages = [];
  updateBatchStatus();
  el.canvas.style.display = "none";
  el.batchPreview.hidden = true;
  el.cameraWatermark.hidden = true;
  el.batchPreview.parentElement.classList.remove("has-batch");
  el.video.style.display = "";
  el.emptyPreview.style.display = "";
  renderAll();
  showView("album");
}

function openPhotoViewer(photoId) {
  const project = activeProject();
  const photo = project.photos.find((item) => item.id === photoId);
  if (!photo) return;
  viewerPhotoId = photoId;
  el.photoViewerImage.src = photo.dataUrl;
  hydrateViewerFields(photo);
  renderViewerInfo(photo);
  setViewerPanel("edit");
  el.photoViewer.hidden = false;
  document.body.classList.add("viewer-open");
}

function closePhotoViewer() {
  el.photoViewer.hidden = true;
  viewerPhotoId = null;
  el.photoViewerImage.removeAttribute("src");
  document.body.classList.remove("viewer-open");
}

function hydrateViewerFields(photo) {
  el.viewerTitleInput.value = activeProject().name;
  el.viewerPlaceInput.value = photo.address || photo.place || state.settings.address || "";
  el.viewerNoteInput.value = "";
  el.viewerCoordInput.value = photo.coord || "";
  el.viewerTimeInput.value = toDatetimeLocalValue(new Date(photo.createdAt));
  el.viewerEditHint.textContent = photo.originalDataUrl ? "" : "旧照片没有原图，会基于当前图片重新写入水印。";
  el.saveViewerWatermark.disabled = false;
  el.saveViewerWatermark.textContent = "保存并覆盖本机相册";
}

function renderViewerInfo(photo) {
  el.viewerInfoPanel.innerHTML = `
    <dl>
      <div><dt>工程</dt><dd>${escapeHtml(activeProject().name)}</dd></div>
      <div><dt>地点</dt><dd>${escapeHtml(photo.address || photo.place || "")}</dd></div>
      <div><dt>经纬度</dt><dd>${escapeHtml(photo.coord || "")}</dd></div>
      <div><dt>时间</dt><dd>${escapeHtml(formatFullTime(photo.createdAt))}</dd></div>
      <div><dt>文件</dt><dd>${escapeHtml(photo.sourceName || "watermark-photo.jpg")}</dd></div>
    </dl>
  `;
}

function setViewerPanel(panel) {
  const isEdit = panel === "edit";
  el.viewerEditTab.classList.toggle("active", isEdit);
  el.viewerInfoTab.classList.toggle("active", !isEdit);
  el.viewerEditPanel.hidden = !isEdit;
  el.viewerInfoPanel.hidden = isEdit;
}

async function saveViewerWatermark() {
  const project = activeProject();
  const photo = project.photos.find((item) => item.id === viewerPhotoId);
  if (!photo) return;
  const image = await imageFromSrc(photo.originalDataUrl || photo.dataUrl);
  const previousSettings = { ...state.settings };
  const previousCoord = el.coordInput.value;
  const previousProjectName = project.name;
  project.name = el.viewerTitleInput.value || project.name;
  state.settings.title = photo.title || state.settings.title || "施工记录";
  state.settings.address = el.viewerPlaceInput.value;
  el.noteInput.value = "";
  el.coordInput.value = el.viewerCoordInput.value;
  photo.title = state.settings.title;
  photo.address = state.settings.address;
  photo.place = el.viewerPlaceInput.value || photo.place;
  photo.note = "";
  photo.coord = el.viewerCoordInput.value || photo.coord;
  photo.createdAt = parseDatetimeLocal(el.viewerTimeInput.value)?.toISOString() || photo.createdAt;
  const canvas = document.createElement("canvas");
  renderWatermarkToCanvas(canvas, image, photo.createdAt);
  photo.dataUrl = canvas.toDataURL("image/jpeg", 0.84);
  state.settings = previousSettings;
  if (!el.viewerTitleInput.value) project.name = previousProjectName;
  el.noteInput.value = "";
  el.coordInput.value = previousCoord;
  const overwritten = overwriteNativeGalleryPhoto(photo);
  saveState();
  el.photoViewerImage.src = photo.dataUrl;
  renderViewerInfo(photo);
  renderAll();
  showToast(overwritten ? "已覆盖保存到本机相册" : "已更新 App 内照片");
}

function exportProjectData() {
  const project = activeProject();
  const payload = {
    exportedAt: new Date().toISOString(),
    project
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(project.name)}-工程数据.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast(`已导出 ${project.name} 的工程数据`);
}

function exportPhoto(photoId) {
  const project = activeProject();
  const photo = project.photos.find((item) => item.id === photoId);
  if (!photo) return;
  const fileName = `${safeFileName(project.name)}-${formatFullTime(photo.createdAt).replaceAll(":", "-")}.jpg`;
  const blob = dataUrlToBlob(photo.dataUrl);
  downloadBlob(blob, fileName);
  saveToNativeGallery(photo.dataUrl, fileName);

  if (/MicroMessenger|Mobile/i.test(navigator.userAgent)) {
    window.open(photo.dataUrl, "_blank");
  }
  showToast(`已导出照片：${fileName}`);
}

function saveToNativeGallery(dataUrl, fileName) {
  if (!window.AndroidBridge?.saveImage) return false;
  try {
    return window.AndroidBridge.saveImage(dataUrl, fileName) || false;
  } catch {
    return false;
  }
}

function overwriteNativeGalleryPhoto(photo) {
  if (!photo.galleryUri || !window.AndroidBridge?.overwriteImage) return false;
  try {
    return Boolean(window.AndroidBridge.overwriteImage(photo.galleryUri, photo.dataUrl));
  } catch {
    return false;
  }
}

function galleryFileName(project, capturedAt) {
  return `${safeFileName(project.name)}-${formatFullTime(capturedAt).replaceAll(":", "-")}.jpg`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function showToast(message) {
  let toast = document.querySelector("#toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function dataUrlToBlob(dataUrl) {
  const [meta, payload] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

function syncSettingsFields() {
  el.watermarkTitle.value = state.settings.title;
  el.weatherInput.value = state.settings.weather;
  el.addressInput.value = state.settings.address;
  el.accentInput.value = state.settings.accent;
}

function setDefaultTimeRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 45 * 60 * 1000);
  el.timeStartInput.value = toDatetimeLocalValue(start);
  el.timeEndInput.value = toDatetimeLocalValue(end);
}

function updateBatchStatus() {
  const count = pendingImages.length;
  if (!count) {
    el.batchStatus.textContent = "未选择照片。保存时会按时间段随机写入拍摄时间。";
    return;
  }
  el.batchStatus.textContent = `已选择 ${count} 张照片，已在上方全部预览。保存时会随机分布在 ${el.timeStartInput.value || "开始时间"} 至 ${el.timeEndInput.value || "结束时间"}。`;
}

function randomTimestampInRange() {
  const start = parseDatetimeLocal(el.timeStartInput.value) || new Date(Date.now() - 45 * 60 * 1000);
  const end = parseDatetimeLocal(el.timeEndInput.value, true) || new Date();
  const min = Math.min(start.getTime(), end.getTime());
  const max = Math.max(start.getTime(), end.getTime());
  const minSecond = Math.floor(min / 1000);
  const maxSecond = Math.floor(max / 1000);
  const second = minSecond + Math.floor(Math.random() * (maxSecond - minSecond + 1 || 1));
  return new Date(second * 1000).toISOString();
}

function parseDatetimeLocal(value, endOfMinute = false) {
  if (!value) return null;
  const date = new Date(value);
  if (endOfMinute && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    date.setSeconds(59, 999);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDatetimeLocalValue(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function imageFromSrc(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function setEmptyPreview(title, message) {
  el.emptyPreview.innerHTML = `
    <span class="camera-big"></span>
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(message)}</p>
  `;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatFullTime(value) {
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function safeFileName(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "-");
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function truncateFileName(value) {
  const text = String(value || "photo");
  return text.length > 16 ? `${text.slice(0, 9)}...${text.slice(-4)}` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
