const STORAGE_PREFIX = 'gestao_iv_ux';

export function createOperationalUxModule({ tabEls = {}, state = {} } = {}) {
  let openTabHandler = null;
  let registeredTabs = [];
  let currentTab = '';
  let isHydrating = false;
  let observer = null;

  const TAB_CONFIG = {
    sales: {
      focusSelector: '#sale-product-search',
      persistSelectors: [
        '#sale-product-search',
        '#sale-customer-name',
        '#sale-customer-cpf',
        '#sale-payment-method',
        '#sales-filter-customer',
        '#sales-filter-payment',
        '#sales-filter-date-from',
        '#sales-filter-date-to'
      ]
    },
    products: {
      focusSelector: '#product-filter-query',
      persistSelectors: [
        '#product-filter-query',
        '#product-filter-category',
        '#product-filter-supplier',
        '#product-filter-status',
        '#product-filter-stock'
      ]
    },
    payables: {
      focusSelector: '#payable-filter-supplier',
      persistSelectors: [
        '#payable-filter-supplier',
        '#payable-filter-status',
        '#payable-filter-date-from',
        '#payable-filter-date-to'
      ]
    },
    clients: {
      focusSelector: '#account-filter-client',
      persistSelectors: [
        '#account-filter-client',
        '#account-filter-status',
        '#account-filter-date-from',
        '#account-filter-date-to'
      ]
    },
    settings: {
      focusSelector: 'input[name="storeName"]',
      persistSelectors: [
        '#audit-filter-module',
        '#audit-filter-action',
        '#audit-filter-entity-type',
        '#audit-filter-entity-label',
        '#audit-filter-user',
        '#audit-filter-date-from',
        '#audit-filter-date-to'
      ]
    }
  };

  function getStorageKey(name) {
    return `${STORAGE_PREFIX}_${name}`;
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(getStorageKey(key), JSON.stringify(value));
    } catch (error) {
      console.warn('Falha ao salvar UX state:', error);
    }
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(getStorageKey(key));
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn('Falha ao ler UX state:', error);
      return fallback;
    }
  }

  function saveActiveTab(tabName) {
    saveJson('active_tab', tabName || '');
  }

  function loadActiveTab() {
    return loadJson('active_tab', '');
  }

  function saveFilterState(tabName, values) {
    saveJson(`filters_${tabName}`, values || {});
  }

  function loadFilterState(tabName) {
    return loadJson(`filters_${tabName}`, {});
  }

  function getTabConfig(tabName) {
    return TAB_CONFIG[tabName] || { focusSelector: '', persistSelectors: [] };
  }

  function collectTabValues(tabName) {
    const tabEl = tabEls[tabName];
    if (!tabEl) return {};

    const config = getTabConfig(tabName);
    const values = {};

    config.persistSelectors.forEach((selector) => {
      const el = tabEl.querySelector(selector);
      if (!el) return;

      if (el.type === 'checkbox') {
        values[selector] = Boolean(el.checked);
      } else {
        values[selector] = el.value ?? '';
      }
    });

    return values;
  }

  function restoreTabValues(tabName) {
    const tabEl = tabEls[tabName];
    if (!tabEl) return;

    const config = getTabConfig(tabName);
    const saved = loadFilterState(tabName);

    isHydrating = true;

    config.persistSelectors.forEach((selector) => {
      const el = tabEl.querySelector(selector);
      if (!el) return;
      if (!(selector in saved)) return;

      if (el.type === 'checkbox') {
        el.checked = Boolean(saved[selector]);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        el.value = saved[selector] ?? '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    isHydrating = false;
  }

  function persistCurrentTabFilters() {
    if (!currentTab) return;
    saveFilterState(currentTab, collectTabValues(currentTab));
  }

  function focusPrimaryField(tabName) {
    const tabEl = tabEls[tabName];
    if (!tabEl || !tabEl.classList.contains('active')) return;

    const config = getTabConfig(tabName);
    if (!config.focusSelector) return;

    const target = tabEl.querySelector(config.focusSelector);
    if (!target || typeof target.focus !== 'function') return;

    const tag = String(document.activeElement?.tagName || '').toLowerCase();
    const activeIsTyping =
      ['input', 'textarea', 'select'].includes(tag) ||
      document.activeElement?.isContentEditable;

    if (activeIsTyping) return;

    window.requestAnimationFrame(() => {
      target.focus();
      if (typeof target.select === 'function' && target.tagName === 'INPUT') {
        target.select();
      }
    });
  }

  function closeOpenModalWithEsc() {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return false;
    if (!modalRoot.innerHTML.trim()) return false;

    const closeButton =
      modalRoot.querySelector('#notifications-close-btn') ||
      modalRoot.querySelector('#sale-client-modal-close') ||
      modalRoot.querySelector('#sale-details-close-btn') ||
      modalRoot.querySelector('#edit-sale-close-btn') ||
      modalRoot.querySelector('#delete-sale-close-btn') ||
      modalRoot.querySelector('#inventory-modal-close') ||
      modalRoot.querySelector('#product-form-close-btn') ||
      modalRoot.querySelector('#product-movements-close-btn') ||
      modalRoot.querySelector('#payable-form-cancel-btn') ||
      modalRoot.querySelector('#payable-payment-modal-close') ||
      modalRoot.querySelector('#payable-details-modal-close') ||
      modalRoot.querySelector('#delete-payable-close-btn') ||
      modalRoot.querySelector('#account-modal-close') ||
      modalRoot.querySelector('#account-details-close') ||
      modalRoot.querySelector('#account-edit-close') ||
      modalRoot.querySelector('#account-delete-close');

    if (closeButton) {
      closeButton.click();
      return true;
    }

    modalRoot.innerHTML = '';
    return true;
  }

  function submitOpenModalWithShortcut() {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot || !modalRoot.innerHTML.trim()) return false;

    const form = modalRoot.querySelector('form');
    if (!form) return false;

    const submitButton =
      form.querySelector('button[type="submit"]') ||
      form.querySelector('.btn.btn-primary');

    if (submitButton) {
      submitButton.click();
      return true;
    }

    form.requestSubmit?.();
    return true;
  }

  function focusGlobalSearch() {
    const target =
      document.querySelector('#global-search-input') ||
      document.querySelector('#sale-product-search') ||
      document.querySelector('#product-filter-query');

    if (target && typeof target.focus === 'function') {
      target.focus();
      target.select?.();
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (closeOpenModalWithEsc()) {
        event.preventDefault();
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      if (submitOpenModalWithShortcut()) {
        event.preventDefault();
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && event.key === '/') {
      focusGlobalSearch();
      event.preventDefault();
      return;
    }

    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const numeric = Number(event.key);
      if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= registeredTabs.length) {
        const tabName = registeredTabs[numeric - 1];
        if (tabName && typeof openTabHandler === 'function') {
          openTabHandler(tabName);
          event.preventDefault();
        }
      }
    }
  }

  function onInputChange(event) {
    if (isHydrating) return;
    if (!currentTab) return;

    const tabEl = tabEls[currentTab];
    if (!tabEl) return;
    if (!tabEl.contains(event.target)) return;

    const config = getTabConfig(currentTab);
    const targetId = event.target?.id ? `#${event.target.id}` : '';
    if (!config.persistSelectors.includes(targetId)) return;

    persistCurrentTabFilters();
  }

  function observeActiveTab() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    const tabEl = tabEls[currentTab];
    if (!tabEl) return;

    observer = new MutationObserver(() => {
      restoreTabValues(currentTab);
    });

    observer.observe(tabEl, {
      childList: true,
      subtree: true
    });
  }

  function onTabActivated(tabName) {
    currentTab = tabName || '';
    if (!currentTab) return;

    saveActiveTab(currentTab);

    window.requestAnimationFrame(() => {
      restoreTabValues(currentTab);
      observeActiveTab();

      window.setTimeout(() => {
        restoreTabValues(currentTab);
        focusPrimaryField(currentTab);
      }, 40);
    });
  }

  function init({ tabs = [], openTab } = {}) {
    registeredTabs = Array.isArray(tabs) ? tabs.filter(Boolean) : [];
    openTabHandler = typeof openTab === 'function' ? openTab : null;

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('input', onInputChange, true);
    document.addEventListener('change', onInputChange, true);
  }

  return {
    init,
    onTabActivated,
    persistCurrentTabFilters,
    loadActiveTab
  };
}