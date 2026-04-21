import { escapeHtml, showToast, bindAsyncButton } from './ui.js';

export function createSalesModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    updateByPath,
    tabEls,
    currency,
    toNumber,
    formatDateTime,
    paymentMethods,
    clientsModule,
    printModule
  } = ctx;

  let saleFilters = { customer: '', paymentMethod: '', dateFrom: '', dateTo: '' };
  let keyboardBound = false;
  let isFinishingSale = false;
  let searchTerm = '';

  function focusSearchInput() {
    const input = tabEls.sales?.querySelector('#sale-product-search');
    if (input) {
      input.focus();
      input.select?.();
    }
  }

  function getActiveProducts() {
    return (state.products || []).filter((item) => item.deleted !== true && item.status !== 'inativo');
  }

  function getProductById(productId) {
    return getActiveProducts().find((item) => item.id === productId) || null;
  }

  function getProductByBarcode(barcode) {
    const value = String(barcode || '').trim();
    if (!value) return null;
    return getActiveProducts().find((item) => String(item.barcode || '').trim() === value) || null;
  }

  function getAvailableStock(productId) {
    const product = getProductById(productId);
    return Number(product?.quantity || 0);
  }

  function getCartRow(productId) {
    return (state.cart || []).find((item) => item.id === productId) || null;
  }

  function clearCartWithFeedback() {
    state.cart = [];
    render();
    showToast('Carrinho limpo.', 'info');
  }

  function calculateCartTotal() {
    const discountInput = tabEls.sales?.querySelector('input[name="discount"]');
    const paidInput = tabEls.sales?.querySelector('input[name="amountPaid"]');

    const subtotal = (state.cart || []).reduce((sum, item) => {
      return sum + (Number(item.salePrice || 0) * Number(item.quantity || 0));
    }, 0);

    const discount = toNumber(discountInput?.value || 0);
    const total = Math.max(0, subtotal - discount);
    const amountPaid = toNumber(paidInput?.value || 0);
    const change = Math.max(0, amountPaid - total);

    return { subtotal, discount, total, amountPaid, change };
  }

  function updateSaleSummary() {
    const { subtotal, discount, total, change } = calculateCartTotal();
    tabEls.sales.querySelector('#sale-subtotal').textContent = currency(subtotal);
    tabEls.sales.querySelector('#sale-discount-view').textContent = currency(discount);
    tabEls.sales.querySelector('#sale-total').textContent = currency(total);
    tabEls.sales.querySelector('#sale-change').textContent = currency(change);
    tabEls.sales.querySelector('#sale-items-count').textContent = String((state.cart || []).length);
  }

  function normalizeSaleForPrint(sale) {
    return {
      customerName: sale.customerName || '',
      customerCpf: sale.customerCpf || '',
      paymentMethod: sale.paymentMethod || '',
      createdAt: sale.createdAt || null,
      saleDateTimeLabel: sale.saleDateTimeLabel || formatDateTime(sale.createdAt),
      subtotal: Number(sale.subtotal || 0),
      discount: Number(sale.discount || 0),
      total: Number(sale.total || 0),
      amountPaid: Number(sale.amountPaid || 0),
      change: Number(sale.change || 0),
      items: Array.isArray(sale.items)
        ? sale.items.map((item) => ({
            productId: item.productId || '',
            name: item.name || '',
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
            total: Number(item.total || 0)
          }))
        : []
    };
  }

  function addProductToCart(productId) {
    const product = getProductById(productId);
    if (!product) return;

    const existing = getCartRow(productId);
    const currentQty = Number(existing?.quantity || 0);
    const stockQty = getAvailableStock(productId);

    if (currentQty + 1 > stockQty) {
      showToast('Quantidade maior que o estoque disponível.', 'error');
      return;
    }

    if (existing) {
      existing.quantity += 1;
    } else {
      state.cart.push({
        id: product.id,
        name: product.name,
        salePrice: Number(product.salePrice || 0),
        quantity: 1,
        barcode: product.barcode
      });
    }

    render();
    showToast('Produto adicionado à venda.', 'success');
  }

  function changeCartQuantity(productId, delta) {
    const row = getCartRow(productId);
    const stockQty = getAvailableStock(productId);
    if (!row) return;

    const nextQty = Number(row.quantity || 0) + Number(delta || 0);

    if (nextQty <= 0) {
      state.cart = (state.cart || []).filter((item) => item.id !== productId);
      render();
      return;
    }

    if (nextQty > stockQty) {
      showToast('Quantidade maior que o estoque disponível.', 'error');
      return;
    }

    row.quantity = nextQty;
    render();
  }

  function tryAddProductByBarcode(barcode, showWarning = true) {
    const product = getProductByBarcode(barcode);
    if (!product) {
      if (showWarning) showToast('Produto não cadastrado.', 'error');
      return false;
    }

    addProductToCart(product.id);

    const input = tabEls.sales.querySelector('#sale-product-search');
    if (input) {
      input.value = '';
      searchTerm = '';
      input.focus();
    }

    return true;
  }

  function renderSearchResults() {
    const resultsEl = tabEls.sales.querySelector('#sale-search-results');
    if (!resultsEl) return;

    const term = String(searchTerm || '').trim().toLowerCase();

    if (!term) {
      resultsEl.innerHTML = `
        <div class="empty-state">
          <strong>Pesquise um produto</strong>
          <span>Digite nome ou código de barras para listar resultados.</span>
        </div>
      `;
      return;
    }

    const results = getActiveProducts()
      .filter((product) =>
        [product.name, product.barcode, product.brand, product.supplier]
          .join(' ')
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 8);

    resultsEl.innerHTML =
      results
        .map(
          (product) => `
            <div class="list-item">
              <strong>${escapeHtml(product.name)}</strong>
              <span>${escapeHtml(product.barcode || 'Sem código')} · Estoque: ${product.quantity} · ${currency(product.salePrice || 0)}</span>
              <div class="form-actions">
                <button class="btn btn-secondary" type="button" data-add-product="${product.id}">
                  Adicionar
                </button>
              </div>
            </div>
          `
        )
        .join('') ||
      `
        <div class="empty-state">
          <strong>Nenhum produto encontrado</strong>
          <span>Refine sua pesquisa.</span>
        </div>
      `;

    resultsEl.querySelectorAll('[data-add-product]').forEach((btn) => {
      btn.addEventListener('click', () => addProductToCart(btn.dataset.addProduct));
    });
  }

  function renderCart() {
    const cartEl = tabEls.sales.querySelector('#sale-cart-items');
    if (!cartEl) return;

    if (!(state.cart || []).length) {
      cartEl.innerHTML = `
        <div class="empty-state">
          <strong>Carrinho vazio</strong>
          <span>Pesquise um produto para adicionar.</span>
        </div>
      `;
      return;
    }

    cartEl.innerHTML = state.cart
      .map(
        (item) => `
          <div class="list-item">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${currency(Number(item.salePrice || 0))}</span>
            <div class="form-actions">
              <button class="btn btn-secondary" type="button" data-cart-decrease="${item.id}">−</button>
              <span>${Number(item.quantity || 0)}</span>
              <button class="btn btn-secondary" type="button" data-cart-increase="${item.id}">+</button>
              <button class="btn btn-secondary" type="button" data-cart-remove="${item.id}">🗑️</button>
            </div>
          </div>
        `
      )
      .join('');

    cartEl.querySelectorAll('[data-cart-decrease]').forEach((btn) => {
      btn.addEventListener('click', () => changeCartQuantity(btn.dataset.cartDecrease, -1));
    });

    cartEl.querySelectorAll('[data-cart-increase]').forEach((btn) => {
      btn.addEventListener('click', () => changeCartQuantity(btn.dataset.cartIncrease, 1));
    });

    cartEl.querySelectorAll('[data-cart-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.cart = state.cart.filter((item) => item.id !== btn.dataset.cartRemove);
        render();
      });
    });
  }

  function renderHistory() {
    const historyEl = tabEls.sales.querySelector('#sales-history-table');
    if (!historyEl) return;

    const rows = (state.sales || []).filter((sale) => {
      if (sale.deleted === true) return false;

      const customer = String(sale.customerName || '').toLowerCase();
      const paymentMethod = String(sale.paymentMethod || '');
      const created = sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt || 0);
      const createdKey = Number.isNaN(created.getTime())
        ? ''
        : `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;

      return (
        (!saleFilters.customer || customer.includes(saleFilters.customer.toLowerCase())) &&
        (!saleFilters.paymentMethod || paymentMethod === saleFilters.paymentMethod) &&
        (!saleFilters.dateFrom || !createdKey || createdKey >= saleFilters.dateFrom) &&
        (!saleFilters.dateTo || !createdKey || createdKey <= saleFilters.dateTo)
      );
    });

    historyEl.innerHTML =
      rows
        .map(
          (sale) => `
            <tr>
              <td>${escapeHtml(formatDateTime(sale.createdAt))}</td>
              <td>${escapeHtml(sale.customerName || 'Não identificado')}</td>
              <td>${escapeHtml(sale.paymentMethod || '-')}</td>
              <td>${currency(sale.total || 0)}</td>
              <td>${Array.isArray(sale.items) ? sale.items.length : 0}</td>
              <td>
                <button class="btn btn-secondary" type="button" data-print-sale="${sale.id}">🖨️</button>
              </td>
            </tr>
          `
        )
        .join('') || 'Nenhuma venda encontrada.';

    historyEl.querySelectorAll('[data-print-sale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sale = (state.sales || []).find((item) => item.id === btn.dataset.printSale);
        if (!sale) return;
        printModule.printSaleReceipt(normalizeSaleForPrint(sale));
      });
    });
  }

  function bindCpfToggle() {
    const checkbox = tabEls.sales.querySelector('#sale-include-cpf');
    const wrap = tabEls.sales.querySelector('#sale-cpf-wrap');
    const input = tabEls.sales.querySelector('#sale-customer-cpf');
    if (!checkbox || !wrap || !input) return;

    const sync = () => {
      const checked = checkbox.checked;
      wrap.style.display = checked ? '' : 'none';
      if (!checked) input.value = '';
    };

    checkbox.addEventListener('change', sync);
    sync();
  }

  async function finishSale() {
    if (isFinishingSale) return;
    isFinishingSale = true;

    try {
      if (!(state.cart || []).length) {
        alert('Adicione pelo menos um produto à venda.');
        return;
      }

      const paymentMethod = tabEls.sales.querySelector('#sale-payment-method')?.value || 'Dinheiro';
      const notes = tabEls.sales.querySelector('textarea[name="notes"]')?.value || '';

      const manualCustomerName = tabEls.sales.querySelector('#sale-customer-name')?.value || '';
      const selectedClientName = state.selectedSaleClient?.name || '';
      const customerName = String(manualCustomerName || selectedClientName).trim() || 'Não identificado';

      const includeCpf = Boolean(tabEls.sales.querySelector('#sale-include-cpf')?.checked);
      const manualCustomerCpf = tabEls.sales.querySelector('#sale-customer-cpf')?.value || '';
      const selectedClientCpf = state.selectedSaleClient?.cpf || state.selectedSaleClient?.document || '';
      const customerCpf = includeCpf ? String(manualCustomerCpf || selectedClientCpf).trim() : '';

      const { subtotal, discount, total, amountPaid, change } = calculateCartTotal();

      if (amountPaid < total) {
        alert('O valor pago é menor que o total da venda.');
        return;
      }

      const items = state.cart.map((item) => ({
        productId: item.id,
        name: item.name,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.salePrice || 0),
        total: Number(item.salePrice || 0) * Number(item.quantity || 0)
      }));

      const saleCreatedAt = new Date();
      const saleDateTimeLabel = saleCreatedAt.toLocaleString('pt-BR');

      const payload = {
        customerName,
        customerCpf,
        customerId: state.selectedSaleClient?.id || '',
        paymentMethod,
        subtotal,
        discount,
        total,
        amountPaid,
        change,
        notes,
        items,
        cashierName: state.currentUser?.fullName || '',
        deleted: false
      };

      const saleId = await createDoc(refs.sales, payload);

      for (const item of items) {
        const product = getProductById(item.productId);
        if (!product) continue;

        await updateByPath('products', item.productId, {
          quantity: Math.max(0, Number(product.quantity || 0) - Number(item.quantity || 0))
        });
      }

      printModule.printSaleReceipt({
        ...payload,
        id: saleId,
        createdAt: saleCreatedAt.toISOString(),
        saleDateTimeLabel
      });

      state.cart = [];
      state.selectedSaleClient = null;
      searchTerm = '';

      const searchInput = tabEls.sales.querySelector('#sale-product-search');
      if (searchInput) searchInput.value = '';

      tabEls.sales.querySelector('#sale-customer-name').value = '';
      tabEls.sales.querySelector('#sale-payment-method').value = paymentMethods?.[0] || 'Dinheiro';
      tabEls.sales.querySelector('input[name="discount"]').value = '0';
      tabEls.sales.querySelector('input[name="amountPaid"]').value = '0';
      tabEls.sales.querySelector('textarea[name="notes"]').value = '';

      const cpfCheck = tabEls.sales.querySelector('#sale-include-cpf');
      const cpfInput = tabEls.sales.querySelector('#sale-customer-cpf');
      if (cpfCheck) cpfCheck.checked = false;
      if (cpfInput) cpfInput.value = '';

      showToast('Venda finalizada com sucesso.', 'success');
      render();
      focusSearchInput();
    } finally {
      isFinishingSale = false;
    }
  }

  function bindKeyboardShortcuts() {
    if (keyboardBound) return;
    keyboardBound = true;

    document.addEventListener('keydown', (event) => {
      if (!tabEls.sales?.classList.contains('active')) return;
      if (event.key === 'F2') {
        event.preventDefault();
        focusSearchInput();
      }
    });
  }

  function openClientPicker() {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="sale-client-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Selecionar cliente</h2>
            <button class="btn btn-secondary" type="button" id="sale-client-modal-close">Fechar</button>
          </div>

          <div id="sale-client-picker-host"></div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#sale-client-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#sale-client-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'sale-client-modal-backdrop') closeModal();
    });

    clientsModule.renderClientPicker?.({
      target: '#sale-client-picker-host',
      onSelect: (client) => {
        state.selectedSaleClient = client || null;

        const input = tabEls.sales.querySelector('#sale-customer-name');
        if (input) input.value = client?.name || '';

        closeModal();
      }
    });
  }

  function render() {
    const { subtotal, discount, total, change } = calculateCartTotal();
    const selectedCustomerName = state.selectedSaleClient?.name || '';

    tabEls.sales.innerHTML = `
      <div class="section-header">
        <h2>Venda</h2>
      </div>

      <p class="auth-hint">Pesquisa de produto e código de barras</p>

      <div class="form-actions">
        <button class="btn btn-secondary" type="button" id="sale-select-client-btn">Selecionar cliente</button>
        <button class="btn btn-secondary" type="button" id="sale-clear-client-btn">Limpar cliente</button>
      </div>

      <div class="filters-grid">
        <label>
          Cliente
          <input id="sale-customer-name" value="${escapeHtml(selectedCustomerName)}" />
        </label>

        <label style="display:flex; align-items:end; gap:8px;">
          <input type="checkbox" id="sale-include-cpf" />
          <span>Inserir CPF no cupom</span>
        </label>

        <label id="sale-cpf-wrap">
          CPF
          <input id="sale-customer-cpf" />
        </label>
      </div>

      <div class="filters-grid">
        <label>
          Produto
          <input id="sale-product-search" placeholder="Pesquise um produto" />
        </label>
      </div>

      <div id="sale-search-results"></div>

      <div class="section-header" style="margin-top:16px;">
        <h2>Carrinho</h2>
        <span id="sale-items-count">${state.cart.length} item(ns)</span>
      </div>

      <div id="sale-cart-items"></div>

      <div class="filters-grid" style="margin-top:16px;">
        <label>
          Forma de pagamento
          <select id="sale-payment-method">
            ${paymentMethods.map((method) => `<option value="${escapeHtml(method)}">${escapeHtml(method)}</option>`).join('')}
          </select>
        </label>

        <label>
          Desconto
          <input type="number" name="discount" min="0" step="0.01" value="0" />
        </label>

        <label>
          Valor pago
          <input type="number" name="amountPaid" min="0" step="0.01" value="0" />
        </label>
      </div>

      <label style="display:block; margin-top:12px;">
        Observações
        <textarea name="notes" rows="3"></textarea>
      </label>

      <div class="filters-grid" style="margin-top:16px;">
        <div><strong>Subtotal</strong><br><span id="sale-subtotal">${currency(subtotal)}</span></div>
        <div><strong>Desconto</strong><br><span id="sale-discount-view">${currency(discount)}</span></div>
        <div><strong>Total</strong><br><span id="sale-total">${currency(total)}</span></div>
        <div><strong>Troco</strong><br><span id="sale-change">${currency(change)}</span></div>
      </div>

      <div class="form-actions" style="margin-top:16px;">
        <button class="btn btn-primary" type="button" id="finish-sale-btn">Finalizar venda</button>
        <button class="btn btn-secondary" type="button" id="clear-cart-btn">Limpar carrinho</button>
      </div>

      <div class="section-header" style="margin-top:24px;">
        <h2>Histórico de vendas</h2>
      </div>

      <div class="filters-grid">
        <input id="sales-filter-customer" placeholder="Cliente" value="${escapeHtml(saleFilters.customer)}" />
        <select id="sales-filter-payment">
          <option value="">Todas as formas</option>
          ${paymentMethods.map((method) => `<option value="${escapeHtml(method)}" ${saleFilters.paymentMethod === method ? 'selected' : ''}>${escapeHtml(method)}</option>`).join('')}
        </select>
        <input id="sales-filter-date-from" type="date" value="${escapeHtml(saleFilters.dateFrom)}" />
        <input id="sales-filter-date-to" type="date" value="${escapeHtml(saleFilters.dateTo)}" />
        <button class="btn btn-secondary" type="button" id="sales-filter-apply">Filtrar</button>
        <button class="btn btn-secondary" type="button" id="sales-filter-clear">Limpar</button>
      </div>

      <div class="table-wrap" style="margin-top:16px;">
        <table class="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Cliente</th>
              <th>Pagamento</th>
              <th>Total</th>
              <th>Itens</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="sales-history-table"></tbody>
        </table>
      </div>
    `;

    const searchInput = tabEls.sales.querySelector('#sale-product-search');

    searchInput?.addEventListener('input', (event) => {
      searchTerm = event.currentTarget.value || '';
      renderSearchResults();
    });

    searchInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        tryAddProductByBarcode(event.currentTarget.value || '', true);
      }
    });

    bindAsyncButton(tabEls.sales.querySelector('#sale-select-client-btn'), async () => {
      openClientPicker();
    }, { busyLabel: 'Abrindo...' });

    bindAsyncButton(tabEls.sales.querySelector('#sale-clear-client-btn'), async () => {
      state.selectedSaleClient = null;

      const clientInput = tabEls.sales.querySelector('#sale-customer-name');
      const cpfCheck = tabEls.sales.querySelector('#sale-include-cpf');
      const cpfInput = tabEls.sales.querySelector('#sale-customer-cpf');

      if (clientInput) clientInput.value = '';
      if (cpfCheck) cpfCheck.checked = false;
      if (cpfInput) cpfInput.value = '';

      bindCpfToggle();
      showToast('Cliente limpo.', 'info');
    }, { busyLabel: 'Limpando...' });

    tabEls.sales.querySelector('#sale-payment-method')?.addEventListener('change', updateSaleSummary);
    tabEls.sales.querySelector('input[name="discount"]')?.addEventListener('input', updateSaleSummary);
    tabEls.sales.querySelector('input[name="amountPaid"]')?.addEventListener('input', updateSaleSummary);

    bindAsyncButton(tabEls.sales.querySelector('#finish-sale-btn'), async () => {
      await finishSale();
    }, { busyLabel: 'Finalizando...' });

    bindAsyncButton(tabEls.sales.querySelector('#clear-cart-btn'), async () => {
      clearCartWithFeedback();
    }, { busyLabel: 'Limpando...' });

    tabEls.sales.querySelector('#sales-filter-apply')?.addEventListener('click', () => {
      saleFilters.customer = tabEls.sales.querySelector('#sales-filter-customer')?.value || '';
      saleFilters.paymentMethod = tabEls.sales.querySelector('#sales-filter-payment')?.value || '';
      saleFilters.dateFrom = tabEls.sales.querySelector('#sales-filter-date-from')?.value || '';
      saleFilters.dateTo = tabEls.sales.querySelector('#sales-filter-date-to')?.value || '';
      renderHistory();
    });

    bindAsyncButton(tabEls.sales.querySelector('#sales-filter-clear'), async () => {
      saleFilters = { customer: '', paymentMethod: '', dateFrom: '', dateTo: '' };
      render();
    }, { busyLabel: 'Limpando...' });

    renderSearchResults();
    renderCart();
    renderHistory();
    updateSaleSummary();
    bindCpfToggle();
    bindKeyboardShortcuts();
  }

  return { render };
}