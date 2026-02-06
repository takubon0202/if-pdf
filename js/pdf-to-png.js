const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

const dropArea = document.getElementById('png-drop-area');
const fileInput = document.getElementById('png-file-input');
const optionsDiv = document.getElementById('png-options');
const scaleSelect = document.getElementById('scale-select');
const convertBtn = document.getElementById('convert-btn');
const progressDiv = document.getElementById('png-progress');
const progressFill = document.getElementById('png-progress-fill');
const progressText = document.getElementById('png-progress-text');
const resultsDiv = document.getElementById('png-results');
const downloadAllDiv = document.getElementById('png-download-all');
const downloadZipBtn = document.getElementById('download-zip-btn');

let selectedFile = null;
let pngBlobs = [];

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
  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].type === 'application/pdf') {
    handleFile(files[0]);
  }
});

dropArea.addEventListener('click', e => {
  if (e.target.tagName !== 'INPUT') {
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleFile(fileInput.files[0]);
  }
});

function handleFile(file) {
  selectedFile = file;
  dropArea.querySelector('p').textContent = `選択済み: ${file.name}`;
  optionsDiv.style.display = 'flex';
  resultsDiv.innerHTML = '';
  downloadAllDiv.style.display = 'none';
  pngBlobs = [];
}

convertBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  const scale = parseFloat(scaleSelect.value);
  const arrayBuffer = await selectedFile.arrayBuffer();

  progressDiv.style.display = 'block';
  progressFill.style.width = '0%';
  progressText.textContent = '読み込み中...';
  resultsDiv.innerHTML = '';
  downloadAllDiv.style.display = 'none';
  pngBlobs = [];
  convertBtn.disabled = true;

  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    for (let i = 1; i <= totalPages; i++) {
      progressText.textContent = `変換中... ${i} / ${totalPages} ページ`;
      progressFill.style.width = `${(i / totalPages) * 100}%`;

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      pngBlobs.push({ blob, name: `${selectedFile.name.replace('.pdf', '')}_page${i}.png` });

      const url = URL.createObjectURL(blob);
      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `
        <img src="${url}" alt="Page ${i}">
        <div class="card-footer">
          <span>ページ ${i}</span>
          <a href="${url}" download="${selectedFile.name.replace('.pdf', '')}_page${i}.png" class="btn small primary">保存</a>
        </div>
      `;
      resultsDiv.appendChild(card);
    }

    progressText.textContent = `完了! ${totalPages} ページを変換しました`;
    if (pngBlobs.length > 1) {
      downloadAllDiv.style.display = 'block';
    }
  } catch (err) {
    progressText.textContent = `エラー: ${err.message}`;
  } finally {
    convertBtn.disabled = false;
  }
});

downloadZipBtn.addEventListener('click', async () => {
  downloadZipBtn.disabled = true;
  downloadZipBtn.textContent = 'ZIP作成中...';

  const zip = new JSZip();
  for (const { blob, name } of pngBlobs) {
    zip.file(name, blob);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${selectedFile.name.replace('.pdf', '')}_pages.zip`;
  a.click();
  URL.revokeObjectURL(url);

  downloadZipBtn.disabled = false;
  downloadZipBtn.textContent = 'ZIP で一括ダウンロード';
});
