import { requireSession } from '../../_lib/auth.js';
import { error, json, readJson } from '../../_lib/http.js';
import { saveProfile, validateProfile } from '../../_lib/profiles.js';

export async function onRequestPut({ request, env, params }) {
  const session = await requireSession(request, env); if (session.response) return session.response;
  const exists = await env.DB.prepare('SELECT id FROM player_profiles WHERE id = ?1 AND owner_user_id = ?2').bind(params.id, session.user.id).first();
  if (!exists) return error('Profile not found.', 404);
  const validation = validateProfile(await readJson(request)); if (validation.error) return error(validation.error);
  await saveProfile(env, session.user.id, params.id, validation.profile); return json({ id: params.id, ...validation.profile });
}
export async function onRequestDelete({ request, env, params }) {
  const session = await requireSession(request, env); if (session.response) return session.response;
  await env.DB.prepare('DELETE FROM player_profiles WHERE id = ?1 AND owner_user_id = ?2').bind(params.id, session.user.id).run();
  return json({ ok: true });
}
