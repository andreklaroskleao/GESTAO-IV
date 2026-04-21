import { escapeHtml, renderBlocked, showToast, bindSubmitGuard, bindAsyncButton } from './ui.js';

export function createUsersModule(ctx) {
  const {
    state,
    tabEls,
    ROLES,
    AREAS,
    ACCESS_LEVELS,
    createManagedUser,
    updateManagedUser,
    deleteManagedUser,
    listUsers,
    auditModule,
    hasPermission
  } = ctx;

  let filters = {
    term: '',
    accessLevel: ''
  };

  let isSavingUser = false;

  function getRows() {
    return Array.isArray(state.users) ? state.users : [];
  }

  function getFilteredRows() {
    return getRows().filter((item) => {
      const haystack = [
        item.fullName,
        item.email,
        item.username,
        item.role,
        item.area,
        item.accessLevel
      ].join(' ').toLowerCase();

      return (!filters.term || haystack.includes(filters.term.toLowerCase()))
        && (!filters.accessLevel || String(item.accessLevel || '') === filters.accessLevel);
    });
  }

  function getEditingUser() {
    return getRows().find((item) => item.id === state.editingUserId || item.uid === state.editingUserId) || null;
  }

  function getSummary() {
    const rows = getRows();

    return {
      total: rows.length,
      admins: rows.filter((item) => String(item.accessLevel || '') === 'admin').length,
      managers: rows.filter((item) => String(item.accessLevel || '') === 'manager').length,
      operators: rows.filter((item) => String(item.accessLevel || '') === 'operator').length
    };
  }

  function getSafeAccessOptions() {
    if (Array.isArray(ACCESS_LEVELS) && ACCESS_LEVELS.length) return ACCESS_LEVELS;
    return ['admin', 'manager', 'operator'];
  }

  function getSafeRoleOptions() {
    if (Array.isArray(ROLES) && ROLES.length) return ROLES;
    return ['Administrador', 'Gerente', 'Operador'];
  }

  function getSafeAreaOptions() {
    if (Array.isArray(AREAS) && AREAS.length) return AREAS;
    return ['Geral', 'Vendas', 'Estoque', 'Financeiro'];
  }

  function fillForm(form, row) {
    if (!form || !row) return;

    form.elements.fullName.value = row.fullName || '';
    form.elements.username.value = row.username || '';
    form.elements.email.value = row.email || '';
    form.elements.role.value = row.role || getSafeRoleOptions()[0] || 'Operador';
    form.elements.area.value = row.area || getSafeAreaOptions()[0] || 'Geral';
    form.elements.accessLevel.value = row.accessLevel || getSafeAccessOptions()[0] || 'operator';
    form.elements.active.value = String(row.active !== false);
  }

  function buildPermissionsByAccessLevel(accessLevel) {
    const level = String(accessLevel || 'operator');

    if (level === 'admin') {
      return [
        'dashboard',
        'sales',
        'products',
        'reports',
        'deliveries',
        'clients',
        'suppliers',
        'purchases',
        'payables',
        'users',
        'settings'
      ];
    }

    if (level === 'manager') {
      return [
        'dashboard',
        'sales',
        'products',
        'reports',
        'deliveries',
        'clients',
        'suppliers',
        'purchases',
        'payables',
        'settings'
      ];
    }

    return [
      'dashboard',
      'sales',
      'products',
      'deliveries',
      'clients'
    ];
  }

  async function refreshUsers() {
    try {
      const rows = await listUsers();
      if (Array.isArray(rows)) {
        state.users = rows;
      }
    } catch (error) {
      console.error(error);
    }
    render();
  }

  async function saveUser() {
    if (isSavingUser) return;
    isSavingUser = true;

    try {
      const form = document.querySelector('#user-form');
      if (!form) return;

      const values = Object.fromEntries(new FormData(form).entries());
      const accessLevel = String(values.accessLevel || 'operator');

      const payload = {
        fullName: String(values.fullName || '').trim(),
        username: String(values.username || values.email || '').trim(),
        email: String(values.email || '').trim(),
        role: String(values.role || ''),
        area: String(values.area || ''),
        accessLevel,
        permissions: buildPermissionsByAccessLevel(accessLevel),
        active: String(values.active || 'true') === 'true',
        deleted: false
      };

      if (!payload.fullName || !payload.email || !payload.username) {
        alert('Informe nome, usuário e e-mail.');
        return;
      }

      if (state.editingUserId) {
        await updateManagedUser(state.currentUser, state.editingUserId, payload);

        await auditModule.log({
          module: 'users',
          action: 'update',
          entityType: 'user',
          entityId: state.editingUserId,
          entityLabel: payload.fullName,
          description: 'Usuário atualizado.'
        });

        showToast('Usuário atualizado.', 'success');
      } else {
        const password = String(values.password || '').trim();
        if (!password) {
          alert('Informe a senha do novo usuário.');
          return;
        }

        const created = await createManagedUser(state.currentUser, {
          ...payload,
          password
        });

        await auditModule.log({
          module: 'users',
          action: 'create',
          entityType: 'user',
          entityId: created?.uid || created?.id || payload.email,
          entityLabel: payload.fullName,
          description: 'Usuário cadastrado.'
        });

        showToast('Usuário cadastrado.', 'success');
      }

      closeUserFormModal();
      await refreshUsers();
    } finally {
      isSavingUser = false;
    }
  }

  function getUserFormHtml() {
    const editing = getEditingUser();
    const accessOptions = getSafeAccessOptions();
    const roleOptions = getSafeRoleOptions();
    const areaOptions = getSafeAreaOptions();

    return `
      <div class="form-modal-body">
        <div class="section-header">
          <h2>${editing ? 'Editar usuário' : 'Novo usuário'}</h2>
          <span class="muted">Cadastro em modal.</span>
        </div>

        <form id="user-form" class="form-grid mobile-optimized">
          <div class="form-section" style="grid-column:1 / -1;">
            <div class="form-section-title">
              <h3>Dados do usuário</h3>
              <span>Identificação e acesso</span>
            </div>
            <div class="soft-divider"></div>

            <div class="form-grid">
              <label>Nome completo
                <input name="fullName" required />
              </label>

              <label>Usuário
                <input name="username" required />
              </label>

              <label>E-mail
                <input name="email" type="email" ${editing ? 'readonly' : 'required'} />
              </label>

              ${editing ? '' : `
                <label>Senha inicial
                  <input name="password" type="password" required />
                </label>
              `}

              <label>Nível de acesso
                <select name="accessLevel">
                  ${accessOptions.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}
                </select>
              </label>

              <label>Função
                <select name="role">
                  ${roleOptions.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}
                </select>
              </label>

              <label>Área
                <select name="area">
                  ${areaOptions.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}
                </select>
              </label>

              <label>Status
                <select name="active">
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </label>
            </div>
          </div>

          <div class="form-actions" style="grid-column:1 / -1;">
            <button class="btn btn-primary" type="submit">${editing ? 'Salvar usuário' : 'Cadastrar usuário'}</button>
            <button class="btn btn-secondary" type="button" id="user-form-cancel-btn">Cancelar</button>
          </div>
        </form>
      </div>
    `;
  }

  function openUserFormModal(userId = null) {
    state.editingUserId = userId;
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="user-form-modal-backdrop">
        <div class="modal-card form-modal-card">
          ${getUserFormHtml()}
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
      state.editingUserId = null;
      render();
    };

    modalRoot.querySelector('#user-form-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'user-form-modal-backdrop') closeModal();
    });

    modalRoot.querySelector('#user-form-cancel-btn')?.addEventListener('click', closeModal);

    const form = modalRoot.querySelector('#user-form');
    fillForm(form, getEditingUser());
    bindSubmitGuard(form, saveUser, { busyLabel: 'Salvando...' });
  }

  function closeUserFormModal() {
    const modalRoot = document.getElementById('modal-root');
    if (modalRoot) modalRoot.innerHTML = '';
    state.editingUserId = null;
  }

  async function handleDeleteUser(userId) {
    const row = getRows().find((item) => item.id === userId || item.uid === userId);
    if (!row) return;

    window.openConfirmDeleteModal?.({
      title: 'Excluir usuário',
      message: 'Deseja realmente excluir este usuário? Esta ação pode afetar o acesso ao sistema.',
      onConfirm: async () => {
        await deleteManagedUser(state.currentUser, userId);

        await auditModule.log({
          module: 'users',
          action: 'delete',
          entityType: 'user',
          entityId: userId,
          entityLabel: row.fullName || row.email || '',
          description: 'Usuário excluído.'
        });

        showToast('Usuário excluído.', 'success');
        await refreshUsers();
      }
    });
  }

  function openUserActions(userId) {
    window.openActionsSheet?.('Ações do usuário', [
      {
        label: 'Editar',
        className: 'btn btn-secondary',
        onClick: async () => openUserFormModal(userId)
      },
      {
        label: 'Excluir',
        className: 'btn btn-danger',
        onClick: async () => handleDeleteUser(userId)
      }
    ]);
  }

  function renderUserActions(row) {
    const userId = row.id || row.uid || '';
    return `
      <div class="actions-inline-compact">
        <button class="icon-action-btn" type="button" data-user-edit="${escapeHtml(userId)}" title="Editar" aria-label="Editar">✏️</button>
        <button class="icon-action-btn" type="button" data-user-more="${escapeHtml(userId)}" title="Mais ações" aria-label="Mais ações">⋯</button>
      </div>
    `;
  }

  function bindEvents() {
    bindAsyncButton(tabEls.users.querySelector('#open-user-form-btn'), async () => {
      openUserFormModal(null);
    }, { busyLabel: 'Abrindo...' });

    tabEls.users.querySelector('#user-filter-apply')?.addEventListener('click', () => {
      filters.term = tabEls.users.querySelector('#user-filter-term')?.value || '';
      filters.accessLevel = tabEls.users.querySelector('#user-filter-access')?.value || '';
      render();
    });

    bindAsyncButton(tabEls.users.querySelector('#user-filter-clear'), async () => {
      filters = { term: '', accessLevel: '' };
      render();
    }, { busyLabel: 'Limpando...' });

    tabEls.users.querySelectorAll('[data-user-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openUserFormModal(btn.dataset.userEdit));
    });

    tabEls.users.querySelectorAll('[data-user-more]').forEach((btn) => {
      btn.addEventListener('click', () => openUserActions(btn.dataset.userMore));
    });
  }

  function render() {
    if (!hasPermission(state.currentUser, 'users')) {
      tabEls.users.innerHTML = renderBlocked();
      return;
    }

    const rows = getFilteredRows();
    const summary = getSummary();
    const accessOptions = getSafeAccessOptions();

    tabEls.users.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card"><span>Total de usuários</span><strong>${summary.total}</strong></div>
          <div class="metric-card"><span>Admins</span><strong>${summary.admins}</strong></div>
          <div class="metric-card"><span>Managers</span><strong>${summary.managers}</strong></div>
          <div class="metric-card"><span>Operadores</span><strong>${summary.operators}</strong></div>
        </div>

        <div class="entity-toolbar panel">
          <div>
            <h2 style="margin:0 0 6px;">Usuários</h2>
            <p class="muted">Cadastro em modal e lista com rolagem interna.</p>
          </div>
          <div class="entity-toolbar-actions">
            <button class="btn btn-primary" type="button" id="open-user-form-btn">Novo usuário</button>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Lista de usuários</h2>
            <span class="muted">${rows.length} resultado(s)</span>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input id="user-filter-term" placeholder="Buscar por nome, e-mail, usuário, função, área ou acesso" value="${escapeHtml(filters.term)}" />
            <select id="user-filter-access">
              <option value="">Todos os níveis</option>
              ${accessOptions.map((item) => `<option value="${escapeHtml(item)}" ${filters.accessLevel === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
            </select>
            <button class="btn btn-secondary" type="button" id="user-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="user-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap scroll-dual">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>E-mail</th>
                  <th>Função</th>
                  <th>Área</th>
                  <th>Nível</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.fullName || '-')}</td>
                    <td>${escapeHtml(row.username || '-')}</td>
                    <td>${escapeHtml(row.email || '-')}</td>
                    <td>${escapeHtml(row.role || '-')}</td>
                    <td>${escapeHtml(row.area || '-')}</td>
                    <td><span class="tag info">${escapeHtml(row.accessLevel || 'operator')}</span></td>
                    <td>${renderUserActions(row)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="7">Nenhum usuário encontrado.</td></tr>'}
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