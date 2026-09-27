(function attachFieldGuideShare(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FieldGuideShare = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createFieldGuideShare() {
  'use strict';

  let captureLibraryPromise = null;

  function makeSharePayload(locationHref) {
    const url = new URL('/field-guide.html', locationHref).toString();
    return {
      title: '사주 도감 | 사주보는 수달',
      text: '나만의 사주 도감을 무료로 만들어 봐.',
      url,
    };
  }

  function loadCaptureLibrary() {
    if (typeof window.htmlToImage?.toPng === 'function') return Promise.resolve(window.htmlToImage);
    if (captureLibraryPromise) return captureLibraryPromise;
    captureLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/html-to-image.js';
      script.async = true;
      script.onload = () => {
        if (typeof window.htmlToImage?.toPng === 'function') resolve(window.htmlToImage);
        else {
          captureLibraryPromise = null;
          reject(new Error('이미지 저장 기능을 불러오지 못했어.'));
        }
      };
      script.onerror = () => {
        captureLibraryPromise = null;
        reject(new Error('이미지 저장 기능을 불러오지 못했어.'));
      };
      document.head.appendChild(script);
    });
    return captureLibraryPromise;
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('링크를 복사하지 못했어.');
  }

  async function saveReportImage(report) {
    if (!report) throw new Error('저장할 도감 결과를 찾지 못했어.');
    const imageLibrary = await loadCaptureLibrary();
    report.classList.add('fg-export');
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all([...report.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const height = Math.ceil(report.getBoundingClientRect().height);
      const imageUrl = await imageLibrary.toPng(report, {
        width: 1024,
        height,
        canvasWidth: 1024,
        canvasHeight: height,
        pixelRatio: 1,
        backgroundColor: '#FFF9EF',
      });
      const blob = await fetch(imageUrl).then((response) => response.blob());
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = '사주보는수달-사주도감.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } finally {
      report.classList.remove('fg-export');
    }
  }

  function bind(options) {
    const config = options || {};
    const actions = config.actions;
    const saveButton = config.saveButton;
    const shareButton = config.shareButton;
    const status = config.status;
    let busy = false;

    function setStatus(message) {
      if (status) status.textContent = message;
    }

    async function run(action, loadingMessage) {
      if (busy) return;
      busy = true;
      [saveButton, shareButton].filter(Boolean).forEach((item) => { item.disabled = true; });
      setStatus(loadingMessage);
      try {
        await action();
      } catch (error) {
        setStatus(error.message || '요청을 완료하지 못했어. 잠시 뒤 다시 시도해줘.');
      } finally {
        busy = false;
        [saveButton, shareButton].filter(Boolean).forEach((item) => { item.disabled = false; });
      }
    }

    if (saveButton) saveButton.addEventListener('click', () => run(async () => {
      await saveReportImage(typeof config.getReport === 'function' ? config.getReport() : null);
      setStatus('사주 도감을 PNG 이미지로 저장했어.');
    }, '1024px 이미지를 만들고 있어. 잠시만 기다려줘.'));

    if (shareButton) shareButton.addEventListener('click', () => run(async () => {
      const payload = makeSharePayload(window.location.href);
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share(payload);
          setStatus('도감 입력 링크를 공유했어.');
          return;
        } catch (error) {
          if (error && error.name === 'AbortError') return;
        }
      }
      await copyText(payload.url);
      setStatus('도감 입력 링크를 복사했어.');
    }, '도감 입력 링크를 준비하고 있어.'));

    return {
      show() { if (actions) actions.classList.remove('hidden'); },
      hide() { if (actions) actions.classList.add('hidden'); },
    };
  }

  return { makeSharePayload, bind, saveReportImage };
}));
