// ui.messages.js
const TOASTS_ID = 'sysmsg-toasts';

function ensureToastsRoot() {
  let el = document.getElementById(TOASTS_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = TOASTS_ID;
    el.style.position = 'fixed';
    el.style.insetInlineEnd = '16px';
    el.style.insetBlockStart = '16px';
    el.style.zIndex = '9999';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.gap = '8px';
    document.body.appendChild(el);
  }
  return el;
}

function buildMessage(o) {
  const mode = o.mode || 'toast';
  const type = (o.type || 'info').toLowerCase();
  const title = o.title || '';
  const message = o.message || '';
  const dismissible = o.dismissible !== false;
  const timeout = Number.isFinite(o.timeout) ? o.timeout : 4000;

  const wrap = document.createElement('div');
  wrap.className = 'sysmsg sysmsg--' + (type === 'warning' ? 'warn' : type);
  wrap.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const icon = document.createElement('div');
  icon.className = 'sysmsg__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = type === 'error' ? '!' : (type.startsWith('warn') ? '⚠' : 'i');

  const body = document.createElement('div');
  body.className = 'sysmsg__body';

  const h = document.createElement('div');
  h.className = 'sysmsg__title';
  h.textContent = title;

  const p = document.createElement('p');
  p.className = 'sysmsg__text';
  p.textContent = message;

  body.appendChild(h);
  if (message) body.appendChild(p);

  if (Array.isArray(o.actions) && o.actions.length) {
    const actionsBox = document.createElement('div');
    actionsBox.className = 'sysmsg__actions';
    o.actions.forEach(a => {
      const b = document.createElement('button');
      b.className = 'sysmsg__btn';
      b.type = 'button';
      b.textContent = a.label || 'פעולה';
      b.addEventListener('click', (ev) => { try { a.onClick && a.onClick(ev); } catch (e) {} });
      actionsBox.appendChild(b);
    });
    body.appendChild(actionsBox);
  }

  wrap.appendChild(icon);
  wrap.appendChild(body);

  let timerId = null;
  let bar = null;

  function remove() {
    if (timerId) clearTimeout(timerId);
    wrap.style.transition = 'opacity .18s ease';
    wrap.style.opacity = '0';
    setTimeout(() => wrap.remove(), 180);
  }

  if (dismissible) {
    const x = document.createElement('button');
    x.className = 'sysmsg__close';
    x.setAttribute('aria-label', 'סגור הודעה');
    x.innerHTML = '&#x2715;';
    x.addEventListener('click', () => remove());
    wrap.appendChild(x);
  }

  if (mode === 'toast' && timeout > 0) {
    const pr = document.createElement('div');
    pr.className = 'sysmsg__progress';
    bar = document.createElement('div');
    bar.className = 'sysmsg__bar';
    pr.appendChild(bar);
    wrap.appendChild(pr);

    requestAnimationFrame(() => {
      const dur = Math.max(500, timeout);
      wrap.style.setProperty('--_dur', dur + 'ms');
      bar.style.transition = 'transform ' + dur + 'ms linear';
      bar.style.transform = 'scaleX(0)';
    });
  }

  return { wrap, remove, mode, timeout };
}

export const UIMessages = {
  /**
   * show({type,title,message,mode='toast',timeout=4000,dismissible=true,actions:[{label,onClick}],mount})
   */
  show(o) {
    const { wrap, remove, mode, timeout } = buildMessage(o);

    if (mode === 'toast') {
      const root = ensureToastsRoot();
      root.appendChild(wrap);
      if (timeout > 0) setTimeout(remove, timeout);
    } else {
      const mount = o.mount;
      if (!mount) throw new Error('Inline mode requires a mount element');
      wrap.classList.add('sysmsg-inline');
      mount.appendChild(wrap);
      if (timeout > 0) setTimeout(remove, timeout);
    }
    return { el: wrap, remove };
  },

  // תאימות לאחור – showAdvancedMessage(msg, level, opts)
  showAdvancedMessage(msg, level = 'info', opts = {}) {
    const map = { info: 'info', success: 'info', warning: 'warn', warn: 'warn', error: 'error', danger: 'error' };
    const type = map[level] || 'info';
    return this.show({
      type,
      title: opts.title || (type === 'error' ? 'שגיאה' : type === 'warn' ? 'אזהרה' : 'מידע'),
      message: msg,
      mode: opts.mode || 'toast',
      timeout: opts.timeout ?? 4000,
      dismissible: opts.dismissible !== false,
      actions: opts.actions,
      mount: opts.mount
    });
  }
};
