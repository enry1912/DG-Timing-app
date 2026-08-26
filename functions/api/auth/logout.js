import { clearSessionCookie, hashToken, parseCookies } from '../_lib/auth.js';
import { json } from '../_lib/http.js';
export async function onRequestPost({ request, env }) {
  const token = parseCookies(request).__Host-dg_session;
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await hashToken(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie });
}
