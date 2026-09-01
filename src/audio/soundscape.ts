export type SoundCue =
  | "step"
  | "scan"
  | "accept"
  | "deliver"
  | "strand"
  | "choir"
  | "warning"
  | "rest"
  | "ui";

export interface AudioSettings {
  enabled: boolean;
  master: number;
  ambience: number;
  effects: number;
}

const DEFAULT_SETTINGS: AudioSettings = {
  enabled: true,
  master: 0.7,
  ambience: 0.42,
  effects: 0.72,
};

export class TideweftSoundscape {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private ambienceGain: GainNode | undefined;
  private effectsGain: GainNode | undefined;
  private tideFilter: BiquadFilterNode | undefined;
  private noise: AudioBufferSourceNode | undefined;
  private settings: AudioSettings;
  private lastStep = 0;

  constructor(settings: Partial<AudioSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  async unlock(): Promise<void> {
    if (!this.settings.enabled) return;
    if (!this.context) this.createGraph();
    if (this.context?.state === "suspended") await this.context.resume();
  }

  setSettings(next: Partial<AudioSettings>): void {
    this.settings = {
      enabled: next.enabled ?? this.settings.enabled,
      master: clamp01(next.master ?? this.settings.master),
      ambience: clamp01(next.ambience ?? this.settings.ambience),
      effects: clamp01(next.effects ?? this.settings.effects),
    };
    this.applyLevels(0.08);
    if (!this.settings.enabled) void this.context?.suspend();
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  updateAmbience(tide: number, storm: number, network: number): void {
    if (!this.context || !this.tideFilter || !this.ambienceGain) return;
    const now = this.context.currentTime;
    this.tideFilter.frequency.setTargetAtTime(180 + clamp01(tide) * 760 + clamp01(network) * 420, now, 0.8);
    this.tideFilter.Q.setTargetAtTime(0.25 + clamp01(storm) * 3.5, now, 0.8);
    const level = this.settings.enabled
      ? this.settings.ambience * (0.026 + clamp01(storm) * 0.034)
      : 0;
    this.ambienceGain.gain.setTargetAtTime(level, now, 0.9);
  }

  play(cue: SoundCue, intensity = 0.7): void {
    if (!this.context || !this.effectsGain || !this.settings.enabled || this.context.state !== "running") return;
    const strength = clamp01(intensity);
    const now = this.context.currentTime;
    if (cue === "step") {
      if (now - this.lastStep < 0.09) return;
      this.lastStep = now;
      this.noiseBurst(now, 0.025, 250, 0.018 * strength);
      return;
    }
    if (cue === "choir") {
      this.choir(now, strength);
      return;
    }

    const patterns: Record<Exclude<SoundCue, "step" | "choir">, readonly [number, number, OscillatorType, number][]> = {
      scan: [
        [196, 0, "sine", 0.18],
        [392, 0.07, "sine", 0.28],
        [784, 0.14, "triangle", 0.32],
      ],
      accept: [
        [262, 0, "triangle", 0.12],
        [330, 0.08, "triangle", 0.18],
      ],
      deliver: [
        [220, 0, "sine", 0.32],
        [330, 0.08, "sine", 0.38],
        [440, 0.16, "sine", 0.48],
        [660, 0.28, "triangle", 0.62],
      ],
      strand: [
        [147, 0, "sine", 0.28],
        [294, 0.1, "triangle", 0.42],
        [587, 0.22, "sine", 0.56],
      ],
      warning: [
        [165, 0, "sawtooth", 0.11],
        [147, 0.14, "sawtooth", 0.16],
      ],
      rest: [
        [196, 0, "sine", 0.45],
        [247, 0.12, "sine", 0.52],
        [294, 0.25, "sine", 0.7],
      ],
      ui: [[520, 0, "sine", 0.055]],
    };

    for (const [frequency, delay, type, duration] of patterns[cue]) {
      this.tone(frequency, now + delay, duration, type, (0.025 + duration * 0.035) * strength);
    }
  }

  destroy(): void {
    this.noise?.stop();
    this.noise = undefined;
    void this.context?.close();
    this.context = undefined;
  }

  private createGraph(): void {
    this.context = new AudioContext({ latencyHint: "interactive" });
    this.master = this.context.createGain();
    this.ambienceGain = this.context.createGain();
    this.effectsGain = this.context.createGain();
    this.tideFilter = this.context.createBiquadFilter();
    this.tideFilter.type = "lowpass";
    this.tideFilter.frequency.value = 480;
    this.master.connect(this.context.destination);
    this.ambienceGain.connect(this.master);
    this.effectsGain.connect(this.master);

    const buffer = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    let state = 0x74696465;
    for (let index = 0; index < samples.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      samples[index] = ((state >>> 0) / 0xffffffff) * 2 - 1;
    }
    this.noise = this.context.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;
    this.noise.connect(this.tideFilter);
    this.tideFilter.connect(this.ambienceGain);
    this.noise.start();
    this.applyLevels(0);
  }

  private applyLevels(timeConstant: number): void {
    if (!this.context || !this.master || !this.effectsGain || !this.ambienceGain) return;
    const now = this.context.currentTime;
    const enabled = this.settings.enabled ? 1 : 0;
    this.master.gain.setTargetAtTime(enabled * this.settings.master, now, timeConstant || 0.001);
    this.effectsGain.gain.setTargetAtTime(this.settings.effects, now, timeConstant || 0.001);
    this.ambienceGain.gain.setTargetAtTime(
      this.settings.ambience * 0.03,
      now,
      timeConstant || 0.001,
    );
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType,
    level: number,
  ): void {
    if (!this.context || !this.effectsGain) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.985), start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(level, start + Math.min(0.025, duration * 0.3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.effectsGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private choir(start: number, strength: number): void {
    // An open, overlapping D/A chord makes the choir read as several distant
    // harbors answering one another instead of another short UI arpeggio.
    const voices: readonly [number, number, OscillatorType, number, number][] = [
      [146.83, 0, "sine", 1.45, 0.035],
      [220, 0.025, "sine", 1.28, 0.031],
      [293.66, 0.07, "triangle", 1.08, 0.026],
      [369.99, 0.16, "sine", 0.94, 0.022],
      [440, 0.3, "triangle", 0.86, 0.024],
      [587.33, 0.46, "sine", 0.78, 0.021],
      [880, 0.7, "sine", 0.5, 0.015],
    ];
    for (const [frequency, delay, type, duration, level] of voices) {
      this.tone(frequency, start + delay, duration, type, level * strength);
    }
    this.noiseBurst(start + 0.12, 0.34, 1_450, 0.0065 * strength);
  }

  private noiseBurst(start: number, duration: number, frequency: number, level: number): void {
    if (!this.context || !this.effectsGain) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    let state = Math.floor(start * 1_000_000) ^ 0x77656674;
    for (let index = 0; index < samples.length; index += 1) {
      state = Math.imul(state ^ (state >>> 15), 1 | state);
      samples[index] = ((state >>> 0) / 0xffffffff) * 2 - 1;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    envelope.gain.setValueAtTime(level, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.effectsGain);
    source.start(start);
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
