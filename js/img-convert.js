(function () {
  /* ===== Helper: human-readable file size ===== */
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* ===== Format badge colour map ===== */
  const BADGE_COLORS = {
    jpg:  { bg: '#e8f5e9', fg: '#2e7d32' },
    jpeg: { bg: '#e8f5e9', fg: '#2e7d32' },
    png:  { bg: '#e3f2fd', fg: '#1565c0' },
    webp: { bg: '#fff3e0', fg: '#e65100' },
    gif:  { bg: '#fce4ec', fg: '#c62828' },
    bmp:  { bg: '#f3e5f5', fg: '#6a1b9a' },
    svg:  { bg: '#e0f7fa', fg: '#00695c' },
    tiff: { bg: '#efebe9', fg: '#4e342e' },
    ico:  { bg: '#fafafa', fg: '#424242' },
  };

  function getFormatBadge(name) {
    return (name.split('.').pop() || '?').toLowerCase();
  }

  function badgeStyle(ext) {
    const c = BADGE_COLORS[ext] || { bg: '#f0f0f0', fg: '#555' };
    return `display:inline-block;padding:2px 8px;border-radius:6px;font-size:.78rem;font-weight:700;background:${c.bg};color:${c.fg};`;
  }

  // ===== JPGに変換 (any image -> JPEG) =====
  const itjDropArea     = document.getElementById('itj-drop-area');
  const itjFileList     = document.getElementById('itj-file-list');
  const itjOptions      = document.getElementById('itj-options');
  const itjQuality      = document.getElementById('itj-quality');
  const itjQualityValue = document.getElementById('itj-quality-value');
  const itjAddMore      = document.getElementById('itj-add-more');
  const itjAddInput     = document.getElementById('itj-add-input');
  const itjBtn          = document.getElementById('itj-btn');
  const itjProgress     = document.getElementById('itj-progress');

  let itjImages = []; // { name, img, dataUrl, width, height, originalSize }

  itjQuality.addEventListener('input', () => {
    itjQualityValue.textContent = itjQuality.value + '%';
  });

  setupDropArea('itj-drop-area', 'itj-file-input', files => {
    itjAddImages(files.filter(f => f.type.startsWith('image/')));
  });
  itjAddMore.addEventListener('click', () => itjAddInput.click());
  itjAddInput.addEventListener('change', () => {
    itjAddImages(Array.from(itjAddInput.files).filter(f => f.type.startsWith('image/')));
    itjAddInput.value = '';
  });

  async function itjAddImages(files) {
    for (const file of files) {
      try {
        const loaded = await loadImageFile(file);
        loaded.originalSize = file.size;
        itjImages.push(loaded);
      } catch { alert(`"${file.name}" を読み込めませんでした。`); }
    }
    itjRenderList();
  }

  function createThumbnail(imgObj) {
    const canvas = document.createElement('canvas');
    const maxDim = 40;
    const scale = Math.min(maxDim / imgObj.width, maxDim / imgObj.height, 1);
    canvas.width = Math.round(imgObj.width * scale);
    canvas.height = Math.round(imgObj.height * scale);
    const c = canvas.getContext('2d');
    c.drawImage(imgObj.img, 0, 0, canvas.width, canvas.height);
    const thumb = document.createElement('img');
    thumb.src = canvas.toDataURL('image/jpeg', 0.6);
    thumb.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;';
    return thumb;
  }

  function itjRenderList() {
    itjFileList.innerHTML = '';
    if (!itjImages.length) {
      itjOptions.style.display = 'none';
      itjDropArea.style.display = '';
      return;
    }
    itjDropArea.style.display = 'none';
    itjOptions.style.display = '';

    itjImages.forEach((item, i) => {
      const ext = getFormatBadge(item.name);
      const div = document.createElement('div');
      div.className = 'file-item';
      div.draggable = true;
      div.innerHTML =
        '<span class="drag-handle">&#9776;</span>' +
        '<span class="file-thumb"></span>' +
        '<span class="file-name">' + item.name + '</span>' +
        '<span class="file-size">' + formatSize(item.originalSize) + '</span>' +
        '<span class="file-pages" style="' + badgeStyle(ext) + '">' + ext.toUpperCase() + '</span>' +
        '<button class="remove-btn">&times;</button>';

      // Insert thumbnail
      const thumbSlot = div.querySelector('.file-thumb');
      thumbSlot.appendChild(createThumbnail(item));

      // Drag-and-drop reorder
      div.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', i);
        div.classList.add('dragging');
      });
      div.addEventListener('dragend', () => div.classList.remove('dragging'));
      div.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      div.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        if (isNaN(from) || from === i) return;
        const [m] = itjImages.splice(from, 1);
        itjImages.splice(i, 0, m);
        itjRenderList();
      });
      div.querySelector('.remove-btn').addEventListener('click', e => {
        e.stopPropagation();
        itjImages.splice(i, 1);
        itjRenderList();
      });
      itjFileList.appendChild(div);
    });
  }

  function convertToJpeg(imgObj, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = imgObj.width;
    canvas.height = imgObj.height;
    const ctx = canvas.getContext('2d');
    // Fill white background for transparency
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgObj.img, 0, 0);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  itjBtn.addEventListener('click', async () => {
    if (!itjImages.length) return;
    itjBtn.disabled = true;
    itjAddMore.disabled = true;
    itjProgress.style.display = 'block';
    const quality = parseInt(itjQuality.value) / 100;

    try {
      const results = [];
      let totalOriginal = 0;
      let totalConverted = 0;

      for (let i = 0; i < itjImages.length; i++) {
        setProgress('itj-progress-fill', 'itj-progress-text',
          ((i + 1) / itjImages.length) * 100,
          '変換中... ' + (i + 1) + ' / ' + itjImages.length);
        const blob = await convertToJpeg(itjImages[i], quality);
        const baseName = itjImages[i].name.replace(/\.[^.]+$/, '');
        totalOriginal += itjImages[i].originalSize;
        totalConverted += blob.size;
        results.push({ blob, name: baseName + '.jpg' });
      }

      if (results.length === 1) {
        downloadBlob(results[0].blob, results[0].name);
      } else {
        const zip = new JSZip();
        for (const r of results) zip.file(r.name, r.blob);
        const content = await zip.generateAsync({ type: 'blob' });
        downloadBlob(content, 'converted_to_jpg.zip');
      }

      const summary = results.length + ' ファイルをJPGに変換 (' +
        formatSize(totalOriginal) + ' → ' + formatSize(totalConverted) + ')';
      setProgress('itj-progress-fill', 'itj-progress-text', 100, summary);
    } catch (err) {
      setProgress('itj-progress-fill', 'itj-progress-text', 100, 'エラー: ' + err.message);
    } finally {
      itjBtn.disabled = false;
      itjAddMore.disabled = false;
    }
  });

  // ===== JPGから変換 (any image -> PNG/WebP) =====
  const jtoDropArea  = document.getElementById('jto-drop-area');
  const jtoFileList  = document.getElementById('jto-file-list');
  const jtoOptions   = document.getElementById('jto-options');
  const jtoFormat    = document.getElementById('jto-format');
  const jtoAddMore   = document.getElementById('jto-add-more');
  const jtoAddInput  = document.getElementById('jto-add-input');
  const jtoBtn       = document.getElementById('jto-btn');
  const jtoProgress  = document.getElementById('jto-progress');

  let jtoImages = []; // { name, img, dataUrl, width, height, originalSize }

  setupDropArea('jto-drop-area', 'jto-file-input', files => {
    jtoAddImages(files.filter(f => f.type.startsWith('image/')));
  });
  jtoAddMore.addEventListener('click', () => jtoAddInput.click());
  jtoAddInput.addEventListener('change', () => {
    jtoAddImages(Array.from(jtoAddInput.files).filter(f => f.type.startsWith('image/')));
    jtoAddInput.value = '';
  });

  async function jtoAddImages(files) {
    for (const file of files) {
      try {
        const loaded = await loadImageFile(file);
        loaded.originalSize = file.size;
        jtoImages.push(loaded);
      } catch { alert(`"${file.name}" を読み込めませんでした。`); }
    }
    jtoRenderList();
  }

  function jtoRenderList() {
    jtoFileList.innerHTML = '';
    if (!jtoImages.length) {
      jtoOptions.style.display = 'none';
      jtoDropArea.style.display = '';
      return;
    }
    jtoDropArea.style.display = 'none';
    jtoOptions.style.display = '';

    jtoImages.forEach((item, i) => {
      const ext = getFormatBadge(item.name);
      const div = document.createElement('div');
      div.className = 'file-item';
      div.draggable = true;
      div.innerHTML =
        '<span class="drag-handle">&#9776;</span>' +
        '<span class="file-thumb"></span>' +
        '<span class="file-name">' + item.name + '</span>' +
        '<span class="file-size">' + formatSize(item.originalSize) + '</span>' +
        '<span class="file-pages" style="' + badgeStyle(ext) + '">' + ext.toUpperCase() + '</span>' +
        '<button class="remove-btn">&times;</button>';

      // Insert thumbnail
      const thumbSlot = div.querySelector('.file-thumb');
      thumbSlot.appendChild(createThumbnail(item));

      div.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', i);
        div.classList.add('dragging');
      });
      div.addEventListener('dragend', () => div.classList.remove('dragging'));
      div.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      div.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        if (isNaN(from) || from === i) return;
        const [m] = jtoImages.splice(from, 1);
        jtoImages.splice(i, 0, m);
        jtoRenderList();
      });
      div.querySelector('.remove-btn').addEventListener('click', e => {
        e.stopPropagation();
        jtoImages.splice(i, 1);
        jtoRenderList();
      });
      jtoFileList.appendChild(div);
    });
  }

  function convertToFormat(imgObj, mime) {
    const canvas = document.createElement('canvas');
    canvas.width = imgObj.width;
    canvas.height = imgObj.height;
    const ctx = canvas.getContext('2d');
    // For non-transparent formats, fill white background
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(imgObj.img, 0, 0);
    return new Promise(resolve => canvas.toBlob(resolve, mime));
  }

  const FORMAT_MAP = {
    png:  { mime: 'image/png',  ext: 'png' },
    webp: { mime: 'image/webp', ext: 'webp' },
  };

  jtoBtn.addEventListener('click', async () => {
    if (!jtoImages.length) return;

    const fmt = FORMAT_MAP[jtoFormat.value];
    if (!fmt) { alert('無効な形式です。'); return; }

    jtoBtn.disabled = true;
    jtoAddMore.disabled = true;
    jtoProgress.style.display = 'block';

    try {
      const results = [];
      let totalOriginal = 0;
      let totalConverted = 0;

      for (let i = 0; i < jtoImages.length; i++) {
        setProgress('jto-progress-fill', 'jto-progress-text',
          ((i + 1) / jtoImages.length) * 100,
          '変換中... ' + (i + 1) + ' / ' + jtoImages.length);
        const blob = await convertToFormat(jtoImages[i], fmt.mime);
        const baseName = jtoImages[i].name.replace(/\.[^.]+$/, '');
        totalOriginal += jtoImages[i].originalSize;
        totalConverted += blob.size;
        results.push({ blob, name: baseName + '.' + fmt.ext });
      }

      if (results.length === 1) {
        downloadBlob(results[0].blob, results[0].name);
      } else {
        const zip = new JSZip();
        for (const r of results) zip.file(r.name, r.blob);
        const content = await zip.generateAsync({ type: 'blob' });
        downloadBlob(content, 'converted_to_' + fmt.ext + '.zip');
      }

      const summary = results.length + ' ファイルを' + fmt.ext.toUpperCase() + 'に変換 (' +
        formatSize(totalOriginal) + ' → ' + formatSize(totalConverted) + ')';
      setProgress('jto-progress-fill', 'jto-progress-text', 100, summary);
    } catch (err) {
      setProgress('jto-progress-fill', 'jto-progress-text', 100, 'エラー: ' + err.message);
    } finally {
      jtoBtn.disabled = false;
      jtoAddMore.disabled = false;
    }
  });
})();
