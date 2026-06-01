(() => {
  'use strict';

  const MAX_CANVAS_SIDE = 8192;
  const HISTORY_LIMIT = 60;
  const DEFAULT_WIDTH = 1024;
  const DEFAULT_HEIGHT = 768;
  const PALETTE_KEY = 'static-paint-studio-palette-v1';

  const els = {
    canvas: document.getElementById('paintCanvas'),
    canvasShell: document.getElementById('canvasShell'),
    canvasScroller: document.getElementById('canvasScroller'),
    canvasWidth: document.getElementById('canvasWidth'),
    canvasHeight: document.getElementById('canvasHeight'),
    resizeCanvasBtn: document.getElementById('resizeCanvasBtn'),
    openImageInput: document.getElementById('openImageInput'),
    openImageBtn: document.getElementById('openImageBtn'),
    stickerInput: document.getElementById('stickerInput'),
    addStickerBtn: document.getElementById('addStickerBtn'),
    toolButtons: Array.from(document.querySelectorAll('[data-tool]')),
    selectMode: document.getElementById('selectMode'),
    brushRadius: document.getElementById('brushRadius'),
    brushRadiusValue: document.getElementById('brushRadiusValue'),
    mosaicSize: document.getElementById('mosaicSize'),
    mosaicSizeValue: document.getElementById('mosaicSizeValue'),
    tolerance: document.getElementById('tolerance'),
    toleranceValue: document.getElementById('toleranceValue'),
    fillScope: document.getElementById('fillScope'),
    colorInput: document.getElementById('colorInput'),
    alphaInput: document.getElementById('alphaInput'),
    alphaValue: document.getElementById('alphaValue'),
    currentSwatch: document.getElementById('currentSwatch'),
    palette: document.getElementById('palette'),
    addColorBtn: document.getElementById('addColorBtn'),
    clearCustomPaletteBtn: document.getElementById('clearCustomPaletteBtn'),
    eyeDropperBtn: document.getElementById('eyeDropperBtn'),
    filterType: document.getElementById('filterType'),
    filterControls: document.getElementById('filterControls'),
    filterLabel: document.getElementById('filterLabel'),
    filterValue: document.getElementById('filterValue'),
    filterValueReadout: document.getElementById('filterValueReadout'),
    filterApplyBtn: document.getElementById('filterApplyBtn'),
    filterCancelBtn: document.getElementById('filterCancelBtn'),
    deleteStickerBtn: document.getElementById('deleteStickerBtn'),
    bringForwardBtn: document.getElementById('bringForwardBtn'),
    sendBackwardBtn: document.getElementById('sendBackwardBtn'),
    flattenBtn: document.getElementById('flattenBtn'),
    stickerList: document.getElementById('stickerList'),
    undoBtn: document.getElementById('undoBtn'),
    redoBtn: document.getElementById('redoBtn'),
    manualSaveBtn: document.getElementById('manualSaveBtn'),
    exportFormat: document.getElementById('exportFormat'),
    exportBtn: document.getElementById('exportBtn'),
    status: document.getElementById('status'),
    historyInfo: document.getElementById('historyInfo'),
    zoomReadout: document.getElementById('zoomReadout'),
  };

  const displayCtx = els.canvas.getContext('2d', { willReadFrequently: true });
  const baseCanvas = document.createElement('canvas');
  const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });

  const defaultPalette = [
    { r: 0, g: 0, b: 0, a: 255 },
    { r: 255, g: 255, b: 255, a: 255 },
    { r: 255, g: 59, b: 48, a: 255 },
    { r: 255, g: 149, b: 0, a: 255 },
    { r: 255, g: 204, b: 0, a: 255 },
    { r: 52, g: 199, b: 89, a: 255 },
    { r: 0, g: 199, b: 190, a: 255 },
    { r: 0, g: 122, b: 255, a: 255 },
    { r: 88, g: 86, b: 214, a: 255 },
    { r: 175, g: 82, b: 222, a: 255 },
    { r: 255, g: 45, b: 85, a: 190 },
    { r: 0, g: 0, b: 0, a: 0 },
  ];

  const filterNames = {
    brightness: '明るさ',
    contrast: 'コントラスト',
    saturation: '彩度',
    ambiance: 'アンビアンス',
    highlights: 'ハイライト',
    shadows: 'シャドウ',
    temperature: '色温度',
    structure: 'ストラクチャ',
    sharp: 'シャープ',
  };

  const state = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    tool: 'pen',
    brushRadius: 16,
    mosaicSize: 14,
    tolerance: 24,
    fillScope: 'contiguous',
    color: { r: 0, g: 122, b: 255, a: 255 },
    palette: loadPalette(),
    stickers: [],
    selectedStickerId: null,
    selectMode: false,
    pointer: null,
    drag: null,
    filterSession: null,
    history: [],
    historyIndex: -1,
    isRestoring: false,
    lastRenderTime: performance.now(),
  };

  function loadPalette() {
    try {
      const raw = localStorage.getItem(PALETTE_KEY);
      if (!raw) return defaultPalette.slice();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return defaultPalette.slice();
      return parsed.filter(isColor).slice(0, 64);
    } catch {
      return defaultPalette.slice();
    }
  }

  function savePalette() {
    try {
      localStorage.setItem(PALETTE_KEY, JSON.stringify(state.palette));
    } catch {
      // localStorage can be blocked; the app still works without saving custom colors.
    }
  }

  function isColor(value) {
    return value && ['r', 'g', 'b', 'a'].every((key) => Number.isFinite(value[key]));
  }

  function clamp(value, min = 0, max = 255) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min = 0, max = 255) {
    return Math.round(clamp(value, min, max));
  }

  function rgbaToCss(color) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${(color.a / 255).toFixed(3)})`;
  }

  function rgbToHex(color) {
    const toHex = (v) => clampInt(v).toString(16).padStart(2, '0');
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  }

  function hexToRgb(hex) {
    const normalized = hex.replace('#', '').trim();
    if (normalized.length !== 6) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    };
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  function updateControlReadouts() {
    els.brushRadiusValue.textContent = String(state.brushRadius);
    els.mosaicSizeValue.textContent = String(state.mosaicSize);
    els.toleranceValue.textContent = String(state.tolerance);
    els.alphaValue.textContent = `${Math.round((state.color.a / 255) * 100)}%`;
    els.currentSwatch.style.setProperty('--swatch-color', rgbaToCss(state.color));
    els.colorInput.value = rgbToHex(state.color);
    els.alphaInput.value = Math.round((state.color.a / 255) * 100);
    els.canvasWidth.value = state.width;
    els.canvasHeight.value = state.height;
    els.fillScope.value = state.fillScope;
    els.selectMode.checked = state.selectMode;
    els.canvasShell.classList.toggle('selecting', state.selectMode);
    els.filterValueReadout.textContent = els.filterValue.value;
    els.filterLabel.textContent = filterNames[els.filterType.value] || '値';
    updateHistoryButtons();
    updateToolButtons();
    updateZoomReadout();
  }

  function updateToolButtons() {
    for (const button of els.toolButtons) {
      button.classList.toggle('active', button.dataset.tool === state.tool);
    }
  }

  function updateHistoryButtons() {
    els.undoBtn.disabled = state.historyIndex <= 0 || state.isRestoring;
    els.redoBtn.disabled = state.historyIndex >= state.history.length - 1 || state.isRestoring;
    els.historyInfo.textContent = `History: ${Math.max(0, state.historyIndex + 1)} / ${state.history.length}`;
  }

  function updateZoomReadout() {
    const rect = els.canvas.getBoundingClientRect();
    if (!rect.width || !state.width) return;
    const zoom = Math.round((rect.width / state.width) * 100);
    els.zoomReadout.textContent = `${zoom}%`;
  }

  function renderPalette() {
    els.palette.innerHTML = '';
    state.palette.forEach((color, index) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch';
      swatch.style.setProperty('--swatch-color', rgbaToCss(color));
      swatch.title = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
      const same = color.r === state.color.r && color.g === state.color.g && color.b === state.color.b && color.a === state.color.a;
      swatch.classList.toggle('active', same);
      swatch.addEventListener('click', () => {
        setCurrentColor(color);
      });
      swatch.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (index >= defaultPalette.length) {
          state.palette.splice(index, 1);
          savePalette();
          renderPalette();
        }
      });
      els.palette.appendChild(swatch);
    });
  }

  function setCurrentColor(color) {
    state.color = {
      r: clampInt(color.r),
      g: clampInt(color.g),
      b: clampInt(color.b),
      a: clampInt(color.a),
    };
    updateControlReadouts();
    renderPalette();
  }

  function setCanvasDimensions(width, height) {
    state.width = clampInt(width, 1, MAX_CANVAS_SIDE);
    state.height = clampInt(height, 1, MAX_CANVAS_SIDE);
    baseCanvas.width = state.width;
    baseCanvas.height = state.height;
    els.canvas.width = state.width;
    els.canvas.height = state.height;
    els.canvas.style.width = `${state.width}px`;
    els.canvas.style.height = `${state.height}px`;
    els.canvasShell.style.width = `${state.width}px`;
    els.canvasShell.style.height = `${state.height}px`;
    displayCtx.imageSmoothingEnabled = true;
    baseCtx.imageSmoothingEnabled = true;
  }

  function resizeCanvasPreservingContent(width, height) {
    const nextWidth = clampInt(width, 1, MAX_CANVAS_SIDE);
    const nextHeight = clampInt(height, 1, MAX_CANVAS_SIDE);
    const composite = flattenToCanvas();
    setCanvasDimensions(nextWidth, nextHeight);
    baseCtx.clearRect(0, 0, state.width, state.height);
    baseCtx.drawImage(composite, 0, 0, nextWidth, nextHeight);
    state.stickers = [];
    state.selectedStickerId = null;
    state.filterSession = null;
    render();
    pushHistory(`resize ${nextWidth}x${nextHeight}`);
    setStatus(`キャンバスを ${nextWidth} × ${nextHeight} に変更しました。内容は一枚に統合して拡大縮小しています。`);
  }

  function drawSelection(ctx, sticker) {
    const x = sticker.x;
    const y = sticker.y;
    const w = sticker.w;
    const h = sticker.h;
    ctx.save();
    ctx.strokeStyle = 'rgba(121, 184, 255, 0.95)';
    ctx.lineWidth = Math.max(1, state.width / els.canvas.getBoundingClientRect().width);
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    const handles = getStickerHandles(sticker);
    ctx.fillStyle = 'rgba(20, 26, 38, 0.94)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    for (const handle of Object.values(handles)) {
      ctx.fillRect(handle.x - handle.size / 2, handle.y - handle.size / 2, handle.size, handle.size);
      ctx.strokeRect(handle.x - handle.size / 2, handle.y - handle.size / 2, handle.size, handle.size);
    }
    ctx.restore();
  }

  function render() {
    displayCtx.clearRect(0, 0, state.width, state.height);
    if (state.filterSession) {
      renderFilterPreview();
      return;
    }
    displayCtx.drawImage(baseCanvas, 0, 0);
    for (const sticker of state.stickers) {
      if (sticker.image && sticker.image.complete) {
        displayCtx.drawImage(sticker.image, sticker.x, sticker.y, sticker.w, sticker.h);
      }
    }
    const selected = getSelectedSticker();
    if (state.selectMode && selected) {
      drawSelection(displayCtx, selected);
    }
    renderStickerList();
    updateControlReadouts();
  }

  function flattenToCanvas() {
    const out = document.createElement('canvas');
    out.width = state.width;
    out.height = state.height;
    const outCtx = out.getContext('2d', { willReadFrequently: true });
    outCtx.clearRect(0, 0, out.width, out.height);
    outCtx.drawImage(baseCanvas, 0, 0);
    for (const sticker of state.stickers) {
      if (sticker.image && sticker.image.complete) {
        outCtx.drawImage(sticker.image, sticker.x, sticker.y, sticker.w, sticker.h);
      }
    }
    return out;
  }

  function commitCompositeToBase(reason = '貼り付け画像を固定化しました。') {
    if (!state.stickers.length) return false;
    const composite = flattenToCanvas();
    baseCtx.clearRect(0, 0, state.width, state.height);
    baseCtx.drawImage(composite, 0, 0);
    state.stickers = [];
    state.selectedStickerId = null;
    setStatus(reason);
    return true;
  }

  function ensurePixelEditingSurface() {
    if (state.stickers.length) {
      commitCompositeToBase('ピクセル編集のため、貼り付け画像を一時的に固定化しました。Undoすれば可動状態に戻せます。');
    }
  }

  function makeSnapshot(label) {
    return {
      label,
      width: state.width,
      height: state.height,
      baseData: baseCanvas.toDataURL('image/png'),
      stickers: state.stickers.map((sticker) => ({
        id: sticker.id,
        name: sticker.name,
        src: sticker.src,
        x: sticker.x,
        y: sticker.y,
        w: sticker.w,
        h: sticker.h,
      })),
      createdAt: Date.now(),
    };
  }

  function pushHistory(label) {
    if (state.isRestoring) return;
    const snapshot = makeSnapshot(label);
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snapshot);
    if (state.history.length > HISTORY_LIMIT) {
      state.history.shift();
    }
    state.historyIndex = state.history.length - 1;
    updateHistoryButtons();
  }

  async function restoreSnapshot(snapshot) {
    if (!snapshot) return;
    state.isRestoring = true;
    setCanvasDimensions(snapshot.width, snapshot.height);
    baseCtx.clearRect(0, 0, state.width, state.height);
    const baseImage = await loadImage(snapshot.baseData);
    baseCtx.drawImage(baseImage, 0, 0);
    const stickers = [];
    for (const raw of snapshot.stickers) {
      const image = await loadImage(raw.src);
      stickers.push({ ...raw, image });
    }
    state.stickers = stickers;
    state.selectedStickerId = null;
    state.filterSession = null;
    state.isRestoring = false;
    render();
    updateHistoryButtons();
  }

  async function undo() {
    if (state.historyIndex <= 0 || state.isRestoring) return;
    state.historyIndex -= 1;
    await restoreSnapshot(state.history[state.historyIndex]);
    setStatus(`Undo: ${state.history[state.historyIndex].label}`);
  }

  async function redo() {
    if (state.historyIndex >= state.history.length - 1 || state.isRestoring) return;
    state.historyIndex += 1;
    await restoreSnapshot(state.history[state.historyIndex]);
    setStatus(`Redo: ${state.history[state.historyIndex].label}`);
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('ファイル読み込みに失敗しました。'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
      image.src = src;
    });
  }

  async function openImageAsNew(file) {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const src = await fileToDataURL(file);
      const image = await loadImage(src);
      const width = clampInt(image.naturalWidth || image.width, 1, MAX_CANVAS_SIDE);
      const height = clampInt(image.naturalHeight || image.height, 1, MAX_CANVAS_SIDE);
      setCanvasDimensions(width, height);
      baseCtx.clearRect(0, 0, width, height);
      baseCtx.drawImage(image, 0, 0, width, height);
      state.stickers = [];
      state.selectedStickerId = null;
      state.filterSession = null;
      render();
      pushHistory(`open ${file.name}`);
      setStatus(`画像を新規編集として読み込みました: ${file.name} (${width} × ${height})`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function addStickerFromFile(file, preferredPosition = null) {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const src = await fileToDataURL(file);
      const image = await loadImage(src);
      const naturalW = image.naturalWidth || image.width;
      const naturalH = image.naturalHeight || image.height;
      const maxW = Math.max(32, state.width * 0.42);
      const maxH = Math.max(32, state.height * 0.42);
      const scale = Math.min(1, maxW / naturalW, maxH / naturalH);
      const w = Math.max(1, Math.round(naturalW * scale));
      const h = Math.max(1, Math.round(naturalH * scale));
      const x = preferredPosition ? preferredPosition.x - w / 2 : (state.width - w) / 2;
      const y = preferredPosition ? preferredPosition.y - h / 2 : (state.height - h) / 2;
      const sticker = {
        id: crypto.randomUUID ? crypto.randomUUID() : `sticker-${Date.now()}-${Math.random()}`,
        name: file.name || 'clipboard-image',
        src,
        image,
        x: clamp(x, -w + 1, state.width - 1),
        y: clamp(y, -h + 1, state.height - 1),
        w,
        h,
      };
      state.stickers.push(sticker);
      state.selectedStickerId = sticker.id;
      state.selectMode = true;
      els.selectMode.checked = true;
      state.filterSession = null;
      render();
      pushHistory(`add sticker ${sticker.name}`);
      setStatus(`貼り付け画像を追加しました: ${sticker.name}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function renderStickerList() {
    els.stickerList.innerHTML = '';
    if (!state.stickers.length) {
      els.stickerList.textContent = '貼り付け画像はありません。';
      return;
    }
    state.stickers.forEach((sticker, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'sticker-item';
      item.classList.toggle('active', sticker.id === state.selectedStickerId);
      item.addEventListener('click', () => {
        state.selectedStickerId = sticker.id;
        state.selectMode = true;
        render();
      });
      const img = document.createElement('img');
      img.className = 'sticker-thumb';
      img.src = sticker.src;
      img.alt = '';
      const meta = document.createElement('div');
      meta.className = 'sticker-meta';
      const name = document.createElement('strong');
      name.textContent = sticker.name || `Sticker ${index + 1}`;
      const size = document.createElement('span');
      size.textContent = `${Math.round(sticker.w)} × ${Math.round(sticker.h)} px`;
      meta.append(name, size);
      item.append(img, meta);
      els.stickerList.appendChild(item);
    });
  }

  function getSelectedSticker() {
    return state.stickers.find((sticker) => sticker.id === state.selectedStickerId) || null;
  }

  function getStickerHandles(sticker) {
    const baseSize = Math.max(9, Math.min(18, Math.max(sticker.w, sticker.h) * 0.04));
    return {
      nw: { x: sticker.x, y: sticker.y, size: baseSize },
      ne: { x: sticker.x + sticker.w, y: sticker.y, size: baseSize },
      sw: { x: sticker.x, y: sticker.y + sticker.h, size: baseSize },
      se: { x: sticker.x + sticker.w, y: sticker.y + sticker.h, size: baseSize },
    };
  }

  function hitTestSticker(point) {
    for (let i = state.stickers.length - 1; i >= 0; i -= 1) {
      const sticker = state.stickers[i];
      const handles = getStickerHandles(sticker);
      for (const [name, handle] of Object.entries(handles)) {
        if (Math.abs(point.x - handle.x) <= handle.size && Math.abs(point.y - handle.y) <= handle.size) {
          return { sticker, type: 'resize', handle: name };
        }
      }
      if (point.x >= sticker.x && point.x <= sticker.x + sticker.w && point.y >= sticker.y && point.y <= sticker.y + sticker.h) {
        return { sticker, type: 'move', handle: null };
      }
    }
    return null;
  }

  function pointerToCanvasPoint(event) {
    const rect = els.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (state.width / rect.width),
      y: (event.clientY - rect.top) * (state.height / rect.height),
    };
  }

  function drawBrushDot(point) {
    const radius = state.brushRadius;
    if (state.tool === 'mosaic') {
      applyMosaicStamp(point.x, point.y);
      return;
    }
    baseCtx.save();
    baseCtx.beginPath();
    baseCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    if (state.tool === 'eraser') {
      baseCtx.globalCompositeOperation = 'destination-out';
      baseCtx.fillStyle = 'rgba(0, 0, 0, 1)';
    } else {
      baseCtx.globalCompositeOperation = 'source-over';
      baseCtx.fillStyle = rgbaToCss(state.color);
    }
    baseCtx.fill();
    baseCtx.restore();
  }

  function drawBrushSegment(from, to) {
    if (state.tool === 'mosaic') {
      drawMosaicSegment(from, to);
      return;
    }
    baseCtx.save();
    baseCtx.lineCap = 'round';
    baseCtx.lineJoin = 'round';
    baseCtx.lineWidth = state.brushRadius * 2;
    if (state.tool === 'eraser') {
      baseCtx.globalCompositeOperation = 'destination-out';
      baseCtx.strokeStyle = 'rgba(0, 0, 0, 1)';
    } else {
      baseCtx.globalCompositeOperation = 'source-over';
      baseCtx.strokeStyle = rgbaToCss(state.color);
    }
    baseCtx.beginPath();
    baseCtx.moveTo(from.x, from.y);
    baseCtx.lineTo(to.x, to.y);
    baseCtx.stroke();
    baseCtx.restore();
  }

  function drawMosaicSegment(from, to) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const step = Math.max(1, state.brushRadius * 0.45);
    const steps = Math.max(1, Math.ceil(distance / step));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      applyMosaicStamp(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    }
  }

  function applyMosaicStamp(cx, cy) {
    const radius = state.brushRadius;
    const block = state.mosaicSize;
    const left = Math.max(0, Math.floor(cx - radius));
    const top = Math.max(0, Math.floor(cy - radius));
    const right = Math.min(state.width, Math.ceil(cx + radius));
    const bottom = Math.min(state.height, Math.ceil(cy + radius));
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return;

    const imageData = baseCtx.getImageData(left, top, width, height);
    const data = imageData.data;
    const radiusSquared = radius * radius;

    for (let by = 0; by < height; by += block) {
      for (let bx = 0; bx < width; bx += block) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        const maxY = Math.min(height, by + block);
        const maxX = Math.min(width, bx + block);
        for (let y = by; y < maxY; y += 1) {
          for (let x = bx; x < maxX; x += 1) {
            const globalX = left + x;
            const globalY = top + y;
            const dx = globalX - cx;
            const dy = globalY - cy;
            if (dx * dx + dy * dy > radiusSquared) continue;
            const idx = (y * width + x) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            a += data[idx + 3];
            count += 1;
          }
        }
        if (!count) continue;
        const avgR = Math.round(r / count);
        const avgG = Math.round(g / count);
        const avgB = Math.round(b / count);
        const avgA = Math.round(a / count);
        for (let y = by; y < maxY; y += 1) {
          for (let x = bx; x < maxX; x += 1) {
            const globalX = left + x;
            const globalY = top + y;
            const dx = globalX - cx;
            const dy = globalY - cy;
            if (dx * dx + dy * dy > radiusSquared) continue;
            const idx = (y * width + x) * 4;
            data[idx] = avgR;
            data[idx + 1] = avgG;
            data[idx + 2] = avgB;
            data[idx + 3] = avgA;
          }
        }
      }
    }
    baseCtx.putImageData(imageData, left, top);
  }

  function matchColor(data, index, target, tolerance) {
    return Math.abs(data[index] - target.r) <= tolerance &&
      Math.abs(data[index + 1] - target.g) <= tolerance &&
      Math.abs(data[index + 2] - target.b) <= tolerance &&
      Math.abs(data[index + 3] - target.a) <= tolerance;
  }

  function setPixel(data, pixelIndex, color) {
    const idx = pixelIndex * 4;
    data[idx] = color.r;
    data[idx + 1] = color.g;
    data[idx + 2] = color.b;
    data[idx + 3] = color.a;
  }

  function colorsEqual(a, b) {
    return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
  }

  function fillAt(point) {
    ensurePixelEditingSurface();
    const x = Math.floor(clamp(point.x, 0, state.width - 1));
    const y = Math.floor(clamp(point.y, 0, state.height - 1));
    const imageData = baseCtx.getImageData(0, 0, state.width, state.height);
    const data = imageData.data;
    const startIndex = (y * state.width + x) * 4;
    const target = {
      r: data[startIndex],
      g: data[startIndex + 1],
      b: data[startIndex + 2],
      a: data[startIndex + 3],
    };
    const replacement = { ...state.color };
    if (colorsEqual(target, replacement)) {
      setStatus('対象色と塗り色が同じです。働き者のCPUを無意味に燃やす必要はありません。');
      return false;
    }

    let changed = 0;
    if (state.fillScope === 'global') {
      for (let p = 0; p < state.width * state.height; p += 1) {
        const idx = p * 4;
        if (matchColor(data, idx, target, state.tolerance)) {
          setPixel(data, p, replacement);
          changed += 1;
        }
      }
    } else {
      const visited = new Uint8Array(state.width * state.height);
      const stack = [y * state.width + x];
      while (stack.length) {
        const pixel = stack.pop();
        if (visited[pixel]) continue;
        visited[pixel] = 1;
        const idx = pixel * 4;
        if (!matchColor(data, idx, target, state.tolerance)) continue;
        setPixel(data, pixel, replacement);
        changed += 1;
        const px = pixel % state.width;
        const py = Math.floor(pixel / state.width);
        if (px > 0) stack.push(pixel - 1);
        if (px < state.width - 1) stack.push(pixel + 1);
        if (py > 0) stack.push(pixel - state.width);
        if (py < state.height - 1) stack.push(pixel + state.width);
      }
    }

    if (!changed) {
      setStatus('塗りつぶし対象が見つかりませんでした。');
      return false;
    }
    baseCtx.putImageData(imageData, 0, 0);
    render();
    pushHistory(`fill ${changed} px`);
    setStatus(`${changed.toLocaleString()} px を塗りつぶしました。`);
    return true;
  }

  function pickColorFromCanvas(point) {
    const composite = flattenToCanvas();
    const ctx = composite.getContext('2d', { willReadFrequently: true });
    const x = Math.floor(clamp(point.x, 0, state.width - 1));
    const y = Math.floor(clamp(point.y, 0, state.height - 1));
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    setCurrentColor({ r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] });
    state.tool = 'pen';
    updateToolButtons();
    setStatus(`キャンバスから色を取得しました: rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${pixel[3]})`);
  }

  function handlePointerDown(event) {
    if (state.filterSession) return;
    const point = pointerToCanvasPoint(event);
    els.canvas.setPointerCapture(event.pointerId);

    if (state.selectMode) {
      const hit = hitTestSticker(point);
      if (hit) {
        state.selectedStickerId = hit.sticker.id;
        state.drag = {
          kind: hit.type,
          handle: hit.handle,
          startPoint: point,
          original: { x: hit.sticker.x, y: hit.sticker.y, w: hit.sticker.w, h: hit.sticker.h },
          stickerId: hit.sticker.id,
          dirty: false,
        };
      } else {
        state.selectedStickerId = null;
      }
      render();
      return;
    }

    if (state.tool === 'picker') {
      pickColorFromCanvas(point);
      render();
      return;
    }

    if (state.tool === 'fill') {
      fillAt(point);
      return;
    }

    if (['pen', 'eraser', 'mosaic'].includes(state.tool)) {
      ensurePixelEditingSurface();
      state.pointer = {
        pointerId: event.pointerId,
        lastPoint: point,
        dirty: true,
      };
      drawBrushDot(point);
      render();
    }
  }

  function handlePointerMove(event) {
    const point = pointerToCanvasPoint(event);
    if (state.drag) {
      const sticker = state.stickers.find((item) => item.id === state.drag.stickerId);
      if (!sticker) return;
      const dx = point.x - state.drag.startPoint.x;
      const dy = point.y - state.drag.startPoint.y;
      const original = state.drag.original;
      if (state.drag.kind === 'move') {
        sticker.x = original.x + dx;
        sticker.y = original.y + dy;
      } else if (state.drag.kind === 'resize') {
        resizeStickerFromHandle(sticker, original, state.drag.handle, dx, dy, event.shiftKey);
      }
      state.drag.dirty = true;
      render();
      return;
    }

    if (!state.pointer || state.pointer.pointerId !== event.pointerId) return;
    drawBrushSegment(state.pointer.lastPoint, point);
    state.pointer.lastPoint = point;
    state.pointer.dirty = true;
    render();
  }

  function resizeStickerFromHandle(sticker, original, handle, dx, dy, freeRatio) {
    let x = original.x;
    let y = original.y;
    let w = original.w;
    let h = original.h;
    const minSize = 8;
    if (handle.includes('e')) w = Math.max(minSize, original.w + dx);
    if (handle.includes('s')) h = Math.max(minSize, original.h + dy);
    if (handle.includes('w')) {
      w = Math.max(minSize, original.w - dx);
      x = original.x + (original.w - w);
    }
    if (handle.includes('n')) {
      h = Math.max(minSize, original.h - dy);
      y = original.y + (original.h - h);
    }

    if (!freeRatio) {
      const ratio = original.w / original.h;
      if (Math.abs(w - original.w) > Math.abs(h - original.h)) {
        h = w / ratio;
      } else {
        w = h * ratio;
      }
      if (handle.includes('w')) x = original.x + original.w - w;
      if (handle.includes('n')) y = original.y + original.h - h;
    }

    sticker.x = x;
    sticker.y = y;
    sticker.w = w;
    sticker.h = h;
  }

  function handlePointerUp(event) {
    if (state.pointer && state.pointer.pointerId === event.pointerId) {
      if (state.pointer.dirty) {
        pushHistory(`${state.tool} stroke`);
        setStatus(`${toolLabel(state.tool)} の描画を保存しました。`);
      }
      state.pointer = null;
    }
    if (state.drag) {
      if (state.drag.dirty) {
        pushHistory(`${state.drag.kind} sticker`);
        setStatus('貼り付け画像の位置・サイズを保存しました。');
      }
      state.drag = null;
    }
    try {
      els.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    render();
  }

  function toolLabel(tool) {
    return {
      pen: 'ペン',
      eraser: '透過ペン',
      mosaic: 'モザイクペン',
      fill: '塗りつぶし',
      picker: 'スポイト',
    }[tool] || tool;
  }

  function deleteSelectedSticker() {
    const selected = getSelectedSticker();
    if (!selected) {
      setStatus('削除する貼り付け画像が選択されていません。');
      return;
    }
    state.stickers = state.stickers.filter((sticker) => sticker.id !== selected.id);
    state.selectedStickerId = null;
    render();
    pushHistory(`delete sticker ${selected.name}`);
    setStatus(`貼り付け画像を削除しました: ${selected.name}`);
  }

  function moveSelectedStickerLayer(direction) {
    const selected = getSelectedSticker();
    if (!selected) return;
    const index = state.stickers.findIndex((sticker) => sticker.id === selected.id);
    const nextIndex = direction === 'forward' ? Math.min(state.stickers.length - 1, index + 1) : Math.max(0, index - 1);
    if (index === nextIndex) return;
    const [item] = state.stickers.splice(index, 1);
    state.stickers.splice(nextIndex, 0, item);
    render();
    pushHistory(`layer ${direction}`);
    setStatus(direction === 'forward' ? '選択画像を前面へ移動しました。' : '選択画像を背面へ移動しました。');
  }

  function startFilterSession(type) {
    if (!type) {
      state.filterSession = null;
      els.filterControls.hidden = true;
      render();
      return;
    }
    const source = flattenToCanvas();
    state.filterSession = { type, source };
    els.filterControls.hidden = false;
    els.filterValue.value = '0';
    els.filterValueReadout.textContent = '0';
    els.filterLabel.textContent = filterNames[type] || '値';
    renderFilterPreview();
    setStatus(`${filterNames[type]} フィルターのプレビュー中です。Saveで確定します。`);
  }

  function renderFilterPreview() {
    if (!state.filterSession) return;
    const type = state.filterSession.type;
    const value = Number(els.filterValue.value);
    const source = state.filterSession.source;
    const tempCtx = source.getContext('2d', { willReadFrequently: true });
    const imageData = tempCtx.getImageData(0, 0, source.width, source.height);
    const filtered = applyFilter(imageData, type, value);
    displayCtx.clearRect(0, 0, state.width, state.height);
    displayCtx.putImageData(filtered, 0, 0);
    els.filterValueReadout.textContent = String(value);
  }

  function applyFilter(imageData, type, value) {
    const data = imageData.data;
    const amount = value / 100;
    if (type === 'structure' || type === 'sharp') {
      return applyLocalContrastFilter(imageData, type, amount);
    }

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const a = data[i + 3];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      switch (type) {
        case 'brightness': {
          const delta = value * 1.4;
          r += delta;
          g += delta;
          b += delta;
          break;
        }
        case 'contrast': {
          const c = value * 2.55;
          const factor = (259 * (c + 255)) / (255 * (259 - c));
          r = factor * (r - 128) + 128;
          g = factor * (g - 128) + 128;
          b = factor * (b - 128) + 128;
          break;
        }
        case 'saturation': {
          const factor = 1 + amount * 1.8;
          r = lum + (r - lum) * factor;
          g = lum + (g - lum) * factor;
          b = lum + (b - lum) * factor;
          break;
        }
        case 'ambiance': {
          const shadowLift = (1 - lum / 255) * value * 0.55;
          const highlightHold = (lum / 255) * value * -0.12;
          const satFactor = 1 + amount * 0.35;
          r = lum + (r - lum) * satFactor + shadowLift + highlightHold;
          g = lum + (g - lum) * satFactor + shadowLift + highlightHold;
          b = lum + (b - lum) * satFactor + shadowLift + highlightHold;
          break;
        }
        case 'highlights': {
          const weight = clamp((lum - 128) / 127, 0, 1);
          r += value * weight * 1.2;
          g += value * weight * 1.2;
          b += value * weight * 1.2;
          break;
        }
        case 'shadows': {
          const weight = clamp((128 - lum) / 128, 0, 1);
          r += value * weight * 1.2;
          g += value * weight * 1.2;
          b += value * weight * 1.2;
          break;
        }
        case 'temperature': {
          r += value * 0.95;
          g += value * 0.12;
          b -= value * 0.95;
          break;
        }
        default:
          break;
      }

      data[i] = clampInt(r);
      data[i + 1] = clampInt(g);
      data[i + 2] = clampInt(b);
      data[i + 3] = a;
    }
    return imageData;
  }

  function applyLocalContrastFilter(imageData, type, amount) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const original = new Uint8ClampedArray(data);
    const blurred = boxBlur3x3(original, width, height);
    const strength = type === 'sharp' ? amount * 2.2 : amount * 1.35;
    const blurBlend = type === 'sharp' && amount < 0 ? Math.min(1, -amount) : 0;

    for (let i = 0; i < data.length; i += 4) {
      if (blurBlend > 0) {
        data[i] = clampInt(original[i] * (1 - blurBlend) + blurred[i] * blurBlend);
        data[i + 1] = clampInt(original[i + 1] * (1 - blurBlend) + blurred[i + 1] * blurBlend);
        data[i + 2] = clampInt(original[i + 2] * (1 - blurBlend) + blurred[i + 2] * blurBlend);
      } else {
        data[i] = clampInt(original[i] + (original[i] - blurred[i]) * strength);
        data[i + 1] = clampInt(original[i + 1] + (original[i + 1] - blurred[i + 1]) * strength);
        data[i + 2] = clampInt(original[i + 2] + (original[i + 2] - blurred[i + 2]) * strength);
      }
      data[i + 3] = original[i + 3];
    }
    return imageData;
  }

  function boxBlur3x3(source, width, height) {
    const out = new Uint8ClampedArray(source.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        for (let yy = -1; yy <= 1; yy += 1) {
          const py = y + yy;
          if (py < 0 || py >= height) continue;
          for (let xx = -1; xx <= 1; xx += 1) {
            const px = x + xx;
            if (px < 0 || px >= width) continue;
            const idx = (py * width + px) * 4;
            r += source[idx];
            g += source[idx + 1];
            b += source[idx + 2];
            a += source[idx + 3];
            count += 1;
          }
        }
        const outIdx = (y * width + x) * 4;
        out[outIdx] = Math.round(r / count);
        out[outIdx + 1] = Math.round(g / count);
        out[outIdx + 2] = Math.round(b / count);
        out[outIdx + 3] = Math.round(a / count);
      }
    }
    return out;
  }

  function applyFilterAndSave() {
    if (!state.filterSession) return;
    const source = state.filterSession.source;
    const sourceCtx = source.getContext('2d', { willReadFrequently: true });
    const imageData = sourceCtx.getImageData(0, 0, source.width, source.height);
    const filtered = applyFilter(imageData, state.filterSession.type, Number(els.filterValue.value));
    baseCtx.clearRect(0, 0, state.width, state.height);
    baseCtx.putImageData(filtered, 0, 0);
    state.stickers = [];
    state.selectedStickerId = null;
    const label = `${filterNames[state.filterSession.type]} filter ${els.filterValue.value}`;
    state.filterSession = null;
    els.filterType.value = '';
    els.filterControls.hidden = true;
    render();
    pushHistory(label);
    setStatus(`${label} を保存しました。`);
  }

  function cancelFilter() {
    state.filterSession = null;
    els.filterType.value = '';
    els.filterControls.hidden = true;
    render();
    setStatus('フィルターをキャンセルしました。');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportArtwork() {
    const format = els.exportFormat.value;
    const out = flattenToCanvas();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'png') {
      out.toBlob((blob) => {
        if (!blob) {
          setStatus('PNG出力に失敗しました。');
          return;
        }
        downloadBlob(blob, `paint-${state.width}x${state.height}-${timestamp}.png`);
        setStatus('PNGを書き出しました。透明部分は透明のままです。');
      }, 'image/png');
      return;
    }

    const pngData = out.toDataURL('image/png');
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${state.width}" height="${state.height}" viewBox="0 0 ${state.width} ${state.height}">\n` +
      `  <image href="${pngData}" width="${state.width}" height="${state.height}" />\n` +
      `</svg>\n`;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `paint-${state.width}x${state.height}-${timestamp}.svg`);
    setStatus('SVGを書き出しました。SVG内にPNGを埋め込む形式です。ベクター魔法ではありません。');
  }

  async function pickFromScreen() {
    if (!('EyeDropper' in window)) {
      setStatus('このブラウザは EyeDropper API に対応していません。キャンバススポイトを使ってください。');
      return;
    }
    try {
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      const rgb = hexToRgb(result.sRGBHex);
      setCurrentColor({ ...rgb, a: 255 });
      setStatus(`全画面スポイトで取得しました: ${result.sRGBHex}`);
    } catch (error) {
      setStatus(error && error.name === 'AbortError' ? 'スポイトをキャンセルしました。' : 'スポイト取得に失敗しました。');
    }
  }

  function wireEvents() {
    els.resizeCanvasBtn.addEventListener('click', () => {
      resizeCanvasPreservingContent(Number(els.canvasWidth.value), Number(els.canvasHeight.value));
    });

    els.openImageBtn.addEventListener('click', () => els.openImageInput.click());
    els.openImageInput.addEventListener('change', () => {
      const file = els.openImageInput.files && els.openImageInput.files[0];
      openImageAsNew(file);
      els.openImageInput.value = '';
    });

    els.addStickerBtn.addEventListener('click', () => els.stickerInput.click());
    els.stickerInput.addEventListener('change', async () => {
      const files = Array.from(els.stickerInput.files || []);
      for (const file of files) await addStickerFromFile(file);
      els.stickerInput.value = '';
    });

    for (const button of els.toolButtons) {
      button.addEventListener('click', () => {
        state.tool = button.dataset.tool;
        if (state.tool !== 'picker') state.selectMode = false;
        updateControlReadouts();
        setStatus(`${toolLabel(state.tool)} を選択しました。`);
      });
    }

    els.selectMode.addEventListener('change', () => {
      state.selectMode = els.selectMode.checked;
      render();
      setStatus(state.selectMode ? '選択機能をONにしました。貼り付け画像を移動・リサイズできます。' : '選択機能をOFFにしました。');
    });

    els.brushRadius.addEventListener('input', () => {
      state.brushRadius = Number(els.brushRadius.value);
      updateControlReadouts();
    });
    els.mosaicSize.addEventListener('input', () => {
      state.mosaicSize = Number(els.mosaicSize.value);
      updateControlReadouts();
    });
    els.tolerance.addEventListener('input', () => {
      state.tolerance = Number(els.tolerance.value);
      updateControlReadouts();
    });
    els.fillScope.addEventListener('change', () => {
      state.fillScope = els.fillScope.value;
    });

    els.colorInput.addEventListener('input', () => {
      const rgb = hexToRgb(els.colorInput.value);
      setCurrentColor({ ...rgb, a: state.color.a });
    });
    els.alphaInput.addEventListener('input', () => {
      state.color.a = clampInt((Number(els.alphaInput.value) / 100) * 255);
      updateControlReadouts();
      renderPalette();
    });
    els.addColorBtn.addEventListener('click', () => {
      state.palette.push({ ...state.color });
      if (state.palette.length > 64) state.palette.shift();
      savePalette();
      renderPalette();
      setStatus('カスタム色をパレットに追加しました。');
    });
    els.clearCustomPaletteBtn.addEventListener('click', () => {
      state.palette = defaultPalette.slice();
      savePalette();
      renderPalette();
      setStatus('パレットを初期化しました。');
    });
    els.eyeDropperBtn.addEventListener('click', pickFromScreen);

    els.canvas.addEventListener('pointerdown', handlePointerDown);
    els.canvas.addEventListener('pointermove', handlePointerMove);
    els.canvas.addEventListener('pointerup', handlePointerUp);
    els.canvas.addEventListener('pointercancel', handlePointerUp);
    els.canvas.addEventListener('lostpointercapture', () => {
      state.pointer = null;
      state.drag = null;
    });

    els.canvasShell.addEventListener('dragover', (event) => {
      event.preventDefault();
      els.canvasShell.classList.add('drag-over');
    });
    els.canvasShell.addEventListener('dragleave', () => {
      els.canvasShell.classList.remove('drag-over');
    });
    els.canvasShell.addEventListener('drop', async (event) => {
      event.preventDefault();
      els.canvasShell.classList.remove('drag-over');
      const point = pointerToCanvasPoint(event);
      const files = Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith('image/'));
      for (const file of files) await addStickerFromFile(file, point);
    });

    document.addEventListener('paste', async (event) => {
      const items = Array.from(event.clipboardData ? event.clipboardData.items : []);
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) await addStickerFromFile(file);
        }
      }
    });

    els.filterType.addEventListener('change', () => startFilterSession(els.filterType.value));
    els.filterValue.addEventListener('input', () => {
      if (state.filterSession) window.requestAnimationFrame(renderFilterPreview);
    });
    els.filterApplyBtn.addEventListener('click', applyFilterAndSave);
    els.filterCancelBtn.addEventListener('click', cancelFilter);

    els.deleteStickerBtn.addEventListener('click', deleteSelectedSticker);
    els.bringForwardBtn.addEventListener('click', () => moveSelectedStickerLayer('forward'));
    els.sendBackwardBtn.addEventListener('click', () => moveSelectedStickerLayer('backward'));
    els.flattenBtn.addEventListener('click', () => {
      const changed = commitCompositeToBase('貼り付け画像を固定化しました。');
      if (changed) {
        render();
        pushHistory('flatten stickers');
      } else {
        setStatus('固定化する貼り付け画像がありません。');
      }
    });

    els.undoBtn.addEventListener('click', undo);
    els.redoBtn.addEventListener('click', redo);
    els.manualSaveBtn.addEventListener('click', () => {
      pushHistory('manual savepoint');
      setStatus('セーブポイントを作成しました。');
    });
    els.exportBtn.addEventListener('click', exportArtwork);

    document.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selectMode && state.selectedStickerId && !isTypingTarget(event.target)) {
          event.preventDefault();
          deleteSelectedSticker();
        }
      }
    });

    window.addEventListener('resize', updateZoomReadout);
    els.canvasScroller.addEventListener('scroll', updateZoomReadout);
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function initialize() {
    setCanvasDimensions(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    baseCtx.clearRect(0, 0, state.width, state.height);
    wireEvents();
    renderPalette();
    render();
    pushHistory('initial transparent canvas');
    setStatus('準備完了。透明キャンバスです。');
  }

  initialize();
})();
