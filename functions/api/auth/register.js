import { createAuthToken, hashPassword } from '../_lib/auth.js';
import { appUrl, sendEmail } from '../_lib/email.js';
import { error, json, readJson } from '../_lib/http.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-zA-Z0-9_.-]{3,30}$/;

export async function onRequestPost({ request, env }) {
  try {
    const { email, username, password } = await readJson(request);
    const normalEmail = String(email || '').trim().toLowerCase();
    const normalUsername = String(username || '').trim().toLowerCase() || null;
    if (!emailPattern.test(normalEmail)) return error('Enter a valid email address.');
    if (normalUsername && !usernamePattern.test(normalUsername)) return error('Username must be 3–30 letters, numbers, dots, dashes, or underscores.');
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) return error('Password must be 12–128 characters.');
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1 OR (?2 IS NOT NULL AND username = ?2)').bind(normalEmail, normalUsername).first();
    if (existing) return error('That email or username is already registered.', 409);
    const userId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (id, email, username) VALUES (?1, ?2, ?3)').bind(userId, normalEmail, normalUsername),
      env.DB.prepare('INSERT INTO password_credentials (user_id, password_hash) VALUES (?1, ?2)').bind(userId, await hashPassword(password))
    ]);
    const token = await createAuthToken(env, userId, 'verify_email', null, 1440);
    await sendEmail(env, { to: normalEmail, subject: 'Verify your Disc Golf Timing account', html: `<p>Verify your email to activate your account:</p><p><a href="${appUrl(env, `/api/auth/verify?token=${encodeURIComponent(token)}`)}">Verify email</a></p>` });
    return json({ message: 'Check your email to verify your account.' }, 201);
  } catch (caught) { return error(caught.message || 'Could not create account.', 500); }
}
