import { getStepRanges } from './profileStore.js';

let audioContext;

export function getAudioContext() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

export async function ensureAudioReady() {
  const context = getAudioContext();
  if (context.state === 'suspended') await context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.value = 0.003;
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.18);
  return context;
}

export function playTone(time, frequency, duration = 0.08, volume = 0.3) {
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.linearRampToValueAtTime(volume, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(time);
  oscillator.stop(time + duration);
}

export function playProfileSounds(profile, { videoLeadIn = false, videoTime = 0, endOffset = 1 } = {}) {
  const steps = getStepRanges(profile);
  const firstStep = videoLeadIn ? videoTime : steps[0].start;
  const now = getAudioContext().currentTime + 0.05;
  steps.forEach((step, index) => playTone(now + Math.max(0, step.start - firstStep), 360 + index * 130, Math.max(0.05, step.end - step.start), 0.18));
  const finish = Math.max(...steps.map(step => step.end - firstStep)) + endOffset;
  playTone(now + finish, 400, 0.25, 0.2);
  playTone(now + finish, 600, 0.25, 0.2);
  return finish + 0.3;
}
