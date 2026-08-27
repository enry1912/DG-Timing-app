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
  const resetToken = new URLSearchParams(window.location.search).get('reset');

  function setMessage(text = '') { message.textContent = text; }
  function setMode(nextMode) {
    mode = nextMode;
    const registering = mode === 'register';
    const resetting = mode === 'reset';
    title.textContent = registering ? 'Create account' : resetting ? 'Set a new password' : 'Sign in';
    identifier.closest('label').hidden = registering || resetting;
    identifier.required = !registering && !resetting;
    emailRow.hidden = !registering; email.required = registering;
    usernameRow.hidden = !registering;
    password.autocomplete = registering || resetting ? 'new-password' : 'current-password';
    submit.textContent = registering ? 'Create account' : resetting ? 'Save new password' : 'Sign in';
    modeButton.hidden = resetting;
    document.querySelector('#forgot-password').hidden = resetting;
    document.querySelector('#google-sign-in').hidden = resetting;
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
      } else if (mode === 'reset') {
        await api.resetPassword(resetToken, password.value);
        history.replaceState({}, '', window.location.pathname);
        setMode('login'); form.reset(); setMessage('Password reset. You can now sign in.');
      } else {
        await api.login({ identifier: identifier.value, password: password.value });
        dialog.close(); await onSignedIn();
      }
    } catch (caught) { setMessage(caught.message); } finally { submit.disabled = false; }
  };

  if (resetToken) {
    setMode('reset');
    dialog.showModal();
    password.focus();
  }

  async function refresh() {
      try {
        const { user } = await api.session();
        accountBar.querySelector('#delete-account-button')?.remove();
        if (!user) {
          openButton.className = 'btn btn-outline-light btn-sm account-action';
          openButton.textContent = 'Sign in';
          openButton.onclick = () => { setMode('login'); dialog.showModal(); identifier.focus(); };
          return null;
        }
        openButton.className = 'btn btn-outline-light btn-sm account-action';
        openButton.textContent = `Sign out ${user.username || user.email}`;
        openButton.onclick = async () => {
          openButton.disabled = true;
          try {
            await api.logout();
            await onSignedOut();
          } catch (caught) {
            setMessage(caught.message || 'Could not sign out. Please try again.');
            dialog.showModal();
          } finally {
            openButton.disabled = false;
          }
        };
        const deleteButton = document.createElement('button');
        deleteButton.id = 'delete-account-button'; deleteButton.className = 'btn btn-outline-danger btn-sm account-action'; deleteButton.type = 'button'; deleteButton.textContent = 'Delete account';
        deleteButton.onclick = async () => {
          if (!confirm('This permanently deletes your private profiles and account. Continue?')) return;
          const confirmation = prompt('Type DELETE to confirm.');
          if (confirmation !== 'DELETE') return;
          const accountPassword = prompt('Enter your password, or leave blank for a Google-only account.') || '';
          try { await api.deleteAccount({ confirmation, password: accountPassword }); window.location.reload(); } catch (caught) { alert(caught.message); }
        };
        accountBar.append(deleteButton);
        return user;
      } catch {
        openButton.className = 'btn btn-outline-light btn-sm account-action';
        openButton.textContent = 'Sign in';
        return null;
      }
  }

  return { refresh };
}
