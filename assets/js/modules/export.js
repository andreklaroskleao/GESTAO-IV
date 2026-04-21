export function createExportModule(ctx) {
  const { state } = ctx;

  function escapeCsv(value) {
    const text = String(value ?? '');

    if (text.includes('"') || text.includes(';') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  }

  function toDateTime(value) {
    const date = value?.toDate ? value.toDate() : new Date(value || 0);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR');
  }

  function downloadCsv(filename, headers, rows) {
    const csvLines = [
      headers.map(escapeCsv).join(';'),
      ...rows.map((row) => row.map(escapeCsv).join(';'))
    ];

    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportProducts() {
    downloadCsv(
      'produtos.csv',
      ['Nome', 'Numero de serie', 'Fornecedor', 'Preco de custo', 'Preco de venda', 'Codigo de barras', 'Quantidade', 'Marca', 'Fabricante', 'Status'],
      (state.products || []).map((item) => [
        item.name || '',
        item.serialNumber || '',
        item.supplier || '',
        item.costPrice ?? '',
        item.salePrice ?? '',
        item.barcode || '',
        item.quantity ?? '',
        item.brand || '',
        item.manufacturer || '',
        item.status || ''
      ])
    );
  }

  function exportSales() {
    downloadCsv(
      'vendas.csv',
      ['Data', 'Cliente', 'Cliente ID', 'Pagamento', 'Subtotal', 'Desconto', 'Total', 'Valor pago', 'Troco', 'Itens', 'Operador'],
      (state.sales || []).map((sale) => [
        toDateTime(sale.createdAt),
        sale.customerName || '',
        sale.clientId || '',
        sale.paymentMethod || '',
        sale.subtotal ?? '',
        sale.discount ?? '',
        sale.total ?? '',
        sale.amountPaid ?? '',
        sale.change ?? '',
        (sale.items || []).map((item) => `${item.name} x${item.quantity}`).join(' | '),
        sale.cashierName || ''
      ])
    );
  }

  function exportDeliveries() {
    downloadCsv(
      'tele_entregas.csv',
      ['Cliente', 'Cliente ID', 'Telefone', 'Endereco', 'Data', 'Hora', 'Status', 'Valor', 'Pagamento', 'Descricao', 'Observacoes', 'Responsavel'],
      (state.deliveries || []).map((item) => [
        item.clientName || '',
        item.clientId || '',
        item.phone || '',
        item.address || '',
        item.date || '',
        item.time || '',
        item.status || '',
        item.amount ?? '',
        item.paymentMethod || '',
        item.description || '',
        item.notes || '',
        item.assignedUserName || ''
      ])
    );
  }

  function exportClients() {
    downloadCsv(
      'clientes.csv',
      ['Nome', 'Telefone', 'Endereco', 'Email', 'Observacoes', 'Status'],
      (state.clients || []).map((item) => [
        item.name || '',
        item.phone || '',
        item.address || '',
        item.email || '',
        item.notes || '',
        item.active === false ? 'Inativo' : 'Ativo'
      ])
    );
  }

  function exportInventoryMovements() {
    downloadCsv(
      'movimentacoes_estoque.csv',
      ['Data', 'Produto', 'Tipo', 'Quantidade', 'Estoque anterior', 'Estoque novo', 'Motivo', 'Observacoes', 'Usuario'],
      (state.inventoryMovements || []).map((item) => [
        toDateTime(item.createdAt),
        item.productName || '',
        item.type || '',
        item.quantity ?? '',
        item.previousQuantity ?? '',
        item.newQuantity ?? '',
        item.reason || '',
        item.notes || '',
        item.userName || ''
      ])
    );
  }

  function exportAuditLogs() {
    downloadCsv(
      'auditoria.csv',
      ['Data', 'Modulo', 'Acao', 'Tipo', 'Registro', 'Descricao', 'Usuario'],
      (state.auditLogs || []).map((item) => [
        toDateTime(item.createdAt),
        item.module || '',
        item.action || '',
        item.entityType || '',
        item.entityLabel || '',
        item.description || '',
        item.performedByName || ''
      ])
    );
  }

  return {
    exportProducts,
    exportSales,
    exportDeliveries,
    exportClients,
    exportInventoryMovements,
    exportAuditLogs
  };
}