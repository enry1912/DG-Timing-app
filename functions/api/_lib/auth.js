import { error } from './http.js';

const sessionCookie = '__Host-dg_session';
const encoder = new TextEncoder();
const passwordIterations = 100000; // Cloudflare Workers Web Crypto maximum for PBKDF2.

export const sessionCookieOptions = 'Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000';
export const clearSessionCookie = `${sessionCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function fromBase64(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: passwordIterations }, key, 256);
  return `pbkdf2-sha256$${passwordIterations}$${toBase64(salt)}$${toBase64(new Uint8Array(derived))}`;
}

export async function verifyPassword(password, storedValue) {
  const [algorithm, iterations, saltValue, hashValue] = String(storedValue).split('$');
  if (algorithm !== 'pbkdf2-sha256' || !iterations || !saltValue || !hashValue) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltValue), iterations: Number(iterations) }, key, 256));
  const expected = fromBase64(hashValue);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  actual.forEach((value, index) => { difference |= value ^ expected[index]; });
  return difference === 0;
}

export function parseCookies(request) {
  return Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(value => value.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}

export async function getSessionUser(request, env) {
  const token = parseCookies(request)[sessionCookie];
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(`SELECT users.id, users.email, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?1 AND sessions.expires_at > CURRENT_TIMESTAMP`).bind(tokenHash).first();
  return row || null;
}

export async function requireSession(request, env) {
  const user = await getSessionUser(request, env);
  return user ? { user } : { response: error('Sign in is required.', 401) };
}

export async function createSession(env, userId) {
  const token = createToken();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?1, ?2, ?3, datetime('now', '+30 days'))")
    .bind(crypto.randomUUID(), userId, await hashToken(token)).run();
  return `${sessionCookie}=${encodeURIComponent(token)}; ${sessionCookieOptions}`;
}

export async function createAuthToken(env, userId, purpose, payload = null, minutes = 30) {
  const token = createToken();
  await env.DB.prepare("INSERT INTO auth_tokens (token_hash, user_id, purpose, payload, expires_at) VALUES (?1, ?2, ?3, ?4, datetime('now', ?5))")
    .bind(await hashToken(token), userId, purpose, payload ? JSON.stringify(payload) : null, `+${minutes} minutes`).run();
  return token;
}

export async function consumeAuthToken(env, token, purpose) {
  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare("SELECT * FROM auth_tokens WHERE token_hash = ?1 AND purpose = ?2 AND expires_at > CURRENT_TIMESTAMP").bind(tokenHash, purpose).first();
  if (!row) return null;
  await env.DB.prepare('DELETE FROM auth_tokens WHERE token_hash = ?1').bind(tokenHash).run();
  return row;
}
