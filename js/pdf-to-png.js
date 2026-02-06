const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

const dropArea = document.getElementById('png-drop-area');
const fileInput = document.getElementById('png-file-input');
const optionsDiv = document.getElementById('png-options');
const formatSelect = document.getElementById('format-select');
const qualityLabel = document.getElementById('quality-label');
const qualityRange = document.getElementById('quality-range');
const qualityValue = document.getElementById('quality-value');
const scaleSelect = document.getElementById('scale-select');
const reconvertBtn = document.getElementById('convert-btn');
const progressDiv = document.getElementById('png-progress');
const progressFill = document.getElementById('png-progress-fill');
const progressText = document.getElementById('png-progress-text');
const resultsDiv = document.getElementById('png-results');
const downloadAllDiv = document.getElementById('png-download-all');
const downloadZipBtn = document.getElementById('download-zip-btn');

const FORMAT_CONFIG = {
  png:  { mime: 'image/png',  ext: 'png',  hasQuality: false },
  jpeg: { mime: 'image/jpeg', ext: 'jpg',  hasQuality: true },
  webp: { mime: 'image/webp', ext: 'webp', hasQuality: true },
};

let selectedFile = null;
let imageBlobs = [];
let isConverting = false;

// Format select — show/hide quality slider
formatSelect.addEventListener('change', () => {
  const fmt = FORMAT_CONFIG[formatSelect.value];
  qualityLabel.style.display = fmt.hasQuality ? '' : 'none';
});

qualityRange.addEventListener('input', () => {
  qualityValue.textContent = `${qualityRange.value}%`;
});

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
  if (e.target.closest('.file-label')) return;
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleFile(fileInput.files[0]);
  }
});

function handleFile(file) {
  selectedFile = file;
  convertPdf();
}

async function convertPdf() {
  if (!selectedFile || isConverting) return;
  isConverting = true;

  const scale = parseFloat(scaleSelect.value);
  const fmt = FORMAT_CONFIG[formatSelect.value];
  const quality = fmt.hasQuality ? parseInt(qualityRange.value) / 100 : undefined;
  const arrayBuffer = await selectedFile.arrayBuffer();

  dropArea.style.display = 'none';
  optionsDiv.style.display = 'flex';
  progressDiv.style.display = 'block';
  progressFill.style.width = '0%';
  progressText.textContent = '読み込み中...';
  resultsDiv.innerHTML = '';
  downloadAllDiv.style.display = 'none';
  imageBlobs = [];
  reconvertBtn.disabled = true;

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

      // JPEG/WebP need white background (transparent → white)
      if (fmt.mime !== 'image/png') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise(resolve => canvas.toBlob(resolve, fmt.mime, quality));
      const baseName = selectedFile.name.replace(/\.pdf$/i, '');
      const fileName = `${baseName}_page${i}.${fmt.ext}`;
      imageBlobs.push({ blob, name: fileName });

      const url = URL.createObjectURL(blob);
      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `
        <img src="${url}" alt="Page ${i}">
        <div class="card-footer">
          <span>ページ ${i}</span>
          <a href="${url}" download="${fileName}" class="btn small primary">保存</a>
        </div>
      `;
      resultsDiv.appendChild(card);
    }

    progressText.textContent = `完了! ${totalPages} ページを ${fmt.ext.toUpperCase()} に変換しました`;
    if (imageBlobs.length > 1) {
      downloadAllDiv.style.display = 'block';
    }
  } catch (err) {
    progressText.textContent = `エラー: ${err.message}`;
  } finally {
    isConverting = false;
    reconvertBtn.disabled = false;
  }
}

reconvertBtn.addEventListener('click', () => {
  if (selectedFile) {
    convertPdf();
  }
});

document.getElementById('png-reset-btn').addEventListener('click', () => {
  selectedFile = null;
  imageBlobs = [];
  fileInput.value = '';
  dropArea.style.display = '';
  optionsDiv.style.display = 'none';
  progressDiv.style.display = 'none';
  resultsDiv.innerHTML = '';
  downloadAllDiv.style.display = 'none';
});

downloadZipBtn.addEventListener('click', async () => {
  downloadZipBtn.disabled = true;
  downloadZipBtn.textContent = 'ZIP作成中...';

  const zip = new JSZip();
  for (const { blob, name } of imageBlobs) {
    zip.file(name, blob);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${selectedFile.name.replace(/\.pdf$/i, '')}_pages.zip`;
  a.click();
  URL.revokeObjectURL(url);

  downloadZipBtn.disabled = false;
  downloadZipBtn.textContent = 'ZIP で一括ダウンロード';
});
