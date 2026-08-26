import { consumeAuthToken } from '../_lib/auth.js';
export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  const record = token && await consumeAuthToken(env, token, 'verify_email');
  if (record) await env.DB.prepare("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(record.user_id).run();
  return Response.redirect(new URL(record ? '/?verified=1' : '/?verification=invalid', env.APP_ORIGIN).toString(), 302);
}
