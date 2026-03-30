(function () {
  const dropArea     = document.getElementById('meme-drop-area');
  const uiDiv        = document.getElementById('meme-ui');
  const topInput     = document.getElementById('meme-top');
  const bottomInput  = document.getElementById('meme-bottom');
  const fontsizeInput = document.getElementById('meme-fontsize');
  const colorInput   = document.getElementById('meme-color');
  const canvas       = document.getElementById('meme-canvas');
  const ctx          = canvas.getContext('2d');
  const downloadBtn  = document.getElementById('meme-btn');
  const resetBtn     = document.getElementById('meme-reset-btn');

  let currentImage = null; // { img, name, width, height }

  /* --- Font families --- */
  const FONTS = ['Impact', 'Arial Black', 'Comic Sans MS', 'Verdana'];
  let memeFont; // <select> element

  (function createFontSelect() {
    const optRow = uiDiv.querySelector('.options');
    if (!optRow) return;
    const label = document.createElement('label');
    label.textContent = 'フォント: ';
    const sel = document.createElement('select');
    sel.id = 'meme-font';
    FONTS.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });
    label.appendChild(sel);
    optRow.appendChild(label);
    memeFont = sel;
  })();

  /* --- Debounce helper --- */
  let _renderTimer = null;
  function debouncedRender() {
    clearTimeout(_renderTimer);
    _renderTimer = setTimeout(renderMeme, 100);
  }

  function getSelectedFont() {
    return (memeFont && memeFont.value) || 'Impact';
  }

  setupDropArea('meme-drop-area', 'meme-file-input', files => {
    const imgFile = files.find(f => f.type.startsWith('image/'));
    if (imgFile) loadImage(imgFile);
  });

  async function loadImage(file) {
    try {
      const loaded = await loadImageFile(file);
      currentImage = {
        img: loaded.img,
        name: loaded.name,
        width: loaded.width,
        height: loaded.height
      };
      canvas.width = loaded.width;
      canvas.height = loaded.height;
      dropArea.style.display = 'none';
      uiDiv.style.display = '';
      renderMeme();
    } catch {
      alert(`"${file.name}" を読み込めませんでした。`);
    }
  }

  // Live preview with debounce on any input change
  [topInput, bottomInput, fontsizeInput, colorInput].forEach(el => {
    el.addEventListener('input', debouncedRender);
  });
  if (memeFont) memeFont.addEventListener('change', debouncedRender);

  function renderMeme() {
    if (!currentImage) return;
    const { img, width, height } = currentImage;
    const baseFontSize = Math.max(12, Math.min(120, parseInt(fontsizeInput.value) || 48));
    const color = colorInput.value;

    // Draw original image at full resolution
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const topText = (topInput.value || '').toUpperCase();
    const bottomText = (bottomInput.value || '').toUpperCase();

    if (topText) {
      drawMemeText(ctx, topText, width, height, baseFontSize, color, 'top');
    }
    if (bottomText) {
      drawMemeText(ctx, bottomText, width, height, baseFontSize, color, 'bottom');
    }
  }

  /**
   * Word-wrap text into lines that fit maxWidth.
   * Returns an array of strings.
   */
  function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    if (words.length <= 1) {
      // Single word -- check if it fits; if not, just return as-is (font will be shrunk)
      return [text];
    }
    const lines = [];
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      if (ctx.measureText(testLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  function drawMemeText(ctx, text, canvasWidth, canvasHeight, baseFontSize, color, position) {
    const fontFamily = getSelectedFont();
    let fontSize = baseFontSize;
    const padding = Math.max(20, canvasWidth * 0.04);
    const maxWidth = canvasWidth - padding * 2;

    ctx.save();

    // Find a font size that allows wrapping into at most ~4 lines
    ctx.font = 'bold ' + fontSize + 'px "' + fontFamily + '", "Arial Black", sans-serif';
    let lines = wrapText(ctx, text, maxWidth);

    // If a single long word is still too wide, shrink font
    while (lines.length === 1 && ctx.measureText(lines[0]).width > maxWidth && fontSize > 12) {
      fontSize -= 2;
      ctx.font = 'bold ' + fontSize + 'px "' + fontFamily + '", "Arial Black", sans-serif';
      lines = wrapText(ctx, text, maxWidth);
    }

    // If too many lines, also reduce font size
    const maxLines = 4;
    while (lines.length > maxLines && fontSize > 12) {
      fontSize -= 2;
      ctx.font = 'bold ' + fontSize + 'px "' + fontFamily + '", "Arial Black", sans-serif';
      lines = wrapText(ctx, text, maxWidth);
    }

    const lineHeight = fontSize * 1.15;
    const totalTextHeight = lines.length * lineHeight;

    // Text shadow / glow for readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = Math.max(4, fontSize / 6);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = color;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(2, fontSize / 8);
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';

    const x = canvasWidth / 2;

    if (position === 'top') {
      ctx.textBaseline = 'top';
      const startY = padding;
      for (let i = 0; i < lines.length; i++) {
        const y = startY + i * lineHeight;
        ctx.strokeText(lines[i], x, y);
        ctx.fillText(lines[i], x, y);
      }
    } else {
      ctx.textBaseline = 'bottom';
      const startY = canvasHeight - padding - totalTextHeight + lineHeight;
      for (let i = 0; i < lines.length; i++) {
        const y = startY + i * lineHeight;
        ctx.strokeText(lines[i], x, y);
        ctx.fillText(lines[i], x, y);
      }
    }

    ctx.restore();
  }

  function replaceExtension(filename, suffix) {
    const dotIdx = filename.lastIndexOf('.');
    const base = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
    return base + suffix;
  }

  downloadBtn.addEventListener('click', () => {
    if (!currentImage) return;
    canvas.toBlob(blob => {
      if (blob) {
        downloadBlob(blob, replaceExtension(currentImage.name, '_meme.png'));
      }
    }, 'image/png');
  });

  resetBtn.addEventListener('click', () => {
    currentImage = null;
    topInput.value = '';
    bottomInput.value = '';
    fontsizeInput.value = '48';
    colorInput.value = '#ffffff';
    if (memeFont) memeFont.value = 'Impact';
    canvas.width = 0;
    canvas.height = 0;
    uiDiv.style.display = 'none';
    dropArea.style.display = '';
  });
})();
