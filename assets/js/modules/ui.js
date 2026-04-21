export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

export function renderBlocked(message = 'Você não possui permissão para acessar esta área.') {
  return `
    <div class="empty-state blocked-state">
      <div class="blocked-state-icon">🔒</div>
      <strong>Acesso bloqueado</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

export function renderEmptyState(message = 'Nada para exibir.', details = '') {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(message)}</strong>
      ${details ? `<span>${escapeHtml(details)}</span>` : ''}
    </div>
  `;
}

export function renderSectionHeader({
  title = '',
  subtitle = '',
  badge = '',
  actions = ''
} = {}) {
  return `
    <div class="section-header">
      <div class="section-header-text">
        <h2>${escapeHtml(title)}</h2>
        ${subtitle ? `<span class="muted">${escapeHtml(subtitle)}</span>` : ''}
      </div>
      <div class="section-header-side">
        ${badge ? `<span class="badge-soft">${escapeHtml(badge)}</span>` : ''}
        ${actions || ''}
      </div>
    </div>
  `;
}

export function renderFilterActions({
  applyId,
  clearId,
  applyLabel = 'Filtrar',
  clearLabel = 'Limpar'
} = {}) {
  return `
    <button class="btn btn-secondary" type="button" id="${escapeHtml(applyId || '')}">${escapeHtml(applyLabel)}</button>
    <button class="btn btn-secondary" type="button" id="${escapeHtml(clearId || '')}">${escapeHtml(clearLabel)}</button>
  `;
}

export function showToast(message, type = 'info') {
  const root = document.getElementById('toast-root') || ensureToastRoot();
  const toast = document.createElement('div');

  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <span>${escapeHtml(message)}</span>
      <button class="toast-close-btn" type="button" aria-label="Fechar">×</button>
    </div>
  `;

  const removeToast = () => {
    toast.classList.add('toast-out');
    window.setTimeout(() => {
      toast.remove();
    }, 180);
  };

  toast.querySelector('.toast-close-btn')?.addEventListener('click', removeToast);

  root.appendChild(toast);

  window.setTimeout(() => {
    removeToast();
  }, 3200);
}

function ensureToastRoot() {
  const existing = document.getElementById('toast-root');
  if (existing) return existing;

  const root = document.createElement('div');
  root.id = 'toast-root';
  root.className = 'toast-root';
  document.body.appendChild(root);
  return root;
}

export function debounce(fn, delay = 250) {
  let timer = null;

  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

export function setBusyState(button, busy = true, busyLabel = 'Salvando...') {
  if (!button) return;

  if (busy) {
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.innerHTML;
    }

    button.disabled = true;
    button.classList.add('is-busy');
    button.innerHTML = `
      <span class="btn-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(busyLabel)}</span>
    `;
    return;
  }

  button.disabled = false;
  button.classList.remove('is-busy');

  if (button.dataset.originalLabel) {
    button.innerHTML = button.dataset.originalLabel;
  }
}

export function bindSubmitGuard(form, handler, options = {}) {
  if (!form || typeof handler !== 'function') return;

  const {
    buttonSelector = 'button[type="submit"]',
    busyLabel = 'Salvando...'
  } = options;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector(buttonSelector);

    if (form.dataset.submitting === 'true') {
      return;
    }

    form.dataset.submitting = 'true';
    setBusyState(submitButton, true, busyLabel);

    try {
      await handler(event);
    } finally {
      form.dataset.submitting = 'false';
      setBusyState(submitButton, false);
    }
  });
}

export function bindAsyncButton(button, handler, options = {}) {
  if (!button || typeof handler !== 'function') return;

  const {
    busyLabel = 'Processando...'
  } = options;

  button.addEventListener('click', async (event) => {
    event.preventDefault();

    if (button.dataset.busy === 'true') {
      return;
    }

    button.dataset.busy = 'true';
    setBusyState(button, true, busyLabel);

    try {
      await handler(event);
    } finally {
      button.dataset.busy = 'false';
      setBusyState(button, false);
    }
  });
}

export function lockInteractiveArea(container) {
  if (!container) return;
  container.classList.add('is-loading');
  container.setAttribute('aria-busy', 'true');
}

export function unlockInteractiveArea(container) {
  if (!container) return;
  container.classList.remove('is-loading');
  container.removeAttribute('aria-busy');
}

export function renderInlineHint(text = '') {
  if (!text) return '';
  return `<div class="auth-hint">${escapeHtml(text)}</div>`;
}