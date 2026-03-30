(function () {
  // ===== DOM References =====
  var dropArea = document.getElementById('bgr-drop-area');
  var ui = document.getElementById('bgr-ui');
  var toleranceSlider = document.getElementById('bgr-tolerance');
  var toleranceValue = document.getElementById('bgr-tolerance-value');
  var canvasWrapper = document.getElementById('bgr-canvas-wrapper');
  var canvas = document.getElementById('bgr-canvas');
  var ctx = canvas.getContext('2d');
  var undoBtn = document.getElementById('bgr-undo-btn');
  var downloadBtn = document.getElementById('bgr-btn');
  var resetBtn = document.getElementById('bgr-reset-btn');
  var progressDiv = document.getElementById('bgr-progress');
  var optionsDiv = ui ? ui.querySelector('.options') : null;
  var actionRow = ui ? ui.querySelector('.action-row') : null;

  // ===== State =====
  var originalImage = null; // { img, dataUrl, name, width, height }
  var displayScale = 1;     // ratio: display / original
  var history = [];          // ImageData snapshots (max 10)
  var zoomLevel = 1;         // current zoom multiplier for display
  var MIN_ZOOM = 0.5;
  var MAX_ZOOM = 4;
  var ZOOM_STEP = 0.25;

  // ===== Dynamically add non-contiguous mode toggle =====
  var modeLabel = document.createElement('label');
  modeLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:600;font-size:.88rem;cursor:pointer;';
  var modeCheckbox = document.createElement('input');
  modeCheckbox.type = 'checkbox';
  modeCheckbox.id = 'bgr-mode-all';
  modeCheckbox.style.cssText = 'width:16px;height:16px;accent-color:#4a6cf7;cursor:pointer;';
  modeLabel.appendChild(modeCheckbox);
  modeLabel.appendChild(document.createTextNode('\u5168\u9818\u57DF\uFF08\u975E\u9023\u7D9A\uFF09'));
  if (optionsDiv) {
    optionsDiv.appendChild(modeLabel);
  }

  // ===== Dynamically add zoom buttons =====
  var zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'btn secondary';
  zoomInBtn.textContent = '\u25CB + \u30BA\u30FC\u30E0\u30A4\u30F3';
  zoomInBtn.style.cssText = 'font-size:.82rem;padding:6px 10px;';

  var zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'btn secondary';
  zoomOutBtn.textContent = '\u25CB \u2212 \u30BA\u30FC\u30E0\u30A2\u30A6\u30C8';
  zoomOutBtn.style.cssText = 'font-size:.82rem;padding:6px 10px;';

  var zoomResetBtn = document.createElement('button');
  zoomResetBtn.className = 'btn secondary';
  zoomResetBtn.textContent = '\u7B49\u500D';
  zoomResetBtn.style.cssText = 'font-size:.82rem;padding:6px 10px;';

  var zoomInfo = document.createElement('span');
  zoomInfo.style.cssText = 'font-size:.82rem;color:#666;font-weight:600;min-width:40px;text-align:center;';
  zoomInfo.textContent = '100%';

  if (actionRow) {
    actionRow.appendChild(zoomOutBtn);
    actionRow.appendChild(zoomInfo);
    actionRow.appendChild(zoomInBtn);
    actionRow.appendChild(zoomResetBtn);
  }

  // ===== Dynamically add status info div =====
  var statusDiv = document.createElement('div');
  statusDiv.className = 'info-text';
  statusDiv.id = 'bgr-status';
  statusDiv.style.cssText = 'margin:6px 0;font-size:.85rem;color:#666;min-height:1.2em;';
  if (canvasWrapper && canvasWrapper.parentNode) {
    canvasWrapper.parentNode.insertBefore(statusDiv, canvasWrapper.nextSibling);
  }

  // ===== Cursor color picker indicator =====
  var colorIndicator = document.createElement('div');
  colorIndicator.style.cssText = 'position:fixed;width:24px;height:24px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4);pointer-events:none;display:none;z-index:9999;transform:translate(12px,-12px);';
  document.body.appendChild(colorIndicator);

  // ===== File upload =====
  setupDropArea('bgr-drop-area', 'bgr-file-input', function (files) {
    var imgFile = files.find(function (f) { return f.type.startsWith('image/'); });
    if (imgFile) loadImage(imgFile);
  });

  async function loadImage(file) {
    try {
      originalImage = await loadImageFile(file);
      dropArea.style.display = 'none';
      ui.style.display = '';
      progressDiv.style.display = 'none';
      statusDiv.textContent = '';

      var img = originalImage.img;

      // BUG FIX: safety check for displayScale calculation
      if (!img.naturalWidth || !img.naturalHeight) {
        alert('\u753B\u50CF\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002');
        return;
      }

      // Scale to max 800px for display
      var maxDim = 800;
      displayScale = Math.min(1, maxDim / img.naturalWidth, maxDim / img.naturalHeight);
      zoomLevel = 1;
      updateZoomDisplay();

      var w = Math.round(img.naturalWidth * displayScale);
      var h = Math.round(img.naturalHeight * displayScale);

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      // Store initial state
      history = [];
      pushHistory();
    } catch (err) {
      alert('"' + file.name + '" \u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002');
    }
  }

  // ===== Tolerance display =====
  toleranceSlider.addEventListener('input', function () {
    toleranceValue.textContent = toleranceSlider.value;
  });

  // ===== History management =====
  function pushHistory() {
    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    history.push(imageData);
    if (history.length > 10) {
      history.shift();
    }
  }

  // ===== Undo =====
  undoBtn.addEventListener('click', function () {
    if (history.length > 1) {
      history.pop(); // Remove current state
      var prev = history[history.length - 1];
      ctx.putImageData(prev, 0, 0);
    }
  });

  // ===== Cursor color picker on mousemove =====
  canvas.addEventListener('mousemove', function (e) {
    if (!originalImage) {
      colorIndicator.style.display = 'none';
      return;
    }

    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var x = Math.floor((e.clientX - rect.left) * scaleX);
    var y = Math.floor((e.clientY - rect.top) * scaleY);

    // Clamp
    x = Math.max(0, Math.min(x, canvas.width - 1));
    y = Math.max(0, Math.min(y, canvas.height - 1));

    var pixel = ctx.getImageData(x, y, 1, 1).data;
    var r = pixel[0], g = pixel[1], b = pixel[2], a = pixel[3];

    colorIndicator.style.display = 'block';
    colorIndicator.style.left = e.clientX + 'px';
    colorIndicator.style.top = e.clientY + 'px';

    if (a === 0) {
      // Transparent: show checkerboard-like pattern via gradient
      colorIndicator.style.background = 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50%/8px 8px';
    } else {
      colorIndicator.style.background = 'rgb(' + r + ',' + g + ',' + b + ')';
    }
  });

  canvas.addEventListener('mouseleave', function () {
    colorIndicator.style.display = 'none';
  });

  // ===== Click on canvas to remove background =====
  canvas.addEventListener('click', function (e) {
    if (!originalImage) return;

    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var x = Math.floor((e.clientX - rect.left) * scaleX);
    var y = Math.floor((e.clientY - rect.top) * scaleY);

    // Clamp to canvas bounds
    x = Math.max(0, Math.min(x, canvas.width - 1));
    y = Math.max(0, Math.min(y, canvas.height - 1));

    var tolerance = parseInt(toleranceSlider.value);
    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var isNonContiguous = modeCheckbox.checked;

    // Get clicked color for status display
    var clickIdx = (y * imageData.width + x) * 4;
    var clickR = imageData.data[clickIdx];
    var clickG = imageData.data[clickIdx + 1];
    var clickB = imageData.data[clickIdx + 2];

    progressDiv.style.display = 'block';
    setProgress('bgr-progress-fill', 'bgr-progress-text', 30, '\u80CC\u666F\u3092\u524A\u9664\u4E2D...');

    // Use setTimeout to allow the UI to update
    setTimeout(function () {
      var removedCount;

      if (isNonContiguous) {
        removedCount = globalColorRemove(imageData, x, y, tolerance);
      } else {
        removedCount = floodFillRemove(imageData, x, y, tolerance);
      }

      // Apply edge feathering for smoother cutout
      applyEdgeFeather(imageData, 3);

      ctx.putImageData(imageData, 0, 0);
      pushHistory();

      setProgress('bgr-progress-fill', 'bgr-progress-text', 100, '\u5B8C\u4E86!');
      statusDiv.textContent = '\u30AF\u30EA\u30C3\u30AF\u3057\u305F\u8272: rgb(' + clickR + ',' + clickG + ',' + clickB + ') | \u524A\u9664\u3057\u305F\u30D4\u30AF\u30BB\u30EB: ' + removedCount.toLocaleString();
    }, 10);
  });

  // ===== Flood fill remove (contiguous) =====
  function floodFillRemove(imageData, startX, startY, tolerance) {
    var data = imageData.data;
    var w = imageData.width;
    var h = imageData.height;
    var removedCount = 0;

    // Get target color at start point
    var idx = (startY * w + startX) * 4;
    var targetR = data[idx];
    var targetG = data[idx + 1];
    var targetB = data[idx + 2];

    // If the pixel is already transparent, do nothing
    if (data[idx + 3] === 0) return 0;

    // Visited array
    var visited = new Uint8Array(w * h);

    // BFS queue
    var queue = [];
    queue.push(startX + startY * w);
    visited[startX + startY * w] = 1;

    while (queue.length > 0) {
      var pos = queue.shift();
      var px = pos % w;
      var py = (pos - px) / w;
      var pi = pos * 4;

      // Check color distance
      var dr = data[pi] - targetR;
      var dg = data[pi + 1] - targetG;
      var db = data[pi + 2] - targetB;
      var dist = Math.sqrt(dr * dr + dg * dg + db * db);

      if (dist <= tolerance && data[pi + 3] > 0) {
        // Set alpha to 0 (make transparent)
        data[pi + 3] = 0;
        removedCount++;

        // Add neighbors (4-directional)
        var neighbors = [
          [px - 1, py],
          [px + 1, py],
          [px, py - 1],
          [px, py + 1]
        ];

        for (var i = 0; i < neighbors.length; i++) {
          var nx = neighbors[i][0];
          var ny = neighbors[i][1];
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            var npos = nx + ny * w;
            if (!visited[npos]) {
              visited[npos] = 1;
              queue.push(npos);
            }
          }
        }
      }
    }

    return removedCount;
  }

  // ===== Global color remove (non-contiguous) =====
  function globalColorRemove(imageData, startX, startY, tolerance) {
    var data = imageData.data;
    var w = imageData.width;
    var h = imageData.height;
    var removedCount = 0;

    // Get target color at start point
    var idx = (startY * w + startX) * 4;
    var targetR = data[idx];
    var targetG = data[idx + 1];
    var targetB = data[idx + 2];

    // If the pixel is already transparent, do nothing
    if (data[idx + 3] === 0) return 0;

    var totalPixels = w * h;
    for (var i = 0; i < totalPixels; i++) {
      var pi = i * 4;
      if (data[pi + 3] === 0) continue; // already transparent

      var dr = data[pi] - targetR;
      var dg = data[pi + 1] - targetG;
      var db = data[pi + 2] - targetB;
      var dist = Math.sqrt(dr * dr + dg * dg + db * db);

      if (dist <= tolerance) {
        data[pi + 3] = 0;
        removedCount++;
      }
    }

    return removedCount;
  }

  // ===== Edge feathering =====
  // Find edge pixels (transparent next to non-transparent) and apply
  // a Gaussian-like alpha falloff for smoother edges.
  function applyEdgeFeather(imageData, radius) {
    var data = imageData.data;
    var w = imageData.width;
    var h = imageData.height;

    // Step 1: Build a distance map from transparent edges
    // Find all pixels that are at the boundary (non-transparent pixel adjacent to transparent)
    // Then compute distance from each non-transparent pixel to the nearest transparent pixel
    // For pixels within radius, reduce alpha proportionally.

    // First, mark edge pixels: non-transparent pixels that have at least one transparent neighbor
    var edgeMap = new Float32Array(w * h); // 0 = not edge/far, >0 = distance to nearest transparent
    // Initialize: Infinity for non-transparent, 0 for transparent
    for (var i = 0; i < w * h; i++) {
      edgeMap[i] = (data[i * 4 + 3] > 0) ? 999 : 0;
    }

    // Simple distance transform (two-pass): compute distance to nearest zero (transparent)
    // Forward pass
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;
        if (edgeMap[idx] === 0) continue;
        var top = (y > 0) ? edgeMap[(y - 1) * w + x] + 1 : 999;
        var left = (x > 0) ? edgeMap[y * w + (x - 1)] + 1 : 999;
        edgeMap[idx] = Math.min(edgeMap[idx], top, left);
      }
    }
    // Backward pass
    for (var y = h - 1; y >= 0; y--) {
      for (var x = w - 1; x >= 0; x--) {
        var idx = y * w + x;
        if (edgeMap[idx] === 0) continue;
        var bottom = (y < h - 1) ? edgeMap[(y + 1) * w + x] + 1 : 999;
        var right = (x < w - 1) ? edgeMap[y * w + (x + 1)] + 1 : 999;
        edgeMap[idx] = Math.min(edgeMap[idx], bottom, right);
      }
    }

    // Apply feathering: for non-transparent pixels within `radius` of a transparent pixel,
    // reduce alpha with a smooth falloff
    for (var i = 0; i < w * h; i++) {
      var dist = edgeMap[i];
      if (dist > 0 && dist <= radius) {
        var pi = i * 4;
        // Smooth step: 0 at edge, 1 at radius
        var t = dist / (radius + 1);
        // Apply smooth cubic interpolation for natural falloff
        var alpha = t * t * (3 - 2 * t);
        data[pi + 3] = Math.round(data[pi + 3] * alpha);
      }
    }
  }

  // ===== Zoom support =====
  function updateZoomDisplay() {
    var pct = Math.round(zoomLevel * 100);
    zoomInfo.textContent = pct + '%';
    canvas.style.transform = 'scale(' + zoomLevel + ')';
    canvas.style.transformOrigin = 'top left';
    // Adjust wrapper size to fit zoomed canvas
    if (canvasWrapper) {
      canvasWrapper.style.overflow = 'auto';
    }
  }

  zoomInBtn.addEventListener('click', function () {
    if (zoomLevel < MAX_ZOOM) {
      zoomLevel = Math.min(MAX_ZOOM, zoomLevel + ZOOM_STEP);
      updateZoomDisplay();
    }
  });

  zoomOutBtn.addEventListener('click', function () {
    if (zoomLevel > MIN_ZOOM) {
      zoomLevel = Math.max(MIN_ZOOM, zoomLevel - ZOOM_STEP);
      updateZoomDisplay();
    }
  });

  zoomResetBtn.addEventListener('click', function () {
    zoomLevel = 1;
    updateZoomDisplay();
  });

  // ===== Download (full resolution) =====
  downloadBtn.addEventListener('click', function () {
    if (!originalImage) return;

    progressDiv.style.display = 'block';
    setProgress('bgr-progress-fill', 'bgr-progress-text', 20, '\u30D5\u30EB\u30B5\u30A4\u30BA\u753B\u50CF\u3092\u751F\u6210\u4E2D...');

    setTimeout(function () {
      var img = originalImage.img;

      // Safety check
      if (!img.naturalWidth || !img.naturalHeight) {
        setProgress('bgr-progress-fill', 'bgr-progress-text', 100, '\u30A8\u30E9\u30FC: \u753B\u50CF\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002');
        return;
      }

      var fullW = img.naturalWidth;
      var fullH = img.naturalHeight;

      // Get current display canvas data (with transparency)
      var displayData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Create full-resolution canvas
      var fullCanvas = document.createElement('canvas');
      fullCanvas.width = fullW;
      fullCanvas.height = fullH;
      var fullCtx = fullCanvas.getContext('2d');
      fullCtx.drawImage(img, 0, 0, fullW, fullH);

      var fullData = fullCtx.getImageData(0, 0, fullW, fullH);

      // Build a transparency mask from the display canvas and scale it up
      var dw = canvas.width;
      var dh = canvas.height;

      for (var fy = 0; fy < fullH; fy++) {
        for (var fx = 0; fx < fullW; fx++) {
          // Map full-res coords to display coords
          var dx = Math.min(Math.floor(fx * displayScale), dw - 1);
          var dy = Math.min(Math.floor(fy * displayScale), dh - 1);
          var di = (dy * dw + dx) * 4;

          // If the display pixel is transparent (or partially), apply the same alpha
          var displayAlpha = displayData.data[di + 3];
          if (displayAlpha < 255) {
            var fi = (fy * fullW + fx) * 4;
            // Scale the full-res alpha by the display alpha ratio
            fullData.data[fi + 3] = Math.round(fullData.data[fi + 3] * (displayAlpha / 255));
          }
        }
      }

      fullCtx.putImageData(fullData, 0, 0);

      setProgress('bgr-progress-fill', 'bgr-progress-text', 80, '\u4FDD\u5B58\u4E2D...');

      fullCanvas.toBlob(function (blob) {
        if (!blob) {
          setProgress('bgr-progress-fill', 'bgr-progress-text', 100, '\u30A8\u30E9\u30FC: \u753B\u50CF\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002');
          return;
        }
        var baseName = originalImage.name.replace(/\.[^.]+$/, '');
        downloadBlob(blob, baseName + '_bg_removed.png');
        setProgress('bgr-progress-fill', 'bgr-progress-text', 100, '\u5B8C\u4E86!');
      }, 'image/png');
    }, 10);
  });

  // ===== Reset =====
  resetBtn.addEventListener('click', function () {
    originalImage = null;
    history = [];
    zoomLevel = 1;
    canvas.style.transform = '';
    if (canvasWrapper) canvasWrapper.style.overflow = '';
    statusDiv.textContent = '';
    colorIndicator.style.display = 'none';
    ui.style.display = 'none';
    dropArea.style.display = '';
    progressDiv.style.display = 'none';
    updateZoomDisplay();
  });
})();
