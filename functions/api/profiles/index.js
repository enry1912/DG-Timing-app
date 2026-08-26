import { requireSession } from '../../_lib/auth.js';
import { error, json, readJson } from '../../_lib/http.js';
import { listProfiles, saveProfile, validateProfile } from '../../_lib/profiles.js';

export async function onRequestGet({ request, env }) {
  const session = await requireSession(request, env); if (session.response) return session.response;
  return json({ profiles: await listProfiles(env, session.user.id) });
}
export async function onRequestPost({ request, env }) {
  const session = await requireSession(request, env); if (session.response) return session.response;
  const validation = validateProfile(await readJson(request)); if (validation.error) return error(validation.error);
  const id = crypto.randomUUID(); await saveProfile(env, session.user.id, id, validation.profile);
  return json({ id, ...validation.profile }, 201);
}
