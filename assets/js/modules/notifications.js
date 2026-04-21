import { escapeHtml, showToast, bindAsyncButton } from './ui.js';

export function createNotificationsModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    updateByPath
  } = ctx;

  let filters = {
    category: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  };

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

  function getRows() {
    return Array.isArray(state.notifications) ? state.notifications : [];
  }

  function isRead(item) {
    const currentUserId = String(state.currentUser?.uid || '');
    const readBy = Array.isArray(item.readBy) ? item.readBy : [];
    return item.status === 'read' || (currentUserId && readBy.includes(currentUserId));
  }

  function getUnreadRows() {
    return getRows().filter((item) => !isRead(item));
  }

  function getFilteredRows() {
    return getRows().filter((item) => {
      const createdKey = normalizeDateKey(item.createdAt);
      const rowStatus = isRead(item) ? 'read' : 'unread';

      return (!filters.category || String(item.category || '') === filters.category)
        && (!filters.status || rowStatus === filters.status)
        && (!filters.dateFrom || !createdKey || createdKey >= filters.dateFrom)
        && (!filters.dateTo || !createdKey || createdKey <= filters.dateTo);
    });
  }

  async function createNotification({
    type = '',
    category = '',
    title = '',
    message = '',
    entityType = '',
    entityId = '',
    eventDate = '',
    sourceKey = ''
  } = {}) {
    if (!title || !sourceKey) return;

    const exists = getRows().some((item) => item.sourceKey === sourceKey);
    if (exists) return;

    await createDoc(refs.notifications, {
      type,
      category,
      title,
      message,
      entityType,
      entityId,
      eventDate,
      sourceKey,
      status: 'unread',
      readBy: [],
      deleted: false
    });
  }

  async function markAsRead(notificationId) {
    const row = getRows().find((item) => item.id === notificationId);
    if (!row) return;

    const currentUserId = String(state.currentUser?.uid || '');
    const readBy = Array.isArray(row.readBy) ? [...row.readBy] : [];

    if (currentUserId && !readBy.includes(currentUserId)) {
      readBy.push(currentUserId);
    }

    await updateByPath('notifications', notificationId, {
      status: 'read',
      readBy
    });
  }

  async function markAllAsRead() {
    const unread = getUnreadRows();
    for (const row of unread) {
      await markAsRead(row.id);
    }
    showToast('Notificações marcadas como lidas.', 'success');
  }

  function updateBellBadge() {
    const badge = document.getElementById('notifications-badge');
    if (!badge) return;
    badge.textContent = String(getUnreadRows().length);
  }

  function formatNotificationDate(value) {
    if (!value) return '-';

    if (value?.toDate && typeof value.toDate === 'function') {
      return value.toDate().toLocaleString('pt-BR');
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('pt-BR');
    }

    return String(value);
  }

  function renderList(rows) {
    if (!rows.length) {
      return `
        <div class="empty-state">
          <strong>Sem notificações</strong>
          <span>Nenhum registro encontrado para os filtros aplicados.</span>
        </div>
      `;
    }

    return `
      <div class="stack-list">
        ${rows.map((item) => `
          <div class="list-item notification-row ${isRead(item) ? 'is-read' : 'is-unread'}">
            <div class="notification-row-top">
              <strong>${escapeHtml(item.title || '-')}</strong>
              <span class="tag ${isRead(item) ? 'info' : 'warning'}">${isRead(item) ? 'Lida' : 'Não lida'}</span>
            </div>
            <span>${escapeHtml(item.message || '-')}</span>
            <span>${escapeHtml(item.category || '-')} · ${escapeHtml(formatNotificationDate(item.createdAt))}</span>
            <div class="form-actions">
              ${isRead(item) ? '' : `<button class="btn btn-secondary" type="button" data-notification-read="${item.id}">Marcar como lida</button>`}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function openNotificationsModal() {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    const rows = getFilteredRows();

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="notifications-modal-backdrop">
        <div class="modal-card notifications-modal-card">
          <div class="section-header">
            <h2>Notificações</h2>
            <div class="form-actions">
              <button class="btn btn-secondary" type="button" id="notifications-mark-all-btn">Marcar todas como lidas</button>
              <button class="btn btn-secondary" type="button" id="notifications-close-btn">Fechar</button>
            </div>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <select id="notifications-filter-category">
              <option value="">Todas as categorias</option>
              <option value="tele_entrega" ${filters.category === 'tele_entrega' ? 'selected' : ''}>Tele-entrega</option>
              <option value="estoque" ${filters.category === 'estoque' ? 'selected' : ''}>Estoque</option>
              <option value="contas" ${filters.category === 'contas' ? 'selected' : ''}>Contas</option>
            </select>

            <select id="notifications-filter-status">
              <option value="">Todos</option>
              <option value="unread" ${filters.status === 'unread' ? 'selected' : ''}>Não lidas</option>
              <option value="read" ${filters.status === 'read' ? 'selected' : ''}>Lidas</option>
            </select>

            <input id="notifications-filter-date-from" type="date" value="${filters.dateFrom}" />
            <input id="notifications-filter-date-to" type="date" value="${filters.dateTo}" />

            <button class="btn btn-secondary" type="button" id="notifications-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="notifications-filter-clear">Limpar</button>
          </div>

          <div class="settings-audit-scroll">
            ${renderList(rows)}
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#notifications-close-btn')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#notifications-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'notifications-modal-backdrop') {
        closeModal();
      }
    });

    bindAsyncButton(modalRoot.querySelector('#notifications-mark-all-btn'), async () => {
      await markAllAsRead();
      closeModal();
      openNotificationsModal();
    }, { busyLabel: 'Processando...' });

    modalRoot.querySelector('#notifications-filter-apply')?.addEventListener('click', () => {
      filters.category = modalRoot.querySelector('#notifications-filter-category')?.value || '';
      filters.status = modalRoot.querySelector('#notifications-filter-status')?.value || '';
      filters.dateFrom = modalRoot.querySelector('#notifications-filter-date-from')?.value || '';
      filters.dateTo = modalRoot.querySelector('#notifications-filter-date-to')?.value || '';
      openNotificationsModal();
    });

    modalRoot.querySelector('#notifications-filter-clear')?.addEventListener('click', () => {
      filters = {
        category: '',
        status: '',
        dateFrom: '',
        dateTo: ''
      };
      openNotificationsModal();
    });

    modalRoot.querySelectorAll('[data-notification-read]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await markAsRead(btn.dataset.notificationRead);
        openNotificationsModal();
      });
    });
  }

  function bindBell() {
    const bellBtn = document.getElementById('notifications-bell-btn');
    if (!bellBtn || bellBtn.dataset.bound === 'true') return;

    bellBtn.dataset.bound = 'true';
    bellBtn.addEventListener('click', () => {
      openNotificationsModal();
    });
  }

  async function generateSystemNotifications() {
    const deliveries = state.deliveries || [];
    const products = state.products || [];
    const receivables = state.accountsReceivable || [];
    const payables = state.accountsPayable || [];
    const lowStockThreshold = Number(state.settings?.lowStockThreshold || 5);

    for (const item of deliveries) {
      if (item.deleted === true) continue;
      if (String(item.status || '').toLowerCase().includes('pendente')) {
        await createNotification({
          type: 'delivery_pending',
          category: 'tele_entrega',
          title: 'Tele-entrega pendente',
          message: `Entrega de ${item.customerName || 'cliente'} aguardando ação.`,
          entityType: 'delivery',
          entityId: item.id,
          eventDate: normalizeDateKey(item.scheduledAt),
          sourceKey: `delivery_pending_${item.id}`
        });
      }
    }

    for (const item of products) {
      if (item.deleted === true) continue;
      if (Number(item.quantity || 0) <= lowStockThreshold) {
        await createNotification({
          type: 'low_stock',
          category: 'estoque',
          title: 'Estoque baixo',
          message: `${item.name || 'Produto'} com estoque em ${Number(item.quantity || 0)}.`,
          entityType: 'product',
          entityId: item.id,
          eventDate: normalizeDateKey(item.updatedAt || item.createdAt),
          sourceKey: `low_stock_${item.id}`
        });
      }
    }

    for (const item of receivables) {
      if (item.deleted === true || Number(item.openAmount || 0) <= 0 || !item.dueDate) continue;

      await createNotification({
        type: 'receivable_due',
        category: 'contas',
        title: 'Conta a receber pendente',
        message: `${item.clientName || 'Cliente'} · vencimento ${item.dueDate}.`,
        entityType: 'account_receivable',
        entityId: item.id,
        eventDate: item.dueDate,
        sourceKey: `receivable_due_${item.id}`
      });
    }

    for (const item of payables) {
      if (item.deleted === true || Number(item.openAmount || 0) <= 0 || !item.dueDate) continue;

      await createNotification({
        type: 'payable_due',
        category: 'contas',
        title: 'Conta a pagar pendente',
        message: `${item.supplierName || 'Fornecedor'} · vencimento ${item.dueDate}.`,
        entityType: 'account_payable',
        entityId: item.id,
        eventDate: item.dueDate,
        sourceKey: `payable_due_${item.id}`
      });
    }
  }

  return {
    bindBell,
    updateBellBadge,
    openNotificationsModal,
    generateSystemNotifications
  };
}