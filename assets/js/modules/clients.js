import { escapeHtml, showToast, bindSubmitGuard, bindAsyncButton } from './ui.js';

export function createClientsModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    updateByPath,
    auditModule
  } = ctx;

  let pickerState = {
    target: '',
    onSelect: null,
    term: ''
  };

  let isSavingClient = false;

  function getRows() {
    return (state.clients || []).filter((item) => item.deleted !== true);
  }

  function getClientById(clientId) {
    return getRows().find((item) => item.id === clientId) || null;
  }

  function getEditingClient() {
    return getClientById(state.editingClientId);
  }

  async function saveClient() {
    if (isSavingClient) return;
    isSavingClient = true;

    try {
      const form = document.querySelector('#client-form');
      if (!form) return;

      const payload = Object.fromEntries(new FormData(form).entries());

      payload.active = String(payload.active || 'true') === 'true';
      payload.deleted = false;

      if (!payload.name) {
        alert('Informe o nome do cliente.');
        return;
      }

      if (state.editingClientId) {
        const current = getEditingClient();

        await updateByPath('clients', state.editingClientId, payload);

        await auditModule?.log?.({
          module: 'clients',
          action: 'update',
          entityType: 'client',
          entityId: state.editingClientId,
          entityLabel: payload.name || current?.name || '',
          description: 'Cliente atualizado.'
        });

        state.editingClientId = null;
        showToast('Cliente atualizado.', 'success');
      } else {
        const createdId = await createDoc(refs.clients, payload);

        await auditModule?.log?.({
          module: 'clients',
          action: 'create',
          entityType: 'client',
          entityId: createdId,
          entityLabel: payload.name || '',
          description: 'Cliente cadastrado.'
        });

        showToast('Cliente cadastrado.', 'success');
      }

      form.reset();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('clients:changed'));
      }
    } finally {
      isSavingClient = false;
    }
  }

  async function inactivateClient(clientId) {
    const client = getClientById(clientId);
    if (!client) return;

    await updateByPath('clients', clientId, {
      active: false,
      deleted: false
    });

    await auditModule?.log?.({
      module: 'clients',
      action: 'inactivate',
      entityType: 'client',
      entityId: clientId,
      entityLabel: client.name || '',
      description: 'Cliente inativado.'
    });

    showToast('Cliente inativado.', 'success');
  }

  async function reactivateClient(clientId) {
    const client = getClientById(clientId);
    if (!client) return;

    await updateByPath('clients', clientId, {
      active: true,
      deleted: false
    });

    await auditModule?.log?.({
      module: 'clients',
      action: 'reactivate',
      entityType: 'client',
      entityId: clientId,
      entityLabel: client.name || '',
      description: 'Cliente reativado.'
    });

    showToast('Cliente reativado.', 'success');
  }

  function fillClientForm(form, client) {
    if (!form) return;

    form.elements.name.value = client?.name || '';
    form.elements.phone.value = client?.phone || '';
    form.elements.email.value = client?.email || '';
    form.elements.document.value = client?.document || '';
    form.elements.address.value = client?.address || '';
    form.elements.reference.value = client?.reference || '';
    form.elements.notes.value = client?.notes || '';
    form.elements.active.value = String(client?.active !== false);
  }

  function bindClientFormEvents() {
    const form = document.querySelector('#client-form');
    if (!form) return;

    bindSubmitGuard(form, saveClient, { busyLabel: 'Salvando...' });

    const resetBtn = document.querySelector('#client-reset-btn');
    bindAsyncButton(resetBtn, async () => {
      state.editingClientId = null;
      const freshForm = document.querySelector('#client-form');
      if (freshForm) {
        freshForm.reset();
        fillClientForm(freshForm, null);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('clients:changed'));
      }
    }, { busyLabel: 'Limpando...' });
  }

  function renderClientForm(editingClientId = null) {
    if (editingClientId !== null && editingClientId !== undefined) {
      state.editingClientId = editingClientId;
    }

    const editing = getEditingClient();

    const html = `
      <div class="section-header">
        <h2>${editing ? 'Editar cliente' : 'Cadastrar cliente'}</h2>
        <span class="muted">${editing ? 'Atualize os dados do cliente.' : 'Cadastro de clientes.'}</span>
      </div>

      <form id="client-form" class="form-grid mobile-optimized">
        <div class="form-section" style="grid-column:1 / -1;">
          <div class="form-section-title">
            <h3>1. Dados principais</h3>
            <span>Identificação e contato</span>
          </div>
          <div class="soft-divider"></div>

          <div class="form-grid">
            <label>Nome
              <input name="name" required />
            </label>

            <label>Telefone
              <input name="phone" />
            </label>

            <label>E-mail
              <input name="email" type="email" />
            </label>

            <label>Documento
              <input name="document" />
            </label>

            <label>Status
              <select name="active">
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>

            <label style="grid-column:1 / -1;">Endereço
              <input name="address" />
            </label>

            <label style="grid-column:1 / -1;">Referência
              <input name="reference" />
            </label>

            <label style="grid-column:1 / -1;">Observações
              <textarea name="notes"></textarea>
            </label>
          </div>
        </div>

        <div class="form-actions" style="grid-column:1 / -1;">
          <button class="btn btn-primary" type="submit">${editing ? 'Salvar cliente' : 'Cadastrar cliente'}</button>
          <button class="btn btn-secondary" type="button" id="client-reset-btn">Limpar</button>
        </div>
      </form>
    `;

    queueMicrotask(() => {
      const form = document.querySelector('#client-form');
      fillClientForm(form, editing);
      bindClientFormEvents();
    });

    return html;
  }

  function getFilteredPickerRows() {
    return getRows()
      .filter((item) => item.active !== false)
      .filter((item) => {
        const haystack = [
          item.name,
          item.phone,
          item.email,
          item.document,
          item.address
        ].join(' ').toLowerCase();

        return !pickerState.term || haystack.includes(pickerState.term.toLowerCase());
      })
      .slice(0, 20);
  }

  function renderClientPickerList() {
    const host = document.querySelector(pickerState.target);
    if (!host) return;

    const rows = getFilteredPickerRows();

    host.innerHTML = `
      <div class="section-stack">
        <div class="search-row">
          <input
            id="client-picker-search"
            placeholder="Buscar cliente por nome, telefone, documento ou endereço"
            value="${escapeHtml(pickerState.term)}"
          />
        </div>

        <div class="stack-list slim-list">
          ${rows.map((item) => `
            <button class="list-item" type="button" data-client-picker-select="${item.id}">
              <strong>${escapeHtml(item.name || '-')}</strong>
              <span>${escapeHtml(item.phone || 'Sem telefone')} · ${escapeHtml(item.document || 'Sem documento')}</span>
              <span>${escapeHtml(item.address || 'Sem endereço')}</span>
            </button>
          `).join('') || '<div class="empty-state">Nenhum cliente encontrado.</div>'}
        </div>
      </div>
    `;

    const searchInput = host.querySelector('#client-picker-search');
    searchInput?.addEventListener('input', (event) => {
      pickerState.term = event.currentTarget.value || '';
      renderClientPickerList();
    });

    host.querySelectorAll('[data-client-picker-select]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const client = getClientById(btn.dataset.clientPickerSelect);
        if (!client) return;

        pickerState.onSelect?.(client);
      });
    });
  }

  function renderClientPicker({ target, onSelect }) {
    pickerState = {
      target,
      onSelect,
      term: ''
    };

    renderClientPickerList();
  }

  return {
    renderClientForm,
    renderClientPicker,
    inactivateClient,
    reactivateClient,
    getClientById
  };
}