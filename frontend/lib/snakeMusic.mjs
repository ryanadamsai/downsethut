const DRONE_FREQUENCIES = [196, 246.94, 293.66];
const CHIME_FREQUENCIES = [392, 440, 523.25, 587.33];

function createOscillatorVoice(context, frequency, detune, destination) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  oscillator.detune.setValueAtTime(detune, context.currentTime);

  gain.gain.setValueAtTime(0.0001, context.currentTime);

  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start();

  return {
    oscillator,
    gain
  };
}

export function createChillMusicController() {
  let audioContext = null;
  let masterGain = null;
  let filter = null;
  let lfo = null;
  let lfoGain = null;
  let voices = [];
  let chimeInterval = null;
  let shutdownHandle = null;
  let running = false;

  async function ensureContext() {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    return audioContext;
  }

  function scheduleChime(context) {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filterNode = context.createBiquadFilter();
    const frequency = CHIME_FREQUENCIES[Math.floor(Math.random() * CHIME_FREQUENCIES.length)];

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, now);
    filterNode.type = "lowpass";
    filterNode.frequency.setValueAtTime(1400, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

    oscillator.connect(filterNode);
    filterNode.connect(gain);
    gain.connect(masterGain);

    oscillator.start(now);
    oscillator.stop(now + 3.1);
  }

  async function buildGraph() {
    const context = await ensureContext();
    if (!context || running) {
      return;
    }

    masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0001, context.currentTime);

    filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(780, context.currentTime);
    filter.Q.setValueAtTime(0.5, context.currentTime);

    lfo = context.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(0.06, context.currentTime);

    lfoGain = context.createGain();
    lfoGain.gain.setValueAtTime(180, context.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    filter.connect(masterGain);
    masterGain.connect(context.destination);

    voices = DRONE_FREQUENCIES.map((frequency, index) =>
      createOscillatorVoice(context, frequency, index === 1 ? -4 : index === 2 ? 5 : 0, filter)
    );

    voices.forEach((voice, index) => {
      voice.gain.gain.linearRampToValueAtTime(0.006 + index * 0.0025, context.currentTime + 2.4);
    });

    masterGain.gain.linearRampToValueAtTime(0.6, context.currentTime + 1.8);
    lfo.start();

    scheduleChime(context);
    chimeInterval = window.setInterval(() => {
      scheduleChime(context);
    }, 4200);

    running = true;
  }

  function stopGraph({ destroy = false } = {}) {
    if (!audioContext || !running) {
      if (destroy && audioContext) {
        const contextToClose = audioContext;
        audioContext = null;
        contextToClose.close().catch(() => {});
      }
      return;
    }

    const now = audioContext.currentTime;

    if (chimeInterval) {
      window.clearInterval(chimeInterval);
      chimeInterval = null;
    }

    if (shutdownHandle) {
      window.clearTimeout(shutdownHandle);
      shutdownHandle = null;
    }

    masterGain?.gain.cancelScheduledValues(now);
    masterGain?.gain.setValueAtTime(masterGain.gain.value || 0.6, now);
    masterGain?.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);

    voices.forEach((voice) => {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value || 0.008, now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      voice.oscillator.stop(now + 1.8);
    });

    lfo?.stop(now + 1.8);
    running = false;

    shutdownHandle = window.setTimeout(() => {
      voices = [];
      lfo = null;
      lfoGain = null;
      filter = null;
      masterGain = null;

      if (destroy && audioContext) {
        const contextToClose = audioContext;
        audioContext = null;
        contextToClose.close().catch(() => {});
      }
    }, 1900);
  }

  return {
    async start() {
      await buildGraph();
    },

    stop() {
      stopGraph();
    },

    destroy() {
      stopGraph({ destroy: true });
    }
  };
}

export const createArcadeMusicController = createChillMusicController;
