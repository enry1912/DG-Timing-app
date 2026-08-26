export const stepNames = ['R1', 'L', 'R2', 'X', 'P'];

const referenceVideoUrl = './videos/2025%20USDGC%20%20MPO%20FINALF9%20%20Barela%20H3.mp4';

const defaultProfiles = {
  anthonyBarela: {
    name: 'Anthony Barela',
    steps: [
      { step: 'R1', start: 0.292, end: 0.925 },
      { step: 'L', start: 0.775, end: 1.292 },
      { step: 'R2', start: 1.258, end: 1.525 },
      { step: 'X', start: 1.525, end: 1.925 },
      { step: 'P', start: 1.758, end: 2.654 }
    ],
    videoUrl: referenceVideoUrl
  }
};

export function isValidProfile(profile) {
  if (!profile || typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 40) return false;
  if (Array.isArray(profile.steps) || Array.isArray(profile.markers)) {
    const markers = getMarkers(profile);
    return markers.every(marker => stepNames.includes(marker.step) && Number.isFinite(marker.time) && marker.time >= 0) &&
      ['R2', 'X', 'P'].every(step => markers.some(marker => marker.step === step));
  }
  return Array.isArray(profile.timings) && profile.timings.length === 4 &&
    profile.timings.every(timing => Number.isFinite(timing) && timing >= 0.1 && timing <= 3);
}

export function getMarkers(profile) {
  if (Array.isArray(profile.steps)) return profile.steps.map(({ step, start }) => ({ step, time: start }));
  if (Array.isArray(profile.markers)) return profile.markers;
  let time = 0;
  return [{ step: 'R1', time: 0 }, ...profile.timings.map((timing, index) => ({ step: stepNames[index + 1], time: time += timing }))];
}

export function getStepRanges(profile) {
  if (Array.isArray(profile.steps)) return profile.steps;
  const markers = getMarkers(profile);
  return markers.map((marker, index) => ({ step: marker.step, start: marker.time, end: markers[index + 1]?.time ?? marker.time + 0.1 }));
}

export function getWorkoutMarkers(profile) {
  const markers = getMarkers(profile);
  const firstTime = markers[0]?.time ?? 0;
  return markers.map(marker => ({ ...marker, time: marker.time - firstTime }));
}

function normaliseLegacyMarkers(profile) {
  if (!Array.isArray(profile?.markers)) return;
  let rCount = 0;
  profile.markers.forEach(marker => {
    if (marker.step === 'R') marker.step = rCount++ ? 'R2' : 'R1';
  });
}

export function loadProfiles() {
  let storedProfiles = {};
  try {
    const parsed = JSON.parse(localStorage.getItem('dg-timing-custom-profiles') || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) storedProfiles = parsed;
  } catch { /* Corrupt local data is safely ignored. */ }

  Object.values(storedProfiles).forEach(normaliseLegacyMarkers);
  const validProfiles = Object.fromEntries(Object.entries(storedProfiles).filter(([, profile]) => isValidProfile(profile)));
  const profiles = structuredClone(defaultProfiles);
  Object.assign(profiles, validProfiles);
  profiles.anthonyBarela.videoUrl = referenceVideoUrl;
  return { profiles, customProfiles: validProfiles };
}

export function saveCustomProfiles(customProfiles) {
  localStorage.setItem('dg-timing-custom-profiles', JSON.stringify(customProfiles));
}

export function createProfileKey() {
  return `custom-${crypto.randomUUID()}`;
}
