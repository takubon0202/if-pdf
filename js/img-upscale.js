(function () {
  // ===== DOM References =====
  var dropArea      = document.getElementById('ups-drop-area');
  var fileInput     = document.getElementById('ups-file-input');
  var optionsDiv    = document.getElementById('ups-options');
  var scaleSelect   = document.getElementById('ups-scale');
  var formatSelect  = document.getElementById('ups-format');
  var qualityWrap   = document.getElementById('ups-quality-wrap');
  var qualityRange  = document.getElementById('ups-quality');
  var qualityValue  = document.getElementById('ups-quality-value');
  var sharpenRange  = document.getElementById('ups-sharpen');
  var sharpenValue  = document.getElementById('ups-sharpen-value');
  var denoiseRange  = document.getElementById('ups-denoise');
  var denoiseValue  = document.getElementById('ups-denoise-value');
  var edgeRange     = document.getElementById('ups-edge');
  var edgeValue     = document.getElementById('ups-edge-value');
  var infoText      = document.getElementById('ups-info');
  var previewDiv    = document.getElementById('ups-preview');
  var downloadBtn   = document.getElementById('ups-btn');
  var reconvertBtn  = document.getElementById('ups-reconvert-btn');
  var resetBtn      = document.getElementById('ups-reset-btn');
  var progressDiv   = document.getElementById('ups-progress');

  // ===== State =====
  var currentFile   = null;
  var originalImage = null;  // { img, dataUrl, name, width, height }
  var resultBlob    = null;
  var resultUrl     = null;
  var isProcessing  = false;

  // ===== Slider display updates =====
  sharpenRange.addEventListener('input', function () {
    sharpenValue.textContent = sharpenRange.value + '%';
  });
  denoiseRange.addEventListener('input', function () {
    denoiseValue.textContent = denoiseRange.value + '%';
  });
  edgeRange.addEventListener('input', function () {
    edgeValue.textContent = edgeRange.value + '%';
  });
  qualityRange.addEventListener('input', function () {
    qualityValue.textContent = qualityRange.value + '%';
  });

  // ===== Format change: show/hide quality slider =====
  formatSelect.addEventListener('change', function () {
    qualityWrap.style.display = (formatSelect.value === 'png') ? 'none' : '';
  });

  // ===== File upload =====
  setupDropArea('ups-drop-area', 'ups-file-input', function (files) {
    var imgFile = files.find(function (f) { return f.type.startsWith('image/'); });
    if (imgFile) {
      currentFile = imgFile;
      startUpscale();
    }
  });

  // ===== Buttons =====
  downloadBtn.addEventListener('click', function () {
    if (resultBlob) {
      var baseName = originalImage.name.replace(/\.[^.]+$/, '');
      var scale = parseInt(scaleSelect.value);
      var fmt = formatSelect.value;
      var ext = (fmt === 'jpeg') ? 'jpg' : fmt;
      downloadBlob(resultBlob, baseName + '_' + scale + 'x_upscaled.' + ext);
    }
  });

  reconvertBtn.addEventListener('click', function () {
    if (currentFile && !isProcessing) {
      startUpscale();
    }
  });

  resetBtn.addEventListener('click', function () {
    resetState();
  });

  // ===== State management =====
  function resetState() {
    currentFile = null;
    originalImage = null;
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultBlob = null;
    resultUrl = null;
    isProcessing = false;
    dropArea.style.display = '';
    optionsDiv.style.display = 'none';
    progressDiv.style.display = 'none';
    // Clean up comparison labels
    if (previewDiv._labelsDiv && previewDiv._labelsDiv.parentNode) {
      previewDiv._labelsDiv.parentNode.removeChild(previewDiv._labelsDiv);
      previewDiv._labelsDiv = null;
    }
    previewDiv.innerHTML = '';
    previewDiv.style.width = '';
    previewDiv.style.height = '';
    previewDiv.style.display = '';
    infoText.textContent = '';
  }

  // ===== Helper: format file size =====
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  // ===== Helper: progress shorthand =====
  function progress(pct, text) {
    setProgress('ups-progress-fill', 'ups-progress-text', pct, text);
  }

  // =========================================================================
  //  Main Upscale Pipeline
  // =========================================================================

  async function startUpscale() {
    if (isProcessing) return;
    isProcessing = true;

    dropArea.style.display = 'none';
    optionsDiv.style.display = '';
    progressDiv.style.display = 'block';
    previewDiv.innerHTML = '';
    downloadBtn.disabled = true;
    reconvertBtn.disabled = true;

    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultBlob = null;
    resultUrl = null;

    try {
      progress(0, '画像を読み込み中...');

      // Load image
      originalImage = await loadImageFile(currentFile);
      var srcW = originalImage.width;
      var srcH = originalImage.height;
      var scale = parseInt(scaleSelect.value);
      var dstW = srcW * scale;
      var dstH = srcH * scale;
      var sharpenAmt = parseInt(sharpenRange.value) / 100;
      var denoiseAmt = parseInt(denoiseRange.value) / 100;
      var edgeAmt    = parseInt(edgeRange.value) / 100;
      var fmt        = formatSelect.value;
      var quality    = parseInt(qualityRange.value) / 100;

      // Determine how many 2x steps are needed
      var numSteps = Math.round(Math.log2(scale)); // 1 for 2x, 2 for 4x, 3 for 8x

      infoText.textContent = originalImage.name +
        ' | 元: ' + srcW + 'x' + srcH +
        ' | 出力: ' + dstW + 'x' + dstH +
        ' (' + scale + 'x, ' + numSteps + 'ステップ)';

      // Warning for large upscales
      if (scale === 8) {
        infoText.textContent += ' | 処理に時間がかかります';
      }

      progress(2, 'ソース画像を準備中...');

      // Get source pixel data
      var srcCanvas = document.createElement('canvas');
      srcCanvas.width = srcW;
      srcCanvas.height = srcH;
      var srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(originalImage.img, 0, 0);
      var srcData = srcCtx.getImageData(0, 0, srcW, srcH);

      // --- Phase 1: Denoise (pre-process) ---
      if (denoiseAmt > 0) {
        progress(3, 'ノイズ除去中...');
        srcData = await denoiseImage(srcData, srcW, srcH, denoiseAmt);
      }

      // --- Phase 2: Multi-step Lanczos3 upscale ---
      // Each step doubles the dimensions. We iterate numSteps times.
      // Progress allocation: steps occupy from 5% to 80% of the bar.
      var stepProgressStart = 5;
      var stepProgressEnd = 80;
      var stepProgressRange = stepProgressEnd - stepProgressStart;
      var perStepRange = stepProgressRange / numSteps;

      var currentW = srcW;
      var currentH = srcH;
      var currentPixels = srcData.data;

      for (var step = 0; step < numSteps; step++) {
        var nextW = currentW * 2;
        var nextH = currentH * 2;
        var stepBase = stepProgressStart + step * perStepRange;
        var halfStep = perStepRange / 2;
        var stepLabel = 'ステップ ' + (step + 1) + '/' + numSteps + ': ';

        // Horizontal pass
        progress(Math.round(stepBase), stepLabel + 'Lanczos3 2x 水平リサンプリング中...');

        // Wrap currentPixels in an ImageData-like structure for lanczosHorizontal
        var hInput;
        if (step === 0) {
          // First step: srcData is an ImageData object
          hInput = srcData;
        } else {
          // Subsequent steps: currentPixels is a Uint8ClampedArray
          hInput = { data: currentPixels };
        }

        var hPassData = await lanczosHorizontal(hInput, currentW, currentH, nextW, function (pct) {
          progress(
            Math.round(stepBase + pct * halfStep),
            stepLabel + 'Lanczos3 2x 水平リサンプリング中... ' + Math.round(pct * 100) + '%'
          );
        });

        // Vertical pass
        var vBase = stepBase + halfStep;
        progress(Math.round(vBase), stepLabel + 'Lanczos3 2x 垂直リサンプリング中...');

        var vPassData = await lanczosVertical(hPassData, nextW, currentH, nextH, function (pct) {
          progress(
            Math.round(vBase + pct * halfStep),
            stepLabel + 'Lanczos3 2x 垂直リサンプリング中... ' + Math.round(pct * 100) + '%'
          );
        });

        currentW = nextW;
        currentH = nextH;
        currentPixels = vPassData;

        // Free intermediate buffers
        hPassData = null;
      }

      // --- Phase 3: Sharpen (post-process) ---
      if (sharpenAmt > 0) {
        progress(82, 'シャープネス強化中...');
        currentPixels = await unsharpMask(currentPixels, dstW, dstH, sharpenAmt);
      }

      // --- Phase 4: Edge enhancement (post-process) ---
      if (edgeAmt > 0) {
        progress(88, 'エッジ強化中...');
        currentPixels = await edgeEnhance(currentPixels, dstW, dstH, edgeAmt);
      }

      // --- Phase 5: Export to selected format ---
      var mimeType, exportLabel;
      if (fmt === 'png') {
        mimeType = 'image/png';
        exportLabel = 'PNG';
      } else if (fmt === 'jpeg') {
        mimeType = 'image/jpeg';
        exportLabel = 'JPEG';
      } else {
        mimeType = 'image/webp';
        exportLabel = 'WebP';
      }

      progress(93, exportLabel + '画像を生成中...');

      var dstCanvas = document.createElement('canvas');
      dstCanvas.width = dstW;
      dstCanvas.height = dstH;
      var dstCtx = dstCanvas.getContext('2d');
      var outputImageData = dstCtx.createImageData(dstW, dstH);
      outputImageData.data.set(currentPixels);
      dstCtx.putImageData(outputImageData, 0, 0);

      // Export with quality for JPEG/WebP, no quality param for PNG
      resultBlob = await new Promise(function (resolve) {
        if (fmt === 'png') {
          dstCanvas.toBlob(function (blob) { resolve(blob); }, mimeType);
        } else {
          dstCanvas.toBlob(function (blob) { resolve(blob); }, mimeType, quality);
        }
      });
      resultUrl = URL.createObjectURL(resultBlob);

      var fileSizeStr = formatBytes(resultBlob.size);

      progress(100, '完了! (' + fileSizeStr + ')');

      infoText.textContent = originalImage.name +
        ' | 元: ' + srcW + 'x' + srcH +
        ' | 出力: ' + dstW + 'x' + dstH +
        ' (' + scale + 'x) | ' + exportLabel + ' ' + fileSizeStr;

      // --- Phase 6: Show comparison slider ---
      showComparisonSlider(srcW, srcH, dstW, dstH, fileSizeStr);

      downloadBtn.disabled = false;
      reconvertBtn.disabled = false;

    } catch (err) {
      progress(0, 'エラー: ' + err.message);
      reconvertBtn.disabled = false;
    }

    isProcessing = false;
  }

  // =========================================================================
  //  Interactive Before/After Comparison Slider
  // =========================================================================

  function showComparisonSlider(srcW, srcH, dstW, dstH, fileSizeStr) {
    // The wrapper div (#ups-preview) already has class compare-slider-wrapper.
    // We display the original (scaled up to match result visual size) as "before",
    // and the result as "after". A draggable handle divides them.

    // Calculate display width: limit to container width
    var containerWidth = previewDiv.parentElement.clientWidth - 32;
    var displayWidth = Math.min(dstW, containerWidth, 1200);
    var displayHeight = Math.round(displayWidth * (dstH / dstW));

    previewDiv.innerHTML =
      '<img class="compare-before" src="' + originalImage.dataUrl + '" ' +
        'style="width:' + displayWidth + 'px;height:' + displayHeight + 'px;" draggable="false">' +
      '<div class="compare-after" style="width:50%;height:100%;">' +
        '<img src="' + resultUrl + '" ' +
          'style="width:' + displayWidth + 'px;height:' + displayHeight + 'px;" draggable="false">' +
      '</div>' +
      '<div class="compare-handle" style="left:50%;"></div>';

    // Set wrapper dimensions so positioning works
    previewDiv.style.width = displayWidth + 'px';
    previewDiv.style.height = displayHeight + 'px';
    previewDiv.style.display = 'inline-block';

    // Remove old labels from previous run
    if (previewDiv._labelsDiv && previewDiv._labelsDiv.parentNode) {
      previewDiv._labelsDiv.parentNode.removeChild(previewDiv._labelsDiv);
    }

    // Labels below the slider
    var labelsDiv = document.createElement('div');
    labelsDiv.className = 'compare-labels';
    labelsDiv.innerHTML =
      '<span>元画像 (' + srcW + 'x' + srcH + ')</span>' +
      '<span>アップスケール後 (' + dstW + 'x' + dstH + ') -- ' + fileSizeStr + '</span>';
    previewDiv.parentElement.insertBefore(labelsDiv, previewDiv.nextSibling);
    previewDiv._labelsDiv = labelsDiv;

    setupComparisonSlider(previewDiv);
  }

  function setupComparisonSlider(wrapper) {
    var handle = wrapper.querySelector('.compare-handle');
    var afterDiv = wrapper.querySelector('.compare-after');
    var isDragging = false;

    function updatePosition(clientX) {
      var rect = wrapper.getBoundingClientRect();
      var x = clientX - rect.left;
      var pct = Math.max(0, Math.min(1, x / rect.width));
      handle.style.left = (pct * 100) + '%';
      afterDiv.style.width = (pct * 100) + '%';
    }

    // Mouse events
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      isDragging = true;
    });

    wrapper.addEventListener('mousedown', function (e) {
      // Allow clicking anywhere on the slider to jump
      isDragging = true;
      updatePosition(e.clientX);
    });

    document.addEventListener('mousemove', function (e) {
      if (isDragging) {
        e.preventDefault();
        updatePosition(e.clientX);
      }
    });

    document.addEventListener('mouseup', function () {
      isDragging = false;
    });

    // Touch events
    handle.addEventListener('touchstart', function (e) {
      e.preventDefault();
      isDragging = true;
    });

    wrapper.addEventListener('touchstart', function (e) {
      isDragging = true;
      if (e.touches.length > 0) {
        updatePosition(e.touches[0].clientX);
      }
    });

    document.addEventListener('touchmove', function (e) {
      if (isDragging && e.touches.length > 0) {
        updatePosition(e.touches[0].clientX);
      }
    });

    document.addEventListener('touchend', function () {
      isDragging = false;
    });
  }

  // =========================================================================
  //  Lanczos3 Resampling - Separable (Horizontal + Vertical passes)
  // =========================================================================

  var LANCZOS_A = 3;

  /**
   * Lanczos3 kernel: sinc(pi*x) * sinc(pi*x/a) for |x| < a, else 0
   */
  function lanczos3(x) {
    if (x === 0) return 1;
    if (x < 0) x = -x;
    if (x >= LANCZOS_A) return 0;
    var pix = Math.PI * x;
    return (Math.sin(pix) / pix) * (Math.sin(pix / LANCZOS_A) / (pix / LANCZOS_A));
  }

  /**
   * Horizontal pass: resize width from srcW to dstW, keeping height.
   * Input: ImageData or { data: Uint8ClampedArray } (srcW x srcH)
   * Output: Uint8ClampedArray (dstW x srcH x 4)
   */
  function lanczosHorizontal(srcImageData, srcW, srcH, dstW, onProgress) {
    return new Promise(function (resolve) {
      var src = srcImageData.data;
      var dst = new Uint8ClampedArray(dstW * srcH * 4);
      var ratio = srcW / dstW;
      var BATCH = 50;
      var row = 0;

      // Pre-compute filter weights for each destination column
      var filterCache = new Array(dstW);
      for (var dx = 0; dx < dstW; dx++) {
        var center = (dx + 0.5) * ratio - 0.5;
        var left = Math.ceil(center - LANCZOS_A);
        var right = Math.floor(center + LANCZOS_A);
        if (left < 0) left = 0;
        if (right >= srcW) right = srcW - 1;
        var count = right - left + 1;
        var indices = new Int32Array(count);
        var weights = new Float64Array(count);
        var wSum = 0;
        for (var j = 0; j < count; j++) {
          indices[j] = left + j;
          var w = lanczos3(center - (left + j));
          weights[j] = w;
          wSum += w;
        }
        if (wSum !== 0) {
          for (var j = 0; j < count; j++) weights[j] /= wSum;
        }
        filterCache[dx] = { indices: indices, weights: weights, count: count };
      }

      function processBatch() {
        var end = Math.min(row + BATCH, srcH);
        for (var y = row; y < end; y++) {
          var srcRowOff = y * srcW * 4;
          var dstRowOff = y * dstW * 4;
          for (var dx = 0; dx < dstW; dx++) {
            var f = filterCache[dx];
            var r = 0, g = 0, b = 0, a = 0;
            for (var j = 0; j < f.count; j++) {
              var w = f.weights[j];
              var off = srcRowOff + f.indices[j] * 4;
              r += src[off]     * w;
              g += src[off + 1] * w;
              b += src[off + 2] * w;
              a += src[off + 3] * w;
            }
            var dstOff = dstRowOff + dx * 4;
            dst[dstOff]     = Math.max(0, Math.min(255, Math.round(r)));
            dst[dstOff + 1] = Math.max(0, Math.min(255, Math.round(g)));
            dst[dstOff + 2] = Math.max(0, Math.min(255, Math.round(b)));
            dst[dstOff + 3] = Math.max(0, Math.min(255, Math.round(a)));
          }
        }
        row = end;
        if (onProgress) onProgress(row / srcH);
        if (row < srcH) {
          setTimeout(processBatch, 0);
        } else {
          resolve(dst);
        }
      }

      processBatch();
    });
  }

  /**
   * Vertical pass: resize height from srcH to dstH, keeping width.
   * Input: Uint8ClampedArray (width x srcH x 4)
   * Output: Uint8ClampedArray (width x dstH x 4)
   */
  function lanczosVertical(srcBuf, width, srcH, dstH, onProgress) {
    return new Promise(function (resolve) {
      var dst = new Uint8ClampedArray(width * dstH * 4);
      var ratio = srcH / dstH;
      var BATCH = 50;
      var row = 0;

      // Pre-compute filter weights for each destination row
      var filterCache = new Array(dstH);
      for (var dy = 0; dy < dstH; dy++) {
        var center = (dy + 0.5) * ratio - 0.5;
        var top = Math.ceil(center - LANCZOS_A);
        var bottom = Math.floor(center + LANCZOS_A);
        if (top < 0) top = 0;
        if (bottom >= srcH) bottom = srcH - 1;
        var count = bottom - top + 1;
        var indices = new Int32Array(count);
        var weights = new Float64Array(count);
        var wSum = 0;
        for (var j = 0; j < count; j++) {
          indices[j] = top + j;
          var w = lanczos3(center - (top + j));
          weights[j] = w;
          wSum += w;
        }
        if (wSum !== 0) {
          for (var j = 0; j < count; j++) weights[j] /= wSum;
        }
        filterCache[dy] = { indices: indices, weights: weights, count: count };
      }

      function processBatch() {
        var end = Math.min(row + BATCH, dstH);
        for (var dy = row; dy < end; dy++) {
          var f = filterCache[dy];
          var dstRowOff = dy * width * 4;
          for (var x = 0; x < width; x++) {
            var r = 0, g = 0, b = 0, a = 0;
            var xOff = x * 4;
            for (var j = 0; j < f.count; j++) {
              var w = f.weights[j];
              var off = f.indices[j] * width * 4 + xOff;
              r += srcBuf[off]     * w;
              g += srcBuf[off + 1] * w;
              b += srcBuf[off + 2] * w;
              a += srcBuf[off + 3] * w;
            }
            var dstOff = dstRowOff + xOff;
            dst[dstOff]     = Math.max(0, Math.min(255, Math.round(r)));
            dst[dstOff + 1] = Math.max(0, Math.min(255, Math.round(g)));
            dst[dstOff + 2] = Math.max(0, Math.min(255, Math.round(b)));
            dst[dstOff + 3] = Math.max(0, Math.min(255, Math.round(a)));
          }
        }
        row = end;
        if (onProgress) onProgress(row / dstH);
        if (row < dstH) {
          setTimeout(processBatch, 0);
        } else {
          resolve(dst);
        }
      }

      processBatch();
    });
  }

  // =========================================================================
  //  Unsharp Mask Sharpening (post-process)
  // =========================================================================

  /**
   * Unsharp mask: sharpen = original + strength * (original - blurred)
   * amount: 0..1
   */
  function unsharpMask(pixelBuf, width, height, amount) {
    return new Promise(function (resolve) {
      var radius = Math.max(1, Math.round(1 + amount * 2));
      var strength = 0.3 + amount * 1.7;
      var blurred = gaussianBlur(pixelBuf, width, height, radius);
      var len = pixelBuf.length;
      var result = new Uint8ClampedArray(len);
      var BATCH = width * 50 * 4;
      var i = 0;

      function processBatch() {
        var end = Math.min(i + BATCH, len);
        for (; i < end; i++) {
          if ((i & 3) === 3) {
            result[i] = pixelBuf[i];
          } else {
            var sharpened = pixelBuf[i] + strength * (pixelBuf[i] - blurred[i]);
            result[i] = Math.max(0, Math.min(255, Math.round(sharpened)));
          }
        }
        if (i < len) {
          setTimeout(processBatch, 0);
        } else {
          resolve(result);
        }
      }

      processBatch();
    });
  }

  /**
   * Fast Gaussian blur using box blur approximation (3 passes).
   */
  function gaussianBlur(pixelBuf, width, height, radius) {
    var buf1 = new Uint8ClampedArray(pixelBuf);
    var buf2 = new Uint8ClampedArray(pixelBuf.length);
    for (var pass = 0; pass < 3; pass++) {
      boxBlurH(buf1, buf2, width, height, radius);
      boxBlurV(buf2, buf1, width, height, radius);
    }
    return buf1;
  }

  function boxBlurH(src, dst, w, h, r) {
    var iarr = 1.0 / (r + r + 1);
    for (var y = 0; y < h; y++) {
      var rowOff = y * w * 4;
      for (var ch = 0; ch < 4; ch++) {
        var li = rowOff + ch;
        var ri = rowOff + ch;
        var fv = src[rowOff + ch];
        var lv = src[rowOff + (w - 1) * 4 + ch];
        var val = (r + 1) * fv;
        for (var j = 0; j < r; j++) {
          val += src[rowOff + Math.min(j, w - 1) * 4 + ch];
        }
        for (var j = 0; j <= r; j++) {
          val += src[rowOff + Math.min(r + j, w - 1) * 4 + ch] - fv;
          dst[ri] = Math.round(val * iarr);
          ri += 4;
        }
        for (var j = r + 1; j < w - r; j++) {
          val += src[rowOff + (j + r) * 4 + ch] - src[rowOff + (j - r - 1) * 4 + ch];
          dst[ri] = Math.round(val * iarr);
          ri += 4;
        }
        for (var j = w - r; j < w; j++) {
          val += lv - src[rowOff + (j - r - 1) * 4 + ch];
          dst[ri] = Math.round(val * iarr);
          ri += 4;
        }
      }
    }
  }

  function boxBlurV(src, dst, w, h, r) {
    var iarr = 1.0 / (r + r + 1);
    var stride = w * 4;
    for (var x = 0; x < w; x++) {
      for (var ch = 0; ch < 4; ch++) {
        var colBase = x * 4 + ch;
        var ti = colBase;
        var ri = colBase;
        var fv = src[colBase];
        var lv = src[colBase + (h - 1) * stride];
        var val = (r + 1) * fv;
        for (var j = 0; j < r; j++) {
          val += src[colBase + Math.min(j, h - 1) * stride];
        }
        for (var j = 0; j <= r; j++) {
          val += src[colBase + Math.min(r + j, h - 1) * stride] - fv;
          dst[ri] = Math.round(val * iarr);
          ri += stride;
        }
        for (var j = r + 1; j < h - r; j++) {
          val += src[colBase + (j + r) * stride] - src[colBase + (j - r - 1) * stride];
          dst[ri] = Math.round(val * iarr);
          ri += stride;
        }
        for (var j = h - r; j < h; j++) {
          val += lv - src[colBase + (j - r - 1) * stride];
          dst[ri] = Math.round(val * iarr);
          ri += stride;
        }
      }
    }
  }

  // =========================================================================
  //  Denoise (pre-process) - 3x3 Median Filter
  // =========================================================================

  /**
   * Denoise using a 3x3 median filter blended with the original.
   * strength: 0..1 (0 = no effect, 1 = full median)
   */
  function denoiseImage(srcImageData, width, height, strength) {
    return new Promise(function (resolve) {
      var src = srcImageData.data;
      var result = new ImageData(new Uint8ClampedArray(src), width, height);
      var dst = result.data;
      var BATCH = 50;
      var row = 1;

      function processBatch() {
        var end = Math.min(row + BATCH, height - 1);
        for (var y = row; y < end; y++) {
          for (var x = 1; x < width - 1; x++) {
            for (var ch = 0; ch < 3; ch++) {
              var vals = [];
              for (var dy = -1; dy <= 1; dy++) {
                for (var dx = -1; dx <= 1; dx++) {
                  vals.push(src[((y + dy) * width + (x + dx)) * 4 + ch]);
                }
              }
              vals.sort(function (a, b) { return a - b; });
              var median = vals[4];
              var original = src[(y * width + x) * 4 + ch];
              dst[(y * width + x) * 4 + ch] =
                Math.round(original * (1 - strength) + median * strength);
            }
            dst[(y * width + x) * 4 + 3] = src[(y * width + x) * 4 + 3];
          }
        }
        row = end;
        if (row < height - 1) {
          setTimeout(processBatch, 0);
        } else {
          resolve(result);
        }
      }

      processBatch();
    });
  }

  // =========================================================================
  //  Edge Enhancement (post-process) - Sobel-based
  // =========================================================================

  /**
   * Enhance edges using Sobel operator.
   * Detects edges with 3x3 Sobel kernels (Gx, Gy), computes gradient magnitude,
   * then adds weighted edge signal back to the original image.
   * amount: 0..1 (0 = off, 1 = strong enhancement)
   */
  function edgeEnhance(pixelBuf, width, height, amount) {
    return new Promise(function (resolve) {
      var result = new Uint8ClampedArray(pixelBuf);
      var strength = amount * 0.8; // Scale to reasonable range
      var BATCH = 50;
      var row = 1;

      // Sobel kernels:
      // Gx: [-1 0 1]   Gy: [-1 -2 -1]
      //     [-2 0 2]        [ 0  0  0]
      //     [-1 0 1]        [ 1  2  1]

      function processBatch() {
        var end = Math.min(row + BATCH, height - 1);
        for (var y = row; y < end; y++) {
          for (var x = 1; x < width - 1; x++) {
            for (var ch = 0; ch < 3; ch++) {
              // Read 3x3 neighborhood
              var tl = pixelBuf[((y - 1) * width + (x - 1)) * 4 + ch];
              var tc = pixelBuf[((y - 1) * width +  x     ) * 4 + ch];
              var tr = pixelBuf[((y - 1) * width + (x + 1)) * 4 + ch];
              var ml = pixelBuf[( y      * width + (x - 1)) * 4 + ch];
              var mr = pixelBuf[( y      * width + (x + 1)) * 4 + ch];
              var bl = pixelBuf[((y + 1) * width + (x - 1)) * 4 + ch];
              var bc = pixelBuf[((y + 1) * width +  x     ) * 4 + ch];
              var br = pixelBuf[((y + 1) * width + (x + 1)) * 4 + ch];

              // Sobel gradients
              var gx = (-tl + tr - 2 * ml + 2 * mr - bl + br);
              var gy = (-tl - 2 * tc - tr + bl + 2 * bc + br);

              // Gradient magnitude (approximation: avoid sqrt for speed)
              var mag = Math.abs(gx) + Math.abs(gy);

              // Add weighted edge signal back to original
              var idx = (y * width + x) * 4 + ch;
              var enhanced = pixelBuf[idx] + strength * mag;
              result[idx] = Math.max(0, Math.min(255, Math.round(enhanced)));
            }
            // Preserve alpha
            var aIdx = (y * width + x) * 4 + 3;
            result[aIdx] = pixelBuf[aIdx];
          }
        }
        row = end;
        if (row < height - 1) {
          setTimeout(processBatch, 0);
        } else {
          resolve(result);
        }
      }

      processBatch();
    });
  }

})();
