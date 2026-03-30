(function () {
  var dropArea = document.getElementById('irsz-drop-area');
  var optionsDiv = document.getElementById('irsz-options');
  var modeSelect = document.getElementById('irsz-mode');
  var pxInputs = document.getElementById('irsz-px-inputs');
  var pctInput = document.getElementById('irsz-pct-input');
  var widthInput = document.getElementById('irsz-width');
  var heightInput = document.getElementById('irsz-height');
  var percentInput = document.getElementById('irsz-percent');
  var aspectCheckbox = document.getElementById('irsz-aspect');
  var presetSelect = document.getElementById('irsz-preset');
  var fileListDiv = document.getElementById('irsz-file-list');
  var addMoreBtn = document.getElementById('irsz-add-more');
  var addMoreInput = document.getElementById('irsz-add-input');
  var resizeBtn = document.getElementById('irsz-btn');
  var progressDiv = document.getElementById('irsz-progress');

  // Each entry: { file, name, img, width, height }
  var images = [];
  var aspectRatio = 1; // width / height of first image
  var updatingAspect = false; // guard against recursive updates
  var previewDebounceTimer = null;

  // --- Create preview element ---
  var previewContainer = document.createElement('div');
  previewContainer.id = 'irsz-preview-container';
  previewContainer.style.cssText = 'margin-top:8px;text-align:center;display:none;';
  var previewLabel = document.createElement('p');
  previewLabel.style.cssText = 'font-size:.8rem;color:#888;margin:0 0 4px 0;';
  previewLabel.textContent = '\u30D7\u30EC\u30D3\u30E5\u30FC';
  var previewCanvas = document.createElement('canvas');
  previewCanvas.style.cssText = 'max-width:200px;max-height:200px;border:1px solid #ddd;border-radius:6px;background:#fafafa;';
  previewContainer.appendChild(previewLabel);
  previewContainer.appendChild(previewCanvas);

  // Insert preview after options div, before file list
  // We insert it after the .options row, before the file list
  var optionsRow = optionsDiv ? optionsDiv.querySelector('.options') : null;
  if (optionsRow && optionsRow.nextSibling) {
    optionsRow.parentNode.insertBefore(previewContainer, optionsRow.nextSibling);
  } else if (fileListDiv) {
    fileListDiv.parentNode.insertBefore(previewContainer, fileListDiv);
  }

  // --- Setup drop & add-more ---

  setupDropArea('irsz-drop-area', 'irsz-file-input', function (files) {
    addImages(files.filter(function (f) { return f.type.startsWith('image/'); }));
  });

  addMoreBtn.addEventListener('click', function () { addMoreInput.click(); });
  addMoreInput.addEventListener('change', function () {
    addImages(Array.from(addMoreInput.files).filter(function (f) { return f.type.startsWith('image/'); }));
    addMoreInput.value = '';
  });

  // --- Add images ---

  async function addImages(files) {
    for (var idx = 0; idx < files.length; idx++) {
      var file = files[idx];
      try {
        var loaded = await loadImageFile(file);
        images.push({
          file: file,
          name: loaded.name,
          img: loaded.img,
          width: loaded.width,
          height: loaded.height
        });
      } catch (e) {
        alert('"' + file.name + '" \u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002');
      }
    }
    if (images.length) {
      // Set aspect ratio from first image
      aspectRatio = images[0].width / images[0].height;

      // Auto-fill width/height if in pixels mode and fields are empty
      if (modeSelect.value === 'pixels' && !widthInput.value && !heightInput.value) {
        widthInput.value = images[0].width;
        heightInput.value = images[0].height;
      }
    }
    renderList();
    schedulePreviewUpdate();
  }

  // --- Mode switching ---

  modeSelect.addEventListener('change', function () {
    var mode = modeSelect.value;
    pxInputs.style.display = mode === 'pixels' ? '' : 'none';
    pctInput.style.display = mode === 'percent' ? '' : 'none';
    schedulePreviewUpdate();
  });

  // --- Preset support ---

  if (presetSelect) {
    presetSelect.addEventListener('change', function () {
      var val = presetSelect.value;
      if (!val) return; // "custom" selected
      var parts = val.split(',');
      if (parts.length === 2) {
        var pw = parseInt(parts[0]);
        var ph = parseInt(parts[1]);
        if (pw > 0 && ph > 0) {
          widthInput.value = pw;
          heightInput.value = ph;
          modeSelect.value = 'pixels';
          pxInputs.style.display = '';
          pctInput.style.display = 'none';
          // Update aspect ratio based on preset (don't lock to original image ratio)
          aspectRatio = pw / ph;
          schedulePreviewUpdate();
          renderList();
        }
      }
    });
  }

  // --- Aspect ratio lock ---

  widthInput.addEventListener('input', function () {
    resetPresetOnManualEdit();
    if (!aspectCheckbox.checked || updatingAspect) return;
    updatingAspect = true;
    var w = parseInt(widthInput.value);
    if (w > 0 && aspectRatio > 0) {
      heightInput.value = Math.round(w / aspectRatio);
    }
    updatingAspect = false;
    schedulePreviewUpdate();
    renderList();
  });

  heightInput.addEventListener('input', function () {
    resetPresetOnManualEdit();
    if (!aspectCheckbox.checked || updatingAspect) return;
    updatingAspect = true;
    var h = parseInt(heightInput.value);
    if (h > 0 && aspectRatio > 0) {
      widthInput.value = Math.round(h * aspectRatio);
    }
    updatingAspect = false;
    schedulePreviewUpdate();
    renderList();
  });

  percentInput.addEventListener('input', function () {
    resetPresetOnManualEdit();
    schedulePreviewUpdate();
    renderList();
  });

  aspectCheckbox.addEventListener('change', function () {
    if (aspectCheckbox.checked && images.length) {
      aspectRatio = images[0].width / images[0].height;
      // Recalculate height based on current width
      var w = parseInt(widthInput.value);
      if (w > 0) {
        heightInput.value = Math.round(w / aspectRatio);
      }
    }
    schedulePreviewUpdate();
    renderList();
  });

  function resetPresetOnManualEdit() {
    if (presetSelect) presetSelect.value = '';
  }

  // --- Preview ---

  function schedulePreviewUpdate() {
    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(updatePreview, 300);
  }

  function updatePreview() {
    if (!images.length) {
      previewContainer.style.display = 'none';
      return;
    }

    var entry = images[0];
    var target = computeTargetSize(entry);
    if (target.w <= 0 || target.h <= 0) {
      previewContainer.style.display = 'none';
      return;
    }

    // Compute preview dimensions (fit within 200x200)
    var maxPreview = 200;
    var scale = Math.min(maxPreview / target.w, maxPreview / target.h, 1);
    var previewW = Math.round(target.w * scale);
    var previewH = Math.round(target.h * scale);

    previewCanvas.width = previewW;
    previewCanvas.height = previewH;
    var ctx = previewCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, previewW, previewH);
    ctx.drawImage(entry.img, 0, 0, previewW, previewH);

    previewLabel.textContent = '\u30D7\u30EC\u30D3\u30E5\u30FC (' + target.w + 'x' + target.h + ')';
    previewContainer.style.display = '';
  }

  // --- File list rendering ---

  function renderList() {
    fileListDiv.innerHTML = '';
    if (!images.length) {
      optionsDiv.style.display = 'none';
      dropArea.style.display = '';
      previewContainer.style.display = 'none';
      return;
    }
    dropArea.style.display = 'none';
    optionsDiv.style.display = '';

    images.forEach(function (item, i) {
      var div = document.createElement('div');
      div.className = 'file-item';
      div.draggable = true;

      // Calculate target dimensions for display
      var target = computeTargetSize(item);
      var originalDims = item.width + 'x' + item.height;
      var targetDims = target.w + 'x' + target.h;
      var dimsChanged = (target.w !== item.width || target.h !== item.height);
      var dimsHtml = dimsChanged
        ? originalDims + ' <span style="color:#888;">\u2192</span> <span style="color:#27ae60;font-weight:600;">' + targetDims + '</span>'
        : originalDims;

      div.innerHTML =
        '<span class="drag-handle">&#9776;</span>' +
        '<span class="file-name">' + escapeHtml(item.name) + '</span>' +
        '<span class="file-pages">' + dimsHtml + '</span>' +
        '<button class="remove-btn">&times;</button>';

      // Drag-to-reorder
      div.addEventListener('dragstart', function (e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', i);
        div.classList.add('dragging');
      });
      div.addEventListener('dragend', function () { div.classList.remove('dragging'); });
      div.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      div.addEventListener('drop', (function (idx) {
        return function (e) {
          e.preventDefault();
          e.stopPropagation();
          var from = parseInt(e.dataTransfer.getData('text/plain'));
          if (isNaN(from) || from === idx) return;
          var moved = images.splice(from, 1)[0];
          images.splice(idx, 0, moved);
          renderList();
        };
      })(i));

      // Remove button
      div.querySelector('.remove-btn').addEventListener('click', (function (idx) {
        return function (e) {
          e.stopPropagation();
          images.splice(idx, 1);
          if (images.length) {
            aspectRatio = images[0].width / images[0].height;
          }
          renderList();
          schedulePreviewUpdate();
        };
      })(i));

      fileListDiv.appendChild(div);
    });
  }

  // --- Output format detection (preserve input format) ---

  function getOutputFormat(file) {
    var type = file.type.toLowerCase();
    if (type === 'image/jpeg' || type === 'image/jpg') return { mime: 'image/jpeg', ext: '.jpg' };
    if (type === 'image/webp') return { mime: 'image/webp', ext: '.webp' };
    if (type === 'image/png') return { mime: 'image/png', ext: '.png' };
    if (type === 'image/gif') return { mime: 'image/png', ext: '.png' }; // GIF -> PNG (preserves transparency)
    if (type === 'image/bmp') return { mime: 'image/png', ext: '.png' };
    // Default: preserve as PNG for quality
    return { mime: 'image/png', ext: '.png' };
  }

  function replaceExtension(filename, newExt) {
    var dotIdx = filename.lastIndexOf('.');
    var base = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
    return base + newExt;
  }

  // --- Resize logic ---

  function computeTargetSize(entry) {
    var mode = modeSelect.value;
    if (mode === 'percent') {
      var pct = parseFloat(percentInput.value) || 100;
      return {
        w: Math.max(1, Math.round(entry.width * pct / 100)),
        h: Math.max(1, Math.round(entry.height * pct / 100))
      };
    }
    // pixels mode
    var tw = parseInt(widthInput.value);
    var th = parseInt(heightInput.value);
    if (!tw || tw <= 0) tw = entry.width;
    if (!th || th <= 0) th = entry.height;
    return { w: tw, h: th };
  }

  function resizeImage(entry, targetW, targetH) {
    return new Promise(function (resolve, reject) {
      var canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      var ctx = canvas.getContext('2d');

      // High-quality resize
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      var format = getOutputFormat(entry.file);

      // For JPEG output: fill white background (no transparency support)
      if (format.mime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
      }

      ctx.drawImage(entry.img, 0, 0, targetW, targetH);

      // Use quality 0.92 for JPEG/WebP for good quality-to-size ratio
      var quality = (format.mime === 'image/jpeg' || format.mime === 'image/webp') ? 0.92 : undefined;

      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('\u30EA\u30B5\u30A4\u30BA\u306B\u5931\u6557\u3057\u307E\u3057\u305F')); return; }
        resolve({ blob: blob, format: format });
      }, format.mime, quality);
    });
  }

  // --- Utilities ---

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Button click handler ---

  resizeBtn.addEventListener('click', async function () {
    if (!images.length) return;
    resizeBtn.disabled = true;
    addMoreBtn.disabled = true;
    progressDiv.style.display = 'block';

    try {
      var results = [];

      for (var i = 0; i < images.length; i++) {
        setProgress('irsz-progress-fill', 'irsz-progress-text',
          ((i + 1) / images.length) * 90,
          '\u30EA\u30B5\u30A4\u30BA\u4E2D... ' + (i + 1) + ' / ' + images.length);

        try {
          var target = computeTargetSize(images[i]);
          var result = await resizeImage(images[i], target.w, target.h);
          var outName = replaceExtension(images[i].name, '_resized' + result.format.ext);
          results.push({ blob: result.blob, name: outName });
        } catch (err) {
          console.warn('Skipping file due to error:', images[i].name, err);
          continue;
        }
      }

      if (!results.length) {
        setProgress('irsz-progress-fill', 'irsz-progress-text', 100,
          '\u30A8\u30E9\u30FC: \u3059\u3079\u3066\u306E\u30D5\u30A1\u30A4\u30EB\u306E\u30EA\u30B5\u30A4\u30BA\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
        return;
      }

      setProgress('irsz-progress-fill', 'irsz-progress-text', 95, '\u4FDD\u5B58\u4E2D...');

      if (results.length === 1) {
        downloadBlob(results[0].blob, results[0].name);
      } else {
        var zip = new JSZip();
        for (var j = 0; j < results.length; j++) {
          zip.file(results[j].name, results[j].blob);
        }
        var zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, 'resized_images.zip');
      }

      setProgress('irsz-progress-fill', 'irsz-progress-text', 100, '\u5B8C\u4E86!');
    } catch (err) {
      setProgress('irsz-progress-fill', 'irsz-progress-text', 100, '\u30A8\u30E9\u30FC: ' + err.message);
    } finally {
      resizeBtn.disabled = false;
      addMoreBtn.disabled = false;
    }
  });
})();
