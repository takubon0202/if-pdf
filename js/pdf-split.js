(function () {
  const dropArea = document.getElementById('split-drop-area');
  const optionsDiv = document.getElementById('split-options');
  const modeSelect = document.getElementById('split-mode');
  const rangeInputDiv = document.getElementById('split-range-input');
  const everyInputDiv = document.getElementById('split-every-input');
  const rangeText = document.getElementById('split-range-text');
  const everyN = document.getElementById('split-every-n');
  const pageInfo = document.getElementById('split-page-info');
  const splitBtn = document.getElementById('split-btn');
  const progressDiv = document.getElementById('split-progress');

  let pdfData = null;
  let totalPages = 0;

  setupDropArea('split-drop-area', 'split-file-input', files => {
    const f = files.find(f => f.type === 'application/pdf');
    if (f) loadPdf(f);
  });

  modeSelect.addEventListener('change', () => {
    rangeInputDiv.style.display = modeSelect.value === 'range' ? '' : 'none';
    everyInputDiv.style.display = modeSelect.value === 'every' ? '' : 'none';
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

  function parseRanges(text, max) {
    const groups = [];
    for (const part of text.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const m = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        const a = Math.max(1, parseInt(m[1])), b = Math.min(max, parseInt(m[2]));
        if (a <= b) { const pages = []; for (let i = a; i <= b; i++) pages.push(i - 1); groups.push(pages); }
      } else {
        const n = parseInt(trimmed);
        if (n >= 1 && n <= max) groups.push([n - 1]);
      }
    }
    return groups;
  }

  splitBtn.addEventListener('click', async () => {
    if (!pdfData) return;
    splitBtn.disabled = true;
    progressDiv.style.display = 'block';

    try {
      let pageGroups = [];
      const mode = modeSelect.value;
      if (mode === 'each') {
        for (let i = 0; i < totalPages; i++) pageGroups.push([i]);
      } else if (mode === 'range') {
        pageGroups = parseRanges(rangeText.value, totalPages);
        if (!pageGroups.length) { alert('有効なページ範囲を入力してください。'); splitBtn.disabled = false; progressDiv.style.display = 'none'; return; }
      } else {
        const n = Math.max(1, parseInt(everyN.value) || 1);
        for (let i = 0; i < totalPages; i += n) {
          const group = [];
          for (let j = i; j < Math.min(i + n, totalPages); j++) group.push(j);
          pageGroups.push(group);
        }
      }

      if (pageGroups.length === 1) {
        setProgress('split-progress-fill', 'split-progress-text', 50, '生成中...');
        const src = await PDFLib.PDFDocument.load(pdfData.data);
        const doc = await PDFLib.PDFDocument.create();
        const pages = await doc.copyPages(src, pageGroups[0]);
        pages.forEach(p => doc.addPage(p));
        const bytes = await doc.save();
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), pdfData.name.replace(/\.pdf$/i, '_split.pdf'));
        setProgress('split-progress-fill', 'split-progress-text', 100, '完了!');
      } else {
        const zip = new JSZip();
        const baseName = pdfData.name.replace(/\.pdf$/i, '');
        for (let g = 0; g < pageGroups.length; g++) {
          setProgress('split-progress-fill', 'split-progress-text', ((g + 1) / pageGroups.length) * 100, `分割中... ${g + 1} / ${pageGroups.length}`);
          const src = await PDFLib.PDFDocument.load(pdfData.data);
          const doc = await PDFLib.PDFDocument.create();
          const pages = await doc.copyPages(src, pageGroups[g]);
          pages.forEach(p => doc.addPage(p));
          const bytes = await doc.save();
          zip.file(`${baseName}_part${g + 1}.pdf`, bytes);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(blob, baseName + '_split.zip');
        setProgress('split-progress-fill', 'split-progress-text', 100, `完了! ${pageGroups.length} ファイルに分割しました`);
      }
    } catch (err) { setProgress('split-progress-fill', 'split-progress-text', 100, 'エラー: ' + err.message); }
    finally { splitBtn.disabled = false; }
  });
})();
