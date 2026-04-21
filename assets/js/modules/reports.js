import { escapeHtml, renderBlocked, bindAsyncButton } from './ui.js';

export function createReportsModule(ctx) {
  const {
    state,
    tabEls,
    exportModule
  } = ctx;

  let filters = {
    dateFrom: '',
    dateTo: '',
    paymentMethod: ''
  };

  function hasAccess() {
    return Array.isArray(state.currentUser?.permissions)
      && state.currentUser.permissions.includes('reports');
  }

  function getSalesRows() {
    return (state.sales || []).filter((item) => item.deleted !== true);
  }

  function getDeliveryRows() {
    return (state.deliveries || []).filter((item) => item.deleted !== true);
  }

  function getPurchaseRows() {
    return (state.purchases || []).filter((item) => item.deleted !== true);
  }

  function getPayableRows() {
    return (state.accountsPayable || []).filter((item) => item.deleted !== true);
  }

  function getProductsRows() {
    return (state.products || []).filter((item) => item.deleted !== true);
  }

  function getDateValue(dateLike) {
    const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike || 0);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function getFilteredSales() {
    return getSalesRows().filter((sale) => {
      const dateValue = getDateValue(sale.createdAt);
      const paymentMethod = String(sale.paymentMethod || '');

      return (!filters.dateFrom || !dateValue || dateValue >= filters.dateFrom)
        && (!filters.dateTo || !dateValue || dateValue <= filters.dateTo)
        && (!filters.paymentMethod || paymentMethod === filters.paymentMethod);
    });
  }

  function getSummary() {
    const sales = getFilteredSales();
    const deliveries = getDeliveryRows();
    const purchases = getPurchaseRows();
    const payables = getPayableRows();
    const products = getProductsRows();

    const salesTotal = sales.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const salesCount = sales.length;
    const ticket = salesCount ? salesTotal / salesCount : 0;

    return {
      salesTotal,
      salesCount,
      ticket,
      deliveriesOpen: deliveries.filter((item) => !['Concluído', 'Cancelado'].includes(item.status)).length,
      purchaseTotal: purchases.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0),
      payablesOpen: payables.reduce((sum, item) => sum + Number(item.openAmount || 0), 0),
      stockValue: products.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.costPrice || 0)), 0)
    };
  }

  function getTopProducts(limit = 8) {
    const map = new Map();

    getFilteredSales().forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const current = map.get(item.name) || 0;
        map.set(item.name, current + Number(item.quantity || 0));
      });
    });

    return [...map.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
  }

  function getTopCustomers(limit = 8) {
    const map = new Map();

    getFilteredSales().forEach((sale) => {
      const name = sale.customerName || 'Balcão';
      const current = map.get(name) || 0;
      map.set(name, current + Number(sale.total || 0));
    });

    return [...map.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  function bindEvents() {
    tabEls.reports.querySelector('#reports-filter-apply')?.addEventListener('click', () => {
      filters.dateFrom = tabEls.reports.querySelector('#reports-filter-date-from')?.value || '';
      filters.dateTo = tabEls.reports.querySelector('#reports-filter-date-to')?.value || '';
      filters.paymentMethod = tabEls.reports.querySelector('#reports-filter-payment')?.value || '';
      render();
    });

    bindAsyncButton(tabEls.reports.querySelector('#reports-filter-clear'), async () => {
      filters = { dateFrom: '', dateTo: '', paymentMethod: '' };
      render();
    }, { busyLabel: 'Limpando...' });

    bindAsyncButton(tabEls.reports.querySelector('#reports-export-btn'), async () => {
      exportModule.exportSalesReport?.(getFilteredSales());
    }, { busyLabel: 'Exportando...' });
  }

  function renderSimpleList(items, formatter) {
    if (!items.length) {
      return '<div class="empty-state">Nada para exibir.</div>';
    }

    return `
      <div class="stack-list slim-list list-scroll">
        ${items.map((item) => formatter(item)).join('')}
      </div>
    `;
  }

  function formatDateValueForTable(dateLike) {
    const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike || 0);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR');
  }

  function render() {
    if (!hasAccess()) {
      tabEls.reports.innerHTML = renderBlocked();
      return;
    }

    const summary = getSummary();
    const filteredSales = getFilteredSales();
    const topProducts = getTopProducts();
    const topCustomers = getTopCustomers();

    tabEls.reports.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card"><span>Faturamento</span><strong>${summary.salesTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
          <div class="metric-card"><span>Vendas</span><strong>${summary.salesCount}</strong></div>
          <div class="metric-card"><span>Ticket médio</span><strong>${summary.ticket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
          <div class="metric-card"><span>Entregas abertas</span><strong>${summary.deliveriesOpen}</strong></div>
          <div class="metric-card"><span>Total em compras</span><strong>${summary.purchaseTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
          <div class="metric-card"><span>Contas em aberto</span><strong>${summary.payablesOpen.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
          <div class="metric-card"><span>Valor em estoque</span><strong>${summary.stockValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Filtros do relatório</h2>
            <div class="form-actions">
              <button class="btn btn-secondary" type="button" id="reports-export-btn">Exportar vendas</button>
            </div>
          </div>

          <div class="search-row">
            <input id="reports-filter-date-from" type="date" value="${filters.dateFrom}" />
            <input id="reports-filter-date-to" type="date" value="${filters.dateTo}" />
            <select id="reports-filter-payment">
              <option value="">Todas as formas</option>
              ${['Dinheiro', 'Pix', 'Cartão de Débito', 'Cartão de Crédito', 'Boleto', 'Transferência']
                .map((item) => `<option value="${item}" ${filters.paymentMethod === item ? 'selected' : ''}>${item}</option>`)
                .join('')}
            </select>
            <button class="btn btn-secondary" type="button" id="reports-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="reports-filter-clear">Limpar</button>
          </div>
        </div>

        <div class="dashboard-card-grid">
          <div class="table-card">
            <div class="section-header">
              <h2>Produtos mais vendidos</h2>
            </div>
            ${renderSimpleList(topProducts, (item) => `
              <div class="list-item">
                <strong>${escapeHtml(item.name || '-')}</strong>
                <span>${item.qty} unidade(s)</span>
              </div>
            `)}
          </div>

          <div class="table-card">
            <div class="section-header">
              <h2>Clientes com maior faturamento</h2>
            </div>
            ${renderSimpleList(topCustomers, (item) => `
              <div class="list-item">
                <strong>${escapeHtml(item.name || '-')}</strong>
                <span>${Number(item.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
            `)}
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Últimas vendas filtradas</h2>
            <span class="muted">${filteredSales.length} resultado(s)</span>
          </div>

          <div class="table-wrap scroll-dual">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Pagamento</th>
                  <th>Total</th>
                  <th>Itens</th>
                </tr>
              </thead>
              <tbody>
                ${filteredSales.slice(0, 100).map((sale) => `
                  <tr>
                    <td>${escapeHtml(formatDateValueForTable(sale.createdAt))}</td>
                    <td>${escapeHtml(sale.customerName || 'Balcão')}</td>
                    <td>${escapeHtml(sale.paymentMethod || '-')}</td>
                    <td>${Number(sale.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${sale.items?.length || 0}</td>
                  </tr>
                `).join('') || '<tr><td colspan="5">Nenhuma venda encontrada.</td></tr>'}
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