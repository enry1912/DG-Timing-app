import { consumeAuthToken, createAuthToken, hashPassword } from '../_lib/auth.js';
import { appUrl, sendEmail } from '../_lib/email.js';
import { error, json, readJson } from '../_lib/http.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    if (body.token) {
      if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) return error('Password must be 12–128 characters.');
      const record = await consumeAuthToken(env, body.token, 'reset_password');
      if (!record) return error('This reset link is invalid or expired.', 400);
      await env.DB.batch([
        env.DB.prepare('UPDATE password_credentials SET password_hash = ?1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?2').bind(await hashPassword(body.password), record.user_id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(record.user_id)
      ]);
      return json({ message: 'Password reset. Sign in with your new password.' });
    }
    const email = String(body.email || '').trim().toLowerCase();
    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?1 AND email_verified_at IS NOT NULL').bind(email).first();
    if (user) {
      const token = await createAuthToken(env, user.id, 'reset_password');
      await sendEmail(env, { to: email, subject: 'Reset your Disc Golf Timing password', html: `<p>Use this link to reset your password:</p><p><a href="${appUrl(env, `/?reset=${encodeURIComponent(token)}`)}">Reset password</a></p>` });
    }
    return json({ message: 'If that account exists, a reset link has been sent.' });
  } catch (caught) { return error(caught.message || 'Could not process password reset.', 500); }
}
