/**
 * Lightweight toast feedback for success / warning / error.
 * Host element: #toastHost (created if missing).
 */

let hostEl = null;
let hideTimer = null;

function ensureHost() {
  if (hostEl && document.body.contains(hostEl)) return hostEl;
  hostEl = document.getElementById('toastHost');
  if (!hostEl) {
    hostEl = document.createElement('div');
    hostEl.id = 'toastHost';
    hostEl.className = 'toast-host';
    hostEl.setAttribute('aria-live', 'polite');
    hostEl.setAttribute('aria-atomic', 'true');
    document.body.appendChild(hostEl);
  }
  return hostEl;
}

/**
 * @param {string} message
 * @param {'ok'|'warn'|'error'|'info'} [type='info']
 * @param {{ duration?: number }} [opts]
 */
export function showToast(message, type = 'info', opts = {}) {
  if (!message) return;
  const host = ensureHost();
  const duration = typeof opts.duration === 'number' ? opts.duration : 2600;

  host.innerHTML = '';
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  toast.appendChild(text);

  host.appendChild(toast);
  // force reflow so enter transition runs
  // eslint-disable-next-line no-unused-expressions
  toast.offsetWidth;
  toast.classList.add('is-visible');

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 220);
  }, duration);
}

export function createToastApi() {
  return {
    ok: (msg, opts) => showToast(msg, 'ok', opts),
    warn: (msg, opts) => showToast(msg, 'warn', opts),
    error: (msg, opts) => showToast(msg, 'error', opts),
    info: (msg, opts) => showToast(msg, 'info', opts)
  };
}
