const pdfjsLib = window._pdfjsLib || await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');

(function () {
  const dropArea = document.getElementById('rot-drop-area');
  const ui = document.getElementById('rot-ui');
  const thumbsDiv = document.getElementById('rot-thumbs');
  const rotBtn = document.getElementById('rot-btn');
  const progressDiv = document.getElementById('rot-progress');

  let pdfData = null;
  let rotations = []; // degrees for each page (0, 90, 180, 270)
  let thumbImages = []; // original dataURLs

  setupDropArea('rot-drop-area', 'rot-file-input', files => {
    const f = files.find(f => f.type === 'application/pdf');
    if (f) loadPdf(f);
  });

  async function loadPdf(file) {
    pdfData = { data: await file.arrayBuffer(), name: file.name };
    const pdf = await pdfjsLib.getDocument({ data: pdfData.data }).promise;
    rotations = [];
    thumbImages = [];
    dropArea.style.display = 'none';
    ui.style.display = '';
    thumbsDiv.innerHTML = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      thumbImages.push(canvas.toDataURL('image/png'));
      rotations.push(0);
    }
    renderThumbs();
  }

  function renderThumbs() {
    thumbsDiv.innerHTML = '';
    rotations.forEach((rot, i) => {
      const div = document.createElement('div');
      div.className = 'thumb-item';
      const img = document.createElement('img');
      img.src = thumbImages[i];
      img.style.transform = `rotate(${rot}deg)`;
      div.appendChild(img);

      const btn = document.createElement('button');
      btn.className = 'thumb-rotate-btn';
      btn.innerHTML = '&#8635;';
      btn.title = '右に90°回転';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        rotations[i] = (rotations[i] + 90) % 360;
        img.style.transform = `rotate(${rotations[i]}deg)`;
      });
      div.appendChild(btn);

      const label = document.createElement('div');
      label.className = 'thumb-label';
      label.textContent = `ページ ${i + 1}`;
      div.appendChild(label);
      thumbsDiv.appendChild(div);
    });
  }

  document.getElementById('rot-all-left').addEventListener('click', () => {
    rotations = rotations.map(r => (r + 270) % 360);
    renderThumbs();
  });
  document.getElementById('rot-all-right').addEventListener('click', () => {
    rotations = rotations.map(r => (r + 90) % 360);
    renderThumbs();
  });

  rotBtn.addEventListener('click', async () => {
    if (!pdfData) return;
    rotBtn.disabled = true;
    progressDiv.style.display = 'block';
    setProgress('rot-progress-fill', 'rot-progress-text', 50, '処理中...');
    try {
      const src = await PDFLib.PDFDocument.load(pdfData.data);
      const doc = await PDFLib.PDFDocument.create();
      const pages = await doc.copyPages(src, src.getPageIndices());
      pages.forEach((page, i) => {
        if (rotations[i]) page.setRotation(PDFLib.degrees((page.getRotation().angle + rotations[i]) % 360));
        doc.addPage(page);
      });
      const bytes = await doc.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), pdfData.name.replace(/\.pdf$/i, '_rotated.pdf'));
      setProgress('rot-progress-fill', 'rot-progress-text', 100, '完了!');
    } catch (err) { setProgress('rot-progress-fill', 'rot-progress-text', 100, 'エラー: ' + err.message); }
    finally { rotBtn.disabled = false; }
  });
})();
