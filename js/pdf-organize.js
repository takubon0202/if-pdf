const pdfjsLib = window._pdfjsLib || await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');

(function () {
  const dropArea = document.getElementById('org-drop-area');
  const ui = document.getElementById('org-ui');
  const thumbsDiv = document.getElementById('org-thumbs');
  const orgBtn = document.getElementById('org-btn');
  const progressDiv = document.getElementById('org-progress');

  let pdfData = null;
  let pageOrder = []; // array of 0-based indices

  setupDropArea('org-drop-area', 'org-file-input', files => {
    const f = files.find(f => f.type === 'application/pdf');
    if (f) loadPdf(f);
  });

  async function loadPdf(file) {
    pdfData = { data: await file.arrayBuffer(), name: file.name };
    const pdf = await pdfjsLib.getDocument({ data: pdfData.data }).promise;
    pageOrder = [];
    dropArea.style.display = 'none';
    ui.style.display = '';
    thumbsDiv.innerHTML = '';

    const thumbData = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      thumbData.push(canvas.toDataURL('image/png'));
      pageOrder.push(i - 1);
    }

    renderThumbs(thumbData);
  }

  function renderThumbs(thumbData) {
    thumbsDiv.innerHTML = '';
    pageOrder.forEach((pageIdx, pos) => {
      const div = document.createElement('div');
      div.className = 'thumb-item';
      div.draggable = true;
      div.dataset.pos = pos;
      const img = document.createElement('img');
      img.src = thumbData[pageIdx];
      div.appendChild(img);
      const label = document.createElement('div');
      label.className = 'thumb-label';
      label.textContent = `ページ ${pageIdx + 1}`;
      div.appendChild(label);

      div.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', pos);
        div.classList.add('dragging');
      });
      div.addEventListener('dragend', () => div.classList.remove('dragging'));
      div.addEventListener('dragover', e => { e.preventDefault(); div.classList.add('drag-over'); });
      div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
      div.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        div.classList.remove('drag-over');
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = pos;
        if (from !== to) {
          const [moved] = pageOrder.splice(from, 1);
          pageOrder.splice(to, 0, moved);
          renderThumbs(thumbData);
        }
      });

      thumbsDiv.appendChild(div);
    });
  }

  orgBtn.addEventListener('click', async () => {
    if (!pdfData) return;
    orgBtn.disabled = true;
    progressDiv.style.display = 'block';
    setProgress('org-progress-fill', 'org-progress-text', 50, '処理中...');
    try {
      const src = await PDFLib.PDFDocument.load(pdfData.data);
      const doc = await PDFLib.PDFDocument.create();
      const pages = await doc.copyPages(src, pageOrder);
      pages.forEach(p => doc.addPage(p));
      const bytes = await doc.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), pdfData.name.replace(/\.pdf$/i, '_reordered.pdf'));
      setProgress('org-progress-fill', 'org-progress-text', 100, '完了!');
    } catch (err) { setProgress('org-progress-fill', 'org-progress-text', 100, 'エラー: ' + err.message); }
    finally { orgBtn.disabled = false; }
  });
})();
