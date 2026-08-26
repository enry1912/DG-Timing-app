import { createSession, verifyPassword } from '../_lib/auth.js';
import { error, json, readJson } from '../_lib/http.js';

export async function onRequestPost({ request, env }) {
  try {
    const { identifier, password } = await readJson(request);
    const value = String(identifier || '').trim().toLowerCase();
    const credential = await env.DB.prepare('SELECT users.id, users.email_verified_at, password_credentials.password_hash FROM users JOIN password_credentials ON password_credentials.user_id = users.id WHERE users.email = ?1 OR users.username = ?1').bind(value).first();
    if (!credential || typeof password !== 'string' || !(await verifyPassword(password, credential.password_hash))) return error('Invalid sign-in details.', 401);
    if (!credential.email_verified_at) return error('Verify your email before signing in.', 403);
    return json({ ok: true }, 200, { 'set-cookie': await createSession(env, credential.id) });
  } catch { return error('Could not sign in.', 500); }
}
