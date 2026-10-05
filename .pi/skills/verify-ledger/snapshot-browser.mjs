// Runs in the selected browser through chrome-devtools-axi, never in Node.
export async function capturePage(expectedOrigin) {
  if (location.origin !== expectedOrigin) throw new Error('Select the Doctor URL, not another site');
  if (!document.body.innerText.trim()) throw new Error('Blank page: reach and inspect the state before capturing');
  await document.fonts.ready;
  await Promise.all([...document.images].map(image => image.decode()));
  if (document.querySelector('canvas, iframe, video, audio, object, embed') ||
      [...document.querySelectorAll('*')].some(el => el.shadowRoot)) {
    throw new Error('Unsupported embedded/canvas/shadow content: supply a reviewed static replacement first');
  }
  const cache = new Map();
  async function inlineURL(value, base) {
    if (value.startsWith('#') || value.startsWith('data:')) return value;
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Unsupported asset protocol: ${url.protocol}`);
    if (!cache.has(url.href)) cache.set(url.href, (async () => {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`Asset failed: ${url.href} (${response.status})`);
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    })());
    return cache.get(url.href);
  }
  async function inlineCSS(text, base, ancestors = []) {
    // Ledger's emitted CSS and Google Fonts use ordinary quoted/unquoted url().
    // Refuse unfamiliar imports rather than returning a deceptively offline file.
    const imports = /@import\s+(?:url\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3)\s*([^;]*);/gi;
    let result = '', last = 0;
    for (const match of text.matchAll(imports)) {
      result += text.slice(last, match.index);
      const url = new URL(match[2] || match[4], base).href;
      if (ancestors.includes(url)) throw new Error('Circular CSS import');
      if (match[5].trim()) throw new Error('Qualified CSS import needs a reviewed static replacement');
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`Stylesheet failed: ${url}`);
      result += await inlineCSS(await response.text(), url, [...ancestors, url]);
      last = match.index + match[0].length;
    }
    result += text.slice(last);
    if (/@import\b/i.test(result)) throw new Error('Unsupported CSS import');
    const urls = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi;
    let output = ''; last = 0;
    for (const match of result.matchAll(urls)) {
      const value = match[1] ?? match[2] ?? match[3];
      if (value.includes('\\')) throw new Error('Escaped CSS URL needs a reviewed static replacement');
      output += result.slice(last, match.index) + `url("${await inlineURL(value, base)}")`;
      last = match.index + match[0].length;
    }
    return output + result.slice(last);
  }
  const css = [];
  for (const sheet of document.styleSheets) {
    if (sheet.disabled) continue;
    let text;
    if (sheet.href) {
      const response = await fetch(sheet.href, { credentials: 'omit' });
      if (!response.ok) throw new Error(`Stylesheet failed: ${sheet.href}`);
      text = await response.text();
    } else text = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
    text = await inlineCSS(text, sheet.href || document.baseURI);
    css.push(sheet.media.mediaText ? `@media ${sheet.media.mediaText}{${text}}` : text);
  }
  const clone = document.documentElement.cloneNode(true);
  const originals = [...document.querySelectorAll('*')];
  const copies = [...clone.querySelectorAll('*')];
  // document's list includes html, clone.querySelectorAll does not.
  originals.shift();
  for (let i = 0; i < originals.length; i++) {
    const source = originals[i], target = copies[i];
    if (source instanceof HTMLInputElement) {
      target.setAttribute('value', ['password', 'file'].includes(source.type) ? '' : source.value);
      target.toggleAttribute('checked', source.checked);
    }
    if (source instanceof HTMLTextAreaElement) target.textContent = source.value;
    if (source instanceof HTMLOptionElement) target.toggleAttribute('selected', source.selected);
    if (source instanceof HTMLImageElement) {
      target.setAttribute('src', await inlineURL(source.currentSrc || source.src, document.baseURI));
      target.removeAttribute('srcset'); target.removeAttribute('sizes'); target.removeAttribute('loading');
    }
    if (target.hasAttribute('style')) target.setAttribute('style', await inlineCSS(target.getAttribute('style'), document.baseURI));
    // Inline SVG icons are kept, but externally referenced SVGs are not silently lost.
    for (const name of ['href', 'xlink:href']) {
      if (target.namespaceURI === 'http://www.w3.org/2000/svg' && target.hasAttribute(name)) {
        const value = target.getAttribute(name);
        if (!value.startsWith('#') && !value.startsWith('data:')) throw new Error('External SVG reference needs a static replacement');
      }
    }
  }
  clone.querySelectorAll('script, link, style, base, meta[http-equiv], source').forEach(el => el.remove());
  for (const el of [clone, ...clone.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || ['action', 'formaction', 'ping', 'srcdoc', 'autofocus'].includes(attr.name)) el.removeAttribute(attr.name);
      if (attr.name === 'href' && el.namespaceURI !== 'http://www.w3.org/2000/svg') el.removeAttribute('href');
    }
  }
  const head = clone.querySelector('head');
  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";
  head.prepend(policy);
  const style = document.createElement('style');
  style.textContent = css.join('\n').replace(/<\/style/gi, '<\\/style');
  head.append(style);
  return {
    route: location.pathname + location.search,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    width: innerWidth, height: innerHeight,
    html: '<!doctype html>\n' + clone.outerHTML,
  };
}
