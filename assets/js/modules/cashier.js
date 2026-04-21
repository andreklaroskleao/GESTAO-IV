import { escapeHtml, showToast } from './ui.js';

export function createCashierModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    updateByPath,
    currency,
    toNumber,
    formatDateTime,
    auditModule
  } = ctx;

  function getOpenSession() {
    return (state.cashSessions || []).find((item) => item.status === 'open') || null;
  }

  function getSessionSales(session) {
    if (!session?.openedAt) return [];

    const openedAt = session.openedAt?.toDate
      ? session.openedAt.toDate()
      : new Date(session.openedAt || 0);

    const closedAt = session.closedAt?.toDate
      ? session.closedAt.toDate()
      : (session.closedAt ? new Date(session.closedAt) : null);

    return (state.sales || []).filter((sale) => {
      const saleDate = sale.createdAt?.toDate
        ? sale.createdAt.toDate()
        : new Date(sale.createdAt || 0);

      if (Number.isNaN(saleDate.getTime())) return false;
      if (saleDate < openedAt) return false;
      if (closedAt && saleDate > closedAt) return false;
      return true;
    });
  }

  function summarizeSalesByPayment(sales) {
    const summary = {
      total: 0,
      cash: 0,
      pix: 0,
      card: 0,
      voucher: 0,
      other: 0
    };

    sales.forEach((sale) => {
      const total = Number(sale.total || 0);
      const method = String(sale.paymentMethod || '').toLowerCase();

      summary.total += total;

      if (method.includes('dinheiro')) summary.cash += total;
      else if (method.includes('pix')) summary.pix += total;
      else if (method.includes('cart')) summary.card += total;
      else if (method.includes('vale')) summary.voucher += total;
      else summary.other += total;
    });

    return summary;
  }

  async function openCashSession(openingAmount, notes = '') {
    if (getOpenSession()) {
      throw new Error('Já existe um caixa aberto.');
    }

    const payload = {
      openedAt: new Date(),
      closedAt: null,
      status: 'open',
      openingAmount: Number(openingAmount || 0),
      expectedAmount: Number(openingAmount || 0),
      closingAmount: 0,
      difference: 0,
      salesTotal: 0,
      cashSalesTotal: 0,
      pixSalesTotal: 0,
      cardSalesTotal: 0,
      voucherSalesTotal: 0,
      otherSalesTotal: 0,
      withdrawals: [],
      supplies: [],
      notes: String(notes || ''),
      openedById: state.currentUser?.uid || '',
      openedByName: state.currentUser?.fullName || '',
      closedById: '',
      closedByName: ''
    };

    const sessionId = await createDoc(refs.cashSessions, payload);

    await auditModule.log({
      module: 'cashier',
      action: 'open',
      entityType: 'cash_session',
      entityId: sessionId,
      entityLabel: `Caixa ${sessionId}`,
      description: 'Caixa aberto.',
      metadata: {
        openingAmount: payload.openingAmount
      }
    });

    showToast('Caixa aberto com sucesso.', 'success');
  }

  async function addCashMovement(type, amount, reason) {
    const session = getOpenSession();
    if (!session) {
      throw new Error('Nenhum caixa aberto.');
    }

    const value = Number(amount || 0);
    if (value <= 0) {
      throw new Error('Informe um valor válido.');
    }

    const movement = {
      amount: value,
      reason: String(reason || ''),
      createdAt: new Date(),
      userId: state.currentUser?.uid || '',
      userName: state.currentUser?.fullName || ''
    };

    const field = type === 'withdrawal' ? 'withdrawals' : 'supplies';
    const updated = [...(Array.isArray(session[field]) ? session[field] : []), movement];

    await updateByPath('cash_sessions', session.id, {
      [field]: updated
    });

    await auditModule.log({
      module: 'cashier',
      action: type === 'withdrawal' ? 'withdrawal' : 'supply',
      entityType: 'cash_session',
      entityId: session.id,
      entityLabel: `Caixa ${session.id}`,
      description: type === 'withdrawal' ? 'Sangria registrada.' : 'Reforço registrado.',
      metadata: {
        amount: value,
        reason: movement.reason
      }
    });

    showToast(type === 'withdrawal' ? 'Sangria registrada.' : 'Reforço registrado.', 'success');
  }

  async function closeCashSession(closingAmount, notes = '') {
    const session = getOpenSession();
    if (!session) {
      throw new Error('Nenhum caixa aberto.');
    }

    const sales = getSessionSales(session);
    const paymentSummary = summarizeSalesByPayment(sales);
    const totalWithdrawals = (session.withdrawals || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalSupplies = (session.supplies || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expectedAmount =
      Number(session.openingAmount || 0)
      + Number(paymentSummary.cash || 0)
      + Number(totalSupplies || 0)
      - Number(totalWithdrawals || 0);

    const closing = Number(closingAmount || 0);
    const difference = closing - expectedAmount;

    await updateByPath('cash_sessions', session.id, {
      closedAt: new Date(),
      status: 'closed',
      expectedAmount,
      closingAmount: closing,
      difference,
      salesTotal: paymentSummary.total,
      cashSalesTotal: paymentSummary.cash,
      pixSalesTotal: paymentSummary.pix,
      cardSalesTotal: paymentSummary.card,
      voucherSalesTotal: paymentSummary.voucher,
      otherSalesTotal: paymentSummary.other,
      notes: String(notes || session.notes || ''),
      closedById: state.currentUser?.uid || '',
      closedByName: state.currentUser?.fullName || ''
    });

    await auditModule.log({
      module: 'cashier',
      action: 'close',
      entityType: 'cash_session',
      entityId: session.id,
      entityLabel: `Caixa ${session.id}`,
      description: 'Caixa fechado.',
      metadata: {
        expectedAmount,
        closingAmount: closing,
        difference
      }
    });

    showToast('Caixa fechado com sucesso.', 'success');
  }

  function renderCashSessionPanel() {
    const session = getOpenSession();

    if (!session) {
      return `
        <div class="card">
          <h3>Abertura de caixa</h3>
          <form id="cash-open-form" class="form-grid" style="margin-top:12px;">
            <label>Valor inicial<input name="openingAmount" type="number" min="0" step="0.01" required /></label>
            <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>
            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Abrir caixa</button>
            </div>
          </form>
        </div>
      `;
    }

    const sales = getSessionSales(session);
    const paymentSummary = summarizeSalesByPayment(sales);
    const totalWithdrawals = (session.withdrawals || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalSupplies = (session.supplies || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expectedAmount =
      Number(session.openingAmount || 0)
      + Number(paymentSummary.cash || 0)
      + Number(totalSupplies || 0)
      - Number(totalWithdrawals || 0);

    return `
      <div class="cards-grid">
        <div class="card">
          <h3>Caixa aberto</h3>
          <p><strong>Abertura:</strong> ${formatDateTime(session.openedAt)}</p>
          <p><strong>Responsável:</strong> ${escapeHtml(session.openedByName || '-')}</p>
          <p><strong>Valor inicial:</strong> ${currency(session.openingAmount || 0)}</p>
          <p><strong>Esperado em dinheiro:</strong> ${currency(expectedAmount)}</p>
        </div>

        <div class="card">
          <h3>Resumo de vendas</h3>
          <p><strong>Total vendido:</strong> ${currency(paymentSummary.total)}</p>
          <p><strong>Dinheiro:</strong> ${currency(paymentSummary.cash)}</p>
          <p><strong>PIX:</strong> ${currency(paymentSummary.pix)}</p>
          <p><strong>Cartão:</strong> ${currency(paymentSummary.card)}</p>
          <p><strong>Vale:</strong> ${currency(paymentSummary.voucher)}</p>
          <p><strong>Outros:</strong> ${currency(paymentSummary.other)}</p>
        </div>

        <div class="card">
          <h3>Movimentações</h3>
          <p><strong>Sangrias:</strong> ${currency(totalWithdrawals)}</p>
          <p><strong>Reforços:</strong> ${currency(totalSupplies)}</p>
          <div class="inline-row" style="margin-top:12px;">
            <button class="btn btn-secondary" id="cash-withdrawal-btn">Registrar sangria</button>
            <button class="btn btn-secondary" id="cash-supply-btn">Registrar reforço</button>
          </div>
        </div>

        <div class="card">
          <h3>Fechamento</h3>
          <form id="cash-close-form" class="form-grid" style="margin-top:12px;">
            <label>Valor contado<input name="closingAmount" type="number" min="0" step="0.01" required /></label>
            <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>
            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-danger" type="submit">Fechar caixa</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderHistoryTable() {
    const rows = [...(state.cashSessions || [])].sort((a, b) => {
      const da = a.openedAt?.toDate ? a.openedAt.toDate().getTime() : new Date(a.openedAt || 0).getTime();
      const db = b.openedAt?.toDate ? b.openedAt.toDate().getTime() : new Date(b.openedAt || 0).getTime();
      return db - da;
    });

    return `
      <div class="table-card" style="margin-top:18px;">
        <h3>Histórico de caixas</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Abertura</th>
                <th>Fechamento</th>
                <th>Status</th>
                <th>Inicial</th>
                <th>Esperado</th>
                <th>Fechado</th>
                <th>Diferença</th>
                <th>Responsável</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((item) => `
                <tr>
                  <td>${formatDateTime(item.openedAt)}</td>
                  <td>${item.closedAt ? formatDateTime(item.closedAt) : '-'}</td>
                  <td>${item.status === 'open' ? 'Aberto' : 'Fechado'}</td>
                  <td>${currency(item.openingAmount || 0)}</td>
                  <td>${currency(item.expectedAmount || 0)}</td>
                  <td>${currency(item.closingAmount || 0)}</td>
                  <td>${currency(item.difference || 0)}</td>
                  <td>${escapeHtml(item.openedByName || '-')}</td>
                </tr>
              `).join('') || '<tr><td colspan="8">Nenhum caixa registrado.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderMovementModal(type, onAfter) {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    const isWithdrawal = type === 'withdrawal';

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="cash-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>${isWithdrawal ? 'Registrar sangria' : 'Registrar reforço'}</h2>
            <button class="btn btn-secondary" id="cash-modal-close">Fechar</button>
          </div>

          <form id="cash-movement-form" class="form-grid">
            <label>Valor<input name="amount" type="number" min="0" step="0.01" required /></label>
            <label style="grid-column:1 / -1;">Motivo<input name="reason" required /></label>
            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Salvar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#cash-modal-close').addEventListener('click', closeModal);
    modalRoot.querySelector('#cash-modal-backdrop').addEventListener('click', (event) => {
      if (event.target.id === 'cash-modal-backdrop') {
        closeModal();
      }
    });

    modalRoot.querySelector('#cash-movement-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        const values = Object.fromEntries(new FormData(event.currentTarget).entries());
        await addCashMovement(type, toNumber(values.amount), values.reason);
        closeModal();
        onAfter?.();
      } catch (error) {
        alert(error.message || 'Erro ao registrar movimentação de caixa.');
      }
    });
  }

  function bindCashEvents(renderSettings) {
    document.querySelector('#cash-open-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());

      try {
        await openCashSession(toNumber(values.openingAmount), values.notes);
        renderSettings?.();
      } catch (error) {
        alert(error.message || 'Erro ao abrir caixa.');
      }
    });

    document.querySelector('#cash-close-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());

      try {
        await closeCashSession(toNumber(values.closingAmount), values.notes);
        renderSettings?.();
      } catch (error) {
        alert(error.message || 'Erro ao fechar caixa.');
      }
    });

    document.querySelector('#cash-withdrawal-btn')?.addEventListener('click', () => {
      renderMovementModal('withdrawal', renderSettings);
    });

    document.querySelector('#cash-supply-btn')?.addEventListener('click', () => {
      renderMovementModal('supply', renderSettings);
    });
  }

  return {
    getOpenSession,
    getSessionSales,
    summarizeSalesByPayment,
    openCashSession,
    addCashMovement,
    closeCashSession,
    renderCashSessionPanel,
    renderHistoryTable,
    bindCashEvents
  };
}