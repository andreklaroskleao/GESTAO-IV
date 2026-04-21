import { formatDateTime } from '../services/utils.js';

export function createAuditModule(ctx) {
  const {
    state,
    refs,
    createDoc
  } = ctx;

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
  }

  function resolveActorName() {
    return String(
      state.currentUser?.fullName
      || state.currentUser?.username
      || state.currentUser?.email
      || 'Usuário'
    ).trim();
  }

  function resolveActorId() {
    return String(
      state.currentUser?.uid
      || state.currentUser?.id
      || ''
    ).trim();
  }

  function getLogUserName(item) {
    return String(
      item?.performedByName
      || item?.userName
      || item?.metadata?.performedByName
      || item?.metadata?.userName
      || item?.performedByEmail
      || item?.userEmail
      || item?.performedById
      || item?.userId
      || '-'
    ).trim();
  }

  function getLogUserId(item) {
    return String(
      item?.performedById
      || item?.userId
      || item?.metadata?.performedById
      || item?.metadata?.userId
      || ''
    ).trim();
  }

  async function log({
    module = '',
    action = '',
    entityType = '',
    entityId = '',
    entityLabel = '',
    description = '',
    metadata = {}
  } = {}) {
    try {
      const actorName = resolveActorName();
      const actorId = resolveActorId();
      const actorEmail = String(state.currentUser?.email || '').trim();

      await createDoc(refs.auditLogs, {
        module: module || '',
        action: action || '',
        entityType: entityType || '',
        entityId: entityId || '',
        entityLabel,
        description,
        metadata,
        performedById: actorId,
        performedByName: actorName,
        performedByEmail: actorEmail,
        userId: actorId,
        userName: actorName,
        userEmail: actorEmail,
        deleted: false,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Erro ao gravar auditoria:', error);
    }
  }

  function normalizeDateKey(value) {
    if (!value) return '';

    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      }
      return value.slice(0, 10);
    }

    if (value?.toDate && typeof value.toDate === 'function') {
      const parsed = value.toDate();
      if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      }
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }

    return '';
  }

  function matchFilter(value, filter) {
    const rawValue = String(value || '').toLowerCase();
    const rawFilter = String(filter || '').trim().toLowerCase();

    if (!rawFilter) return true;
    return rawValue.includes(rawFilter);
  }

  function getFilteredLogs(filters = {}) {
    const rows = Array.isArray(state.auditLogs) ? state.auditLogs : [];

    return rows.filter((item) => {
      if (item.deleted === true) return false;

      const createdKey = normalizeDateKey(item.createdAt);
      const userValue = getLogUserName(item).toLowerCase();

      return matchFilter(item.module, filters.module)
        && matchFilter(item.action, filters.action)
        && matchFilter(item.entityType, filters.entityType)
        && matchFilter(item.entityLabel, filters.entityLabel)
        && (!filters.user || userValue.includes(filters.user.toLowerCase()))
        && (!filters.dateFrom || !createdKey || createdKey >= filters.dateFrom)
        && (!filters.dateTo || !createdKey || createdKey <= filters.dateTo);
    }).sort((a, b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
      const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
      return db - da;
    });
  }

  function renderActionTag(action) {
    const value = String(action || '').toLowerCase();
    let className = 'tag info';

    if (['create', 'reactivate', 'receive', 'payment'].includes(value)) {
      className = 'tag success';
    } else if (['delete'].includes(value)) {
      className = 'tag danger';
    } else if (['update', 'inactivate', 'password_change'].includes(value)) {
      className = 'tag warning';
    }

    return `<span class="${className}">${escapeHtml(action || '-')}</span>`;
  }

  function renderMetadataChanges(item) {
    const changes = Array.isArray(item?.metadata?.changes) ? item.metadata.changes : [];

    if (!changes.length) {
      return escapeHtml(item.description || '-');
    }

    return `
      <div class="audit-changes-list">
        ${changes.map((change) => `
          <div class="audit-change-row">
            <strong>${escapeHtml(change.label || change.field || 'Campo')}</strong>:
            <span>${escapeHtml(formatChangeValue(change.from))}</span>
            <span class="audit-change-arrow">→</span>
            <span>${escapeHtml(formatChangeValue(change.to))}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function formatChangeValue(value) {
    if (value === undefined || value === null || value === '') return '(vazio)';
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function renderAuditTable(filters = {}, shouldShow = false, limit = 40) {
    if (!shouldShow) {
      return `
        <div class="empty-state">
          <strong>Auditoria oculta</strong>
          <span>Aplique os filtros para exibir os logs.</span>
        </div>
      `;
    }

    const rows = getFilteredLogs(filters).slice(0, Number(limit || 40));

    if (!rows.length) {
      return `
        <div class="empty-state">
          <strong>Nenhum log encontrado</strong>
          <span>Não há registros para os filtros aplicados.</span>
        </div>
      `;
    }

    return `
      <table class="audit-table">
        <thead>
          <tr>
            <th>Data/Hora</th>
            <th>Usuário</th>
            <th>Módulo</th>
            <th>Ação</th>
            <th>Tipo</th>
            <th>Registro</th>
            <th>O que mudou</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
              <td title="${escapeHtml(getLogUserId(item))}">${escapeHtml(getLogUserName(item))}</td>
              <td>${escapeHtml(item.module || '-')}</td>
              <td>${renderActionTag(item.action || '-')}</td>
              <td>${escapeHtml(item.entityType || '-')}</td>
              <td>${escapeHtml(item.entityLabel || item.entityId || '-')}</td>
              <td>${renderMetadataChanges(item)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function printFilteredLogs(filters = {}, shouldShow = false) {
    if (!shouldShow) {
      alert('Aplique os filtros antes de imprimir.');
      return;
    }

    const rows = getFilteredLogs(filters);

    if (!rows.length) {
      alert('Não há logs para imprimir com os filtros atuais.');
      return;
    }

    const html = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Auditoria filtrada</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; margin: 20px; color: #111; }
            h1 { margin: 0 0 8px; font-size: 20px; }
            .subtitle { margin-bottom: 16px; color: #555; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
            th, td { border: 1px solid #999; padding: 6px; text-align: left; vertical-align: top; word-break: break-word; }
            th { background: #f0f0f0; }
            .audit-change-row { margin-bottom: 4px; }
            .audit-change-arrow { margin: 0 4px; font-weight: 700; }
            @media print { body { margin: 10px; } }
          </style>
        </head>
        <body>
          <h1>Auditoria filtrada</h1>
          <div class="subtitle">Total de registros: ${rows.length}</div>
          <table>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Usuário</th>
                <th>Módulo</th>
                <th>Ação</th>
                <th>Tipo</th>
                <th>Registro</th>
                <th>O que mudou</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((item) => `
                <tr>
                  <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
                  <td>${escapeHtml(getLogUserName(item))}</td>
                  <td>${escapeHtml(item.module || '-')}</td>
                  <td>${escapeHtml(item.action || '-')}</td>
                  <td>${escapeHtml(item.entityType || '-')}</td>
                  <td>${escapeHtml(item.entityLabel || item.entityId || '-')}</td>
                  <td>${renderPrintChanges(item)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const win = window.open('', '_blank', 'width=1200,height=900');
    if (!win) {
      alert('Não foi possível abrir a janela de impressão.');
      return;
    }

    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      try {
        win.print();
      } catch (error) {
        console.error(error);
      }
    }, 250);
  }

  function renderPrintChanges(item) {
    const changes = Array.isArray(item?.metadata?.changes) ? item.metadata.changes : [];

    if (!changes.length) {
      return escapeHtml(item.description || '-');
    }

    return changes.map((change) => `
      <div class="audit-change-row">
        <strong>${escapeHtml(change.label || change.field || 'Campo')}</strong>:
        ${escapeHtml(formatChangeValue(change.from))}
        <span class="audit-change-arrow">→</span>
        ${escapeHtml(formatChangeValue(change.to))}
      </div>
    `).join('');
  }

  return {
    log,
    renderAuditTable,
    getFilteredLogs,
    printFilteredLogs
  };
}