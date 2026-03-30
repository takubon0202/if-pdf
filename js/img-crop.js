(function () {
  var dropArea = document.getElementById('icrp-drop-area');
  var uiDiv = document.getElementById('icrp-ui');
  var xInput = document.getElementById('icrp-x');
  var yInput = document.getElementById('icrp-y');
  var wInput = document.getElementById('icrp-w');
  var hInput = document.getElementById('icrp-h');
  var ratioSelect = document.getElementById('icrp-ratio');
  var canvasWrapper = document.getElementById('icrp-canvas-wrapper');
  var canvas = document.getElementById('icrp-canvas');
  var selection = document.getElementById('icrp-selection');
  var cropBtn = document.getElementById('icrp-btn');
  var resetBtn = document.getElementById('icrp-reset-btn');
  var infoText = document.getElementById('icrp-info');

  // Overlay divs for darkening outside selection
  var overlayTop = document.getElementById('icrp-overlay-top');
  var overlayBottom = document.getElementById('icrp-overlay-bottom');
  var overlayLeft = document.getElementById('icrp-overlay-left');
  var overlayRight = document.getElementById('icrp-overlay-right');

  var originalImg = null;  // HTMLImageElement (full-resolution)
  var imgW = 0;            // actual image width
  var imgH = 0;            // actual image height
  var scale = 1;           // display / actual
  var displayW = 0;        // canvas display width
  var displayH = 0;        // canvas display height
  var imageName = '';
  var imageMimeType = 'image/png'; // detected from original file

  // Selection in display coordinates
  var sel = { x: 0, y: 0, w: 0, h: 0 };

  // requestAnimationFrame throttle flag
  var rafPending = false;

  // --- Setup drop ---

  setupDropArea('icrp-drop-area', 'icrp-file-input', function (files) {
    var imgFile = files.find(function (f) { return f.type.startsWith('image/'); });
    if (imgFile) loadImage(imgFile);
  });

  // --- Load image ---

  async function loadImage(file) {
    try {
      // Detect original format
      imageMimeType = file.type || 'image/png';
      // Browsers support toBlob for png, jpeg, webp; fallback others to png
      if (['image/png', 'image/jpeg', 'image/webp'].indexOf(imageMimeType) === -1) {
        imageMimeType = 'image/png';
      }

      var loaded = await loadImageFile(file);
      originalImg = loaded.img;
      imgW = loaded.width;
      imgH = loaded.height;
      imageName = loaded.name;
      initCanvas();
    } catch (e) {
      alert('"' + file.name + '" を読み込めませんでした。');
    }
  }

  // --- Initialize canvas and crop area ---

  function initCanvas() {
    var maxW = 800;
    scale = imgW > maxW ? maxW / imgW : 1;
    displayW = Math.round(imgW * scale);
    displayH = Math.round(imgH * scale);

    canvas.width = displayW;
    canvas.height = displayH;

    var ctx = canvas.getContext('2d');
    ctx.drawImage(originalImg, 0, 0, displayW, displayH);

    // Size the wrapper to match canvas exactly
    canvasWrapper.style.width = displayW + 'px';
    canvasWrapper.style.height = displayH + 'px';

    // Initialize selection to cover full image
    sel = { x: 0, y: 0, w: displayW, h: displayH };
    updateSelectionElement();
    updateOverlays();
    updateInfoText();
    syncInputsFromSelection();

    // Create corner handles
    createHandles();

    // Show UI
    dropArea.style.display = 'none';
    uiDiv.style.display = '';

    // Focus the wrapper for keyboard events
    canvasWrapper.setAttribute('tabindex', '0');
    canvasWrapper.focus();
  }

  // --- Corner handles ---

  function createHandles() {
    // Remove existing handles
    var existing = selection.querySelectorAll('.crop-handle');
    existing.forEach(function (h) { h.remove(); });

    var corners = ['tl', 'tr', 'bl', 'br'];
    corners.forEach(function (corner) {
      var handle = document.createElement('div');
      handle.className = 'crop-handle ' + corner;
      handle.dataset.corner = corner;
      selection.appendChild(handle);
    });
  }

  // --- Update selection div from sel object ---

  function updateSelectionElement() {
    selection.style.left = sel.x + 'px';
    selection.style.top = sel.y + 'px';
    selection.style.width = sel.w + 'px';
    selection.style.height = sel.h + 'px';
  }

  // --- Update dark overlay divs around selection ---

  function updateOverlays() {
    // Top overlay: full width, from top to sel.y
    overlayTop.style.left = '0';
    overlayTop.style.top = '0';
    overlayTop.style.width = displayW + 'px';
    overlayTop.style.height = Math.max(0, sel.y) + 'px';

    // Bottom overlay: full width, from sel.y+sel.h to bottom
    var bottomTop = sel.y + sel.h;
    overlayBottom.style.left = '0';
    overlayBottom.style.top = bottomTop + 'px';
    overlayBottom.style.width = displayW + 'px';
    overlayBottom.style.height = Math.max(0, displayH - bottomTop) + 'px';

    // Left overlay: from sel.y to sel.y+sel.h, left edge to sel.x
    overlayLeft.style.left = '0';
    overlayLeft.style.top = sel.y + 'px';
    overlayLeft.style.width = Math.max(0, sel.x) + 'px';
    overlayLeft.style.height = sel.h + 'px';

    // Right overlay: from sel.y to sel.y+sel.h, sel.x+sel.w to right edge
    var rightLeft = sel.x + sel.w;
    overlayRight.style.left = rightLeft + 'px';
    overlayRight.style.top = sel.y + 'px';
    overlayRight.style.width = Math.max(0, displayW - rightLeft) + 'px';
    overlayRight.style.height = sel.h + 'px';
  }

  // --- Selection info text ---

  function updateInfoText() {
    var actualW = Math.round(sel.w / scale);
    var actualH = Math.round(sel.h / scale);
    infoText.textContent = '選択範囲: ' + actualW + ' x ' + actualH + ' px';
  }

  // --- Sync number inputs from selection (display -> actual coords) ---

  function syncInputsFromSelection() {
    xInput.value = Math.round(sel.x / scale);
    yInput.value = Math.round(sel.y / scale);
    wInput.value = Math.round(sel.w / scale);
    hInput.value = Math.round(sel.h / scale);
  }

  // --- Sync selection from number inputs (actual -> display coords) ---

  function syncSelectionFromInputs() {
    var ax = parseInt(xInput.value) || 0;
    var ay = parseInt(yInput.value) || 0;
    var aw = parseInt(wInput.value) || 0;
    var ah = parseInt(hInput.value) || 0;

    // Clamp to image bounds
    ax = clamp(ax, 0, imgW);
    ay = clamp(ay, 0, imgH);
    aw = clamp(aw, 0, imgW - ax);
    ah = clamp(ah, 0, imgH - ay);

    sel.x = ax * scale;
    sel.y = ay * scale;
    sel.w = aw * scale;
    sel.h = ah * scale;

    updateSelectionElement();
    updateOverlays();
    updateInfoText();
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // --- Apply all visual updates (used by rAF) ---

  function applyVisualUpdates() {
    updateSelectionElement();
    updateOverlays();
    updateInfoText();
    syncInputsFromSelection();
  }

  // --- Schedule a visual update via requestAnimationFrame ---

  function scheduleUpdate() {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(function () {
        rafPending = false;
        applyVisualUpdates();
      });
    }
  }

  // --- Number input change listeners ---

  xInput.addEventListener('input', syncSelectionFromInputs);
  yInput.addEventListener('input', syncSelectionFromInputs);
  wInput.addEventListener('input', syncSelectionFromInputs);
  hInput.addEventListener('input', syncSelectionFromInputs);

  // --- Aspect ratio helper ---

  function getAspectRatio() {
    var v = ratioSelect.value;
    if (v === 'free') return null;
    var parts = v.split(':');
    return parseFloat(parts[0]) / parseFloat(parts[1]);
  }

  ratioSelect.addEventListener('change', function () {
    var ratio = getAspectRatio();
    if (ratio === null || !displayW) return;

    // Adjust current selection to match the chosen ratio
    var cx = sel.x + sel.w / 2;
    var cy = sel.y + sel.h / 2;

    var newW = sel.w;
    var newH = newW / ratio;

    if (newH > displayH) {
      newH = displayH;
      newW = newH * ratio;
    }
    if (newW > displayW) {
      newW = displayW;
      newH = newW / ratio;
    }

    var newX = cx - newW / 2;
    var newY = cy - newH / 2;

    // Clamp within bounds
    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    if (newX + newW > displayW) newX = displayW - newW;
    if (newY + newH > displayH) newY = displayH - newH;

    sel.x = newX;
    sel.y = newY;
    sel.w = newW;
    sel.h = newH;

    applyVisualUpdates();
  });

  // --- Interactive dragging ---

  var dragState = null;

  // Mouse support
  selection.addEventListener('mousedown', function (e) {
    e.preventDefault();
    startDrag(e.target, e.clientX, e.clientY);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  });

  // Touch support with passive: false to prevent scrolling
  selection.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    var touch = e.touches[0];
    startDrag(e.target, touch.clientX, touch.clientY);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }, { passive: false });

  function startDrag(target, clientX, clientY) {
    var handle = target.closest('.crop-handle');
    if (handle) {
      dragState = {
        type: 'resize',
        corner: handle.dataset.corner,
        startX: clientX,
        startY: clientY,
        origSel: { x: sel.x, y: sel.y, w: sel.w, h: sel.h }
      };
    } else {
      dragState = {
        type: 'move',
        startX: clientX,
        startY: clientY,
        origSel: { x: sel.x, y: sel.y, w: sel.w, h: sel.h }
      };
    }
  }

  function onTouchMove(e) {
    if (!dragState || e.touches.length !== 1) return;
    e.preventDefault();
    var touch = e.touches[0];
    handleDragDelta(touch.clientX, touch.clientY);
  }

  function onTouchEnd() {
    dragState = null;
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
  }

  function onDragMove(e) {
    if (!dragState) return;
    e.preventDefault();
    handleDragDelta(e.clientX, e.clientY);
  }

  function onDragEnd() {
    dragState = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }

  function handleDragDelta(clientX, clientY) {
    var dx = clientX - dragState.startX;
    var dy = clientY - dragState.startY;
    var o = dragState.origSel;
    var ratio = getAspectRatio();

    if (dragState.type === 'move') {
      var newX = clamp(o.x + dx, 0, displayW - o.w);
      var newY = clamp(o.y + dy, 0, displayH - o.h);
      sel.x = newX;
      sel.y = newY;
      sel.w = o.w;
      sel.h = o.h;
    } else {
      // Resize from corner
      var corner = dragState.corner;
      var nx, ny, nw, nh;

      if (corner === 'br') {
        nw = clamp(o.w + dx, 20, displayW - o.x);
        nh = ratio ? nw / ratio : clamp(o.h + dy, 20, displayH - o.y);
        if (ratio) {
          if (nh > displayH - o.y) {
            nh = displayH - o.y;
            nw = nh * ratio;
          }
        }
        nx = o.x;
        ny = o.y;
      } else if (corner === 'bl') {
        nw = clamp(o.w - dx, 20, o.x + o.w);
        nh = ratio ? nw / ratio : clamp(o.h + dy, 20, displayH - o.y);
        if (ratio) {
          if (nh > displayH - o.y) {
            nh = displayH - o.y;
            nw = nh * ratio;
          }
        }
        nx = o.x + o.w - nw;
        ny = o.y;
        if (nx < 0) { nw += nx; nx = 0; if (ratio) nh = nw / ratio; }
      } else if (corner === 'tr') {
        nw = clamp(o.w + dx, 20, displayW - o.x);
        nh = ratio ? nw / ratio : clamp(o.h - dy, 20, o.y + o.h);
        if (ratio) {
          if (nh > o.y + o.h) {
            nh = o.y + o.h;
            nw = nh * ratio;
          }
        }
        nx = o.x;
        ny = o.y + o.h - nh;
        if (ny < 0) { nh += ny; ny = 0; if (ratio) nw = nh * ratio; }
      } else if (corner === 'tl') {
        nw = clamp(o.w - dx, 20, o.x + o.w);
        nh = ratio ? nw / ratio : clamp(o.h - dy, 20, o.y + o.h);
        if (ratio) {
          if (nh > o.y + o.h) {
            nh = o.y + o.h;
            nw = nh * ratio;
          }
        }
        nx = o.x + o.w - nw;
        ny = o.y + o.h - nh;
        if (nx < 0) { nw += nx; nx = 0; if (ratio) nh = nw / ratio; }
        if (ny < 0) { nh += ny; ny = 0; if (ratio) nw = nh * ratio; }
      }

      sel.x = nx;
      sel.y = ny;
      sel.w = Math.max(nw, 10);
      sel.h = Math.max(nh, 10);
    }

    // Use rAF for smooth updates instead of updating directly
    scheduleUpdate();
  }

  // --- Double-click to reset selection to full image ---

  canvasWrapper.addEventListener('dblclick', function () {
    if (!originalImg) return;
    sel = { x: 0, y: 0, w: displayW, h: displayH };
    applyVisualUpdates();
  });

  // --- Keyboard support: arrow keys move selection ---

  canvasWrapper.addEventListener('keydown', function (e) {
    if (!originalImg) return;
    var step = e.shiftKey ? 10 : 1;
    var stepDisplay = step * scale; // convert px step to display coords
    var handled = true;

    switch (e.key) {
      case 'ArrowLeft':
        sel.x = clamp(sel.x - stepDisplay, 0, displayW - sel.w);
        break;
      case 'ArrowRight':
        sel.x = clamp(sel.x + stepDisplay, 0, displayW - sel.w);
        break;
      case 'ArrowUp':
        sel.y = clamp(sel.y - stepDisplay, 0, displayH - sel.h);
        break;
      case 'ArrowDown':
        sel.y = clamp(sel.y + stepDisplay, 0, displayH - sel.h);
        break;
      default:
        handled = false;
    }

    if (handled) {
      e.preventDefault();
      applyVisualUpdates();
    }
  });

  // --- Crop button ---

  cropBtn.addEventListener('click', function () {
    if (!originalImg) return;

    // Convert display selection back to actual image coordinates
    var ax = Math.round(sel.x / scale);
    var ay = Math.round(sel.y / scale);
    var aw = Math.round(sel.w / scale);
    var ah = Math.round(sel.h / scale);

    // Clamp to image bounds
    ax = clamp(ax, 0, imgW);
    ay = clamp(ay, 0, imgH);
    aw = clamp(aw, 1, imgW - ax);
    ah = clamp(ah, 1, imgH - ay);

    var outCanvas = document.createElement('canvas');
    outCanvas.width = aw;
    outCanvas.height = ah;
    var ctx = outCanvas.getContext('2d');
    ctx.drawImage(originalImg, ax, ay, aw, ah, 0, 0, aw, ah);

    // Determine output format and quality
    var mimeType = imageMimeType;
    var quality = (mimeType === 'image/jpeg') ? 0.92 : undefined;

    // Build correct file extension
    var extMap = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
    var ext = extMap[mimeType] || '.png';

    outCanvas.toBlob(function (blob) {
      if (!blob) { alert('切り抜きに失敗しました。'); return; }
      var baseName = imageName.replace(/\.[^.]+$/, '');
      downloadBlob(blob, baseName + '_cropped' + ext);
    }, mimeType, quality);
  });

  // --- Reset button ---

  resetBtn.addEventListener('click', function () {
    originalImg = null;
    imgW = 0;
    imgH = 0;
    scale = 1;
    displayW = 0;
    displayH = 0;
    imageName = '';
    imageMimeType = 'image/png';
    sel = { x: 0, y: 0, w: 0, h: 0 };
    ratioSelect.value = 'free';
    xInput.value = '0';
    yInput.value = '0';
    wInput.value = '';
    hInput.value = '';
    infoText.textContent = '';

    // Remove handles
    var handles = selection.querySelectorAll('.crop-handle');
    handles.forEach(function (h) { h.remove(); });

    // Hide overlays
    [overlayTop, overlayBottom, overlayLeft, overlayRight].forEach(function (el) {
      el.style.width = '0';
      el.style.height = '0';
    });

    uiDiv.style.display = 'none';
    dropArea.style.display = '';
  });
})();
