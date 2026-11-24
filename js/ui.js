// UI primitives: inline SVG icons, toasts, modals and form controls.

import { el, clamp } from './utils.js';
import { pushBack, releaseBack } from './backstack.js';

const P = {
  select: '<path d="M5 3l14 8-6 2-3 6z"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 013 0V12m0-6.5V4a1.5 1.5 0 013 0v8m0-6.5a1.5 1.5 0 013 0V13m0-4.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-2a6 6 0 01-5-2.7L4.5 14a1.6 1.6 0 012.6-1.9L8 13"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  quad: '<path d="M6 5l13 2-2 12-12-2z"/>',
  triangle: '<path d="M12 4l9 16H3z"/>',
  polygon: '<path d="M12 3l8 6-3 11H7L4 9z"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="6"/>',
  mesh: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
  mask: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l6-6 12 12M14 3l7 7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.1 3.9M6.6 6.6A17 17 0 002 12s3.5 7 10 7a9.7 9.7 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.8-1.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  left: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h3"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
  restart: '<path d="M5 4v16M19 4L9 12l10 8z" fill="currentColor"/>',
  loop: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>',
  record: '<circle cx="12" cy="12" r="7" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
  projector: '<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="16" cy="12" r="3"/><path d="M6 17v2M18 17v2M5 11h4"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  grid: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/>',
  magnet: '<path d="M6 3v9a6 6 0 0012 0V3h-4v9a2 2 0 01-4 0V3zM6 7h4M14 7h4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  more: '<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8l1.4 1.4M17.8 6.2l1.4-1.4M12.2 6.2l-1.4-1.4M15 9L3 21"/>',
  save: '<path d="M5 3h11l5 5v13H5z"/><path d="M8 3v5h8M8 21v-7h8v7"/>',
  folder: '<path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  cast: '<path d="M2 16a5 5 0 015 5M2 12a9 9 0 019 9M2 8V6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2h-6"/><circle cx="2.5" cy="20.5" r=".5" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  diamond: '<path d="M12 3l9 9-9 9-9-9z"/>',
  diamondFill: '<path d="M12 3l9 9-9 9-9-9z" fill="currentColor"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  cube: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/><circle cx="16" cy="10" r="1.3" fill="currentColor"/><path d="M12 21a2 2 0 010-4h1.5a2.5 2.5 0 000-5"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-4v12l-6-4z"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  room: '<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-7h6v7"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  move: '<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  split: '<path d="M12 3v18M3 12h4M17 12h4"/>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `ic ${cls}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.info}</svg>`;
  return span;
}

export function btn(iconName, label, onClick, opts = {}) {
  const b = el(`button.btn${opts.cls ? '.' + opts.cls.split(' ').join('.') : ''}`, {
    type: 'button',
    title: opts.title || label,
    'aria-label': opts.title || label,
    onclick: onClick,
    dataset: opts.dataset,
  });
  if (iconName) b.appendChild(icon(iconName));
  if (label && !opts.iconOnly) b.appendChild(el('span.lbl', label));
  if (opts.id) b.id = opts.id;
  return b;
}

// ---------------------------------------------------------------- toasts

let toastHost = null;
export function toast(message, { type = 'info', duration = 3500, action = null } = {}) {
  if (!toastHost) {
    toastHost = el('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  const t = el(`div.toast.${type}`, el('span', message));
  if (action) {
    t.appendChild(
      el('button.toast-action', { type: 'button', onclick: () => {
        action.run();
        t.remove();
      } }, action.label),
    );
  }
  t.appendChild(el('button.toast-close', { type: 'button', 'aria-label': 'Fechar', onclick: () => t.remove() }, '×'));
  toastHost.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  if (duration > 0)
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, duration);
  return t;
}

// ---------------------------------------------------------------- modals

const openModals = [];
export function modal({ title, content, actions = [], cls = '', onClose = null, dismissable = true, wide = false }) {
  const backdrop = el('div.modal-backdrop');
  const box = el(`div.modal${cls ? '.' + cls : ''}${wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  let backId = null;
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('show');
    const i = openModals.indexOf(api);
    if (i >= 0) openModals.splice(i, 1);
    if (backId) releaseBack(backId);
    setTimeout(() => backdrop.remove(), 200);
    onClose?.(result);
  };
  const head = el('div.modal-head', el('h2', title));
  if (dismissable) head.appendChild(btn('close', 'Fechar', () => close(null), { iconOnly: true, cls: 'ghost' }));
  const body = el('div.modal-body');
  if (typeof content === 'string') body.innerHTML = content;
  else if (content) body.appendChild(content);
  const foot = el('div.modal-foot');
  for (const a of actions) {
    const b = el(`button.btn${a.primary ? '.primary' : ''}${a.danger ? '.danger' : ''}`, { type: 'button' }, a.icon ? icon(a.icon) : null, el('span.lbl', a.label));
    b.addEventListener('click', async () => {
      const r = a.run ? await a.run(api) : a.value;
      if (r !== false) close(a.value ?? r);
    });
    foot.appendChild(b);
  }
  box.append(head, body);
  if (actions.length) box.appendChild(foot);
  backdrop.appendChild(box);
  if (dismissable) backdrop.addEventListener('pointerdown', (e) => e.target === backdrop && close(null));
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));
  const api = { close, body, box, backdrop };
  openModals.push(api);
  if (dismissable)
    backId = pushBack(() => {
      backId = null;
      close(null);
    });
  setTimeout(() => box.querySelector('input,button.primary,button')?.focus?.({ preventScroll: true }), 50);
  return api;
}

export function closeTopModal() {
  const m = openModals[openModals.length - 1];
  if (m) {
    m.close(null);
    return true;
  }
  return false;
}
export const hasOpenModal = () => openModals.length > 0;

export function confirmDialog(title, message, { okLabel = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    modal({
      title,
      content: el('p', message),
      actions: [
        { label: 'Cancelar', value: false },
        { label: okLabel, value: true, primary: !danger, danger },
      ],
      onClose: (r) => resolve(!!r),
    });
  });
}

export function promptDialog(title, label, value = '') {
  return new Promise((resolve) => {
    const input = el('input.input', { type: 'text', value, 'aria-label': label });
    const wrap = el('label.field', el('span', label), input);
    let m;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') m.close(input.value);
    });
    m = modal({
      title,
      content: wrap,
      actions: [
        { label: 'Cancelar', value: null },
        { label: 'OK', primary: true, run: () => input.value },
      ],
      onClose: (r) => resolve(r === null || r === undefined ? null : String(r)),
    });
    setTimeout(() => input.select(), 60);
  });
}

// ---------------------------------------------------------------- controls

/** Slider + numeric input. get() returns the current value, set(v, final) applies it. */
export function sliderRow({ label, min, max, step = 0.01, unit = '', get, set, display = null, keyBtn = null }) {
  const range = el('input.range', { type: 'range', min, max, step, 'aria-label': label });
  const num = el('input.num', { type: 'number', min, max, step, 'aria-label': `${label} (valor)` });
  const toDisp = display?.to || ((v) => v);
  const fromDisp = display?.from || ((v) => v);
  const refresh = () => {
    const v = get();
    if (document.activeElement !== range) range.value = v;
    if (document.activeElement !== num) {
      const dv = toDisp(v);
      num.value = Number.isInteger(+step) && +step >= 1 ? Math.round(dv) : +(+dv).toFixed(3);
    }
  };
  range.addEventListener('input', () => {
    set(+range.value, false);
    num.value = +(+toDisp(+range.value)).toFixed(3);
  });
  range.addEventListener('change', () => set(+range.value, true));
  num.addEventListener('change', () => {
    const v = fromDisp(+num.value);
    if (Number.isFinite(v)) set(clamp(v, display ? -Infinity : +min, display ? Infinity : +max), true);
    refresh();
  });
  const row = el('div.ctl.slider', el('label.ctl-label', label, unit ? el('small', ` ${unit}`) : null), el('div.ctl-input', range, num, keyBtn));
  row.refresh = refresh;
  refresh();
  return row;
}

export function colorRow({ label, get, set }) {
  const input = el('input.color', { type: 'color', 'aria-label': label });
  const refresh = () => {
    if (document.activeElement !== input) input.value = get();
  };
  input.addEventListener('input', () => set(input.value, false));
  input.addEventListener('change', () => set(input.value, true));
  const row = el('div.ctl.colorrow', el('label.ctl-label', label), el('div.ctl-input', input));
  row.refresh = refresh;
  refresh();
  return row;
}

export function selectRow({ label, options, get, set }) {
  const s = el('select.select', { 'aria-label': label });
  for (const o of options) s.appendChild(el('option', { value: o.value }, o.label));
  const refresh = () => {
    if (document.activeElement !== s) s.value = get();
  };
  s.addEventListener('change', () => set(s.value, true));
  const row = el('div.ctl', el('label.ctl-label', label), el('div.ctl-input', s));
  row.refresh = refresh;
  refresh();
  return row;
}

export function toggleRow({ label, get, set, hint = null }) {
  const input = el('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
  const refresh = () => {
    input.checked = !!get();
  };
  input.addEventListener('change', () => set(input.checked, true));
  const row = el('label.ctl.toggle', el('span.ctl-label', label, hint ? el('small.hint', hint) : null), el('span.switch', input, el('span.knob')));
  row.refresh = refresh;
  refresh();
  return row;
}

export function segmented({ options, get, set, label = '' }) {
  const wrap = el('div.segmented', { role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((o) => {
    const b = el('button', { type: 'button', role: 'radio', title: o.title || o.label, onclick: () => set(o.value, true) }, o.icon ? icon(o.icon) : null, o.label ? el('span', o.label) : null);
    b.dataset.value = o.value;
    wrap.appendChild(b);
    return b;
  });
  wrap.refresh = () => {
    const v = get();
    buttons.forEach((b) => {
      const on = b.dataset.value === String(v);
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on);
    });
  };
  wrap.refresh();
  return wrap;
}

export function section(title, body, { open = true, iconName = null, actions = null } = {}) {
  const d = el('details.section', { open });
  d.appendChild(el('summary', iconName ? icon(iconName) : null, el('span', title), actions ? el('span.sec-actions', actions) : null));
  d.appendChild(el('div.section-body', body));
  return d;
}
