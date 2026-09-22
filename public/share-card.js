/* 무료 결과 요약 카드를 PNG로 만들고 저장·공유하는 공용 브라우저 도구. */
(function (root) {
  'use strict';

  function clean(value) {
    return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
  }

  function normalizeFilename(value) {
    const base = clean(value || '사주보는수달-무료결과')
      .replace(/\.png$/i, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return (base || '사주보는수달-무료결과') + '.png';
  }

  function normalizePayload(input) {
    const data = input || {};
    return {
      title: clean(data.title),
      headline: clean(data.headline),
      lines: (Array.isArray(data.lines) ? data.lines : [data.lines])
        .map(clean).filter(Boolean).slice(0, 4),
      filename: normalizeFilename(data.filename || data.title),
      shareText: clean(data.shareText) || '내 무료 사주 결과를 한 장으로 정리했어요.'
    };
  }

  function wrapText(ctx, text, maxWidth, maxLines) {
    const result = [];
    const chunks = clean(text).split(/\n/);
    for (const chunk of chunks) {
      let line = '';
      for (const char of chunk) {
        const next = line + char;
        if (line && ctx.measureText(next).width > maxWidth) {
          result.push(line);
          line = char;
        } else {
          line = next;
        }
      }
      if (line) result.push(line);
    }
    if (maxLines && result.length > maxLines) {
      const clipped = result.slice(0, maxLines);
      let last = clipped[maxLines - 1] || '';
      while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      clipped[maxLines - 1] = last + '…';
      return clipped;
    }
    return result;
  }

  function drawRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('이미지 변환 실패')), 'image/png');
    });
  }

  async function createImage(input) {
    const data = normalizePayload(input);
    if (typeof document === 'undefined') throw new Error('이미지 기능을 사용할 수 없는 환경이에요');

    const width = 1200;
    const height = 960;
    const pad = 72;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f7f1e7';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#16253d';
    ctx.fillRect(0, 0, width, 16);

    ctx.fillStyle = '#927342';
    ctx.font = '700 24px "Malgun Gothic", sans-serif';
    ctx.fillText('사주보는 수달', pad, 82);
    ctx.fillStyle = '#7d8794';
    ctx.font = '600 20px "Malgun Gothic", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('무료 결과 카드', width - pad, 82);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#16253d';
    ctx.font = '800 46px "Malgun Gothic", sans-serif';
    const titleLines = wrapText(ctx, data.title || '무료 사주 결과', width - pad * 2, 2);
    let y = 180;
    titleLines.forEach((line) => { ctx.fillText(line, pad, y); y += 58; });

    ctx.fillStyle = '#927342';
    ctx.fillRect(pad, y + 4, 56, 5);
    y += 66;

    ctx.fillStyle = '#263750';
    ctx.font = '700 30px "Malgun Gothic", sans-serif';
    wrapText(ctx, data.headline || '오늘의 나를 한 장에 담았어요.', width - pad * 2, 3)
      .forEach((line) => { ctx.fillText(line, pad, y); y += 44; });
    y += 18;

    ctx.fillStyle = '#5d6878';
    ctx.font = '500 24px "Malgun Gothic", sans-serif';
    const lineHeight = 42;
    data.lines.forEach((line) => {
      const wrapped = wrapText(ctx, line, width - pad * 2 - 32, 2);
      wrapped.forEach((wrappedLine, index) => {
        if (index === 0) {
          ctx.fillStyle = '#927342';
          ctx.beginPath();
          ctx.arc(pad + 8, y - 8, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#5d6878';
        ctx.fillText(wrappedLine, pad + 30, y);
        y += lineHeight;
      });
      y += 7;
    });

    ctx.fillStyle = '#a0a7b0';
    ctx.font = '500 18px "Malgun Gothic", sans-serif';
    ctx.fillText('생년월일을 기준으로 계산한 참고용 리딩입니다.', pad, height - 72);
    ctx.textAlign = 'right';
    ctx.fillText('sajuotter.com', width - pad, height - 72);
    ctx.textAlign = 'left';

    return { blob: await canvasToBlob(canvas), filename: data.filename, data };
  }

  function saveBlob(blob, filename) {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      throw new Error('이미지를 저장할 수 없는 환경이에요');
    }
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.download = filename;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function shareBlob(blob, input, onFallback) {
    const data = normalizePayload(input);
    const file = typeof File === 'undefined' ? null : new File([blob], data.filename, { type: 'image/png' });
    if (file && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const canShare = typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
      if (canShare) {
        try {
          await navigator.share({ files: [file], title: data.title, text: data.shareText });
          return 'shared';
        } catch (error) {
          if (error && error.name === 'AbortError') return 'cancelled';
        }
      }
    }
    saveBlob(blob, data.filename);
    if (typeof onFallback === 'function') onFallback('이 브라우저는 이미지 공유를 지원하지 않아 파일로 저장했어요');
    return 'saved';
  }

  function bind(options) {
    const config = options || {};
    const buttons = [config.saveButton, config.shareButton].filter(Boolean);
    let busy = false;
    const status = (message) => {
      if (typeof config.onStatus === 'function') config.onStatus(message);
    };
    const run = async (action) => {
      if (busy) return;
      busy = true;
      buttons.forEach((button) => { button.disabled = true; });
      try {
        const payload = typeof config.getPayload === 'function' ? await config.getPayload() : {};
        const image = await createImage(payload);
        await action(image, image.data);
      } catch (error) {
        status('이미지를 만들지 못했어요. 잠시 후 다시 시도해주세요.');
      } finally {
        busy = false;
        buttons.forEach((button) => { button.disabled = false; });
      }
    };
    if (config.saveButton) config.saveButton.addEventListener('click', () => run((image) => {
      saveBlob(image.blob, image.filename);
      status('이미지를 저장했어요');
    }));
    if (config.shareButton) config.shareButton.addEventListener('click', () => run((image, data) =>
      shareBlob(image.blob, data, status)));
  }

  const api = { normalizePayload, wrapText, createImage, saveBlob, shareBlob, bind };
  root.ShareCard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
