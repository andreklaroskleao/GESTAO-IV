import { showToast } from './ui.js';

export function createBackupModule(ctx) {
  const { state, refs, createDoc, updateByPath, auditModule } = ctx;

  const SUPPORTED_COLLECTIONS = [
    'users',
    'products',
    'sales',
    'deliveries',
    'clients',
    'inventory_movements',
    'audit_logs',
    'cash_sessions',
    'accounts_receivable',
    'suppliers',
    'accounts_payable',
    'purchase_orders',
    'purchases',
    'settings',
    'notifications'
  ];

  const IMPORTABLE_COLLECTIONS = [
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
    'purchases',
    'notifications'
  ];

  const UPDATE_BY_ID_COLLECTIONS = [
    'products',
    'deliveries',
    'clients',
    'cash_sessions',
    'accounts_receivable',
    'suppliers',
    'accounts_payable',
    'settings',
    'notifications'
  ];

  function sanitizeDocs(rows) {
    return (rows || []).map((row) => {
      const copy = { ...row };
      delete copy.id;
      return copy;
    });
  }

  function buildBackupObject() {
    return {
      exportedAt: new Date().toISOString(),
      version: 2,
      appVersion: 'GESTAO-IV',
      exportedBy: {
        uid: String(state.currentUser?.uid || ''),
        name: String(state.currentUser?.fullName || ''),
        email: String(state.currentUser?.email || '')
      },
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
        notifications: sanitizeDocs(state.notifications || []),
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

  function getCollectionRefMap() {
    return {
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
      purchases: refs.purchases,
      notifications: refs.notifications
    };
  }

  function normalizeParsedBackup(parsed) {
    if (parsed?.data && typeof parsed.data === 'object') {
      return parsed;
    }

    if (parsed?.collections && typeof parsed.collections === 'object') {
      return {
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        version: parsed.version || 1,
        appVersion: parsed.appVersion || 'GESTAO-IV',
        exportedBy: parsed.exportedBy || {},
        data: parsed.collections
      };
    }

    throw new Error('Arquivo de backup inválido.');
  }

  function validateBackupShape(parsed) {
    const backup = normalizeParsedBackup(parsed);

    if (!backup.data || typeof backup.data !== 'object') {
      throw new Error('Backup sem estrutura de dados válida.');
    }

    const foundCollections = Object.keys(backup.data);
    if (!foundCollections.length) {
      throw new Error('Backup vazio.');
    }

    const recognizedCollections = foundCollections.filter((key) =>
      SUPPORTED_COLLECTIONS.includes(key)
    );

    if (!recognizedCollections.length) {
      throw new Error('Nenhuma coleção compatível foi encontrada no backup.');
    }

    recognizedCollections.forEach((key) => {
      if (!Array.isArray(backup.data[key])) {
        throw new Error(`A coleção "${key}" precisa ser uma lista.`);
      }
    });

    return backup;
  }

  async function importCollectionDocs(collectionName, docs) {
    const refMap = getCollectionRefMap();
    const collectionRef = refMap[collectionName];

    const summary = {
      collectionName,
      received: Array.isArray(docs) ? docs.length : 0,
      updated: 0,
      created: 0,
      skipped: 0
    };

    if (!Array.isArray(docs) || !docs.length) {
      return summary;
    }

    if (!collectionRef && !UPDATE_BY_ID_COLLECTIONS.includes(collectionName)) {
      summary.skipped += docs.length;
      return summary;
    }

    for (const docItem of docs) {
      const clean = { ...docItem };
      delete clean.id;

      const isUpdateCandidate =
        docItem?.id &&
        UPDATE_BY_ID_COLLECTIONS.includes(collectionName);

      if (isUpdateCandidate) {
        try {
          await updateByPath(collectionName, docItem.id, clean);
          summary.updated += 1;
          continue;
        } catch (error) {
          // Se não conseguir atualizar, tenta criar.
        }
      }

      if (collectionRef) {
        await createDoc(collectionRef, clean);
        summary.created += 1;
      } else {
        summary.skipped += 1;
      }
    }

    return summary;
  }

  async function importBackupFile(file) {
    if (!file) {
      throw new Error('Nenhum arquivo selecionado.');
    }

    if (!String(file.name || '').toLowerCase().endsWith('.json')) {
      throw new Error('Selecione um arquivo JSON válido.');
    }

    const text = await file.text();
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error('O arquivo selecionado não contém JSON válido.');
    }

    const backup = validateBackupShape(parsed);
    const summaries = [];

    for (const key of IMPORTABLE_COLLECTIONS) {
      if (Array.isArray(backup.data[key])) {
        const result = await importCollectionDocs(key, backup.data[key]);
        summaries.push(result);
      }
    }

    const totals = summaries.reduce(
      (acc, item) => {
        acc.received += item.received;
        acc.updated += item.updated;
        acc.created += item.created;
        acc.skipped += item.skipped;
        return acc;
      },
      { received: 0, updated: 0, created: 0, skipped: 0 }
    );

    await auditModule.log({
      module: 'backup',
      action: 'import',
      entityType: 'system',
      entityId: '',
      entityLabel: 'Backup JSON',
      description: 'Importação de backup executada.',
      metadata: {
        fileName: file.name || '',
        exportedAt: backup.exportedAt || '',
        version: backup.version || 1,
        appVersion: backup.appVersion || '',
        totals,
        summaries
      }
    });

    showToast(
      `Importação concluída. Criados: ${totals.created} · Atualizados: ${totals.updated} · Ignorados: ${totals.skipped}.`,
      'success'
    );
  }

  return {
    buildBackupObject,
    downloadBackup,
    importBackupFile
  };
}