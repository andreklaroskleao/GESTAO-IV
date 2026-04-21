import { escapeHtml, showToast, bindSubmitGuard, bindAsyncButton } from './ui.js';

export function createDeliveriesModule(ctx) {
  const {
    state,
    tabEls,
    refs,
    createDoc,
    updateByPath,
    currency,
    toNumber,
    formatDate,
    paymentMethods,
    deliveryStatuses,
    timestampFromDateTime,
    clientsModule
  } = ctx;

  let filters = {
    status: '',
    customer: '',
    phone: '',
    period: ''
  };

  let isSavingDelivery = false;

  function getEditingDelivery() {
    return (state.deliveries || []).find((item) => item.id === state.editingDeliveryId && item.deleted !== true) || null;
  }

  function normalizeScheduledDate(value) {
    if (!value) return '';

    if (value?.toDate) return formatDateKey(value.toDate());

    if (typeof value === 'string') {
      if (value.includes('T')) {
        const dt = new Date(value);
        if (!Number.isNaN(dt.getTime())) return formatDateKey(dt);
      }
      return value.slice(0, 10);
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return formatDateKey(parsed);

    return '';
  }

  function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getFilteredDeliveries() {
    const rows = (state.deliveries || []).filter((item) => item.deleted !== true);

    return rows.filter((item) => {
      const customer = String(item.customerName || '').toLowerCase();
      const phone = String(item.phone || '').toLowerCase();
      const status = String(item.status || '');
      const scheduledDate = normalizeScheduledDate(item.scheduledAt);

      if (filters.status && status !== filters.status) return false;
      if (filters.customer && !customer.includes(filters.customer.toLowerCase())) return false;
      if (filters.phone && !phone.includes(filters.phone.toLowerCase())) return false;

      if (filters.period === 'today') {
        const today = new Date();
        const todayKey = formatDateKey(today);
        if (scheduledDate !== todayKey) return false;
      }

      if (filters.period === 'pending') {
        if (status === 'Concluído' || status === 'Cancelado') return false;
      }

      return true;
    });
  }

  function getDeliverySummary() {
    const rows = (state.deliveries || []).filter((item) => item.deleted !== true);

    const todayKey = formatDateKey(new Date());
    return {
      totalCount: rows.length,
      todayCount: rows.filter((item) => normalizeScheduledDate(item.scheduledAt) === todayKey).length,
      pendingCount: rows.filter((item) => !['Concluído', 'Cancelado'].includes(item.status)).length,
      completedCount: rows.filter((item) => item.status === 'Concluído').length,
      totalValue: rows.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0)
    };
  }

  function fillForm(form, delivery) {
    if (!form) return;

    form.elements.customerName.value = delivery?.customerName || '';
    form.elements.phone.value = delivery?.phone || '';
    form.elements.address.value = delivery?.address || '';
    form.elements.reference.value = delivery?.reference || '';
    form.elements.notes.value = delivery?.notes || '';
    form.elements.paymentMethod.value = delivery?.paymentMethod || paymentMethods[0] || 'Dinheiro';
    form.elements.status.value = delivery?.status || 'Agendado';
    form.elements.totalAmount.value = delivery?.totalAmount ?? '';
    form.elements.scheduledDate.value = delivery?.scheduledDate || normalizeScheduledDate(delivery?.scheduledAt) || '';
    form.elements.scheduledTime.value = delivery?.scheduledTime || '';

    const clientIdInput = form.querySelector('#delivery-client-id');
    const clientSelectedInput = form.querySelector('#delivery-client-selected');

    if (clientIdInput) clientIdInput.value = delivery?.clientId || '';
    if (clientSelectedInput) {
      clientSelectedInput.value = delivery?.clientId
        ? `${delivery.customerName || ''}${delivery.phone ? ` - ${delivery.phone}` : ''}`
        : '';
    }
  }

  function getStatusTagClass(status) {
    if (status === 'Concluído') return 'success';
    if (status === 'Cancelado') return 'danger';
    if (status === 'Em rota') return 'info';
    return 'warning';
  }

  async function saveDelivery() {
    if (isSavingDelivery) return;
    isSavingDelivery = true;

    try {
      const form = document.querySelector('#delivery-form');
      if (!form) return;

      const payload = Object.fromEntries(new FormData(form).entries());
      payload.totalAmount = toNumber(payload.totalAmount);
      payload.scheduledAt = payload.scheduledDate
        ? timestampFromDateTime(payload.scheduledDate, payload.scheduledTime || '00:00')
        : null;
      payload.clientId = form.querySelector('#delivery-client-id')?.value || '';
      payload.scheduledDate = payload.scheduledDate || '';
      payload.scheduledTime = payload.scheduledTime || '';
      payload.deleted = false;

      if (!payload.customerName) {
        alert('Informe o cliente.');
        return;
      }

      if (state.editingDeliveryId) {
        await updateByPath('deliveries', state.editingDeliveryId, payload);
        state.editingDeliveryId = null;
        showToast('Entrega atualizada.', 'success');
      } else {
        await createDoc(refs.deliveries, payload);
        showToast('Entrega cadastrada.', 'success');
      }

      closeDeliveryFormModal();
      render();
    } finally {
      isSavingDelivery = false;
    }
  }

  async function updateDeliveryStatus(deliveryId, nextStatus) {
    const delivery = (state.deliveries || []).find((item) => item.id === deliveryId && item.deleted !== true);
    if (!delivery) return;

    await updateByPath('deliveries', deliveryId, { status: nextStatus });
    showToast(`Status alterado para ${nextStatus}.`, 'success');
    render();
  }

  function getDeliveryFormHtml() {
    return `
      <div class="form-modal-body">
        <div class="section-header">
          <h2>${state.editingDeliveryId ? 'Editar entrega' : 'Nova entrega / recolhimento'}</h2>
          <span class="muted">Cadastro em modal.</span>
        </div>

        <form id="delivery-form" class="form-grid mobile-optimized">
          <input type="hidden" id="delivery-client-id" value="" />

          <div class="form-section" style="grid-column:1 / -1;">
            <div class="form-section-title">
              <h3>Cliente</h3>
              <span>Seleção e identificação</span>
            </div>
            <div class="soft-divider"></div>

            <label style="grid-column:1 / -1;">Cliente selecionado
              <input id="delivery-client-selected" readonly placeholder="Nenhum cliente selecionado" />
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-secondary" type="button" id="delivery-client-picker-btn">Selecionar cliente</button>
              <button class="btn btn-secondary" type="button" id="delivery-client-clear-btn">Limpar cliente</button>
            </div>

            <div class="form-grid">
              <label>Nome do cliente<input name="customerName" required /></label>
              <label>Telefone<input name="phone" /></label>
            </div>
          </div>

          <div class="form-section" style="grid-column:1 / -1;">
            <div class="form-section-title">
              <h3>Endereço</h3>
              <span>Local e referência</span>
            </div>
            <div class="soft-divider"></div>

            <div class="form-grid">
              <label>Endereço<input name="address" required /></label>
              <label>Referência<input name="reference" /></label>
              <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>
            </div>
          </div>

          <div class="form-section" style="grid-column:1 / -1;">
            <div class="form-section-title">
              <h3>Agendamento</h3>
              <span>Valor, pagamento e status</span>
            </div>
            <div class="soft-divider"></div>

            <div class="form-grid">
              <label>Data<input name="scheduledDate" type="date" required /></label>
              <label>Hora<input name="scheduledTime" type="time" /></label>
              <label>Forma de pagamento
                <select name="paymentMethod">
                  ${paymentMethods.map((item) => `<option value="${item}">${item}</option>`).join('')}
                </select>
              </label>
              <label>Status
                <select name="status">
                  ${deliveryStatuses.map((item) => `<option value="${item}">${item}</option>`).join('')}
                </select>
              </label>
              <label>Total<input name="totalAmount" type="number" step="0.01" min="0" /></label>
            </div>
          </div>

          <div class="form-actions" style="grid-column:1 / -1;">
            <button class="btn btn-primary" type="submit">${state.editingDeliveryId ? 'Salvar alterações' : 'Cadastrar operação'}</button>
            <button class="btn btn-secondary" type="button" id="delivery-form-cancel-btn">Cancelar</button>
          </div>
        </form>
      </div>
    `;
  }

  function openDeliveryFormModal(deliveryId = null) {
    state.editingDeliveryId = deliveryId;
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="delivery-form-modal-backdrop">
        <div class="modal-card form-modal-card">
          ${getDeliveryFormHtml()}
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
      state.editingDeliveryId = null;
      render();
    };

    modalRoot.querySelector('#delivery-form-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'delivery-form-modal-backdrop') closeModal();
    });

    modalRoot.querySelector('#delivery-form-cancel-btn')?.addEventListener('click', closeModal);

    const form = modalRoot.querySelector('#delivery-form');
    fillForm(form, getEditingDelivery());
    bindClientPicker(modalRoot);
    bindSubmitGuard(form, saveDelivery, { busyLabel: 'Salvando...' });
  }

  function bindClientPicker(scope) {
    const pickBtn = scope.querySelector('#delivery-client-picker-btn');
    const clearBtn = scope.querySelector('#delivery-client-clear-btn');

    pickBtn?.addEventListener('click', () => {
      const modalRoot = document.getElementById('modal-root');
      if (!modalRoot) return;

      modalRoot.insertAdjacentHTML('beforeend', `
        <div class="modal-backdrop" id="delivery-client-modal-backdrop">
          <div class="modal-card">
            <div class="section-header">
              <h2>Selecionar cliente</h2>
              <button class="btn btn-secondary" type="button" id="delivery-client-modal-close">Fechar</button>
            </div>
            <div id="delivery-client-picker-host"></div>
          </div>
        </div>
      `);

      const closePicker = () => {
        document.getElementById('delivery-client-modal-backdrop')?.remove();
      };

      document.getElementById('delivery-client-modal-close')?.addEventListener('click', closePicker);
      document.getElementById('delivery-client-modal-backdrop')?.addEventListener('click', (event) => {
        if (event.target.id === 'delivery-client-modal-backdrop') closePicker();
      });

      clientsModule.renderClientPicker({
        target: '#delivery-client-picker-host',
        onSelect: (client) => {
          const form = document.querySelector('#delivery-form');
          if (!form) return;

          form.querySelector('#delivery-client-id').value = client.id || '';
          form.querySelector('#delivery-client-selected').value = `${client.name || ''}${client.phone ? ` - ${client.phone}` : ''}`;
          form.elements.customerName.value = client.name || '';
          form.elements.phone.value = client.phone || '';
          form.elements.address.value = client.address || '';
          closePicker();
        }
      });
    });

    bindAsyncButton(clearBtn, async () => {
      const form = document.querySelector('#delivery-form');
      if (!form) return;
      form.querySelector('#delivery-client-id').value = '';
      form.querySelector('#delivery-client-selected').value = '';
    }, { busyLabel: 'Limpando...' });
  }

  function openDeliveryActions(deliveryId) {
    window.openActionsSheet?.('Ações da entrega', [
      {
        label: 'Editar',
        className: 'btn btn-secondary',
        onClick: async () => openDeliveryFormModal(deliveryId)
      },
      {
        label: 'Iniciar',
        className: 'btn btn-secondary',
        onClick: async () => updateDeliveryStatus(deliveryId, 'Em rota')
      },
      {
        label: 'Concluir',
        className: 'btn btn-success',
        onClick: async () => updateDeliveryStatus(deliveryId, 'Concluído')
      }
    ]);
  }

  function renderDeliveryActions(item) {
    return `
      <div class="actions-inline-compact">
        <button class="icon-action-btn" type="button" data-delivery-edit="${item.id}" title="Editar" aria-label="Editar">✏️</button>
        <button class="icon-action-btn" type="button" data-delivery-more="${item.id}" title="Mais ações" aria-label="Mais ações">⋯</button>
      </div>
    `;
  }

  function bindEvents() {
    bindAsyncButton(tabEls.deliveries.querySelector('#open-delivery-form-btn'), async () => {
      openDeliveryFormModal(null);
    }, { busyLabel: 'Abrindo...' });

    tabEls.deliveries.querySelector('#delivery-filter-apply')?.addEventListener('click', () => {
      filters.status = tabEls.deliveries.querySelector('#delivery-filter-status')?.value || '';
      filters.customer = tabEls.deliveries.querySelector('#delivery-filter-customer')?.value || '';
      filters.phone = tabEls.deliveries.querySelector('#delivery-filter-phone')?.value || '';
      filters.period = tabEls.deliveries.querySelector('#delivery-filter-period')?.value || '';
      render();
    });

    bindAsyncButton(tabEls.deliveries.querySelector('#delivery-filter-clear'), async () => {
      filters = { status: '', customer: '', phone: '', period: '' };
      render();
    }, { busyLabel: 'Limpando...' });

    tabEls.deliveries.querySelectorAll('[data-delivery-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openDeliveryFormModal(btn.dataset.deliveryEdit));
    });

    tabEls.deliveries.querySelectorAll('[data-delivery-more]').forEach((btn) => {
      btn.addEventListener('click', () => openDeliveryActions(btn.dataset.deliveryMore));
    });
  }

  function render() {
    const rows = getFilteredDeliveries();
    const summary = getDeliverySummary();

    tabEls.deliveries.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card"><span>Hoje</span><strong>${summary.todayCount}</strong></div>
          <div class="metric-card"><span>Pendentes</span><strong>${summary.pendingCount}</strong></div>
          <div class="metric-card"><span>Concluídos</span><strong>${summary.completedCount}</strong></div>
          <div class="metric-card"><span>Total em entregas</span><strong>${currency(summary.totalValue)}</strong></div>
        </div>

        <div class="entity-toolbar panel">
          <div>
            <h2 style="margin:0 0 6px;">Tele-entregas</h2>
            <p class="muted">Cadastro em modal e agenda com rolagem interna.</p>
          </div>
          <div class="entity-toolbar-actions">
            <button class="btn btn-primary" type="button" id="open-delivery-form-btn">Nova operação</button>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Agenda</h2>
            <span class="muted">${rows.length} resultado(s)</span>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <select id="delivery-filter-status">
              <option value="">Todos os status</option>
              ${deliveryStatuses.map((item) => `<option value="${item}" ${filters.status === item ? 'selected' : ''}>${item}</option>`).join('')}
            </select>

            <input id="delivery-filter-customer" placeholder="Cliente" value="${escapeHtml(filters.customer)}" />
            <input id="delivery-filter-phone" placeholder="Telefone" value="${escapeHtml(filters.phone)}" />

            <select id="delivery-filter-period">
              <option value="">Todos os períodos</option>
              <option value="today" ${filters.period === 'today' ? 'selected' : ''}>Hoje</option>
              <option value="pending" ${filters.period === 'pending' ? 'selected' : ''}>Pendentes</option>
            </select>

            <button class="btn btn-secondary" type="button" id="delivery-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="delivery-filter-clear">Limpar filtros</button>
          </div>

          <div class="table-wrap scroll-dual">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((item) => `
                  <tr>
                    <td>${item.scheduledAt ? formatDate(item.scheduledAt) : '-'}</td>
                    <td>${escapeHtml(item.customerName || '-')}</td>
                    <td>${escapeHtml(item.phone || '-')}</td>
                    <td><span class="tag ${getStatusTagClass(item.status)}">${escapeHtml(item.status || '-')}</span></td>
                    <td>${currency(item.totalAmount || 0)}</td>
                    <td>${renderDeliveryActions(item)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="6">Nenhuma operação encontrada.</td></tr>'}
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