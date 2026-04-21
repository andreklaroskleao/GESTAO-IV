import { escapeHtml, renderBlocked, showToast, bindSubmitGuard, bindAsyncButton } from './ui.js';

export function createSuppliersModule(ctx) {
  const {
    state,
    tabEls,
    refs,
    createDoc,
    updateByPath,
    hasPermission,
    auditModule
  } = ctx;

  let filters = {
    term: '',
    status: ''
  };

  let isSavingSupplier = false;

  function getRows() {
    return (state.suppliers || []).filter((item) => item.deleted !== true);
  }

  function getFilteredSuppliers() {
    return getRows().filter((item) => {
      const haystack = [
        item.name,
        item.contactName,
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

  function getEditingSupplier() {
    return getRows().find((item) => item.id === state.editingSupplierId) || null;
  }

  function getSummary() {
    const rows = getRows();

    return {
      total: rows.length,
      active: rows.filter((item) => item.active !== false).length,
      inactive: rows.filter((item) => item.active === false).length
    };
  }

  function fillForm(form, supplier) {
    if (!form || !supplier) return;

    form.elements.name.value = supplier.name || '';
    form.elements.contactName.value = supplier.contactName || '';
    form.elements.phone.value = supplier.phone || '';
    form.elements.email.value = supplier.email || '';
    form.elements.document.value = supplier.document || '';
    form.elements.address.value = supplier.address || '';
    form.elements.notes.value = supplier.notes || '';
    form.elements.active.value = String(supplier.active !== false);
  }

  async function saveSupplier() {
    if (isSavingSupplier) return;
    isSavingSupplier = true;

    try {
      const form = document.querySelector('#supplier-form');
      if (!form) return;

      const payload = Object.fromEntries(new FormData(form).entries());

      payload.active = String(payload.active || 'true') === 'true';
      payload.deleted = false;

      if (!payload.name) {
        alert('Informe o nome do fornecedor.');
        return;
      }

      if (state.editingSupplierId) {
        const current = getEditingSupplier();

        await updateByPath('suppliers', state.editingSupplierId, payload);

        await auditModule.log({
          module: 'suppliers',
          action: 'update',
          entityType: 'supplier',
          entityId: state.editingSupplierId,
          entityLabel: payload.name || current?.name || '',
          description: 'Fornecedor atualizado.'
        });

        state.editingSupplierId = null;
        showToast('Fornecedor atualizado.', 'success');
      } else {
        const createdId = await createDoc(refs.suppliers, payload);

        await auditModule.log({
          module: 'suppliers',
          action: 'create',
          entityType: 'supplier',
          entityId: createdId,
          entityLabel: payload.name || '',
          description: 'Fornecedor cadastrado.'
        });

        showToast('Fornecedor cadastrado.', 'success');
      }

      closeSupplierFormModal();
      render();
    } finally {
      isSavingSupplier = false;
    }
  }

  async function inactivateSupplier(supplierId) {
    const supplier = getRows().find((item) => item.id === supplierId);
    if (!supplier) return;

    await updateByPath('suppliers', supplierId, {
      active: false,
      deleted: false
    });

    await auditModule.log({
      module: 'suppliers',
      action: 'inactivate',
      entityType: 'supplier',
      entityId: supplierId,
      entityLabel: supplier.name || '',
      description: 'Fornecedor inativado.'
    });

    showToast('Fornecedor inativado.', 'success');
  }

  async function reactivateSupplier(supplierId) {
    const supplier = getRows().find((item) => item.id === supplierId);
    if (!supplier) return;

    await updateByPath('suppliers', supplierId, {
      active: true,
      deleted: false
    });

    await auditModule.log({
      module: 'suppliers',
      action: 'reactivate',
      entityType: 'supplier',
      entityId: supplierId,
      entityLabel: supplier.name || '',
      description: 'Fornecedor reativado.'
    });

    showToast('Fornecedor reativado.', 'success');
  }

  function getSupplierFormHtml() {
    return `
      <div class="form-modal-body">
        <div class="section-header">
          <h2>${state.editingSupplierId ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
          <span class="muted">Cadastro em modal.</span>
        </div>

        <form id="supplier-form" class="form-grid mobile-optimized">
          <div class="form-section" style="grid-column:1 / -1;">
            <div class="form-section-title">
              <h3>Dados principais</h3>
              <span>Identificação e contato</span>
            </div>
            <div class="soft-divider"></div>

            <div class="form-grid">
              <label>Nome<input name="name" required /></label>
              <label>Contato<input name="contactName" /></label>
              <label>Telefone<input name="phone" /></label>
              <label>E-mail<input name="email" type="email" /></label>
              <label>Documento<input name="document" /></label>
              <label>Status
                <select name="active">
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </label>
              <label style="grid-column:1 / -1;">Endereço<input name="address" /></label>
              <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>
            </div>
          </div>

          <div class="form-actions" style="grid-column:1 / -1;">
            <button class="btn btn-primary" type="submit">${state.editingSupplierId ? 'Salvar fornecedor' : 'Cadastrar fornecedor'}</button>
            <button class="btn btn-secondary" type="button" id="supplier-form-cancel-btn">Cancelar</button>
          </div>
        </form>
      </div>
    `;
  }

  function openSupplierFormModal(supplierId = null) {
    state.editingSupplierId = supplierId;
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="supplier-form-modal-backdrop">
        <div class="modal-card form-modal-card">
          ${getSupplierFormHtml()}
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
      state.editingSupplierId = null;
      render();
    };

    modalRoot.querySelector('#supplier-form-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'supplier-form-modal-backdrop') closeModal();
    });

    modalRoot.querySelector('#supplier-form-cancel-btn')?.addEventListener('click', closeModal);

    const form = modalRoot.querySelector('#supplier-form');
    fillForm(form, getEditingSupplier());
    bindSubmitGuard(form, saveSupplier, { busyLabel: 'Salvando...' });
  }

  function closeSupplierFormModal() {
    const modalRoot = document.getElementById('modal-root');
    if (modalRoot) modalRoot.innerHTML = '';
    state.editingSupplierId = null;
  }

  function openSupplierActions(supplierId) {
    const supplier = getRows().find((item) => item.id === supplierId);
    if (!supplier) return;

    if (supplier.active === false) {
      window.openActionsSheet?.('Ações do fornecedor', [
        {
          label: 'Editar',
          className: 'btn btn-secondary',
          onClick: async () => openSupplierFormModal(supplierId)
        },
        {
          label: 'Reativar',
          className: 'btn btn-secondary',
          onClick: async () => {
            await reactivateSupplier(supplierId);
            render();
          }
        }
      ]);
      return;
    }

    window.openActionsSheet?.('Ações do fornecedor', [
      {
        label: 'Editar',
        className: 'btn btn-secondary',
        onClick: async () => openSupplierFormModal(supplierId)
      },
      {
        label: 'Inativar',
        className: 'btn btn-secondary',
        onClick: async () => {
          await inactivateSupplier(supplierId);
          render();
        }
      }
    ]);
  }

  function renderSupplierActions(row) {
    return `
      <div class="actions-inline-compact">
        <button class="icon-action-btn" type="button" data-supplier-edit="${row.id}" title="Editar" aria-label="Editar">✏️</button>
        <button class="icon-action-btn" type="button" data-supplier-more="${row.id}" title="Mais ações" aria-label="Mais ações">⋯</button>
      </div>
    `;
  }

  function bindEvents() {
    bindAsyncButton(tabEls.suppliers.querySelector('#open-supplier-form-btn'), async () => {
      openSupplierFormModal(null);
    }, { busyLabel: 'Abrindo...' });

    tabEls.suppliers.querySelector('#supplier-filter-apply')?.addEventListener('click', () => {
      filters.term = tabEls.suppliers.querySelector('#supplier-filter-term')?.value || '';
      filters.status = tabEls.suppliers.querySelector('#supplier-filter-status')?.value || '';
      render();
    });

    bindAsyncButton(tabEls.suppliers.querySelector('#supplier-filter-clear'), async () => {
      filters = { term: '', status: '' };
      render();
    }, { busyLabel: 'Limpando...' });

    tabEls.suppliers.querySelectorAll('[data-supplier-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openSupplierFormModal(btn.dataset.supplierEdit));
    });

    tabEls.suppliers.querySelectorAll('[data-supplier-more]').forEach((btn) => {
      btn.addEventListener('click', () => openSupplierActions(btn.dataset.supplierMore));
    });
  }

  function render() {
    if (!hasPermission(state.currentUser, 'suppliers')) {
      tabEls.suppliers.innerHTML = renderBlocked();
      return;
    }

    const rows = getFilteredSuppliers();
    const summary = getSummary();

    tabEls.suppliers.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card"><span>Total de fornecedores</span><strong>${summary.total}</strong></div>
          <div class="metric-card"><span>Ativos</span><strong>${summary.active}</strong></div>
          <div class="metric-card"><span>Inativos</span><strong>${summary.inactive}</strong></div>
        </div>

        <div class="entity-toolbar panel">
          <div>
            <h2 style="margin:0 0 6px;">Fornecedores</h2>
            <p class="muted">Cadastro em modal e tabela com rolagem interna.</p>
          </div>
          <div class="entity-toolbar-actions">
            <button class="btn btn-primary" type="button" id="open-supplier-form-btn">Novo fornecedor</button>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Lista de fornecedores</h2>
            <span class="muted">${rows.length} resultado(s)</span>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input
              id="supplier-filter-term"
              placeholder="Buscar por nome, contato, telefone, e-mail ou documento"
              value="${escapeHtml(filters.term)}"
            />
            <select id="supplier-filter-status">
              <option value="">Todos os status</option>
              <option value="ativo" ${filters.status === 'ativo' ? 'selected' : ''}>Ativo</option>
              <option value="inativo" ${filters.status === 'inativo' ? 'selected' : ''}>Inativo</option>
            </select>
            <button class="btn btn-secondary" type="button" id="supplier-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="supplier-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap scroll-dual">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
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
                    <td>${escapeHtml(row.contactName || '-')}</td>
                    <td>${escapeHtml(row.phone || '-')}</td>
                    <td>${escapeHtml(row.email || '-')}</td>
                    <td>${escapeHtml(row.document || '-')}</td>
                    <td>${row.active === false ? '<span class="tag warning">Inativo</span>' : '<span class="tag success">Ativo</span>'}</td>
                    <td>${renderSupplierActions(row)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="7">Nenhum fornecedor encontrado.</td></tr>'}
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