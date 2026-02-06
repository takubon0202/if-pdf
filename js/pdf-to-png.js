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

formatSelect.addEventListener('change', () => {
  qualityLabel.style.display = FORMAT_CONFIG[formatSelect.value].hasQuality ? '' : 'none';
});
qualityRange.addEventListener('input', () => { qualityValue.textContent = qualityRange.value + '%'; });

setupDropArea('png-drop-area', 'png-file-input', files => {
  const f = files.find(f => f.type === 'application/pdf');
  if (f) { selectedFile = f; convertPdf(); }
});

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
  setProgress('png-progress-fill', 'png-progress-text', 0, '読み込み中...');
  resultsDiv.innerHTML = '';
  downloadAllDiv.style.display = 'none';
  imageBlobs = [];
  reconvertBtn.disabled = true;

  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const total = pdf.numPages;
    for (let i = 1; i <= total; i++) {
      setProgress('png-progress-fill', 'png-progress-text', (i / total) * 100, `変換中... ${i} / ${total} ページ`);
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      if (fmt.mime !== 'image/png') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(r => canvas.toBlob(r, fmt.mime, quality));
      const baseName = selectedFile.name.replace(/\.pdf$/i, '');
      const fileName = `${baseName}_page${i}.${fmt.ext}`;
      imageBlobs.push({ blob, name: fileName });
      const url = URL.createObjectURL(blob);
      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `<img src="${url}" alt="Page ${i}"><div class="card-footer"><span>ページ ${i}</span><a href="${url}" download="${fileName}" class="btn small primary">保存</a></div>`;
      resultsDiv.appendChild(card);
    }
    setProgress('png-progress-fill', 'png-progress-text', 100, `完了! ${total} ページを ${fmt.ext.toUpperCase()} に変換しました`);
    if (imageBlobs.length > 1) downloadAllDiv.style.display = 'block';
  } catch (err) {
    setProgress('png-progress-fill', 'png-progress-text', 100, 'エラー: ' + err.message);
  } finally { isConverting = false; reconvertBtn.disabled = false; }
}

reconvertBtn.addEventListener('click', () => { if (selectedFile) convertPdf(); });

document.getElementById('png-reset-btn').addEventListener('click', () => {
  selectedFile = null; imageBlobs = [];
  dropArea.style.display = ''; optionsDiv.style.display = 'none';
  progressDiv.style.display = 'none'; resultsDiv.innerHTML = '';
  downloadAllDiv.style.display = 'none';
});

downloadZipBtn.addEventListener('click', async () => {
  downloadZipBtn.disabled = true; downloadZipBtn.textContent = 'ZIP作成中...';
  const zip = new JSZip();
  for (const { blob, name } of imageBlobs) zip.file(name, blob);
  const content = await zip.generateAsync({ type: 'blob' });
  downloadBlob(content, selectedFile.name.replace(/\.pdf$/i, '') + '_pages.zip');
  downloadZipBtn.disabled = false; downloadZipBtn.textContent = 'ZIP で一括ダウンロード';
});

// Export pdfjsLib for other modules
window._pdfjsLib = pdfjsLib;
