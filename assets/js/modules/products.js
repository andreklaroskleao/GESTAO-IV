import { escapeHtml, renderBlocked, showToast, bindSubmitGuard, bindAsyncButton } from './ui.js';

export function createProductsModule(ctx) {
  const {
    state,
    tabEls,
    refs,
    createDoc,
    updateByPath,
    currency,
    toNumber,
    inventoryModule,
    auditModule
  } = ctx;

  let productFilters = {
    query: '',
    category: '',
    supplier: '',
    status: '',
    stockView: ''
  };

  function getRows() {
    return (state.products || []).filter((item) => item.deleted !== true);
  }

  function getCategories() {
    return [...new Set(
      getRows()
        .map((item) => String(item.category || '').trim())
        .filter(Boolean)
    )].sort();
  }

  function getSuppliers() {
    return [...new Set(
      getRows()
        .map((item) => String(item.supplier || '').trim())
        .filter(Boolean)
    )].sort();
  }

  function getLowStockThreshold() {
    return Number(state.settings?.lowStockThreshold || 5);
  }

  function getStockBadge(product) {
    const quantity = Number(product.quantity || 0);
    const threshold = getLowStockThreshold();

    if (quantity <= 0) {
      return { label: 'Sem estoque', className: 'badge-danger' };
    }

    if (quantity <= threshold) {
      return { label: 'Estoque baixo', className: 'badge-warning' };
    }

    return { label: 'Normal', className: 'badge-success' };
  }

  function getFilteredRows() {
    const q = String(productFilters.query || '').trim().toLowerCase();

    return getRows().filter((item) => {
      const haystack = [
        item.name,
        item.barcode,
        item.brand,
        item.category,
        item.supplier,
        item.description
      ].join(' ').toLowerCase();

      const quantity = Number(item.quantity || 0);
      const threshold = getLowStockThreshold();

      let stockMatch = true;
      if (productFilters.stockView === 'out') stockMatch = quantity <= 0;
      if (productFilters.stockView === 'low') stockMatch = quantity > 0 && quantity <= threshold;
      if (productFilters.stockView === 'normal') stockMatch = quantity > threshold;

      return (
        (!q || haystack.includes(q)) &&
        (!productFilters.category || String(item.category || '') === productFilters.category) &&
        (!productFilters.supplier || String(item.supplier || '') === productFilters.supplier) &&
        (!productFilters.status || String(item.status || '') === productFilters.status) &&
        stockMatch
      );
    });
  }

  function getEditingProduct() {
    return getRows().find((item) => item.id === state.editingProductId) || null;
  }

  function fillProductForm(form, row) {
    if (!form) return;

    form.elements.name.value = row?.name || '';
    form.elements.barcode.value = row?.barcode || '';
    form.elements.brand.value = row?.brand || '';
    form.elements.category.value = row?.category || '';
    form.elements.supplier.value = row?.supplier || '';
    form.elements.costPrice.value = row?.costPrice ?? '';
    form.elements.salePrice.value = row?.salePrice ?? '';
    form.elements.quantity.value = row?.quantity ?? 0;
    form.elements.status.value = row?.status || 'ativo';
    form.elements.description.value = row?.description || '';
  }

  function hasDuplicateBarcode(barcode, ignoreId = '') {
    const normalized = String(barcode || '').trim();
    if (!normalized) return false;

    return getRows().some((item) => {
      return String(item.id || '') !== String(ignoreId || '') &&
        String(item.barcode || '').trim() === normalized;
    });
  }

  async function saveProduct() {
    const form = document.querySelector('#product-form');
    if (!form) return;

    const payload = Object.fromEntries(new FormData(form).entries());

    payload.costPrice = toNumber(payload.costPrice);
    payload.salePrice = toNumber(payload.salePrice);
    payload.quantity = Math.max(0, Number(payload.quantity || 0));
    payload.deleted = false;

    if (!String(payload.name || '').trim()) {
      alert('Informe o nome do produto.');
      return;
    }

    if (payload.salePrice < 0 || payload.costPrice < 0) {
      alert('Os preços não podem ser negativos.');
      return;
    }

    if (hasDuplicateBarcode(payload.barcode, state.editingProductId)) {
      alert('Já existe um produto com este código de barras.');
      return;
    }

    if (state.editingProductId) {
      const current = getEditingProduct();
      const previousQuantity = Number(current?.quantity || 0);
      const nextQuantity = Number(payload.quantity || 0);

      await updateByPath('products', state.editingProductId, payload);

      await auditModule.log({
        module: 'products',
        action: 'update',
        entityType: 'product',
        entityId: state.editingProductId,
        entityLabel: payload.name || '',
        description: 'Produto atualizado.'
      });

      if (previousQuantity !== nextQuantity) {
        const actorId = String(state.currentUser?.uid || state.currentUser?.fullName || '');

        await createDoc(refs.inventoryMovements, {
          productId: state.editingProductId,
          productName: payload.name || '',
          productBarcode: payload.barcode || '',
          type: 'ajuste',
          quantity: nextQuantity,
          previousQuantity,
          newQuantity: nextQuantity,
          quantityDelta: nextQuantity - previousQuantity,
          reason: 'Alteração direta no cadastro do produto',
          notes: 'Ajuste automático por edição de produto',
          sourceType: 'product_edit_form',
          sourceId: state.editingProductId,
          userId: actorId,
          userName: String(state.currentUser?.fullName || ''),
          userEmail: String(state.currentUser?.email || ''),
          deleted: false,
          createdAt: new Date()
        });

        await updateByPath('products', state.editingProductId, {
          lastStockAdjustmentAt: new Date().toISOString(),
          lastStockAdjustmentBy: actorId,
          lastStockAdjustmentReason: 'Alteração direta no cadastro do produto'
        });
      }

      state.editingProductId = null;
      showToast('Produto atualizado com sucesso.', 'success');
    } else {
      const createdId = await createDoc(refs.products, payload);

      await auditModule.log({
        module: 'products',
        action: 'create',
        entityType: 'product',
        entityId: createdId,
        entityLabel: payload.name || '',
        description: 'Produto cadastrado.'
      });

      if (Number(payload.quantity || 0) > 0) {
        const actorId = String(state.currentUser?.uid || state.currentUser?.fullName || '');

        await createDoc(refs.inventoryMovements, {
          productId: createdId,
          productName: payload.name || '',
          productBarcode: payload.barcode || '',
          type: 'entrada',
          quantity: Number(payload.quantity || 0),
          previousQuantity: 0,
          newQuantity: Number(payload.quantity || 0),
          quantityDelta: Number(payload.quantity || 0),
          reason: 'Estoque inicial do cadastro',
          notes: 'Movimentação automática de criação do produto',
          sourceType: 'product_create_form',
          sourceId: createdId,
          userId: actorId,
          userName: String(state.currentUser?.fullName || ''),
          userEmail: String(state.currentUser?.email || ''),
          deleted: false,
          createdAt: new Date()
        });

        await updateByPath('products', createdId, {
          lastStockAdjustmentAt: new Date().toISOString(),
          lastStockAdjustmentBy: actorId,
          lastStockAdjustmentReason: 'Estoque inicial do cadastro'
        });
      }

      showToast('Produto cadastrado com sucesso.', 'success');
    }

    render();
  }

  function openProductFormModal(productId = null) {
    state.editingProductId = productId;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="product-form-modal-backdrop">
        <div class="modal-card" style="max-width:880px;">
          <div class="section-header">
            <h2>${state.editingProductId ? 'Editar produto' : 'Novo produto'}</h2>
            <button class="btn btn-secondary" type="button" id="product-form-close-btn">Fechar</button>
          </div>

          <form id="product-form" class="form-grid">
            <label>
              Nome
              <input name="name" required />
            </label>

            <label>
              Código de barras
              <input name="barcode" />
            </label>

            <label>
              Marca
              <input name="brand" />
            </label>

            <label>
              Categoria
              <input name="category" list="product-category-list" />
              <datalist id="product-category-list">
                ${getCategories().map((item) => `<option value="${escapeHtml(item)}"></option>`).join('')}
              </datalist>
            </label>

            <label>
              Fornecedor
              <input name="supplier" list="product-supplier-list" />
              <datalist id="product-supplier-list">
                ${getSuppliers().map((item) => `<option value="${escapeHtml(item)}"></option>`).join('')}
              </datalist>
            </label>

            <label>
              Preço de custo
              <input name="costPrice" type="number" min="0" step="0.01" />
            </label>

            <label>
              Preço de venda
              <input name="salePrice" type="number" min="0" step="0.01" required />
            </label>

            <label>
              Quantidade
              <input name="quantity" type="number" min="0" step="1" required />
            </label>

            <label>
              Status
              <select name="status">
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>

            <label style="grid-column:1 / -1;">
              Descrição
              <textarea name="description" rows="4"></textarea>
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">
                ${state.editingProductId ? 'Salvar alterações' : 'Cadastrar produto'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
      state.editingProductId = null;
    };

    modalRoot.querySelector('#product-form-close-btn')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#product-form-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'product-form-modal-backdrop') closeModal();
    });

    const form = modalRoot.querySelector('#product-form');
    fillProductForm(form, getEditingProduct());

    bindSubmitGuard(form, async () => {
      await saveProduct();
      closeModal();
    }, { busyLabel: 'Salvando...' });
  }

  function openProductMovementsModal(productId) {
    const product = getRows().find((item) => item.id === productId);
    if (!product) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    const rows = inventoryModule.getFilteredMovements({})
      .filter((item) => String(item.productId || '') === String(productId));

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="product-movements-modal-backdrop">
        <div class="modal-card" style="max-width:1100px;">
          <div class="section-header">
            <h2>Movimentações do produto</h2>
            <button class="btn btn-secondary" type="button" id="product-movements-close-btn">Fechar</button>
          </div>

          <div class="empty-state" style="text-align:left; margin-bottom:16px;">
            <strong>${escapeHtml(product.name || '-')}</strong>
            <span>Código: ${escapeHtml(product.barcode || 'Sem código')}</span>
            <span>Estoque atual: ${escapeHtml(String(product.quantity ?? 0))}</span>
            <span>Último ajuste: ${escapeHtml(product.lastStockAdjustmentReason || '-')}</span>
          </div>

          <div class="table-wrap scroll-dual">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Qtd</th>
                  <th>Anterior</th>
                  <th>Novo</th>
                  <th>Motivo</th>
                  <th>Usuário</th>
                </tr>
              </thead>
              <tbody>
                ${
                  rows.map((item) => `
                    <tr>
                      <td>${escapeHtml(item.createdAt ? new Date(item.createdAt?.seconds ? item.createdAt.seconds * 1000 : item.createdAt).toLocaleString('pt-BR') : '-')}</td>
                      <td>${escapeHtml(item.type || '-')}</td>
                      <td>${escapeHtml(String(item.quantity ?? '-'))}</td>
                      <td>${escapeHtml(String(item.previousQuantity ?? '-'))}</td>
                      <td>${escapeHtml(String(item.newQuantity ?? '-'))}</td>
                      <td>${escapeHtml(item.reason || '-')}</td>
                      <td>${escapeHtml(item.userName || '-')}</td>
                    </tr>
                  `).join('') || `
                    <tr>
                      <td colspan="7">Nenhuma movimentação encontrada para este produto.</td>
                    </tr>
                  `
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#product-movements-close-btn')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#product-movements-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'product-movements-modal-backdrop') closeModal();
    });
  }

  function openDeleteProductModal(productId) {
    const product = getRows().find((item) => item.id === productId);
    if (!product) return;

    window.openConfirmDeleteModal?.({
      title: 'Excluir produto',
      message: `Deseja realmente excluir "${product.name || 'produto'}"?`,
      confirmLabel: 'Excluir produto',
      onConfirm: async () => {
        await updateByPath('products', product.id, {
          deleted: true,
          status: 'inativo'
        });

        await auditModule.log({
          module: 'products',
          action: 'delete',
          entityType: 'product',
          entityId: product.id,
          entityLabel: product.name || '',
          description: 'Produto excluído logicamente.'
        });

        showToast('Produto excluído com sucesso.', 'success');
      }
    });
  }

  function bindEvents() {
    bindAsyncButton(
      tabEls.products.querySelector('#open-product-form-btn'),
      async () => openProductFormModal(null),
      { busyLabel: 'Abrindo...' }
    );

    tabEls.products.querySelector('#product-filter-apply')?.addEventListener('click', () => {
      productFilters.query = tabEls.products.querySelector('#product-filter-query')?.value || '';
      productFilters.category = tabEls.products.querySelector('#product-filter-category')?.value || '';
      productFilters.supplier = tabEls.products.querySelector('#product-filter-supplier')?.value || '';
      productFilters.status = tabEls.products.querySelector('#product-filter-status')?.value || '';
      productFilters.stockView = tabEls.products.querySelector('#product-filter-stock')?.value || '';
      render();
    });

    bindAsyncButton(
      tabEls.products.querySelector('#product-filter-clear'),
      async () => {
        productFilters = {
          query: '',
          category: '',
          supplier: '',
          status: '',
          stockView: ''
        };
        render();
      },
      { busyLabel: 'Limpando...' }
    );

    tabEls.products.querySelectorAll('[data-edit-product]').forEach((btn) => {
      btn.addEventListener('click', () => openProductFormModal(btn.dataset.editProduct));
    });

    tabEls.products.querySelectorAll('[data-stock-product]').forEach((btn) => {
      btn.addEventListener('click', () => {
        inventoryModule.renderMovementModal(btn.dataset.stockProduct, render);
      });
    });

    tabEls.products.querySelectorAll('[data-product-movements]').forEach((btn) => {
      btn.addEventListener('click', () => openProductMovementsModal(btn.dataset.productMovements));
    });

    tabEls.products.querySelectorAll('[data-delete-product]').forEach((btn) => {
      btn.addEventListener('click', () => openDeleteProductModal(btn.dataset.deleteProduct));
    });
  }

  function renderSummary() {
    const rows = getRows();
    const threshold = getLowStockThreshold();

    const totalProducts = rows.length;
    const activeProducts = rows.filter((item) => String(item.status || 'ativo') === 'ativo').length;
    const lowStock = rows.filter((item) => {
      const qty = Number(item.quantity || 0);
      return qty > 0 && qty <= threshold;
    }).length;
    const outOfStock = rows.filter((item) => Number(item.quantity || 0) <= 0).length;

    return `
      <div class="section-summary-card">
        <div class="section-summary-grid">
          <div class="section-summary-item">
            <span>Produtos</span>
            <strong>${totalProducts}</strong>
          </div>
          <div class="section-summary-item">
            <span>Ativos</span>
            <strong>${activeProducts}</strong>
          </div>
          <div class="section-summary-item">
            <span>Estoque baixo</span>
            <strong>${lowStock}</strong>
          </div>
          <div class="section-summary-item">
            <span>Sem estoque</span>
            <strong>${outOfStock}</strong>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    if (!tabEls.products) return;

    const rows = getFilteredRows();
    const categories = getCategories();
    const suppliers = getSuppliers();

    tabEls.products.innerHTML = `
      <div class="section-stack">
        ${renderSummary()}

        <div class="table-card">
          <div class="section-header">
            <h2>Produtos</h2>
            <div class="form-actions">
              <button class="btn btn-primary" type="button" id="open-product-form-btn">Novo produto</button>
            </div>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input id="product-filter-query" placeholder="Buscar por nome, código, marca..." value="${escapeHtml(productFilters.query)}" />

            <select id="product-filter-category">
              <option value="">Todas as categorias</option>
              ${categories.map((item) => `
                <option value="${escapeHtml(item)}" ${productFilters.category === item ? 'selected' : ''}>${escapeHtml(item)}</option>
              `).join('')}
            </select>

            <select id="product-filter-supplier">
              <option value="">Todos os fornecedores</option>
              ${suppliers.map((item) => `
                <option value="${escapeHtml(item)}" ${productFilters.supplier === item ? 'selected' : ''}>${escapeHtml(item)}</option>
              `).join('')}
            </select>

            <select id="product-filter-status">
              <option value="">Todos os status</option>
              <option value="ativo" ${productFilters.status === 'ativo' ? 'selected' : ''}>Ativo</option>
              <option value="inativo" ${productFilters.status === 'inativo' ? 'selected' : ''}>Inativo</option>
            </select>

            <select id="product-filter-stock">
              <option value="">Todo estoque</option>
              <option value="out" ${productFilters.stockView === 'out' ? 'selected' : ''}>Sem estoque</option>
              <option value="low" ${productFilters.stockView === 'low' ? 'selected' : ''}>Estoque baixo</option>
              <option value="normal" ${productFilters.stockView === 'normal' ? 'selected' : ''}>Normal</option>
            </select>

            <button class="btn btn-secondary" type="button" id="product-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="product-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap scroll-dual">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Código</th>
                  <th>Categoria</th>
                  <th>Fornecedor</th>
                  <th>Venda</th>
                  <th>Qtd</th>
                  <th>Status</th>
                  <th>Estoque</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${
                  rows.map((item) => {
                    const stockBadge = getStockBadge(item);
                    return `
                      <tr>
                        <td>${escapeHtml(item.name || '-')}</td>
                        <td>${escapeHtml(item.barcode || '-')}</td>
                        <td>${escapeHtml(item.category || '-')}</td>
                        <td>${escapeHtml(item.supplier || '-')}</td>
                        <td>${currency(item.salePrice || 0)}</td>
                        <td>${escapeHtml(String(item.quantity ?? 0))}</td>
                        <td>${escapeHtml(item.status || 'ativo')}</td>
                        <td><span class="badge ${stockBadge.className}">${stockBadge.label}</span></td>
                        <td>
                          <div class="actions-inline-compact">
                            <button class="icon-action-btn" type="button" data-edit-product="${item.id}" aria-label="Editar">✏️</button>
                            <button class="icon-action-btn" type="button" data-stock-product="${item.id}" aria-label="Movimentar estoque">📦</button>
                            <button class="icon-action-btn" type="button" data-product-movements="${item.id}" aria-label="Ver movimentações">🕘</button>
                            <button class="icon-action-btn" type="button" data-delete-product="${item.id}" aria-label="Excluir">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('') || `
                    <tr>
                      <td colspan="9">Nenhum produto encontrado.</td>
                    </tr>
                  `
                }
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