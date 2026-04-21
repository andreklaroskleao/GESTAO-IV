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

      return (
        (!filters.supplier || supplier.includes(filters.supplier.toLowerCase())) &&
        (!filters.status || status === filters.status) &&
        (!filters.dateFrom || !dueDate || dueDate >= filters.dateFrom) &&
        (!filters.dateTo || !dueDate || dueDate <= filters.dateTo)
      );
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

  function getCurrentUserMeta() {
    return {
      uid: String(state.currentUser?.uid || ''),
      name: String(state.currentUser?.fullName || ''),
      email: String(state.currentUser?.email || '')
    };
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

  function closePayableFormModal() {
    const modalRoot = document.getElementById('modal-root');
    if (modalRoot) {
      modalRoot.innerHTML = '';
    }
    state.editingPayableId = null;
    render();
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

      if (payload.totalAmount < 0 || payload.paidAmount < 0) {
        alert('Os valores não podem ser negativos.');
        return;
      }

      if (payload.paidAmount > payload.totalAmount) {
        alert('O valor pago não pode ser maior que o total.');
        return;
      }

      if (state.editingPayableId) {
        const current = getEditingRow();

        await updateByPath('accounts_payable', state.editingPayableId, {
          ...payload,
          editedAt: new Date().toISOString(),
          editedBy: getCurrentUserMeta().uid || getCurrentUserMeta().name || ''
        });

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
        const createdId = await createDoc(refs.accountsPayable, {
          ...payload,
          paymentHistory: []
        });

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
    } finally {
      isSavingPayable = false;
    }
  }

  function getPayableFormHtml() {
    return `
      <div class="modal-backdrop" id="payable-form-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>${state.editingPayableId ? 'Editar conta a pagar' : 'Nova conta a pagar'}</h2>
          </div>

          <p class="auth-hint">Cadastro em modal.</p>

          <form id="payable-form" class="stack-list">
            <div class="section-header">
              <h3>Identificação</h3>
            </div>

            <p class="auth-hint">Fornecedor e descrição</p>

            <div class="filters-grid">
              <label>
                Fornecedor
                <input name="supplierName" list="payable-suppliers-list" required />
                <datalist id="payable-suppliers-list">
                  ${(state.suppliers || [])
                    .filter((item) => item.deleted !== true && item.active !== false)
                    .map((item) => `<option value="${escapeHtml(item.name || '')}"></option>`)
                    .join('')}
                </datalist>
              </label>

              <label>
                Documento
                <input name="documentNumber" />
              </label>

              <label>
                Descrição
                <input name="description" required />
              </label>
            </div>

            <div class="section-header">
              <h3>Valores</h3>
            </div>

            <p class="auth-hint">Total, pago e vencimento</p>

            <div class="filters-grid">
              <label>
                Vencimento
                <input type="date" name="dueDate" />
              </label>

              <label>
                Total
                <input type="number" name="totalAmount" min="0" step="0.01" required />
              </label>

              <label>
                Pago
                <input type="number" name="paidAmount" min="0" step="0.01" value="0" />
              </label>
            </div>

            <label>
              Observações
              <textarea name="notes" rows="3"></textarea>
            </label>

            <div class="form-actions">
              <button class="btn btn-primary" type="submit">
                ${state.editingPayableId ? 'Salvar conta' : 'Cadastrar conta'}
              </button>
              <button class="btn btn-secondary" type="button" id="payable-form-cancel-btn">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function openPayableFormModal(payableId = null) {
    state.editingPayableId = payableId;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = getPayableFormHtml();

    modalRoot.querySelector('#payable-form-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'payable-form-modal-backdrop') closePayableFormModal();
    });

    modalRoot.querySelector('#payable-form-cancel-btn')?.addEventListener('click', closePayableFormModal);

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

          <div class="filters-grid">
            <div><strong>Fornecedor</strong><br>${escapeHtml(row.supplierName || '-')}</div>
            <div><strong>Total</strong><br>${currency(row.totalAmount || 0)}</div>
            <div><strong>Em aberto</strong><br>${currency(row.openAmount || 0)}</div>
          </div>

          <form id="payable-payment-form" class="stack-list" style="margin-top:16px;">
            <label>
              Valor do pagamento
              <input type="number" name="paymentAmount" min="0" step="0.01" required />
            </label>

            <label>
              Observação
              <textarea name="paymentNote" rows="3"></textarea>
            </label>

            <div class="form-actions">
              <button class="btn btn-primary" type="submit">Registrar pagamento</button>
              <button class="btn btn-secondary" type="button" id="payable-payment-full-btn">Quitar tudo</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#payable-payment-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#payable-payment-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'payable-payment-modal-backdrop') closeModal();
    });

    modalRoot.querySelector('#payable-payment-full-btn')?.addEventListener('click', () => {
      modalRoot.querySelector('input[name="paymentAmount"]').value = Number(row.openAmount || 0);
    });

    bindSubmitGuard(
      modalRoot.querySelector('#payable-payment-form'),
      async () => {
        const form = modalRoot.querySelector('#payable-payment-form');
        const values = Object.fromEntries(new FormData(form).entries());
        const paymentAmount = toNumber(values.paymentAmount);
        const paymentNote = String(values.paymentNote || '').trim();

        if (paymentAmount <= 0) {
          alert('Informe um valor válido.');
          return;
        }

        if (paymentAmount > Number(row.openAmount || 0)) {
          alert('O pagamento não pode ser maior que o valor em aberto.');
          return;
        }

        const actor = getCurrentUserMeta();
        const paymentHistory = Array.isArray(row.paymentHistory) ? [...row.paymentHistory] : [];

        paymentHistory.push({
          amount: paymentAmount,
          note: paymentNote,
          createdAt: new Date().toISOString(),
          createdBy: actor.uid || actor.name || '',
          createdByName: actor.name || '',
          createdByEmail: actor.email || ''
        });

        const newPaidAmount = Number(row.paidAmount || 0) + paymentAmount;
        const newOpenAmount = Math.max(0, Number(row.totalAmount || 0) - newPaidAmount);

        await updateByPath('accounts_payable', row.id, {
          paidAmount: newPaidAmount,
          openAmount: newOpenAmount,
          lastPaymentAt: new Date().toISOString(),
          lastPaymentNote: paymentNote,
          paymentHistory
        });

        await auditModule.log({
          module: 'payables',
          action: 'payment',
          entityType: 'account_payable',
          entityId: row.id,
          entityLabel: row.description || '',
          description: 'Pagamento registrado em conta a pagar.',
          metadata: { paymentAmount, paymentNote }
        });

        showToast('Pagamento registrado.', 'success');
        closeModal();
        render();
      },
      { busyLabel: 'Registrando...' }
    );
  }

  function openDetailsModal(payableId) {
    const row = getRows().find((item) => item.id === payableId);
    if (!row) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    const status = getPayableStatus(row);
    const history = Array.isArray(row.paymentHistory) ? [...row.paymentHistory].reverse() : [];

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="payable-details-modal-backdrop">
        <div class="modal-card" style="max-width:960px;">
          <div class="section-header">
            <h2>Detalhes da conta a pagar</h2>
            <button class="btn btn-secondary" type="button" id="payable-details-modal-close">Fechar</button>
          </div>

          <div class="filters-grid">
            <div><strong>Fornecedor</strong><br>${escapeHtml(row.supplierName || '-')}</div>
            <div><strong>Status</strong><br>${getStatusLabel(status)}</div>
            <div><strong>Vencimento</strong><br>${escapeHtml(row.dueDate || '-')}</div>
            <div><strong>Total</strong><br>${currency(row.totalAmount || 0)}</div>
            <div><strong>Pago</strong><br>${currency(row.paidAmount || 0)}</div>
            <div><strong>Em aberto</strong><br>${currency(row.openAmount || 0)}</div>
            <div><strong>Documento</strong><br>${escapeHtml(row.documentNumber || '-')}</div>
            <div><strong>Último pagamento</strong><br>${row.lastPaymentAt ? formatDateTime(row.lastPaymentAt) : '-'}</div>
            <div><strong>Observação do pagamento</strong><br>${escapeHtml(row.lastPaymentNote || '-')}</div>
          </div>

          <div style="margin-top:16px;">
            <strong>Observações</strong>
            <div class="empty-state" style="text-align:left; margin-top:8px;">
              <span>${escapeHtml(row.notes || 'Sem observações.')}</span>
            </div>
          </div>

          <div style="margin-top:16px;">
            <strong>Histórico de pagamentos</strong>
            <div class="table-wrap scroll-dual" style="margin-top:8px;">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Observação</th>
                    <th>Usuário</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    history.map((item) => `
                      <tr>
                        <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
                        <td>${currency(item.amount || 0)}</td>
                        <td>${escapeHtml(item.note || '-')}</td>
                        <td>${escapeHtml(item.createdByName || '-')}</td>
                      </tr>
                    `).join('') || `
                      <tr>
                        <td colspan="4">Nenhum pagamento registrado.</td>
                      </tr>
                    `
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#payable-details-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#payable-details-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'payable-details-modal-backdrop') closeModal();
    });
  }

  function openDeletePayableModal(payableId) {
    const row = getRows().find((item) => item.id === payableId);
    if (!row) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="delete-payable-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Excluir conta a pagar</h2>
            <button class="btn btn-secondary" type="button" id="delete-payable-close-btn">Fechar</button>
          </div>

          <div class="empty-state" style="text-align:left;">
            <strong>${escapeHtml(row.description || 'Conta a pagar')}</strong>
            <span>Fornecedor: ${escapeHtml(row.supplierName || '-')}</span>
            <span>Esta exclusão é lógica e manterá compatibilidade com os dados existentes.</span>
          </div>

          <form id="delete-payable-form" class="form-grid" style="margin-top:16px;">
            <label style="grid-column:1 / -1;">
              Motivo da exclusão
              <textarea name="deleteReason" rows="4" required></textarea>
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-danger" type="submit">Excluir conta</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#delete-payable-close-btn')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#delete-payable-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'delete-payable-modal-backdrop') closeModal();
    });

    modalRoot.querySelector('#delete-payable-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const actor = getCurrentUserMeta();

      await updateByPath('accounts_payable', row.id, {
        deleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: actor.uid || actor.name || '',
        deleteReason: String(values.deleteReason || '').trim()
      });

      await auditModule.log({
        module: 'payables',
        action: 'delete',
        entityType: 'account_payable',
        entityId: row.id,
        entityLabel: row.description || '',
        description: 'Conta a pagar excluída logicamente.',
        metadata: {
          deleteReason: String(values.deleteReason || '').trim()
        }
      });

      showToast('Conta excluída com sucesso.', 'success');
      closeModal();
      render();
    });
  }

  function renderPayableActions(row) {
    return `
      <button class="btn btn-secondary" type="button" data-payable-view="${row.id}">Ver</button>
      <button class="btn btn-secondary" type="button" data-payable-pay="${row.id}">Pagar</button>
      <button class="btn btn-secondary" type="button" data-payable-edit="${row.id}">Editar</button>
      <button class="btn btn-secondary" type="button" data-payable-delete="${row.id}">Excluir</button>
    `;
  }

  function bindEvents() {
    bindAsyncButton(
      tabEls.payables.querySelector('#open-payable-form-btn'),
      async () => {
        openPayableFormModal(null);
      },
      { busyLabel: 'Abrindo...' }
    );

    tabEls.payables.querySelector('#payable-filter-apply')?.addEventListener('click', () => {
      filters.supplier = tabEls.payables.querySelector('#payable-filter-supplier')?.value || '';
      filters.status = tabEls.payables.querySelector('#payable-filter-status')?.value || '';
      filters.dateFrom = tabEls.payables.querySelector('#payable-filter-date-from')?.value || '';
      filters.dateTo = tabEls.payables.querySelector('#payable-filter-date-to')?.value || '';
      render();
    });

    bindAsyncButton(
      tabEls.payables.querySelector('#payable-filter-clear'),
      async () => {
        filters = { supplier: '', status: '', dateFrom: '', dateTo: '' };
        render();
      },
      { busyLabel: 'Limpando...' }
    );

    tabEls.payables.querySelectorAll('[data-payable-pay]').forEach((btn) => {
      bindAsyncButton(btn, async () => openPaymentModal(btn.dataset.payablePay), { busyLabel: '...' });
    });

    tabEls.payables.querySelectorAll('[data-payable-view]').forEach((btn) => {
      btn.addEventListener('click', () => openDetailsModal(btn.dataset.payableView));
    });

    tabEls.payables.querySelectorAll('[data-payable-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openPayableFormModal(btn.dataset.payableEdit));
    });

    tabEls.payables.querySelectorAll('[data-payable-delete]').forEach((btn) => {
      btn.addEventListener('click', () => openDeletePayableModal(btn.dataset.payableDelete));
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
      <div class="filters-grid">
        <div><strong>Total em aberto</strong><br>${currency(summary.totalOpen)}</div>
        <div><strong>Total pago</strong><br>${currency(summary.totalPaid)}</div>
        <div><strong>Vencidas</strong><br>${summary.overdueCount}</div>
        <div><strong>Filtradas</strong><br>${summary.filtered}</div>
      </div>

      <div class="section-header" style="margin-top:16px;">
        <h2>Contas a pagar</h2>
      </div>

      <p class="auth-hint">Cadastro em modal e lista com rolagem interna.</p>

      <div class="form-actions" style="margin-bottom:16px;">
        <button class="btn btn-primary" type="button" id="open-payable-form-btn">Nova conta</button>
      </div>

      <div class="section-header">
        <h2>Lista de contas a pagar</h2>
        <span>${rows.length} resultado(s)</span>
      </div>

      <div class="filters-grid">
        <input id="payable-filter-supplier" placeholder="Fornecedor" value="${escapeHtml(filters.supplier)}" />
        <select id="payable-filter-status">
          <option value="">Todos os status</option>
          <option value="em_aberto" ${filters.status === 'em_aberto' ? 'selected' : ''}>Em aberto</option>
          <option value="vencido" ${filters.status === 'vencido' ? 'selected' : ''}>Vencido</option>
          <option value="quitado" ${filters.status === 'quitado' ? 'selected' : ''}>Quitado</option>
        </select>
        <input id="payable-filter-date-from" type="date" value="${escapeHtml(filters.dateFrom)}" />
        <input id="payable-filter-date-to" type="date" value="${escapeHtml(filters.dateTo)}" />
        <button class="btn btn-secondary" type="button" id="payable-filter-apply">Filtrar</button>
        <button class="btn btn-secondary" type="button" id="payable-filter-clear">Limpar</button>
      </div>

      <div class="table-wrap" style="margin-top:16px;">
        <table class="table">
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
            ${
              rows.map((row) => {
                const status = getPayableStatus(row);
                return `
                  <tr>
                    <td>${escapeHtml(row.supplierName || '-')}</td>
                    <td>${escapeHtml(row.description || '-')}</td>
                    <td>${escapeHtml(row.dueDate || '-')}</td>
                    <td>${currency(row.totalAmount || 0)}</td>
                    <td>${currency(row.openAmount || 0)}</td>
                    <td><span class="badge badge-${getStatusTagClass(status)}">${getStatusLabel(status)}</span></td>
                    <td>${renderPayableActions(row)}</td>
                  </tr>
                `;
              }).join('') || `
                <tr>
                  <td colspan="7">Nenhuma conta encontrada.</td>
                </tr>
              `
            }
          </tbody>
        </table>
      </div>
    `;

    bindEvents();
  }

  return { render };
}