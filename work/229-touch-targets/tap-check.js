// Phone tap-area check (T28d). Evaluate in the page at 390px wide:
//   chrome-devtools-axi eval "$(cat work/229-touch-targets/tap-check.js)"
// Returns { checked, tooSmall[], overlaps[] }. A control's tap area is its box, plus its
// ::after box when that is positioned (the invisible .tap-area / SegmentedControl area).
// Disabled-looking and hidden elements are skipped; sizes allow 0.5px rounding.
(() => {
  const SEL = 'button, a[href], [role="button"], [role="switch"], [role="tab"], input[type="checkbox"], input[type="radio"], summary, select';
  const MIN = 43.5;
  const describe = (el) => `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''} "${(el.textContent || '').trim().slice(0, 24)}"`;
  const areaOf = (el) => {
    const r = el.getBoundingClientRect();
    let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    const a = getComputedStyle(el, '::after');
    if (a.content !== 'none' && a.position === 'absolute' && parseFloat(a.width) > 0) {
      const w = parseFloat(a.width), h = parseFloat(a.height);
      if (a.left !== 'auto' && a.transform !== 'none') { // centred area (.tap-area)
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        box = { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
      } else { // inset area (SegmentedControl): edges offset from the button
        const top = parseFloat(a.top), bottom = parseFloat(a.bottom), left = parseFloat(a.left), right = parseFloat(a.right);
        box = { l: r.left + left, t: r.top + top, r: r.right - right, b: r.bottom - bottom };
      }
    }
    return box;
  };
  const els = [...document.querySelectorAll(SEL)].filter((el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && !el.closest('[aria-hidden="true"], [hidden]');
  });
  const items = els.map((el) => ({ el, a: areaOf(el) }));
  const tooSmall = items.filter(({ a }) => a.r - a.l < MIN || a.b - a.t < MIN)
    .map(({ el, a }) => `${describe(el)} ${Math.round(a.r - a.l)}x${Math.round(a.b - a.t)}`);
  const overlaps = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const x = items[i], y = items[j];
    if (x.el.contains(y.el) || y.el.contains(x.el)) continue;
    const w = Math.min(x.a.r, y.a.r) - Math.max(x.a.l, y.a.l), h = Math.min(x.a.b, y.a.b) - Math.max(x.a.t, y.a.t);
    if (w > 1 && h > 1) overlaps.push(`${describe(x.el)} / ${describe(y.el)} (${Math.round(w)}x${Math.round(h)})`);
  }
  return { checked: items.length, tooSmall, overlaps };
})()
