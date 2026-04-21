import { showToast } from './ui.js';

export function createBackupModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    updateByPath,
    auditModule
  } = ctx;

  function sanitizeDocs(rows) {
    return rows.map((row) => {
      const copy = { ...row };
      delete copy.id;
      return copy;
    });
  }

  function buildBackupObject() {
    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      data: {
        users: sanitizeDocs(state.users || []),
        products: sanitizeDocs(state.products || []),
        sales: sanitizeDocs(state.sales || []),
        deliveries: sanitizeDocs(state.deliveries || []),
        clients: sanitizeDocs(state.clients || []),
        inventory_movements: sanitizeDocs(state.inventoryMovements || []),
        audit_logs: sanitizeDocs(state.auditLogs || []),
        cash_sessions: sanitizeDocs(state.cashSessions || []),
        accounts_receivable: sanitizeDocs(state.accountsReceivable || []),
        suppliers: sanitizeDocs(state.suppliers || []),
        accounts_payable: sanitizeDocs(state.accountsPayable || []),
        purchase_orders: sanitizeDocs(state.purchaseOrders || []),
        purchases: sanitizeDocs(state.purchases || []),
        settings: state.settings ? [{ ...state.settings }] : []
      }
    };
  }

  function downloadBackup() {
    const payload = buildBackupObject();
    const blob = new Blob(
      [JSON.stringify(payload, null, 2)],
      { type: 'application/json;charset=utf-8' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    link.href = url;
    link.download = `backup-gestao-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast('Backup exportado com sucesso.', 'success');
  }

  async function importCollectionDocs(collectionName, docs) {
    const refMap = {
      products: refs.products,
      deliveries: refs.deliveries,
      clients: refs.clients,
      cash_sessions: refs.cashSessions,
      accounts_receivable: refs.accountsReceivable,
      inventory_movements: refs.inventoryMovements,
      sales: refs.sales,
      settings: refs.settings,
      suppliers: refs.suppliers,
      accounts_payable: refs.accountsPayable,
      purchase_orders: refs.purchaseOrders,
      purchases: refs.purchases
    };

    for (const docItem of docs) {
      const clean = { ...docItem };
      delete clean.id;

      try {
        if (
          docItem.id &&
          [
            'products',
            'deliveries',
            'clients',
            'cash_sessions',
            'accounts_receivable',
            'suppliers',
            'accounts_payable',
            'settings'
          ].includes(collectionName)
        ) {
          await updateByPath(collectionName, docItem.id, clean);
          continue;
        }
      } catch (error) {
      }

      const collectionRef = refMap[collectionName];
      if (collectionRef) {
        await createDoc(collectionRef, clean);
      }
    }
  }

  async function importBackupFile(file) {
    if (!file) {
      throw new Error('Nenhum arquivo selecionado.');
    }

    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!parsed?.data) {
      throw new Error('Arquivo de backup inválido.');
    }

    for (const key of [
      'products',
      'deliveries',
      'clients',
      'cash_sessions',
      'accounts_receivable',
      'inventory_movements',
      'sales',
      'settings',
      'suppliers',
      'accounts_payable',
      'purchase_orders',
      'purchases'
    ]) {
      if (Array.isArray(parsed.data[key])) {
        await importCollectionDocs(key, parsed.data[key]);
      }
    }

    await auditModule.log({
      module: 'backup',
      action: 'import',
      entityType: 'system',
      entityId: '',
      entityLabel: 'Backup JSON',
      description: 'Importação de backup executada.'
    });

    showToast('Importação concluída.', 'success');
  }

  return {
    buildBackupObject,
    downloadBackup,
    importBackupFile
  };
}