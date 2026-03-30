(function () {
  // ===== DOM References =====
  const widthInput = document.getElementById('hti-width');
  const formatSelect = document.getElementById('hti-format');
  const bgInput = document.getElementById('hti-bg');
  const codeArea = document.getElementById('hti-code');
  const convertBtn = document.getElementById('hti-btn');
  const resultDiv = document.getElementById('hti-result');
  const previewImg = document.getElementById('hti-preview-img');
  const downloadBtn = document.getElementById('hti-download');
  const retryBtn = document.getElementById('hti-retry');
  const progressDiv = document.getElementById('hti-progress');
  const uiDiv = document.getElementById('hti-ui');

  // ===== State =====
  var resultBlob = null;
  var resultUrl = null;
  var previewDebounceTimer = null;

  // ===== Dynamic UI: Template buttons =====
  var templates = {
    'シンプル': '<div style="padding:40px;font-family:sans-serif"><h1 style="color:#333">タイトル</h1><p>テキストを入力</p></div>',
    'カード': '<div style="padding:24px;font-family:sans-serif;max-width:360px">\n  <div style="background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);overflow:hidden">\n    <div style="height:180px;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.2em">画像エリア</div>\n    <div style="padding:20px">\n      <h2 style="margin:0 0 8px;color:#333">カードタイトル</h2>\n      <p style="margin:0;color:#666;line-height:1.6">ここにカードの説明文を入力してください。</p>\n    </div>\n  </div>\n</div>',
    'バナー': '<div style="width:100%;padding:60px 40px;background:linear-gradient(135deg,#f093fb 0%,#f5576c 50%,#4facfe 100%);text-align:center;font-family:sans-serif;box-sizing:border-box">\n  <h1 style="color:#fff;font-size:2.5em;margin:0 0 16px;text-shadow:0 2px 8px rgba(0,0,0,0.2)">セールバナー</h1>\n  <p style="color:rgba(255,255,255,0.9);font-size:1.3em;margin:0 0 24px">期間限定キャンペーン実施中!</p>\n  <span style="display:inline-block;background:#fff;color:#f5576c;padding:12px 32px;border-radius:30px;font-weight:bold;font-size:1.1em">詳しく見る</span>\n</div>',
    '名刺': '<div style="width:350px;height:200px;padding:24px 28px;font-family:sans-serif;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between">\n  <div>\n    <div style="font-size:0.75em;color:#888;letter-spacing:2px;margin-bottom:4px">株式会社サンプル</div>\n    <div style="font-size:1.4em;font-weight:bold;color:#222">山田 太郎</div>\n    <div style="font-size:0.85em;color:#666;margin-top:2px">フロントエンドエンジニア</div>\n  </div>\n  <div style="font-size:0.8em;color:#555;line-height:1.7;border-top:1px solid #eee;padding-top:10px">\n    <div>TEL: 03-1234-5678</div>\n    <div>Email: taro@example.com</div>\n    <div>Web: https://example.com</div>\n  </div>\n</div>'
  };

  // Create template button row
  var templateRow = document.createElement('div');
  templateRow.style.cssText = 'margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;';
  var templateLabel = document.createElement('span');
  templateLabel.textContent = 'テンプレート: ';
  templateLabel.style.cssText = 'font-size:0.9em;color:#666;align-self:center;';
  templateRow.appendChild(templateLabel);

  Object.keys(templates).forEach(function (name) {
    var btn = document.createElement('button');
    btn.textContent = name;
    btn.className = 'btn small secondary';
    btn.style.cssText = 'font-size:0.85em;padding:4px 12px;';
    btn.addEventListener('click', function () {
      codeArea.value = templates[name];
      codeArea.dispatchEvent(new Event('input'));
    });
    templateRow.appendChild(btn);
  });

  // Insert template row before the textarea
  if (codeArea && codeArea.parentNode) {
    codeArea.parentNode.insertBefore(templateRow, codeArea);
  }

  // ===== Dynamic UI: Character count =====
  var charCountDiv = document.createElement('div');
  charCountDiv.style.cssText = 'text-align:right;font-size:0.8em;color:#999;margin-top:2px;margin-bottom:8px;';
  charCountDiv.textContent = '文字数: 0';
  if (codeArea && codeArea.nextSibling) {
    codeArea.parentNode.insertBefore(charCountDiv, codeArea.nextSibling);
  } else if (codeArea && codeArea.parentNode) {
    codeArea.parentNode.appendChild(charCountDiv);
  }

  function updateCharCount() {
    charCountDiv.textContent = '文字数: ' + codeArea.value.length;
  }

  // ===== Dynamic UI: JPEG quality slider =====
  var qualityWrapper = document.createElement('label');
  qualityWrapper.style.cssText = 'display:none;';
  qualityWrapper.textContent = '品質: ';
  var qualitySlider = document.createElement('input');
  qualitySlider.type = 'range';
  qualitySlider.id = 'hti-quality';
  qualitySlider.min = '10';
  qualitySlider.max = '100';
  qualitySlider.value = '92';
  qualitySlider.style.cssText = 'vertical-align:middle;width:100px;';
  var qualityValueSpan = document.createElement('span');
  qualityValueSpan.textContent = '92';
  qualityWrapper.appendChild(qualitySlider);
  qualityWrapper.appendChild(qualityValueSpan);

  // Insert quality control into the options row
  var optionsDiv = uiDiv ? uiDiv.querySelector('.options') : null;
  if (optionsDiv) {
    optionsDiv.appendChild(qualityWrapper);
  }

  qualitySlider.addEventListener('input', function () {
    qualityValueSpan.textContent = qualitySlider.value;
  });

  function updateQualityVisibility() {
    qualityWrapper.style.display = formatSelect.value === 'jpeg' ? '' : 'none';
  }

  formatSelect.addEventListener('change', updateQualityVisibility);
  updateQualityVisibility();

  // ===== Dynamic UI: Live preview iframe =====
  var previewWrapper = document.createElement('div');
  previewWrapper.style.cssText =
    'margin:10px 0;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;' +
    'max-height:250px;background:#fafafa;display:none;position:relative;';

  var previewLabel = document.createElement('div');
  previewLabel.style.cssText =
    'font-size:0.75em;color:#999;padding:4px 8px;background:#f5f5f5;border-bottom:1px solid #e0e0e0;';
  previewLabel.textContent = 'ライブプレビュー';
  previewWrapper.appendChild(previewLabel);

  var previewIframe = document.createElement('iframe');
  previewIframe.style.cssText =
    'width:100%;height:200px;border:none;background:#fff;pointer-events:none;';
  previewIframe.sandbox = 'allow-same-origin';
  previewWrapper.appendChild(previewIframe);

  // Insert the preview after the char count div
  if (charCountDiv && charCountDiv.parentNode) {
    charCountDiv.parentNode.insertBefore(previewWrapper, charCountDiv.nextSibling);
  }

  function updateLivePreview() {
    var html = codeArea.value.trim();
    if (!html) {
      previewWrapper.style.display = 'none';
      return;
    }
    previewWrapper.style.display = '';
    try {
      var doc = previewIframe.contentDocument || previewIframe.contentWindow.document;
      doc.open();
      doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:8px;font-family:sans-serif;background:' + (bgInput.value || '#ffffff') + ';}</style></head><body>' + html + '</body></html>');
      doc.close();
    } catch (e) {
      // Silently fail for cross-origin or sandbox issues
    }
  }

  // ===== Textarea input handler =====
  codeArea.addEventListener('input', function () {
    updateCharCount();
    clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(updateLivePreview, 500);
  });

  // Also update preview when background color changes
  bgInput.addEventListener('input', function () {
    clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(updateLivePreview, 300);
  });

  // ===== Convert button =====
  convertBtn.addEventListener('click', async function () {
    var html = codeArea.value.trim();
    if (!html) {
      alert('HTMLコードを入力してください。');
      return;
    }

    // Basic HTML validation
    var validationError = validateHtml(html);
    if (validationError) {
      if (!confirm(validationError + '\n\nそのまま変換を続けますか?')) {
        return;
      }
    }

    var containerWidth = parseInt(widthInput.value) || 800;
    if (containerWidth < 100 || containerWidth > 3000) {
      alert('幅は100〜3000pxの範囲で指定してください。');
      return;
    }

    var bgColor = bgInput.value || '#ffffff';
    var format = formatSelect.value; // 'png' or 'jpeg'

    convertBtn.disabled = true;
    progressDiv.style.display = 'block';
    setProgress('hti-progress-fill', 'hti-progress-text', 10, 'HTMLをレンダリング中...');

    // Create temporary hidden div
    var tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    tempDiv.style.width = containerWidth + 'px';
    tempDiv.style.backgroundColor = bgColor;
    tempDiv.style.overflow = 'hidden';
    tempDiv.innerHTML = html;
    document.body.appendChild(tempDiv);

    try {
      setProgress('hti-progress-fill', 'hti-progress-text', 30, 'html2canvasで変換中...');

      var renderCanvas = await html2canvas(tempDiv, {
        width: containerWidth,
        backgroundColor: bgColor,
        useCORS: true,
        logging: false
      });

      setProgress('hti-progress-fill', 'hti-progress-text', 70, '画像を生成中...');

      // Convert canvas to blob
      var mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      var quality = format === 'jpeg' ? (parseInt(qualitySlider.value) / 100) : undefined;

      resultBlob = await new Promise(function (resolve, reject) {
        renderCanvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('画像の生成に失敗しました'));
        }, mimeType, quality);
      });

      // Clean up previous URL
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(resultBlob);

      // Show result
      previewImg.src = resultUrl;
      uiDiv.style.display = 'none';
      resultDiv.style.display = '';

      setProgress('hti-progress-fill', 'hti-progress-text', 100, '完了!');

      // BUG FIX 1: Hide progress bar after successful conversion
      progressDiv.style.display = 'none';
    } catch (err) {
      var userMessage = friendlyErrorMessage(err);
      setProgress('hti-progress-fill', 'hti-progress-text', 100, 'エラー: ' + userMessage);

      // BUG FIX 2: Ensure UI stays visible so user can retry
      uiDiv.style.display = '';
    } finally {
      // Remove temporary div
      if (tempDiv.parentNode) {
        document.body.removeChild(tempDiv);
      }
      convertBtn.disabled = false;
    }
  });

  // ===== HTML validation helper =====
  function validateHtml(html) {
    // Check for unclosed tags (simple heuristic)
    var openTags = [];
    var tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*\/?>/g;
    var selfClosing = ['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
    var match;

    while ((match = tagPattern.exec(html)) !== null) {
      var fullMatch = match[0];
      var tagName = match[1].toLowerCase();

      if (selfClosing.indexOf(tagName) !== -1) continue;
      if (fullMatch.indexOf('/>') !== -1) continue;

      if (fullMatch.charAt(1) === '/') {
        // Closing tag
        if (openTags.length > 0 && openTags[openTags.length - 1] === tagName) {
          openTags.pop();
        }
      } else {
        // Opening tag
        openTags.push(tagName);
      }
    }

    if (openTags.length > 0) {
      return '閉じられていないタグがあります: <' + openTags[openTags.length - 1] + '>';
    }

    // Check for <script> tags (security concern)
    if (/<script[\s>]/i.test(html)) {
      return '<script>タグが含まれています。セキュリティ上の理由から削除することを推奨します。';
    }

    return null;
  }

  // ===== Friendly error messages =====
  function friendlyErrorMessage(err) {
    var msg = err.message || String(err);

    if (msg.indexOf('SecurityError') !== -1 || msg.indexOf('cross-origin') !== -1) {
      return '外部リソース(画像やフォント)の読み込みに失敗しました。CORSの制限により、外部URLは使用できない場合があります。';
    }
    if (msg.indexOf('tainted') !== -1) {
      return '外部画像を使用しているため、キャンバスが汚染されました。画像のURLを確認してください。';
    }
    if (msg.indexOf('memory') !== -1 || msg.indexOf('allocation') !== -1) {
      return 'メモリ不足です。HTMLの幅を小さくするか、内容を簡略化してください。';
    }

    return msg;
  }

  // ===== Download =====
  downloadBtn.addEventListener('click', function () {
    if (!resultBlob) return;
    var format = formatSelect.value;
    var ext = format === 'jpeg' ? '.jpg' : '.png';
    downloadBlob(resultBlob, 'html-to-image' + ext);
  });

  // ===== Retry =====
  retryBtn.addEventListener('click', function () {
    resultDiv.style.display = 'none';
    uiDiv.style.display = '';
    progressDiv.style.display = 'none';
  });
})();
