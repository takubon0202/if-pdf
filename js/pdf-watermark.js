(function () {
  const dropArea = document.getElementById('wm-drop-area');
  const optionsDiv = document.getElementById('wm-options');
  const wmText = document.getElementById('wm-text');
  const wmFontsize = document.getElementById('wm-fontsize');
  const wmOpacity = document.getElementById('wm-opacity');
  const wmOpacityValue = document.getElementById('wm-opacity-value');
  const wmAngle = document.getElementById('wm-angle');
  const wmColor = document.getElementById('wm-color');
  const pageInfo = document.getElementById('wm-page-info');
  const wmBtn = document.getElementById('wm-btn');
  const progressDiv = document.getElementById('wm-progress');

  let pdfData = null;
  let totalPages = 0;

  wmOpacity.addEventListener('input', () => { wmOpacityValue.textContent = wmOpacity.value + '%'; });

  setupDropArea('wm-drop-area', 'wm-file-input', files => {
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

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
  }

  wmBtn.addEventListener('click', async () => {
    if (!pdfData) return;
    const text = wmText.value.trim();
    if (!text) { alert('透かしテキストを入力してください。'); return; }

    wmBtn.disabled = true;
    progressDiv.style.display = 'block';

    try {
      const doc = await PDFLib.PDFDocument.load(pdfData.data);
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const fontSize = Math.max(10, Math.min(200, parseInt(wmFontsize.value) || 60));
      const opacity = parseInt(wmOpacity.value) / 100;
      const angleDeg = parseInt(wmAngle.value) || 45;
      const angleRad = (angleDeg * Math.PI) / 180;
      const color = hexToRgb(wmColor.value);

      const pages = doc.getPages();
      for (let i = 0; i < pages.length; i++) {
        setProgress('wm-progress-fill', 'wm-progress-text', ((i + 1) / pages.length) * 100, `処理中... ${i + 1} / ${pages.length}`);
        const page = pages[i];
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const x = (width - textWidth * Math.cos(angleRad)) / 2;
        const y = (height - textWidth * Math.sin(angleRad)) / 2;

        page.drawText(text, {
          x, y, size: fontSize, font,
          color: PDFLib.rgb(color.r, color.g, color.b),
          opacity,
          rotate: PDFLib.degrees(angleDeg),
        });
      }

      const bytes = await doc.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), pdfData.name.replace(/\.pdf$/i, '_watermarked.pdf'));
      setProgress('wm-progress-fill', 'wm-progress-text', 100, '完了!');
    } catch (err) { setProgress('wm-progress-fill', 'wm-progress-text', 100, 'エラー: ' + err.message); }
    finally { wmBtn.disabled = false; }
  });
})();
