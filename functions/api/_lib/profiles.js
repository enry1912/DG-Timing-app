const stepNames = ['R1', 'L', 'R2', 'X', 'P'];

export function validateProfile(input) {
  const name = String(input?.name || '').trim();
  const steps = Array.isArray(input?.steps) ? input.steps : [];
  if (!name || name.length > 40) return { error: 'Player name must be 1–40 characters.' };
  if (!['R2', 'X', 'P'].every(step => steps.some(item => item?.step === step))) return { error: 'R2, X and Plant are required.' };
  const cleanSteps = steps.map(item => ({ step: item?.step, start: Number(item?.start), end: Number(item?.end) }));
  if (cleanSteps.length !== new Set(cleanSteps.map(item => item.step)).size || cleanSteps.some(item => !stepNames.includes(item.step) || !Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < 0 || item.end < item.start)) return { error: 'Step timings are invalid.' };
  return { profile: { name, shotType: String(input.shotType || '').slice(0, 40), tournamentLink: String(input.tournamentLink || '').slice(0, 500), description: String(input.description || '').slice(0, 100), steps: cleanSteps } };
}

export async function listProfiles(env, userId) {
  const result = await env.DB.prepare('SELECT id, name, shot_type, tournament_link, description FROM player_profiles WHERE owner_user_id = ?1 ORDER BY updated_at DESC').bind(userId).all();
  const profiles = [];
  for (const row of result.results) {
    const steps = await env.DB.prepare('SELECT step_name, start_seconds, end_seconds FROM profile_steps WHERE profile_id = ?1 ORDER BY start_seconds').bind(row.id).all();
    profiles.push({ id: row.id, name: row.name, shotType: row.shot_type, tournamentLink: row.tournament_link, description: row.description, steps: steps.results.map(step => ({ step: step.step_name, start: step.start_seconds, end: step.end_seconds })) });
  }
  return profiles;
}

export async function saveProfile(env, userId, id, profile) {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO player_profiles (id, owner_user_id, name, shot_type, tournament_link, description) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET name = excluded.name, shot_type = excluded.shot_type, tournament_link = excluded.tournament_link, description = excluded.description, updated_at = CURRENT_TIMESTAMP WHERE player_profiles.owner_user_id = excluded.owner_user_id").bind(id, userId, profile.name, profile.shotType, profile.tournamentLink, profile.description),
    env.DB.prepare('DELETE FROM profile_steps WHERE profile_id = ?1').bind(id)
  ]);
  await env.DB.batch(profile.steps.map(step => env.DB.prepare('INSERT INTO profile_steps (profile_id, step_name, start_seconds, end_seconds) VALUES (?1, ?2, ?3, ?4)').bind(id, step.step, step.start, step.end)));
}
