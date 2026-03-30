(function () {
  const dropArea = document.getElementById('icmp-drop-area');
  const optionsDiv = document.getElementById('icmp-options');
  const levelSelect = document.getElementById('icmp-level');
  const fileListDiv = document.getElementById('icmp-file-list');
  const addMoreBtn = document.getElementById('icmp-add-more');
  const addMoreInput = document.getElementById('icmp-add-input');
  const compressBtn = document.getElementById('icmp-btn');
  const progressDiv = document.getElementById('icmp-progress');

  // Each entry: { file, name, originalSize, img, width, height, compressedBlob, compressedSize, outputExt, error }
  let images = [];

  setupDropArea('icmp-drop-area', 'icmp-file-input', function (files) {
    addImages(files.filter(function (f) { return f.type.startsWith('image/'); }));
  });

  addMoreBtn.addEventListener('click', function () { addMoreInput.click(); });
  addMoreInput.addEventListener('change', function () {
    addImages(Array.from(addMoreInput.files).filter(function (f) { return f.type.startsWith('image/'); }));
    addMoreInput.value = '';
  });

  // Re-compress all images when quality level changes
  levelSelect.addEventListener('change', function () {
    if (images.length) autoCompressAll();
  });

  // --- Add images and auto-compress ---

  async function addImages(files) {
    for (const file of files) {
      try {
        const loaded = await loadImageFile(file);
        images.push({
          file: file,
          name: file.name,
          originalSize: file.size,
          img: loaded.img,
          width: loaded.width,
          height: loaded.height,
          compressedBlob: null,
          compressedSize: null,
          outputExt: null,
          error: false
        });
      } catch (e) {
        // Skip unreadable files silently, add as error entry
        images.push({
          file: file,
          name: file.name,
          originalSize: file.size,
          img: null,
          width: 0,
          height: 0,
          compressedBlob: null,
          compressedSize: null,
          outputExt: null,
          error: true
        });
      }
    }
    renderList();
    // Auto-compress in background
    autoCompressAll();
  }

  // --- Auto-compress all un-compressed images ---

  async function autoCompressAll() {
    var quality = parseFloat(levelSelect.value);
    for (var i = 0; i < images.length; i++) {
      var entry = images[i];
      if (entry.error) continue;
      try {
        var result = await smartCompress(entry, quality);
        entry.compressedBlob = result.blob;
        entry.compressedSize = result.blob.size;
        entry.outputExt = result.ext;
      } catch (e) {
        entry.compressedBlob = null;
        entry.compressedSize = null;
        entry.outputExt = null;
        entry.error = true;
      }
      renderList();
    }
  }

  // --- Smart format selection ---

  function smartCompress(entry, quality) {
    var type = entry.file.type.toLowerCase();

    if (type === 'image/jpeg' || type === 'image/jpg') {
      // JPEG input -> compress as JPEG
      return compressToFormat(entry, 'image/jpeg', '.jpg', quality);
    }

    if (type === 'image/webp') {
      // WebP input -> compress as WebP
      return compressToFormat(entry, 'image/webp', '.webp', quality);
    }

    if (type === 'image/png') {
      // PNG input -> try both PNG (canvas) and WebP, pick smaller result
      return compressPngSmart(entry, quality);
    }

    // Other formats (BMP, GIF, TIFF, etc.) -> compress as JPEG with white background
    return compressWithWhiteBg(entry, 'image/jpeg', '.jpg', quality);
  }

  function compressToFormat(entry, mime, ext, quality) {
    return new Promise(function (resolve, reject) {
      var canvas = document.createElement('canvas');
      canvas.width = entry.width;
      canvas.height = entry.height;
      var ctx = canvas.getContext('2d');

      // For JPEG: fill white background first (in case of transparency)
      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(entry.img, 0, 0);
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('compression failed')); return; }
        resolve({ blob: blob, ext: ext });
      }, mime, quality);
    });
  }

  function compressWithWhiteBg(entry, mime, ext, quality) {
    return new Promise(function (resolve, reject) {
      var canvas = document.createElement('canvas');
      canvas.width = entry.width;
      canvas.height = entry.height;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(entry.img, 0, 0);
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('compression failed')); return; }
        resolve({ blob: blob, ext: ext });
      }, mime, quality);
    });
  }

  async function compressPngSmart(entry, quality) {
    // Try PNG via canvas (lossless re-encode)
    var pngResult = await compressToFormat(entry, 'image/png', '.png', undefined);
    // Try WebP (lossy)
    var webpResult = await compressToFormat(entry, 'image/webp', '.webp', quality);

    // Pick the smaller one
    if (webpResult.blob.size < pngResult.blob.size) {
      return webpResult;
    }
    return pngResult;
  }

  // --- Formatting ---

  function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  function calcReduction(original, compressed) {
    if (original <= 0) return '0.0';
    return ((1 - compressed / original) * 100).toFixed(1);
  }

  // --- Render file list ---

  function renderList() {
    fileListDiv.innerHTML = '';
    if (!images.length) {
      optionsDiv.style.display = 'none';
      dropArea.style.display = '';
      removeSummary();
      return;
    }
    dropArea.style.display = 'none';
    optionsDiv.style.display = '';

    images.forEach(function (item, i) {
      var div = document.createElement('div');
      div.className = 'file-item';
      div.draggable = true;

      // Build size info
      var sizeHtml;
      if (item.error) {
        sizeHtml = '<span class="file-size" style="color:#e74c3c;">error</span>';
      } else if (item.compressedSize != null) {
        var reduction = calcReduction(item.originalSize, item.compressedSize);
        sizeHtml = '<span class="file-size">' + formatSize(item.originalSize) + '</span>'
          + ' <span style="color:#888;font-size:.85rem;">\u2192</span> '
          + '<span class="file-size reduced">' + formatSize(item.compressedSize)
          + ' (' + reduction + '% \u524A\u6E1B)</span>';
      } else {
        sizeHtml = '<span class="file-size">' + formatSize(item.originalSize) + '</span>'
          + ' <span style="color:#aaa;font-size:.8rem;">\u2026\u5727\u7E2E\u4E2D</span>';
      }

      div.innerHTML = '<span class="drag-handle">&#9776;</span>'
        + '<span class="file-name">' + escapeHtml(item.name) + '</span>'
        + '<span class="file-pages" style="display:flex;align-items:center;gap:4px;">' + sizeHtml + '</span>'
        + '<button class="remove-btn">&times;</button>';

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
          renderList();
        };
      })(i));

      fileListDiv.appendChild(div);
    });

    // Render total summary
    renderSummary();
  }

  // --- Total summary ---

  function renderSummary() {
    removeSummary();

    var totalOriginal = 0;
    var totalCompressed = 0;
    var allDone = true;
    var validCount = 0;

    for (var i = 0; i < images.length; i++) {
      if (images[i].error) continue;
      totalOriginal += images[i].originalSize;
      if (images[i].compressedSize != null) {
        totalCompressed += images[i].compressedSize;
        validCount++;
      } else {
        allDone = false;
      }
    }

    if (validCount === 0) return;

    var summaryDiv = document.createElement('div');
    summaryDiv.id = 'icmp-summary';
    summaryDiv.style.cssText = 'margin-top:8px;padding:10px 16px;background:#f0faf4;border:1px solid #c3e6cb;border-radius:8px;font-size:.9rem;display:flex;justify-content:space-between;align-items:center;';

    var reduction = calcReduction(totalOriginal, totalCompressed);
    var statusText = allDone ? '' : ' (\u5727\u7E2E\u4E2D\u2026)';

    summaryDiv.innerHTML = '<span>\u5408\u8A08: <strong>' + formatSize(totalOriginal) + '</strong> \u2192 <strong style="color:#27ae60;">'
      + formatSize(totalCompressed) + '</strong></span>'
      + '<span style="color:#27ae60;font-weight:600;">' + reduction + '% \u524A\u6E1B' + statusText + '</span>';

    fileListDiv.parentNode.insertBefore(summaryDiv, fileListDiv.nextSibling);
  }

  function removeSummary() {
    var existing = document.getElementById('icmp-summary');
    if (existing) existing.remove();
  }

  // --- Utilities ---

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function replaceExtension(filename, newExt) {
    var dotIdx = filename.lastIndexOf('.');
    var base = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
    return base + newExt;
  }

  // --- Download handler ---

  compressBtn.addEventListener('click', async function () {
    if (!images.length) return;

    // Filter out error entries
    var validImages = images.filter(function (e) { return !e.error; });
    if (!validImages.length) {
      alert('\u5727\u7E2E\u53EF\u80FD\u306A\u753B\u50CF\u304C\u3042\u308A\u307E\u305B\u3093\u3002');
      return;
    }

    compressBtn.disabled = true;
    addMoreBtn.disabled = true;
    progressDiv.style.display = 'block';

    try {
      var quality = parseFloat(levelSelect.value);
      var totalOriginal = 0;
      var totalCompressed = 0;
      var results = [];

      for (var i = 0; i < validImages.length; i++) {
        setProgress('icmp-progress-fill', 'icmp-progress-text',
          ((i + 1) / validImages.length) * 90,
          '\u5727\u7E2E\u4E2D... ' + (i + 1) + ' / ' + validImages.length);

        var entry = validImages[i];

        try {
          // Use already-compressed blob if available and quality matches
          var blob;
          var ext;
          if (entry.compressedBlob) {
            blob = entry.compressedBlob;
            ext = entry.outputExt;
          } else {
            var result = await smartCompress(entry, quality);
            blob = result.blob;
            ext = result.ext;
            entry.compressedBlob = blob;
            entry.compressedSize = blob.size;
            entry.outputExt = ext;
          }

          totalOriginal += entry.originalSize;
          totalCompressed += blob.size;

          var outName = replaceExtension(entry.name, '_compressed' + ext);
          results.push({ blob: blob, name: outName });
        } catch (err) {
          // Skip failed files, continue with others
          console.warn('Skipping file due to error:', entry.name, err);
          continue;
        }
      }

      if (!results.length) {
        setProgress('icmp-progress-fill', 'icmp-progress-text', 100,
          '\u30A8\u30E9\u30FC: \u3059\u3079\u3066\u306E\u30D5\u30A1\u30A4\u30EB\u306E\u5727\u7E2E\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
        return;
      }

      renderList();

      setProgress('icmp-progress-fill', 'icmp-progress-text', 95, '\u4FDD\u5B58\u4E2D...');

      // Download
      if (results.length === 1) {
        downloadBlob(results[0].blob, results[0].name);
      } else {
        var zip = new JSZip();
        for (var j = 0; j < results.length; j++) {
          zip.file(results[j].name, results[j].blob);
        }
        var zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, 'compressed_images.zip');
      }

      // Show results
      var origMB = (totalOriginal / (1024 * 1024)).toFixed(2);
      var newMB = (totalCompressed / (1024 * 1024)).toFixed(2);
      var reduction = totalOriginal > 0
        ? ((1 - totalCompressed / totalOriginal) * 100).toFixed(1)
        : '0.0';

      setProgress('icmp-progress-fill', 'icmp-progress-text', 100,
        '\u5B8C\u4E86! ' + origMB + ' MB \u2192 ' + newMB + ' MB (' + reduction + '% \u524A\u6E1B)');
    } catch (err) {
      setProgress('icmp-progress-fill', 'icmp-progress-text', 100, '\u30A8\u30E9\u30FC: ' + err.message);
    } finally {
      compressBtn.disabled = false;
      addMoreBtn.disabled = false;
    }
  });
})();
