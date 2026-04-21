import { escapeHtml, showToast, renderBlocked } from './ui.js';

export function createAccountsModule(ctx) {
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
    clientsModule,
    auditModule
  } = ctx;

  let filters = {
    client: '',
    status: '',
    dueDateFrom: '',
    dueDateTo: ''
  };

  function getActor() {
    return {
      uid: String(state.currentUser?.uid || ''),
      name: String(state.currentUser?.fullName || ''),
      email: String(state.currentUser?.email || '')
    };
  }

  function getStatusLabel(item) {
    const openAmount = Number(item.openAmount || 0);
    if (openAmount <= 0) return 'Quitado';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = item.dueDate ? new Date(`${item.dueDate}T00:00:00`) : null;

    if (dueDate && dueDate < today) return 'Vencido';
    return 'Em aberto';
  }

  function getStatusClass(item) {
    const status = getStatusLabel(item);
    if (status === 'Quitado') return 'badge-success';
    if (status === 'Vencido') return 'badge-danger';
    return 'badge-warning';
  }

  function getRows() {
    return (state.accountsReceivable || []).filter((item) => item.deleted !== true);
  }

  function getFilteredAccounts() {
    return getRows()
      .filter((item) => {
        const clientName = String(item.clientName || '').toLowerCase();
        const status = getStatusLabel(item);

        return (!filters.client || clientName.includes(filters.client.toLowerCase()))
          && (!filters.status || status === filters.status)
          && (!filters.dueDateFrom || (item.dueDate && item.dueDate >= filters.dueDateFrom))
          && (!filters.dueDateTo || (item.dueDate && item.dueDate <= filters.dueDateTo));
      })
      .sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return db - da;
      });
  }

  async function createAccount(payload) {
    const totalAmount = toNumber(payload.totalAmount);
    const receivedAmount = toNumber(payload.receivedAmount);
    const openAmount = Math.max(0, totalAmount - receivedAmount);

    const actor = getActor();

    const data = {
      clientId: payload.clientId || '',
      clientName: String(payload.clientName || '').trim(),
      description: String(payload.description || '').trim(),
      totalAmount,
      receivedAmount,
      openAmount,
      dueDate: payload.dueDate || '',
      paymentMethod: String(payload.paymentMethod || '').trim(),
      status: openAmount <= 0 ? 'Quitado' : 'Em aberto',
      notes: String(payload.notes || '').trim(),
      payments: receivedAmount > 0
        ? [{
            amount: receivedAmount,
            method: payload.paymentMethod || '',
            receivedAt: new Date(),
            receivedById: actor.uid,
            receivedByName: actor.name,
            receivedByEmail: actor.email,
            notes: 'Recebimento inicial'
          }]
        : [],
      createdAt: new Date(),
      createdById: actor.uid,
      createdByName: actor.name,
      deleted: false
    };

    const createdId = await createDoc(refs.accountsReceivable, data);

    await auditModule.log({
      module: 'accounts',
      action: 'create',
      entityType: 'account_receivable',
      entityId: createdId,
      entityLabel: data.clientName || 'Conta a receber',
      description: 'Conta a receber cadastrada.',
      metadata: {
        totalAmount: data.totalAmount,
        openAmount: data.openAmount,
        dueDate: data.dueDate
      }
    });

    showToast('Conta a receber cadastrada com sucesso.', 'success');
  }

  async function registerPayment(accountId, amount, method, notes = '') {
    const account = getRows().find((item) => item.id === accountId);
    if (!account) {
      throw new Error('Conta não encontrada.');
    }

    const paymentAmount = toNumber(amount);
    if (paymentAmount <= 0) {
      throw new Error('Informe um valor válido.');
    }

    const currentOpen = Number(account.openAmount || 0);
    if (paymentAmount > currentOpen) {
      throw new Error('O valor recebido não pode ser maior que o saldo em aberto.');
    }

    const updatedReceived = Number(account.receivedAmount || 0) + paymentAmount;
    const updatedOpen = Math.max(0, Number(account.totalAmount || 0) - updatedReceived);
    const actor = getActor();

    const payments = Array.isArray(account.payments) ? [...account.payments] : [];
    payments.push({
      amount: paymentAmount,
      method: method || '',
      receivedAt: new Date(),
      receivedById: actor.uid,
      receivedByName: actor.name,
      receivedByEmail: actor.email,
      notes: String(notes || '').trim()
    });

    await updateByPath('accounts_receivable', accountId, {
      receivedAmount: updatedReceived,
      openAmount: updatedOpen,
      status: updatedOpen <= 0 ? 'Quitado' : 'Em aberto',
      paymentMethod: method || account.paymentMethod || '',
      payments
    });

    await auditModule.log({
      module: 'accounts',
      action: 'receive',
      entityType: 'account_receivable',
      entityId: accountId,
      entityLabel: account.clientName || 'Conta a receber',
      description: 'Recebimento registrado.',
      metadata: {
        received: paymentAmount,
        remaining: updatedOpen,
        method: method || ''
      }
    });

    showToast('Recebimento registrado com sucesso.', 'success');
  }

  function renderPaymentModal(accountId, onSaved) {
    const account = getRows().find((item) => item.id === accountId);
    if (!account) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="account-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Registrar recebimento</h2>
            <button class="btn btn-secondary" type="button" id="account-modal-close">Fechar</button>
          </div>

          <div class="empty-state" style="text-align:left;">
            <strong>${escapeHtml(account.clientName || '-')}</strong>
            <span>Descrição: ${escapeHtml(account.description || '-')}</span>
            <span>Saldo em aberto: ${currency(account.openAmount || 0)}</span>
          </div>

          <form id="account-payment-form" class="form-grid" style="margin-top:16px;">
            <label>
              Valor recebido
              <input name="amount" type="number" min="0" step="0.01" required />
            </label>

            <label>
              Forma de recebimento
              <select name="method">
                <option value="Dinheiro">Dinheiro</option>
                <option value="PIX">PIX</option>
                <option value="Cartão">Cartão</option>
                <option value="Transferência">Transferência</option>
                <option value="Outro">Outro</option>
              </select>
            </label>

            <label style="grid-column:1 / -1;">
              Observações
              <textarea name="notes" rows="3"></textarea>
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Salvar recebimento</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#account-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#account-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'account-modal-backdrop') {
        closeModal();
      }
    });

    modalRoot.querySelector('#account-payment-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        const values = Object.fromEntries(new FormData(event.currentTarget).entries());
        await registerPayment(accountId, values.amount, values.method, values.notes);
        closeModal();
        onSaved?.();
      } catch (error) {
        alert(error.message || 'Erro ao registrar recebimento.');
      }
    });
  }

  function renderHistoryTable(account) {
    const payments = Array.isArray(account?.payments) ? [...account.payments].reverse() : [];

    return `
      <div class="table-wrap scroll-dual">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Valor</th>
              <th>Forma</th>
              <th>Usuário</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            ${
              payments.map((item) => `
                <tr>
                  <td>${escapeHtml(formatDateTime(item.receivedAt))}</td>
                  <td>${currency(item.amount || 0)}</td>
                  <td>${escapeHtml(item.method || '-')}</td>
                  <td>${escapeHtml(item.receivedByName || '-')}</td>
                  <td>${escapeHtml(item.notes || '-')}</td>
                </tr>
              `).join('') || `
                <tr>
                  <td colspan="5">Nenhum recebimento registrado.</td>
                </tr>
              `
            }
          </tbody>
        </table>
      </div>
    `;
  }

  function openDetailsModal(accountId) {
    const account = getRows().find((item) => item.id === accountId);
    if (!account) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="account-details-modal-backdrop">
        <div class="modal-card" style="max-width:960px;">
          <div class="section-header">
            <h2>Detalhes da conta a receber</h2>
            <button class="btn btn-secondary" type="button" id="account-details-close">Fechar</button>
          </div>

          <div class="filters-grid">
            <div><strong>Cliente</strong><br>${escapeHtml(account.clientName || '-')}</div>
            <div><strong>Status</strong><br>${escapeHtml(getStatusLabel(account))}</div>
            <div><strong>Descrição</strong><br>${escapeHtml(account.description || '-')}</div>
            <div><strong>Vencimento</strong><br>${escapeHtml(account.dueDate || '-')}</div>
            <div><strong>Total</strong><br>${currency(account.totalAmount || 0)}</div>
            <div><strong>Recebido</strong><br>${currency(account.receivedAmount || 0)}</div>
            <div><strong>Aberto</strong><br>${currency(account.openAmount || 0)}</div>
            <div><strong>Forma prevista</strong><br>${escapeHtml(account.paymentMethod || '-')}</div>
          </div>

          <div style="margin-top:16px;">
            <strong>Observações</strong>
            <div class="empty-state" style="text-align:left; margin-top:8px;">
              <span>${escapeHtml(account.notes || 'Sem observações.')}</span>
            </div>
          </div>

          <div style="margin-top:16px;">
            <strong>Histórico de recebimentos</strong>
            <div style="margin-top:8px;">
              ${renderHistoryTable(account)}
            </div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#account-details-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#account-details-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'account-details-modal-backdrop') {
        closeModal();
      }
    });
  }

  function openEditModal(accountId, onSaved) {
    const account = getRows().find((item) => item.id === accountId);
    if (!account) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="account-edit-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Editar conta a receber</h2>
            <button class="btn btn-secondary" type="button" id="account-edit-close">Fechar</button>
          </div>

          <form id="account-edit-form" class="form-grid">
            <input type="hidden" name="clientId" value="${escapeHtml(account.clientId || '')}" />

            <label style="grid-column:1 / -1;">
              Cliente
              <input name="clientName" type="text" value="${escapeHtml(account.clientName || '')}" required />
            </label>

            <label style="grid-column:1 / -1;">
              Descrição
              <input name="description" type="text" value="${escapeHtml(account.description || '')}" required />
            </label>

            <label>
              Valor total
              <input name="totalAmount" type="number" min="0" step="0.01" value="${Number(account.totalAmount || 0)}" required />
            </label>

            <label>
              Valor recebido
              <input name="receivedAmount" type="number" min="0" step="0.01" value="${Number(account.receivedAmount || 0)}" required />
            </label>

            <label>
              Vencimento
              <input name="dueDate" type="date" value="${escapeHtml(account.dueDate || '')}" />
            </label>

            <label>
              Forma prevista
              <select name="paymentMethod">
                <option value="">Selecione</option>
                <option value="Dinheiro" ${account.paymentMethod === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
                <option value="PIX" ${account.paymentMethod === 'PIX' ? 'selected' : ''}>PIX</option>
                <option value="Cartão" ${account.paymentMethod === 'Cartão' ? 'selected' : ''}>Cartão</option>
                <option value="Transferência" ${account.paymentMethod === 'Transferência' ? 'selected' : ''}>Transferência</option>
                <option value="Outro" ${account.paymentMethod === 'Outro' ? 'selected' : ''}>Outro</option>
              </select>
            </label>

            <label style="grid-column:1 / -1;">
              Observações
              <textarea name="notes">${escapeHtml(account.notes || '')}</textarea>
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Salvar alterações</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#account-edit-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#account-edit-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'account-edit-modal-backdrop') {
        closeModal();
      }
    });

    modalRoot.querySelector('#account-edit-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const totalAmount = toNumber(values.totalAmount);
      const receivedAmount = toNumber(values.receivedAmount);

      if (receivedAmount > totalAmount) {
        alert('O valor recebido não pode ser maior que o total.');
        return;
      }

      const actor = getActor();
      const openAmount = Math.max(0, totalAmount - receivedAmount);

      await updateByPath('accounts_receivable', accountId, {
        clientId: values.clientId || '',
        clientName: String(values.clientName || '').trim(),
        description: String(values.description || '').trim(),
        totalAmount,
        receivedAmount,
        openAmount,
        dueDate: values.dueDate || '',
        paymentMethod: String(values.paymentMethod || '').trim(),
        status: openAmount <= 0 ? 'Quitado' : 'Em aberto',
        notes: String(values.notes || '').trim(),
        editedAt: new Date().toISOString(),
        editedBy: actor.uid || actor.name || ''
      });

      await auditModule.log({
        module: 'accounts',
        action: 'update',
        entityType: 'account_receivable',
        entityId: accountId,
        entityLabel: String(values.clientName || '').trim() || 'Conta a receber',
        description: 'Conta a receber atualizada.',
        metadata: {
          totalAmount,
          receivedAmount,
          openAmount
        }
      });

      showToast('Conta atualizada com sucesso.', 'success');
      closeModal();
      onSaved?.();
    });
  }

  function openDeleteModal(accountId, onSaved) {
    const account = getRows().find((item) => item.id === accountId);
    if (!account) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="account-delete-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Excluir conta a receber</h2>
            <button class="btn btn-secondary" type="button" id="account-delete-close">Fechar</button>
          </div>

          <div class="empty-state" style="text-align:left;">
            <strong>${escapeHtml(account.clientName || 'Conta a receber')}</strong>
            <span>Descrição: ${escapeHtml(account.description || '-')}</span>
            <span>Esta exclusão é lógica e mantém compatibilidade com os dados existentes.</span>
          </div>

          <form id="account-delete-form" class="form-grid" style="margin-top:16px;">
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

    modalRoot.querySelector('#account-delete-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#account-delete-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'account-delete-modal-backdrop') {
        closeModal();
      }
    });

    modalRoot.querySelector('#account-delete-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const actor = getActor();

      await updateByPath('accounts_receivable', accountId, {
        deleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: actor.uid || actor.name || '',
        deleteReason: String(values.deleteReason || '').trim()
      });

      await auditModule.log({
        module: 'accounts',
        action: 'delete',
        entityType: 'account_receivable',
        entityId: accountId,
        entityLabel: account.clientName || 'Conta a receber',
        description: 'Conta a receber excluída logicamente.',
        metadata: {
          deleteReason: String(values.deleteReason || '').trim()
        }
      });

      showToast('Conta excluída com sucesso.', 'success');
      closeModal();
      onSaved?.();
    });
  }

  function bindEvents(root = tabEls.clients) {
    const form = root.querySelector('#account-form');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        const values = Object.fromEntries(new FormData(form).entries());
        await createAccount(values);
        form.reset();

        if (root === tabEls.clients) {
          renderEmbedded();
        }
      } catch (error) {
        alert(error.message || 'Erro ao cadastrar conta a receber.');
      }
    });

    root.querySelector('#account-filter-apply')?.addEventListener('click', () => {
      filters.client = root.querySelector('#account-filter-client').value || '';
      filters.status = root.querySelector('#account-filter-status').value || '';
      filters.dueDateFrom = root.querySelector('#account-filter-date-from').value || '';
      filters.dueDateTo = root.querySelector('#account-filter-date-to').value || '';
      renderEmbedded();
    });

    root.querySelector('#account-filter-clear')?.addEventListener('click', () => {
      filters = { client: '', status: '', dueDateFrom: '', dueDateTo: '' };
      renderEmbedded();
    });

    root.querySelector('#account-client-picker-btn')?.addEventListener('click', () => {
      const modalRoot = document.getElementById('modal-root');
      if (!modalRoot) return;

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="account-client-modal-backdrop">
          <div class="modal-card">
            <div class="section-header">
              <h2>Selecionar cliente</h2>
              <button class="btn btn-secondary" type="button" id="account-client-modal-close">Fechar</button>
            </div>
            <div id="account-client-picker-host"></div>
          </div>
        </div>
      `;

      const closeModal = () => {
        modalRoot.innerHTML = '';
      };

      modalRoot.querySelector('#account-client-modal-close')?.addEventListener('click', closeModal);
      modalRoot.querySelector('#account-client-modal-backdrop')?.addEventListener('click', (event) => {
        if (event.target.id === 'account-client-modal-backdrop') {
          closeModal();
        }
      });

      clientsModule.renderClientPicker({
        target: '#account-client-picker-host',
        onSelect: (client) => {
          root.querySelector('#account-client-id').value = client.id;
          root.querySelector('#account-client-name').value = client.name || '';
          closeModal();
        }
      });
    });

    root.querySelector('#account-client-clear-btn')?.addEventListener('click', () => {
      root.querySelector('#account-client-id').value = '';
      root.querySelector('#account-client-name').value = '';
    });

    root.querySelectorAll('[data-account-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openDetailsModal(btn.dataset.accountView);
      });
    });

    root.querySelectorAll('[data-account-receive]').forEach((btn) => {
      btn.addEventListener('click', () => {
        renderPaymentModal(btn.dataset.accountReceive, renderEmbedded);
      });
    });

    root.querySelectorAll('[data-account-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openEditModal(btn.dataset.accountEdit, renderEmbedded);
      });
    });

    root.querySelectorAll('[data-account-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openDeleteModal(btn.dataset.accountDelete, renderEmbedded);
      });
    });

    root.querySelectorAll('[data-account-history]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const account = getRows().find((item) => item.id === btn.dataset.accountHistory);
        const host = root.querySelector('#account-history-host');
        if (!host || !account) return;

        host.innerHTML = `
          <div class="empty-state" style="text-align:left;">
            <strong>${escapeHtml(account.clientName || '-')}</strong>
            <span>Descrição: ${escapeHtml(account.description || '-')}</span>
            <span>Total: ${currency(account.totalAmount || 0)}</span>
            <span>Recebido: ${currency(account.receivedAmount || 0)}</span>
            <span>Aberto: ${currency(account.openAmount || 0)}</span>
            <span>Status: ${escapeHtml(getStatusLabel(account))}</span>
            <span>Vencimento: ${escapeHtml(account.dueDate || '-')}</span>
          </div>

          <div style="margin-top:12px;">
            ${renderHistoryTable(account)}
          </div>
        `;
      });
    });
  }

  function renderEmbedded() {
    const rows = getFilteredAccounts();

    return `
      <div class="section-stack">
        <div class="table-card">
          <div class="section-header">
            <h2>Contas a receber</h2>
            <span>Controle de pendências financeiras</span>
          </div>

          <form id="account-form" class="form-grid">
            <input id="account-client-id" name="clientId" type="hidden" />

            <label style="grid-column:1 / -1;">
              Cliente
              <div class="form-actions" style="margin-bottom:8px;">
                <button class="btn btn-secondary" type="button" id="account-client-picker-btn">Selecionar cliente</button>
                <button class="btn btn-secondary" type="button" id="account-client-clear-btn">Limpar cliente</button>
              </div>
              <input id="account-client-name" name="clientName" required />
            </label>

            <label style="grid-column:1 / -1;">
              Descrição
              <input name="description" required />
            </label>

            <label>
              Valor total
              <input name="totalAmount" type="number" min="0" step="0.01" required />
            </label>

            <label>
              Valor recebido inicial
              <input name="receivedAmount" type="number" min="0" step="0.01" value="0" />
            </label>

            <label>
              Vencimento
              <input name="dueDate" type="date" />
            </label>

            <label>
              Forma prevista
              <select name="paymentMethod">
                <option value="">Selecione</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="PIX">PIX</option>
                <option value="Cartão">Cartão</option>
                <option value="Transferência">Transferência</option>
                <option value="Outro">Outro</option>
              </select>
            </label>

            <label style="grid-column:1 / -1;">
              Observações
              <textarea name="notes"></textarea>
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Cadastrar conta</button>
            </div>
          </form>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Lista de contas</h2>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input id="account-filter-client" placeholder="Cliente" value="${escapeHtml(filters.client)}" />
            <select id="account-filter-status">
              <option value="">Todos</option>
              <option value="Em aberto" ${filters.status === 'Em aberto' ? 'selected' : ''}>Em aberto</option>
              <option value="Quitado" ${filters.status === 'Quitado' ? 'selected' : ''}>Quitado</option>
              <option value="Vencido" ${filters.status === 'Vencido' ? 'selected' : ''}>Vencido</option>
            </select>
            <input id="account-filter-date-from" type="date" value="${filters.dueDateFrom}" />
            <input id="account-filter-date-to" type="date" value="${filters.dueDateTo}" />
            <button class="btn btn-secondary" type="button" id="account-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="account-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap scroll-dual">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Descrição</th>
                  <th>Total</th>
                  <th>Recebido</th>
                  <th>Aberto</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${
                  rows.map((item) => `
                    <tr>
                      <td>${escapeHtml(item.clientName || '-')}</td>
                      <td>${escapeHtml(item.description || '-')}</td>
                      <td>${currency(item.totalAmount || 0)}</td>
                      <td>${currency(item.receivedAmount || 0)}</td>
                      <td>${currency(item.openAmount || 0)}</td>
                      <td>${escapeHtml(item.dueDate || '-')}</td>
                      <td><span class="badge ${getStatusClass(item)}">${escapeHtml(getStatusLabel(item))}</span></td>
                      <td>
                        <div class="actions-inline-compact">
                          <button class="icon-action-btn" type="button" data-account-view="${item.id}" aria-label="Ver">👁️</button>
                          <button class="icon-action-btn" type="button" data-account-history="${item.id}" aria-label="Histórico">🕘</button>
                          ${Number(item.openAmount || 0) > 0 ? `<button class="icon-action-btn" type="button" data-account-receive="${item.id}" aria-label="Receber">💰</button>` : ''}
                          <button class="icon-action-btn" type="button" data-account-edit="${item.id}" aria-label="Editar">✏️</button>
                          <button class="icon-action-btn" type="button" data-account-delete="${item.id}" aria-label="Excluir">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  `).join('') || `
                    <tr>
                      <td colspan="8">Nenhuma conta encontrada.</td>
                    </tr>
                  `
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Histórico de recebimentos</h2>
          </div>
          <div id="account-history-host" class="empty-state">
            <strong>Selecione uma conta</strong>
            <span>Escolha uma conta para visualizar o histórico de recebimentos.</span>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    if (!hasPermission(state.currentUser, 'clients')) {
      tabEls.clients.innerHTML = renderBlocked();
      return;
    }

    tabEls.clients.innerHTML = renderEmbedded();
    bindEvents(tabEls.clients);
  }

  return {
    render,
    renderEmbedded,
    bindEmbeddedEvents: bindEvents,
    createAccount,
    registerPayment
  };
}