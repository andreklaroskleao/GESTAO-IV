import { escapeHtml, renderBlocked, showToast, bindSubmitGuard, bindAsyncButton } from './ui.js';

export function createPayablesModule(ctx) {
  const {
    state,
    tabEls,
    refs,
    createDoc,
    updateByPath,
    currency,
    toNumber,
    formatDateTime,
    hasPermission,
    auditModule
  } = ctx;

  let filters = {
    supplier: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  };

  let isSavingPayable = false;

  function getRows() {
    return (state.accountsPayable || []).filter((item) => item.deleted !== true);
  }

  function getFilteredRows() {
    return getRows().filter((item) => {
      const supplier = String(item.supplierName || '').toLowerCase();
      const status = getPayableStatus(item);
      const dueDate = String(item.dueDate || '');

      return (!filters.supplier || supplier.includes(filters.supplier.toLowerCase()))
        && (!filters.status || status === filters.status)
        && (!filters.dateFrom || !dueDate || dueDate >= filters.dateFrom)
        && (!filters.dateTo || !dueDate || dueDate <= filters.dateTo);
    });
  }

  function getPayableStatus(item) {
    const openAmount = Number(item.openAmount || 0);
    if (openAmount <= 0) return 'quitado';
    if (!item.dueDate) return 'em_aberto';

    const due = new Date(`${item.dueDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return due < today ? 'vencido' : 'em_aberto';
  }

  function getStatusLabel(status) {
    if (status === 'quitado') return 'Quitado';
    if (status === 'vencido') return 'Vencido';
    return 'Em aberto';
  }

  function getStatusTagClass(status) {
    if (status === 'quitado') return 'success';
    if (status === 'vencido') return 'danger';
    return 'warning';
  }

  function getSummary() {
    const rows = getRows();

    return {
      totalOpen: rows.reduce((sum, item) => sum + Number(item.openAmount || 0), 0),
      totalPaid: rows.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0),
      overdueCount: rows.filter((item) => getPayableStatus(item) === 'vencido').length,
      filtered: getFilteredRows().length
    };
  }

  function getEditingRow() {
    return getRows().find((item) => item.id === state.editingPayableId) || null;
  }

  function fillForm(form, row) {
    if (!form) return;

    form.elements.supplierName.value = row?.supplierName || '';
    form.elements.description.value = row?.description || '';
    form.elements.documentNumber.value = row?.documentNumber || '';
    form.elements.dueDate.value = row?.dueDate || '';
    form.elements.totalAmount.value = row?.totalAmount ?? '';
    form.elements.paidAmount.value = row?.paidAmount ?? 0;
    form.elements.notes.value = row?.notes || '';
  }

  function recalcOpenAmount(totalAmount, paidAmount) {
    return Math.max(0, Number(totalAmount || 0) - Number(paidAmount || 0));
  }

  async function savePayable() {
    if (isSavingPayable) return;
    isSavingPayable = true;

    try {
      const form = document.querySelector('#payable-form');
      if (!form) return;

      const payload = Object.fromEntries(new FormData(form).entries());

      payload.totalAmount = toNumber(payload.totalAmount);
      payload.paidAmount = toNumber(payload.paidAmount);
      payload.openAmount = recalcOpenAmount(payload.totalAmount, payload.paidAmount);
      payload.deleted = false;

      if (!payload.supplierName || !payload.description) {
        alert('Informe fornecedor e descrição.');
        return;
      }

      if (state.editingPayableId) {
        const current = getEditingRow();

        await updateByPath('accounts_payable', state.editingPayableId, payload);

        await auditModule.log({
          module: 'payables',
          action: 'update',
          entityType: 'account_payable',
          entityId: state.editingPayableId,
          entityLabel: payload.description || current?.description || '',
          description: 'Conta a pagar atualizada.'
        });

        state.editingPayableId = null;
        showToast('Conta a pagar atualizada.', 'success');
      } else {
        const createdId = await createDoc(refs.accountsPayable, payload);

        await auditModule.log({
          module: 'payables',
          action: 'create',
          entityType: 'account_payable',
          entityId: createdId,
          entityLabel: payload.description || '',
          description: 'Conta a pagar cadastrada.'
        });

        showToast('Conta a pagar cadastrada.', 'success');
      }

      closePayableFormModal();
      render();
    } finally {
      isSavingPayable = false;
    }
  }

  function getPayableFormHtml() {
    return `
      <div class="form-modal-body">
        <div class="section-header">
          <h2>${state.editingPayableId ? 'Editar conta a pagar' : 'Nova conta a pagar'}</h2>
          <span class="muted">Cadastro em modal.</span>
        </div>

        <form id="payable-form" class="form-grid mobile-optimized">
          <div class="form-section" style="grid-column:1 / -1;">
            <div class="form-section-title">
              <h3>Identificação</h3>
              <span>Fornecedor e descrição</span>
            </div>
            <div class="soft-divider"></div>

            <div class="form-grid">
              <label>Fornecedor
                <input name="supplierName" list="payable-suppliers-datalist" required />
                <datalist id="payable-suppliers-datalist">
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
              <h3>Valores</h3>
              <span>Total, pago e vencimento</span>
            </div>
            <div class="soft-divider"></div>

            <div class="form-grid">
              <label>Vencimento<input name="dueDate" type="date" required /></label>
              <label>Total<input name="totalAmount" type="number" step="0.01" min="0" required /></label>
              <label>Pago<input name="paidAmount" type="number" step="0.01" min="0" value="0" /></label>
              <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>
            </div>
          </div>

          <div class="form-actions" style="grid-column:1 / -1;">
            <button class="btn btn-primary" type="submit">${state.editingPayableId ? 'Salvar conta' : 'Cadastrar conta'}</button>
            <button class="btn btn-secondary" type="button" id="payable-form-cancel-btn">Cancelar</button>
          </div>
        </form>
      </div>
    `;
  }

  function openPayableFormModal(payableId = null) {
    state.editingPayableId = payableId;
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="payable-form-modal-backdrop">
        <div class="modal-card form-modal-card">
          ${getPayableFormHtml()}
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
      state.editingPayableId = null;
      render();
    };

    modalRoot.querySelector('#payable-form-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'payable-form-modal-backdrop') closeModal();
    });

    modalRoot.querySelector('#payable-form-cancel-btn')?.addEventListener('click', closeModal);

    const form = modalRoot.querySelector('#payable-form');
    fillForm(form, getEditingRow());
    bindSubmitGuard(form, savePayable, { busyLabel: 'Salvando...' });
  }

  function openPaymentModal(payableId) {
    const row = getRows().find((item) => item.id === payableId);
    if (!row) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="payable-payment-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Registrar pagamento</h2>
            <button class="btn btn-secondary" type="button" id="payable-payment-modal-close">Fechar</button>
          </div>

          <div class="sale-details-grid" style="margin-bottom:14px;">
            <div class="sale-details-box"><span>Fornecedor</span><strong>${escapeHtml(row.supplierName || '-')}</strong></div>
            <div class="sale-details-box"><span>Total</span><strong>${currency(row.totalAmount || 0)}</strong></div>
            <div class="sale-details-box"><span>Em aberto</span><strong>${currency(row.openAmount || 0)}</strong></div>
          </div>

          <form id="payable-payment-form" class="form-grid">
            <label>Valor do pagamento
              <input name="paymentAmount" type="number" step="0.01" min="0.01" max="${Number(row.openAmount || 0)}" required />
            </label>

            <label>Observação
              <input name="paymentNote" placeholder="Opcional" />
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Registrar pagamento</button>
              <button class="btn btn-secondary" type="button" id="payable-payment-full-btn">Quitar tudo</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => { modalRoot.innerHTML = ''; };

    modalRoot.querySelector('#payable-payment-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#payable-payment-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'payable-payment-modal-backdrop') closeModal();
    });

    modalRoot.querySelector('#payable-payment-full-btn')?.addEventListener('click', () => {
      modalRoot.querySelector('input[name="paymentAmount"]').value = Number(row.openAmount || 0);
    });

    bindSubmitGuard(modalRoot.querySelector('#payable-payment-form'), async () => {
      const form = modalRoot.querySelector('#payable-payment-form');
      const values = Object.fromEntries(new FormData(form).entries());
      const paymentAmount = toNumber(values.paymentAmount);

      if (paymentAmount <= 0) {
        alert('Informe um valor válido.');
        return;
      }

      if (paymentAmount > Number(row.openAmount || 0)) {
        alert('O pagamento não pode ser maior que o valor em aberto.');
        return;
      }

      const newPaidAmount = Number(row.paidAmount || 0) + paymentAmount;
      const newOpenAmount = Math.max(0, Number(row.totalAmount || 0) - newPaidAmount);

      await updateByPath('accounts_payable', row.id, {
        paidAmount: newPaidAmount,
        openAmount: newOpenAmount,
        lastPaymentAt: new Date().toISOString(),
        lastPaymentNote: String(values.paymentNote || '')
      });

      await auditModule.log({
        module: 'payables',
        action: 'payment',
        entityType: 'account_payable',
        entityId: row.id,
        entityLabel: row.description || '',
        description: 'Pagamento registrado em conta a pagar.',
        metadata: { paymentAmount }
      });

      showToast('Pagamento registrado.', 'success');
      closeModal();
      render();
    }, { busyLabel: 'Registrando...' });
  }

  function openDetailsModal(payableId) {
    const row = getRows().find((item) => item.id === payableId);
    if (!row) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    const status = getPayableStatus(row);

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="payable-details-modal-backdrop">
        <div class="modal-card sale-details-modal-card">
          <div class="section-header">
            <h2>Detalhes da conta a pagar</h2>
            <button class="btn btn-secondary" type="button" id="payable-details-modal-close">Fechar</button>
          </div>

          <div class="sale-details-grid">
            <div class="sale-details-box"><span>Fornecedor</span><strong>${escapeHtml(row.supplierName || '-')}</strong></div>
            <div class="sale-details-box"><span>Status</span><strong>${getStatusLabel(status)}</strong></div>
            <div class="sale-details-box"><span>Vencimento</span><strong>${escapeHtml(row.dueDate || '-')}</strong></div>
            <div class="sale-details-box"><span>Total</span><strong>${currency(row.totalAmount || 0)}</strong></div>
            <div class="sale-details-box"><span>Pago</span><strong>${currency(row.paidAmount || 0)}</strong></div>
            <div class="sale-details-box"><span>Em aberto</span><strong>${currency(row.openAmount || 0)}</strong></div>
            <div class="sale-details-box"><span>Documento</span><strong>${escapeHtml(row.documentNumber || '-')}</strong></div>
            <div class="sale-details-box"><span>Último pagamento</span><strong>${row.lastPaymentAt ? formatDateTime(row.lastPaymentAt) : '-'}</strong></div>
            <div class="sale-details-box"><span>Observação do pagamento</span><strong>${escapeHtml(row.lastPaymentNote || '-')}</strong></div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => { modalRoot.innerHTML = ''; };
    modalRoot.querySelector('#payable-details-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#payable-details-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'payable-details-modal-backdrop') closeModal();
    });
  }

  function openPayableActions(payableId) {
    window.openActionsSheet?.('Ações da conta', [
      {
        label: 'Editar',
        className: 'btn btn-secondary',
        onClick: async () => openPayableFormModal(payableId)
      }
    ]);
  }

  function renderPayableActions(row) {
    return `
      <div class="actions-inline-compact">
        <button class="icon-action-btn success" type="button" data-payable-pay="${row.id}" title="Pagar" aria-label="Pagar">💰</button>
        <button class="icon-action-btn info" type="button" data-payable-view="${row.id}" title="Detalhes" aria-label="Detalhes">👁️</button>
        <button class="icon-action-btn" type="button" data-payable-more="${row.id}" title="Mais ações" aria-label="Mais ações">⋯</button>
      </div>
    `;
  }

  function bindEvents() {
    bindAsyncButton(tabEls.payables.querySelector('#open-payable-form-btn'), async () => {
      openPayableFormModal(null);
    }, { busyLabel: 'Abrindo...' });

    tabEls.payables.querySelector('#payable-filter-apply')?.addEventListener('click', () => {
      filters.supplier = tabEls.payables.querySelector('#payable-filter-supplier')?.value || '';
      filters.status = tabEls.payables.querySelector('#payable-filter-status')?.value || '';
      filters.dateFrom = tabEls.payables.querySelector('#payable-filter-date-from')?.value || '';
      filters.dateTo = tabEls.payables.querySelector('#payable-filter-date-to')?.value || '';
      render();
    });

    bindAsyncButton(tabEls.payables.querySelector('#payable-filter-clear'), async () => {
      filters = { supplier: '', status: '', dateFrom: '', dateTo: '' };
      render();
    }, { busyLabel: 'Limpando...' });

    tabEls.payables.querySelectorAll('[data-payable-pay]').forEach((btn) => {
      bindAsyncButton(btn, async () => openPaymentModal(btn.dataset.payablePay), { busyLabel: '...' });
    });

    tabEls.payables.querySelectorAll('[data-payable-view]').forEach((btn) => {
      btn.addEventListener('click', () => openDetailsModal(btn.dataset.payableView));
    });

    tabEls.payables.querySelectorAll('[data-payable-more]').forEach((btn) => {
      btn.addEventListener('click', () => openPayableActions(btn.dataset.payableMore));
    });
  }

  function render() {
    if (!hasPermission(state.currentUser, 'payables')) {
      tabEls.payables.innerHTML = renderBlocked();
      return;
    }

    const rows = getFilteredRows();
    const summary = getSummary();

    tabEls.payables.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card"><span>Total em aberto</span><strong>${currency(summary.totalOpen)}</strong></div>
          <div class="metric-card"><span>Total pago</span><strong>${currency(summary.totalPaid)}</strong></div>
          <div class="metric-card"><span>Vencidas</span><strong>${summary.overdueCount}</strong></div>
          <div class="metric-card"><span>Filtradas</span><strong>${summary.filtered}</strong></div>
        </div>

        <div class="entity-toolbar panel">
          <div>
            <h2 style="margin:0 0 6px;">Contas a pagar</h2>
            <p class="muted">Cadastro em modal e lista com rolagem interna.</p>
          </div>
          <div class="entity-toolbar-actions">
            <button class="btn btn-primary" type="button" id="open-payable-form-btn">Nova conta</button>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Lista de contas a pagar</h2>
            <span class="muted">${rows.length} resultado(s)</span>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input id="payable-filter-supplier" placeholder="Fornecedor" value="${escapeHtml(filters.supplier)}" />
            <select id="payable-filter-status">
              <option value="">Todos os status</option>
              <option value="em_aberto" ${filters.status === 'em_aberto' ? 'selected' : ''}>Em aberto</option>
              <option value="vencido" ${filters.status === 'vencido' ? 'selected' : ''}>Vencido</option>
              <option value="quitado" ${filters.status === 'quitado' ? 'selected' : ''}>Quitado</option>
            </select>
            <input id="payable-filter-date-from" type="date" value="${filters.dateFrom}" />
            <input id="payable-filter-date-to" type="date" value="${filters.dateTo}" />
            <button class="btn btn-secondary" type="button" id="payable-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="payable-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap scroll-dual">
            <table>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Descrição</th>
                  <th>Vencimento</th>
                  <th>Total</th>
                  <th>Em aberto</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row) => {
                  const status = getPayableStatus(row);
                  return `
                    <tr>
                      <td>${escapeHtml(row.supplierName || '-')}</td>
                      <td>${escapeHtml(row.description || '-')}</td>
                      <td>${escapeHtml(row.dueDate || '-')}</td>
                      <td>${currency(row.totalAmount || 0)}</td>
                      <td>${currency(row.openAmount || 0)}</td>
                      <td><span class="tag ${getStatusTagClass(status)}">${getStatusLabel(status)}</span></td>
                      <td>${renderPayableActions(row)}</td>
                    </tr>
                  `;
                }).join('') || '<tr><td colspan="7">Nenhuma conta encontrada.</td></tr>'}
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