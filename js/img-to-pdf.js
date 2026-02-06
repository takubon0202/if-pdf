(function () {
  const dropArea = document.getElementById('img-drop-area');
  const fileListDiv = document.getElementById('img-file-list');
  const actionsDiv = document.getElementById('img-actions');
  const pageSizeSelect = document.getElementById('img-page-size');
  const addMoreBtn = document.getElementById('img-add-more');
  const addMoreInput = document.getElementById('img-add-input');
  const convertBtn = document.getElementById('img-convert-btn');
  const progressDiv = document.getElementById('img-progress');

  let images = []; // { name, dataUrl, width, height }

  setupDropArea('img-drop-area', 'img-file-input', files => {
    addImages(files.filter(f => f.type.startsWith('image/')));
  });
  addMoreBtn.addEventListener('click', () => addMoreInput.click());
  addMoreInput.addEventListener('change', () => {
    addImages(Array.from(addMoreInput.files).filter(f => f.type.startsWith('image/')));
    addMoreInput.value = '';
  });

  async function addImages(files) {
    for (const file of files) {
      const dataUrl = await readAsDataURL(file);
      const dims = await getImageDims(dataUrl);
      images.push({ name: file.name, dataUrl, width: dims.width, height: dims.height });
    }
    renderList();
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function getImageDims(dataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = dataUrl;
    });
  }

  function renderList() {
    fileListDiv.innerHTML = '';
    if (!images.length) { actionsDiv.style.display = 'none'; dropArea.style.display = ''; return; }
    dropArea.style.display = 'none'; actionsDiv.style.display = 'flex';
    images.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'file-item'; div.draggable = true;
      div.innerHTML = `<span class="drag-handle">&#9776;</span><span class="file-name">${item.name}</span><span class="file-pages">${item.width}x${item.height}</span><button class="remove-btn">&times;</button>`;
      div.addEventListener('dragstart', e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', i); div.classList.add('dragging'); });
      div.addEventListener('dragend', () => div.classList.remove('dragging'));
      div.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      div.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        if (from !== i) { const [m] = images.splice(from, 1); images.splice(i, 0, m); renderList(); }
      });
      div.querySelector('.remove-btn').addEventListener('click', e => { e.stopPropagation(); images.splice(i, 1); renderList(); });
      fileListDiv.appendChild(div);
    });
  }

  async function embedImage(doc, dataUrl) {
    const response = await fetch(dataUrl);
    const arrayBuffer = await response.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    // Detect format
    if (uint8[0] === 0xFF && uint8[1] === 0xD8) return doc.embedJpg(uint8);
    if (uint8[0] === 0x89 && uint8[1] === 0x50) return doc.embedPng(uint8);
    // For other formats, convert to PNG via canvas
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const pngBuf = await blob.arrayBuffer();
    return doc.embedPng(new Uint8Array(pngBuf));
  }

  convertBtn.addEventListener('click', async () => {
    if (!images.length) return;
    convertBtn.disabled = true;
    progressDiv.style.display = 'block';

    try {
      const doc = await PDFLib.PDFDocument.create();
      const PAGE_SIZES = {
        a4: [595.28, 841.89],
        letter: [612, 792],
      };

      for (let i = 0; i < images.length; i++) {
        setProgress('img-progress-fill', 'img-progress-text', ((i + 1) / images.length) * 100, `変換中... ${i + 1} / ${images.length}`);
        const embedded = await embedImage(doc, images[i].dataUrl);
        const imgW = embedded.width, imgH = embedded.height;
        const mode = pageSizeSelect.value;

        let pageW, pageH, drawW, drawH, drawX, drawY;
        if (mode === 'fit') {
          pageW = imgW; pageH = imgH; drawW = imgW; drawH = imgH; drawX = 0; drawY = 0;
        } else {
          [pageW, pageH] = PAGE_SIZES[mode];
          const scale = Math.min(pageW / imgW, pageH / imgH);
          drawW = imgW * scale; drawH = imgH * scale;
          drawX = (pageW - drawW) / 2; drawY = (pageH - drawH) / 2;
        }

        const page = doc.addPage([pageW, pageH]);
        page.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });
      }

      const bytes = await doc.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'images.pdf');
      setProgress('img-progress-fill', 'img-progress-text', 100, '完了!');
    } catch (err) { setProgress('img-progress-fill', 'img-progress-text', 100, 'エラー: ' + err.message); }
    finally { convertBtn.disabled = false; }
  });
})();
