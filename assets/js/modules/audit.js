import { escapeHtml } from './ui.js';

export function createAuditModule(ctx) {
  const { state, refs, createDoc, formatDateTime } = ctx;

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

  function getDateTimeValue(value) {
    if (!value) return 0;

    if (value?.toDate && typeof value.toDate === 'function') {
      return value.toDate().getTime();
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }

    return 0;
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
      .sort((a, b) => getDateTimeValue(b.createdAt) - getDateTimeValue(a.createdAt));
  }

  function getActionLabel(action) {
    const value = String(action || '').toLowerCase();

    if (value === 'create') return 'Criação';
    if (value === 'update') return 'Atualização';
    if (value === 'delete') return 'Exclusão';
    if (value === 'payment') return 'Pagamento';
    if (value === 'receive') return 'Recebimento';
    if (value === 'movement') return 'Movimentação';
    if (value === 'import') return 'Importação';
    if (value === 'password_change') return 'Troca de senha';

    return action || '-';
  }

  function getActionBadgeClass(action) {
    const value = String(action || '').toLowerCase();

    if (value === 'create') return 'badge-success';
    if (value === 'update') return 'badge-warning';
    if (value === 'delete') return 'badge-danger';
    if (value === 'payment' || value === 'receive') return 'badge-success';
    if (value === 'movement') return 'badge-warning';
    if (value === 'import') return 'badge-neutral';
    if (value === 'password_change') return 'badge-neutral';

    return 'badge-neutral';
  }

  function stringifyValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (Array.isArray(value)) return JSON.stringify(value);
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value);
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

  function summarizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      return '-';
    }

    if (Array.isArray(metadata.changes) && metadata.changes.length) {
      return `${metadata.changes.length} alteração(ões)`;
    }

    const keys = Object.keys(metadata);
    if (!keys.length) return '-';

    return keys.slice(0, 3).join(', ');
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
    if (!refs?.auditLogs || !createDoc) return;

    const user = state.currentUser || {};

    await createDoc(refs.auditLogs, {
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

  function renderChangesTable(changes = []) {
    if (!Array.isArray(changes) || !changes.length) {
      return `
        <div class="empty-state">
          <strong>Sem comparação detalhada</strong>
          <span>Este registro não contém campos estruturados de antes e depois.</span>
        </div>
      `;
    }

    return `
      <div class="table-wrap scroll-dual">
        <table>
          <thead>
            <tr>
              <th>Campo</th>
              <th>Rótulo</th>
              <th>Antes</th>
              <th>Depois</th>
            </tr>
          </thead>
          <tbody>
            ${changes.map((change) => `
              <tr>
                <td>${escapeHtml(stringifyValue(change.field))}</td>
                <td>${escapeHtml(stringifyValue(change.label))}</td>
                <td>${escapeHtml(stringifyValue(change.from))}</td>
                <td>${escapeHtml(stringifyValue(change.to))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function openAuditDetailsModal(auditId) {
    const row = getRows().find((item) => String(item.id || '') === String(auditId || ''));
    if (!row) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const changes = Array.isArray(metadata.changes) ? metadata.changes : [];

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="audit-details-modal-backdrop">
        <div class="modal-card" style="max-width:1100px;">
          <div class="section-header">
            <h2>Detalhes da auditoria</h2>
            <button class="btn btn-secondary" type="button" id="audit-details-close-btn">Fechar</button>
          </div>

          <div class="filters-grid">
            <div><strong>Data</strong><br>${escapeHtml(formatDateTime(row.createdAt))}</div>
            <div><strong>Módulo</strong><br>${escapeHtml(row.module || '-')}</div>
            <div><strong>Ação</strong><br>${escapeHtml(getActionLabel(row.action))}</div>
            <div><strong>Tipo</strong><br>${escapeHtml(row.entityType || '-')}</div>
            <div><strong>Entidade</strong><br>${escapeHtml(row.entityLabel || row.entityId || '-')}</div>
            <div><strong>Usuário</strong><br>${escapeHtml(row.userName || row.userEmail || row.userId || '-')}</div>
          </div>

          <div style="margin-top:16px;">
            <strong>Descrição</strong>
            <div class="empty-state" style="text-align:left; margin-top:8px;">
              <span>${escapeHtml(row.description || '-')}</span>
            </div>
          </div>

          <div style="margin-top:16px;">
            <strong>Resumo técnico</strong>
            <div class="empty-state" style="text-align:left; margin-top:8px;">
              <span>${escapeHtml(summarizeMetadata(metadata))}</span>
            </div>
          </div>

          <div style="margin-top:16px;">
            <strong>Alterações detalhadas</strong>
            <div style="margin-top:8px;">
              ${renderChangesTable(changes)}
            </div>
          </div>

          <div style="margin-top:16px;">
            <strong>Metadados completos</strong>
            <div class="empty-state" style="text-align:left; margin-top:8px; white-space:pre-wrap; word-break:break-word;">
              <span>${escapeHtml(stringifyMetadata(metadata))}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#audit-details-close-btn')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#audit-details-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'audit-details-modal-backdrop') {
        closeModal();
      }
    });
  }

  function bindAuditTableEvents(root = document) {
    root.querySelectorAll('[data-audit-open]').forEach((rowEl) => {
      if (rowEl.dataset.boundAuditOpen === 'true') return;

      rowEl.dataset.boundAuditOpen = 'true';
      rowEl.addEventListener('click', () => {
        openAuditDetailsModal(rowEl.dataset.auditOpen);
      });
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
              <th>Entidade</th>
              <th>Descrição</th>
              <th>Usuário</th>
              <th>Resumo</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((item) => `
              <tr data-audit-open="${escapeHtml(item.id || '')}" style="cursor:pointer;">
                <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
                <td>${escapeHtml(item.module || '-')}</td>
                <td>
                  <span class="badge ${getActionBadgeClass(item.action)}">
                    ${escapeHtml(getActionLabel(item.action))}
                  </span>
                </td>
                <td>${escapeHtml(item.entityLabel || item.entityId || '-')}</td>
                <td>${escapeHtml(item.description || '-')}</td>
                <td>${escapeHtml(item.userName || item.userEmail || item.userId || '-')}</td>
                <td>${escapeHtml(summarizeMetadata(item.metadata))}</td>
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
            .badge {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 999px;
              border: 1px solid #ccc;
              font-size: 11px;
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
                <th>Entidade</th>
                <th>Descrição</th>
                <th>Usuário</th>
                <th>Resumo</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.map((item) => `
                  <tr>
                    <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
                    <td>${escapeHtml(item.module || '-')}</td>
                    <td>${escapeHtml(getActionLabel(item.action))}</td>
                    <td>${escapeHtml(item.entityLabel || item.entityId || '-')}</td>
                    <td>${escapeHtml(item.description || '-')}</td>
                    <td>${escapeHtml(item.userName || item.userEmail || item.userId || '-')}</td>
                    <td>${escapeHtml(summarizeMetadata(item.metadata))}</td>
                  </tr>
                `).join('') || `
                  <tr>
                    <td colspan="7">Nenhum registro encontrado.</td>
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
    printFilteredLogs,
    openAuditDetailsModal,
    bindAuditTableEvents
  };
}