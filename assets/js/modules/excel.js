import { showToast } from './ui.js';

export function createExcelModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    auditModule
  } = ctx;

  function ensureXlsx() {
    if (!window.XLSX) {
      throw new Error('Biblioteca XLSX não carregada.');
    }
    return window.XLSX;
  }

  function saveWorkbook(workbook, filename) {
    ensureXlsx().writeFile(workbook, filename);
  }

  function toDateTime(value) {
    const date = value?.toDate ? value.toDate() : new Date(value || 0);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR');
  }

  function createSheetFromJson(data) {
    return ensureXlsx().utils.json_to_sheet(data);
  }

  function exportAllExcel() {
    const XLSX = ensureXlsx();
    const workbook = XLSX.utils.book_new();

    const products = (state.products || []).map((item) => ({
      Nome: item.name || '',
      Serie: item.serialNumber || '',
      Fornecedor: item.supplier || '',
      Custo: Number(item.costPrice || 0),
      Venda: Number(item.salePrice || 0),
      CodigoBarras: item.barcode || '',
      Quantidade: Number(item.quantity || 0),
      Marca: item.brand || '',
      Fabricante: item.manufacturer || '',
      Status: item.status || ''
    }));

    const sales = (state.sales || []).map((item) => ({
      Data: toDateTime(item.createdAt),
      Cliente: item.customerName || '',
      ClienteId: item.clientId || '',
      Pagamento: item.paymentMethod || '',
      Subtotal: Number(item.subtotal || 0),
      Desconto: Number(item.discount || 0),
      Total: Number(item.total || 0),
      ValorPago: Number(item.amountPaid || 0),
      Troco: Number(item.change || 0),
      Itens: (item.items || []).map((row) => `${row.name} x${row.quantity}`).join(' | '),
      Operador: item.cashierName || ''
    }));

    const deliveries = (state.deliveries || []).map((item) => ({
      Cliente: item.clientName || '',
      ClienteId: item.clientId || '',
      Telefone: item.phone || '',
      Endereco: item.address || '',
      Data: item.date || '',
      Hora: item.time || '',
      Status: item.status || '',
      Valor: Number(item.amount || 0),
      Pagamento: item.paymentMethod || '',
      Descricao: item.description || '',
      Observacoes: item.notes || '',
      Responsavel: item.assignedUserName || ''
    }));

    const clients = (state.clients || []).map((item) => ({
      Nome: item.name || '',
      Telefone: item.phone || '',
      Endereco: item.address || '',
      Email: item.email || '',
      Observacoes: item.notes || '',
      Status: item.active === false ? 'Inativo' : 'Ativo'
    }));

    const accounts = (state.accountsReceivable || []).map((item) => ({
      Cliente: item.clientName || '',
      ClienteId: item.clientId || '',
      Descricao: item.description || '',
      Total: Number(item.totalAmount || 0),
      Recebido: Number(item.receivedAmount || 0),
      Aberto: Number(item.openAmount || 0),
      Vencimento: item.dueDate || '',
      Forma: item.paymentMethod || '',
      Status: item.status || '',
      Observacoes: item.notes || ''
    }));

    const inventory = (state.inventoryMovements || []).map((item) => ({
      Data: toDateTime(item.createdAt),
      Produto: item.productName || '',
      Tipo: item.type || '',
      Quantidade: Number(item.quantity || 0),
      Anterior: Number(item.previousQuantity || 0),
      Novo: Number(item.newQuantity || 0),
      Motivo: item.reason || '',
      Observacoes: item.notes || '',
      Usuario: item.userName || ''
    }));

    const cash = (state.cashSessions || []).map((item) => ({
      Abertura: toDateTime(item.openedAt),
      Fechamento: toDateTime(item.closedAt),
      Status: item.status || '',
      ValorInicial: Number(item.openingAmount || 0),
      Esperado: Number(item.expectedAmount || 0),
      Fechado: Number(item.closingAmount || 0),
      Diferenca: Number(item.difference || 0),
      TotalVendas: Number(item.salesTotal || 0),
      Dinheiro: Number(item.cashSalesTotal || 0),
      Pix: Number(item.pixSalesTotal || 0),
      Cartao: Number(item.cardSalesTotal || 0),
      Vale: Number(item.voucherSalesTotal || 0),
      Outros: Number(item.otherSalesTotal || 0),
      AbertoPor: item.openedByName || '',
      FechadoPor: item.closedByName || ''
    }));

    const audit = (state.auditLogs || []).map((item) => ({
      Data: toDateTime(item.createdAt),
      Modulo: item.module || '',
      Acao: item.action || '',
      Tipo: item.entityType || '',
      Registro: item.entityLabel || '',
      Descricao: item.description || '',
      Usuario: item.performedByName || ''
    }));

    XLSX.utils.book_append_sheet(workbook, createSheetFromJson(products), 'Produtos');
    XLSX.utils.book_append_sheet(workbook, createSheetFromJson(sales), 'Vendas');
    XLSX.utils.book_append_sheet(workbook, createSheetFromJson(deliveries), 'Entregas');
    XLSX.utils.book_append_sheet(workbook, createSheetFromJson(clients), 'Clientes');
    XLSX.utils.book_append_sheet(workbook, createSheetFromJson(accounts), 'ContasReceber');
    XLSX.utils.book_append_sheet(workbook, createSheetFromJson(inventory), 'Estoque');
    XLSX.utils.book_append_sheet(workbook, createSheetFromJson(cash), 'Caixa');
    XLSX.utils.book_append_sheet(workbook, createSheetFromJson(audit), 'Auditoria');

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    saveWorkbook(workbook, `gestao-comercial-${stamp}.xlsx`);
    showToast('Exportação Excel concluída.', 'success');
  }

  function normalizeRows(sheet) {
    return ensureXlsx().utils.sheet_to_json(sheet, { defval: '' });
  }

  async function importProducts(rows) {
    for (const row of rows) {
      await createDoc(refs.products, {
        name: row.Nome || '',
        serialNumber: row.Serie || '',
        supplier: row.Fornecedor || '',
        costPrice: Number(row.Custo || 0),
        salePrice: Number(row.Venda || 0),
        barcode: row.CodigoBarras || '',
        quantity: Number(row.Quantidade || 0),
        brand: row.Marca || '',
        manufacturer: row.Fabricante || '',
        status: row.Status || 'ativo',
        deleted: false
      });
    }
  }

  async function importClients(rows) {
    for (const row of rows) {
      await createDoc(refs.clients, {
        name: row.Nome || '',
        phone: row.Telefone || '',
        address: row.Endereco || '',
        email: row.Email || '',
        notes: row.Observacoes || '',
        active: String(row.Status || '').toLowerCase() !== 'inativo'
      });
    }
  }

  async function importAccounts(rows) {
    for (const row of rows) {
      await createDoc(refs.accountsReceivable, {
        clientName: row.Cliente || '',
        clientId: row.ClienteId || '',
        description: row.Descricao || '',
        totalAmount: Number(row.Total || 0),
        receivedAmount: Number(row.Recebido || 0),
        openAmount: Number(row.Aberto || 0),
        dueDate: row.Vencimento || '',
        paymentMethod: row.Forma || '',
        status: row.Status || 'Em aberto',
        notes: row.Observacoes || '',
        payments: [],
        createdAt: new Date(),
        createdById: state.currentUser?.uid || '',
        createdByName: state.currentUser?.fullName || ''
      });
    }
  }

  async function importExcelFile(file) {
    const XLSX = ensureXlsx();

    if (!file) {
      throw new Error('Nenhum arquivo Excel selecionado.');
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    if (workbook.Sheets.Produtos) {
      await importProducts(normalizeRows(workbook.Sheets.Produtos));
    }

    if (workbook.Sheets.Clientes) {
      await importClients(normalizeRows(workbook.Sheets.Clientes));
    }

    if (workbook.Sheets.ContasReceber) {
      await importAccounts(normalizeRows(workbook.Sheets.ContasReceber));
    }

    await auditModule.log({
      module: 'excel',
      action: 'import',
      entityType: 'system',
      entityId: '',
      entityLabel: 'Importação Excel',
      description: 'Importação Excel executada.'
    });

    showToast('Importação Excel concluída.', 'success');
  }

  return {
    exportAllExcel,
    importExcelFile
  };
}