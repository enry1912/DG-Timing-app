import { createAuthToken, createSession, createToken, parseCookies } from '../_lib/auth.js';
import { error } from '../_lib/http.js';

const stateCookie = 'dg_google_state';

export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID) return error('Google sign-in is not configured yet.', 503);
  const state = createToken();
  await createAuthToken(env, null, 'google_state', { state }, 10);
  const redirectUri = new URL('/api/auth/google-callback', env.APP_ORIGIN).toString();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' }).toString();
  return new Response(null, { status: 302, headers: { location: url.toString(), 'set-cookie': `${stateCookie}=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
}

export async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || parseCookies(request)[stateCookie] !== state) return Response.redirect(new URL('/?auth=google_failed', env.APP_ORIGIN), 302);
  const stateRecord = await env.DB.prepare("SELECT token_hash FROM auth_tokens WHERE purpose = 'google_state' AND payload = ?1 AND expires_at > CURRENT_TIMESTAMP").bind(JSON.stringify({ state })).first();
  if (!stateRecord) return Response.redirect(new URL('/?auth=google_failed', env.APP_ORIGIN), 302);
  await env.DB.prepare('DELETE FROM auth_tokens WHERE token_hash = ?1').bind(stateRecord.token_hash).run();
  const redirectUri = new URL('/api/auth/google-callback', env.APP_ORIGIN).toString();
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  if (!tokenResponse.ok) return Response.redirect(new URL('/?auth=google_failed', env.APP_ORIGIN), 302);
  const tokenData = await tokenResponse.json();
  const infoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
  const info = await infoResponse.json();
  if (!infoResponse.ok || !info.sub || !info.email || !info.email_verified) return Response.redirect(new URL('/?auth=google_failed', env.APP_ORIGIN), 302);
  let identity = await env.DB.prepare("SELECT user_id FROM oauth_identities WHERE provider = 'google' AND provider_account_id = ?1").bind(info.sub).first();
  let userId = identity?.user_id;
  if (!userId) {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(String(info.email).toLowerCase()).first();
    userId = existing?.id || crypto.randomUUID();
    if (!existing) await env.DB.prepare('INSERT INTO users (id, email, email_verified_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)').bind(userId, String(info.email).toLowerCase()).run();
    else await env.DB.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?1').bind(userId).run();
    await env.DB.prepare("INSERT INTO oauth_identities (provider, provider_account_id, user_id) VALUES ('google', ?1, ?2)").bind(info.sub, userId).run();
  }
  return new Response(null, { status: 302, headers: { location: new URL('/?auth=google_success', env.APP_ORIGIN).toString(), 'set-cookie': await createSession(env, userId) } });
}
