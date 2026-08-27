import { createAuthUi } from './js/authUi.js';

let currentUser = null;
const requestedNext = new URLSearchParams(window.location.search).get('next');
let pendingDestination = requestedNext?.startsWith('/apps/') ? requestedNext : null;
if (pendingDestination) sessionStorage.setItem('dgLabNext', pendingDestination);

const authUi = createAuthUi({
  onSignedIn: async () => {
    currentUser = await authUi.refresh();
    const destination = pendingDestination || sessionStorage.getItem('dgLabNext') || '/';
    sessionStorage.removeItem('dgLabNext');
    window.location.assign(destination);
  },
  onSignedOut: () => window.location.reload()
});

document.querySelector('#launch-timing').addEventListener('click', async event => {
  if (currentUser) return;
  event.preventDefault();
  pendingDestination = '/apps/timing/';
  sessionStorage.setItem('dgLabNext', pendingDestination);
  document.querySelector('#open-auth').click();
});

authUi.refresh().then(user => { currentUser = user; }).catch(() => {});
