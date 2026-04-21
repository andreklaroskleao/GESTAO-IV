import { orderBy } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { initTheme, setTheme, getPreferredTheme } from './modules/theme.js';
import { renderBlocked, showToast, bindAsyncButton, debounce } from './modules/ui.js';
import { createPwaModule } from './modules/pwa.js';
import { createDashboardModule } from './modules/dashboard.js';
import { createProductsModule } from './modules/products.js';
import { createSalesModule } from './modules/sales.js';
import { createDeliveriesModule } from './modules/deliveries.js';
import { createReportsModule } from './modules/reports.js';
import { createUsersModule } from './modules/users.js';
import { createSettingsModule } from './modules/settings.js';
import { createInventoryModule } from './modules/inventory.js';
import { createAuditModule } from './modules/audit.js';
import { createClientsModule } from './modules/clients.js';
import { createClientsTabModule } from './modules/clients-tab.js';
import { createExportModule } from './modules/export.js';
import { createPrintModule } from './modules/print.js';
import { createBackupModule } from './modules/backup.js';
import { createExcelModule } from './modules/excel.js';
import { createSuppliersModule } from './modules/suppliers.js';
import { createReceivablesAlertsModule } from './modules/receivables-alerts.js';
import { createPayablesModule } from './modules/payables.js';
import { createPurchasesModule } from './modules/purchases.js';
import { createCashierModule } from './modules/cashier.js';
import { createAccountsModule } from './modules/accounts.js';
import { createNotificationsModule } from './modules/notifications.js';

import {
  login,
  watchAuth,
  logout,
  createManagedUser,
  updateManagedUser,
  deleteManagedUser,
  listUsers,
  changeCurrentPassword
} from './services/auth.js';

import {
  refs,
  createDoc,
  updateByPath,
  listCollection,
  subscribeCollection
} from './services/db.js';

import {
  ROLES,
  ACCESS_LEVELS,
  AREAS,
  currency,
  toNumber,
  formatDate,
  formatDateTime,
  hasPermission,
  paymentMethods,
  deliveryStatuses,
  canImportBackup,
  timestampFromDateTime
} from './services/utils.js';

const els = {
  loginScreen: document.getElementById('login-screen'),
  appScreen: document.getElementById('app-screen'),
  loginForm: document.getElementById('login-form'),
  logoutBtn: document.getElementById('logout-btn'),
  pageTitle: document.getElementById('page-title'),
  pageSubtitle: document.getElementById('page-subtitle'),
  currentUserName: document.getElementById('current-user-name'),
  storeNameSide: document.getElementById('store-name-side'),
  nav: document.getElementById('main-nav'),
  stockAlertBtn: document.getElementById('stock-alert-btn'),
  stockAlertCount: document.getElementById('stock-alert-count'),
  stockAlertList: document.getElementById('stock-alert-list'),
  alertsPanel: document.getElementById('alerts-panel'),
  notificationsBellBtn: document.getElementById('notifications-bell-btn'),
  notificationsBadge: document.getElementById('notifications-badge'),
  sidebarToggle: document.getElementById('sidebar-toggle'),
  mobileSidebarToggle: document.getElementById('mobile-sidebar-toggle'),
  globalSearchInput: document.getElementById('global-search-input'),
  globalSearchBtn: document.getElementById('global-search-btn')
};

const tabEls = {
  dashboard: document.getElementById('tab-dashboard'),
  sales: document.getElementById('tab-sales'),
  products: document.getElementById('tab-products'),
  reports: document.getElementById('tab-reports'),
  deliveries: document.getElementById('tab-deliveries'),
  clients: document.getElementById('tab-clients'),
  suppliers: document.getElementById('tab-suppliers'),
  purchases: document.getElementById('tab-purchases'),
  payables: document.getElementById('tab-payables'),
  users: document.getElementById('tab-users'),
  settings: document.getElementById('tab-settings')
};

const state = {
  currentUser: null,
  activeTab: 'dashboard',
  users: [],
  products: [],
  sales: [],
  deliveries: [],
  clients: [],
  suppliers: [],
  notifications: [],
  inventoryMovements: [],
  auditLogs: [],
  cashSessions: [],
  accountsReceivable: [],
  accountsPayable: [],
  purchaseOrders: [],
  purchases: [],
  cart: [],
  editingProductId: null,
  editingUserId: null,
  editingDeliveryId: null,
  editingClientId: null,
  editingSupplierId: null,
  editingPayableId: null,
  editingPurchaseId: null,
  unsubscribe: [],
  settings: {
    storeName: 'Minha Loja',
    address: 'Endereço da loja',
    lowStockThreshold: 5,
    warrantyText: 'Garantia conforme política interna da loja.',
    thermalWidth: '80mm',
    thermalCompactMode: false,
    thermalAutoPrint: false
  }
};

const SIDEBAR_STORAGE_KEY = 'gestao-sidebar-collapsed';

function isMobileViewport() {
  return window.matchMedia('(max-width: 920px)').matches;
}

function applySidebarState() {
  const collapsed = localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  document.body.classList.toggle('sidebar-collapsed', !isMobileViewport() && collapsed);

  if (isMobileViewport()) {
    document.body.classList.remove('sidebar-open');
  }
}

function toggleSidebar() {
  if (isMobileViewport()) {
    document.body.classList.toggle('sidebar-open');
    return;
  }

  const nextCollapsed = !document.body.classList.contains('sidebar-collapsed');
  document.body.classList.toggle('sidebar-collapsed', nextCollapsed);
  localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextCollapsed));
}

function closeMobileSidebar() {
  if (isMobileViewport()) {
    document.body.classList.remove('sidebar-open');
  }
}

initTheme();
applySidebarState();
window.addEventListener('resize', applySidebarState);

const auditModule = createAuditModule({
  state,
  refs,
  createDoc,
  formatDateTime
});

const inventoryModule = createInventoryModule({
  state,
  refs,
  createDoc,
  updateByPath,
  toNumber,
  currency,
  formatDateTime,
  auditModule
});

const printModule = createPrintModule({ state });

const backupModule = createBackupModule({
  state,
  refs,
  createDoc,
  updateByPath,
  auditModule
});

const excelModule = createExcelModule({
  state,
  refs,
  createDoc,
  updateByPath,
  auditModule
});

const exportModule = createExportModule({ state });

const clientsModule = createClientsModule({
  state,
  refs,
  createDoc,
  updateByPath,
  auditModule
});

const payablesModule = createPayablesModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  formatDateTime,
  hasPermission,
  auditModule
});

const purchasesModule = createPurchasesModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  hasPermission,
  inventoryModule,
  payablesModule,
  auditModule
});

const accountsModule = createAccountsModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  formatDateTime,
  hasPermission,
  clientsModule,
  auditModule
});

const receivablesAlertsModule = createReceivablesAlertsModule({ state });

const notificationsModule = createNotificationsModule({
  state,
  refs,
  createDoc,
  updateByPath
});

notificationsModule.bindBell();

const dashboardModule = createDashboardModule({
  state,
  tabEls,
  currency,
  formatDate,
  formatDateTime
});

const productsModule = createProductsModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  inventoryModule,
  auditModule
});

const salesModule = createSalesModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  formatDateTime,
  paymentMethods,
  clientsModule,
  printModule
});

const deliveriesModule = createDeliveriesModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  formatDate,
  paymentMethods,
  deliveryStatuses,
  timestampFromDateTime,
  clientsModule
});

const reportsModule = createReportsModule({
  state,
  tabEls,
  exportModule
});

const usersModule = createUsersModule({
  state,
  tabEls,
  ROLES,
  AREAS,
  ACCESS_LEVELS,
  createManagedUser,
  updateManagedUser,
  deleteManagedUser,
  listUsers,
  auditModule,
  hasPermission
});

const suppliersModule = createSuppliersModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  hasPermission,
  auditModule
});

const cashierModule = createCashierModule({
  state,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  formatDateTime,
  auditModule
});

const settingsModule = createSettingsModule({
  state,
  tabEls,
  listCollection,
  createDoc,
  updateByPath,
  refs,
  changeCurrentPassword,
  setTheme,
  getPreferredTheme,
  auditModule,
  cashierModule,
  backupModule,
  printModule,
  excelModule,
  canImportBackup
});

const clientsTabModule = createClientsTabModule({
  state,
  tabEls,
  clientsModule,
  accountsModule,
  hasPermission,
  updateByPath
});

const pwaModule = createPwaModule();
pwaModule.registerServiceWorker();
pwaModule.bindInstallPrompt();
pwaModule.bindOnlineOfflineFeedback();

function setScreen(isAuthenticated) {
  if (!els.loginScreen || !els.appScreen) return;
  els.loginScreen.classList.toggle('active', !isAuthenticated);
  els.appScreen.classList.toggle('active', isAuthenticated);
}

function activateTab(tab) {
  state.activeTab = tab;

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.remove('active');
  });

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });

  tabEls[tab]?.classList.add('active');

  const titleMap = {
    dashboard: 'Dashboard',
    sales: 'Vendas',
    products: 'Produtos',
    reports: 'Relatórios',
    deliveries: 'Tele-entregas',
    clients: 'Clientes',
    suppliers: 'Fornecedores',
    purchases: 'Compras',
    payables: 'Contas a pagar',
    users: 'Usuários',
    settings: 'Configurações'
  };

  if (els.pageTitle) els.pageTitle.textContent = titleMap[tab] || 'Sistema';
  if (els.pageSubtitle) els.pageSubtitle.textContent = `Área: ${titleMap[tab] || tab}.`;

  renderActiveTab();
}

function renderBlockedPanel(tab) {
  if (tabEls[tab]) {
    tabEls[tab].innerHTML = renderBlocked();
  }
}

function refreshNavigationPermissions() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    const allowed = hasPermission(state.currentUser, item.dataset.tab);
    item.disabled = !allowed;
    item.style.opacity = allowed ? '1' : '.45';
  });
}

function renderDashboard() {
  hasPermission(state.currentUser, 'dashboard') ? dashboardModule.render() : renderBlockedPanel('dashboard');
}

function renderProducts() {
  hasPermission(state.currentUser, 'products') ? productsModule.render() : renderBlockedPanel('products');
}

function renderSales() {
  hasPermission(state.currentUser, 'sales') ? salesModule.render() : renderBlockedPanel('sales');
}

function renderReports() {
  hasPermission(state.currentUser, 'reports') ? reportsModule.render() : renderBlockedPanel('reports');
}

function renderDeliveries() {
  hasPermission(state.currentUser, 'deliveries') ? deliveriesModule.render() : renderBlockedPanel('deliveries');
}

function renderClients() {
  hasPermission(state.currentUser, 'clients') ? clientsTabModule.render() : renderBlockedPanel('clients');
}

function renderSuppliers() {
  hasPermission(state.currentUser, 'suppliers') ? suppliersModule.render() : renderBlockedPanel('suppliers');
}

function renderPurchases() {
  hasPermission(state.currentUser, 'purchases') ? purchasesModule.render() : renderBlockedPanel('purchases');
}

function renderPayables() {
  hasPermission(state.currentUser, 'payables') ? payablesModule.render() : renderBlockedPanel('payables');
}

function renderUsers() {
  hasPermission(state.currentUser, 'users') ? usersModule.render() : renderBlockedPanel('users');
}

function renderSettings() {
  hasPermission(state.currentUser, 'settings') ? settingsModule.render() : renderBlockedPanel('settings');
}

function renderActiveTab() {
  ({
    dashboard: renderDashboard,
    sales: renderSales,
    products: renderProducts,
    reports: renderReports,
    deliveries: renderDeliveries,
    clients: renderClients,
    suppliers: renderSuppliers,
    purchases: renderPurchases,
    payables: renderPayables,
    users: renderUsers,
    settings: renderSettings
  }[state.activeTab] || renderDashboard)();
}

function renderApp() {
  renderDashboard();
  renderProducts();
  renderSales();
  renderReports();
  renderDeliveries();
  renderClients();
  renderSuppliers();
  renderPurchases();
  renderPayables();
  renderUsers();
  renderSettings();
  refreshNavigationPermissions();
  notificationsModule.generateSystemNotifications();
  notificationsModule.updateBellBadge();
}

function unsubscribeAll() {
  state.unsubscribe.forEach((unsubscribe) => {
    try {
      unsubscribe();
    } catch (error) {
      console.error(error);
    }
  });

  state.unsubscribe = [];
}

function resetAppState() {
  unsubscribeAll();

  state.currentUser = null;
  state.activeTab = 'dashboard';
  state.users = [];
  state.products = [];
  state.sales = [];
  state.deliveries = [];
  state.clients = [];
  state.suppliers = [];
  state.notifications = [];
  state.inventoryMovements = [];
  state.auditLogs = [];
  state.cashSessions = [];
  state.accountsReceivable = [];
  state.accountsPayable = [];
  state.purchaseOrders = [];
  state.purchases = [];
  state.cart = [];
  state.editingProductId = null;
  state.editingUserId = null;
  state.editingDeliveryId = null;
  state.editingClientId = null;
  state.editingSupplierId = null;
  state.editingPayableId = null;
  state.editingPurchaseId = null;

  document.body.classList.remove('sidebar-open');

  Object.values(tabEls).forEach((panel) => {
    if (panel) {
      panel.innerHTML = '';
      panel.classList.remove('active');
    }
  });

  const modalRoot = document.getElementById('modal-root');
  if (modalRoot) modalRoot.innerHTML = '';

  if (els.globalSearchInput) els.globalSearchInput.value = '';
  if (els.currentUserName) els.currentUserName.textContent = 'Usuário';
  if (els.pageTitle) els.pageTitle.textContent = 'Dashboard';
  if (els.pageSubtitle) els.pageSubtitle.textContent = 'Área: Dashboard.';
  if (els.loginForm) els.loginForm.reset();
  if (els.notificationsBadge) els.notificationsBadge.textContent = '0';

  closeActionsSheet();
}

function bootstrapData() {
  unsubscribeAll();

  state.unsubscribe.push(subscribeCollection('users', [orderBy('fullName')], (rows) => {
    state.users = rows;
    renderUsers();
    renderDashboard();
  }));

  state.unsubscribe.push(subscribeCollection('products', [orderBy('name')], (rows) => {
    state.products = rows.filter((item) => item.deleted !== true);
    renderProducts();
    renderSales();
    renderReports();
    renderDashboard();
    notificationsModule.generateSystemNotifications();
    notificationsModule.updateBellBadge();
  }));

  state.unsubscribe.push(subscribeCollection('sales', [orderBy('createdAt', 'desc')], (rows) => {
    state.sales = rows;
    renderSales();
    renderReports();
    renderDashboard();
  }));

  state.unsubscribe.push(subscribeCollection('deliveries', [orderBy('scheduledAt', 'desc')], (rows) => {
    state.deliveries = rows;
    renderDeliveries();
    renderDashboard();
    notificationsModule.generateSystemNotifications();
    notificationsModule.updateBellBadge();
  }));

  state.unsubscribe.push(subscribeCollection('settings', [orderBy('createdAt', 'desc')], (rows) => {
    const current = rows.find((item) => item.scope === 'system');
    if (current) {
      state.settings = { ...state.settings, ...current };
    }

    if (els.storeNameSide) {
      els.storeNameSide.textContent = state.settings.storeName || 'Gestão Comercial';
    }

    renderSettings();
    renderDashboard();
    notificationsModule.generateSystemNotifications();
    notificationsModule.updateBellBadge();
  }));

  state.unsubscribe.push(subscribeCollection('inventory_movements', [orderBy('createdAt', 'desc')], (rows) => {
    state.inventoryMovements = rows;
    renderProducts();
  }));

  state.unsubscribe.push(subscribeCollection('audit_logs', [orderBy('createdAt', 'desc')], (rows) => {
    state.auditLogs = rows;
    renderSettings();
    renderDashboard();
  }));

  state.unsubscribe.push(subscribeCollection('clients', [orderBy('name')], (rows) => {
    state.clients = rows.filter((item) => item.deleted !== true);
    renderSales();
    renderDeliveries();
    renderClients();
    renderReports();
  }));

  state.unsubscribe.push(subscribeCollection('suppliers', [orderBy('name')], (rows) => {
    state.suppliers = rows.filter((item) => item.deleted !== true);
    renderSuppliers();
    renderProducts();
    renderPayables();
    renderPurchases();
  }));

  state.unsubscribe.push(subscribeCollection('cash_sessions', [orderBy('openedAt', 'desc')], (rows) => {
    state.cashSessions = rows;
    renderSettings();
    renderDashboard();
  }));

  state.unsubscribe.push(subscribeCollection('accounts_receivable', [orderBy('createdAt', 'desc')], (rows) => {
    state.accountsReceivable = rows;
    renderClients();
    renderDashboard();
    notificationsModule.generateSystemNotifications();
    notificationsModule.updateBellBadge();
  }));

  state.unsubscribe.push(subscribeCollection('accounts_payable', [orderBy('createdAt', 'desc')], (rows) => {
    state.accountsPayable = rows;
    renderPayables();
    renderDashboard();
    notificationsModule.generateSystemNotifications();
    notificationsModule.updateBellBadge();
  }));

  state.unsubscribe.push(subscribeCollection('purchase_orders', [orderBy('createdAt', 'desc')], (rows) => {
    state.purchaseOrders = rows;
    renderPurchases();
  }));

  state.unsubscribe.push(subscribeCollection('purchases', [orderBy('receivedAt', 'desc')], (rows) => {
    state.purchases = rows;
    renderPurchases();
  }));

  state.unsubscribe.push(subscribeCollection('notifications', [orderBy('createdAt', 'desc')], (rows) => {
    state.notifications = rows.filter((item) => item.deleted !== true);
    notificationsModule.updateBellBadge();
  }));
}

async function handleLogin(event) {
  event.preventDefault();

  const values = Object.fromEntries(new FormData(els.loginForm).entries());

  try {
    const result = await login(values.email, values.password);
    state.currentUser = {
      ...result.profile,
      uid: result.user.uid,
      email: result.user.email
    };
    showToast('Login realizado com sucesso.', 'success');
  } catch (error) {
    alert(error.message || 'Erro ao entrar.');
  }
}

async function handleLogout() {
  try {
    await logout();
  } catch (error) {
    console.error('Erro ao sair:', error);
  } finally {
    resetAppState();
    setScreen(false);
  }
}

function closeActionsSheet() {
  const root = document.getElementById('modal-root');
  if (!root) return;

  const existing = root.querySelector('#global-actions-sheet-backdrop');
  if (existing) {
    existing.remove();
  }
}

function openActionsSheet(title, actions = []) {
  const root = document.getElementById('modal-root');
  if (!root) return;

  closeActionsSheet();

  root.insertAdjacentHTML('beforeend', `
    <div class="actions-sheet-backdrop" id="global-actions-sheet-backdrop">
      <div class="actions-sheet">
        <div class="actions-sheet-header">
          <h3 class="actions-sheet-title">${title}</h3>
          <button class="btn btn-secondary" type="button" id="global-actions-sheet-close">Fechar</button>
        </div>
        <div class="actions-sheet-actions" id="global-actions-sheet-actions"></div>
      </div>
    </div>
  `);

  const backdrop = document.getElementById('global-actions-sheet-backdrop');
  const actionsHost = document.getElementById('global-actions-sheet-actions');

  actions.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.className || 'btn btn-secondary';
    button.textContent = action.label || 'Ação';
    button.addEventListener('click', async () => {
      try {
        await action.onClick?.();
      } finally {
        closeActionsSheet();
      }
    });
    actionsHost.appendChild(button);
  });

  document.getElementById('global-actions-sheet-close')?.addEventListener('click', closeActionsSheet);

  backdrop?.addEventListener('click', (event) => {
    if (event.target.id === 'global-actions-sheet-backdrop') {
      closeActionsSheet();
    }
  });
}

function openConfirmDeleteModal({
  title = 'Confirmar exclusão',
  message = 'Deseja realmente excluir este registro?',
  confirmLabel = 'Excluir',
  onConfirm
} = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return;

  root.innerHTML = `
    <div class="modal-backdrop" id="confirm-delete-backdrop">
      <div class="modal-card confirm-delete-modal">
        <div class="section-header">
          <h2>${title}</h2>
          <button class="btn btn-secondary" type="button" id="confirm-delete-close">Fechar</button>
        </div>

        <div class="empty-state" style="text-align:left;">
          <strong>Atenção</strong>
          <span>${message}</span>
        </div>

        <div class="form-actions" style="margin-top:16px; justify-content:flex-end;">
          <button class="btn btn-secondary" type="button" id="confirm-delete-cancel">Cancelar</button>
          <button class="btn btn-danger" type="button" id="confirm-delete-confirm">${confirmLabel}</button>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    root.innerHTML = '';
  };

  root.querySelector('#confirm-delete-close')?.addEventListener('click', closeModal);
  root.querySelector('#confirm-delete-cancel')?.addEventListener('click', closeModal);
  root.querySelector('#confirm-delete-backdrop')?.addEventListener('click', (event) => {
    if (event.target.id === 'confirm-delete-backdrop') closeModal();
  });

  root.querySelector('#confirm-delete-confirm')?.addEventListener('click', async () => {
    try {
      await onConfirm?.();
    } finally {
      closeModal();
    }
  });
}

function buildGlobalSearchIndex() {
  const entries = [];

  (state.products || []).filter((item) => item.deleted !== true).forEach((item) => {
    entries.push({
      type: 'product',
      label: item.name || 'Produto',
      subtitle: `${item.barcode || 'Sem código'} · ${item.brand || 'Sem marca'}`,
      tab: 'products',
      search: [item.name, item.barcode, item.brand, item.supplier].join(' ').toLowerCase()
    });
  });

  (state.clients || []).filter((item) => item.deleted !== true).forEach((item) => {
    entries.push({
      type: 'client',
      label: item.name || 'Cliente',
      subtitle: `${item.phone || 'Sem telefone'} · ${item.email || 'Sem e-mail'}`,
      tab: 'clients',
      search: [item.name, item.phone, item.email, item.address].join(' ').toLowerCase()
    });
  });

  (state.suppliers || []).filter((item) => item.deleted !== true).forEach((item) => {
    entries.push({
      type: 'supplier',
      label: item.name || 'Fornecedor',
      subtitle: `${item.phone || 'Sem telefone'} · ${item.email || 'Sem e-mail'}`,
      tab: 'suppliers',
      search: [item.name, item.contactName, item.phone, item.email, item.document].join(' ').toLowerCase()
    });
  });

  (state.sales || []).filter((item) => item.deleted !== true).slice(0, 100).forEach((item) => {
    entries.push({
      type: 'sale',
      label: item.customerName || 'Venda balcão',
      subtitle: `${currency(item.total || 0)} · ${formatDateTime(item.createdAt)}`,
      tab: 'sales',
      search: [item.customerName, item.paymentMethod, item.cashierName].join(' ').toLowerCase()
    });
  });

  (state.deliveries || []).filter((item) => item.deleted !== true).forEach((item) => {
    entries.push({
      type: 'delivery',
      label: item.customerName || 'Entrega',
      subtitle: `${item.phone || 'Sem telefone'} · ${item.status || 'Sem status'}`,
      tab: 'deliveries',
      search: [item.customerName, item.phone, item.address, item.status].join(' ').toLowerCase()
    });
  });

  return entries;
}

function performGlobalSearch(rawTerm) {
  const term = String(rawTerm || '').trim().toLowerCase();

  if (!term) {
    showToast('Digite algo para pesquisar.', 'info');
    return;
  }

  const results = buildGlobalSearchIndex()
    .filter((item) => item.search.includes(term))
    .slice(0, 12);

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="global-search-modal-backdrop">
      <div class="modal-card">
        <div class="section-header">
          <h2>Busca global</h2>
          <button class="btn btn-secondary" type="button" id="global-search-modal-close">Fechar</button>
        </div>

        <div class="auth-hint" style="margin-bottom:12px;">
          Resultados para: "${rawTerm}"
        </div>

        <div class="stack-list">
          ${results.map((item) => `
            <button class="list-item search-result-item" type="button" data-search-go-tab="${item.tab}">
              <strong>${item.label}</strong>
              <span>${item.subtitle}</span>
            </button>
          `).join('') || '<div class="empty-state">Nenhum resultado encontrado.</div>'}
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalRoot.innerHTML = '';
  };

  modalRoot.querySelector('#global-search-modal-close')?.addEventListener('click', closeModal);
  modalRoot.querySelector('#global-search-modal-backdrop')?.addEventListener('click', (event) => {
    if (event.target.id === 'global-search-modal-backdrop') closeModal();
  });

  modalRoot.querySelectorAll('[data-search-go-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.searchGoTab;
      closeModal();

      if (hasPermission(state.currentUser, tab)) {
        activateTab(tab);
      } else {
        showToast('Você não possui acesso a essa área.', 'error');
      }
    });
  });
}

window.openActionsSheet = openActionsSheet;
window.closeActionsSheet = closeActionsSheet;
window.openConfirmDeleteModal = openConfirmDeleteModal;

if (els.loginForm) {
  els.loginForm.addEventListener('submit', handleLogin);
}

if (els.logoutBtn) {
  bindAsyncButton(els.logoutBtn, handleLogout, { busyLabel: 'Saindo...' });
}

els.nav?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-tab]');
  if (!btn) return;

  const tab = btn.dataset.tab;

  if (!hasPermission(state.currentUser, tab)) {
    showToast('Acesso não permitido.', 'error');
    return;
  }

  activateTab(tab);
  closeMobileSidebar();
});

els.sidebarToggle?.addEventListener('click', toggleSidebar);
els.mobileSidebarToggle?.addEventListener('click', toggleSidebar);

document.addEventListener('click', (event) => {
  if (!isMobileViewport()) return;

  const clickedInsideSidebar = event.target.closest('.sidebar');
  const clickedToggle = event.target.closest('#sidebar-toggle') || event.target.closest('#mobile-sidebar-toggle');

  if (!clickedInsideSidebar && !clickedToggle) {
    document.body.classList.remove('sidebar-open');
  }
});

const debouncedGlobalSearch = debounce(() => {
  const term = els.globalSearchInput?.value || '';
  if (term.trim().length >= 2) {
    performGlobalSearch(term);
  }
}, 220);

els.globalSearchBtn?.addEventListener('click', () => {
  performGlobalSearch(els.globalSearchInput?.value || '');
});

els.globalSearchInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    performGlobalSearch(event.currentTarget.value || '');
  }
});

els.globalSearchInput?.addEventListener('input', () => {
  if ((els.globalSearchInput?.value || '').trim().length >= 3) {
    debouncedGlobalSearch();
  }
});

watchAuth(async (user) => {
  state.currentUser = user;

  if (!user) {
    resetAppState();
    setScreen(false);
    return;
  }

  if (els.currentUserName) {
    els.currentUserName.textContent = `${user.fullName || ''} · ${user.accessLevel || 'standard'}`;
  }

  if (els.storeNameSide) {
    els.storeNameSide.textContent = state.settings.storeName || 'Gestão Comercial';
  }

  setScreen(true);
  bootstrapData();
  renderApp();
  activateTab('dashboard');
});