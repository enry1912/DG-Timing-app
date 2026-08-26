import { getStepRanges } from './profileStore.js';

const escapeCsv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;

export function buildProfileCsv(profile) {
  const header = 'player,shot_type,description,tournament_link,step,start_seconds,end_seconds';
  const rows = getStepRanges(profile).map(step => [
    profile.name, profile.shotType, profile.description, profile.tournamentLink,
    step.step, step.start.toFixed(3), step.end.toFixed(3)
  ].map(escapeCsv).join(','));
  return [header, ...rows].join('\n');
}
