import { escapeHtml, renderBlocked, showToast, bindSubmitGuard, bindAsyncButton } from './ui.js';

export function createPurchasesModule(ctx) {
  const {
    state,
    tabEls,
    refs,
    createDoc,
    updateByPath,
    currency,
    toNumber,
    hasPermission,
    inventoryModule,
    auditModule
  } = ctx;

  let filters = {
    supplier: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  };

  let isSavingPurchase = false;

  function getRows() {
    return (state.purchases || []).filter((item) => item.deleted !== true);
  }

  function getFilteredRows() {
    return getRows().filter((item) => {
      const supplier = String(item.supplierName || '').toLowerCase();
      const status = String(item.status || '');
      const receivedDate = normalizeDate(item.receivedDate || item.receivedAt);

      return (!filters.supplier || supplier.includes(filters.supplier.toLowerCase()))
        && (!filters.status || status === filters.status)
        && (!filters.dateFrom || !receivedDate || receivedDate >= filters.dateFrom)
        && (!filters.dateTo || !receivedDate || receivedDate <= filters.dateTo);
    });
  }

  function normalizeDate(value) {
    if (!value) return '';

    if (typeof value === 'string') {
      if (value.includes('T')) {
        const dt = new Date(value);
        if (!Number.isNaN(dt.getTime())) return formatDateKey(dt);
      }
      return value.slice(0, 10);
    }

    if (value?.toDate) return formatDateKey(value.toDate());

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return formatDateKey(parsed);

    return '';
  }

  function formatDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function getSummary() {
    const rows = getRows();
    return {
      total: rows.length,
      received: rows.filter((item) => item.status === 'Recebida').length,
      pending: rows.filter((item) => item.status !== 'Recebida').length,
      totalValue: rows.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0)
    };
  }

  function getEditingPurchase() {
    return getRows().find((item) => item.id === state.editingPurchaseId) || null;
  }

  function fillForm(form, row) {
    if (!form) return;

    form.elements.supplierName.value = row?.supplierName || '';
    form.elements.description.value = row?.description || '';
    form.elements.documentNumber.value = row?.documentNumber || '';
    form.elements.receivedDate.value = row?.receivedDate || normalizeDate(row?.receivedAt) || '';
    form.elements.totalAmount.value = row?.totalAmount ?? '';
    form.elements.paymentCondition.value = row?.paymentCondition || 'À vista';
    form.elements.status.value = row?.status || 'Pendente';
    form.elements.notes.value = row?.notes || '';
  }

  async function savePurchase() {
    if (isSavingPurchase) return;
    isSavingPurchase = true;

    try {
      const form = document.querySelector('#purchase-form');
      if (!form) return;

      const payload = Object.fromEntries(new FormData(form).entries());
      payload.totalAmount = toNumber(payload.totalAmount);
      payload.deleted = false;

      if (!payload.supplierName || !payload.description) {
        alert('Informe fornecedor e descrição.');
        return;
      }

      if (state.editingPurchaseId) {
        const current = getEditingPurchase();

        await updateByPath('purchases', state.editingPurchaseId, payload);

        await auditModule.log({
          module: 'purchases',
          action: 'update',
          entityType: 'purchase',
          entityId: state.editingPurchaseId,
          entityLabel: payload.description || current?.description || '',
          description: 'Compra atualizada.'
        });

        state.editingPurchaseId = null;
        showToast('Compra atualizada.', 'success');
      } else {
        const createdId = await createDoc(refs.purchases, payload);

        await auditModule.log({
          module: 'purchases',
          action: 'create',
          entityType: 'purchase',
          entityId: createdId,
          entityLabel: payload.description || '',
          description: 'Compra cadastrada.'
        });

        showToast('Compra cadastrada.', 'success');
      }

      closePurchaseFormModal();
      render();
    } finally {
      isSavingPurchase = false;
    }
  }

  async function receivePurchase(purchaseId) {
    const row = getRows().find((item) => item.id === purchaseId);
    if (!row) return;

    if (String(row.status || '') === 'Recebida') {
      showToast('Esta compra já foi recebida.', 'info');
      return;
    }

    await updateByPath('purchases', purchaseId, { status: 'Recebida' });

    if (inventoryModule.createSimpleMovement) {
      await inventoryModule.createSimpleMovement({
        type: 'entrada',
        reason: `Recebimento de compra: ${row.description || row.documentNumber || row.id}`,
        quantity: 0
      });
    }

    await auditModule.log({
      module: 'purchases',
      action: 'receive',
      entityType: 'purchase',
      entityId: purchaseId,
      entityLabel: row.description || '',
      description: 'Compra marcada como recebida.'
    });

    showToast('Compra recebida.', 'success');
    render();
  }

  function getPurchaseFormHtml() {
    return `
      <div class="form-modal-body">
        <div class="section-header">
          <h2>${state.editingPurchaseId ? 'Editar compra' : 'Nova compra'}</h2>
          <span class="muted">Cadastro em modal.</span>
        </div>

        <form id="purchase-form" class="form-grid mobile-optimized">
          <div class="form-section" style="grid-column:1 / -1;">
            <div class="form-section-title">
              <h3>Identificação</h3>
              <span>Fornecedor e documento</span>
            </div>
            <div class="soft-divider"></div>

            <div class="form-grid">
              <label>Fornecedor
                <input name="supplierName" list="purchase-suppliers-datalist" required />
                <datalist id="purchase-suppliers-datalist">
                  ${(state.suppliers || [])
                    .filter((item) => item.deleted !== true && item.active !== false)
                    .map((item) => `<option value="${escapeHtml(item.name || '')}"></option>`)
                    .join('')}
                </datalist>
              </label>
              <label>Documento<input name="documentNumber" /></label>
              <label style="grid-column:1 / -1;">Descrição<input name="description" required /></label>
            </div>
          </div>

          <div class="form-section" style="grid-column:1 / -1;">
            <div class="form-section-title">
              <h3>Financeiro</h3>
              <span>Valor, data e condição</span>
            </div>
            <div class="soft-divider"></div>

            <div class="form-grid">
              <label>Data<input name="receivedDate" type="date" required /></label>
              <label>Total<input name="totalAmount" type="number" step="0.01" min="0" required /></label>
              <label>Condição de pagamento
                <select name="paymentCondition">
                  <option value="À vista">À vista</option>
                  <option value="A prazo">A prazo</option>
                </select>
              </label>
              <label>Status
                <select name="status">
                  <option value="Pendente">Pendente</option>
                  <option value="Recebida">Recebida</option>
                </select>
              </label>
              <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>
            </div>
          </div>

          <div class="form-actions" style="grid-column:1 / -1;">
            <button class="btn btn-primary" type="submit">${state.editingPurchaseId ? 'Salvar compra' : 'Cadastrar compra'}</button>
            <button class="btn btn-secondary" type="button" id="purchase-form-cancel-btn">Cancelar</button>
          </div>
        </form>
      </div>
    `;
  }

  function openPurchaseFormModal(purchaseId = null) {
    state.editingPurchaseId = purchaseId;
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="purchase-form-modal-backdrop">
        <div class="modal-card form-modal-card">
          ${getPurchaseFormHtml()}
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
      state.editingPurchaseId = null;
      render();
    };

    modalRoot.querySelector('#purchase-form-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'purchase-form-modal-backdrop') closeModal();
    });

    modalRoot.querySelector('#purchase-form-cancel-btn')?.addEventListener('click', closeModal);

    const form = modalRoot.querySelector('#purchase-form');
    fillForm(form, getEditingPurchase());
    bindSubmitGuard(form, savePurchase, { busyLabel: 'Salvando...' });
  }

  function openDetailsModal(purchaseId) {
    const row = getRows().find((item) => item.id === purchaseId);
    if (!row) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="purchase-details-modal-backdrop">
        <div class="modal-card sale-details-modal-card">
          <div class="section-header">
            <h2>Detalhes da compra</h2>
            <button class="btn btn-secondary" type="button" id="purchase-details-modal-close">Fechar</button>
          </div>

          <div class="sale-details-grid">
            <div class="sale-details-box"><span>Fornecedor</span><strong>${escapeHtml(row.supplierName || '-')}</strong></div>
            <div class="sale-details-box"><span>Status</span><strong>${escapeHtml(row.status || '-')}</strong></div>
            <div class="sale-details-box"><span>Data</span><strong>${escapeHtml(row.receivedDate || normalizeDate(row.receivedAt) || '-')}</strong></div>
            <div class="sale-details-box"><span>Total</span><strong>${currency(row.totalAmount || 0)}</strong></div>
            <div class="sale-details-box"><span>Condição</span><strong>${escapeHtml(row.paymentCondition || '-')}</strong></div>
            <div class="sale-details-box"><span>Documento</span><strong>${escapeHtml(row.documentNumber || '-')}</strong></div>
          </div>

          <div class="table-card" style="padding:14px;">
            <div class="section-header"><h3>Descrição</h3></div>
            <div class="empty-state" style="padding:14px;">${escapeHtml(row.description || '-')}</div>
          </div>

          <div class="table-card" style="padding:14px; margin-top:14px;">
            <div class="section-header"><h3>Observações</h3></div>
            <div class="empty-state" style="padding:14px;">${escapeHtml(row.notes || '-')}</div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => { modalRoot.innerHTML = ''; };
    modalRoot.querySelector('#purchase-details-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#purchase-details-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'purchase-details-modal-backdrop') closeModal();
    });
  }

  function openPurchaseActions(purchaseId) {
    window.openActionsSheet?.('Ações da compra', [
      {
        label: 'Editar',
        className: 'btn btn-secondary',
        onClick: async () => openPurchaseFormModal(purchaseId)
      }
    ]);
  }

  function renderPurchaseActions(row) {
    return `
      <div class="actions-inline-compact">
        <button class="icon-action-btn success" type="button" data-purchase-receive="${row.id}" title="Receber" aria-label="Receber">📥</button>
        <button class="icon-action-btn info" type="button" data-purchase-view="${row.id}" title="Detalhes" aria-label="Detalhes">👁️</button>
        <button class="icon-action-btn" type="button" data-purchase-more="${row.id}" title="Mais ações" aria-label="Mais ações">⋯</button>
      </div>
    `;
  }

  function bindEvents() {
    bindAsyncButton(tabEls.purchases.querySelector('#open-purchase-form-btn'), async () => {
      openPurchaseFormModal(null);
    }, { busyLabel: 'Abrindo...' });

    tabEls.purchases.querySelector('#purchase-filter-apply')?.addEventListener('click', () => {
      filters.supplier = tabEls.purchases.querySelector('#purchase-filter-supplier')?.value || '';
      filters.status = tabEls.purchases.querySelector('#purchase-filter-status')?.value || '';
      filters.dateFrom = tabEls.purchases.querySelector('#purchase-filter-date-from')?.value || '';
      filters.dateTo = tabEls.purchases.querySelector('#purchase-filter-date-to')?.value || '';
      render();
    });

    bindAsyncButton(tabEls.purchases.querySelector('#purchase-filter-clear'), async () => {
      filters = { supplier: '', status: '', dateFrom: '', dateTo: '' };
      render();
    }, { busyLabel: 'Limpando...' });

    tabEls.purchases.querySelectorAll('[data-purchase-receive]').forEach((btn) => {
      bindAsyncButton(btn, async () => {
        await receivePurchase(btn.dataset.purchaseReceive);
      }, { busyLabel: '...' });
    });

    tabEls.purchases.querySelectorAll('[data-purchase-view]').forEach((btn) => {
      btn.addEventListener('click', () => openDetailsModal(btn.dataset.purchaseView));
    });

    tabEls.purchases.querySelectorAll('[data-purchase-more]').forEach((btn) => {
      btn.addEventListener('click', () => openPurchaseActions(btn.dataset.purchaseMore));
    });
  }

  function render() {
    if (!hasPermission(state.currentUser, 'purchases')) {
      tabEls.purchases.innerHTML = renderBlocked();
      return;
    }

    const rows = getFilteredRows();
    const summary = getSummary();

    tabEls.purchases.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card"><span>Total de compras</span><strong>${summary.total}</strong></div>
          <div class="metric-card"><span>Recebidas</span><strong>${summary.received}</strong></div>
          <div class="metric-card"><span>Pendentes</span><strong>${summary.pending}</strong></div>
          <div class="metric-card"><span>Valor total</span><strong>${currency(summary.totalValue)}</strong></div>
        </div>

        <div class="entity-toolbar panel">
          <div>
            <h2 style="margin:0 0 6px;">Compras</h2>
            <p class="muted">Cadastro em modal e histórico com rolagem interna.</p>
          </div>
          <div class="entity-toolbar-actions">
            <button class="btn btn-primary" type="button" id="open-purchase-form-btn">Nova compra</button>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Lista de compras</h2>
            <span class="muted">${rows.length} resultado(s)</span>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input id="purchase-filter-supplier" placeholder="Fornecedor" value="${escapeHtml(filters.supplier)}" />
            <select id="purchase-filter-status">
              <option value="">Todos os status</option>
              <option value="Pendente" ${filters.status === 'Pendente' ? 'selected' : ''}>Pendente</option>
              <option value="Recebida" ${filters.status === 'Recebida' ? 'selected' : ''}>Recebida</option>
            </select>
            <input id="purchase-filter-date-from" type="date" value="${filters.dateFrom}" />
            <input id="purchase-filter-date-to" type="date" value="${filters.dateTo}" />
            <button class="btn btn-secondary" type="button" id="purchase-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="purchase-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap scroll-dual">
            <table>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Descrição</th>
                  <th>Data</th>
                  <th>Total</th>
                  <th>Condição</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.supplierName || '-')}</td>
                    <td>${escapeHtml(row.description || '-')}</td>
                    <td>${escapeHtml(row.receivedDate || normalizeDate(row.receivedAt) || '-')}</td>
                    <td>${currency(row.totalAmount || 0)}</td>
                    <td>${escapeHtml(row.paymentCondition || '-')}</td>
                    <td><span class="tag ${row.status === 'Recebida' ? 'success' : 'warning'}">${escapeHtml(row.status || '-')}</span></td>
                    <td>${renderPurchaseActions(row)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="7">Nenhuma compra encontrada.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  return { render };
}