import type { WorldTimeView } from "./types";

export interface OutdoorLightRgb {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

export interface OutdoorLightDirection {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Presentation values derived only from the authoritative world-time view.
 * These values never feed perception or simulation. Reduced-motion mode uses
 * the same instant value: the clock already eases dawn and dusk, so no
 * renderer-local animation or wall-clock interpolation is needed.
 */
export interface OutdoorIlluminationPresentation {
  readonly phase: WorldTimeView["phase"];
  readonly daylight: number;
  readonly twilight: number;
  readonly chartBackground: string;
  readonly reliefSky: string;
  readonly reliefMistSky: string;
  readonly ambient: OutdoorLightRgb;
  readonly key: OutdoorLightRgb;
  readonly fill: OutdoorLightRgb;
  readonly keyDirection: OutdoorLightDirection;
}

const LEGACY_DAY: WorldTimeView = Object.freeze({
  version: 1,
  dayNumber: 1,
  dayTick: 720,
  phase: "day",
  phaseProgress: 0.5,
  cycleProgress: 0.5,
  solarProgress: 0.5,
  illumination: 1,
});

const NIGHT_ILLUMINATION = 0.1;

/**
 * Maps one shared phase into bounded Chart and Relief presentation values.
 * Legacy render fixtures deliberately retain the established daylight look.
 */
export function outdoorIlluminationPresentation(
  worldTime: WorldTimeView | undefined,
): OutdoorIlluminationPresentation {
  const time = worldTime?.version === 1 ? worldTime : LEGACY_DAY;
  const daylight = unit((unit(time.illumination) - NIGHT_ILLUMINATION)
    / (1 - NIGHT_ILLUMINATION));
  const phaseProgress = unit(time.phaseProgress);
  const twilight = time.phase === "dawn" || time.phase === "dusk"
    ? Math.sin(Math.PI * phaseProgress)
    : 0;
  const cycleAngle = unit(time.cycleProgress) * Math.PI * 2;

  const chartBackground = tintTwilight(
    mixHex("#050b13", "#061416", daylight),
    twilight,
    "#49252a",
    0.1,
  );
  const reliefSky = tintTwilight(
    mixHex("#071522", "#315f70", Math.pow(daylight, 0.78)),
    twilight,
    "#87504c",
    0.2,
  );
  const reliefMistSky = tintTwilight(
    mixHex("#0c1b24", "#45666a", Math.pow(daylight, 0.72)),
    twilight,
    "#80605a",
    0.08,
  );

  return Object.freeze({
    phase: time.phase,
    daylight,
    twilight,
    chartBackground,
    reliefSky,
    reliefMistSky,
    ambient: lightRgb(
      mixRgb({ red: 38, green: 43, blue: 52 }, { red: 90, green: 82, blue: 68 }, daylight),
      { red: 104, green: 72, blue: 58 },
      twilight * 0.12,
    ),
    key: lightRgb(
      mixRgb({ red: 62, green: 78, blue: 100 }, { red: 210, green: 184, blue: 142 }, daylight),
      { red: 230, green: 146, blue: 105 },
      twilight * 0.22,
    ),
    fill: lightRgb(
      mixRgb({ red: 22, green: 30, blue: 48 }, { red: 24, green: 34, blue: 40 }, daylight),
      { red: 54, green: 39, blue: 43 },
      twilight * 0.08,
    ),
    keyDirection: Object.freeze({
      // A continuous cycle avoids direction jumps at phase boundaries. This
      // is presentation only; later astronomy may replace the simple arc.
      x: Math.cos(cycleAngle) * 0.72,
      y: 0.35 + daylight * 0.55,
      z: Math.sin(cycleAngle) * 0.55,
    }),
  });
}

/**
 * Shades authored dry-ground color without hiding known terrain. At the
 * darkest point, at least 70% of the material identity remains present.
 */
export function outdoorTerrainColor(
  baseColor: string,
  light: OutdoorIlluminationPresentation,
  currentLocalIllumination = 0,
): string {
  const nightConditioned = mixHex(
    validHex(baseColor),
    "#08131c",
    (1 - light.daylight) * 0.3,
  );
  const twilightConditioned = tintTwilight(
    nightConditioned,
    light.twilight,
    "#d38958",
    0.055,
  );
  return mixHex(
    twilightConditioned,
    "#ffd39a",
    localLightAmount(currentLocalIllumination) * 0.32,
  );
}

/**
 * Water has a separate blue-only treatment. It can darken and catch a cool
 * twilight glint, but warm terrain, biome, fog, and WebGL lights cannot push
 * its submitted albedo into green/yellow territory.
 */
export function outdoorWaterColor(
  baseColor: string,
  light: OutdoorIlluminationPresentation,
  currentLocalIllumination = 0,
): string {
  const blueAnchored = mixHex(validHex(baseColor), "#155eaa", 0.16);
  const nightConditioned = mixHex(
    blueAnchored,
    "#061a38",
    (1 - light.daylight) * 0.28,
  );
  const twilightConditioned = tintTwilight(
    nightConditioned,
    light.twilight,
    "#528fc9",
    0.05,
  );
  // Local light lifts water toward a cool blue-white rather than the terrain's
  // warm lamp tint, preserving blue depth identity at every camera angle.
  return mixHex(
    twilightConditioned,
    "#7eb9ee",
    localLightAmount(currentLocalIllumination) * 0.2,
  );
}

/**
 * Small emissive contribution used only to make a physically projected local
 * light pool visible in Relief. It never admits geometry or entities and is
 * deliberately much dimmer than the source's authoritative intensity.
 */
export function outdoorLocalLightEmission(
  currentLocalIllumination: number,
): OutdoorLightRgb {
  const amount = localLightAmount(currentLocalIllumination);
  return Object.freeze({
    red: Math.round(74 * amount),
    green: Math.round(48 * amount),
    blue: Math.round(24 * amount),
  });
}

function localLightAmount(value: number): number {
  return Math.sqrt(unit(value));
}

function tintTwilight(
  baseColor: string,
  twilight: number,
  tint: string,
  maximum: number,
): string {
  return mixHex(baseColor, tint, unit(twilight) * maximum);
}

function lightRgb(
  base: OutdoorLightRgb,
  tint: OutdoorLightRgb,
  amount: number,
): OutdoorLightRgb {
  return Object.freeze(mixRgb(base, tint, amount));
}

function mixRgb(
  left: OutdoorLightRgb,
  right: OutdoorLightRgb,
  amount: number,
): OutdoorLightRgb {
  const blend = unit(amount);
  return {
    red: Math.round(left.red + (right.red - left.red) * blend),
    green: Math.round(left.green + (right.green - left.green) * blend),
    blue: Math.round(left.blue + (right.blue - left.blue) * blend),
  };
}

function mixHex(left: string, right: string, amount: number): string {
  const first = parseHex(validHex(left));
  const second = parseHex(validHex(right));
  const blend = unit(amount);
  const channel = (index: number): string => Math.round(
    (first[index] ?? 0) + ((second[index] ?? 0) - (first[index] ?? 0)) * blend,
  ).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function validHex(value: string): string {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value : "#061416";
}

function parseHex(value: string): readonly number[] {
  const hex = value.slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function unit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
