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

  let saleFilters = {
    customer: '',
    paymentMethod: '',
    dateFrom: '',
    dateTo: ''
  };

  let keyboardBound = false;
  let isFinishingSale = false;
  let searchTerm = '';

  let saleFormState = {
    customerName: '',
    includeCpf: false,
    customerCpf: '',
    paymentMethod: paymentMethods?.[0] || 'Dinheiro',
    discount: '0',
    amountPaid: '0',
    notes: ''
  };

  function getCurrentUserMeta() {
    return {
      uid: String(state.currentUser?.uid || ''),
      name: String(state.currentUser?.fullName || '')
    };
  }

  function focusSearchInput() {
    const input = tabEls.sales?.querySelector('#sale-product-search');
    if (input) {
      input.focus();
      input.select?.();
    }
  }

  function getActiveProducts() {
    return (state.products || []).filter((item) =>
      item.deleted !== true && item.status !== 'inativo'
    );
  }

  function getProductById(productId) {
    return getActiveProducts().find((item) => item.id === productId) || null;
  }

  function getProductByBarcode(barcode) {
    const value = String(barcode || '').trim();
    if (!value) return null;

    return getActiveProducts().find((item) => {
      return String(item.barcode || '').trim() === value;
    }) || null;
  }

  function getAvailableStock(productId) {
    const product = getProductById(productId);
    return Number(product?.quantity || 0);
  }

  function getCartRow(productId) {
    return (state.cart || []).find((item) => item.id === productId) || null;
  }

  function getSelectedClientCpf() {
    return String(
      state.selectedSaleClient?.cpf ||
      state.selectedSaleClient?.document ||
      ''
    ).trim();
  }

  function getSelectedClientLabel() {
    if (!state.selectedSaleClient) {
      return {
        name: saleFormState.customerName || 'Consumidor final',
        cpf: saleFormState.includeCpf
          ? (saleFormState.customerCpf || 'Sem CPF')
          : 'CPF não informado'
      };
    }

    return {
      name: state.selectedSaleClient.name || 'Cliente selecionado',
      cpf: getSelectedClientCpf() || 'Sem CPF'
    };
  }

  function syncSaleFormStateFromDom() {
    const customerNameInput = tabEls.sales?.querySelector('#sale-customer-name');
    const includeCpfInput = tabEls.sales?.querySelector('#sale-include-cpf');
    const customerCpfInput = tabEls.sales?.querySelector('#sale-customer-cpf');
    const paymentMethodInput = tabEls.sales?.querySelector('#sale-payment-method');
    const discountInput = tabEls.sales?.querySelector('input[name="discount"]');
    const amountPaidInput = tabEls.sales?.querySelector('input[name="amountPaid"]');
    const notesInput = tabEls.sales?.querySelector('textarea[name="notes"]');

    if (customerNameInput) saleFormState.customerName = customerNameInput.value || '';
    if (includeCpfInput) saleFormState.includeCpf = Boolean(includeCpfInput.checked);
    if (customerCpfInput) saleFormState.customerCpf = customerCpfInput.value || '';
    if (paymentMethodInput) saleFormState.paymentMethod = paymentMethodInput.value || (paymentMethods?.[0] || 'Dinheiro');
    if (discountInput) saleFormState.discount = discountInput.value || '0';
    if (amountPaidInput) saleFormState.amountPaid = amountPaidInput.value || '0';
    if (notesInput) saleFormState.notes = notesInput.value || '';
  }

  function clearCartWithFeedback() {
    state.cart = [];
    render();
    showToast('Carrinho limpo.', 'info');
  }

  function calculateCartTotal() {
    const subtotal = (state.cart || []).reduce((sum, item) => {
      return sum + (Number(item.salePrice || 0) * Number(item.quantity || 0));
    }, 0);

    const discount = toNumber(saleFormState.discount || 0);
    const total = Math.max(0, subtotal - discount);
    const amountPaid = toNumber(saleFormState.amountPaid || 0);
    const change = Math.max(0, amountPaid - total);

    return { subtotal, discount, total, amountPaid, change };
  }

  function updateSaleSummary() {
    syncSaleFormStateFromDom();

    const { subtotal, discount, total, change, amountPaid } = calculateCartTotal();

    const subtotalEl = tabEls.sales.querySelector('#sale-subtotal');
    const discountEl = tabEls.sales.querySelector('#sale-discount-view');
    const totalEl = tabEls.sales.querySelector('#sale-total');
    const changeEl = tabEls.sales.querySelector('#sale-change');
    const itemsCountEl = tabEls.sales.querySelector('#sale-items-count');
    const amountPaidEl = tabEls.sales.querySelector('#sale-paid-view');

    if (subtotalEl) subtotalEl.textContent = currency(subtotal);
    if (discountEl) discountEl.textContent = currency(discount);
    if (totalEl) totalEl.textContent = currency(total);
    if (changeEl) changeEl.textContent = currency(change);
    if (itemsCountEl) itemsCountEl.textContent = String((state.cart || []).length);
    if (amountPaidEl) amountPaidEl.textContent = currency(amountPaid);
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

  function getSaleVersion(sale) {
    return Number(sale?.version || 0);
  }

  function isSalesFocusMode() {
    return document.body.classList.contains('sales-focus-mode');
  }

  function setSalesFocusMode(enabled) {
    document.body.classList.toggle('sales-focus-mode', Boolean(enabled));

    try {
      localStorage.setItem('sales_focus_mode', enabled ? '1' : '0');
    } catch (error) {
      console.warn('Falha ao salvar modo foco da venda.', error);
    }
  }

  function loadSalesFocusMode() {
    try {
      return localStorage.getItem('sales_focus_mode') === '1';
    } catch (error) {
      return false;
    }
  }

  async function enterBrowserFullscreen() {
    const root = document.documentElement || document.body;

    try {
      if (!document.fullscreenElement && root?.requestFullscreen) {
        await root.requestFullscreen();
      }
    } catch (error) {
      console.warn('Falha ao entrar em tela cheia.', error);
    }
  }

  async function exitBrowserFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.warn('Falha ao sair da tela cheia.', error);
    }
  }

  async function toggleSalesFocusMode() {
    const enabled = !isSalesFocusMode();

    if (enabled) {
      setSalesFocusMode(true);
      await enterBrowserFullscreen();
    } else {
      await exitBrowserFullscreen();
      setSalesFocusMode(false);
    }

    render();

    if (enabled) {
      setTimeout(() => {
        focusSearchInput();
      }, 80);
    }
  }

  function bindSalesFocusFullscreenSync() {
    if (window.__salesFocusFullscreenBound) return;
    window.__salesFocusFullscreenBound = true;

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && document.body.classList.contains('sales-focus-mode')) {
        document.body.classList.remove('sales-focus-mode');

        try {
          localStorage.setItem('sales_focus_mode', '0');
        } catch (error) {
          console.warn('Falha ao limpar modo foco da venda.', error);
        }

        if (tabEls.sales?.classList.contains('active')) {
          render();
        }
      }
    });
  }

  function addProductToCart(productId) {
    syncSaleFormStateFromDom();

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
    syncSaleFormStateFromDom();

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

  function getSearchResults(term) {
    const normalized = String(term || '').trim().toLowerCase();
    if (!normalized) return [];

    return getActiveProducts()
      .filter((product) =>
        [product.name, product.barcode, product.brand, product.supplier]
          .join(' ')
          .toLowerCase()
          .includes(normalized)
      )
      .slice(0, 8);
  }

  function renderSearchResults() {
    const resultsEl = tabEls.sales.querySelector('#sale-search-results');
    if (!resultsEl) return;

    const term = String(searchTerm || '').trim();
    const normalized = term.toLowerCase();

    if (!normalized) {
      resultsEl.innerHTML = `
        <div class="empty-state sales-empty-box">
          <strong>Pesquise um produto</strong>
          <span>Digite nome ou código de barras para listar resultados.</span>
        </div>
      `;
      return;
    }

    const results = getSearchResults(normalized);

    resultsEl.innerHTML = results.map((product, index) => `
      <div class="sales-product-result ${index === 0 ? 'is-primary-result' : ''}">
        <div class="sales-product-result-main">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${escapeHtml(product.barcode || 'Sem código')}</span>
        </div>
        <div class="sales-product-result-meta">
          <span>Estoque: ${product.quantity}</span>
          <strong>${currency(product.salePrice || 0)}</strong>
        </div>
        <div class="sales-product-result-actions">
          <button class="btn btn-secondary" type="button" data-add-product="${product.id}">
            ${index === 0 ? 'Adicionar (Enter)' : 'Adicionar'}
          </button>
        </div>
      </div>
    `).join('') || `
      <div class="empty-state sales-empty-box">
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
        <div class="empty-state sales-empty-box">
          <strong>Carrinho vazio</strong>
          <span>Pesquise um produto para adicionar.</span>
        </div>
      `;
      return;
    }

    cartEl.innerHTML = state.cart.map((item) => `
      <div class="sales-cart-item">
        <div class="sales-cart-top">
          <div class="sales-cart-title">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.barcode || 'Sem código')} • Unitário ${currency(Number(item.salePrice || 0))}</span>
          </div>
          <div class="sales-cart-price">
            ${currency(Number(item.salePrice || 0))}
          </div>
        </div>

        <div class="sales-cart-bottom">
          <div class="sales-cart-qty">
            <button class="icon-action-btn" type="button" data-cart-decrease="${item.id}" aria-label="Diminuir">−</button>
            <strong>${Number(item.quantity || 0)}</strong>
            <button class="icon-action-btn" type="button" data-cart-increase="${item.id}" aria-label="Aumentar">+</button>
          </div>

          <div class="sales-cart-total">
            ${currency(Number(item.salePrice || 0) * Number(item.quantity || 0))}
          </div>

          <button class="icon-action-btn sales-cart-remove-btn" type="button" data-cart-remove="${item.id}" aria-label="Remover">🗑️</button>
        </div>
      </div>
    `).join('');

    cartEl.querySelectorAll('[data-cart-decrease]').forEach((btn) => {
      btn.addEventListener('click', () => changeCartQuantity(btn.dataset.cartDecrease, -1));
    });

    cartEl.querySelectorAll('[data-cart-increase]').forEach((btn) => {
      btn.addEventListener('click', () => changeCartQuantity(btn.dataset.cartIncrease, 1));
    });

    cartEl.querySelectorAll('[data-cart-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncSaleFormStateFromDom();
        state.cart = state.cart.filter((item) => item.id !== btn.dataset.cartRemove);
        render();
      });
    });
  }

  function cloneSaleItems(items = []) {
    return (items || []).map((item) => ({
      productId: item.productId || '',
      name: item.name || '',
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      total: Number(item.total || 0)
    }));
  }

  function calcItemsSubtotal(items = []) {
    return items.reduce((sum, item) => {
      return sum + (Number(item.unitPrice || 0) * Number(item.quantity || 0));
    }, 0);
  }

  function buildItemsDiff(oldItems = [], newItems = []) {
    const map = new Map();

    oldItems.forEach((item) => {
      const key = String(item.productId || '');
      if (!key) return;

      if (!map.has(key)) {
        map.set(key, { oldQty: 0, newQty: 0 });
      }

      map.get(key).oldQty += Number(item.quantity || 0);
    });

    newItems.forEach((item) => {
      const key = String(item.productId || '');
      if (!key) return;

      if (!map.has(key)) {
        map.set(key, { oldQty: 0, newQty: 0 });
      }

      map.get(key).newQty += Number(item.quantity || 0);
    });

    return map;
  }

  async function applySaleItemsStockDiff(oldItems = [], newItems = []) {
    const diffMap = buildItemsDiff(oldItems, newItems);

    for (const [productId, diff] of diffMap.entries()) {
      const product = getProductById(productId);
      if (!product) continue;

      const delta = Number(diff.newQty || 0) - Number(diff.oldQty || 0);

      if (delta === 0) continue;

      const currentStock = Number(product.quantity || 0);
      const nextStock = currentStock - delta;

      if (nextStock < 0) {
        throw new Error(`Estoque insuficiente para o produto "${product.name || productId}".`);
      }

      await updateByPath('products', productId, {
        quantity: nextStock
      });
    }
  }

  function openSaleDetailsModal(saleId) {
    const sale = (state.sales || []).find((item) => item.id === saleId);
    if (!sale) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    const items = Array.isArray(sale.items) ? sale.items : [];

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="sale-details-modal-backdrop">
        <div class="modal-card" style="max-width:960px;">
          <div class="section-header">
            <h2>Detalhes da venda</h2>
            <button class="btn btn-secondary" type="button" id="sale-details-close-btn">Fechar</button>
          </div>

          <div class="sale-modal-grid">
            <div class="sale-modal-card"><strong>Data</strong><span>${escapeHtml(formatDateTime(sale.createdAt))}</span></div>
            <div class="sale-modal-card"><strong>Cliente</strong><span>${escapeHtml(sale.customerName || 'Não identificado')}</span></div>
            <div class="sale-modal-card"><strong>CPF</strong><span>${escapeHtml(sale.customerCpf || '-')}</span></div>
            <div class="sale-modal-card"><strong>Pagamento</strong><span>${escapeHtml(sale.paymentMethod || '-')}</span></div>
            <div class="sale-modal-card"><strong>Operador</strong><span>${escapeHtml(sale.cashierName || '-')}</span></div>
            <div class="sale-modal-card"><strong>Versão</strong><span>${getSaleVersion(sale)}</span></div>
          </div>

          <div class="sale-modal-section">
            <strong class="sale-modal-section-title">Resumo financeiro</strong>
            <div class="summary-box">
              <div class="summary-line"><span>Subtotal</span><strong>${currency(sale.subtotal || 0)}</strong></div>
              <div class="summary-line"><span>Desconto</span><strong>${currency(sale.discount || 0)}</strong></div>
              <div class="summary-line total"><span>Total</span><strong>${currency(sale.total || 0)}</strong></div>
              <div class="summary-line"><span>Valor pago</span><strong>${currency(sale.amountPaid || 0)}</strong></div>
              <div class="summary-line"><span>Troco</span><strong>${currency(sale.change || 0)}</strong></div>
            </div>
          </div>

          <div class="sale-modal-section">
            <strong class="sale-modal-section-title">Observações</strong>
            <div class="sale-items-box">
              <span>${escapeHtml(sale.notes || 'Sem observações.')}</span>
            </div>
          </div>

          <div class="sale-modal-section">
            <strong class="sale-modal-section-title">Itens</strong>
            <div class="table-wrap sale-items-box">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Unitário</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    items.map((item) => `
                      <tr>
                        <td>${escapeHtml(item.name || '-')}</td>
                        <td>${Number(item.quantity || 0)}</td>
                        <td>${currency(item.unitPrice || 0)}</td>
                        <td>${currency(item.total || 0)}</td>
                      </tr>
                    `).join('') || `
                      <tr>
                        <td colspan="4">Nenhum item registrado.</td>
                      </tr>
                    `
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#sale-details-close-btn')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#sale-details-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'sale-details-modal-backdrop') closeModal();
    });
  }

  function openEditSaleModal(saleId) {
    const sale = (state.sales || []).find((item) => item.id === saleId && item.deleted !== true);
    if (!sale) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    let editingItems = cloneSaleItems(sale.items || []);
    let productSearch = '';

    function recalcAndRender() {
      const subtotal = calcItemsSubtotal(editingItems);
      const discount = toNumber(modalRoot.querySelector('input[name="discount"]')?.value || sale.discount || 0);
      const total = Math.max(0, subtotal - discount);
      const amountPaid = toNumber(modalRoot.querySelector('input[name="amountPaid"]')?.value || sale.amountPaid || 0);
      const change = Math.max(0, amountPaid - total);

      const itemsHost = modalRoot.querySelector('#edit-sale-items-host');
      const totalsHost = modalRoot.querySelector('#edit-sale-totals');
      const resultsHost = modalRoot.querySelector('#edit-sale-product-results');

      if (itemsHost) {
        itemsHost.innerHTML = editingItems.length
          ? editingItems.map((item) => `
              <div class="sales-cart-item">
                <div class="sales-cart-top">
                  <div class="sales-cart-title">
                    <strong>${escapeHtml(item.name || '')}</strong>
                    <span>${currency(Number(item.unitPrice || 0))}</span>
                  </div>
                </div>
                <div class="sales-cart-bottom">
                  <div class="sales-cart-qty">
                    <button class="icon-action-btn" type="button" data-edit-sale-item-decrease="${item.productId}">−</button>
                    <strong>${Number(item.quantity || 0)}</strong>
                    <button class="icon-action-btn" type="button" data-edit-sale-item-increase="${item.productId}">+</button>
                  </div>
                  <div class="sales-cart-total">${currency(Number(item.unitPrice || 0) * Number(item.quantity || 0))}</div>
                  <button class="icon-action-btn" type="button" data-edit-sale-item-remove="${item.productId}">🗑️</button>
                </div>
              </div>
            `).join('')
          : `
              <div class="empty-state sales-empty-box">
                <strong>Nenhum item</strong>
                <span>Adicione produtos à venda.</span>
              </div>
            `;
      }

      if (totalsHost) {
        totalsHost.innerHTML = `
          <div class="summary-line"><span>Subtotal</span><strong>${currency(subtotal)}</strong></div>
          <div class="summary-line"><span>Desconto</span><strong>${currency(discount)}</strong></div>
          <div class="summary-line total"><span>Total</span><strong>${currency(total)}</strong></div>
          <div class="summary-line"><span>Troco</span><strong>${currency(change)}</strong></div>
        `;
      }

      if (resultsHost) {
        const term = String(productSearch || '').trim().toLowerCase();

        if (!term) {
          resultsHost.innerHTML = `
            <div class="empty-state sales-empty-box">
              <strong>Pesquise um produto</strong>
              <span>Digite nome ou código de barras para adicionar item.</span>
            </div>
          `;
        } else {
          const results = getActiveProducts()
            .filter((product) =>
              [product.name, product.barcode, product.brand, product.supplier]
                .join(' ')
                .toLowerCase()
                .includes(term)
            )
            .slice(0, 8);

          resultsHost.innerHTML =
            results.map((product) => `
              <div class="sales-product-result">
                <div class="sales-product-result-main">
                  <strong>${escapeHtml(product.name)}</strong>
                  <span>${escapeHtml(product.barcode || 'Sem código')}</span>
                </div>
                <div class="sales-product-result-meta">
                  <span>Estoque: ${product.quantity}</span>
                  <strong>${currency(product.salePrice || 0)}</strong>
                </div>
                <div class="sales-product-result-actions">
                  <button class="btn btn-secondary" type="button" data-edit-sale-add-product="${product.id}">
                    Adicionar
                  </button>
                </div>
              </div>
            `).join('') || `
              <div class="empty-state sales-empty-box">
                <strong>Nenhum produto encontrado</strong>
                <span>Refine sua pesquisa.</span>
              </div>
            `;
        }
      }

      modalRoot.querySelectorAll('[data-edit-sale-item-decrease]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const productId = btn.dataset.editSaleItemDecrease;
          const row = editingItems.find((item) => item.productId === productId);
          if (!row) return;

          row.quantity = Math.max(0, Number(row.quantity || 0) - 1);
          editingItems = editingItems.filter((item) => Number(item.quantity || 0) > 0);
          editingItems.forEach((item) => {
            item.total = Number(item.unitPrice || 0) * Number(item.quantity || 0);
          });
          recalcAndRender();
        });
      });

      modalRoot.querySelectorAll('[data-edit-sale-item-increase]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const productId = btn.dataset.editSaleItemIncrease;
          const row = editingItems.find((item) => item.productId === productId);
          const product = getProductById(productId);
          if (!row || !product) return;

          const originalQty = Number(
            (sale.items || []).find((item) => item.productId === productId)?.quantity || 0
          );
          const currentEditedQty = Number(row.quantity || 0);
          const extraNeeded = currentEditedQty + 1 - originalQty;
          const availableNow = Number(product.quantity || 0);

          if (extraNeeded > availableNow) {
            showToast('Estoque insuficiente para aumentar este item.', 'error');
            return;
          }

          row.quantity += 1;
          row.total = Number(row.unitPrice || 0) * Number(row.quantity || 0);
          recalcAndRender();
        });
      });

      modalRoot.querySelectorAll('[data-edit-sale-item-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const productId = btn.dataset.editSaleItemRemove;
          editingItems = editingItems.filter((item) => item.productId !== productId);
          recalcAndRender();
        });
      });

      modalRoot.querySelectorAll('[data-edit-sale-add-product]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const productId = btn.dataset.editSaleAddProduct;
          const product = getProductById(productId);
          if (!product) return;

          const existing = editingItems.find((item) => item.productId === productId);
          const originalQty = Number(
            (sale.items || []).find((item) => item.productId === productId)?.quantity || 0
          );
          const currentEditedQty = Number(existing?.quantity || 0);
          const extraNeeded = currentEditedQty + 1 - originalQty;
          const availableNow = Number(product.quantity || 0);

          if (extraNeeded > availableNow) {
            showToast('Estoque insuficiente para adicionar este item.', 'error');
            return;
          }

          if (existing) {
            existing.quantity += 1;
            existing.total = Number(existing.unitPrice || 0) * Number(existing.quantity || 0);
          } else {
            editingItems.push({
              productId: product.id,
              name: product.name,
              quantity: 1,
              unitPrice: Number(product.salePrice || 0),
              total: Number(product.salePrice || 0)
            });
          }

          recalcAndRender();
        });
      });
    }

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="edit-sale-modal-backdrop">
        <div class="modal-card" style="max-width:980px;">
          <div class="section-header">
            <h2>Editar venda</h2>
            <button class="btn btn-secondary" type="button" id="edit-sale-close-btn">Fechar</button>
          </div>

          <form id="edit-sale-form" class="form-grid">
            <label style="grid-column:1 / -1;">
              Cliente
              <input name="customerName" type="text" value="${escapeHtml(sale.customerName || '')}" />
            </label>

            <label style="grid-column:1 / -1;">
              CPF
              <input name="customerCpf" type="text" value="${escapeHtml(sale.customerCpf || '')}" />
            </label>

            <label>
              Forma de pagamento
              <select name="paymentMethod">
                ${paymentMethods.map((method) => `
                  <option value="${escapeHtml(method)}" ${sale.paymentMethod === method ? 'selected' : ''}>
                    ${escapeHtml(method)}
                  </option>
                `).join('')}
              </select>
            </label>

            <label>
              Desconto
              <input name="discount" type="number" min="0" step="0.01" value="${Number(sale.discount || 0)}" />
            </label>

            <label>
              Valor pago
              <input name="amountPaid" type="number" min="0" step="0.01" value="${Number(sale.amountPaid || 0)}" />
            </label>

            <label style="grid-column:1 / -1;">
              Observações
              <textarea name="notes">${escapeHtml(sale.notes || '')}</textarea>
            </label>

            <div style="grid-column:1 / -1;" class="sale-modal-section">
              <strong class="sale-modal-section-title">Itens da venda</strong>
              <div id="edit-sale-items-host" class="sale-items-box card-scroll-y"></div>
            </div>

            <label style="grid-column:1 / -1;">
              Pesquisar produto para adicionar
              <input id="edit-sale-product-search" type="text" placeholder="Digite nome ou código de barras" />
            </label>

            <div id="edit-sale-product-results" style="grid-column:1 / -1;" class="sale-edit-products-box"></div>

            <div id="edit-sale-totals" class="summary-box" style="grid-column:1 / -1;"></div>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Salvar alterações</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#edit-sale-close-btn')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#edit-sale-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'edit-sale-modal-backdrop') closeModal();
    });

    modalRoot.querySelector('#edit-sale-product-search')?.addEventListener('input', (event) => {
      productSearch = event.currentTarget.value || '';
      recalcAndRender();
    });

    modalRoot.querySelector('input[name="discount"]')?.addEventListener('input', recalcAndRender);
    modalRoot.querySelector('input[name="amountPaid"]')?.addEventListener('input', recalcAndRender);

    modalRoot.querySelector('#edit-sale-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());

      const subtotal = calcItemsSubtotal(editingItems);
      const discount = toNumber(values.discount || 0);
      const total = Math.max(0, subtotal - discount);
      const amountPaid = toNumber(values.amountPaid || 0);
      const change = Math.max(0, amountPaid - total);

      if (!editingItems.length) {
        alert('A venda precisa ter pelo menos 1 item.');
        return;
      }

      if (amountPaid < total) {
        alert('O valor pago é menor que o total da venda.');
        return;
      }

      const newItems = editingItems.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        total: Number(item.unitPrice || 0) * Number(item.quantity || 0)
      }));

      try {
        await applySaleItemsStockDiff(sale.items || [], newItems);

        const currentUser = getCurrentUserMeta();

        await updateByPath('sales', sale.id, {
          customerName: String(values.customerName || '').trim() || 'Não identificado',
          customerCpf: String(values.customerCpf || '').trim(),
          paymentMethod: String(values.paymentMethod || 'Dinheiro'),
          discount,
          subtotal,
          total,
          amountPaid,
          change,
          notes: String(values.notes || ''),
          items: newItems,
          editedAt: new Date().toISOString(),
          editedBy: currentUser.uid || currentUser.name || '',
          version: getSaleVersion(sale) + 1
        });

        showToast('Venda atualizada com sucesso.', 'success');
        closeModal();
      } catch (error) {
        alert(error.message || 'Não foi possível atualizar a venda.');
      }
    });

    recalcAndRender();
  }

  async function restoreSaleItemsToStock(sale) {
    const items = Array.isArray(sale.items) ? sale.items : [];

    for (const item of items) {
      const product = getProductById(item.productId);
      if (!product) continue;

      await updateByPath('products', item.productId, {
        quantity: Number(product.quantity || 0) + Number(item.quantity || 0)
      });
    }
  }

  function openDeleteSaleModal(saleId) {
    const sale = (state.sales || []).find((item) => item.id === saleId && item.deleted !== true);
    if (!sale) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="delete-sale-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Excluir venda</h2>
            <button class="btn btn-secondary" type="button" id="delete-sale-close-btn">Fechar</button>
          </div>

          <div class="sale-delete-warning">
            <strong>Atenção</strong>
            <span>Ao excluir esta venda, o estoque dos produtos será devolvido automaticamente.</span>
          </div>

          <form id="delete-sale-form" class="form-grid" style="margin-top:16px;">
            <label style="grid-column:1 / -1;">
              Motivo da exclusão
              <textarea name="deleteReason" rows="4" placeholder="Informe o motivo" required></textarea>
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-danger" type="submit">Excluir venda</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#delete-sale-close-btn')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#delete-sale-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'delete-sale-modal-backdrop') closeModal();
    });

    modalRoot.querySelector('#delete-sale-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());
      const deleteReason = String(values.deleteReason || '').trim();

      if (!deleteReason) {
        alert('Informe o motivo da exclusão.');
        return;
      }

      const currentUser = getCurrentUserMeta();

      await restoreSaleItemsToStock(sale);

      await updateByPath('sales', sale.id, {
        deleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: currentUser.uid || currentUser.name || '',
        deleteReason
      });

      showToast('Venda excluída e estoque devolvido.', 'success');
      closeModal();
    });
  }

  function renderHistory() {
    const historyEl = tabEls.sales.querySelector('#sales-history-table');
    const mobileListEl = tabEls.sales.querySelector('#sales-history-mobile-list');

    if (!historyEl && !mobileListEl) return;

    const rows = (state.sales || []).filter((sale) => {
      if (sale.deleted === true) return false;

      const customer = String(sale.customerName || '').toLowerCase();
      const paymentMethod = String(sale.paymentMethod || '');
      const created = sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt || 0);
      const createdKey = Number.isNaN(created.getTime())
        ? ''
        : `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;

      return (!saleFilters.customer || customer.includes(saleFilters.customer.toLowerCase()))
        && (!saleFilters.paymentMethod || paymentMethod === saleFilters.paymentMethod)
        && (!saleFilters.dateFrom || !createdKey || createdKey >= saleFilters.dateFrom)
        && (!saleFilters.dateTo || !createdKey || createdKey <= saleFilters.dateTo);
    });

    if (historyEl) {
      historyEl.innerHTML = rows.map((sale) => `
        <tr class="sales-history-row">
          <td class="sales-history-date">${escapeHtml(formatDateTime(sale.createdAt))}</td>
          <td>
            <div class="sales-history-customer">
              <strong>${escapeHtml(sale.customerName || 'Não identificado')}</strong>
              <span>${escapeHtml(sale.customerCpf || 'Sem CPF')}</span>
            </div>
          </td>
          <td class="sales-history-payment">${escapeHtml(sale.paymentMethod || '-')}</td>
          <td class="sales-history-total">${currency(sale.total || 0)}</td>
          <td>${Array.isArray(sale.items) ? sale.items.length : 0}</td>
          <td>
            <div class="sales-history-actions">
              <button class="icon-action-btn" type="button" data-view-sale="${sale.id}" aria-label="Ver">👁️</button>
              <button class="icon-action-btn" type="button" data-print-sale="${sale.id}" aria-label="Imprimir">🖨️</button>
              <button class="icon-action-btn" type="button" data-edit-sale="${sale.id}" aria-label="Editar">✏️</button>
              <button class="icon-action-btn" type="button" data-delete-sale="${sale.id}" aria-label="Excluir">🗑️</button>
            </div>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="6">Nenhuma venda encontrada.</td></tr>';
    }

    if (mobileListEl) {
      mobileListEl.innerHTML = rows.map((sale) => `
        <div class="sales-history-sale-card">
          <div class="sale-card-title">
            ${escapeHtml(sale.customerName || 'Não identificado')}
          </div>

          <div class="sale-card-meta">
            <div><strong>CPF:</strong> ${escapeHtml(sale.customerCpf || 'Sem CPF')}</div>
            <div><strong>Data:</strong> ${escapeHtml(formatDateTime(sale.createdAt))}</div>
            <div><strong>Pagamento:</strong> ${escapeHtml(sale.paymentMethod || '-')}</div>
            <div><strong>Itens:</strong> ${Array.isArray(sale.items) ? sale.items.length : 0}</div>
            <div><strong>Total:</strong> ${currency(sale.total || 0)}</div>
            <div><span class="sale-status-badge">Venda registrada</span></div>
          </div>

          <div class="sale-card-actions">
            <button class="btn btn-secondary" type="button" data-view-sale="${sale.id}">Ver</button>
            <button class="btn btn-secondary" type="button" data-print-sale="${sale.id}">Imprimir</button>
            <button class="btn btn-secondary" type="button" data-edit-sale="${sale.id}">Editar</button>
            <button class="btn btn-secondary" type="button" data-delete-sale="${sale.id}">Excluir</button>
          </div>
        </div>
      `).join('') || `
        <div class="empty-state sales-empty-box">
          <strong>Nenhuma venda encontrada</strong>
          <span>Ajuste os filtros para localizar registros.</span>
        </div>
      `;
    }

    tabEls.sales.querySelectorAll('[data-view-sale]').forEach((btn) => {
      btn.addEventListener('click', () => openSaleDetailsModal(btn.dataset.viewSale));
    });

    tabEls.sales.querySelectorAll('[data-print-sale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sale = (state.sales || []).find((item) => item.id === btn.dataset.printSale);
        if (!sale) return;
        printModule.printSaleReceipt(normalizeSaleForPrint(sale));
      });
    });

    tabEls.sales.querySelectorAll('[data-edit-sale]').forEach((btn) => {
      btn.addEventListener('click', () => openEditSaleModal(btn.dataset.editSale));
    });

    tabEls.sales.querySelectorAll('[data-delete-sale]').forEach((btn) => {
      btn.addEventListener('click', () => openDeleteSaleModal(btn.dataset.deleteSale));
    });
  }

  function bindCpfToggle() {
    const checkbox = tabEls.sales.querySelector('#sale-include-cpf');
    const wrap = tabEls.sales.querySelector('#sale-cpf-wrap');
    const input = tabEls.sales.querySelector('#sale-customer-cpf');

    if (!checkbox || !wrap || !input) return;

    const sync = () => {
      saleFormState.includeCpf = Boolean(checkbox.checked);
      wrap.style.display = saleFormState.includeCpf ? '' : 'none';

      if (saleFormState.includeCpf && !String(input.value || '').trim()) {
        input.value = getSelectedClientCpf();
      }

      if (!saleFormState.includeCpf) {
        input.value = '';
      }

      saleFormState.customerCpf = input.value || '';
    };

    checkbox.addEventListener('change', sync);
    sync();
  }

  async function finishSale() {
    if (isFinishingSale) return;
    isFinishingSale = true;

    try {
      syncSaleFormStateFromDom();

      if (!(state.cart || []).length) {
        alert('Adicione pelo menos um produto à venda.');
        return;
      }

      const selectedClientName = String(state.selectedSaleClient?.name || '').trim();
      const selectedClientCpf = getSelectedClientCpf();

      const typedCustomerName = String(saleFormState.customerName || '').trim();
      const typedCustomerCpf = String(saleFormState.customerCpf || '').trim();

      const customerName = typedCustomerName || selectedClientName || 'Não identificado';
      const customerCpf = saleFormState.includeCpf ? (typedCustomerCpf || selectedClientCpf) : '';

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
        paymentMethod: saleFormState.paymentMethod || 'Dinheiro',
        subtotal,
        discount,
        total,
        amountPaid,
        change,
        notes: saleFormState.notes || '',
        items,
        cashierName: state.currentUser?.fullName || '',
        deleted: false,
        version: 1
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

      saleFormState = {
        customerName: '',
        includeCpf: false,
        customerCpf: '',
        paymentMethod: paymentMethods?.[0] || 'Dinheiro',
        discount: '0',
        amountPaid: '0',
        notes: ''
      };

      const searchInput = tabEls.sales.querySelector('#sale-product-search');
      if (searchInput) searchInput.value = '';

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
        saleFormState.customerName = client?.name || saleFormState.customerName || '';

        if (saleFormState.includeCpf) {
          saleFormState.customerCpf = String(client?.cpf || client?.document || '').trim();
        }

        const input = tabEls.sales.querySelector('#sale-customer-name');
        const cpfInput = tabEls.sales.querySelector('#sale-customer-cpf');
        const cpfCheck = tabEls.sales.querySelector('#sale-include-cpf');

        if (input) input.value = saleFormState.customerName;

        if (cpfCheck?.checked && cpfInput) {
          cpfInput.value = String(client?.cpf || client?.document || '').trim();
        }

        closeModal();
      }
    });
  }

  function render() {
    if (loadSalesFocusMode()) {
      document.body.classList.add('sales-focus-mode');
    }

    const { subtotal, discount, total, change, amountPaid } = calculateCartTotal();
    const selectedClientLabel = getSelectedClientLabel();

    tabEls.sales.innerHTML = `
      <div class="section-stack sales-page ${isSalesFocusMode() ? 'sales-page-focus' : ''}">
        <div class="sales-top-layout">
          <div class="sales-main-panel">
            <div class="sales-panel-header">
              <div>
                <h2>Nova venda</h2>
                <span>Pesquise por nome ou código de barras</span>
              </div>

              <div class="form-actions">
                <button
                  class="btn btn-secondary"
                  type="button"
                  id="toggle-sales-focus-btn"
                >
                  ${isSalesFocusMode() ? 'Sair da tela cheia' : 'Expandir venda'}
                </button>
              </div>
            </div>

            ${isSalesFocusMode() ? `
              <div class="sales-focus-banner">
                <strong>Modo foco ativo</strong>
                <span>Histórico oculto para operação rápida de vendas.</span>
              </div>
            ` : ''}

            <div class="sales-search-box">
              <input
                id="sale-product-search"
                type="text"
                placeholder="Digite nome do produto ou código de barras"
                autocomplete="off"
                value="${escapeHtml(searchTerm)}"
              />
            </div>

            <div class="sales-client-box">
              <div class="sales-client-box-header">
                <strong>Cliente</strong>
                <div class="form-actions">
                  <button class="btn btn-secondary" type="button" id="sale-select-client-btn">Selecionar cliente</button>
                  <button class="btn btn-secondary" type="button" id="sale-set-final-consumer-btn">Consumidor final</button>
                  <button class="btn btn-secondary" type="button" id="sale-clear-client-btn">Limpar cliente</button>
                </div>
              </div>

              <div class="sales-selected-client-box">
                <strong>${escapeHtml(selectedClientLabel.name)}</strong>
                <span>${escapeHtml(selectedClientLabel.cpf)}</span>
              </div>

              <div class="form-grid">
                <label style="grid-column:1 / -1;">
                  Nome do cliente
                  <input id="sale-customer-name" type="text" value="${escapeHtml(saleFormState.customerName)}" placeholder="Deixe em branco para não identificado" />
                </label>

                <label style="grid-column:1 / -1;" class="sales-inline-check">
                  <input id="sale-include-cpf" type="checkbox" style="width:auto;" ${saleFormState.includeCpf ? 'checked' : ''} />
                  <span>Inserir CPF no cupom</span>
                </label>

                <label id="sale-cpf-wrap" style="grid-column:1 / -1; display:none;">
                  CPF
                  <input id="sale-customer-cpf" type="text" value="${escapeHtml(saleFormState.customerCpf)}" placeholder="Digite o CPF do cliente" />
                </label>
              </div>
            </div>

            <div class="sales-results-panel">
              <div class="sales-section-title">Resultados da pesquisa</div>
              <div id="sale-search-results" class="panel-scroll"></div>
            </div>
          </div>

          <div class="sales-summary-panel">
            <div class="sales-panel-header">
              <div>
                <h2>Carrinho</h2>
                <span><span id="sale-items-count">${state.cart.length}</span> item(ns)</span>
              </div>
            </div>

            <div id="sale-cart-items" class="card-scroll-y sales-cart-list"></div>

            <div class="sales-payment-box">
              <div class="sales-section-title">Pagamento</div>

              <div class="form-grid">
                <label>
                  Forma de pagamento
                  <select id="sale-payment-method">
                    ${paymentMethods.map((method) => `<option value="${escapeHtml(method)}" ${saleFormState.paymentMethod === method ? 'selected' : ''}>${escapeHtml(method)}</option>`).join('')}
                  </select>
                </label>

                <label>
                  Desconto
                  <input name="discount" type="number" step="0.01" min="0" value="${escapeHtml(String(saleFormState.discount))}" />
                </label>

                <label>
                  Valor pago
                  <input name="amountPaid" type="number" step="0.01" min="0" value="${escapeHtml(String(saleFormState.amountPaid))}" />
                </label>

                <label style="grid-column:1 / -1;">
                  Observações
                  <textarea name="notes">${escapeHtml(saleFormState.notes)}</textarea>
                </label>
              </div>
            </div>

            <div class="sales-total-box">
              <div class="sales-total-line"><span>Subtotal</span><strong id="sale-subtotal">${currency(subtotal)}</strong></div>
              <div class="sales-total-line"><span>Desconto</span><strong id="sale-discount-view">${currency(discount)}</strong></div>
              <div class="sales-total-line"><span>Valor pago</span><strong id="sale-paid-view">${currency(amountPaid)}</strong></div>
              <div class="sales-total-line sales-total-highlight"><span>Total</span><strong id="sale-total">${currency(total)}</strong></div>
              <div class="sales-total-line"><span>Troco</span><strong id="sale-change" class="sales-change-strong">${currency(change)}</strong></div>
            </div>

            <div class="form-actions sales-final-actions">
              <button class="btn btn-primary" type="button" id="finish-sale-btn">Finalizar venda</button>
              <button class="btn btn-secondary" type="button" id="clear-cart-btn">Limpar carrinho</button>
            </div>
          </div>
        </div>

        <div class="table-card sales-history-card sales-history-focus-target">
          <div class="section-header">
            <h2>Histórico de vendas</h2>
          </div>

          <div class="search-row sales-history-filters" style="margin-bottom:14px;">
            <input id="sales-filter-customer" placeholder="Cliente" value="${escapeHtml(saleFilters.customer)}" />
            <select id="sales-filter-payment">
              <option value="">Todas as formas</option>
              ${paymentMethods.map((method) => `<option value="${escapeHtml(method)}" ${saleFilters.paymentMethod === method ? 'selected' : ''}>${escapeHtml(method)}</option>`).join('')}
            </select>
            <input id="sales-filter-date-from" type="date" value="${saleFilters.dateFrom}" />
            <input id="sales-filter-date-to" type="date" value="${saleFilters.dateTo}" />
            <button class="btn btn-secondary" type="button" id="sales-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="sales-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap scroll-dual sales-history-table-wrap">
            <table>
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

          <div id="sales-history-mobile-list" class="sales-history-mobile-list"></div>
        </div>
      </div>
    `;

    const searchInput = tabEls.sales.querySelector('#sale-product-search');

    searchInput?.addEventListener('input', (event) => {
      searchTerm = event.currentTarget.value || '';
      renderSearchResults();
    });

    searchInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;

      event.preventDefault();

      const rawValue = event.currentTarget.value || '';
      const trimmed = String(rawValue).trim();
      if (!trimmed) return;

      if (tryAddProductByBarcode(trimmed, false)) {
        return;
      }

      const results = getSearchResults(trimmed);
      if (results.length) {
        addProductToCart(results[0].id);
        event.currentTarget.value = '';
        searchTerm = '';
        renderSearchResults();
        focusSearchInput();
        return;
      }

      showToast('Produto não encontrado.', 'error');
    });

    const customerNameInput = tabEls.sales.querySelector('#sale-customer-name');
    const includeCpfInput = tabEls.sales.querySelector('#sale-include-cpf');
    const customerCpfInput = tabEls.sales.querySelector('#sale-customer-cpf');
    const paymentMethodInput = tabEls.sales.querySelector('#sale-payment-method');
    const discountInput = tabEls.sales.querySelector('input[name="discount"]');
    const amountPaidInput = tabEls.sales.querySelector('input[name="amountPaid"]');
    const notesInput = tabEls.sales.querySelector('textarea[name="notes"]');

    customerNameInput?.addEventListener('input', (event) => {
      saleFormState.customerName = event.currentTarget.value || '';
    });

    includeCpfInput?.addEventListener('change', () => {
      saleFormState.includeCpf = Boolean(includeCpfInput.checked);
    });

    customerCpfInput?.addEventListener('input', (event) => {
      saleFormState.customerCpf = event.currentTarget.value || '';
    });

    paymentMethodInput?.addEventListener('change', (event) => {
      saleFormState.paymentMethod = event.currentTarget.value || (paymentMethods?.[0] || 'Dinheiro');
      updateSaleSummary();
    });

    discountInput?.addEventListener('input', (event) => {
      saleFormState.discount = event.currentTarget.value || '0';
      updateSaleSummary();
    });

    amountPaidInput?.addEventListener('input', (event) => {
      saleFormState.amountPaid = event.currentTarget.value || '0';
      updateSaleSummary();
    });

    notesInput?.addEventListener('input', (event) => {
      saleFormState.notes = event.currentTarget.value || '';
    });

    bindAsyncButton(tabEls.sales.querySelector('#sale-select-client-btn'), async () => {
      openClientPicker();
    }, { busyLabel: 'Abrindo...' });

    bindAsyncButton(tabEls.sales.querySelector('#sale-set-final-consumer-btn'), async () => {
      state.selectedSaleClient = null;
      saleFormState.customerName = 'Consumidor final';
      saleFormState.includeCpf = false;
      saleFormState.customerCpf = '';
      render();
    }, { busyLabel: 'Aplicando...' });

    bindAsyncButton(tabEls.sales.querySelector('#sale-clear-client-btn'), async () => {
      state.selectedSaleClient = null;
      saleFormState.customerName = '';
      saleFormState.includeCpf = false;
      saleFormState.customerCpf = '';

      const clientInput = tabEls.sales.querySelector('#sale-customer-name');
      const cpfCheck = tabEls.sales.querySelector('#sale-include-cpf');
      const cpfInput = tabEls.sales.querySelector('#sale-customer-cpf');

      if (clientInput) clientInput.value = '';
      if (cpfCheck) cpfCheck.checked = false;
      if (cpfInput) cpfInput.value = '';

      bindCpfToggle();
      showToast('Cliente limpo.', 'info');
    }, { busyLabel: 'Limpando...' });

    bindAsyncButton(tabEls.sales.querySelector('#finish-sale-btn'), async () => {
      await finishSale();
    }, { busyLabel: 'Finalizando...' });

    bindAsyncButton(tabEls.sales.querySelector('#clear-cart-btn'), async () => {
      clearCartWithFeedback();
    }, { busyLabel: 'Limpando...' });

    bindAsyncButton(
      tabEls.sales.querySelector('#toggle-sales-focus-btn'),
      async () => {
        await toggleSalesFocusMode();
      },
      {
        busyLabel: isSalesFocusMode() ? 'Saindo...' : 'Abrindo...'
      }
    );

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
    bindSalesFocusFullscreenSync();

    if (loadSalesFocusMode() && !isSalesFocusMode()) {
      setSalesFocusMode(true);
    }
  }

  return {
    render
  };
}
