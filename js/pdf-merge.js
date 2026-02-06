(function () {
  const dropArea = document.getElementById('merge-drop-area');
  const fileInput = document.getElementById('merge-file-input');
  const fileListDiv = document.getElementById('merge-file-list');
  const actionsDiv = document.getElementById('merge-actions');
  const addMoreBtn = document.getElementById('add-more-btn');
  const addMoreInput = document.getElementById('merge-add-input');
  const mergeBtn = document.getElementById('merge-btn');
  const progressDiv = document.getElementById('merge-progress');
  const progressFill = document.getElementById('merge-progress-fill');
  const progressText = document.getElementById('merge-progress-text');

  let pdfFiles = []; // { file, name, pageCount }

  // Drag & Drop
  dropArea.addEventListener('dragover', e => {
    e.preventDefault();
    dropArea.classList.add('dragover');
  });

  dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('dragover');
  });

  dropArea.addEventListener('drop', e => {
    e.preventDefault();
    dropArea.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (files.length > 0) addFiles(files);
  });

  dropArea.addEventListener('click', e => {
    if (e.target.tagName !== 'INPUT') {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files).filter(f => f.type === 'application/pdf');
    if (files.length > 0) addFiles(files);
    fileInput.value = '';
  });

  addMoreBtn.addEventListener('click', () => addMoreInput.click());

  addMoreInput.addEventListener('change', () => {
    const files = Array.from(addMoreInput.files).filter(f => f.type === 'application/pdf');
    if (files.length > 0) addFiles(files);
    addMoreInput.value = '';
  });

  async function addFiles(files) {
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      try {
        const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
        pdfFiles.push({
          file,
          name: file.name,
          pageCount: pdf.getPageCount(),
          data: arrayBuffer,
        });
      } catch {
        alert(`"${file.name}" を読み込めませんでした。`);
      }
    }
    renderFileList();
  }

  function renderFileList() {
    fileListDiv.innerHTML = '';

    if (pdfFiles.length === 0) {
      actionsDiv.style.display = 'none';
      return;
    }

    actionsDiv.style.display = 'flex';

    pdfFiles.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'file-item';
      div.draggable = true;
      div.dataset.index = index;

      div.innerHTML = `
        <span class="drag-handle">&#9776;</span>
        <span class="file-name">${item.name}</span>
        <span class="file-pages">${item.pageCount}ページ</span>
        <button class="remove-btn" data-index="${index}">&times;</button>
      `;

      // Drag sort
      div.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index);
        div.classList.add('dragging');
      });

      div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
      });

      div.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      div.addEventListener('drop', e => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const toIndex = index;
        if (fromIndex !== toIndex) {
          const [moved] = pdfFiles.splice(fromIndex, 1);
          pdfFiles.splice(toIndex, 0, moved);
          renderFileList();
        }
      });

      // Remove button
      div.querySelector('.remove-btn').addEventListener('click', e => {
        e.stopPropagation();
        pdfFiles.splice(index, 1);
        renderFileList();
      });

      fileListDiv.appendChild(div);
    });
  }

  mergeBtn.addEventListener('click', async () => {
    if (pdfFiles.length < 2) {
      alert('2つ以上のPDFファイルを追加してください。');
      return;
    }

    mergeBtn.disabled = true;
    progressDiv.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '結合中...';

    try {
      const mergedPdf = await PDFLib.PDFDocument.create();
      const total = pdfFiles.length;

      for (let i = 0; i < total; i++) {
        progressText.textContent = `結合中... ${i + 1} / ${total} ファイル`;
        progressFill.style.width = `${((i + 1) / total) * 100}%`;

        const pdf = await PDFLib.PDFDocument.load(pdfFiles[i].data);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'merged.pdf';
      a.click();
      URL.revokeObjectURL(url);

      progressText.textContent = '結合完了! ダウンロードが開始されました。';
    } catch (err) {
      progressText.textContent = `エラー: ${err.message}`;
    } finally {
      mergeBtn.disabled = false;
    }
  });
})();
