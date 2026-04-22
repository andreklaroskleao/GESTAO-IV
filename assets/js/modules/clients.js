import { escapeHtml, showToast, bindSubmitGuard, bindAsyncButton } from './ui.js';

export function createClientsModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    updateByPath,
    auditModule
  } = ctx;

  function getRows() {
    return (state.clients || []).filter((item) => item.deleted !== true);
  }

  function getEditingClient() {
    return getRows().find((item) => item.id === state.editingClientId) || null;
  }

  function hasDuplicateDocument(documentValue, ignoreId = '') {
    const normalized = String(documentValue || '').trim();
    if (!normalized) return false;

    return getRows().some((item) => {
      return String(item.id || '') !== String(ignoreId || '') &&
        String(item.document || item.cpf || '').trim() === normalized;
    });
  }

  function buildClientPayload(form) {
    const values = Object.fromEntries(new FormData(form).entries());

    return {
      name: String(values.name || '').trim(),
      cpf: String(values.cpf || '').trim(),
      document: String(values.cpf || '').trim(),
      phone: String(values.phone || '').trim(),
      email: String(values.email || '').trim(),
      address: String(values.address || '').trim(),
      neighborhood: String(values.neighborhood || '').trim(),
      city: String(values.city || '').trim(),
      state: String(values.state || '').trim(),
      zipCode: String(values.zipCode || '').trim(),
      notes: String(values.notes || '').trim(),
      active: true,
      deleted: false
    };
  }

  function fillForm(form, client) {
    if (!form) return;

    form.elements.name.value = client?.name || '';
    form.elements.cpf.value = client?.cpf || client?.document || '';
    form.elements.phone.value = client?.phone || '';
    form.elements.email.value = client?.email || '';
    form.elements.address.value = client?.address || '';
    form.elements.neighborhood.value = client?.neighborhood || '';
    form.elements.city.value = client?.city || '';
    form.elements.state.value = client?.state || '';
    form.elements.zipCode.value = client?.zipCode || '';
    form.elements.notes.value = client?.notes || '';
  }

  async function saveClient() {
    const form = document.querySelector('#client-form');
    if (!form) return;

    const payload = buildClientPayload(form);

    if (!payload.name) {
      alert('Informe o nome do cliente.');
      return;
    }

    if (hasDuplicateDocument(payload.document, state.editingClientId)) {
      alert('Já existe um cliente com este CPF/documento.');
      return;
    }

    if (state.editingClientId) {
      await updateByPath('clients', state.editingClientId, {
        ...payload,
        editedAt: new Date().toISOString(),
        editedBy: String(state.currentUser?.uid || state.currentUser?.fullName || '')
      });

      await auditModule.log({
        module: 'clients',
        action: 'update',
        entityType: 'client',
        entityId: state.editingClientId,
        entityLabel: payload.name,
        description: 'Cliente atualizado.'
      });

      state.editingClientId = null;
      showToast('Cliente atualizado com sucesso.', 'success');
    } else {
      const createdId = await createDoc(refs.clients, {
        ...payload,
        createdAt: new Date()
      });

      await auditModule.log({
        module: 'clients',
        action: 'create',
        entityType: 'client',
        entityId: createdId,
        entityLabel: payload.name,
        description: 'Cliente cadastrado.'
      });

      showToast('Cliente cadastrado com sucesso.', 'success');
    }

    const modalRoot = document.getElementById('modal-root');
    if (modalRoot) modalRoot.innerHTML = '';
  }

  function openClientFormModal(clientId = null) {
    state.editingClientId = clientId;

    const client = getEditingClient();
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="client-form-modal-backdrop">
        <div class="modal-card" style="max-width:920px;">
          <div class="section-header">
            <h2>${clientId ? 'Editar cliente' : 'Novo cliente'}</h2>
            <button class="btn btn-secondary" type="button" id="client-form-close-btn">Fechar</button>
          </div>

          <form id="client-form" class="form-grid">
            <label style="grid-column:1 / -1;">
              Nome
              <input name="name" required />
            </label>

            <label>
              CPF
              <input name="cpf" />
            </label>

            <label>
              Telefone
              <input name="phone" />
            </label>

            <label>
              E-mail
              <input name="email" type="email" />
            </label>

            <label style="grid-column:1 / -1;">
              Endereço
              <input name="address" />
            </label>

            <label>
              Bairro
              <input name="neighborhood" />
            </label>

            <label>
              Cidade
              <input name="city" />
            </label>

            <label>
              Estado
              <input name="state" />
            </label>

            <label>
              CEP
              <input name="zipCode" />
            </label>

            <label style="grid-column:1 / -1;">
              Observações
              <textarea name="notes" rows="4"></textarea>
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">
                ${clientId ? 'Salvar alterações' : 'Cadastrar cliente'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
      state.editingClientId = null;
    };

    modalRoot.querySelector('#client-form-close-btn')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#client-form-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'client-form-modal-backdrop') closeModal();
    });

    const form = modalRoot.querySelector('#client-form');
    fillForm(form, client);

    bindSubmitGuard(form, async () => {
      await saveClient();
    }, { busyLabel: 'Salvando...' });
  }

  function openDeleteClientModal(clientId, onSaved) {
    const client = getRows().find((item) => item.id === clientId);
    if (!client) return;

    window.openConfirmDeleteModal?.({
      title: 'Excluir cliente',
      message: `Deseja realmente excluir "${client.name || 'cliente'}"?`,
      confirmLabel: 'Excluir cliente',
      onConfirm: async () => {
        await updateByPath('clients', client.id, {
          deleted: true,
          active: false,
          deletedAt: new Date().toISOString(),
          deletedBy: String(state.currentUser?.uid || state.currentUser?.fullName || '')
        });

        await auditModule.log({
          module: 'clients',
          action: 'delete',
          entityType: 'client',
          entityId: client.id,
          entityLabel: client.name || '',
          description: 'Cliente excluído logicamente.'
        });

        showToast('Cliente excluído com sucesso.', 'success');
        onSaved?.();
      }
    });
  }

  function renderClientPicker({ target, onSelect } = {}) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return;

    const rows = getRows();

    host.innerHTML = `
      <div class="stack-list">
        ${
          rows.map((client) => `
            <button class="list-item" type="button" data-pick-client="${client.id}">
              <strong>${escapeHtml(client.name || '-')}</strong>
              <span>${escapeHtml(client.phone || 'Sem telefone')} · ${escapeHtml(client.cpf || client.document || 'Sem CPF')}</span>
            </button>
          `).join('') || `
            <div class="empty-state">
              <strong>Nenhum cliente encontrado</strong>
              <span>Cadastre um cliente para selecionar.</span>
            </div>
          `
        }
      </div>
    `;

    host.querySelectorAll('[data-pick-client]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const client = rows.find((item) => item.id === btn.dataset.pickClient);
        if (client) {
          onSelect?.(client);
        }
      });
    });
  }

  function bindListEvents(root) {
    root.querySelector('#open-client-form-btn')?.addEventListener('click', () => {
      openClientFormModal(null);
    });

    root.querySelectorAll('[data-edit-client]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openClientFormModal(btn.dataset.editClient);
      });
    });

    root.querySelectorAll('[data-delete-client]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openDeleteClientModal(btn.dataset.deleteClient, () => {
          const clientsHost = root.closest('#clients-section-host') || root;
          renderInto(clientsHost);
        });
      });
    });
  }

  function renderTable(rows) {
    return `
      <div class="table-wrap scroll-dual">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Telefone</th>
              <th>E-mail</th>
              <th>Cidade</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.map((client) => `
                <tr>
                  <td>${escapeHtml(client.name || '-')}</td>
                  <td>${escapeHtml(client.cpf || client.document || '-')}</td>
                  <td>${escapeHtml(client.phone || '-')}</td>
                  <td>${escapeHtml(client.email || '-')}</td>
                  <td>${escapeHtml(client.city || '-')}</td>
                  <td>
                    <div class="actions-inline-compact">
                      <button class="icon-action-btn" type="button" data-edit-client="${client.id}" aria-label="Editar">✏️</button>
                      <button class="icon-action-btn" type="button" data-delete-client="${client.id}" aria-label="Excluir">🗑️</button>
                    </div>
                  </td>
                </tr>
              `).join('') || `
                <tr>
                  <td colspan="6">Nenhum cliente encontrado.</td>
                </tr>
              `
            }
          </tbody>
        </table>
      </div>
    `;
  }

  function renderInto(host) {
    if (!host) return;

    const rows = getRows();

    host.innerHTML = `
      <div class="table-card">
        <div class="section-header">
          <h2>Clientes</h2>
          <div class="form-actions">
            <button class="btn btn-primary" type="button" id="open-client-form-btn">Novo cliente</button>
          </div>
        </div>

        ${renderTable(rows)}
      </div>
    `;

    bindListEvents(host);
  }

  function render() {
    if (!ctx.hasPermission?.(state.currentUser, 'clients')) {
      if (ctx.tabEls?.clients) {
        ctx.tabEls.clients.innerHTML = renderBlocked();
      }
      return;
    }

    if (ctx.tabEls?.clients) {
      renderInto(ctx.tabEls.clients);
    }
  }

  return {
    render,
    renderInto,
    renderClientPicker
  };
}