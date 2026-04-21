import { escapeHtml, showToast } from './ui.js';

export function createInventoryModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    updateByPath,
    toNumber,
    currency,
    formatDateTime,
    auditModule
  } = ctx;

  function getProductById(productId) {
    return (state.products || []).find((item) => item.id === productId) || null;
  }

  function getCurrentUserMeta() {
    return {
      userId: String(state.currentUser?.uid || ''),
      userName: String(state.currentUser?.fullName || ''),
      userEmail: String(state.currentUser?.email || '')
    };
  }

  async function registerMovement({ productId, type, quantity, reason, notes = '' }) {
    const product = getProductById(productId);
    if (!product) {
      throw new Error('Produto não encontrado.');
    }

    const qty = Math.max(0, Number(quantity || 0));
    const previousQuantity = Number(product.quantity || 0);
    const trimmedReason = String(reason || '').trim();
    const trimmedNotes = String(notes || '').trim();

    if (qty <= 0) {
      throw new Error('Informe uma quantidade válida.');
    }

    if (!trimmedReason) {
      throw new Error('Informe o motivo da movimentação.');
    }

    let newQuantity = previousQuantity;

    if (type === 'entrada') {
      newQuantity = previousQuantity + qty;
    } else if (type === 'saida') {
      if (previousQuantity < qty) {
        throw new Error('Estoque insuficiente para saída.');
      }
      newQuantity = previousQuantity - qty;
    } else if (type === 'ajuste') {
      newQuantity = qty;
    } else {
      throw new Error('Tipo de movimentação inválido.');
    }

    const actor = getCurrentUserMeta();
    const nowIso = new Date().toISOString();

    await updateByPath('products', productId, {
      quantity: newQuantity,
      lastStockAdjustmentAt: nowIso,
      lastStockAdjustmentBy: actor.userId || actor.userName || '',
      lastStockAdjustmentReason: trimmedReason
    });

    await createDoc(refs.inventoryMovements, {
      productId: product.id,
      productName: product.name,
      productBarcode: product.barcode || '',
      type,
      quantity: qty,
      previousQuantity,
      newQuantity,
      quantityDelta: newQuantity - previousQuantity,
      reason: trimmedReason,
      notes: trimmedNotes,
      sourceType: 'product_manual_adjustment',
      sourceId: product.id,
      userId: actor.userId,
      userName: actor.userName,
      userEmail: actor.userEmail,
      deleted: false,
      createdAt: new Date()
    });

    await auditModule.log({
      module: 'inventory',
      action: 'movement',
      entityType: 'product',
      entityId: product.id,
      entityLabel: product.name,
      description: `Movimentação de estoque: ${type}.`,
      metadata: {
        type,
        quantity: qty,
        previousQuantity,
        newQuantity,
        quantityDelta: newQuantity - previousQuantity,
        reason: trimmedReason,
        notes: trimmedNotes
      }
    });

    showToast('Movimentação registrada com sucesso.', 'success');
    return true;
  }

  function getFilteredMovements(filters = {}) {
    return [...(state.inventoryMovements || [])]
      .filter((item) => {
        if (item.deleted === true) return false;

        const productName = String(item.productName || '').toLowerCase();
        const reason = String(item.reason || '').toLowerCase();
        const type = String(item.type || '');

        const created = item.createdAt?.toDate
          ? item.createdAt.toDate()
          : new Date(item.createdAt || 0);

        const dateValue = Number.isNaN(created.getTime())
          ? ''
          : `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;

        return (!filters.product || productName.includes(filters.product.toLowerCase()))
          && (!filters.reason || reason.includes(filters.reason.toLowerCase()))
          && (!filters.type || type === filters.type)
          && (!filters.dateFrom || dateValue >= filters.dateFrom)
          && (!filters.dateTo || dateValue <= filters.dateTo);
      })
      .sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return db - da;
      });
  }

  function renderMovementTable(filters = {}) {
    const rows = getFilteredMovements(filters);

    return `
      <div class="table-wrap scroll-dual">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Produto</th>
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
                  <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
                  <td>${escapeHtml(item.productName || '-')}</td>
                  <td>${escapeHtml(item.type || '-')}</td>
                  <td>${escapeHtml(String(item.quantity ?? '-'))}</td>
                  <td>${escapeHtml(String(item.previousQuantity ?? '-'))}</td>
                  <td>${escapeHtml(String(item.newQuantity ?? '-'))}</td>
                  <td>${escapeHtml(item.reason || '-')}</td>
                  <td>${escapeHtml(item.userName || '-')}</td>
                </tr>
              `).join('') || `
                <tr>
                  <td colspan="8">Nenhuma movimentação encontrada.</td>
                </tr>
              `
            }
          </tbody>
        </table>
      </div>
    `;
  }

  function renderMovementModal(productId, onSaved) {
    const product = getProductById(productId);
    if (!product) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="inventory-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Movimentar estoque</h2>
            <button class="btn btn-secondary" type="button" id="inventory-modal-close">Fechar</button>
          </div>

          <div class="empty-state" style="text-align:left;">
            <strong>${escapeHtml(product.name)}</strong>
            <span>Estoque atual: ${product.quantity}</span>
            <span>Preço de venda: ${currency(product.salePrice || 0)}</span>
          </div>

          <form id="inventory-form" class="form-grid" style="margin-top:16px;">
            <label>
              Tipo
              <select name="type" required>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
                <option value="ajuste">Ajuste</option>
              </select>
            </label>

            <label>
              Quantidade
              <input name="quantity" type="number" min="0" step="1" required />
            </label>

            <label style="grid-column:1 / -1;">
              Motivo
              <input name="reason" type="text" placeholder="Ex.: conferência, perda, acerto de cadastro" required />
            </label>

            <label style="grid-column:1 / -1;">
              Observações
              <textarea name="notes" rows="3"></textarea>
            </label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Salvar movimentação</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#inventory-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#inventory-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'inventory-modal-backdrop') {
        closeModal();
      }
    });

    modalRoot.querySelector('#inventory-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());

        await registerMovement({
          productId,
          type: data.type,
          quantity: toNumber(data.quantity),
          reason: data.reason,
          notes: data.notes
        });

        closeModal();
        onSaved?.();
      } catch (error) {
        alert(error.message || 'Erro ao registrar movimentação.');
      }
    });
  }

  return {
    registerMovement,
    getFilteredMovements,
    renderMovementTable,
    renderMovementModal
  };
}