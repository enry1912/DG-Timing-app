import { onRequestPost as register } from './functions/api/auth/register.js';
import { onRequestPost as login } from './functions/api/auth/login.js';
import { onRequestPost as logout } from './functions/api/auth/logout.js';
import { onRequestGet as session } from './functions/api/auth/session.js';
import { onRequestGet as verify } from './functions/api/auth/verify.js';
import { onRequestPost as passwordReset } from './functions/api/auth/password-reset.js';
import { onRequestPost as deleteAccount } from './functions/api/auth/delete-account.js';
import { onRequestGet as google, handleCallback as googleCallback } from './functions/api/auth/google.js';
import { onRequestGet as getProfiles, onRequestPost as createProfile } from './functions/api/profiles/index.js';
import { onRequestPut as updateProfile, onRequestDelete as deleteProfile } from './functions/api/profiles/[id].js';
import { error } from './functions/api/_lib/http.js';

const routes = {
  'POST /api/auth/register': register,
  'POST /api/auth/login': login,
  'POST /api/auth/logout': logout,
  'GET /api/auth/session': session,
  'GET /api/auth/verify': verify,
  'POST /api/auth/password-reset': passwordReset,
  'POST /api/auth/delete-account': deleteAccount,
  'GET /api/auth/google': google,
  'GET /api/auth/google-callback': googleCallback,
  'GET /api/profiles': getProfiles,
  'POST /api/profiles': createProfile
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = routes[`${request.method} ${url.pathname}`];
    if (route) return route({ request, env, params: {} });
    const profileMatch = url.pathname.match(/^\/api\/profiles\/([\w-]+)$/);
    if (profileMatch) {
      const context = { request, env, params: { id: profileMatch[1] } };
      if (request.method === 'PUT') return updateProfile(context);
      if (request.method === 'DELETE') return deleteProfile(context);
    }
    if (url.pathname.startsWith('/api/')) return error('Not found.', 404);
    return env.ASSETS.fetch(request);
  }
};
