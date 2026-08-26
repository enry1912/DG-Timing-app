/**
 * ============================================================================
 * DISC GOLF FOOTWORK TIMING TRAINER
 * ============================================================================
 * Flow per Session:
 * 1. Voice Announcer: "Start workout"
 * 2. Loop Repetitions:
 *    - Voice Announcer: "Repetition X" -> "Ready"
 *    - Delay: 0.6s (START_OFFSET_1)
 *    - Step 1 Sound (Right Foot)
 *    - Step 2 Sound (Left Foot)   -> Delta: step1To2
 *    - Step 3 Sound (Right Foot)  -> Delta: step2To3
 *    - Step 4 Sound (X-Step Left) -> Delta: step3To4
 *    - Step 5 Sound (Plant Right) -> Delta: step4To5
 *    - Delay: 1.0s (END_OFFSET)
 *    - Finish Tone
 *    - Rest Interval (5.0s)
 * 3. Voice Announcer: "Training set done!"
 * ============================================================================
 */

// Global Audio Context reuse to avoid browser instance limits
const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
let sharedAudioCtx = null;

function getAudioContext() {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtxClass();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

// ============================================================================
// 1. CONFIGURATION & CONSTANTS
// ============================================================================
const START_OFFSET_1 = 0.6; // Seconds between "Ready" and Step 1 impact
const END_OFFSET     = 1.0; // Seconds after Step 5 plant before finish tone
const REPETITIONS    = 5;   // Total repetitions
const REST_INTERVAL  = 5;   // Rest interval between reps (seconds)

// ============================================================================
// 2. NORMALIZED PLAYER PROFILES (4 Step Intervals)
// ============================================================================

const niklasAnttila = {
  step1To2: 0.500, // Step 1 (Right) -> Step 2 (Left)
  step2To3: 0.610, // Step 2 (Left)  -> Step 3 (Right)
  step3To4: 0.324, // Step 3 (Right) -> Step 4 (X-Step Left)
  step4To5: 0.514  // Step 4 (X-Step) -> Step 5 (Plant Right)
};

const zachNash = {
  step1To2: 0.533, // Step 1 (Right) -> Step 2 (Left)
  step2To3: 0.723, // Step 2 (Left)  -> Step 3 (Right)
  step3To4: 0.377, // Step 3 (Right) -> Step 4 (X-Step Left)
  step4To5: 0.468  // Step 4 (X-Step) -> Step 5 (Plant Right)
};

// ============================================================================
// 3. VOICE & AUDIO ENGINES
// ============================================================================

function speak(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

function playStepSequence(timingObj, startOffset = START_OFFSET_1, endOffset = END_OFFSET) {
  const audioCtx = getAudioContext();
  const bipDuration = 0.08;
  const deltas = Object.values(timingObj);
  
  const timestamps = [
    startOffset,
    startOffset + deltas[0],
    startOffset + deltas[0] + deltas[1],
    startOffset + deltas[0] + deltas[1] + deltas[2],
    startOffset + deltas[0] + deltas[1] + deltas[2] + deltas[3]
  ];

  const finishTimestamp = timestamps[4] + endOffset;
  const startTime = audioCtx.currentTime;

  // Play Step Bips (Ascending Pitch)
  timestamps.forEach((t, idx) => {
    const scheduledTime = startTime + t;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 500 + (idx / 4) * 600;

    gain.gain.setValueAtTime(0, scheduledTime);
    gain.gain.linearRampToValueAtTime(0.3, scheduledTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, scheduledTime + bipDuration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(scheduledTime);
    osc.stop(scheduledTime + bipDuration);
  });

  // Play Finish Tone (Dual-Tone Chord)
  const finishTime = startTime + finishTimestamp;
  [400, 600].forEach((freq) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, finishTime);
    gain.gain.linearRampToValueAtTime(0.2, finishTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, finishTime + 0.25);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(finishTime);
    osc.stop(finishTime + 0.25);
  });

  return finishTimestamp + 0.25;
}

// ============================================================================
// 4. CONTROL ENGINE
// ============================================================================

let activeStopFn = null;

function stop() {
  if (activeStopFn) {
    activeStopFn();
    activeStopFn = null;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    console.log("🛑 IMMEDIATELY STOPPED.");
  } else {
    console.log("No active training to stop.");
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      stop();
    }
  });
}

function startFootworkTraining(
  timingProfile, 
  reps = REPETITIONS, 
  restSec = REST_INTERVAL,
  startOffset = START_OFFSET_1,
  endOffset = END_OFFSET
) {
  stop();

  let isCancelled = false;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  activeStopFn = () => {
    isCancelled = true;
  };

  (async () => {
    console.log(`🥏 Footwork training initialized (${reps} reps). Press [ESC] to stop.`);

    // Initial voice cue before repetitions start
    await speak("Start workout now!");
    if (isCancelled) return;

    for (let i = 0; i < reps; i++) {
      if (isCancelled) return;

      console.log(`▶ Rep ${i + 1} of ${reps}`);

      await speak(`Rep ${i + 1}`);
      if (isCancelled) return;

      await speak("Ready");
      if (isCancelled) return;

      const seqDurationSec = playStepSequence(timingProfile, startOffset, endOffset);
      const totalWaitMs = (seqDurationSec + restSec) * 1000;
      await sleep(totalWaitMs);
    }

    if (!isCancelled) {
      console.log("✅ Training set completed!");
      await speak("Training set done!");
    }
    activeStopFn = null;
  })();
}

function testPureFootwork(timingProfile) {
  const audioCtx = getAudioContext();
  const bipDuration = 0.08;
  const deltas = Object.values(timingProfile);
  
  const timestamps = [
    0,
    deltas[0],
    deltas[0] + deltas[1],
    deltas[0] + deltas[1] + deltas[2],
    deltas[0] + deltas[1] + deltas[2] + deltas[3]
  ];

  const startTime = audioCtx.currentTime;
  console.log("⚡ Playing pure footwork rhythm...");

  timestamps.forEach((t, idx) => {
    const scheduledTime = startTime + t;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 500 + (idx / 4) * 600;

    gain.gain.setValueAtTime(0, scheduledTime);
    gain.gain.linearRampToValueAtTime(0.3, scheduledTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, scheduledTime + bipDuration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(scheduledTime);
    osc.stop(scheduledTime + bipDuration);
  });
}

// ============================================================================
// 5. USAGE EXAMPLES (Uncomment one in console to run):
// ============================================================================
// startFootworkTraining(niklasAnttila);
// startFootworkTraining(zachNash);
// testPureFootwork(niklasAnttila);