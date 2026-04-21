import { showToast } from './ui.js';

export function createPwaModule() {
  let deferredPrompt = null;

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          await navigator.serviceWorker.register('./service-worker.js');
        } catch (error) {
          console.error('Erro ao registrar Service Worker:', error);
        }
      });
    }
  }

  function isRunningAsInstalledApp() {
    const standaloneByMedia = window.matchMedia('(display-mode: standalone)').matches;
    const standaloneByNavigator = window.navigator.standalone === true;
    return standaloneByMedia || standaloneByNavigator;
  }

  function bindInstallPrompt(buttonSelector = '#install-app-btn') {
    const getButton = () => document.querySelector(buttonSelector);

    function hideButton() {
      const button = getButton();
      if (button) button.classList.add('hidden');
    }

    function showButton() {
      const button = getButton();
      if (button) button.classList.remove('hidden');
    }

    function syncInstallButtonVisibility() {
      if (isRunningAsInstalledApp()) {
        hideButton();
        return;
      }

      if (deferredPrompt) {
        showButton();
      } else {
        hideButton();
      }
    }

    syncInstallButtonVisibility();

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      syncInstallButtonVisibility();
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      hideButton();
      showToast('Aplicativo instalado com sucesso.', 'success');
    });

    window.addEventListener('DOMContentLoaded', syncInstallButtonVisibility);
    window.addEventListener('focus', syncInstallButtonVisibility);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncInstallButtonVisibility();
    });

    document.addEventListener('click', async (event) => {
      const button = event.target.closest(buttonSelector);
      if (!button || !deferredPrompt) return;

      try {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch (error) {
        console.error('Erro ao abrir prompt de instalação:', error);
      } finally {
        deferredPrompt = null;
        syncInstallButtonVisibility();
      }
    });
  }

  function bindOnlineOfflineFeedback() {
    function showNetworkStatus() {
      if (navigator.onLine) {
        showToast('Conexão restaurada.', 'success');
      } else {
        showToast('Você está sem internet. Algumas funções podem ficar limitadas.', 'error');
      }
    }

    window.addEventListener('online', showNetworkStatus);
    window.addEventListener('offline', showNetworkStatus);
  }

  return {
    registerServiceWorker,
    bindInstallPrompt,
    bindOnlineOfflineFeedback
  };
}