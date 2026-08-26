import { requireSession, verifyPassword } from '../_lib/auth.js';
import { error, json, readJson } from '../_lib/http.js';

export async function onRequestPost({ request, env }) {
  const session = await requireSession(request, env); if (session.response) return session.response;
  const { confirmation, password } = await readJson(request);
  if (confirmation !== 'DELETE') return error('Type DELETE to confirm account deletion.');
  const credential = await env.DB.prepare('SELECT password_hash FROM password_credentials WHERE user_id = ?1').bind(session.user.id).first();
  if (credential && !(await verifyPassword(String(password || ''), credential.password_hash))) return error('Your password is incorrect.', 403);
  await env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(session.user.id).run();
  return json({ ok: true }, 200, { 'set-cookie': '__Host-dg_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
}
