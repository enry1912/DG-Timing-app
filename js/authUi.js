import { api } from './apiClient.js';

export function createAuthUi({ onSignedIn, onSignedOut }) {
  const dialog = document.querySelector('#auth-dialog');
  const openButton = document.querySelector('#open-auth');
  const closeButton = document.querySelector('#close-auth');
  const form = document.querySelector('#auth-form');
  const title = document.querySelector('#auth-title');
  const message = document.querySelector('#auth-message');
  const identifier = document.querySelector('#auth-identifier');
  const email = document.querySelector('#auth-email');
  const username = document.querySelector('#auth-username');
  const password = document.querySelector('#auth-password');
  const emailRow = document.querySelector('#auth-email-row');
  const usernameRow = document.querySelector('#auth-username-row');
  const submit = document.querySelector('#auth-submit');
  const modeButton = document.querySelector('#toggle-auth-mode');
  const accountBar = document.querySelector('#account-bar');
  let mode = 'login';

  function setMessage(text = '') { message.textContent = text; }
  function setMode(nextMode) {
    mode = nextMode;
    const registering = mode === 'register';
    title.textContent = registering ? 'Create account' : 'Sign in';
    identifier.closest('label').hidden = registering;
    identifier.required = !registering;
    emailRow.hidden = !registering; email.required = registering;
    usernameRow.hidden = !registering;
    password.autocomplete = registering ? 'new-password' : 'current-password';
    submit.textContent = registering ? 'Create account' : 'Sign in';
    modeButton.textContent = registering ? 'I already have an account' : 'Create an account';
    setMessage();
  }

  openButton.onclick = () => { setMode('login'); dialog.showModal(); identifier.focus(); };
  closeButton.onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
  modeButton.onclick = () => setMode(mode === 'login' ? 'register' : 'login');
  document.querySelector('#forgot-password').onclick = async () => {
    const input = prompt('Enter your account email to receive a reset link.');
    if (!input) return;
    try { await api.requestReset(input); setMessage('If that account exists, a reset link has been sent.'); } catch (caught) { setMessage(caught.message); }
  };
  form.onsubmit = async event => {
    event.preventDefault(); setMessage(); submit.disabled = true;
    try {
      if (mode === 'register') {
        await api.register({ email: email.value, username: username.value, password: password.value });
        setMessage('Check your email to verify your account.'); form.reset();
      } else {
        await api.login({ identifier: identifier.value, password: password.value });
        dialog.close(); await onSignedIn();
      }
    } catch (caught) { setMessage(caught.message); } finally { submit.disabled = false; }
  };

  return {
    async refresh() {
      try {
        const { user } = await api.session();
        accountBar.querySelector('#delete-account-button')?.remove();
        if (!user) { openButton.textContent = 'Sign in'; openButton.onclick = () => { setMode('login'); dialog.showModal(); identifier.focus(); }; return null; }
        openButton.textContent = `Sign out ${user.username || user.email}`;
        openButton.onclick = async () => { await api.logout(); await onSignedOut(); await this.refresh(); };
        const deleteButton = document.createElement('button');
        deleteButton.id = 'delete-account-button'; deleteButton.className = 'text-button'; deleteButton.type = 'button'; deleteButton.textContent = 'Delete account';
        deleteButton.onclick = async () => {
          if (!confirm('This permanently deletes your private profiles and account. Continue?')) return;
          const confirmation = prompt('Type DELETE to confirm.');
          if (confirmation !== 'DELETE') return;
          const accountPassword = prompt('Enter your password, or leave blank for a Google-only account.') || '';
          try { await api.deleteAccount({ confirmation, password: accountPassword }); window.location.reload(); } catch (caught) { alert(caught.message); }
        };
        accountBar.append(deleteButton);
        return user;
      } catch { openButton.textContent = 'Sign in'; return null; }
    }
  };
}
