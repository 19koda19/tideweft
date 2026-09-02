export const TITLE_ATMOSPHERE_MAX_PARTICLES = 52;
export const TITLE_ATMOSPHERE_MAX_BACKING_PIXELS = 3_200_000;
export const TITLE_ATMOSPHERE_MAX_DPR = 1.5;
const TITLE_ATMOSPHERE_MIN_PARTICLES = 16;
const TITLE_FIELD_SEED = 0x74696465;
const FRAME_INTERVAL_MS = 1000 / 30;

export interface TitleCurlVector {
  readonly x: number;
  readonly y: number;
}

export interface TitleAtmosphereSnapshot {
  readonly presented: boolean;
  readonly unobscured: boolean;
  readonly running: boolean;
  readonly audioArmed: boolean;
  readonly openingOrdinal: number;
  readonly particleCount: number;
  readonly reducedMotion: boolean;
  readonly destroyed: boolean;
}

export interface TitleAtmosphereController {
  /**
   * `presented` identifies a real title opening. `unobscured` may temporarily
   * pause it behind Patch Notes without creating another opening or sound.
   */
  readonly sync: (presented: boolean, unobscured?: boolean) => void;
  readonly resize: () => void;
  readonly snapshot: () => TitleAtmosphereSnapshot;
  readonly destroy: () => void;
}

export interface TitleAtmosphereOptions {
  readonly canvas: HTMLCanvasElement;
  readonly host: HTMLElement;
  readonly playCrescendo?: (openingOrdinal: number) => void | Promise<void>;
  readonly documentTarget?: Document;
  readonly windowTarget?: Window;
  readonly reducedMotionQuery?: MediaQueryList;
  readonly now?: () => number;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
}

interface TitleParticle {
  x: number;
  y: number;
  readonly radius: number;
  readonly speed: number;
  readonly phase: number;
  readonly brightness: number;
}

/** A deterministic bounded workload for phones through large desktop windows. */
export function titleParticleBudget(width: number, height: number): number {
  const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
  const safeHeight = Number.isFinite(height) ? Math.max(1, height) : 1;
  return Math.max(
    TITLE_ATMOSPHERE_MIN_PARTICLES,
    Math.min(TITLE_ATMOSPHERE_MAX_PARTICLES, Math.round((safeWidth * safeHeight) / 34_000)),
  );
}

/**
 * Analytic curl of a tiny scalar wave field. It reads like circulating water
 * without a noise texture, allocation, lookup table, or nondeterministic RNG.
 */
export function sampleTitleCurl(
  x: number,
  y: number,
  seconds: number,
  seed = TITLE_FIELD_SEED,
): TitleCurlVector {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const safeTime = Number.isFinite(seconds) ? seconds : 0;
  const phase = ((Number.isSafeInteger(seed) ? seed >>> 0 : TITLE_FIELD_SEED) % 8191) / 8191 * Math.PI * 2;
  const first = 3.1 * safeX + 2.3 * safeY + safeTime * 0.19 + phase;
  const second = 4.7 * safeX - 3.7 * safeY - safeTime * 0.13 - phase * 0.61;
  return {
    x: 2.3 * Math.cos(first) + 1.85 * Math.sin(second),
    y: -3.1 * Math.cos(first) + 2.35 * Math.sin(second),
  };
}

/** Opening brightness rises, briefly flowers, then settles into a calm field. */
export function titleOpeningBloom(elapsedMilliseconds: number, reducedMotion = false): number {
  if (reducedMotion) return 0.72;
  const elapsed = Number.isFinite(elapsedMilliseconds) ? Math.max(0, elapsedMilliseconds) : 0;
  const progress = Math.min(1, elapsed / 1_800);
  const rise = 1 - (1 - progress) ** 3;
  const flower = Math.sin(Math.PI * Math.min(1, progress / 0.72)) * (1 - progress * 0.42);
  return Math.max(0.16, Math.min(1, 0.16 + rise * 0.62 + flower * 0.3));
}

export function titleBackingScale(
  width: number,
  height: number,
  devicePixelRatio: number,
): number {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const requested = Math.max(0.01, Math.min(
    TITLE_ATMOSPHERE_MAX_DPR,
    Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1,
  ));
  return Math.min(
    requested,
    Math.sqrt(TITLE_ATMOSPHERE_MAX_BACKING_PIXELS / (safeWidth * safeHeight)),
  );
}

function createParticles(count: number, seed: number): TitleParticle[] {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  const random = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    radius: 0.7 + random() * 1.8,
    speed: 0.55 + random() * 0.85,
    phase: random() * Math.PI * 2,
    brightness: 0.28 + random() * 0.72,
  }));
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

function traceTitleCurrent(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  lane: number,
  seconds: number,
): void {
  const laneRatio = lane / 10;
  const base = height * (0.055 + laneRatio * 0.89);
  const amplitude = height * (0.026 + (lane % 3) * 0.006);
  const step = Math.max(12, Math.min(26, width / 104));
  context.beginPath();
  let first = true;
  for (let screenX = -step; screenX <= width + step; screenX += step) {
    const normalizedX = screenX / Math.max(1, width);
    const curl = sampleTitleCurl(normalizedX, laneRatio, seconds, TITLE_FIELD_SEED + lane * 97);
    const primary = Math.sin(
      normalizedX * Math.PI * (2.05 + lane * 0.075)
      + seconds * (0.105 + lane * 0.003)
      + lane * 0.83,
    );
    const undertow = Math.sin(normalizedX * Math.PI * 5.2 - seconds * 0.072 - lane * 0.41);
    const screenY = base
      + primary * amplitude
      + undertow * amplitude * 0.24
      + curl.y * amplitude * 0.12;
    if (first) {
      context.moveTo(screenX, screenY);
      first = false;
    } else {
      context.lineTo(screenX, screenY);
    }
  }
}

function traceTitleEddy(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  contour: number,
  seconds: number,
  phase: number,
): void {
  const pointCount = 72;
  const horizontalStretch = 1.12 + contour * 0.018;
  context.beginPath();
  for (let point = 0; point <= pointCount; point += 1) {
    const angle = point / pointCount * Math.PI * 2;
    const tide = Math.sin(angle * 3 + seconds * 0.13 + phase) * 0.055
      + Math.sin(angle * 7 - seconds * 0.09 - phase * 0.7) * 0.022;
    const currentRadius = radius * (1 + tide);
    const x = centerX + Math.cos(angle) * currentRadius * horizontalStretch;
    const y = centerY + Math.sin(angle) * currentRadius * 0.66;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
}

function openingWaveStrength(elapsedMilliseconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const progress = Math.min(1, Math.max(0, elapsedMilliseconds) / 1_800);
  return Math.sin(progress * Math.PI) * (1 - progress * 0.58);
}

/** Connects the production title canvas, lifecycle, and autoplay-safe cue. */
export function bindTitleAtmosphere(
  options: TitleAtmosphereOptions,
): TitleAtmosphereController {
  const documentTarget = options.documentTarget ?? document;
  const windowTarget = options.windowTarget ?? window;
  const reducedMotionQuery = options.reducedMotionQuery
    ?? windowTarget.matchMedia("(prefers-reduced-motion: reduce)");
  const now = options.now ?? (() => performance.now());
  const requestFrame = options.requestFrame ?? windowTarget.requestAnimationFrame.bind(windowTarget);
  const cancelFrame = options.cancelFrame ?? windowTarget.cancelAnimationFrame.bind(windowTarget);
  const context = options.canvas.getContext("2d", { alpha: true });

  let presented = false;
  let unobscured = false;
  let openingOrdinal = 0;
  let openingStartedAt = 0;
  let lastDrawAt = 0;
  let frameHandle: number | null = null;
  let particles: TitleParticle[] = [];
  let audioArmed = false;
  let gestureListening = false;
  let destroyed = false;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let backingScale = 1;

  const documentVisible = (): boolean => documentTarget.visibilityState !== "hidden";
  const active = (): boolean => presented && unobscured && documentVisible() && !destroyed;

  const removeGestureListeners = (): void => {
    if (!gestureListening) return;
    gestureListening = false;
    documentTarget.removeEventListener("pointerdown", onLawfulGesture, true);
    documentTarget.removeEventListener("keydown", onLawfulGesture, true);
  };

  const onLawfulGesture = (event: Event): void => {
    if (!active() || !audioArmed) return;
    if (
      event.type === "keydown"
      && ((event as KeyboardEvent).repeat || (event as KeyboardEvent).isComposing)
    ) return;
    audioArmed = false;
    removeGestureListeners();
    try {
      void Promise.resolve(options.playCrescendo?.(openingOrdinal)).catch(() => undefined);
    } catch {
      // Audio is an embellishment; a denied context must never block title UI.
    }
  };

  const syncGestureListeners = (): void => {
    const shouldListen = active() && audioArmed && options.playCrescendo !== undefined;
    if (shouldListen && !gestureListening) {
      gestureListening = true;
      documentTarget.addEventListener("pointerdown", onLawfulGesture, true);
      documentTarget.addEventListener("keydown", onLawfulGesture, true);
    } else if (!shouldListen) {
      removeGestureListeners();
    }
  };

  const resize = (): void => {
    if (destroyed) return;
    viewportWidth = Math.max(1, Math.floor(windowTarget.innerWidth || 1));
    viewportHeight = Math.max(1, Math.floor(windowTarget.innerHeight || 1));
    backingScale = titleBackingScale(
      viewportWidth,
      viewportHeight,
      windowTarget.devicePixelRatio || 1,
    );
    const backingWidth = Math.max(1, Math.round(viewportWidth * backingScale));
    const backingHeight = Math.max(1, Math.round(viewportHeight * backingScale));
    if (options.canvas.width !== backingWidth) options.canvas.width = backingWidth;
    if (options.canvas.height !== backingHeight) options.canvas.height = backingHeight;
    options.canvas.style.width = `${viewportWidth}px`;
    options.canvas.style.height = `${viewportHeight}px`;
    context?.setTransform(backingScale, 0, 0, backingScale, 0, 0);
    const count = titleParticleBudget(viewportWidth, viewportHeight);
    if (particles.length !== count) {
      particles = createParticles(count, TITLE_FIELD_SEED ^ openingOrdinal);
    }
    if (active()) draw(now(), 0);
  };

  const draw = (timestamp: number, deltaSeconds: number): void => {
    if (!context) return;
    const elapsed = timestamp - openingStartedAt;
    const bloom = titleOpeningBloom(elapsed, reducedMotionQuery.matches);
    const openingWave = openingWaveStrength(elapsed, reducedMotionQuery.matches);
    const seconds = timestamp / 1_000;
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.fillStyle = "rgb(2, 8, 9)";
    context.fillRect(0, 0, viewportWidth, viewportHeight);

    context.save();
    context.lineCap = "round";

    /* Broad currents make the whole screen feel submerged; their fine cores
       retain the chart-like identity without becoming a stack of straight
       decorative rules. */
    for (let lane = 0; lane < 11; lane += 1) {
      traceTitleCurrent(context, viewportWidth, viewportHeight, lane, seconds);
      const warm = lane === 3 || lane === 8;
      const red = warm ? 197 : 105 + lane * 5;
      const green = warm ? 172 : 181 + lane * 3;
      const blue = warm ? 107 : 174 + lane * 4;
      context.lineWidth = 16 + (lane % 4) * 4 + bloom * 7;
      context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${0.018 + bloom * 0.018})`;
      context.stroke();
      context.lineWidth = 2.2 + (lane % 2) * 0.7 + bloom * 0.75;
      context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${0.075 + bloom * 0.07})`;
      context.stroke();
      context.lineWidth = 0.58 + bloom * 0.52;
      context.strokeStyle = `rgba(${Math.min(235, red + 44)}, ${Math.min(239, green + 39)}, ${Math.min(231, blue + 35)}, ${0.16 + bloom * 0.13})`;
      context.stroke();
    }

    /* Two off-axis eddies imply a much larger moving body beyond the screen.
       Their centres sit away from the form so the typography remains open. */
    const eddies = [
      {
        x: viewportWidth * (0.11 + Math.sin(seconds * 0.041) * 0.018),
        y: viewportHeight * (0.74 + Math.cos(seconds * 0.038) * 0.016),
        baseRadius: Math.min(viewportWidth, viewportHeight) * 0.13,
        phase: 0.4,
      },
      {
        x: viewportWidth * (0.88 + Math.cos(seconds * 0.034) * 0.015),
        y: viewportHeight * (0.23 + Math.sin(seconds * 0.046) * 0.018),
        baseRadius: Math.min(viewportWidth, viewportHeight) * 0.105,
        phase: 2.1,
      },
    ] as const;
    for (let eddyIndex = 0; eddyIndex < eddies.length; eddyIndex += 1) {
      const eddy = eddies[eddyIndex]!;
      for (let contour = 0; contour < 6; contour += 1) {
        const radius = eddy.baseRadius * (0.58 + contour * 0.48);
        traceTitleEddy(
          context,
          viewportWidth,
          viewportHeight,
          eddy.x,
          eddy.y,
          radius,
          contour,
          seconds,
          eddy.phase,
        );
        const warm = eddyIndex === 1 && contour % 3 === 0;
        context.lineWidth = 7 + bloom * 4;
        context.strokeStyle = warm
          ? `rgba(197, 172, 107, ${0.018 + bloom * 0.015})`
          : `rgba(83, 178, 168, ${0.024 + bloom * 0.018})`;
        context.stroke();
        context.lineWidth = 0.65 + bloom * 0.42;
        context.strokeStyle = warm
          ? `rgba(230, 208, 148, ${0.13 + bloom * 0.08})`
          : `rgba(163, 225, 210, ${0.13 + bloom * 0.1})`;
        context.stroke();
      }
    }

    /* The opening surge expands once with the crescendo, then disappears
       rather than looping like a menu reward animation. */
    if (openingWave > 0.002) {
      for (let wave = 0; wave < 3; wave += 1) {
        traceTitleEddy(
          context,
          viewportWidth,
          viewportHeight,
          viewportWidth * 0.5,
          viewportHeight * 0.51,
          Math.min(viewportWidth, viewportHeight) * (0.08 + wave * 0.115 + (1 - openingWave) * 0.12),
          wave,
          seconds,
          wave * 0.9,
        );
        context.lineWidth = 1 + openingWave * (5 - wave);
        context.strokeStyle = `rgba(190, 235, 219, ${openingWave * (0.2 - wave * 0.038)})`;
        context.stroke();
      }
    }

    for (const particle of particles) {
      const curl = sampleTitleCurl(particle.x, particle.y, seconds, TITLE_FIELD_SEED);
      if (deltaSeconds > 0) {
        particle.x = wrapUnit(particle.x + curl.x * deltaSeconds * 0.0068 * particle.speed);
        particle.y = wrapUnit(particle.y + curl.y * deltaSeconds * 0.0052 * particle.speed);
      }
      const pulse = 0.68 + Math.sin(seconds * 0.72 + particle.phase) * 0.32;
      const magnitude = Math.max(0.001, Math.hypot(curl.x, curl.y));
      const headX = particle.x * viewportWidth;
      const headY = particle.y * viewportHeight;
      const streak = (3.5 + particle.radius * 3.6) * (0.7 + bloom * 0.52);
      context.beginPath();
      context.moveTo(
        headX - curl.x / magnitude * streak,
        headY - curl.y / magnitude * streak,
      );
      context.lineTo(headX, headY);
      context.lineWidth = Math.max(0.5, particle.radius * 0.54);
      context.strokeStyle = `rgba(181, 235, 219, ${particle.brightness * pulse * (0.2 + bloom * 0.22)})`;
      context.stroke();
      context.beginPath();
      context.arc(
        headX,
        headY,
        particle.radius * (0.62 + bloom * 0.42),
        0,
        Math.PI * 2,
      );
      context.fillStyle = `rgba(210, 243, 231, ${particle.brightness * pulse * (0.2 + bloom * 0.26)})`;
      context.fill();
    }
    context.restore();
  };

  const stopFrames = (): void => {
    if (frameHandle !== null) cancelFrame(frameHandle);
    frameHandle = null;
    lastDrawAt = 0;
  };

  const frame = (): void => {
    frameHandle = null;
    if (!active() || reducedMotionQuery.matches || !context) return;
    const timestamp = now();
    const sinceLast = lastDrawAt === 0 ? FRAME_INTERVAL_MS : timestamp - lastDrawAt;
    if (sinceLast >= FRAME_INTERVAL_MS - 0.5) {
      draw(timestamp, Math.min(0.08, Math.max(0, sinceLast / 1_000)));
      lastDrawAt = timestamp;
    }
    frameHandle = requestFrame(frame);
  };

  const reconcileActivity = (): void => {
    syncGestureListeners();
    if (!active()) {
      stopFrames();
      return;
    }
    if (reducedMotionQuery.matches || !context) {
      stopFrames();
      draw(now(), 0);
      return;
    }
    if (frameHandle === null) frameHandle = requestFrame(frame);
  };

  const sync = (nextPresented: boolean, nextUnobscured = nextPresented): void => {
    if (destroyed) return;
    const normalizedUnobscured = nextPresented && nextUnobscured;
    if (nextPresented === presented && normalizedUnobscured === unobscured) return;
    const opening = nextPresented && !presented;
    const closing = !nextPresented && presented;
    presented = nextPresented;
    unobscured = normalizedUnobscured;
    options.host.dataset.titleAtmosphere = presented ? "presented" : "hidden";
    if (opening) {
      openingOrdinal += 1;
      openingStartedAt = now();
      lastDrawAt = 0;
      particles = createParticles(
        titleParticleBudget(windowTarget.innerWidth, windowTarget.innerHeight),
        TITLE_FIELD_SEED ^ openingOrdinal,
      );
      audioArmed = true;
      options.host.dataset.titleOpening = String(openingOrdinal);
      resize();
    } else if (closing) {
      audioArmed = false;
      removeGestureListeners();
      context?.clearRect(0, 0, viewportWidth, viewportHeight);
    }
    reconcileActivity();
  };

  const onVisibilityChange = (): void => reconcileActivity();
  const onReducedMotionChange = (): void => reconcileActivity();
  const onResize = (): void => resize();
  documentTarget.addEventListener("visibilitychange", onVisibilityChange);
  reducedMotionQuery.addEventListener("change", onReducedMotionChange);
  windowTarget.addEventListener("resize", onResize, { passive: true });
  options.canvas.setAttribute("aria-hidden", "true");
  options.canvas.setAttribute("role", "presentation");
  resize();

  return {
    sync,
    resize,
    snapshot: () => ({
      presented,
      unobscured,
      running: frameHandle !== null,
      audioArmed,
      openingOrdinal,
      particleCount: particles.length,
      reducedMotion: reducedMotionQuery.matches,
      destroyed,
    }),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      presented = false;
      unobscured = false;
      audioArmed = false;
      stopFrames();
      removeGestureListeners();
      documentTarget.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      windowTarget.removeEventListener("resize", onResize);
      context?.clearRect(0, 0, viewportWidth, viewportHeight);
      options.host.dataset.titleAtmosphere = "destroyed";
    },
  };
}
