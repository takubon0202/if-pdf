(function () {
  // ===== DOM References =====
  var dropArea = document.getElementById('ied-drop-area');
  var ui = document.getElementById('ied-ui');
  var brightnessSlider = document.getElementById('ied-brightness');
  var contrastSlider = document.getElementById('ied-contrast');
  var saturationSlider = document.getElementById('ied-saturation');
  var blurSlider = document.getElementById('ied-blur');
  var brightnessVal = document.getElementById('ied-brightness-val');
  var contrastVal = document.getElementById('ied-contrast-val');
  var saturationVal = document.getElementById('ied-saturation-val');
  var blurVal = document.getElementById('ied-blur-val');
  var canvas = document.getElementById('ied-canvas');
  var ctx = canvas.getContext('2d');
  var saveBtn = document.getElementById('ied-btn');
  var resetBtn = document.getElementById('ied-reset-btn');
  var backBtn = document.getElementById('ied-back-btn');
  var filterButtonsContainer = document.querySelector('#ied-ui .filter-buttons');
  var actionRow = document.querySelector('#ied-ui .action-row');

  // ===== State =====
  var originalImage = null; // { img, dataUrl, name, width, height }
  var currentFilter = 'none';
  var debounceTimer = null;

  // ===== Undo/Redo stacks =====
  var undoStack = [];
  var redoStack = [];
  var MAX_HISTORY = 30;

  // ===== Filter mapping (extended) =====
  var filterMap = {
    none: '',
    grayscale: 'grayscale(1)',
    sepia: 'sepia(1)',
    invert: 'invert(1)',
    vintage: 'sepia(0.4) contrast(1.2) brightness(0.9)',
    warm: 'sepia(0.3) saturate(1.4)',
    cool: 'saturate(0.8) hue-rotate(20deg)',
    'blur-light': 'blur(2px)',
    sharpen: 'contrast(1.5) brightness(1.1)',
    dramatic: 'contrast(1.5) saturate(1.3) brightness(0.9)',
    fade: 'brightness(1.1) saturate(0.7) contrast(0.9)',
    'bw-high': 'grayscale(1) contrast(1.5)'
  };

  // Labels for new filter buttons
  var newFilterLabels = {
    'blur-light': '\u8EFD\u3044\u307C\u304B\u3057',
    sharpen: '\u30B7\u30E3\u30FC\u30D7',
    dramatic: '\u30C9\u30E9\u30DE\u30C1\u30C3\u30AF',
    fade: '\u30D5\u30A7\u30FC\u30C9',
    'bw-high': '\u9AD8\u30B3\u30F3\u30C8\u30E9\u30B9\u30C8\u767D\u9ED2'
  };

  // ===== Dynamically add new filter buttons =====
  Object.keys(newFilterLabels).forEach(function (key) {
    var btn = document.createElement('button');
    btn.className = 'btn small secondary';
    btn.setAttribute('data-filter', key);
    btn.textContent = newFilterLabels[key];
    filterButtonsContainer.appendChild(btn);
  });

  // Re-query all filter buttons (original + new)
  var filterButtons = filterButtonsContainer.querySelectorAll('[data-filter]');

  // ===== Dynamically add Undo/Redo buttons to action row =====
  var undoBtn = document.createElement('button');
  undoBtn.className = 'btn secondary';
  undoBtn.id = 'ied-undo-btn';
  undoBtn.textContent = '\u2190 \u5143\u306B\u623B\u3059';
  undoBtn.disabled = true;

  var redoBtn = document.createElement('button');
  redoBtn.className = 'btn secondary';
  redoBtn.id = 'ied-redo-btn';
  redoBtn.textContent = '\u3084\u308A\u76F4\u3059 \u2192';
  redoBtn.disabled = true;

  // Insert undo/redo before the reset button
  actionRow.insertBefore(undoBtn, resetBtn);
  actionRow.insertBefore(redoBtn, resetBtn);

  // ===== Dynamically add output format selector =====
  var formatLabel = document.createElement('label');
  formatLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:600;font-size:.88rem;';
  formatLabel.textContent = '\u4FDD\u5B58\u5F62\u5F0F: ';
  var formatSelect = document.createElement('select');
  formatSelect.id = 'ied-format-select';
  formatSelect.style.cssText = 'padding:6px 10px;border:1px solid #ccc;border-radius:8px;font-size:.9rem;font-family:inherit;';
  var formats = [
    { value: 'image/png', label: 'PNG' },
    { value: 'image/jpeg', label: 'JPEG' },
    { value: 'image/webp', label: 'WebP' }
  ];
  formats.forEach(function (f) {
    var opt = document.createElement('option');
    opt.value = f.value;
    opt.textContent = f.label;
    formatSelect.appendChild(opt);
  });
  formatLabel.appendChild(formatSelect);
  actionRow.appendChild(formatLabel);

  // ===== Dynamically add image info display =====
  var infoDiv = document.createElement('div');
  infoDiv.id = 'ied-image-info';
  infoDiv.className = 'info-text';
  infoDiv.style.cssText = 'margin:4px 0 12px 0;font-size:.85rem;color:#666;';
  // Insert after canvas
  canvas.parentNode.insertBefore(infoDiv, canvas.nextSibling);

  // ===== File upload =====
  setupDropArea('ied-drop-area', 'ied-file-input', function (files) {
    var imgFile = files.find(function (f) { return f.type.startsWith('image/'); });
    if (imgFile) loadImage(imgFile);
  });

  async function loadImage(file) {
    try {
      originalImage = await loadImageFile(file);
      dropArea.style.display = 'none';
      ui.style.display = '';
      resetSliders();
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();
      renderPreview();
      pushUndoState();
      updateImageInfo();
    } catch (err) {
      alert('"' + file.name + '" \u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002');
    }
  }

  // ===== Build CSS filter string =====
  function buildFilterString() {
    var b = parseInt(brightnessSlider.value);
    var c = parseInt(contrastSlider.value);
    var s = parseInt(saturationSlider.value);
    var bl = parseInt(blurSlider.value);

    // Map -100..100 to 0..2 for brightness and contrast
    var brightness = (b + 100) / 100; // 0..2
    var contrast = (c + 100) / 100;   // 0..2
    // Map -100..100 to 0..3 for saturation
    var saturation = ((s + 100) / 100) * 1.5; // 0..3

    var filterStr = 'brightness(' + brightness + ') contrast(' + contrast + ') saturate(' + saturation + ') blur(' + bl + 'px)';

    var extra = filterMap[currentFilter] || '';
    if (extra) {
      filterStr += ' ' + extra;
    }

    return filterStr;
  }

  // ===== Render preview (scaled to canvas) =====
  function renderPreview() {
    if (!originalImage) return;

    var img = originalImage.img;

    // BUG FIX: safety check for image dimensions
    if (!img.naturalWidth || !img.naturalHeight) return;

    var maxW = canvas.parentElement.clientWidth || 800;
    var maxH = 600;
    var scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    var w = Math.round(img.naturalWidth * scale);
    var h = Math.round(img.naturalHeight * scale);

    canvas.width = w;
    canvas.height = h;

    ctx.filter = buildFilterString();
    ctx.drawImage(img, 0, 0, w, h);
    ctx.filter = 'none';
  }

  // ===== Debounced render =====
  function scheduleRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderPreview, 50);
  }

  // ===== Get current editing state snapshot =====
  function getCurrentState() {
    return {
      brightness: parseInt(brightnessSlider.value),
      contrast: parseInt(contrastSlider.value),
      saturation: parseInt(saturationSlider.value),
      blur: parseInt(blurSlider.value),
      filter: currentFilter
    };
  }

  // ===== Apply a state snapshot =====
  function applyState(state) {
    brightnessSlider.value = state.brightness;
    contrastSlider.value = state.contrast;
    saturationSlider.value = state.saturation;
    blurSlider.value = state.blur;
    brightnessVal.textContent = state.brightness;
    contrastVal.textContent = state.contrast;
    saturationVal.textContent = state.saturation;
    blurVal.textContent = state.blur;
    currentFilter = state.filter;
    // Update active filter button
    filterButtons.forEach(function (b) {
      b.classList.toggle('active', b.dataset.filter === currentFilter);
    });
    renderPreview();
  }

  // ===== Undo/Redo history =====
  function pushUndoState() {
    var state = getCurrentState();
    undoStack.push(state);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
  }

  function undo() {
    if (undoStack.length <= 1) return; // keep at least the initial state
    var current = undoStack.pop();
    redoStack.push(current);
    var prev = undoStack[undoStack.length - 1];
    applyState(prev);
    updateUndoRedoButtons();
  }

  function redo() {
    if (redoStack.length === 0) return;
    var state = redoStack.pop();
    undoStack.push(state);
    applyState(state);
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    undoBtn.disabled = undoStack.length <= 1;
    redoBtn.disabled = redoStack.length === 0;
  }

  // ===== Slider input handlers =====
  brightnessSlider.addEventListener('input', function () {
    brightnessVal.textContent = brightnessSlider.value;
    scheduleRender();
  });
  contrastSlider.addEventListener('input', function () {
    contrastVal.textContent = contrastSlider.value;
    scheduleRender();
  });
  saturationSlider.addEventListener('input', function () {
    saturationVal.textContent = saturationSlider.value;
    scheduleRender();
  });
  blurSlider.addEventListener('input', function () {
    blurVal.textContent = blurSlider.value;
    scheduleRender();
  });

  // Push undo state on change (when user releases slider)
  [brightnessSlider, contrastSlider, saturationSlider, blurSlider].forEach(function (slider) {
    slider.addEventListener('change', function () {
      pushUndoState();
    });
  });

  // ===== Filter buttons =====
  filterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentFilter = btn.dataset.filter;
      // Update active class
      filterButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      scheduleRender();
      pushUndoState();
    });
  });

  // ===== Undo/Redo button handlers =====
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  // ===== Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z =====
  document.addEventListener('keydown', function (e) {
    // Only respond when the editor UI is visible
    if (!originalImage || ui.style.display === 'none') return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    }
  });

  // ===== Reset sliders =====
  function resetSliders() {
    brightnessSlider.value = 0;
    contrastSlider.value = 0;
    saturationSlider.value = 0;
    blurSlider.value = 0;
    brightnessVal.textContent = '0';
    contrastVal.textContent = '0';
    saturationVal.textContent = '0';
    blurVal.textContent = '0';
    currentFilter = 'none';
    filterButtons.forEach(function (b) { b.classList.remove('active'); });
    // Set 'none' filter button as active
    filterButtons.forEach(function (b) {
      if (b.dataset.filter === 'none') b.classList.add('active');
    });
  }

  // ===== Update image info display =====
  function updateImageInfo() {
    if (!originalImage) {
      infoDiv.textContent = '';
      return;
    }
    var img = originalImage.img;
    var name = originalImage.name;
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    // Estimate file size from dataUrl (base64 -> approx 75% of string length)
    var estimatedBytes = originalImage.dataUrl
      ? Math.round(originalImage.dataUrl.length * 0.75)
      : 0;
    var sizeStr;
    if (estimatedBytes >= 1024 * 1024) {
      sizeStr = (estimatedBytes / (1024 * 1024)).toFixed(1) + ' MB';
    } else {
      sizeStr = Math.round(estimatedBytes / 1024) + ' KB';
    }
    infoDiv.textContent = name + ' | ' + w + ' \u00D7 ' + h + ' px | \u7D04 ' + sizeStr;
  }

  // ===== Reset button =====
  resetBtn.addEventListener('click', function () {
    resetSliders();
    renderPreview();
    pushUndoState();
  });

  // ===== Back button =====
  backBtn.addEventListener('click', function () {
    originalImage = null;
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    infoDiv.textContent = '';
    ui.style.display = 'none';
    dropArea.style.display = '';
  });

  // ===== Save button (full resolution) =====
  saveBtn.addEventListener('click', function () {
    if (!originalImage) return;

    var img = originalImage.img;

    // Safety check
    if (!img.naturalWidth || !img.naturalHeight) return;

    var fullCanvas = document.createElement('canvas');
    fullCanvas.width = img.naturalWidth;
    fullCanvas.height = img.naturalHeight;
    var fullCtx = fullCanvas.getContext('2d');

    fullCtx.filter = buildFilterString();
    fullCtx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
    fullCtx.filter = 'none';

    var mimeType = formatSelect.value || 'image/png';
    var quality = (mimeType === 'image/jpeg' || mimeType === 'image/webp') ? 0.92 : undefined;
    var ext = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/webp' ? '.webp' : '.png';

    fullCanvas.toBlob(function (blob) {
      if (!blob) {
        alert('\u753B\u50CF\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002');
        return;
      }
      var baseName = originalImage.name.replace(/\.[^.]+$/, '');
      downloadBlob(blob, baseName + '_edited' + ext);
    }, mimeType, quality);
  });

  // ===== Responsive canvas: recalculate on window resize =====
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (originalImage) renderPreview();
    }, 150);
  });
})();
