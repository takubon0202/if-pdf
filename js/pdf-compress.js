const pdfjsLib = window._pdfjsLib || await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');

(function () {
  const dropArea = document.getElementById('cmp-drop-area');
  const optionsDiv = document.getElementById('cmp-options');
  const qualitySelect = document.getElementById('cmp-quality');
  const pageInfo = document.getElementById('cmp-page-info');
  const cmpBtn = document.getElementById('cmp-btn');
  const progressDiv = document.getElementById('cmp-progress');

  let pdfFile = null;

  setupDropArea('cmp-drop-area', 'cmp-file-input', files => {
    const f = files.find(f => f.type === 'application/pdf');
    if (f) loadPdf(f);
  });

  async function loadPdf(file) {
    pdfFile = file;
    dropArea.style.display = 'none';
    optionsDiv.style.display = '';
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    pageInfo.textContent = `${file.name} — ${sizeMB} MB`;
  }

  cmpBtn.addEventListener('click', async () => {
    if (!pdfFile) return;
    cmpBtn.disabled = true;
    progressDiv.style.display = 'block';
    setProgress('cmp-progress-fill', 'cmp-progress-text', 0, '読み込み中...');

    try {
      const quality = parseFloat(qualitySelect.value);
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;

      const doc = await PDFLib.PDFDocument.create();

      for (let i = 1; i <= totalPages; i++) {
        setProgress('cmp-progress-fill', 'cmp-progress-text', (i / totalPages) * 90, `圧縮中... ${i} / ${totalPages} ページ`);

        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
        const imgBytes = new Uint8Array(await blob.arrayBuffer());
        const img = await doc.embedJpg(imgBytes);

        // Use original page size (in PDF points) for correct dimensions
        const origVp = page.getViewport({ scale: 1 });
        const newPage = doc.addPage([origVp.width, origVp.height]);
        newPage.drawImage(img, { x: 0, y: 0, width: origVp.width, height: origVp.height });
      }

      setProgress('cmp-progress-fill', 'cmp-progress-text', 95, '保存中...');
      const bytes = await doc.save();
      const originalSize = pdfFile.size;
      const newSize = bytes.byteLength;
      const reduction = Math.max(0, ((1 - newSize / originalSize) * 100)).toFixed(1);

      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), pdfFile.name.replace(/\.pdf$/i, '_compressed.pdf'));
      setProgress('cmp-progress-fill', 'cmp-progress-text', 100,
        `完了! ${(originalSize / 1024 / 1024).toFixed(2)} MB → ${(newSize / 1024 / 1024).toFixed(2)} MB (${reduction}% 削減)`);
    } catch (err) { setProgress('cmp-progress-fill', 'cmp-progress-text', 100, 'エラー: ' + err.message); }
    finally { cmpBtn.disabled = false; }
  });
})();
