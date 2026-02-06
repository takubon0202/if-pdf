const pdfjsLib = window._pdfjsLib || await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');

(function () {
  const dropArea = document.getElementById('ext-drop-area');
  const ui = document.getElementById('ext-ui');
  const pageInfo = document.getElementById('ext-page-info');
  const thumbsDiv = document.getElementById('ext-thumbs');
  const extBtn = document.getElementById('ext-btn');
  const progressDiv = document.getElementById('ext-progress');

  let pdfData = null;
  let totalPages = 0;
  let selectedPages = new Set();

  setupDropArea('ext-drop-area', 'ext-file-input', files => {
    const f = files.find(f => f.type === 'application/pdf');
    if (f) loadPdf(f);
  });

  async function loadPdf(file) {
    pdfData = { data: await file.arrayBuffer(), name: file.name };
    const pdf = await pdfjsLib.getDocument({ data: pdfData.data }).promise;
    totalPages = pdf.numPages;
    selectedPages.clear();
    dropArea.style.display = 'none';
    ui.style.display = '';
    pageInfo.textContent = `${file.name} — ${totalPages} ページ（抽出するページをクリックしてください）`;
    thumbsDiv.innerHTML = '';
    extBtn.disabled = true;

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

      const div = document.createElement('div');
      div.className = 'thumb-item';
      div.innerHTML = `<div class="thumb-overlay">&#10003;</div>`;
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      div.prepend(img);
      const label = document.createElement('div');
      label.className = 'thumb-label';
      label.textContent = `ページ ${i}`;
      div.appendChild(label);
      div.addEventListener('click', () => {
        if (selectedPages.has(i)) { selectedPages.delete(i); div.classList.remove('selected'); }
        else { selectedPages.add(i); div.classList.add('selected'); }
        extBtn.disabled = selectedPages.size === 0;
        extBtn.textContent = `${selectedPages.size} ページを抽出してダウンロード`;
      });
      thumbsDiv.appendChild(div);
    }
  }

  extBtn.addEventListener('click', async () => {
    if (!pdfData || selectedPages.size === 0) return;
    extBtn.disabled = true;
    progressDiv.style.display = 'block';
    setProgress('ext-progress-fill', 'ext-progress-text', 50, '処理中...');
    try {
      const src = await PDFLib.PDFDocument.load(pdfData.data);
      const doc = await PDFLib.PDFDocument.create();
      const indices = Array.from(selectedPages).sort((a, b) => a - b).map(p => p - 1);
      const pages = await doc.copyPages(src, indices);
      pages.forEach(p => doc.addPage(p));
      const bytes = await doc.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), pdfData.name.replace(/\.pdf$/i, '_extracted.pdf'));
      setProgress('ext-progress-fill', 'ext-progress-text', 100, '完了!');
    } catch (err) { setProgress('ext-progress-fill', 'ext-progress-text', 100, 'エラー: ' + err.message); }
    finally { extBtn.disabled = false; }
  });
})();
