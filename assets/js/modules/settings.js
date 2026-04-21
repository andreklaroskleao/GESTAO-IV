import { escapeHtml, bindSubmitGuard, bindAsyncButton, showToast } from './ui.js';

export function createSettingsModule(ctx) {
  const {
    state,
    tabEls,
    listCollection,
    createDoc,
    updateByPath,
    refs,
    changeCurrentPassword,
    setTheme,
    getPreferredTheme,
    auditModule,
    cashierModule,
    backupModule,
    printModule,
    excelModule,
    canImportBackup
  } = ctx;

  let auditFilters = {
    module: '',
    action: '',
    entityType: '',
    entityLabel: '',
    user: '',
    dateFrom: '',
    dateTo: ''
  };

  let shouldShowAuditLogs = false;

  function normalizeBooleanRadio(value) {
    return String(value) === 'true';
  }

  async function getSystemSettingsDoc() {
    const rows = await listCollection('settings');
    return rows.find((item) => item.scope === 'system') || null;
  }

  async function saveSettings() {
    const form = tabEls.settings.querySelector('#settings-form');
    if (!form) return;

    const payload = Object.fromEntries(new FormData(form).entries());

    payload.lowStockThreshold = Math.max(0, Number(payload.lowStockThreshold || 5));
    payload.thermalCompactMode = normalizeBooleanRadio(payload.thermalCompactMode);
    payload.thermalAutoPrint = normalizeBooleanRadio(payload.thermalAutoPrint);

    const chosenTheme = payload.theme || 'system';
    setTheme(chosenTheme);
    delete payload.theme;

    if (!String(payload.storeName || '').trim()) {
      alert('Informe o nome da loja.');
      return;
    }

    const existing = await getSystemSettingsDoc();
    const previous = existing || {};

    const changes = [];
    const fieldsToTrack = [
      { field: 'storeName', label: 'Nome da loja' },
      { field: 'address', label: 'Endereço da loja' },
      { field: 'phone', label: 'Telefone da loja' },
      { field: 'thermalWidth', label: 'Largura térmica' },
      { field: 'thermalCompactMode', label: 'Modo compacto' },
      { field: 'thermalAutoPrint', label: 'Impressão automática' },
      { field: 'warrantyText', label: 'Texto de garantia' },
      { field: 'lowStockThreshold', label: 'Limite de estoque baixo' }
    ];

    fieldsToTrack.forEach(({ field, label }) => {
      const oldValue = previous[field];
      const newValue = payload[field];
      if (String(oldValue ?? '') !== String(newValue ?? '')) {
        changes.push({
          field,
          label,
          from: oldValue ?? '',
          to: newValue ?? ''
        });
      }
    });

    if (existing) {
      await updateByPath('settings', existing.id, {
        ...payload,
        scope: 'system',
        updatedAt: new Date().toISOString()
      });

      await auditModule.log({
        module: 'settings',
        action: 'update',
        entityType: 'settings',
        entityId: existing.id,
        entityLabel: 'Configurações gerais',
        description: 'Configurações gerais atualizadas.',
        metadata: { changes }
      });
    } else {
      const createdId = await createDoc(refs.settings, {
        ...payload,
        scope: 'system',
        createdAt: new Date().toISOString()
      });

      await auditModule.log({
        module: 'settings',
        action: 'create',
        entityType: 'settings',
        entityId: createdId,
        entityLabel: 'Configurações gerais',
        description: 'Configurações gerais criadas.',
        metadata: { changes }
      });
    }

    showToast('Configurações salvas com sucesso.', 'success');
  }

  async function savePassword() {
    const form = tabEls.settings.querySelector('#password-form');
    if (!form) return;

    const formData = new FormData(form);
    const currentPassword = String(formData.get('currentPassword') || '');
    const newPassword = String(formData.get('newPassword') || '');

    if (!currentPassword || !newPassword) {
      alert('Informe a senha atual e a nova senha.');
      return;
    }

    if (newPassword.length < 6) {
      alert('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    await changeCurrentPassword(currentPassword, newPassword);

    await auditModule.log({
      module: 'settings',
      action: 'password_change',
      entityType: 'user',
      entityId: state.currentUser?.uid || '',
      entityLabel: state.currentUser?.fullName || '',
      description: 'Senha do usuário alterada.',
      metadata: {
        changes: [
          {
            field: 'password',
            label: 'Senha',
            from: '********',
            to: '********'
          }
        ]
      }
    });

    form.reset();
    showToast('Senha atualizada com sucesso.', 'success');
  }

  function bindAuditFilters() {
    tabEls.settings.querySelector('#audit-filter-apply')?.addEventListener('click', () => {
      auditFilters.module = tabEls.settings.querySelector('#audit-filter-module')?.value || '';
      auditFilters.action = tabEls.settings.querySelector('#audit-filter-action')?.value || '';
      auditFilters.entityType = tabEls.settings.querySelector('#audit-filter-entity-type')?.value || '';
      auditFilters.entityLabel = tabEls.settings.querySelector('#audit-filter-entity-label')?.value || '';
      auditFilters.user = tabEls.settings.querySelector('#audit-filter-user')?.value || '';
      auditFilters.dateFrom = tabEls.settings.querySelector('#audit-filter-date-from')?.value || '';
      auditFilters.dateTo = tabEls.settings.querySelector('#audit-filter-date-to')?.value || '';
      shouldShowAuditLogs = true;
      render();
    });

    tabEls.settings.querySelector('#audit-filter-clear')?.addEventListener('click', () => {
      auditFilters = {
        module: '',
        action: '',
        entityType: '',
        entityLabel: '',
        user: '',
        dateFrom: '',
        dateTo: ''
      };
      shouldShowAuditLogs = false;
      render();
    });
  }

  function bindBackupEvents() {
    bindAsyncButton(
      tabEls.settings.querySelector('#backup-export-btn'),
      async () => {
        backupModule.downloadBackup();
      },
      { busyLabel: 'Exportando...' }
    );

    bindAsyncButton(
      tabEls.settings.querySelector('#backup-import-btn'),
      async () => {
        if (!canImportBackup(state.currentUser)) {
          alert('Somente o usuário master pode importar backup.');
          return;
        }

        const input = tabEls.settings.querySelector('#backup-import-file');
        const file = input?.files?.[0];

        if (!file) {
          alert('Selecione um arquivo de backup em JSON.');
          return;
        }

        await backupModule.importBackupFile(file);
        input.value = '';
      },
      { busyLabel: 'Importando...' }
    );
  }

  function bindExcelEvents() {
    bindAsyncButton(
      tabEls.settings.querySelector('#excel-export-btn'),
      async () => {
        excelModule.exportAllExcel();
      },
      { busyLabel: 'Exportando...' }
    );

    bindAsyncButton(
      tabEls.settings.querySelector('#excel-import-btn'),
      async () => {
        if (!canImportBackup(state.currentUser)) {
          alert('Somente o usuário master pode importar Excel.');
          return;
        }

        const input = tabEls.settings.querySelector('#excel-import-file');
        const file = input?.files?.[0];

        if (!file) {
          alert('Selecione um arquivo Excel.');
          return;
        }

        await excelModule.importExcelFile(file);
        input.value = '';
      },
      { busyLabel: 'Importando...' }
    );
  }

  function bindPrintEvents() {
    bindAsyncButton(
      tabEls.settings.querySelector('#thermal-test-print-btn'),
      async () => {
        printModule.printSaleReceipt({
          customerName: 'Cliente teste',
          paymentMethod: 'Dinheiro',
          subtotal: 50,
          discount: 5,
          total: 45,
          amountPaid: 50,
          change: 5,
          items: [
            { productId: '1', name: 'Produto teste 1', quantity: 1, unitPrice: 20, total: 20 },
            { productId: '2', name: 'Produto teste 2', quantity: 1, unitPrice: 30, total: 30 }
          ]
        });
      },
      { busyLabel: 'Abrindo...' }
    );
  }

  function bindAuditPrint() {
    bindAsyncButton(
      tabEls.settings.querySelector('#audit-print-btn'),
      async () => {
        auditModule.printFilteredLogs(auditFilters, shouldShowAuditLogs);
      },
      { busyLabel: 'Abrindo...' }
    );
  }

  function bindEvents() {
    bindSubmitGuard(
      tabEls.settings.querySelector('#settings-form'),
      saveSettings,
      { busyLabel: 'Salvando...' }
    );

    bindSubmitGuard(
      tabEls.settings.querySelector('#password-form'),
      savePassword,
      { busyLabel: 'Atualizando...' }
    );

    bindAuditFilters();
    bindBackupEvents();
    bindExcelEvents();
    bindPrintEvents();
    bindAuditPrint();
    cashierModule.bindCashEvents(render);
  }

  function renderFinancialSummary() {
    const accounts = state.accountsReceivable || [];
    const cashSessions = state.cashSessions || [];

    const totalOpen = accounts.reduce((sum, item) => sum + Number(item.openAmount || 0), 0);
    const totalReceived = accounts.reduce((sum, item) => sum + Number(item.receivedAmount || 0), 0);

    const overdueCount = accounts.filter((item) => {
      if (!item.dueDate || Number(item.openAmount || 0) <= 0) return false;
      const due = new Date(`${item.dueDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return due < today;
    }).length;

    const latestCash = [...cashSessions].sort((a, b) => {
      const da = a.openedAt?.toDate ? a.openedAt.toDate().getTime() : new Date(a.openedAt || 0).getTime();
      const db = b.openedAt?.toDate ? b.openedAt.toDate().getTime() : new Date(b.openedAt || 0).getTime();
      return db - da;
    })[0];

    return `
      <div class="filters-grid">
        <div><strong>Contas em aberto</strong><br>${totalOpen.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
        <div><strong>Total já recebido</strong><br>${totalReceived.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
        <div><strong>Contas vencidas</strong><br>${overdueCount}</div>
        <div><strong>Último fechamento</strong><br>${latestCash ? (latestCash.closingAmount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}</div>
      </div>
    `;
  }

  function render() {
    const selectedTheme = getPreferredTheme();
    const thermalWidth = state.settings?.thermalWidth || '80mm';
    const thermalCompactMode = Boolean(state.settings?.thermalCompactMode);
    const thermalAutoPrint = Boolean(state.settings?.thermalAutoPrint);

    tabEls.settings.innerHTML = `
      <div class="section-stack">
        <div class="table-card">
          <div class="section-header">
            <h2>Geral</h2>
          </div>

          <p class="auth-hint">Ajustes principais do sistema</p>

          <form id="settings-form" class="form-grid">
            <label>
              Nome da loja
              <input name="storeName" value="${escapeHtml(state.settings?.storeName || '')}" required />
            </label>

            <label>
              Endereço
              <input name="address" value="${escapeHtml(state.settings?.address || '')}" />
            </label>

            <label>
              Telefone da loja
              <input name="phone" value="${escapeHtml(state.settings?.phone || '')}" />
            </label>

            <label>
              Limite de estoque baixo
              <input name="lowStockThreshold" type="number" min="0" step="1" value="${Number(state.settings?.lowStockThreshold || 5)}" />
            </label>

            <label>
              Tema do sistema
              <select name="theme">
                <option value="system" ${selectedTheme === 'system' ? 'selected' : ''}>Automático</option>
                <option value="light" ${selectedTheme === 'light' ? 'selected' : ''}>Claro</option>
                <option value="dark" ${selectedTheme === 'dark' ? 'selected' : ''}>Escuro</option>
              </select>
            </label>

            <label>
              Largura térmica
              <select name="thermalWidth">
                <option value="58mm" ${thermalWidth === '58mm' ? 'selected' : ''}>58mm</option>
                <option value="80mm" ${thermalWidth === '80mm' ? 'selected' : ''}>80mm</option>
              </select>
            </label>

            <label>
              Modo compacto
              <select name="thermalCompactMode">
                <option value="true" ${thermalCompactMode ? 'selected' : ''}>Ativado</option>
                <option value="false" ${!thermalCompactMode ? 'selected' : ''}>Desativado</option>
              </select>
            </label>

            <label>
              Imprimir automaticamente
              <select name="thermalAutoPrint">
                <option value="true" ${thermalAutoPrint ? 'selected' : ''}>Ativado</option>
                <option value="false" ${!thermalAutoPrint ? 'selected' : ''}>Desativado</option>
              </select>
            </label>

            <label style="grid-column:1 / -1;">
              Texto de garantia
              <textarea name="warrantyText" rows="4">${escapeHtml(state.settings?.warrantyText || '')}</textarea>
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Salvar configurações</button>
              <button class="btn btn-secondary" type="button" id="thermal-test-print-btn">Teste térmico</button>
            </div>
          </form>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Segurança</h2>
          </div>

          <p class="auth-hint">Troca de senha da sessão atual</p>

          <form id="password-form" class="form-grid">
            <label>
              Senha atual
              <input name="currentPassword" type="password" required />
            </label>

            <label>
              Nova senha
              <input name="newPassword" type="password" required />
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Trocar senha</button>
            </div>
          </form>

          <div class="empty-state" style="margin-top:12px; text-align:left;">
            <span>Usuários inativos não conseguem entrar. As permissões continuam sendo conferidas na interface e nas regras do Firestore.</span>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Backup e importação</h2>
          </div>

          <p class="auth-hint">JSON e Excel</p>

          <div class="filters-grid">
            <div class="empty-state" style="text-align:left;">
              <strong>Backup JSON</strong>
              <span>Exportar a base em JSON.</span>
              <div class="form-actions" style="margin-top:10px;">
                <button class="btn btn-secondary" type="button" id="backup-export-btn">Exportar backup</button>
              </div>
            </div>

            <div class="empty-state" style="text-align:left;">
              <strong>Importação JSON</strong>
              <span>Restaurar dados por arquivo JSON.</span>
              <input id="backup-import-file" type="file" accept=".json,application/json" />
              <div class="form-actions" style="margin-top:10px;">
                <button class="btn btn-secondary" type="button" id="backup-import-btn">Importar backup</button>
              </div>
            </div>

            <div class="empty-state" style="text-align:left;">
              <strong>Exportação Excel</strong>
              <span>Exportar planilhas em um único arquivo.</span>
              <div class="form-actions" style="margin-top:10px;">
                <button class="btn btn-secondary" type="button" id="excel-export-btn">Exportar Excel</button>
              </div>
            </div>

            <div class="empty-state" style="text-align:left;">
              <strong>Importação Excel</strong>
              <span>Importar produtos, clientes e contas.</span>
              <input id="excel-import-file" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" />
              <div class="form-actions" style="margin-top:10px;">
                <button class="btn btn-secondary" type="button" id="excel-import-btn">Importar Excel</button>
              </div>
            </div>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Resumo financeiro</h2>
          </div>

          <p class="auth-hint">Visão rápida</p>
          ${renderFinancialSummary()}
          ${cashierModule.renderCashSessionPanel()}
          ${cashierModule.renderHistoryTable()}
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Auditoria</h2>
            <div class="form-actions">
              <button class="btn btn-secondary" type="button" id="audit-print-btn">Imprimir filtro</button>
            </div>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input id="audit-filter-module" placeholder="Módulo" value="${escapeHtml(auditFilters.module)}" />
            <input id="audit-filter-action" placeholder="Ação" value="${escapeHtml(auditFilters.action)}" />
            <input id="audit-filter-entity-type" placeholder="Tipo" value="${escapeHtml(auditFilters.entityType)}" />
            <input id="audit-filter-entity-label" placeholder="Entidade" value="${escapeHtml(auditFilters.entityLabel)}" />
            <input id="audit-filter-user" placeholder="Usuário" value="${escapeHtml(auditFilters.user)}" />
            <input id="audit-filter-date-from" type="date" value="${auditFilters.dateFrom}" />
            <input id="audit-filter-date-to" type="date" value="${auditFilters.dateTo}" />
            <button class="btn btn-secondary" type="button" id="audit-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="audit-filter-clear">Limpar</button>
          </div>

          ${auditModule.renderAuditTable(auditFilters, shouldShowAuditLogs, 80)}
        </div>
      </div>
    `;

    bindEvents();
  }

  return { render };
}