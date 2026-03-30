(function () {
  const dropArea    = document.getElementById('iwm-drop-area');
  const optionsDiv  = document.getElementById('iwm-options');
  const wmText      = document.getElementById('iwm-text');
  const wmFontsize  = document.getElementById('iwm-fontsize');
  const wmOpacity   = document.getElementById('iwm-opacity');
  const wmOpacityValue = document.getElementById('iwm-opacity-value');
  const wmAngle     = document.getElementById('iwm-angle');
  const wmColor     = document.getElementById('iwm-color');
  const wmPosition  = document.getElementById('iwm-position');
  const previewDiv  = document.getElementById('iwm-preview');
  const wmBtn       = document.getElementById('iwm-btn');
  const progressDiv = document.getElementById('iwm-progress');

  let images = []; // Array of { file, img, dataUrl, name, width, height }

  /* --- Dynamically create font selector inside the .options div --- */
  const FONTS = ['Arial', 'Georgia', 'Courier New', 'Impact', 'Verdana'];
  let wmFont; // <select> element
  (function createFontSelect() {
    const optRow = optionsDiv.querySelector('.options');
    if (!optRow) return;
    const label = document.createElement('label');
    label.textContent = 'フォント: ';
    const sel = document.createElement('select');
    sel.id = 'iwm-font';
    FONTS.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });
    label.appendChild(sel);
    optRow.appendChild(label);
    wmFont = sel;
  })();

  /* --- Debounce helper --- */
  let _previewTimer = null;
  function debouncedPreview() {
    clearTimeout(_previewTimer);
    _previewTimer = setTimeout(updatePreview, 100);
  }

  setupDropArea('iwm-drop-area', 'iwm-file-input', files => {
    addImages(files.filter(f => f.type.startsWith('image/')));
  });

  async function addImages(files) {
    for (const file of files) {
      try {
        const loaded = await loadImageFile(file);
        images.push({
          file,
          img: loaded.img,
          dataUrl: loaded.dataUrl,
          name: loaded.name,
          width: loaded.width,
          height: loaded.height
        });
      } catch {
        alert(`"${file.name}" を読み込めませんでした。`);
      }
    }
    if (images.length > 0) {
      dropArea.style.display = 'none';
      optionsDiv.style.display = '';
      updatePreview();
    }
  }

  // Live preview with debounce on every option change
  [wmText, wmFontsize, wmAngle, wmColor].forEach(el => {
    el.addEventListener('input', debouncedPreview);
  });
  if (wmFont) wmFont.addEventListener('change', debouncedPreview);
  wmOpacity.addEventListener('input', () => {
    wmOpacityValue.textContent = wmOpacity.value + '%';
    debouncedPreview();
  });
  wmPosition.addEventListener('change', debouncedPreview);

  function getSelectedFont() {
    return (wmFont && wmFont.value) || 'Arial';
  }

  /* --- Determine contrasting stroke colour --- */
  function contrastStroke(fillColor) {
    // Parse hex colour to determine brightness
    let hex = fillColor.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    // Dark text gets light stroke, light text gets dark stroke
    return brightness > 128 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
  }

  function updatePreview() {
    if (!images.length) return;
    const first = images[0];

    // Scale preview to fit screen (max 600px wide)
    const maxW = 600;
    const scale = first.width > maxW ? maxW / first.width : 1;
    const pw = Math.round(first.width * scale);
    const ph = Math.round(first.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    canvas.style.maxWidth = '100%';
    canvas.style.borderRadius = '8px';
    const ctx = canvas.getContext('2d');

    ctx.drawImage(first.img, 0, 0, pw, ph);
    applyWatermark(ctx, pw, ph, true);

    previewDiv.innerHTML = '';
    previewDiv.appendChild(canvas);
    if (images.length > 1) {
      const info = document.createElement('p');
      info.style.cssText = 'text-align:center;color:#888;margin-top:8px;';
      info.textContent = images.length + ' 枚の画像が選択されています（プレビューは1枚目のみ）';
      previewDiv.appendChild(info);
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - canvas width
   * @param {number} h - canvas height
   * @param {boolean} isPreview - if true, scale font relative to original
   */
  function applyWatermark(ctx, w, h, isPreview) {
    const text = wmText.value || 'SAMPLE';
    const fontSize = Math.max(10, Math.min(200, parseInt(wmFontsize.value) || 48));
    const opacity = parseInt(wmOpacity.value) / 100;
    const angleDeg = parseInt(wmAngle.value) || 0;
    const angleRad = (angleDeg * Math.PI) / 180;
    const color = wmColor.value;
    const position = wmPosition.value;
    const fontFamily = getSelectedFont();

    // Scale font proportionally for preview canvas
    const scaledFontSize = isPreview
      ? (fontSize * (w / (images[0] ? images[0].width : w))) || fontSize
      : fontSize;

    const strokeColor = contrastStroke(color);
    const strokeWidth = Math.max(1, scaledFontSize / 20);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.font = 'bold ' + scaledFontSize + 'px "' + fontFamily + '", sans-serif';
    ctx.fillStyle = color;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (position === 'center') {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(angleRad);
      ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
    } else if (position === 'tile') {
      // Measure actual text width for proper spacing
      const metrics = ctx.measureText(text);
      const textW = metrics.width;
      const textH = scaledFontSize;
      const padX = textW * 0.6;
      const padY = textH * 1.8;
      const spacingX = textW + padX;
      const spacingY = textH + padY;

      // Expand draw area for rotation coverage
      const diagonal = Math.sqrt(w * w + h * h) * 1.2;

      ctx.translate(w / 2, h / 2);
      ctx.rotate(angleRad);

      const startX = -diagonal;
      const startY = -diagonal;
      const endX = diagonal;
      const endY = diagonal;

      for (let y = startY; y < endY; y += spacingY) {
        for (let x = startX; x < endX; x += spacingX) {
          ctx.strokeText(text, x, y);
          ctx.fillText(text, x, y);
        }
      }
    } else if (position === 'bottom-right') {
      const padding = scaledFontSize * 0.5;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.translate(w - padding, h - padding);
      ctx.rotate(angleRad);
      ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
    }

    ctx.restore();
  }

  function applyWatermarkFullRes(imgEl, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, w, h);
    applyWatermark(ctx, w, h, false);
    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('画像の書き出しに失敗しました'));
      }, 'image/png');
    });
  }

  function replaceExtension(filename, suffix) {
    const dotIdx = filename.lastIndexOf('.');
    const base = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
    return base + suffix;
  }

  wmBtn.addEventListener('click', async () => {
    if (!images.length) return;
    const text = wmText.value.trim();
    if (!text) { alert('透かしテキストを入力してください。'); return; }

    wmBtn.disabled = true;
    progressDiv.style.display = 'block';

    try {
      const blobs = [];
      for (let i = 0; i < images.length; i++) {
        setProgress('iwm-progress-fill', 'iwm-progress-text',
          ((i + 1) / images.length) * 90,
          '処理中... ' + (i + 1) + ' / ' + images.length);

        const entry = images[i];
        const canvas = applyWatermarkFullRes(entry.img, entry.width, entry.height);
        const blob = await canvasToBlob(canvas);
        blobs.push({ blob, name: replaceExtension(entry.name, '_watermarked.png') });
      }

      setProgress('iwm-progress-fill', 'iwm-progress-text', 95, '保存中...');

      if (blobs.length === 1) {
        downloadBlob(blobs[0].blob, blobs[0].name);
      } else {
        const zip = new JSZip();
        for (const item of blobs) {
          zip.file(item.name, item.blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, 'watermarked_images.zip');
      }

      setProgress('iwm-progress-fill', 'iwm-progress-text', 100, '完了!');
    } catch (err) {
      setProgress('iwm-progress-fill', 'iwm-progress-text', 100, 'エラー: ' + err.message);
    } finally {
      wmBtn.disabled = false;
    }
  });
})();
