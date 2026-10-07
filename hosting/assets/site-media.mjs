// SPDX-License-Identifier: AGPL-3.0-or-later
export function deferMedia(view, document) {
  const images = [...document.querySelectorAll('img[data-full-src]')];
  if (!images.length) return;
  const load = image => {
    const source = image.getAttribute('data-full-src');
    if (!source) return;
    const preview = image.getAttribute('src');
    image.addEventListener('error', () => { image.src = preview; }, { once: true });
    image.removeAttribute('data-full-src');
    image.src = source;
  };
  // 第二帧才观察图片，让正文与内嵌 Logo 先完成一次绘制。
  view.requestAnimationFrame(() => view.requestAnimationFrame(() => {
    if (typeof view.IntersectionObserver !== 'function') {
      images.forEach(load);
      return;
    }
    let remaining = images.length;
    const observer = new view.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !entry.target.hasAttribute('data-full-src')) continue;
        load(entry.target);
        observer.unobserve(entry.target);
        if (--remaining === 0) observer.disconnect();
      }
    }, { rootMargin: '200px 0px' });
    images.forEach(image => observer.observe(image));
  }));
}

if (typeof window !== 'undefined') deferMedia(window, document);
