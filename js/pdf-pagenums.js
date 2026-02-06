(function () {
  const dropArea = document.getElementById('pn-drop-area');
  const optionsDiv = document.getElementById('pn-options');
  const positionSelect = document.getElementById('pn-position');
  const startInput = document.getElementById('pn-start');
  const fontsizeInput = document.getElementById('pn-fontsize');
  const pageInfo = document.getElementById('pn-page-info');
  const pnBtn = document.getElementById('pn-btn');
  const progressDiv = document.getElementById('pn-progress');

  let pdfData = null;
  let totalPages = 0;

  setupDropArea('pn-drop-area', 'pn-file-input', files => {
    const f = files.find(f => f.type === 'application/pdf');
    if (f) loadPdf(f);
  });

  async function loadPdf(file) {
    const data = await file.arrayBuffer();
    try {
      const pdf = await PDFLib.PDFDocument.load(data);
      totalPages = pdf.getPageCount();
      pdfData = { data, name: file.name };
      dropArea.style.display = 'none';
      optionsDiv.style.display = '';
      pageInfo.textContent = `${file.name} — ${totalPages} ページ`;
    } catch { alert('PDFを読み込めませんでした。'); }
  }

  pnBtn.addEventListener('click', async () => {
    if (!pdfData) return;
    pnBtn.disabled = true;
    progressDiv.style.display = 'block';

    try {
      const doc = await PDFLib.PDFDocument.load(pdfData.data);
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const fontSize = Math.max(6, Math.min(72, parseInt(fontsizeInput.value) || 12));
      const startNum = parseInt(startInput.value) || 1;
      const position = positionSelect.value;
      const margin = 30;

      const pages = doc.getPages();
      for (let i = 0; i < pages.length; i++) {
        setProgress('pn-progress-fill', 'pn-progress-text', ((i + 1) / pages.length) * 100, `処理中... ${i + 1} / ${pages.length}`);
        const page = pages[i];
        const { width, height } = page.getSize();
        const text = String(startNum + i);
        const textWidth = font.widthOfTextAtSize(text, fontSize);

        let x, y;
        const [vPos, hPos] = position.split('-');
        if (hPos === 'left') x = margin;
        else if (hPos === 'right') x = width - margin - textWidth;
        else x = (width - textWidth) / 2;

        if (vPos === 'top') y = height - margin;
        else y = margin;

        page.drawText(text, { x, y, size: fontSize, font, color: PDFLib.rgb(0, 0, 0) });
      }

      const bytes = await doc.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), pdfData.name.replace(/\.pdf$/i, '_numbered.pdf'));
      setProgress('pn-progress-fill', 'pn-progress-text', 100, '完了!');
    } catch (err) { setProgress('pn-progress-fill', 'pn-progress-text', 100, 'エラー: ' + err.message); }
    finally { pnBtn.disabled = false; }
  });
})();
