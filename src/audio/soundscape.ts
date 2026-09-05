import type { WaterFlowVoice } from "../game/waterFlow";

export type SoundCue =
  | "step"
  | "scan"
  | "accept"
  | "deliver"
  | "strand"
  | "choir"
  | "warning"
  | "rest"
  | "stumble"
  | "fall"
  | "impact"
  | "sweep"
  | "wildlife-alarm"
  | "rat-rustle"
  | "cat-call"
  | "paddle"
  | "recover"
  | "title"
  | "ui";

export interface SoundToneStep {
  readonly frequency: number;
  readonly delay: number;
  readonly type: OscillatorType;
  readonly duration: number;
}

export interface AudioSettings {
  enabled: boolean;
  master: number;
  ambience: number;
  effects: number;
}

export interface WaterAmbienceState {
  readonly strength: number;
  readonly turbulence: number;
  readonly pan: number;
  readonly voice: WaterFlowVoice;
}

export interface AmbienceParameters {
  readonly frequency: number;
  readonly resonance: number;
  readonly levelScale: number;
  readonly pan: number;
}

/** Pure mapping used by the looping noise graph and presentation tests. */
export function ambienceParameters(
  tide: number,
  storm: number,
  network: number,
  water?: WaterAmbienceState,
): AmbienceParameters {
  const strength = clamp01(water?.strength ?? 0);
  const turbulence = clamp01(water?.turbulence ?? 0);
  const whissh = water?.voice === "whissh" ? 1 : 0;
  return {
    frequency: 170
      + clamp01(tide) * 520
      + clamp01(network) * 260
      + strength * 460
      + turbulence * (420 + whissh * 620),
    resonance: 0.22 + clamp01(storm) * 1.25 + turbulence * (0.7 + whissh * 1.2),
    levelScale: 0.012
      + clamp01(storm) * 0.016
      + strength * 0.028
      + turbulence * 0.035,
    pan: Math.max(-1, Math.min(1, Number.isFinite(water?.pan) ? water!.pan : 0)),
  };
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
  private waterPanner: StereoPannerNode | undefined;
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

  updateAmbience(
    tide: number,
    storm: number,
    network: number,
    water?: WaterAmbienceState,
  ): void {
    if (!this.context || !this.tideFilter || !this.ambienceGain) return;
    const now = this.context.currentTime;
    const parameters = ambienceParameters(tide, storm, network, water);
    this.tideFilter.frequency.setTargetAtTime(parameters.frequency, now, 0.8);
    this.tideFilter.Q.setTargetAtTime(parameters.resonance, now, 0.8);
    this.waterPanner?.pan.setTargetAtTime(parameters.pan, now, 0.8);
    const level = this.settings.enabled
      ? this.settings.ambience * parameters.levelScale
      : 0;
    this.ambienceGain.gain.setTargetAtTime(level, now, 0.9);
  }

  play(cue: SoundCue, intensity = 0.7, variantSeed = 0): void {
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

    const patterns: Record<Exclude<SoundCue, "step" | "choir">, readonly SoundToneStep[]> = {
      scan: [
        toneStep(196, 0, "sine", 0.18),
        toneStep(392, 0.07, "sine", 0.28),
        toneStep(784, 0.14, "triangle", 0.32),
      ],
      accept: [
        toneStep(262, 0, "triangle", 0.12),
        toneStep(330, 0.08, "triangle", 0.18),
      ],
      deliver: [
        toneStep(220, 0, "sine", 0.32),
        toneStep(330, 0.08, "sine", 0.38),
        toneStep(440, 0.16, "sine", 0.48),
        toneStep(660, 0.28, "triangle", 0.62),
      ],
      strand: [
        toneStep(147, 0, "sine", 0.28),
        toneStep(294, 0.1, "triangle", 0.42),
        toneStep(587, 0.22, "sine", 0.56),
      ],
      warning: [
        toneStep(165, 0, "sawtooth", 0.11),
        toneStep(147, 0.14, "sawtooth", 0.16),
      ],
      rest: [
        toneStep(196, 0, "sine", 0.45),
        toneStep(247, 0.12, "sine", 0.52),
        toneStep(294, 0.25, "sine", 0.7),
      ],
      stumble: incidentSoundPattern("stumble", variantSeed),
      fall: incidentSoundPattern("fall", variantSeed),
      impact: incidentSoundPattern("impact", variantSeed),
      sweep: incidentSoundPattern("sweep", variantSeed),
      "wildlife-alarm": wildlifeAlarmPattern(),
      "rat-rustle": smallWildlifePattern("rat-rustle", variantSeed),
      "cat-call": smallWildlifePattern("cat-call", variantSeed),
      paddle: [
        toneStep(210, 0, "triangle", 0.055),
        toneStep(164, 0.045, "sine", 0.095),
      ],
      recover: incidentSoundPattern("recover", variantSeed),
      title: titleCrescendoPattern(),
      ui: [toneStep(520, 0, "sine", 0.055)],
    };

    for (const { frequency, delay, type, duration } of patterns[cue]) {
      this.tone(frequency, now + delay, duration, type, (0.025 + duration * 0.035) * strength);
    }
    if (cue === "title") {
      this.noiseBurst(now + 0.06, 0.72, 720, 0.0038 * strength);
    } else if (cue === "rat-rustle") {
      this.noiseBurst(now, 0.13, 1_850, 0.012 * strength);
    } else if (cue === "cat-call") {
      this.noiseBurst(now + 0.035, 0.11, 980, 0.0045 * strength);
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
    this.waterPanner = this.context.createStereoPanner();
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
    this.tideFilter.connect(this.waterPanner);
    this.waterPanner.connect(this.ambienceGain);
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

/** A short low-tide-to-glass chord used once per deliberately opened title. */
export function titleCrescendoPattern(): readonly SoundToneStep[] {
  return [
    toneStep(110, 0, "sine", 0.68),
    toneStep(164.81, 0.12, "sine", 0.76),
    toneStep(220, 0.29, "triangle", 0.72),
    toneStep(329.63, 0.51, "sine", 0.66),
    toneStep(659.25, 0.78, "triangle", 0.48),
  ];
}

/**
 * A compact rise-and-fall call shared by wildlife alarm events. Its immediate
 * onset communicates event timing without looping or competing with warnings.
 */
export function wildlifeAlarmPattern(): readonly SoundToneStep[] {
  return [
    toneStep(880, 0, "triangle", 0.055),
    toneStep(1_174.66, 0.052, "square", 0.045),
    toneStep(587.33, 0.12, "triangle", 0.09),
  ];
}

/**
 * Short state-event voices for the first small-world ecology. These are
 * acknowledgements of an authoritative nearby event, never a looping bestiary
 * ambience or an omniscient locator.
 */
export function smallWildlifePattern(
  cue: "rat-rustle" | "cat-call",
  variantSeed: number,
): readonly SoundToneStep[] {
  const seed = Number.isSafeInteger(variantSeed) ? variantSeed >>> 0 : 0;
  const shift = ((seed % 9) - 4) * 4;
  if (cue === "rat-rustle") {
    return [
      toneStep(1_320 + shift, 0, "square", 0.025),
      toneStep(1_010 + shift, 0.048, "triangle", 0.038),
      toneStep(1_490 + shift, 0.088, "square", 0.022),
    ];
  }
  return [
    toneStep(392 + shift, 0, "triangle", 0.12),
    toneStep(523.25 + shift, 0.095, "sine", 0.16),
    toneStep(349.23 + shift, 0.235, "triangle", 0.13),
  ];
}

/** A tiny, deterministic Atari-like voice for a persisted traversal incident. */
export function incidentSoundPattern(
  cue: "stumble" | "fall" | "impact" | "sweep" | "recover",
  variantSeed: number,
): readonly SoundToneStep[] {
  const seed = Number.isSafeInteger(variantSeed) ? variantSeed >>> 0 : 0;
  const shift = ((seed % 7) - 3) * 5;
  switch (cue) {
    case "stumble":
      return [
        toneStep(210 + shift, 0, "square", 0.055),
        toneStep(156 + shift, 0.052, "square", 0.075),
      ];
    case "fall":
      return [
        toneStep(176 + shift, 0, "square", 0.07),
        toneStep(92 + shift, 0.065, "sawtooth", 0.14),
      ];
    case "impact":
      return [
        toneStep(132 + shift, 0, "square", 0.045),
        toneStep(66 + Math.trunc(shift / 2), 0.038, "square", 0.19),
      ];
    case "sweep":
      return [
        toneStep(118 + shift, 0, "triangle", 0.16),
        toneStep(164 + shift, 0.09, "square", 0.11),
        toneStep(102 + shift, 0.18, "triangle", 0.18),
      ];
    case "recover":
      return [
        toneStep(164 + shift, 0, "square", 0.06),
        toneStep(246 + shift, 0.065, "triangle", 0.1),
      ];
  }
}

function toneStep(
  frequency: number,
  delay: number,
  type: OscillatorType,
  duration: number,
): SoundToneStep {
  return { frequency, delay, type, duration };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
