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

  function getStatusLabel(item) {
    const openAmount = Number(item.openAmount || 0);
    if (openAmount <= 0) return 'Quitado';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = item.dueDate ? new Date(`${item.dueDate}T00:00:00`) : null;
    if (dueDate && dueDate < today) return 'Vencido';

    return 'Em aberto';
  }

  function getFilteredAccounts() {
    return (state.accountsReceivable || [])
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
      payments: receivedAmount > 0 ? [{
        amount: receivedAmount,
        method: payload.paymentMethod || '',
        receivedAt: new Date(),
        receivedById: state.currentUser?.uid || '',
        receivedByName: state.currentUser?.fullName || '',
        notes: 'Recebimento inicial'
      }] : [],
      createdAt: new Date(),
      createdById: state.currentUser?.uid || '',
      createdByName: state.currentUser?.fullName || ''
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
    const account = (state.accountsReceivable || []).find((item) => item.id === accountId);
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
    const payments = Array.isArray(account.payments) ? [...account.payments] : [];

    payments.push({
      amount: paymentAmount,
      method: method || '',
      receivedAt: new Date(),
      receivedById: state.currentUser?.uid || '',
      receivedByName: state.currentUser?.fullName || '',
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
    const account = (state.accountsReceivable || []).find((item) => item.id === accountId);
    if (!account) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="account-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Registrar recebimento</h2>
            <button class="btn btn-secondary" id="account-modal-close">Fechar</button>
          </div>

          <div class="card" style="margin-bottom:16px;">
            <strong>${escapeHtml(account.clientName || '-')}</strong>
            <p class="muted">Descrição: ${escapeHtml(account.description || '-')}</p>
            <p class="muted">Saldo em aberto: ${currency(account.openAmount || 0)}</p>
          </div>

          <form id="account-payment-form" class="form-grid">
            <label>Valor recebido<input name="amount" type="number" min="0" step="0.01" required /></label>
            <label>Forma de recebimento
              <select name="method" required>
                <option value="Dinheiro">Dinheiro</option>
                <option value="PIX">PIX</option>
                <option value="Cartão">Cartão</option>
                <option value="Transferência">Transferência</option>
                <option value="Outro">Outro</option>
              </select>
            </label>
            <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>
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

    modalRoot.querySelector('#account-modal-close').addEventListener('click', closeModal);
    modalRoot.querySelector('#account-modal-backdrop').addEventListener('click', (event) => {
      if (event.target.id === 'account-modal-backdrop') {
        closeModal();
      }
    });

    modalRoot.querySelector('#account-payment-form').addEventListener('submit', async (event) => {
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
    const payments = Array.isArray(account?.payments) ? account.payments : [];

    return `
      <div class="table-wrap" style="margin-top:12px;">
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
            ${payments.map((item) => `
              <tr>
                <td>${formatDateTime(item.receivedAt)}</td>
                <td>${currency(item.amount || 0)}</td>
                <td>${escapeHtml(item.method || '-')}</td>
                <td>${escapeHtml(item.receivedByName || '-')}</td>
                <td>${escapeHtml(item.notes || '-')}</td>
              </tr>
            `).join('') || '<tr><td colspan="5">Nenhum recebimento registrado.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
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
      filters = {
        client: '',
        status: '',
        dueDateFrom: '',
        dueDateTo: ''
      };
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
              <button class="btn btn-secondary" id="account-client-modal-close">Fechar</button>
            </div>
            <div id="account-client-picker-host"></div>
          </div>
        </div>
      `;

      const closeModal = () => {
        modalRoot.innerHTML = '';
      };

      modalRoot.querySelector('#account-client-modal-close').addEventListener('click', closeModal);
      modalRoot.querySelector('#account-client-modal-backdrop').addEventListener('click', (event) => {
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

    root.querySelectorAll('[data-account-receive]').forEach((btn) => {
      btn.addEventListener('click', () => {
        renderPaymentModal(btn.dataset.accountReceive, renderEmbedded);
      });
    });

    root.querySelectorAll('[data-account-history]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const account = (state.accountsReceivable || []).find((item) => item.id === btn.dataset.accountHistory);
        const host = root.querySelector('#account-history-host');
        if (!host || !account) return;

        host.innerHTML = `
          <div class="card">
            <h3>${escapeHtml(account.clientName || '-')}</h3>
            <p><strong>Descrição:</strong> ${escapeHtml(account.description || '-')}</p>
            <p><strong>Total:</strong> ${currency(account.totalAmount || 0)}</p>
            <p><strong>Recebido:</strong> ${currency(account.receivedAmount || 0)}</p>
            <p><strong>Aberto:</strong> ${currency(account.openAmount || 0)}</p>
            <p><strong>Status:</strong> ${escapeHtml(getStatusLabel(account))}</p>
            <p><strong>Vencimento:</strong> ${escapeHtml(account.dueDate || '-')}</p>
          </div>
          ${renderHistoryTable(account)}
        `;
      });
    });
  }

  function renderEmbedded() {
    const rows = getFilteredAccounts();

    return `
      <div class="panel">
        <div class="section-header">
          <h2>Contas a receber</h2>
          <span class="muted">Controle de pendências financeiras</span>
        </div>

        <form id="account-form" class="form-grid">
          <input type="hidden" id="account-client-id" name="clientId" value="" />
          <label>Cliente<input id="account-client-name" name="clientName" required /></label>

          <div class="form-actions" style="grid-column:1 / -1; justify-content:flex-start;">
            <button class="btn btn-secondary" type="button" id="account-client-picker-btn">Selecionar cliente</button>
            <button class="btn btn-secondary" type="button" id="account-client-clear-btn">Limpar cliente</button>
          </div>

          <label>Descrição<input name="description" required /></label>
          <label>Valor total<input name="totalAmount" type="number" min="0" step="0.01" required /></label>
          <label>Valor recebido inicial<input name="receivedAmount" type="number" min="0" step="0.01" value="0" /></label>
          <label>Vencimento<input name="dueDate" type="date" /></label>
          <label>Forma prevista
            <select name="paymentMethod">
              <option value="Dinheiro">Dinheiro</option>
              <option value="PIX">PIX</option>
              <option value="Cartão">Cartão</option>
              <option value="Transferência">Transferência</option>
              <option value="Outro">Outro</option>
            </select>
          </label>
          <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>

          <div class="form-actions" style="grid-column:1 / -1;">
            <button class="btn btn-primary" type="submit">Cadastrar conta</button>
          </div>
        </form>
      </div>

      <div class="table-card" style="margin-top:18px;">
        <div class="section-header">
          <h2>Lista de contas</h2>
        </div>

        <div class="search-row" style="margin-bottom:14px; flex-wrap:wrap;">
          <input id="account-filter-client" placeholder="Cliente" value="${escapeHtml(filters.client)}" />
          <select id="account-filter-status">
            <option value="">Todos</option>
            <option value="Em aberto" ${filters.status === 'Em aberto' ? 'selected' : ''}>Em aberto</option>
            <option value="Quitado" ${filters.status === 'Quitado' ? 'selected' : ''}>Quitado</option>
            <option value="Vencido" ${filters.status === 'Vencido' ? 'selected' : ''}>Vencido</option>
          </select>
          <input id="account-filter-date-from" type="date" value="${filters.dueDateFrom}" />
          <input id="account-filter-date-to" type="date" value="${filters.dueDateTo}" />
          <button class="btn btn-secondary" id="account-filter-apply">Filtrar</button>
          <button class="btn btn-secondary" id="account-filter-clear">Limpar</button>
        </div>

        <div class="table-wrap">
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
              ${rows.map((item) => `
                <tr>
                  <td>${escapeHtml(item.clientName || '-')}</td>
                  <td>${escapeHtml(item.description || '-')}</td>
                  <td>${currency(item.totalAmount || 0)}</td>
                  <td>${currency(item.receivedAmount || 0)}</td>
                  <td>${currency(item.openAmount || 0)}</td>
                  <td>${escapeHtml(item.dueDate || '-')}</td>
                  <td>${escapeHtml(getStatusLabel(item))}</td>
                  <td>
                    <div class="inline-row">
                      <button class="btn btn-secondary" data-account-history="${item.id}">Histórico</button>
                      ${Number(item.openAmount || 0) > 0 ? `<button class="btn btn-primary" data-account-receive="${item.id}">Receber</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="8">Nenhuma conta encontrada.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="table-card" style="margin-top:18px;">
        <div class="section-header">
          <h2>Histórico de recebimentos</h2>
        </div>
        <div id="account-history-host">
          <div class="empty-state">Selecione uma conta para visualizar o histórico.</div>
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