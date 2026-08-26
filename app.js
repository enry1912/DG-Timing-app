const PROFILES = {
  niklasAnttila: { name: 'Niklas Anttila', timings: [0.500, 0.610, 0.324, 0.514] },
  zachNash: { name: 'Zach Nash', timings: [0.533, 0.723, 0.377, 0.468] }
};
const customProfiles = JSON.parse(localStorage.getItem('dg-timing-custom-profiles') || '{}');
Object.assign(PROFILES, customProfiles);

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

function renderProfiles() {
  profilesEl.replaceChildren(...Object.entries(PROFILES).map(([key, profile]) => {
    const button = document.createElement('button');
    button.className = `profile${key === selectedProfile ? ' selected' : ''}`;
    button.innerHTML = `<strong>${profile.name}</strong><small>${profile.timings.map(t => `${t.toFixed(3)}s`).join(' · ')}</small>`;
    button.onclick = () => { if (!startButton.disabled) { selectedProfile = key; renderProfiles(); } };
    return button;
  }));
}

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
  getAudioContext(); // User tap unlocks browser audio.
  isCancelled = false; setRunning(true);
  const profile = PROFILES[selectedProfile];
  const reps = Number(repsInput.value), rest = Number(restInput.value);
  statusEl.textContent = 'Start workout now!';
  await speak('Start workout now');
  for (let rep = 1; rep <= reps && !isCancelled; rep++) {
    statusEl.textContent = `Rep ${rep} of ${reps} — ready`;
    await speak(`Rep ${rep}. Ready`);
    if (isCancelled) break;
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
  const timings = [1, 2, 3, 4].map(number => Number(document.querySelector(`#timing-${number}`).value));
  if (!name || timings.some(value => !Number.isFinite(value) || value <= 0)) return;
  const key = `custom-${crypto.randomUUID()}`;
  PROFILES[key] = { name, timings };
  customProfiles[key] = PROFILES[key];
  localStorage.setItem('dg-timing-custom-profiles', JSON.stringify(customProfiles));
  selectedProfile = key;
  playerForm.reset();
  document.querySelector('.add-player').open = false;
  renderProfiles();
};
startButton.onclick = startWorkout;
testButton.onclick = () => { getAudioContext(); statusEl.textContent = 'Playing timing rhythm…'; playSequence(PROFILES[selectedProfile].timings, false); };
stopButton.onclick = stopWorkout;
window.addEventListener('keydown', event => { if (event.key === 'Escape') stopWorkout(); });
renderProfiles();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
