const LEAD_PATTERN = [659.25, 783.99, 987.77, 1046.5, 783.99, 659.25, 587.33, 523.25];
const BASS_PATTERN = [164.81, 196, 220, 246.94];

export function createArcadeMusicController() {
  let audioContext = null;
  let intervalHandle = null;
  let step = 0;

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

  function playNote(context, frequency, { type = "square", gainValue = 0.02, startOffset = 0, duration = 0.18 } = {}) {
    const now = context.currentTime + startOffset;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(type === "square" ? 1800 : 1200, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);

    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  async function playStep() {
    const context = await ensureContext();
    if (!context) {
      return;
    }

    const leadFrequency = LEAD_PATTERN[step % LEAD_PATTERN.length];
    const bassFrequency = BASS_PATTERN[Math.floor(step / 2) % BASS_PATTERN.length];

    playNote(context, leadFrequency, {
      type: "square",
      gainValue: 0.024,
      duration: 0.17
    });
    playNote(context, leadFrequency / 2, {
      type: "triangle",
      gainValue: 0.012,
      startOffset: 0.04,
      duration: 0.22
    });

    if (step % 2 === 0) {
      playNote(context, bassFrequency, {
        type: "sawtooth",
        gainValue: 0.009,
        startOffset: 0.02,
        duration: 0.28
      });
    }

    step += 1;
  }

  return {
    async start() {
      if (intervalHandle) {
        return;
      }

      await playStep();
      intervalHandle = window.setInterval(() => {
        playStep();
      }, 190);
    },

    stop() {
      if (intervalHandle) {
        window.clearInterval(intervalHandle);
        intervalHandle = null;
      }
    },

    destroy() {
      this.stop();
      if (audioContext) {
        const contextToClose = audioContext;
        audioContext = null;
        contextToClose.close().catch(() => {});
      }
    }
  };
}
