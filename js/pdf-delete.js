const pdfjsLib = window._pdfjsLib || await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');

(function () {
  const dropArea = document.getElementById('del-drop-area');
  const ui = document.getElementById('del-ui');
  const pageInfo = document.getElementById('del-page-info');
  const thumbsDiv = document.getElementById('del-thumbs');
  const delBtn = document.getElementById('del-btn');
  const progressDiv = document.getElementById('del-progress');

  let pdfData = null;
  let totalPages = 0;
  let selectedPages = new Set();

  setupDropArea('del-drop-area', 'del-file-input', files => {
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
    pageInfo.textContent = `${file.name} — ${totalPages} ページ（削除するページをクリックしてください）`;
    thumbsDiv.innerHTML = '';
    delBtn.disabled = true;

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

      const div = document.createElement('div');
      div.className = 'thumb-item';
      div.dataset.page = i;
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      div.innerHTML = `<div class="thumb-overlay">&#10003;</div>`;
      div.prepend(img);
      const label = document.createElement('div');
      label.className = 'thumb-label';
      label.textContent = `ページ ${i}`;
      div.appendChild(label);
      div.addEventListener('click', () => togglePage(div, i));
      thumbsDiv.appendChild(div);
    }
  }

  function togglePage(div, pageNum) {
    if (selectedPages.has(pageNum)) { selectedPages.delete(pageNum); div.classList.remove('selected'); }
    else {
      if (selectedPages.size >= totalPages - 1) { alert('少なくとも1ページは残す必要があります。'); return; }
      selectedPages.add(pageNum); div.classList.add('selected');
    }
    delBtn.disabled = selectedPages.size === 0;
    delBtn.textContent = `${selectedPages.size} ページを削除してダウンロード`;
  }

  delBtn.addEventListener('click', async () => {
    if (!pdfData || selectedPages.size === 0) return;
    delBtn.disabled = true;
    progressDiv.style.display = 'block';
    setProgress('del-progress-fill', 'del-progress-text', 50, '処理中...');
    try {
      const src = await PDFLib.PDFDocument.load(pdfData.data);
      const doc = await PDFLib.PDFDocument.create();
      const keepIndices = [];
      for (let i = 0; i < totalPages; i++) { if (!selectedPages.has(i + 1)) keepIndices.push(i); }
      const pages = await doc.copyPages(src, keepIndices);
      pages.forEach(p => doc.addPage(p));
      const bytes = await doc.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), pdfData.name.replace(/\.pdf$/i, '_deleted.pdf'));
      setProgress('del-progress-fill', 'del-progress-text', 100, '完了!');
    } catch (err) { setProgress('del-progress-fill', 'del-progress-text', 100, 'エラー: ' + err.message); }
    finally { delBtn.disabled = false; }
  });
})();
