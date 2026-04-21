import { escapeHtml } from './ui.js';

export function createDashboardModule(ctx) {
  const { state, tabEls, currency, formatDateTime } = ctx;

  function renderSimpleList(items) {
    if (!items.length) {
      return '<div class="empty-state">Nada para exibir.</div>';
    }

    return `
      <div class="stack-list slim-list dashboard-list-scroll">
        ${items.map((text) => `
          <div class="list-item">
            <span>${escapeHtml(text)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function getLowStockProducts() {
    const threshold = Number(state.settings?.lowStockThreshold || 5);
    return (state.products || []).filter((item) => {
      return item.deleted !== true
        && item.status !== 'inativo'
        && Number(item.quantity || 0) <= threshold;
    });
  }

  function getTopSelling(limit = 5) {
    const map = new Map();

    (state.sales || [])
      .filter((sale) => sale.deleted !== true)
      .forEach((sale) => {
        (sale.items || []).forEach((item) => {
          map.set(item.name, (map.get(item.name) || 0) + Number(item.quantity || 0));
        });
      });

    return [...map.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
  }

  function getLowSelling(limit = 5) {
    const sold = getTopSelling(9999);
    const soldMap = new Map(sold.map((item) => [item.name, item.qty]));

    return (state.products || [])
      .filter((item) => item.deleted !== true)
      .map((item) => ({ name: item.name, qty: soldMap.get(item.name) || 0 }))
      .sort((a, b) => a.qty - b.qty)
      .slice(0, limit);
  }

  function getSalesDate(dateLike) {
    const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike || 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function getTodaySales() {
    const today = new Date();

    return (state.sales || []).filter((sale) => {
      if (sale.deleted === true) return false;
      const saleDate = getSalesDate(sale.createdAt);
      return saleDate && isSameDay(saleDate, today);
    });
  }

  function getMonthSales() {
    const today = new Date();

    return (state.sales || []).filter((sale) => {
      if (sale.deleted === true) return false;
      const saleDate = getSalesDate(sale.createdAt);
      return saleDate
        && saleDate.getFullYear() === today.getFullYear()
        && saleDate.getMonth() === today.getMonth();
    });
  }

  function getTodayDeliveries() {
    const today = new Date();

    return (state.deliveries || []).filter((item) => {
      if (item.deleted === true) return false;
      const raw = item.scheduledAt?.toDate ? item.scheduledAt.toDate() : new Date(item.scheduledAt || 0);
      return !Number.isNaN(raw.getTime()) && isSameDay(raw, today);
    });
  }

  function getPendingDeliveries() {
    return (state.deliveries || []).filter((item) => {
      return item.deleted !== true
        && ['Agendado', 'Em rota', 'Reagendado', 'Recolhimento'].includes(item.status);
    });
  }

  function getLast7DaysSales() {
    const today = new Date();
    const result = [];

    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(today);
      day.setHours(0, 0, 0, 0);
      day.setDate(today.getDate() - i);

      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);

      const total = (state.sales || []).reduce((sum, sale) => {
        if (sale.deleted === true) return sum;
        const saleDate = getSalesDate(sale.createdAt);
        if (!saleDate) return sum;
        return saleDate >= day && saleDate < nextDay ? sum + Number(sale.total || 0) : sum;
      }, 0);

      result.push({
        label: day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        total
      });
    }

    return result;
  }

  function renderMiniChart(data) {
    const max = Math.max(...data.map((item) => item.total), 1);
    const highestIndex = data.findIndex((item) => item.total === max);

    function shortCurrency(value) {
      const amount = Number(value || 0);
      if (amount >= 1000) {
        return `R$ ${(amount / 1000).toFixed(1).replace('.', ',')}k`;
      }
      return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    return `
      <div class="dashboard-sales-7d-chart">
        ${data.map((item, index) => {
          const height = item.total <= 0 ? 8 : Math.max(12, (item.total / max) * 180);
          const isHighest = index === highestIndex;
          const labelValue = shortCurrency(item.total);

          return `
            <div class="dashboard-sales-7d-col">
              <div class="dashboard-sales-7d-value ${isHighest ? 'is-highlight' : ''}">${labelValue}</div>
              <div class="dashboard-sales-7d-bar-wrap">
                <div class="dashboard-sales-7d-bar ${isHighest ? 'is-highlight' : ''}" style="height:${height}px;"></div>
              </div>
              <div class="dashboard-sales-7d-label">${item.label}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function render() {
    const todaySales = getTodaySales();
    const monthSales = getMonthSales();
    const todayDeliveries = getTodayDeliveries();
    const pendingDeliveries = getPendingDeliveries();
    const lowStock = getLowStockProducts();
    const topSelling = getTopSelling(8);
    const lowSelling = getLowSelling(8);
    const last7Days = getLast7DaysSales();

    const todaySalesTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const monthSalesTotal = monthSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);

    tabEls.dashboard.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card">
            <span>Vendas hoje</span>
            <strong>${currency(todaySalesTotal)}</strong>
          </div>

          <div class="metric-card">
            <span>Vendas no mês</span>
            <strong>${currency(monthSalesTotal)}</strong>
          </div>

          <div class="metric-card">
            <span>Entregas hoje</span>
            <strong>${todayDeliveries.length}</strong>
          </div>

          <div class="metric-card">
            <span>Estoque baixo</span>
            <strong>${lowStock.length}</strong>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Vendas dos últimos 7 dias</h2>
            <span class="muted">Visão resumida</span>
          </div>
          ${renderMiniChart(last7Days)}
        </div>

        <div class="dashboard-card-grid">
          <div class="table-card">
            <div class="section-header">
              <h2>Produtos com estoque baixo</h2>
              <span class="muted">${lowStock.length} item(ns)</span>
            </div>

            <div class="dashboard-list-scroll">
              ${lowStock.length
                ? `
                  <div class="stack-list slim-list">
                    ${lowStock.map((item) => `
                      <div class="list-item">
                        <strong>${escapeHtml(item.name || '-')}</strong>
                        <span>Estoque atual: ${Number(item.quantity || 0)}</span>
                      </div>
                    `).join('')}
                  </div>
                `
                : '<div class="empty-state">Nenhum produto em estoque baixo.</div>'
              }
            </div>
          </div>

          <div class="table-card">
            <div class="section-header">
              <h2>Entregas pendentes</h2>
              <span class="muted">${pendingDeliveries.length} item(ns)</span>
            </div>

            <div class="dashboard-list-scroll">
              ${pendingDeliveries.length
                ? `
                  <div class="stack-list slim-list">
                    ${pendingDeliveries.map((item) => `
                      <div class="list-item">
                        <strong>${escapeHtml(item.customerName || 'Cliente')}</strong>
                        <span>${escapeHtml(item.status || '-')} · ${item.scheduledAt ? formatDateTime(item.scheduledAt) : '-'}</span>
                      </div>
                    `).join('')}
                  </div>
                `
                : '<div class="empty-state">Nenhuma entrega pendente.</div>'
              }
            </div>
          </div>

          <div class="table-card">
            <div class="section-header">
              <h2>Mais vendidos</h2>
              <span class="muted">${topSelling.length} item(ns)</span>
            </div>
            ${renderSimpleList(topSelling.map((item) => `${item.name} · ${item.qty} un.`))}
          </div>

          <div class="table-card">
            <div class="section-header">
              <h2>Menor giro</h2>
              <span class="muted">${lowSelling.length} item(ns)</span>
            </div>
            ${renderSimpleList(lowSelling.map((item) => `${item.name} · ${item.qty} un.`))}
          </div>
        </div>
      </div>
    `;
  }

  return {
    render,
    getLowStockProducts
  };
}