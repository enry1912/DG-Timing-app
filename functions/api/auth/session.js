import { getSessionUser } from '../_lib/auth.js';
import { json } from '../_lib/http.js';
export async function onRequestGet({ request, env }) { return json({ user: await getSessionUser(request, env) }); }
