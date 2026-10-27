export function safeResource(value, base) {
  try {
    const u = new URL(value, base);
    return ['http:', 'https:', 'file:', 'blob:', 'data:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}
export function sourceSet(value, base) {
  // A data URL contains commas of its own; the displayed currentSrc remains a fallback.
  if (!value || value.trim().startsWith('data:')) return [];
  return value.split(',').map(part => {
    const [url, descriptor] = part.trim().split(/\s+/);
    return {url: safeResource(url, base), size: parseFloat(descriptor) || 1};
  }).filter(v => v.url).sort((a,b) => b.size - a.size);
}
export function imageCandidates(image) {
  const base = image.baseURI, values = [], seen = new Set();
  const add = (url, reason, priority) => {
    url = safeResource(url, base);
    if (url && !seen.has(url)) { seen.add(url); values.push({url, reason, priority}); }
  };
  const anchor = image.closest('a[href]');
  if (anchor && (/\.(?:jpe?g|png|webp|avif|gif|tiff?|bmp)(?:[?#]|$)/i.test(anchor.href) || anchor.hasAttribute('download') || /^image\//.test(anchor.type))) add(anchor.href, 'linked-original', 100);
  for (const node of [image, image.closest('figure'), anchor].filter(Boolean))
    for (const key of ['data-original', 'data-orig-file', 'data-full', 'data-full-src', 'data-fullsize', 'data-large-file', 'data-zoom-image', 'data-hires', 'data-original-src'])
      if (node.getAttribute(key)) add(node.getAttribute(key), key, 95);
  for (const source of [...(image.closest('picture')?.querySelectorAll('source') || []), image])
    for (const item of sourceSet(source.getAttribute('srcset') || source.getAttribute('data-srcset'), base)) add(item.url, 'srcset', 80 + Math.min(10, item.size / 1000));
  for (const key of ['data-src', 'data-lazy-src']) if (image.getAttribute(key)) add(image.getAttribute(key), key, 60);
  add(image.currentSrc || image.src || image.href?.baseVal, 'displayed-source', 20);
  if (image.src) add(image.src, 'src', 10);
  return {candidates: values.sort((a,b) => b.priority - a.priority).slice(0, 12),
    linkedPage: anchor && !seen.has(anchor.href) ? safeResource(anchor.href, base) : null,
    displayedURL: image.currentSrc || image.src || '', name: image.alt || '', sourcePage: location.href};
}
export function linkedPageCandidates(html, base) {
  const doc = new DOMParser().parseFromString(html, 'text/html'), found = [], seen = new Set();
  const add = (url, reason, priority) => { url = safeResource(url, base); if (url && !seen.has(url)) { seen.add(url); found.push({url, reason, priority}); } };
  for (const node of doc.querySelectorAll('a[href]')) if (/\.(?:jpe?g|png|webp|avif|tiff?)(?:[?#]|$)/i.test(node.getAttribute('href'))) add(node.getAttribute('href'), 'linked-page-image', 90);
  for (const node of doc.querySelectorAll('link[rel="image_src"], meta[property="og:image"], meta[name="twitter:image"]')) add(node.getAttribute('href') || node.getAttribute('content'), 'linked-page-metadata', 70);
  return found.slice(0, 8);
}
