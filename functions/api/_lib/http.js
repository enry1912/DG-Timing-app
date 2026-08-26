export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(request) {
  try { return await request.json(); } catch { throw new Error('Invalid JSON request body.'); }
}

export function requireMethod(request, method) {
  if (request.method !== method) return error('Method not allowed.', 405);
  return null;
}
