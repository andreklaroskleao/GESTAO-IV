import { escapeHtml, renderBlocked, showToast, bindAsyncButton } from './ui.js';

export function createClientsTabModule(ctx) {
  const {
    state,
    tabEls,
    clientsModule,
    accountsModule,
    hasPermission,
    updateByPath
  } = ctx;

  let filters = {
    term: '',
    status: ''
  };

  function getRows() {
    return (state.clients || []).filter((item) => item.deleted !== true);
  }

  function getFilteredClients() {
    return getRows().filter((item) => {
      const haystack = [
        item.name,
        item.phone,
        item.email,
        item.document,
        item.address
      ].join(' ').toLowerCase();

      const status = item.active === false ? 'inativo' : 'ativo';

      return (!filters.term || haystack.includes(filters.term.toLowerCase()))
        && (!filters.status || status === filters.status);
    });
  }

  function getSummary() {
    const rows = getRows();

    return {
      total: rows.length,
      active: rows.filter((item) => item.active !== false).length,
      inactive: rows.filter((item) => item.active === false).length,
      receivables: (state.accountsReceivable || []).reduce((sum, item) => sum + Number(item.openAmount || 0), 0)
    };
  }

  function openClientFormModal(clientId = null) {
    state.editingClientId = clientId;
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="client-form-modal-backdrop">
        <div class="modal-card form-modal-card">
          ${clientsModule.renderClientForm?.(clientId) || ''}
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
      state.editingClientId = null;
      render();
    };

    modalRoot.querySelector('#client-form-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'client-form-modal-backdrop') {
        closeModal();
      }
    });

    const cancelBtn = modalRoot.querySelector('#client-reset-btn');
    cancelBtn?.addEventListener('click', () => {
      closeModal();
    });

    window.addEventListener('clients:changed', closeModal, { once: true });
  }

  function openClientActions(clientId) {
    const client = getRows().find((item) => item.id === clientId);
    if (!client) return;

    if (client.active === false) {
      window.openActionsSheet?.('Ações do cliente', [
        {
          label: 'Editar',
          className: 'btn btn-secondary',
          onClick: async () => openClientFormModal(clientId)
        },
        {
          label: 'Reativar',
          className: 'btn btn-secondary',
          onClick: async () => {
            await updateByPath('clients', clientId, {
              active: true,
              deleted: false
            });

            showToast('Cliente reativado.', 'success');
            render();
          }
        },
        {
          label: 'Excluir',
          className: 'btn btn-danger',
          onClick: async () => {
            window.openConfirmDeleteModal?.({
              title: 'Excluir cliente',
              message: 'Deseja realmente excluir este cliente? Ele deixará de aparecer nas listagens.',
              onConfirm: async () => {
                await updateByPath('clients', clientId, {
                  active: false,
                  deleted: true
                });

                showToast('Cliente excluído.', 'success');
                render();
              }
            });
          }
        }
      ]);
      return;
    }

    window.openActionsSheet?.('Ações do cliente', [
      {
        label: 'Editar',
        className: 'btn btn-secondary',
        onClick: async () => openClientFormModal(clientId)
      },
      {
        label: 'Inativar',
        className: 'btn btn-secondary',
        onClick: async () => {
          await clientsModule.inactivateClient(clientId);
          showToast('Cliente inativado.', 'success');
          render();
        }
      },
      {
        label: 'Excluir',
        className: 'btn btn-danger',
        onClick: async () => {
          window.openConfirmDeleteModal?.({
            title: 'Excluir cliente',
            message: 'Deseja realmente excluir este cliente? Ele deixará de aparecer nas listagens.',
            onConfirm: async () => {
              await updateByPath('clients', clientId, {
                active: false,
                deleted: true
              });

              showToast('Cliente excluído.', 'success');
              render();
            }
          });
        }
      }
    ]);
  }

  function renderClientActions(row) {
    return `
      <div class="actions-inline-compact">
        <button
          class="icon-action-btn"
          type="button"
          data-client-edit="${row.id}"
          title="Editar"
          aria-label="Editar"
        >✏️</button>

        <button
          class="icon-action-btn info"
          type="button"
          data-client-account="${row.id}"
          title="Contas"
          aria-label="Contas"
        >💳</button>

        <button
          class="icon-action-btn"
          type="button"
          data-client-more="${row.id}"
          title="Mais ações"
          aria-label="Mais ações"
        >⋯</button>
      </div>
    `;
  }

  function bindEvents() {
    bindAsyncButton(tabEls.clients.querySelector('#open-client-form-btn'), async () => {
      openClientFormModal(null);
    }, { busyLabel: 'Abrindo...' });

    tabEls.clients.querySelector('#client-filter-apply')?.addEventListener('click', () => {
      filters.term = tabEls.clients.querySelector('#client-filter-term')?.value || '';
      filters.status = tabEls.clients.querySelector('#client-filter-status')?.value || '';
      render();
    });

    bindAsyncButton(tabEls.clients.querySelector('#client-filter-clear'), async () => {
      filters = { term: '', status: '' };
      render();
    }, { busyLabel: 'Limpando...' });

    tabEls.clients.querySelectorAll('[data-client-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openClientFormModal(btn.dataset.clientEdit));
    });

    tabEls.clients.querySelectorAll('[data-client-account]').forEach((btn) => {
      btn.addEventListener('click', () => {
        accountsModule.openClientAccountsModal?.(btn.dataset.clientAccount);
      });
    });

    tabEls.clients.querySelectorAll('[data-client-more]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openClientActions(btn.dataset.clientMore);
      });
    });
  }

  function render() {
    if (!hasPermission(state.currentUser, 'clients')) {
      tabEls.clients.innerHTML = renderBlocked();
      return;
    }

    const rows = getFilteredClients();
    const summary = getSummary();

    tabEls.clients.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card"><span>Total de clientes</span><strong>${summary.total}</strong></div>
          <div class="metric-card"><span>Ativos</span><strong>${summary.active}</strong></div>
          <div class="metric-card"><span>Inativos</span><strong>${summary.inactive}</strong></div>
          <div class="metric-card"><span>Em aberto</span><strong>${Number(summary.receivables || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
        </div>

        <div class="entity-toolbar panel">
          <div>
            <h2 style="margin:0 0 6px;">Clientes</h2>
            <p class="muted">Cadastro em modal e lista com rolagem interna.</p>
          </div>
          <div class="entity-toolbar-actions">
            <button class="btn btn-primary" type="button" id="open-client-form-btn">Novo cliente</button>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Lista de clientes</h2>
            <span class="muted">${rows.length} resultado(s)</span>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input
              id="client-filter-term"
              placeholder="Buscar por nome, telefone, e-mail, documento ou endereço"
              value="${escapeHtml(filters.term)}"
            />

            <select id="client-filter-status">
              <option value="">Todos os status</option>
              <option value="ativo" ${filters.status === 'ativo' ? 'selected' : ''}>Ativo</option>
              <option value="inativo" ${filters.status === 'inativo' ? 'selected' : ''}>Inativo</option>
            </select>

            <button class="btn btn-secondary" type="button" id="client-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="client-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap scroll-dual">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Documento</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.name || '-')}</td>
                    <td>${escapeHtml(row.phone || '-')}</td>
                    <td>${escapeHtml(row.email || '-')}</td>
                    <td>${escapeHtml(row.document || '-')}</td>
                    <td>${row.active === false ? '<span class="tag warning">Inativo</span>' : '<span class="tag success">Ativo</span>'}</td>
                    <td>${renderClientActions(row)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="6">Nenhum cliente encontrado.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  return {
    render
  };
}