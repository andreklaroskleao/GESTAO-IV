import { escapeHtml, showToast, bindSubmitGuard, bindAsyncButton } from './ui.js';

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

  let movementFilters = {
    product: '',
    type: '',
    reason: '',
    dateFrom: '',
    dateTo: ''
  };

  let productFilters = {
    text: '',
    status: ''
  };

  let scannerStreamRef = null;
  let scannerTimer = null;
  let scannerReader = null;
  let scannerRunning = false;
  let isSavingProduct = false;

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Opera Mini/i.test(navigator.userAgent)
      || window.matchMedia('(max-width: 768px)').matches;
  }

  function getRows() {
    return (state.products || []).filter((item) => item.deleted !== true);
  }

  function getFilteredProducts() {
    return getRows().filter((product) => {
      const haystack = [
        product.name,
        product.barcode,
        product.supplier,
        product.brand,
        product.manufacturer,
        product.serialNumber
      ].join(' ').toLowerCase();

      return (!productFilters.text || haystack.includes(productFilters.text.toLowerCase()))
        && (!productFilters.status || product.status === productFilters.status);
    });
  }

  function getEditingProduct() {
    return getRows().find((item) => item.id === state.editingProductId) || null;
  }

  function getProductSummary() {
    const allProducts = getRows();
    const activeProducts = allProducts.filter((item) => item.status !== 'inativo');
    const lowStockCount = activeProducts.filter(
      (item) => Number(item.quantity || 0) <= Number(state.settings?.lowStockThreshold || 5)
    ).length;
    const inventoryValue = activeProducts.reduce(
      (sum, item) => sum + (Number(item.quantity || 0) * Number(item.costPrice || 0)),
      0
    );

    return {
      totalCount: allProducts.length,
      activeCount: activeProducts.length,
      lowStockCount,
      inventoryValue
    };
  }

  function getBarcodeInput() {
    return document.querySelector('#product-form input[name="barcode"]');
  }

  function focusBarcodeInput() {
    const input = getBarcodeInput();
    if (input) {
      input.focus();
      input.select?.();
    }
  }

  function getScannerModalRoot() {
    return document.getElementById('modal-root');
  }

  function getScannerElements() {
    return {
      video: document.getElementById('product-barcode-video'),
      status: document.getElementById('product-barcode-status')
    };
  }

  function setScannerStatus(message) {
    const { status } = getScannerElements();
    if (!status) return;
    status.textContent = message;
  }

  function openBarcodeScannerModal() {
    const modalRoot = getScannerModalRoot();
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="product-barcode-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Capturar código de barras</h2>
            <button class="btn btn-secondary" type="button" id="product-barcode-modal-close">Fechar</button>
          </div>

          <div class="scanner-card">
            <video id="product-barcode-video" class="video-preview" autoplay muted playsinline></video>
            <div id="product-barcode-status" class="auth-hint" style="margin-top:10px;">Aguardando câmera...</div>
            <div class="form-actions" style="margin-top:10px;">
              <button class="btn btn-secondary" type="button" id="product-barcode-stop-btn">Parar leitura</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      closeBarcodeScannerModal();
    };

    modalRoot.querySelector('#product-barcode-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#product-barcode-stop-btn')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#product-barcode-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'product-barcode-modal-backdrop') {
        closeModal();
      }
    });
  }

  function closeBarcodeScannerModal() {
    const modalRoot = getScannerModalRoot();
    stopBarcodeScanner();
    if (modalRoot) {
      modalRoot.innerHTML = '';
    }
  }

  function setBarcodeValue(value) {
    const input = getBarcodeInput();
    if (!input) return;
    input.value = String(value || '').trim();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    input.select?.();
  }

  async function handleBarcodeCaptureClick() {
    if (!isMobileDevice()) {
      focusBarcodeInput();
      showToast('No computador, clique no campo e use a leitora USB.', 'info');
      return;
    }

    openBarcodeScannerModal();
    await startBarcodeScanner();
  }

  async function startBarcodeScanner() {
    if (scannerRunning) return;

    setScannerStatus('Abrindo câmera traseira...');
    stopBarcodeScanner();

    try {
      if ('BarcodeDetector' in window) {
        await startNativeBarcodeScanner();
        return;
      }

      await startZxingBarcodeScanner();
    } catch (error) {
      console.error('Erro ao iniciar leitura no cadastro:', error);

      try {
        await startZxingBarcodeScanner();
      } catch (fallbackError) {
        console.error('Erro ZXing no cadastro:', fallbackError);
        stopBarcodeScanner();
        showToast('Não foi possível abrir a câmera para ler o código.', 'error');
        closeBarcodeScannerModal();
      }
    }
  }

  async function startNativeBarcodeScanner() {
    const { video } = getScannerElements();

    if (!navigator.mediaDevices?.getUserMedia || !video) {
      throw new Error('Câmera indisponível.');
    }

    scannerStreamRef = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });

    video.srcObject = scannerStreamRef;
    await video.play();

    const detector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'code_39', 'itf']
    });

    scannerRunning = true;
    setScannerStatus('Aponte a câmera para o código de barras do produto.');

    scannerTimer = window.setInterval(async () => {
      try {
        const codes = await detector.detect(video);
        if (!codes.length) return;

        const value = String(codes[0].rawValue || '').trim();
        if (!value) return;

        setBarcodeValue(value);
        showToast('Código de barras capturado.', 'success');
        closeBarcodeScannerModal();
      } catch (error) {
        console.error('Erro ao detectar código no cadastro:', error);
      }
    }, 600);
  }

  async function startZxingBarcodeScanner() {
    const { video } = getScannerElements();

    if (!window.ZXing || !video) {
      throw new Error('ZXing não disponível.');
    }

    const ZXingLib = window.ZXing;
    scannerReader = new ZXingLib.BrowserMultiFormatReader();

    scannerRunning = true;
    setScannerStatus('Aponte a câmera para o código de barras do produto.');

    await scannerReader.decodeFromConstraints(
      {
        video: { facingMode: { ideal: 'environment' } }
      },
      video,
      (result, error) => {
        if (result) {
          const value = String(result.text || '').trim();
          if (!value) return;

          setBarcodeValue(value);
          showToast('Código de barras capturado.', 'success');
          closeBarcodeScannerModal();
        }

        if (error && error.name !== 'NotFoundException') {
          console.error('ZXing cadastro erro:', error);
        }
      }
    );
  }

  function stopBarcodeScanner() {
    if (scannerTimer) {
      window.clearInterval(scannerTimer);
      scannerTimer = null;
    }

    if (scannerReader) {
      try {
        scannerReader.reset();
      } catch (error) {
        console.error(error);
      }
      scannerReader = null;
    }

    if (scannerStreamRef) {
      scannerStreamRef.getTracks().forEach((track) => track.stop());
      scannerStreamRef = null;
    }

    const { video } = getScannerElements();
    if (video) {
      try {
        video.pause();
      } catch (error) {
        console.error(error);
      }
      video.srcObject = null;
    }

    scannerRunning = false;
  }

  async function saveProduct() {
    if (isSavingProduct) return;
    isSavingProduct = true;

    try {
      const form = document.querySelector('#product-form');
      if (!form) return;

      const payload = Object.fromEntries(new FormData(form).entries());

      payload.costPrice = toNumber(payload.costPrice);
      payload.salePrice = toNumber(payload.salePrice);
      payload.quantity = toNumber(payload.quantity);
      payload.status = payload.status || 'ativo';
      payload.deleted = false;

      if (!payload.name) {
        alert('Informe o nome do produto.');
        return;
      }

      if (state.editingProductId) {
        const current = getEditingProduct();

        await updateByPath('products', state.editingProductId, payload);

        await auditModule.log({
          module: 'products',
          action: 'update',
          entityType: 'product',
          entityId: state.editingProductId,
          entityLabel: payload.name || current?.name || '',
          description: 'Produto atualizado.',
          metadata: {
            previousName: current?.name || '',
            newName: payload.name || ''
          }
        });

        state.editingProductId = null;
        showToast('Produto atualizado.', 'success');
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

        showToast('Produto cadastrado.', 'success');
      }

      closeProductFormModal();
      render();
    } finally {
      isSavingProduct = false;
    }
  }

  function fillEditingForm(form) {
    const editing = getEditingProduct();
    if (!editing || !form) return;

    Object.entries(editing).forEach(([key, value]) => {
      if (form.elements[key]) {
        form.elements[key].value = value ?? '';
      }
    });
  }

  function renderBarcodeButton() {
    return `
      <button class="icon-btn" type="button" id="product-barcode-capture-btn" title="Capturar código de barras" aria-label="Capturar código de barras">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 7v10"></path>
          <path d="M7 7v10"></path>
          <path d="M10 7v10"></path>
          <path d="M14 7v10"></path>
          <path d="M17 7v10"></path>
          <path d="M20 7v10"></path>
        </svg>
      </button>
    `;
  }

  function getProductFormHtml() {
    const editing = getEditingProduct();

    return `
      <div class="form-modal-body">
        <div class="section-header">
          <h2>${editing ? 'Editar produto' : 'Novo produto'}</h2>
          <span class="muted">${editing ? 'Atualize os dados do produto.' : 'Cadastro rápido em modal.'}</span>
        </div>

        <form id="product-form" class="form-grid mobile-optimized">
          <div class="form-section" style="grid-column:1 / -1;">
            <div class="form-section-title">
              <h3>1. Identificação</h3>
              <span>Dados principais do produto</span>
            </div>
            <div class="soft-divider"></div>

            <div class="form-grid">
              <label>Nome do produto<input name="name" required /></label>
              <label>Número de série<input name="serialNumber" /></label>

              <label>
                Código de barras
                <div class="input-with-action">
                  <input name="barcode" />
                  ${renderBarcodeButton()}
                </div>
                <span class="mini-help">No celular, toque no ícone. No computador, use a leitora no campo.</span>
              </label>

              <label>Status
                <select name="status">
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
            </div>
          </div>

          <div class="form-section" style="grid-column:1 / -1;">
            <div class="form-section-title">
              <h3>2. Comercial e estoque</h3>
              <span>Valores e quantidade</span>
            </div>
            <div class="soft-divider"></div>

            <div class="form-grid">
              <label>Preço de custo<input name="costPrice" type="number" step="0.01" min="0" /></label>
              <label>Preço de venda<input name="salePrice" type="number" step="0.01" min="0" required /></label>
              <label>Quantidade<input name="quantity" type="number" step="1" min="0" required /></label>
              <label>Fornecedor
                <input name="supplier" list="suppliers-datalist" />
                <datalist id="suppliers-datalist">
                  ${(state.suppliers || [])
                    .filter((item) => item.deleted !== true && item.active !== false)
                    .map((item) => `<option value="${escapeHtml(item.name || '')}"></option>`)
                    .join('')}
                </datalist>
              </label>
            </div>
          </div>

          <div class="form-section" style="grid-column:1 / -1;">
            <div class="form-section-title">
              <h3>3. Marca e fabricante</h3>
              <span>Complemento do cadastro</span>
            </div>
            <div class="soft-divider"></div>

            <div class="form-grid">
              <label>Marca<input name="brand" /></label>
              <label>Fabricante<input name="manufacturer" /></label>
            </div>
          </div>

          <div class="form-actions" style="grid-column: 1 / -1;">
            <button class="btn btn-primary" type="submit">${editing ? 'Salvar alterações' : 'Cadastrar produto'}</button>
            <button class="btn btn-secondary" type="button" id="product-form-cancel-btn">Cancelar</button>
          </div>
        </form>
      </div>
    `;
  }

  function openProductFormModal(productId = null) {
    state.editingProductId = productId;
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="product-form-modal-backdrop">
        <div class="modal-card form-modal-card">
          ${getProductFormHtml()}
        </div>
      </div>
    `;

    const closeModal = () => {
      closeProductFormModal();
    };

    modalRoot.querySelector('#product-form-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'product-form-modal-backdrop') {
        closeModal();
      }
    });

    modalRoot.querySelector('#product-form-cancel-btn')?.addEventListener('click', closeModal);

    const form = modalRoot.querySelector('#product-form');
    fillEditingForm(form);
    bindSubmitGuard(form, saveProduct, { busyLabel: 'Salvando...' });
    bindAsyncButton(modalRoot.querySelector('#product-barcode-capture-btn'), handleBarcodeCaptureClick, { busyLabel: 'Abrindo...' });
  }

  function closeProductFormModal() {
    stopBarcodeScanner();
    const modalRoot = document.getElementById('modal-root');
    if (modalRoot) {
      modalRoot.innerHTML = '';
    }
    state.editingProductId = null;
  }

  function openProductActions(productId) {
    const product = getRows().find((item) => item.id === productId);
    if (!product) return;

    if (product.status === 'inativo') {
      window.openActionsSheet?.('Ações do produto', [
        {
          label: 'Editar',
          className: 'btn btn-secondary',
          onClick: async () => {
            openProductFormModal(productId);
          }
        },
        {
          label: 'Reativar',
          className: 'btn btn-secondary',
          onClick: async () => {
            await updateByPath('products', productId, {
              deleted: false,
              status: 'ativo'
            });

            await auditModule.log({
              module: 'products',
              action: 'reactivate',
              entityType: 'product',
              entityId: productId,
              entityLabel: product.name || '',
              description: 'Produto reativado.'
            });

            showToast('Produto reativado.', 'success');
            render();
          }
        }
      ]);
      return;
    }

    window.openActionsSheet?.('Ações do produto', [
      {
        label: 'Editar',
        className: 'btn btn-secondary',
        onClick: async () => {
          openProductFormModal(productId);
        }
      },
      {
        label: 'Movimentar estoque',
        className: 'btn btn-secondary',
        onClick: async () => {
          inventoryModule.renderMovementModal?.(productId, render);
        }
      },
      {
        label: 'Inativar',
        className: 'btn btn-danger',
        onClick: async () => {
          await updateByPath('products', productId, {
            deleted: false,
            status: 'inativo'
          });

          await auditModule.log({
            module: 'products',
            action: 'inactivate',
            entityType: 'product',
            entityId: productId,
            entityLabel: product.name || '',
            description: 'Produto inativado.'
          });

          showToast('Produto inativado.', 'success');
          render();
        }
      }
    ]);
  }

  function renderActionButtons(product) {
    return `
      <div class="actions-inline-compact">
        <button class="icon-action-btn" type="button" data-product-edit="${product.id}" title="Editar" aria-label="Editar">✏️</button>
        ${product.status !== 'inativo'
          ? `<button class="icon-action-btn info" type="button" data-product-move="${product.id}" title="Movimentar estoque" aria-label="Movimentar estoque">📦</button>`
          : ''
        }
        <button class="icon-action-btn" type="button" data-product-more="${product.id}" title="Mais ações" aria-label="Mais ações">⋯</button>
      </div>
    `;
  }

  function bindProductTableActions(scope) {
    scope.querySelectorAll('[data-product-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openProductFormModal(btn.dataset.productEdit);
      });
    });

    scope.querySelectorAll('[data-product-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        inventoryModule.renderMovementModal?.(btn.dataset.productMove, render);
      });
    });

    scope.querySelectorAll('[data-product-more]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openProductActions(btn.dataset.productMore);
      });
    });
  }

  function bindEvents() {
    bindAsyncButton(tabEls.products.querySelector('#open-product-form-btn'), async () => {
      openProductFormModal(null);
    }, { busyLabel: 'Abrindo...' });

    tabEls.products.querySelector('#product-filter-apply')?.addEventListener('click', () => {
      productFilters.text = tabEls.products.querySelector('#product-filter-input')?.value || '';
      productFilters.status = tabEls.products.querySelector('#product-status-filter')?.value || '';
      render();
    });

    bindAsyncButton(tabEls.products.querySelector('#product-filter-clear'), async () => {
      productFilters = {
        text: '',
        status: ''
      };
      render();
    }, { busyLabel: 'Limpando...' });

    tabEls.products.querySelector('#movement-filter-apply')?.addEventListener('click', () => {
      movementFilters.product = tabEls.products.querySelector('#movement-filter-product')?.value || '';
      movementFilters.type = tabEls.products.querySelector('#movement-filter-type')?.value || '';
      movementFilters.reason = tabEls.products.querySelector('#movement-filter-reason')?.value || '';
      movementFilters.dateFrom = tabEls.products.querySelector('#movement-filter-date-from')?.value || '';
      movementFilters.dateTo = tabEls.products.querySelector('#movement-filter-date-to')?.value || '';
      render();
    });

    bindAsyncButton(tabEls.products.querySelector('#movement-filter-clear'), async () => {
      movementFilters = {
        product: '',
        type: '',
        reason: '',
        dateFrom: '',
        dateTo: ''
      };
      render();
    }, { busyLabel: 'Limpando...' });

    bindProductTableActions(tabEls.products);
  }

  function render() {
    const rows = getFilteredProducts();
    const summary = getProductSummary();

    tabEls.products.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card"><span>Total de produtos</span><strong>${summary.totalCount}</strong></div>
          <div class="metric-card"><span>Produtos ativos</span><strong>${summary.activeCount}</strong></div>
          <div class="metric-card"><span>Estoque baixo</span><strong>${summary.lowStockCount}</strong></div>
          <div class="metric-card"><span>Valor em custo</span><strong>${currency(summary.inventoryValue)}</strong></div>
        </div>

        <div class="entity-toolbar panel">
          <div>
            <h2 style="margin:0 0 6px;">Produtos</h2>
            <p class="muted">Cadastro em modal e listas com rolagem interna.</p>
          </div>

          <div class="entity-toolbar-actions">
            <button class="btn btn-primary" type="button" id="open-product-form-btn">Novo produto</button>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Lista de produtos</h2>
            <span class="muted">${rows.length} resultado(s)</span>
          </div>

          <div class="search-row">
            <input id="product-filter-input" placeholder="Pesquisar por nome, código, fornecedor, marca ou fabricante" value="${escapeHtml(productFilters.text)}" />
            <select id="product-status-filter">
              <option value="">Todos os status</option>
              <option value="ativo" ${productFilters.status === 'ativo' ? 'selected' : ''}>Ativo</option>
              <option value="inativo" ${productFilters.status === 'inativo' ? 'selected' : ''}>Inativo</option>
            </select>
            <button class="btn btn-secondary" type="button" id="product-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="product-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap scroll-dual" style="margin-top:14px;">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Série</th>
                  <th>Marca</th>
                  <th>Fornecedor</th>
                  <th>Custo</th>
                  <th>Venda</th>
                  <th>Qtd</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="products-tbody">
                ${rows.map((product) => `
                  <tr>
                    <td>${escapeHtml(product.name || '-')}</td>
                    <td>${escapeHtml(product.serialNumber || '-')}</td>
                    <td>${escapeHtml(product.brand || '-')}</td>
                    <td>${escapeHtml(product.supplier || '-')}</td>
                    <td>${currency(product.costPrice || 0)}</td>
                    <td>${currency(product.salePrice || 0)}</td>
                    <td>${product.quantity ?? 0}</td>
                    <td><span class="tag ${product.status === 'ativo' ? 'success' : 'warning'}">${escapeHtml(product.status || 'ativo')}</span></td>
                    <td>${renderActionButtons(product)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="9">Nenhum produto cadastrado.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Movimentação de estoque</h2>
            <span class="muted">Histórico e rastreabilidade</span>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input id="movement-filter-product" placeholder="Produto" value="${escapeHtml(movementFilters.product)}" />
            <select id="movement-filter-type">
              <option value="">Todos os tipos</option>
              <option value="entrada" ${movementFilters.type === 'entrada' ? 'selected' : ''}>Entrada</option>
              <option value="saida" ${movementFilters.type === 'saida' ? 'selected' : ''}>Saída</option>
              <option value="ajuste" ${movementFilters.type === 'ajuste' ? 'selected' : ''}>Ajuste</option>
            </select>
            <input id="movement-filter-reason" placeholder="Motivo" value="${escapeHtml(movementFilters.reason)}" />
            <input id="movement-filter-date-from" type="date" value="${movementFilters.dateFrom}" />
            <input id="movement-filter-date-to" type="date" value="${movementFilters.dateTo}" />
            <button class="btn btn-secondary" type="button" id="movement-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="movement-filter-clear">Limpar</button>
          </div>

          <div class="scroll-dual">
            ${inventoryModule.renderMovementTable?.(movementFilters) || '<div class="empty-state">Sem movimentações.</div>'}
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  return {
    render,
    stopBarcodeScanner,
    openProductFormModal
  };
}