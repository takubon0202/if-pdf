(function () {
  // ===== DOM References =====
  const dropArea = document.getElementById('iblr-drop-area');
  const ui = document.getElementById('iblr-ui');
  const intensitySlider = document.getElementById('iblr-intensity');
  const intensityValue = document.getElementById('iblr-intensity-value');
  const undoBtn = document.getElementById('iblr-undo');
  const clearBtn = document.getElementById('iblr-clear');
  const canvasWrapper = document.getElementById('iblr-canvas-wrapper');
  const canvas = document.getElementById('iblr-canvas');
  const ctx = canvas.getContext('2d');
  const saveBtn = document.getElementById('iblr-btn');
  const resetBtn = document.getElementById('iblr-reset-btn');

  // ===== Dynamic UI: Mode select =====
  var optionsDiv = ui ? ui.querySelector('.options') : null;

  // Insert mode selector after the intensity label
  var modeLabel = document.createElement('label');
  modeLabel.textContent = 'モード: ';
  var modeSelect = document.createElement('select');
  modeSelect.id = 'iblr-mode';
  modeSelect.innerHTML = '<option value="mosaic">モザイク</option><option value="blur">ぼかし</option>';
  modeLabel.appendChild(modeSelect);
  if (optionsDiv) {
    // Insert after first label (intensity)
    var firstLabel = optionsDiv.querySelector('label');
    if (firstLabel && firstLabel.nextSibling) {
      optionsDiv.insertBefore(modeLabel, firstLabel.nextSibling);
    } else {
      optionsDiv.appendChild(modeLabel);
    }
  }

  // ===== Dynamic UI: Stroke count display =====
  var strokeCountSpan = document.createElement('span');
  strokeCountSpan.id = 'iblr-stroke-count';
  strokeCountSpan.style.cssText = 'margin-left:12px;font-size:0.9em;color:#888;';
  strokeCountSpan.textContent = 'ストローク数: 0';
  if (optionsDiv) {
    optionsDiv.appendChild(strokeCountSpan);
  }

  // ===== Dynamic UI: Brush cursor indicator =====
  var brushCursor = document.createElement('div');
  brushCursor.id = 'iblr-brush-cursor';
  brushCursor.style.cssText =
    'position:absolute;pointer-events:none;border:2px dashed rgba(255,80,80,0.7);' +
    'border-radius:50%;display:none;box-sizing:border-box;z-index:10;' +
    'transition:width 0.1s,height 0.1s;';
  // canvasWrapper must be position:relative for absolute child
  if (canvasWrapper) {
    canvasWrapper.style.position = 'relative';
    canvasWrapper.appendChild(brushCursor);
  }

  // ===== State =====
  var originalImage = null; // { img, dataUrl, name, width, height }
  var displayScale = 1;     // ratio: display / original
  var isDrawing = false;
  var history = [];          // ImageData snapshots (max 20)
  var strokeRecords = [];    // Track all strokes: [{ rects, intensity, mode, blurRegions }]
  var currentStrokeRects = [];
  var currentStrokeBlurRegions = []; // For blur mode full-res export
  var pendingDraw = false;   // For requestAnimationFrame throttle
  var pendingPos = null;

  function updateStrokeCount() {
    strokeCountSpan.textContent = 'ストローク数: ' + strokeRecords.length;
  }

  // ===== File upload =====
  setupDropArea('iblr-drop-area', 'iblr-file-input', function (files) {
    var imgFile = files.find(function (f) { return f.type.startsWith('image/'); });
    if (imgFile) loadImage(imgFile);
  });

  async function loadImage(file) {
    try {
      originalImage = await loadImageFile(file);
      var img = originalImage.img;

      // BUG FIX: Safety check for failed image loads
      if (!img.naturalWidth || !img.naturalHeight) {
        alert('画像の読み込みに失敗しました。');
        return;
      }

      dropArea.style.display = 'none';
      ui.style.display = '';

      // Scale to fit, max 800px
      var maxDim = 800;
      displayScale = Math.min(1, maxDim / img.naturalWidth, maxDim / img.naturalHeight);
      var w = Math.round(img.naturalWidth * displayScale);
      var h = Math.round(img.naturalHeight * displayScale);

      canvas.width = w;
      canvas.height = h;
      canvas.style.cursor = 'none'; // Hide default cursor, we use custom brush cursor
      ctx.drawImage(img, 0, 0, w, h);

      // Reset state
      history = [];
      strokeRecords = [];
      currentStrokeRects = [];
      currentStrokeBlurRegions = [];
      updateStrokeCount();
      pushHistory();
    } catch (err) {
      alert('"' + file.name + '" を読み込めませんでした。');
    }
  }

  // ===== Intensity display + brush preview flash =====
  intensitySlider.addEventListener('input', function () {
    intensityValue.textContent = intensitySlider.value;
    // Flash the brush cursor at the center of the canvas to preview size
    flashBrushPreview();
  });

  function flashBrushPreview() {
    if (!originalImage) return;
    var rect = canvas.getBoundingClientRect();
    var centerX = rect.width / 2;
    var centerY = rect.height / 2;
    updateBrushCursor(centerX, centerY);
    brushCursor.style.display = 'block';
    brushCursor.style.borderColor = 'rgba(80,150,255,0.9)';
    clearTimeout(brushCursor._flashTimer);
    brushCursor._flashTimer = setTimeout(function () {
      brushCursor.style.borderColor = 'rgba(255,80,80,0.7)';
      // Only hide if mouse is not over canvas
      if (!brushCursor._mouseOver) {
        brushCursor.style.display = 'none';
      }
    }, 600);
  }

  // ===== Brush cursor helpers =====
  function updateBrushCursor(localX, localY) {
    var intensity = parseInt(intensitySlider.value);
    var radius = intensity * 2;
    // Convert canvas pixels to display pixels
    var rect = canvas.getBoundingClientRect();
    var scaleToDisplay = rect.width / canvas.width;
    var diameterDisplay = radius * 2 * scaleToDisplay;
    brushCursor.style.width = diameterDisplay + 'px';
    brushCursor.style.height = diameterDisplay + 'px';
    // Position relative to canvasWrapper
    var canvasOffsetLeft = canvas.offsetLeft;
    var canvasOffsetTop = canvas.offsetTop;
    brushCursor.style.left = (canvasOffsetLeft + localX * scaleToDisplay - diameterDisplay / 2) + 'px';
    brushCursor.style.top = (canvasOffsetTop + localY * scaleToDisplay - diameterDisplay / 2) + 'px';
  }

  function getLocalPos(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  canvas.addEventListener('mouseenter', function () {
    brushCursor._mouseOver = true;
    if (originalImage) brushCursor.style.display = 'block';
  });

  canvas.addEventListener('mouseleave', function (e) {
    brushCursor._mouseOver = false;
    brushCursor.style.display = 'none';
    if (isDrawing) {
      isDrawing = false;
      finishStroke();
    }
  });

  canvas.addEventListener('mousemove', function (e) {
    var local = getLocalPos(e);
    var canvasRect = canvas.getBoundingClientRect();
    // Convert from display coords to canvas pixel coords for cursor positioning
    updateBrushCursor(local.x / (canvasRect.width / canvas.width) * (canvasRect.width / canvas.width), local.y / (canvasRect.height / canvas.height) * (canvasRect.height / canvas.height));
    // Simplified: just use local coords directly scaled for display
    var intensity = parseInt(intensitySlider.value);
    var radius = intensity * 2;
    var diameterDisplay = radius * 2 * (canvasRect.width / canvas.width);
    var canvasOffsetLeft = canvas.offsetLeft;
    var canvasOffsetTop = canvas.offsetTop;
    brushCursor.style.width = diameterDisplay + 'px';
    brushCursor.style.height = diameterDisplay + 'px';
    brushCursor.style.left = (canvasOffsetLeft + local.x - diameterDisplay / 2) + 'px';
    brushCursor.style.top = (canvasOffsetTop + local.y - diameterDisplay / 2) + 'px';
  });

  // ===== History management =====
  function pushHistory() {
    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    history.push(imageData);
    if (history.length > 20) {
      history.shift();
      if (strokeRecords.length > 0) {
        strokeRecords.shift();
      }
    }
  }

  // ===== Get canvas coordinates from event =====
  function getCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: Math.floor((clientX - rect.left) * scaleX),
      y: Math.floor((clientY - rect.top) * scaleY)
    };
  }

  // ===== Get current mode =====
  function getMode() {
    return modeSelect.value; // 'mosaic' or 'blur'
  }

  // ===== Mosaic / Pixelation effect (optimized: partial getImageData) =====
  function applyMosaic(cx, cy) {
    var intensity = parseInt(intensitySlider.value);
    var radius = intensity * 2;
    var blockSize = intensity;

    var left = Math.max(0, cx - radius);
    var top = Math.max(0, cy - radius);
    var right = Math.min(canvas.width, cx + radius);
    var bottom = Math.min(canvas.height, cy + radius);

    // Align to block grid
    left = Math.floor(left / blockSize) * blockSize;
    top = Math.floor(top / blockSize) * blockSize;

    var regionW = right - left;
    var regionH = bottom - top;
    if (regionW <= 0 || regionH <= 0) return;

    // Performance: only get/put the affected rectangle
    var imageData = ctx.getImageData(left, top, regionW, regionH);
    var data = imageData.data;
    var radiusSq = radius * radius;

    for (var by = 0; by < regionH; by += blockSize) {
      for (var bx = 0; bx < regionW; bx += blockSize) {
        var absX = left + bx;
        var absY = top + by;

        var blockCenterX = absX + blockSize / 2;
        var blockCenterY = absY + blockSize / 2;
        var dx = blockCenterX - cx;
        var dy = blockCenterY - cy;
        if (dx * dx + dy * dy > radiusSq) continue;

        var blockRight = Math.min(bx + blockSize, regionW);
        var blockBottom = Math.min(by + blockSize, regionH);
        var sumR = 0, sumG = 0, sumB = 0, sumA = 0;
        var count = 0;

        for (var py = by; py < blockBottom; py++) {
          for (var px = bx; px < blockRight; px++) {
            var idx = (py * regionW + px) * 4;
            sumR += data[idx];
            sumG += data[idx + 1];
            sumB += data[idx + 2];
            sumA += data[idx + 3];
            count++;
          }
        }

        if (count === 0) continue;

        var avgR = Math.round(sumR / count);
        var avgG = Math.round(sumG / count);
        var avgB = Math.round(sumB / count);
        var avgA = Math.round(sumA / count);

        for (var py = by; py < blockBottom; py++) {
          for (var px = bx; px < blockRight; px++) {
            var idx = (py * regionW + px) * 4;
            data[idx] = avgR;
            data[idx + 1] = avgG;
            data[idx + 2] = avgB;
            data[idx + 3] = avgA;
          }
        }

        // Track in image-space for full-res export
        currentStrokeRects.push({
          x: absX / displayScale,
          y: absY / displayScale,
          w: (blockRight - bx) / displayScale,
          h: (blockBottom - by) / displayScale,
          blockSize: blockSize / displayScale
        });
      }
    }

    ctx.putImageData(imageData, left, top);
  }

  // ===== Box Blur effect (3-pass for Gaussian approximation) =====
  function applyBlur(cx, cy) {
    var intensity = parseInt(intensitySlider.value);
    var radius = intensity * 2;
    var blurRadius = Math.max(2, Math.floor(intensity / 2));

    var left = Math.max(0, cx - radius - blurRadius);
    var topY = Math.max(0, cy - radius - blurRadius);
    var right = Math.min(canvas.width, cx + radius + blurRadius);
    var bottom = Math.min(canvas.height, cy + radius + blurRadius);

    var regionW = right - left;
    var regionH = bottom - topY;
    if (regionW <= 0 || regionH <= 0) return;

    var imageData = ctx.getImageData(left, topY, regionW, regionH);
    var data = imageData.data;
    var radiusSq = radius * radius;

    // Build a mask of which pixels are inside the circle
    var mask = new Uint8Array(regionW * regionH);
    for (var y = 0; y < regionH; y++) {
      for (var x = 0; x < regionW; x++) {
        var absX = left + x - cx;
        var absY = topY + y - cy;
        if (absX * absX + absY * absY <= radiusSq) {
          mask[y * regionW + x] = 1;
        }
      }
    }

    // 3-pass box blur on masked pixels
    var passes = 3;
    var passRadius = Math.max(1, Math.floor(blurRadius / passes));

    for (var pass = 0; pass < passes; pass++) {
      var copy = new Uint8ClampedArray(data);

      for (var y = 0; y < regionH; y++) {
        for (var x = 0; x < regionW; x++) {
          if (!mask[y * regionW + x]) continue;

          var sumR = 0, sumG = 0, sumB = 0, sumA = 0, count = 0;
          var yStart = Math.max(0, y - passRadius);
          var yEnd = Math.min(regionH - 1, y + passRadius);
          var xStart = Math.max(0, x - passRadius);
          var xEnd = Math.min(regionW - 1, x + passRadius);

          for (var sy = yStart; sy <= yEnd; sy++) {
            for (var sx = xStart; sx <= xEnd; sx++) {
              var si = (sy * regionW + sx) * 4;
              sumR += copy[si];
              sumG += copy[si + 1];
              sumB += copy[si + 2];
              sumA += copy[si + 3];
              count++;
            }
          }

          var di = (y * regionW + x) * 4;
          data[di] = Math.round(sumR / count);
          data[di + 1] = Math.round(sumG / count);
          data[di + 2] = Math.round(sumB / count);
          data[di + 3] = Math.round(sumA / count);
        }
      }
    }

    ctx.putImageData(imageData, left, topY);

    // Track blur region in image-space for full-res export
    currentStrokeBlurRegions.push({
      cx: cx / displayScale,
      cy: cy / displayScale,
      radius: radius / displayScale,
      blurRadius: blurRadius / displayScale
    });
  }

  // ===== Apply effect based on current mode =====
  function applyEffect(cx, cy) {
    if (getMode() === 'blur') {
      applyBlur(cx, cy);
    } else {
      applyMosaic(cx, cy);
    }
  }

  // ===== Finish a stroke =====
  function finishStroke() {
    strokeRecords.push({
      rects: currentStrokeRects.slice(),
      blurRegions: currentStrokeBlurRegions.slice(),
      intensity: parseInt(intensitySlider.value),
      mode: getMode()
    });
    currentStrokeRects = [];
    currentStrokeBlurRegions = [];
    updateStrokeCount();
    pushHistory();
  }

  // ===== RAF-throttled drawing =====
  function scheduleApply(pos) {
    pendingPos = pos;
    if (pendingDraw) return;
    pendingDraw = true;
    requestAnimationFrame(function () {
      pendingDraw = false;
      if (pendingPos && isDrawing) {
        applyEffect(pendingPos.x, pendingPos.y);
      }
    });
  }

  // ===== Mouse events =====
  canvas.addEventListener('mousedown', function (e) {
    e.preventDefault();
    isDrawing = true;
    currentStrokeRects = [];
    currentStrokeBlurRegions = [];
    var pos = getCanvasPos(e);
    applyEffect(pos.x, pos.y);
  });

  canvas.addEventListener('mousemove', function (e) {
    if (!isDrawing) return;
    e.preventDefault();
    var pos = getCanvasPos(e);
    scheduleApply(pos);
  });

  canvas.addEventListener('mouseup', function (e) {
    if (!isDrawing) return;
    isDrawing = false;
    finishStroke();
  });

  // Note: mouseleave already handled above with brush cursor logic

  // ===== Touch events =====
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    isDrawing = true;
    currentStrokeRects = [];
    currentStrokeBlurRegions = [];
    var pos = getCanvasPos(e);
    applyEffect(pos.x, pos.y);
  }, { passive: false });

  canvas.addEventListener('touchmove', function (e) {
    if (!isDrawing) return;
    e.preventDefault();
    var pos = getCanvasPos(e);
    scheduleApply(pos);
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    if (!isDrawing) return;
    isDrawing = false;
    finishStroke();
  });

  // ===== Undo =====
  undoBtn.addEventListener('click', function () {
    if (history.length > 1) {
      history.pop();
      if (strokeRecords.length > 0) {
        strokeRecords.pop();
      }
      var prev = history[history.length - 1];
      ctx.putImageData(prev, 0, 0);
      updateStrokeCount();
    }
  });

  // ===== Clear =====
  clearBtn.addEventListener('click', function () {
    if (!originalImage) return;
    var img = originalImage.img;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    history = [];
    strokeRecords = [];
    currentStrokeRects = [];
    currentStrokeBlurRegions = [];
    updateStrokeCount();
    pushHistory();
  });

  // ===== Save (full resolution) =====
  saveBtn.addEventListener('click', function () {
    if (!originalImage) return;

    var img = originalImage.img;
    var fullW = img.naturalWidth;
    var fullH = img.naturalHeight;

    var fullCanvas = document.createElement('canvas');
    fullCanvas.width = fullW;
    fullCanvas.height = fullH;
    var fullCtx = fullCanvas.getContext('2d');
    fullCtx.drawImage(img, 0, 0, fullW, fullH);

    // Re-apply all strokes at full resolution
    for (var s = 0; s < strokeRecords.length; s++) {
      var stroke = strokeRecords[s];

      if (stroke.mode === 'blur') {
        // Re-apply blur regions at full res
        reapplyBlurFullRes(fullCtx, fullW, fullH, stroke);
      } else {
        // Re-apply mosaic at full res
        reapplyMosaicFullRes(fullCtx, fullW, fullH, stroke);
      }
    }

    fullCanvas.toBlob(function (blob) {
      if (!blob) {
        alert('画像の保存に失敗しました。');
        return;
      }
      var baseName = originalImage.name.replace(/\.[^.]+$/, '');
      var suffix = '_' + getMode();
      downloadBlob(blob, baseName + suffix + '.png');
    }, 'image/png');
  });

  // ===== Full-res mosaic re-application =====
  function reapplyMosaicFullRes(fullCtx, fullW, fullH, stroke) {
    var fullData = fullCtx.getImageData(0, 0, fullW, fullH);
    var data = fullData.data;
    var blockSize = stroke.intensity;
    var processedBlocks = {};

    for (var r = 0; r < stroke.rects.length; r++) {
      var rect = stroke.rects[r];
      var bx = Math.max(0, Math.floor(rect.x / blockSize) * blockSize);
      var by = Math.max(0, Math.floor(rect.y / blockSize) * blockSize);
      var bw = Math.ceil(rect.w);
      var bh = Math.ceil(rect.h);

      for (var y = by; y < by + bh && y < fullH; y += blockSize) {
        for (var x = bx; x < bx + bw && x < fullW; x += blockSize) {
          var key = x + ',' + y;
          if (processedBlocks[key]) continue;
          processedBlocks[key] = true;

          var blockRight = Math.min(x + blockSize, fullW);
          var blockBottom = Math.min(y + blockSize, fullH);

          var sumR = 0, sumG = 0, sumB = 0, sumA = 0;
          var count = 0;
          for (var py = Math.floor(y); py < blockBottom; py++) {
            for (var px = Math.floor(x); px < blockRight; px++) {
              var idx = (py * fullW + px) * 4;
              sumR += data[idx];
              sumG += data[idx + 1];
              sumB += data[idx + 2];
              sumA += data[idx + 3];
              count++;
            }
          }

          if (count === 0) continue;

          var avgR = Math.round(sumR / count);
          var avgG = Math.round(sumG / count);
          var avgB = Math.round(sumB / count);
          var avgA = Math.round(sumA / count);

          for (var py = Math.floor(y); py < blockBottom; py++) {
            for (var px = Math.floor(x); px < blockRight; px++) {
              var idx = (py * fullW + px) * 4;
              data[idx] = avgR;
              data[idx + 1] = avgG;
              data[idx + 2] = avgB;
              data[idx + 3] = avgA;
            }
          }
        }
      }
    }

    fullCtx.putImageData(fullData, 0, 0);
  }

  // ===== Full-res blur re-application =====
  function reapplyBlurFullRes(fullCtx, fullW, fullH, stroke) {
    var regions = stroke.blurRegions;
    if (!regions || regions.length === 0) return;

    // Merge all blur regions into one bounding box for efficiency
    var minX = fullW, minY = fullH, maxX = 0, maxY = 0;
    for (var i = 0; i < regions.length; i++) {
      var reg = regions[i];
      var r = reg.radius + reg.blurRadius;
      minX = Math.min(minX, Math.floor(reg.cx - r));
      minY = Math.min(minY, Math.floor(reg.cy - r));
      maxX = Math.max(maxX, Math.ceil(reg.cx + r));
      maxY = Math.max(maxY, Math.ceil(reg.cy + r));
    }
    minX = Math.max(0, minX);
    minY = Math.max(0, minY);
    maxX = Math.min(fullW, maxX);
    maxY = Math.min(fullH, maxY);

    var regionW = maxX - minX;
    var regionH = maxY - minY;
    if (regionW <= 0 || regionH <= 0) return;

    var imageData = fullCtx.getImageData(minX, minY, regionW, regionH);
    var data = imageData.data;

    // Build composite mask from all blur circles
    var mask = new Uint8Array(regionW * regionH);
    for (var i = 0; i < regions.length; i++) {
      var reg = regions[i];
      var rSq = reg.radius * reg.radius;
      // Compute local bounding box for this circle
      var localLeft = Math.max(0, Math.floor(reg.cx - reg.radius - minX));
      var localTop = Math.max(0, Math.floor(reg.cy - reg.radius - minY));
      var localRight = Math.min(regionW, Math.ceil(reg.cx + reg.radius - minX));
      var localBottom = Math.min(regionH, Math.ceil(reg.cy + reg.radius - minY));
      for (var y = localTop; y < localBottom; y++) {
        for (var x = localLeft; x < localRight; x++) {
          var dx = (minX + x) - reg.cx;
          var dy = (minY + y) - reg.cy;
          if (dx * dx + dy * dy <= rSq) {
            mask[y * regionW + x] = 1;
          }
        }
      }
    }

    // Use a representative blurRadius (average from regions)
    var totalBlurR = 0;
    for (var i = 0; i < regions.length; i++) totalBlurR += regions[i].blurRadius;
    var avgBlurR = Math.max(1, Math.round(totalBlurR / regions.length));

    // 3-pass box blur
    var passes = 3;
    var passRadius = Math.max(1, Math.floor(avgBlurR / passes));

    for (var pass = 0; pass < passes; pass++) {
      var copy = new Uint8ClampedArray(data);

      for (var y = 0; y < regionH; y++) {
        for (var x = 0; x < regionW; x++) {
          if (!mask[y * regionW + x]) continue;

          var sumR = 0, sumG = 0, sumB = 0, sumA = 0, count = 0;
          var yStart = Math.max(0, y - passRadius);
          var yEnd = Math.min(regionH - 1, y + passRadius);
          var xStart = Math.max(0, x - passRadius);
          var xEnd = Math.min(regionW - 1, x + passRadius);

          for (var sy = yStart; sy <= yEnd; sy++) {
            for (var sx = xStart; sx <= xEnd; sx++) {
              var si = (sy * regionW + sx) * 4;
              sumR += copy[si];
              sumG += copy[si + 1];
              sumB += copy[si + 2];
              sumA += copy[si + 3];
              count++;
            }
          }

          var di = (y * regionW + x) * 4;
          data[di] = Math.round(sumR / count);
          data[di + 1] = Math.round(sumG / count);
          data[di + 2] = Math.round(sumB / count);
          data[di + 3] = Math.round(sumA / count);
        }
      }
    }

    fullCtx.putImageData(imageData, minX, minY);
  }

  // ===== Reset =====
  resetBtn.addEventListener('click', function () {
    originalImage = null;
    history = [];
    strokeRecords = [];
    currentStrokeRects = [];
    currentStrokeBlurRegions = [];
    isDrawing = false;
    updateStrokeCount();
    ui.style.display = 'none';
    dropArea.style.display = '';
  });
})();
