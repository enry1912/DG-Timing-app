import { createAuthUi } from './js/authUi.js';

let currentUser = null;
const requestedNext = new URLSearchParams(window.location.search).get('next');
const storedDestination = sessionStorage.getItem('dgLabNext');
let pendingDestination = requestedNext?.startsWith('/apps/')
  ? requestedNext
  : storedDestination?.startsWith('/apps/')
    ? storedDestination
    : null;
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
  event.preventDefault();
  const signedInUser = currentUser || await authUi.refresh().catch(() => null);
  if (signedInUser) {
    window.location.assign('/apps/timing/');
    return;
  }
  pendingDestination = '/apps/timing/';
  sessionStorage.setItem('dgLabNext', pendingDestination);
  document.querySelector('#open-auth').click();
});

authUi.refresh().then(user => {
  currentUser = user;
  const returnedFromGoogle = new URLSearchParams(window.location.search).get('auth') === 'google_success';
  if (user && returnedFromGoogle && pendingDestination) {
    sessionStorage.removeItem('dgLabNext');
    window.location.replace(pendingDestination);
  }
}).catch(() => {});
