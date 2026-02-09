(function () {
  const dropArea = document.getElementById('merge-drop-area');
  const fileListDiv = document.getElementById('merge-file-list');
  const actionsDiv = document.getElementById('merge-actions');
  const addMoreBtn = document.getElementById('add-more-btn');
  const addMoreInput = document.getElementById('merge-add-input');
  const mergeBtn = document.getElementById('merge-btn');
  const progressDiv = document.getElementById('merge-progress');

  let pdfFiles = [];

  setupDropArea('merge-drop-area', 'merge-file-input', files => {
    addFiles(files.filter(f => f.type === 'application/pdf'));
  });
  addMoreBtn.addEventListener('click', () => addMoreInput.click());
  addMoreInput.addEventListener('change', () => {
    addFiles(Array.from(addMoreInput.files).filter(f => f.type === 'application/pdf'));
    addMoreInput.value = '';
  });

  async function addFiles(files) {
    for (const file of files) {
      try {
        const data = await file.arrayBuffer();
        const pdf = await PDFLib.PDFDocument.load(data);
        pdfFiles.push({ name: file.name, pageCount: pdf.getPageCount(), data });
      } catch { alert(`"${file.name}" を読み込めませんでした。`); }
    }
    renderList();
  }

  function renderList() {
    fileListDiv.innerHTML = '';
    if (!pdfFiles.length) { actionsDiv.style.display = 'none'; dropArea.style.display = ''; return; }
    dropArea.style.display = 'none'; actionsDiv.style.display = 'flex';
    pdfFiles.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'file-item'; div.draggable = true;
      div.innerHTML = `<span class="drag-handle">&#9776;</span><span class="file-name">${item.name}</span><span class="file-pages">${item.pageCount}ページ</span><button class="remove-btn">&times;</button>`;
      div.addEventListener('dragstart', e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', i); div.classList.add('dragging'); });
      div.addEventListener('dragend', () => div.classList.remove('dragging'));
      div.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      div.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        if (isNaN(from) || from === i) return;
        const [m] = pdfFiles.splice(from, 1); pdfFiles.splice(i, 0, m); renderList();
      });
      div.querySelector('.remove-btn').addEventListener('click', e => { e.stopPropagation(); pdfFiles.splice(i, 1); renderList(); });
      fileListDiv.appendChild(div);
    });
  }

  mergeBtn.addEventListener('click', async () => {
    if (pdfFiles.length < 2) { alert('2つ以上のPDFファイルを追加してください。'); return; }
    mergeBtn.disabled = true; addMoreBtn.disabled = true;
    progressDiv.style.display = 'block';
    try {
      const merged = await PDFLib.PDFDocument.create();
      for (let i = 0; i < pdfFiles.length; i++) {
        setProgress('merge-progress-fill', 'merge-progress-text', ((i + 1) / pdfFiles.length) * 100, `結合中... ${i + 1} / ${pdfFiles.length}`);
        const src = await PDFLib.PDFDocument.load(pdfFiles[i].data);
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      const bytes = await merged.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf');
      setProgress('merge-progress-fill', 'merge-progress-text', 100, '結合完了!');
    } catch (err) { setProgress('merge-progress-fill', 'merge-progress-text', 100, 'エラー: ' + err.message); }
    finally { mergeBtn.disabled = false; addMoreBtn.disabled = false; }
  });
})();
