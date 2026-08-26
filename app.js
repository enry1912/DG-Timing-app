import { buildProfileCsv } from './js/csv.js';
import { api } from './js/apiClient.js';
import { ensureAudioReady, getAudioContext, playProfileSounds, playTone } from './js/audioEngine.js';
import { createAuthUi } from './js/authUi.js';
import { createProfileKey, getMarkers, getStepRanges, getWorkoutMarkers, isValidProfile, loadProfiles, saveCustomProfiles, stepNames } from './js/profileStore.js';

const { profiles: PROFILES, customProfiles } = loadProfiles();
const STEP_NAMES = stepNames;

const START_OFFSET = 0.6;
const END_OFFSET = 1.0;
let selectedProfile = null;
let isCancelled = false;
let pendingSleeps = [];
let currentUser = null;

const profilesEl = document.querySelector('#profiles');
const statusEl = document.querySelector('#status');
const startButton = document.querySelector('#start-button');
const stopButton = document.querySelector('#stop-button');
const testButton = {};
const repsInput = document.querySelector('#reps');
const restInput = document.querySelector('#rest');
const playerForm = document.querySelector('#player-form');
const playerFormTitle = document.querySelector('#player-form-title');
const editor = document.querySelector('#profile-editor');
const editorTitle = document.querySelector('#editor-title');
const editorPlayerName = document.querySelector('#editor-player-name');
const editorShotType = document.querySelector('#editor-shot-type');
const editorTournamentLink = document.querySelector('#editor-tournament-link');
const editorDescription = document.querySelector('#editor-description');
const videoSourceStatus = document.querySelector('#video-source-status');
const exportText = document.querySelector('#export-text');
const debugLog = document.querySelector('#debug-log');
const workoutVideoDialog = document.querySelector('#workout-video');
const workoutVideoPlayer = document.querySelector('#workout-video-player');
const playerRequiredDialog = document.querySelector('#player-required');
const workoutStepBar = document.querySelector('#workout-step-bar');
const editorVideo = document.querySelector('#editor-video');
const editorUpload = document.querySelector('#editor-video-upload');
const videoTime = document.querySelector('#video-time');
const recordedSteps = document.querySelector('#recorded-steps');
const timingEditor = document.querySelector('#timing-editor');
const timingMarkers = [...document.querySelectorAll('.timing-marker')];
const MAX_TIMELINE_SECONDS = 3.5;
const MIN_INTERVAL = .1;
let editableTimings = [.500, .610, .325, .515];
let draggedMarkerIndex = null;
let editingProfileKey = null;
let editorProfileKey = null;
const playerVideos = new Map();
playerVideos.set('anthonyBarela', PROFILES.anthonyBarela.videoUrl);
let footfalls = Array(5).fill(null);
let stepRanges = [];

async function loadCloudProfiles() {
  if (!currentUser) return;
  const { profiles } = await api.profiles();
  Object.keys(PROFILES).filter(key => key !== 'anthonyBarela').forEach(key => delete PROFILES[key]);
  profiles.forEach(profile => { PROFILES[profile.id] = profile; });
  if (selectedProfile && !PROFILES[selectedProfile]) selectedProfile = null;
  renderProfiles();
}

async function offerLocalProfileImport() {
  if (!currentUser) return;
  const importKey = `dg-timing-imported-${currentUser.id}`;
  const localProfiles = Object.entries(customProfiles).map(([, profile]) => ({
    name: profile.name, shotType: profile.shotType || '', tournamentLink: profile.tournamentLink || '', description: profile.description || '', steps: getStepRanges(profile)
  }));
  if (!localProfiles.length || localStorage.getItem(importKey)) return;
  const shouldImport = confirm(`Import ${localProfiles.length} player profile${localProfiles.length === 1 ? '' : 's'} saved in this browser into your private account?`);
  if (shouldImport) await Promise.all(localProfiles.map(profile => api.createProfile(profile)));
  localStorage.setItem(importKey, 'true');
}

async function saveProfileToCloud(key, profile) {
  if (!currentUser) return key;
  const payload = { name: profile.name, shotType: profile.shotType, tournamentLink: profile.tournamentLink, description: profile.description, steps: profile.steps };
  if (key.startsWith('custom-')) {
    const saved = await api.createProfile(payload);
    delete PROFILES[key]; delete customProfiles[key]; PROFILES[saved.id] = saved;
    if (selectedProfile === key) selectedProfile = saved.id;
    return saved.id;
  }
  const saved = await api.updateProfile(key, payload);
  PROFILES[key] = saved;
  return key;
}
function debug(message, error) {
  const line = `${new Date().toLocaleTimeString()}  ${message}${error ? ` — ${error.message || error}` : ''}`;
  console.log(line, error || '');
  debugLog.hidden = false;
  debugLog.textContent = `${line}\n${debugLog.textContent}`.slice(0, 1800);
}
const comparedProfiles = new Set(JSON.parse(localStorage.getItem('dg-timing-compared-profiles') || '[]'));

function arrangeDashboard() {
  const profileSection = profilesEl.closest('section');
  const dashboard = document.querySelector('.comparison-dashboard');
  const addButton = document.querySelector('#add-profile-button');
  const addDetails = document.querySelector('.add-player');
  const workspace = document.createElement('div');
  const playerPanel = document.createElement('aside');
  workspace.className = 'player-workspace'; playerPanel.className = 'players-panel';
  profileSection.insertBefore(workspace, addButton);
  workspace.append(dashboard, playerPanel);
  playerPanel.append(addButton, profilesEl, addDetails);
    const editorActions = editor.querySelector('.actions');
    editorActions.remove();
    editor.querySelector('header').after(editorActions);
    editorVideo.after(document.querySelector('#test-editor'));
}

// Retained temporarily for legacy timing-only profiles; current rendering below is the safe DOM-based path.
function renderProfilesLegacy() {
  const profiles = Object.entries(PROFILES);
  const longestRunUp = Math.max(...profiles.map(([, profile]) => getWorkoutMarkers(profile).at(-1).time));
  const timelineScale = longestRunUp * 1.1;
  profilesEl.replaceChildren(...profiles.map(([key, profile]) => {
    const button = document.createElement('div');
    button.className = `profile${key === selectedProfile ? ' selected' : ''}`;
    button.tabIndex = 0; button.setAttribute('role', 'button'); button.setAttribute('aria-label', `Select ${profile.name}`);
    const total = profile.timings.reduce((sum, timing) => sum + timing, 0);
    let cumulative = 0;
    const markers = [0, ...profile.timings.map(timing => (cumulative += timing))]
      .map((time, index) => `<i class="profile-marker" style="left:${(time / timelineScale) * 100}%" aria-hidden="true">${['R', 'L', 'R', 'X', 'P'][index]}</i>`)
      .join('');
    button.textContent = profile.name;
    button.onclick = () => { if (!startButton.disabled) { selectedProfile = key; renderProfiles(); } };
    button.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click(); } };
    button.setAttribute('data-total', total.toFixed(2));
    return button;
  }));
}

// Deliberately builds DOM nodes instead of injecting player-provided text as HTML.
function renderProfiles() {
  const profiles = Object.entries(PROFILES);
  const longestRunUp = Math.max(...profiles.map(([, profile]) => getWorkoutMarkers(profile).at(-1).time));
  const timelineScale = longestRunUp * 1.1;

  profilesEl.replaceChildren(...profiles.map(([key, profile]) => {
    const button = document.createElement('button');
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    const total = document.createElement('span');
    const timeline = document.createElement('span');

    button.className = `profile${key === selectedProfile ? ' selected' : ''}`;
    name.textContent = profile.name;
    copy.className = 'profile-copy'; copy.append(name);
    total.className = 'profile-total';
    total.textContent = `${getWorkoutMarkers(profile).at(-1).time.toFixed(2)}s`;
    timeline.className = 'profile-timeline';
    timeline.setAttribute('aria-label', `Run-up timing: ${total.textContent} from first step to plant`);
    getWorkoutMarkers(profile).forEach(timingMarker => {
      const point = document.createElement('i');
      point.className = 'profile-marker';
      point.style.left = `${(timingMarker.time / timelineScale) * 100}%`;
      point.setAttribute('aria-hidden', 'true');
      point.textContent = timingMarker.step;
      timeline.append(point);
    });
    button.append(copy);
    button.onclick = () => { if (!startButton.disabled) { selectedProfile = key; renderProfiles(); } };
    const edit = document.createElement('button');
    edit.className = 'profile-edit'; edit.type = 'button'; edit.textContent = '✎';
    edit.setAttribute('aria-label', `Edit ${profile.name}`);
    edit.onclick = () => openProfileEditor(key);
    const compare = document.createElement('button');
    compare.type = 'button'; compare.className = 'board-toggle';
    const updateCompareLabel = () => { compare.textContent = comparedProfiles.has(key) ? '→' : '←'; compare.title = comparedProfiles.has(key) ? 'Remove from comparison board' : 'Add to comparison board'; compare.setAttribute('aria-label', compare.title); };
    updateCompareLabel();
    compare.onclick = () => { comparedProfiles.has(key) ? comparedProfiles.delete(key) : comparedProfiles.add(key); localStorage.setItem('dg-timing-compared-profiles', JSON.stringify([...comparedProfiles])); updateCompareLabel(); renderComparison(); };
    const row = document.createElement('div');
    row.className = 'profile-row'; row.draggable = true;
    row.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', key); event.dataTransfer.effectAllowed = 'copy'; });
    row.append(compare, button, edit);
    return row;
  }));
  renderComparison();
}

function renderComparison() {
  const selected = [...comparedProfiles].map(key => PROFILES[key]).filter(Boolean);
  const summary = document.querySelector('#comparison-summary');
  summary.replaceChildren();
  if (!selected.length) { summary.textContent = 'Drag players from the list into this board to compare their timing.'; return; }
  const aligned = selected.map(profile => {
    const marks = getMarkers(profile);
    const secondR = marks.find(marker => marker.step === 'R2');
    return { profile, marks, anchor: secondR.time };
  });
  const left = Math.max(0, ...aligned.flatMap(item => item.marks.map(marker => item.anchor - marker.time)));
  const right = Math.max(...aligned.flatMap(item => item.marks.map(marker => marker.time - item.anchor))) * 1.1;
  aligned.forEach(({ profile, marks, anchor }) => {
    const row = document.createElement('div');
    const name = document.createElement('strong');
    const line = document.createElement('span');
    name.textContent = profile.name;
    row.className = 'comparison-row'; line.className = 'comparison-line';
    marks.forEach(marker => {
      const point = document.createElement('i'); point.textContent = marker.step; point.style.left = `${((marker.time - anchor + left) / (left + right)) * 100}%`; line.append(point);
    });
    row.append(name, line); summary.append(row);
  });
}

const comparisonDashboard = document.querySelector('.comparison-dashboard');
comparisonDashboard.addEventListener('dragover', event => { event.preventDefault(); comparisonDashboard.classList.add('drag-target'); });
comparisonDashboard.addEventListener('dragleave', () => comparisonDashboard.classList.remove('drag-target'));
comparisonDashboard.addEventListener('drop', event => { event.preventDefault(); comparisonDashboard.classList.remove('drag-target'); const key = event.dataTransfer.getData('text/plain'); if (PROFILES[key]) { comparedProfiles.add(key); localStorage.setItem('dg-timing-compared-profiles', JSON.stringify([...comparedProfiles])); renderProfiles(); } });

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

function playSequence(timings, includeLeadIn = true) {
  const offset = includeLeadIn ? START_OFFSET : 0;
  const times = [offset];
  timings.forEach(delta => times.push(times.at(-1) + delta));
  const now = getAudioContext().currentTime + .05;
  times.forEach((time, index) => playTone(now + time, 500 + index * 150));
  const finish = times.at(-1) + END_OFFSET;
  playTone(now + finish, 400, .25, .2); playTone(now + finish, 600, .25, .2);
  return finish + .3;
}

function playReferenceVideo() { /* Reference playback is available inside the player editor. */ }
function showWorkoutVideo(profileKey, autoplay = true) {
  const source = PROFILES[profileKey]?.videoUrl || playerVideos.get(profileKey);
  if (!source) return false;
  workoutVideoPlayer.src = source;
  workoutVideoPlayer.currentTime = 0;
  if (!workoutVideoDialog.open) workoutVideoDialog.showModal();
  if (autoplay) workoutVideoPlayer.play().catch(() => {});
  return true;
}
function renderWorkoutStepBar(profile) {
  const steps = getStepRanges(profile);
  const total = Math.max(...steps.map(step => step.end));
  const colors = ['#9de879', '#71c995', '#58a9aa', '#7b91da', '#c184d8'];
  workoutStepBar.replaceChildren(...steps.map((step, index) => {
    const segment = document.createElement('span');
    segment.dataset.step = step.step;
    segment.style.left = `${(step.start / total) * 100}%`;
    segment.style.width = `${((step.end - step.start) / total) * 100}%`;
    segment.style.background = colors[index];
    return segment;
  }));
}
function updateWorkoutStepBar() { workoutStepBar.querySelectorAll('span').forEach(segment => {
  const range = getStepRanges(PROFILES[selectedProfile] || { steps: [] }).find(step => step.step === segment.dataset.step);
  segment.classList.toggle('active', !!range && workoutVideoPlayer.currentTime >= range.start && workoutVideoPlayer.currentTime <= range.end);
}); if (!workoutVideoPlayer.paused) requestAnimationFrame(updateWorkoutStepBar); }
workoutVideoPlayer.onplay = () => requestAnimationFrame(updateWorkoutStepBar);

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
  startButton.disabled = running; stopButton.disabled = !running;
}

async function startWorkout() {
  try {
  debug('Start workout clicked');
  if (!selectedProfile || !PROFILES[selectedProfile]) { statusEl.textContent = 'Select a player before starting the workout.'; playerRequiredDialog.showModal(); debug('Workout blocked: no player selected'); return; }
  const context = getAudioContext(); // Keep the click handler synchronous for video/dialog permissions.
  isCancelled = false; setRunning(true);
  const profile = PROFILES[selectedProfile];
  if (!profile) throw new Error(`Selected profile not found: ${selectedProfile}`);
  const reps = Number(repsInput.value), rest = Number(restInput.value);
  const hasWorkoutVideo = !!(profile.videoUrl || playerVideos.get(selectedProfile));
  if (hasWorkoutVideo) { renderWorkoutStepBar(profile); showWorkoutVideo(selectedProfile, false); }
  debug(`Workout initialized: ${profile.name}`);
  statusEl.textContent = `${profile.name} timing — starting workout`;
  // First browser audio use can briefly take audio focus; settle before the spoken player cue.
  await wait(1.1);
  if (isCancelled) { setRunning(false); return; }
  await speak(profile.name);
  if (isCancelled) { setRunning(false); return; }
  statusEl.textContent = 'Start workout now!';
  await speak('Start workout now');
  for (let rep = 1; rep <= reps && !isCancelled; rep++) {
    statusEl.textContent = `Rep ${rep} of ${reps} — ready`;
      await speak(`Rep ${rep}. Ready`);
      if (isCancelled) break;
    // Give mobile audio routing a moment to settle after speech before sustained tones begin.
    await ensureAudioReady();
    await wait(.75);
    const hasVideo = hasWorkoutVideo && showWorkoutVideo(selectedProfile, true);
    if (hasVideo) await wait(.08);
    const duration = playProfileSounds(profile, { videoLeadIn: hasVideo, videoTime: hasVideo ? workoutVideoPlayer.currentTime : 0, endOffset: END_OFFSET });
    statusEl.textContent = `Rep ${rep} of ${reps} — step, step, step, X-step, plant`;
    await wait(duration);
    if (hasVideo) workoutVideoPlayer.pause();
    if (rep < reps) await wait(rest);
  }
  if (!isCancelled) { statusEl.textContent = 'Training set done!'; await speak('Training set done'); }
  if (workoutVideoDialog.open) { workoutVideoPlayer.pause(); workoutVideoDialog.close(); }
  if (isCancelled) statusEl.textContent = 'Workout stopped.';
  setRunning(false); pendingSleeps = [];
  } catch (error) {
    debug('Workout startup failed', error);
    statusEl.textContent = `Could not start: ${error.message || error}`;
    setRunning(false);
  }
}

function stopWorkout() {
  isCancelled = true;
  pendingSleeps.forEach(({ id, resolve }) => { clearTimeout(id); resolve(); });
  pendingSleeps = [];
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (workoutVideoDialog.open) { workoutVideoPlayer.pause(); workoutVideoDialog.close(); }
}

repsInput.oninput = () => document.querySelector('#reps-output').value = repsInput.value;
restInput.oninput = () => document.querySelector('#rest-output').value = `${restInput.value} sec`;
playerForm.onsubmit = async event => {
  event.preventDefault();
  const name = document.querySelector('#player-name').value.trim();
  const timings = [...editableTimings];
  if (!name || !isValidProfile({ name, timings })) return;
  const key = editingProfileKey || createProfileKey();
  PROFILES[key] = { name, timings };
  customProfiles[key] = PROFILES[key];
  try {
    saveCustomProfiles(customProfiles);
  } catch {
    delete PROFILES[key];
    delete customProfiles[key];
    statusEl.textContent = 'Could not save this player on this device.';
    return;
  }
  try { selectedProfile = await saveProfileToCloud(key, PROFILES[key]); } catch (caught) { statusEl.textContent = `Saved locally, but cloud sync failed: ${caught.message}`; }
  editingProfileKey = null;
  playerFormTitle.textContent = 'Add your own player timing';
  playerForm.reset();
  editableTimings = [.500, .610, .325, .515];
  renderTimingEditor();
  document.querySelector('.add-player').open = false;
  renderProfiles();
};
function updateRecordedSteps() {
  recordedSteps.textContent = footfalls.map((time, index) => `${STEP_NAMES[index]}: ${time === null ? '—' : `${time.toFixed(3)}s`}`).join('   ');
}
function renderStepTable() {
  const body = document.querySelector('#step-table-body');
  const header = document.createElement('tr'); header.append(document.createElement('th'));
  STEP_NAMES.forEach((step, index) => { const cell = document.createElement('th'); const label = document.createElement('span'); label.textContent = step; cell.append(label); if (index < 2) { const button = document.createElement('button'); button.className = 'optional-step'; button.textContent = footfalls[index] === null ? '+' : '×'; button.title = footfalls[index] === null ? `Add ${step}` : `Remove ${step}`; button.onclick = () => { const enabled = footfalls[index] !== null; footfalls[index] = enabled ? null : 0; stepRanges[index] = null; renderStepTable(); updateRecordedSteps(); }; cell.append(button); } header.append(cell); });
  const makeRow = (label, isEnd) => { const row = document.createElement('tr'); const labelCell = document.createElement('td'); labelCell.textContent = label; row.append(labelCell); STEP_NAMES.forEach((step, index) => { const range = stepRanges[index]; const cell = document.createElement('td'); const button = document.createElement('button'); const disabled = index < 2 && footfalls[index] === null; button.disabled = disabled; button.textContent = !range || (isEnd && range.end === range.start) ? `Record ${label.toLowerCase()}` : `${(isEnd ? range.end : range.start).toFixed(3)}s`; button.onclick = () => { const current = editorVideo.currentTime; if (!isEnd) { stepRanges[index] = { step, start: current, end: current }; footfalls[index] = current; } else if (stepRanges[index]) stepRanges[index].end = Math.max(stepRanges[index].start, current); renderStepTable(); updateRecordedSteps(); }; cell.append(button); row.append(cell); }); return row; };
  body.replaceChildren(header, makeRow('Start', false), makeRow('End', true));
}
function openProfileEditor(key) {
  const isBundledReference = key === 'anthonyBarela';
  editorProfileKey = isBundledReference ? null : key;
  const profile = key ? PROFILES[key] : null;
  editorTitle.textContent = isBundledReference ? `Copy ${profile.name}` : key ? `Edit ${profile.name}` : 'Add player';
  editorPlayerName.value = profile?.name || '';
  editorVideo.removeAttribute('src');
  const profileVideo = key && (PROFILES[key]?.videoUrl || playerVideos.get(key));
  if (profileVideo) { editorVideo.dataset.sourceLabel = profileVideo.includes('/videos/') ? 'Bundled reference video' : 'Local video'; editorVideo.src = new URL(profileVideo, window.location.href).href; editorVideo.load(); videoSourceStatus.textContent = `Loading ${editorVideo.dataset.sourceLabel.toLowerCase()}…`; }
  else videoSourceStatus.textContent = 'No video selected.';
  editorShotType.value = profile?.shotType || '';
  editorTournamentLink.value = profile?.tournamentLink || '';
  editorDescription.value = profile?.description || '';
  const marks = profile ? getMarkers(profile) : [];
  footfalls = [marks.find(marker => marker.step === 'R1')?.time ?? null, marks.find(marker => marker.step === 'L')?.time ?? null, marks.find(marker => marker.step === 'R2')?.time ?? null, marks.find(marker => marker.step === 'X')?.time ?? null, marks.find(marker => marker.step === 'P')?.time ?? null];
  stepRanges = STEP_NAMES.map((step, index) => profile ? getStepRanges(profile).find(range => range.step === step) || (footfalls[index] === null ? null : { step, start: footfalls[index], end: footfalls[index] }) : null);
  updateRecordedSteps();
  renderStepTable();
  editor.showModal();
}
function seekFrame(direction) {
  const fps = Number(document.querySelector('#video-fps').value);
  editorVideo.pause();
  editorVideo.currentTime = Math.max(0, Math.min(editorVideo.duration || Infinity, editorVideo.currentTime + direction / fps));
}
editorUpload.onchange = () => {
  const [file] = editorUpload.files;
  if (!file || !file.type.startsWith('video/')) return;
  if (file.size > 100 * 1024 * 1024) { recordedSteps.textContent = 'Choose a video smaller than 100 MB.'; return; }
  if (editorVideo.src) URL.revokeObjectURL(editorVideo.src);
  editorVideo.src = URL.createObjectURL(file);
  editorVideo.dataset.sourceLabel = 'Local video';
  videoSourceStatus.textContent = `Local video loaded: ${file.name}`;
  if (editorProfileKey) { playerVideos.set(editorProfileKey, editorVideo.src); PROFILES[editorProfileKey].videoUrl = editorVideo.src; }
};
document.querySelector('#frame-back').onclick = () => seekFrame(-1);
document.querySelector('#frame-forward').onclick = () => seekFrame(1);
editorVideo.ontimeupdate = () => { videoTime.value = `${editorVideo.currentTime.toFixed(3)}s`; };
editorVideo.onloadeddata = () => { videoSourceStatus.textContent = `${editorVideo.dataset.sourceLabel || 'Video'} ready to play.`; };
editorVideo.onerror = () => {
  const code = editorVideo.error?.code || 'unknown';
  const reason = { 1: 'loading was aborted', 2: 'network/path error', 3: 'decode error', 4: 'source format not supported' }[code] || 'unknown error';
  videoSourceStatus.textContent = `Video error ${code}: ${reason}. Source: ${editorVideo.currentSrc || editorVideo.src}`;
};
document.querySelectorAll('.footfall-buttons button').forEach(button => button.onclick = () => {
  footfalls[Number(button.dataset.step)] = editorVideo.currentTime;
  updateRecordedSteps();
});
document.querySelector('#save-editor').onclick = async () => {
  if (footfalls.slice(2).some(time => time === null) || footfalls.some((time, index) => time !== null && footfalls.slice(0, index).some(previous => previous !== null && time <= previous))) { recordedSteps.textContent = 'Second R, X and Plant are required and must be chronological.'; return; }
  const name = editorPlayerName.value.trim();
  if (!name) { recordedSteps.textContent = 'Enter a player name.'; return; }
  const key = editorProfileKey || createProfileKey();
  const profile = PROFILES[key] || {};
  profile.name = name;
  profile.shotType = editorShotType.value;
  profile.tournamentLink = editorTournamentLink.value.trim();
  profile.description = editorDescription.value.trim();
  if (stepRanges.slice(2).some(range => !range || range.end < range.start)) { recordedSteps.textContent = 'Record start and end for R2, X and Plant.'; return; }
  profile.steps = stepRanges.filter(Boolean);
  profile.markers = profile.steps.map(range => ({ step: range.step, time: range.start }));
  profile.timings = getWorkoutMarkers(profile).slice(1).map((marker, index, marks) => marker.time - (index ? marks[index - 1].time : 0));
  PROFILES[key] = profile;
  if (editorVideo.src) { playerVideos.set(key, editorVideo.src); profile.videoUrl = editorVideo.src; }
  customProfiles[key] = profile;
  try { saveCustomProfiles(customProfiles); } catch { recordedSteps.textContent = 'Could not save timing on this device.'; return; }
  try { await saveProfileToCloud(key, profile); } catch (caught) { recordedSteps.textContent = `Saved locally, but cloud sync failed: ${caught.message}`; return; }
  renderProfiles(); editor.close();
};
document.querySelector('#close-editor').onclick = () => editor.close();
editor.addEventListener('cancel', event => { event.preventDefault(); editor.close(); });
workoutVideoDialog.addEventListener('cancel', event => { event.preventDefault(); stopWorkout(); });
document.querySelector('#close-workout-video').onclick = () => { workoutVideoPlayer.pause(); workoutVideoDialog.close(); };
document.querySelector('#close-player-required').onclick = () => playerRequiredDialog.close();
document.querySelector('#refresh-app').onclick = async () => { if ('caches' in window) await caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))); window.location.reload(); };
document.querySelector('#export-editor').onclick = () => {
  const profile = PROFILES[editorProfileKey];
  if (!profile) return;
  const text = `${profile.name}\n${profile.shotType || ''}\n${profile.description || ''}\n${profile.tournamentLink || ''}\n\n${getStepRanges(profile).map(step => `${step.step}: ${step.start.toFixed(3)}s – ${step.end.toFixed(3)}s`).join('\n')}`;
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); link.download = `${profile.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-timing.txt`; link.click(); URL.revokeObjectURL(link.href);
};
document.querySelector('#add-profile-button').onclick = () => openProfileEditor(null);
document.querySelector('#export-editor').onclick = () => {
  const profile = PROFILES[editorProfileKey];
  if (!profile) return;
  exportText.value = buildProfileCsv(profile);
  exportText.hidden = false;
  exportText.select();
};
document.querySelector('#test-editor').onclick = async () => {
  if (stepRanges.slice(2).some(range => !range)) { recordedSteps.textContent = 'Record R2, X and Plant first.'; return; }
  const context = await ensureAudioReady();
  editorVideo.currentTime = 0;
  editorVideo.play().catch(() => {});
  const now = context.currentTime + .05;
  stepRanges.filter(Boolean).forEach(range => playTone(now + range.start, 360 + STEP_NAMES.indexOf(range.step) * 130, Math.max(.05, range.end - range.start), .18));
  playTone(now + stepRanges[4].end + END_OFFSET, 400, .25, .2); playTone(now + stepRanges[4].end + END_OFFSET, 600, .25, .2);
};
startButton.onclick = startWorkout;
testButton.onclick = () => { getAudioContext(); statusEl.textContent = 'Playing timing rhythm…'; playSequence(PROFILES[selectedProfile].timings, false); };
stopButton.onclick = stopWorkout;
testButton.onclick = () => { getAudioContext(); statusEl.textContent = 'Playing timing rhythm…'; playReferenceVideo(); playSequence(PROFILES[selectedProfile].timings, false); };
window.addEventListener('keydown', event => { if (event.key === 'Escape' && !editor.open && !workoutVideoDialog.open) stopWorkout(); if (event.key === 'Enter' && !editor.open && !workoutVideoDialog.open && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) startWorkout(); });
arrangeDashboard();
renderProfiles();
renderTimingEditor();

const authUi = createAuthUi({
  onSignedIn: async () => { currentUser = await authUi.refresh(); await offerLocalProfileImport(); await loadCloudProfiles(); },
  onSignedOut: () => window.location.reload()
});
authUi.refresh().then(async user => { currentUser = user; await offerLocalProfileImport(); return loadCloudProfiles(); }).catch(error => debug('Cloud profile load skipped', error));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
