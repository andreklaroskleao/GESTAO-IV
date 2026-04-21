import { escapeHtml } from './ui.js';

export function createAuditModule(ctx) {
  const { state, formatDateTime } = ctx;

  function getRows() {
    return Array.isArray(state.auditLogs) ? state.auditLogs : [];
  }

  function normalizeDateKey(value) {
    if (!value) return '';

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

  function getFilteredRows(filters = {}) {
    return getRows()
      .filter((item) => {
        const moduleValue = String(item.module || '').toLowerCase();
        const actionValue = String(item.action || '').toLowerCase();
        const entityTypeValue = String(item.entityType || '').toLowerCase();
        const entityLabelValue = String(item.entityLabel || '').toLowerCase();
        const userValue = String(
          item.userName ||
          item.userEmail ||
          item.userId ||
          ''
        ).toLowerCase();

        const createdKey = normalizeDateKey(item.createdAt);

        return (
          (!filters.module || moduleValue.includes(String(filters.module).toLowerCase())) &&
          (!filters.action || actionValue.includes(String(filters.action).toLowerCase())) &&
          (!filters.entityType || entityTypeValue.includes(String(filters.entityType).toLowerCase())) &&
          (!filters.entityLabel || entityLabelValue.includes(String(filters.entityLabel).toLowerCase())) &&
          (!filters.user || userValue.includes(String(filters.user).toLowerCase())) &&
          (!filters.dateFrom || !createdKey || createdKey >= filters.dateFrom) &&
          (!filters.dateTo || !createdKey || createdKey <= filters.dateTo)
        );
      })
      .sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return db - da;
      });
  }

  function stringifyMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      return '-';
    }

    const entries = Object.entries(metadata);
    if (!entries.length) {
      return '-';
    }

    return entries
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}: ${value.length ? JSON.stringify(value) : '[]'}`;
        }

        if (value && typeof value === 'object') {
          return `${key}: ${JSON.stringify(value)}`;
        }

        return `${key}: ${String(value)}`;
      })
      .join(' | ');
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
    const ref = ctx.refs?.auditLogs;
    if (!ref || !ctx.createDoc) return;

    const user = state.currentUser || {};

    await ctx.createDoc(ref, {
      module: String(module || '').trim(),
      action: String(action || '').trim(),
      entityType: String(entityType || '').trim(),
      entityId: String(entityId || '').trim(),
      entityLabel: String(entityLabel || '').trim(),
      description: String(description || '').trim(),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      userId: String(user.uid || ''),
      userName: String(user.fullName || ''),
      userEmail: String(user.email || ''),
      createdAt: new Date()
    });
  }

  function renderAuditTable(filters = {}, shouldShow = false, limit = 50) {
    if (!shouldShow) {
      return `
        <div class="empty-state">
          <strong>Auditoria oculta</strong>
          <span>Use os filtros e clique em “Filtrar” para carregar os registros.</span>
        </div>
      `;
    }

    const rows = getFilteredRows(filters).slice(0, Math.max(1, Number(limit || 50)));

    if (!rows.length) {
      return `
        <div class="empty-state">
          <strong>Sem registros</strong>
          <span>Nenhum log encontrado para os filtros informados.</span>
        </div>
      `;
    }

    return `
      <div class="table-wrap scroll-dual">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Módulo</th>
              <th>Ação</th>
              <th>Tipo</th>
              <th>Entidade</th>
              <th>Descrição</th>
              <th>Usuário</th>
              <th>Metadados</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((item) => `
              <tr>
                <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
                <td>${escapeHtml(item.module || '-')}</td>
                <td>${escapeHtml(item.action || '-')}</td>
                <td>${escapeHtml(item.entityType || '-')}</td>
                <td>${escapeHtml(item.entityLabel || item.entityId || '-')}</td>
                <td>${escapeHtml(item.description || '-')}</td>
                <td>${escapeHtml(item.userName || item.userEmail || item.userId || '-')}</td>
                <td>${escapeHtml(stringifyMetadata(item.metadata))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function printFilteredLogs(filters = {}, shouldShow = false) {
    if (!shouldShow) {
      window.print();
      return;
    }

    const rows = getFilteredRows(filters);

    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Auditoria</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #111;
            }
            h1 {
              margin-bottom: 8px;
            }
            p {
              margin-top: 0;
              margin-bottom: 16px;
              color: #444;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }
            th, td {
              border: 1px solid #ccc;
              padding: 8px;
              text-align: left;
              vertical-align: top;
            }
            th {
              background: #f3f3f3;
            }
          </style>
        </head>
        <body>
          <h1>Relatório de Auditoria</h1>
          <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Módulo</th>
                <th>Ação</th>
                <th>Tipo</th>
                <th>Entidade</th>
                <th>Descrição</th>
                <th>Usuário</th>
                <th>Metadados</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.map((item) => `
                  <tr>
                    <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
                    <td>${escapeHtml(item.module || '-')}</td>
                    <td>${escapeHtml(item.action || '-')}</td>
                    <td>${escapeHtml(item.entityType || '-')}</td>
                    <td>${escapeHtml(item.entityLabel || item.entityId || '-')}</td>
                    <td>${escapeHtml(item.description || '-')}</td>
                    <td>${escapeHtml(item.userName || item.userEmail || item.userId || '-')}</td>
                    <td>${escapeHtml(stringifyMetadata(item.metadata))}</td>
                  </tr>
                `).join('') || `
                  <tr>
                    <td colspan="8">Nenhum registro encontrado.</td>
                  </tr>
                `
              }
            </tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return {
    log,
    getFilteredRows,
    renderAuditTable,
    printFilteredLogs
  };
}