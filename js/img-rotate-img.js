(function () {
  const dropArea = document.getElementById('irt-drop-area');
  const ui = document.getElementById('irt-ui');
  const leftBtn = document.getElementById('irt-left');
  const rightBtn = document.getElementById('irt-right');
  const btn180 = document.getElementById('irt-180');
  const flipHBtn = document.getElementById('irt-flip-h');
  const flipVBtn = document.getElementById('irt-flip-v');
  const angleInput = document.getElementById('irt-angle');
  const previewDiv = document.getElementById('irt-preview');
  const fileListDiv = document.getElementById('irt-file-list');
  const thumbGrid = document.getElementById('irt-thumb-grid');
  const batchInfo = document.getElementById('irt-batch-info');
  const downloadBtn = document.getElementById('irt-btn');
  const resetBtn = document.getElementById('irt-reset-btn');
  const progressDiv = document.getElementById('irt-progress');

  let images = []; // { name, img, dataUrl, width, height, angle, flipH, flipV, mimeType }
  let selectedIndex = 0;

  // Animation state
  let animatingPreview = false;

  setupDropArea('irt-drop-area', 'irt-file-input', files => {
    addImages(files.filter(f => f.type.startsWith('image/')));
  });

  async function addImages(files) {
    for (const file of files) {
      try {
        const loaded = await loadImageFile(file);
        // Detect original format for output preservation
        let mimeType = file.type || 'image/png';
        if (['image/png', 'image/jpeg', 'image/webp'].indexOf(mimeType) === -1) {
          mimeType = 'image/png';
        }
        images.push({ ...loaded, angle: 0, flipH: false, flipV: false, mimeType });
      } catch { alert(`"${file.name}" を読み込めませんでした。`); }
    }
    if (images.length) {
      dropArea.style.display = 'none';
      ui.style.display = '';
      selectedIndex = 0;
      renderAll();
    }
  }

  // --- Render everything ---
  function renderAll() {
    renderFileList();
    renderPreview();
    renderThumbGrid();
    updateBatchInfo();
  }

  // --- Batch info summary ---
  function updateBatchInfo() {
    if (!images.length) {
      batchInfo.textContent = '';
      return;
    }
    const item = images[selectedIndex] || images[0];
    const flipParts = [];
    if (item.flipH) flipParts.push('ON');
    if (item.flipV) flipParts.push('ON');
    const flipHText = item.flipH ? 'ON' : 'OFF';
    const flipVText = item.flipV ? 'ON' : 'OFF';
    batchInfo.textContent = images.length + ' 枚の画像を回転: 角度 ' + item.angle + '°, 水平反転: ' + flipHText + ', 垂直反転: ' + flipVText;
  }

  // --- Quick rotation buttons with animation ---
  function applyToAll(fn) {
    if (!images.length) return;
    const prevAngle = images[selectedIndex] ? images[selectedIndex].angle : 0;
    images.forEach(fn);
    const newAngle = images[selectedIndex] ? images[selectedIndex].angle : 0;
    renderAll();
    // Animate the transition on the preview canvas
    animatePreviewRotation(prevAngle, newAngle);
  }

  leftBtn.addEventListener('click', () => {
    applyToAll(item => { item.angle = ((item.angle - 90) % 360 + 360) % 360; });
  });

  rightBtn.addEventListener('click', () => {
    applyToAll(item => { item.angle = (item.angle + 90) % 360; });
  });

  btn180.addEventListener('click', () => {
    applyToAll(item => { item.angle = (item.angle + 180) % 360; });
  });

  flipHBtn.addEventListener('click', () => {
    applyToAll(item => { item.flipH = !item.flipH; });
  });

  flipVBtn.addEventListener('click', () => {
    applyToAll(item => { item.flipV = !item.flipV; });
  });

  // Listen on 'input' event for live preview as slider/number changes
  angleInput.addEventListener('input', () => {
    if (!images.length) return;
    const val = (parseInt(angleInput.value) || 0) % 360;
    images.forEach(item => { item.angle = ((val % 360) + 360) % 360; });
    renderAll();
  });

  // Also keep 'change' for final commit
  angleInput.addEventListener('change', () => {
    if (!images.length) return;
    const val = (parseInt(angleInput.value) || 0) % 360;
    images.forEach(item => { item.angle = ((val % 360) + 360) % 360; });
    renderAll();
  });

  // --- Reset ---
  resetBtn.addEventListener('click', () => {
    images = [];
    selectedIndex = 0;
    dropArea.style.display = '';
    ui.style.display = 'none';
    previewDiv.innerHTML = '';
    fileListDiv.innerHTML = '';
    thumbGrid.innerHTML = '';
    batchInfo.textContent = '';
    progressDiv.style.display = 'none';
  });

  // --- File list ---
  function renderFileList() {
    fileListDiv.innerHTML = '';
    images.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'file-item' + (i === selectedIndex ? ' selected' : '');
      const rotInfo = `${item.angle}°` +
        (item.flipH ? ' 左右反転' : '') +
        (item.flipV ? ' 上下反転' : '');
      div.innerHTML = `<span class="file-name">${item.name}</span><span class="file-pages">${rotInfo}</span><button class="remove-btn">&times;</button>`;
      div.addEventListener('click', e => {
        if (e.target.closest('.remove-btn')) return;
        selectedIndex = i;
        renderAll();
      });
      div.querySelector('.remove-btn').addEventListener('click', e => {
        e.stopPropagation();
        images.splice(i, 1);
        if (selectedIndex >= images.length) selectedIndex = Math.max(0, images.length - 1);
        if (!images.length) {
          dropArea.style.display = '';
          ui.style.display = 'none';
          previewDiv.innerHTML = '';
          thumbGrid.innerHTML = '';
          batchInfo.textContent = '';
        }
        renderAll();
      });
      fileListDiv.appendChild(div);
    });
  }

  // --- Thumbnail grid preview ---
  function renderThumbGrid() {
    thumbGrid.innerHTML = '';
    if (images.length <= 1) return; // Only show grid for multiple images

    images.forEach((item, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'irt-thumb-item' + (i === selectedIndex ? ' selected' : '');
      wrapper.title = item.name;

      const thumbCanvas = document.createElement('canvas');
      // Draw a small thumbnail version
      drawTransformedThumb(thumbCanvas, item, 130);
      wrapper.appendChild(thumbCanvas);

      wrapper.addEventListener('click', () => {
        selectedIndex = i;
        renderAll();
      });

      thumbGrid.appendChild(wrapper);
    });
  }

  // Draw a transformed thumbnail that fits within maxSize
  function drawTransformedThumb(canvas, item, maxSize) {
    const angle = item.angle;
    const rad = (angle * Math.PI) / 180;
    const isOrthogonal = (angle % 90 === 0);
    const swap = isOrthogonal && (angle % 180 !== 0);
    const w = item.width;
    const h = item.height;

    let outW, outH;
    if (isOrthogonal) {
      outW = swap ? h : w;
      outH = swap ? w : h;
    } else {
      const absC = Math.abs(Math.cos(rad));
      const absS = Math.abs(Math.sin(rad));
      outW = Math.ceil(w * absC + h * absS);
      outH = Math.ceil(w * absS + h * absC);
    }

    // Scale to fit thumbnail
    const thumbScale = Math.min(maxSize / outW, maxSize / outH, 1);
    canvas.width = Math.round(outW * thumbScale);
    canvas.height = Math.round(outH * thumbScale);

    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(thumbScale, thumbScale);
    ctx.rotate(rad);
    ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);
    ctx.drawImage(item.img, -w / 2, -h / 2, w, h);
  }

  // --- Main preview ---
  function renderPreview() {
    previewDiv.innerHTML = '';
    previewDiv.style.textAlign = 'center';
    if (!images.length) return;
    const item = images[selectedIndex];

    // Container for positioning overlay
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'inline-block';

    const canvas = document.createElement('canvas');
    drawTransformed(canvas, item);
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '400px';
    canvas.style.objectFit = 'contain';
    canvas.style.transition = 'transform 0.3s ease';
    canvas.id = 'irt-preview-canvas';
    container.appendChild(canvas);

    // Rotation indicator overlay
    const overlay = document.createElement('div');
    overlay.className = 'irt-angle-overlay';
    overlay.textContent = item.angle + '°';
    if (item.flipH) overlay.textContent += ' H';
    if (item.flipV) overlay.textContent += ' V';
    container.appendChild(overlay);

    previewDiv.appendChild(container);
  }

  // --- Animate preview rotation on quick-button clicks ---
  function animatePreviewRotation(fromAngle, toAngle) {
    const canvas = document.getElementById('irt-preview-canvas');
    if (!canvas || animatingPreview) return;

    // Calculate shortest rotation difference for animation
    let diff = toAngle - fromAngle;
    // Normalize to [-180, 180]
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;

    if (diff === 0) return;

    animatingPreview = true;
    // Apply a CSS transform animation: start offset, then animate to 0
    canvas.style.transition = 'none';
    canvas.style.transform = 'rotate(' + (-diff) + 'deg)';

    // Force reflow so the starting transform is applied
    void canvas.offsetHeight;

    canvas.style.transition = 'transform 0.3s ease';
    canvas.style.transform = 'rotate(0deg)';

    setTimeout(() => {
      canvas.style.transition = '';
      canvas.style.transform = '';
      animatingPreview = false;
    }, 320);
  }

  function drawTransformed(canvas, item) {
    const angle = item.angle;
    const rad = (angle * Math.PI) / 180;
    const isOrthogonal = (angle % 90 === 0);
    const swap = isOrthogonal && (angle % 180 !== 0); // 90 or 270
    const w = item.width;
    const h = item.height;

    if (isOrthogonal) {
      canvas.width = swap ? h : w;
      canvas.height = swap ? w : h;
    } else {
      // For arbitrary angles, compute bounding box
      const absC = Math.abs(Math.cos(rad));
      const absS = Math.abs(Math.sin(rad));
      canvas.width = Math.ceil(w * absC + h * absS);
      canvas.height = Math.ceil(w * absS + h * absC);
    }

    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);
    ctx.drawImage(item.img, -w / 2, -h / 2, w, h);
  }

  // --- Download with format preservation ---
  downloadBtn.addEventListener('click', async () => {
    if (!images.length) return;
    downloadBtn.disabled = true;
    progressDiv.style.display = 'block';

    try {
      const results = [];
      for (let i = 0; i < images.length; i++) {
        setProgress('irt-progress-fill', 'irt-progress-text', ((i + 1) / images.length) * 100, `処理中... ${i + 1} / ${images.length}`);
        const item = images[i];
        const canvas = document.createElement('canvas');
        drawTransformed(canvas, item);

        // Preserve original format
        const mimeType = item.mimeType;
        const quality = (mimeType === 'image/jpeg') ? 0.92 : undefined;
        const extMap = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
        const ext = extMap[mimeType] || '.png';

        const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
        const baseName = item.name.replace(/\.[^.]+$/, '');
        results.push({ blob, name: baseName + '_rotated' + ext });
      }

      if (results.length === 1) {
        downloadBlob(results[0].blob, results[0].name);
      } else {
        const zip = new JSZip();
        for (const r of results) zip.file(r.name, r.blob);
        const content = await zip.generateAsync({ type: 'blob' });
        downloadBlob(content, 'rotated_images.zip');
      }
      setProgress('irt-progress-fill', 'irt-progress-text', 100, '完了!');
    } catch (err) { setProgress('irt-progress-fill', 'irt-progress-text', 100, 'エラー: ' + err.message); }
    finally { downloadBtn.disabled = false; }
  });
})();
