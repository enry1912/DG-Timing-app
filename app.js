const PROFILES = {
  niklasAnttila: { name: 'Niklas Anttila', timings: [0.500, 0.610, 0.324, 0.514] },
  zachNash: { name: 'Zach Nash', timings: [0.533, 0.723, 0.377, 0.468] }
};
const customProfiles = loadCustomProfiles();
Object.assign(PROFILES, customProfiles);

function isValidProfile(profile) {
  return profile && typeof profile.name === 'string' && profile.name.trim().length > 0 && profile.name.length <= 40 &&
    Array.isArray(profile.timings) && profile.timings.length === 4 &&
    profile.timings.every(timing => Number.isFinite(timing) && timing >= .1 && timing <= 3);
}

function loadCustomProfiles() {
  try {
    const stored = JSON.parse(localStorage.getItem('dg-timing-custom-profiles') || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter(([, profile]) => isValidProfile(profile)));
  } catch {
    return {};
  }
}

const START_OFFSET = 0.6;
const END_OFFSET = 1.0;
let selectedProfile = 'niklasAnttila';
let audioContext;
let isCancelled = false;
let pendingSleeps = [];

const profilesEl = document.querySelector('#profiles');
const statusEl = document.querySelector('#status');
const startButton = document.querySelector('#start-button');
const stopButton = document.querySelector('#stop-button');
const testButton = document.querySelector('#test-button');
const repsInput = document.querySelector('#reps');
const restInput = document.querySelector('#rest');
const playerForm = document.querySelector('#player-form');
const playerFormTitle = document.querySelector('#player-form-title');
const editProfileButton = document.querySelector('#edit-profile-button');
const videoUpload = document.querySelector('#video-upload');
const referenceVideo = document.querySelector('#reference-video');
const timingEditor = document.querySelector('#timing-editor');
const timingMarkers = [...document.querySelectorAll('.timing-marker')];
const MAX_TIMELINE_SECONDS = 3.5;
const MIN_INTERVAL = .1;
let editableTimings = [.500, .610, .325, .515];
let draggedMarkerIndex = null;
let editingProfileKey = null;
let videoUrl = null;

function renderProfiles() {
  const profiles = Object.entries(PROFILES);
  const longestRunUp = Math.max(...profiles.map(([, profile]) => profile.timings.reduce((sum, timing) => sum + timing, 0)));
  const timelineScale = longestRunUp * 1.1;
  profilesEl.replaceChildren(...profiles.map(([key, profile]) => {
    const button = document.createElement('button');
    button.className = `profile${key === selectedProfile ? ' selected' : ''}`;
    const total = profile.timings.reduce((sum, timing) => sum + timing, 0);
    let cumulative = 0;
    const markers = [0, ...profile.timings.map(timing => (cumulative += timing))]
      .map((time, index) => `<i class="profile-marker" style="left:${(time / timelineScale) * 100}%" aria-hidden="true">${['R', 'L', 'R', 'X', 'P'][index]}</i>`)
      .join('');
    button.innerHTML = `<strong>${profile.name}</strong><small>${profile.timings.map(t => `${t.toFixed(3)}s`).join(' · ')}</small>`;
    button.onclick = () => { if (!startButton.disabled) { selectedProfile = key; renderProfiles(); } };
    button.innerHTML = `<span class="profile-copy"><strong>${profile.name}</strong><small>${profile.timings.map(t => `${t.toFixed(3)}s`).join(' · ')}</small></span><span class="profile-total">${total.toFixed(2)}s</span><span class="profile-timeline" aria-label="Run-up timing: ${total.toFixed(2)} seconds from first step to plant">${markers}</span>`;
    return button;
  }));
}

// Deliberately builds DOM nodes instead of injecting player-provided text as HTML.
function renderProfiles() {
  const profiles = Object.entries(PROFILES);
  const longestRunUp = Math.max(...profiles.map(([, profile]) => profile.timings.reduce((sum, timing) => sum + timing, 0)));
  const timelineScale = longestRunUp * 1.1;
  const stepNames = ['R', 'L', 'R', 'X', 'P'];

  profilesEl.replaceChildren(...profiles.map(([key, profile]) => {
    const button = document.createElement('button');
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    const intervals = document.createElement('small');
    const total = document.createElement('span');
    const timeline = document.createElement('span');
    let cumulative = 0;

    button.className = `profile${key === selectedProfile ? ' selected' : ''}`;
    name.textContent = profile.name;
    intervals.textContent = profile.timings.map(timing => `${timing.toFixed(3)}s`).join(' · ');
    copy.className = 'profile-copy'; copy.append(name, intervals);
    total.className = 'profile-total';
    total.textContent = `${profile.timings.reduce((sum, timing) => sum + timing, 0).toFixed(2)}s`;
    timeline.className = 'profile-timeline';
    timeline.setAttribute('aria-label', `Run-up timing: ${total.textContent} from first step to plant`);
    [0, ...profile.timings.map(timing => (cumulative += timing))].forEach((time, index) => {
      const marker = document.createElement('i');
      marker.className = 'profile-marker';
      marker.style.left = `${(time / timelineScale) * 100}%`;
      marker.setAttribute('aria-hidden', 'true');
      marker.textContent = stepNames[index];
      timeline.append(marker);
    });
    button.append(copy, total, timeline);
    button.onclick = () => { if (!startButton.disabled) { selectedProfile = key; renderProfiles(); } };
    return button;
  }));
}

function renderTimingEditor() {
  let cumulative = 0;
  timingMarkers.forEach((marker, index) => {
    cumulative += editableTimings[index];
    marker.style.left = `${(cumulative / MAX_TIMELINE_SECONDS) * 100}%`;
    document.querySelector(`#timing-${index + 1}-output`).value = `${editableTimings[index].toFixed(3)}s`;
  });
}

function moveMarker(index, clientX) {
  const track = timingEditor.querySelector('.timing-track').getBoundingClientRect();
  const position = Math.max(0, Math.min(1, (clientX - track.left) / track.width)) * MAX_TIMELINE_SECONDS;
  const previous = editableTimings.slice(0, index).reduce((sum, value) => sum + value, 0);
  const following = editableTimings.slice(0, index + 1).reduce((sum, value) => sum + value, 0);
  const nextGap = editableTimings[index + 1] ?? MIN_INTERVAL;
  const maxPosition = index === 3 ? MAX_TIMELINE_SECONDS : following + nextGap - MIN_INTERVAL;
  const newPosition = Math.max(previous + MIN_INTERVAL, Math.min(position, maxPosition));
  editableTimings[index] = newPosition - previous;
  if (index < 3) editableTimings[index + 1] = following + nextGap - newPosition;
  renderTimingEditor();
}

timingMarkers.forEach(marker => marker.addEventListener('pointerdown', event => {
  draggedMarkerIndex = Number(marker.dataset.index);
  marker.setPointerCapture(event.pointerId);
  moveMarker(draggedMarkerIndex, event.clientX);
}));
timingEditor.addEventListener('pointermove', event => {
  if (draggedMarkerIndex !== null) moveMarker(draggedMarkerIndex, event.clientX);
});
timingEditor.addEventListener('pointerup', () => { draggedMarkerIndex = null; });
timingEditor.addEventListener('pointercancel', () => { draggedMarkerIndex = null; });

function getAudioContext() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function tone(time, frequency, duration = .08, volume = .3) {
  const context = getAudioContext();
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(.001, time);
  gain.gain.linearRampToValueAtTime(volume, time + .005);
  gain.gain.exponentialRampToValueAtTime(.001, time + duration);
  osc.connect(gain).connect(context.destination);
  osc.start(time); osc.stop(time + duration);
}

function playSequence(timings, includeLeadIn = true) {
  const offset = includeLeadIn ? START_OFFSET : 0;
  const times = [offset];
  timings.forEach(delta => times.push(times.at(-1) + delta));
  const now = getAudioContext().currentTime + .05;
  times.forEach((time, index) => tone(now + time, 500 + index * 150));
  const finish = times.at(-1) + END_OFFSET;
  tone(now + finish, 400, .25, .2); tone(now + finish, 600, .25, .2);
  return finish + .3;
}

function playReferenceVideo() {
  if (!referenceVideo.src) return;
  referenceVideo.currentTime = 0;
  referenceVideo.play().catch(() => { /* The video controls remain available. */ });
}

function speak(text) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = utterance.onerror = resolve;
    speechSynthesis.speak(utterance);
  });
}

function wait(seconds) {
  return new Promise(resolve => {
    const entry = { resolve, id: null };
    entry.id = setTimeout(() => {
      pendingSleeps = pendingSleeps.filter(item => item !== entry);
      resolve();
    }, seconds * 1000);
    pendingSleeps.push(entry);
  });
}

function setRunning(running) {
  startButton.disabled = running; testButton.disabled = running; stopButton.disabled = !running;
}

async function startWorkout() {
  const context = getAudioContext(); // User tap unlocks browser audio.
  isCancelled = false; setRunning(true);
  const profile = PROFILES[selectedProfile];
  const reps = Number(repsInput.value), rest = Number(restInput.value);
  // Immediate confirmation while mobile browsers prepare the speech voice.
  tone(context.currentTime + .02, 820, .12, .25);
  statusEl.textContent = `${profile.name} timing — starting workout`;
  await wait(.18);
  if (isCancelled) { setRunning(false); return; }
  await speak(profile.name);
  if (isCancelled) { setRunning(false); return; }
  statusEl.textContent = 'Start workout now!';
  await speak('Start workout now');
  for (let rep = 1; rep <= reps && !isCancelled; rep++) {
    statusEl.textContent = `Rep ${rep} of ${reps} — ready`;
    await speak(`Rep ${rep}. Ready`);
    if (isCancelled) break;
    playReferenceVideo();
    const duration = playSequence(profile.timings);
    statusEl.textContent = `Rep ${rep} of ${reps} — step, step, step, X-step, plant`;
    await wait(duration + (rep < reps ? rest : 0));
  }
  if (!isCancelled) { statusEl.textContent = 'Training set done!'; await speak('Training set done'); }
  if (isCancelled) statusEl.textContent = 'Workout stopped.';
  setRunning(false); pendingSleeps = [];
}

function stopWorkout() {
  isCancelled = true;
  pendingSleeps.forEach(({ id, resolve }) => { clearTimeout(id); resolve(); });
  pendingSleeps = [];
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

repsInput.oninput = () => document.querySelector('#reps-output').value = repsInput.value;
restInput.oninput = () => document.querySelector('#rest-output').value = `${restInput.value} sec`;
playerForm.onsubmit = event => {
  event.preventDefault();
  const name = document.querySelector('#player-name').value.trim();
  const timings = [...editableTimings];
  if (!name || !isValidProfile({ name, timings })) return;
  const key = editingProfileKey || `custom-${crypto.randomUUID()}`;
  PROFILES[key] = { name, timings };
  customProfiles[key] = PROFILES[key];
  try {
    localStorage.setItem('dg-timing-custom-profiles', JSON.stringify(customProfiles));
  } catch {
    delete PROFILES[key];
    delete customProfiles[key];
    statusEl.textContent = 'Could not save this player on this device.';
    return;
  }
  selectedProfile = key;
  editingProfileKey = null;
  playerFormTitle.textContent = 'Add your own player timing';
  playerForm.reset();
  editableTimings = [.500, .610, .325, .515];
  renderTimingEditor();
  document.querySelector('.add-player').open = false;
  renderProfiles();
};
editProfileButton.onclick = () => {
  const profile = PROFILES[selectedProfile];
  editingProfileKey = selectedProfile;
  document.querySelector('#player-name').value = profile.name;
  editableTimings = [...profile.timings];
  renderTimingEditor();
  playerFormTitle.textContent = `Edit ${profile.name}`;
  document.querySelector('.add-player').open = true;
  document.querySelector('#player-name').focus();
};
videoUpload.onchange = () => {
  const [file] = videoUpload.files;
  if (!file) return;
  if (!file.type.startsWith('video/') || file.size > 100 * 1024 * 1024) {
    statusEl.textContent = 'Choose a video file smaller than 100 MB.';
    videoUpload.value = '';
    return;
  }
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);
  referenceVideo.src = videoUrl;
  referenceVideo.hidden = false;
  statusEl.textContent = 'Reference video ready.';
};
startButton.onclick = startWorkout;
testButton.onclick = () => { getAudioContext(); statusEl.textContent = 'Playing timing rhythm…'; playSequence(PROFILES[selectedProfile].timings, false); };
stopButton.onclick = stopWorkout;
testButton.onclick = () => { getAudioContext(); statusEl.textContent = 'Playing timing rhythm…'; playReferenceVideo(); playSequence(PROFILES[selectedProfile].timings, false); };
window.addEventListener('keydown', event => { if (event.key === 'Escape') stopWorkout(); });
renderProfiles();
renderTimingEditor();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
