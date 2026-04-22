import { renderBlocked } from './ui.js';

export function createClientsTabModule(ctx) {
  const {
    state,
    tabEls,
    clientsModule,
    accountsModule,
    hasPermission
  } = ctx;

  function render() {
    if (!hasPermission(state.currentUser, 'clients')) {
      tabEls.clients.innerHTML = renderBlocked();
      return;
    }

    tabEls.clients.innerHTML = `
      <div class="section-stack">
        <div id="clients-section-host"></div>
        <div id="accounts-section-host"></div>
      </div>
    `;

    const clientsHost = tabEls.clients.querySelector('#clients-section-host');
    const accountsHost = tabEls.clients.querySelector('#accounts-section-host');

    if (clientsHost) {
      clientsModule.renderInto?.(clientsHost);
    } else {
      clientsModule.render?.();
    }

    if (accountsHost) {
      accountsHost.innerHTML = accountsModule.renderEmbedded();
      accountsModule.bindEmbeddedEvents?.(accountsHost);
    }
  }

  return {
    render
  };
}