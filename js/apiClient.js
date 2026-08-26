async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

export const api = {
  session: () => request('/api/auth/session'),
  register: data => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: data => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  requestReset: email => request('/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, password) => request('/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  deleteAccount: data => request('/api/auth/delete-account', { method: 'POST', body: JSON.stringify(data) }),
  profiles: () => request('/api/profiles'),
  createProfile: profile => request('/api/profiles', { method: 'POST', body: JSON.stringify(profile) }),
  updateProfile: (id, profile) => request(`/api/profiles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(profile) }),
  deleteProfile: id => request(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
};
