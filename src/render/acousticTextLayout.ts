/** A screen-space point supplied by a renderer-neutral projection. */
export interface AcousticTextPoint {
  readonly x: number;
  readonly y: number;
}

/** A measured screen-space box. Measurements are inputs, never guessed here. */
export interface AcousticTextSize {
  readonly width: number;
  readonly height: number;
}

/** A top-left-origin screen-space rectangle. */
export interface AcousticTextRect extends AcousticTextSize {
  readonly x: number;
  readonly y: number;
}

/**
 * One bounded offset around every source anchor. Lower `order` values are
 * attempted first and lane ID is the stable tie-break, so array order cannot
 * change placement. These are source-relative lanes, not a global text grid.
 */
export interface AcousticTextLane {
  readonly id: string;
  readonly order: number;
  readonly offset: AcousticTextPoint;
}

/**
 * A lawful, already-selected acoustic fact with renderer-supplied text metrics.
 * The layout does not inspect copy or invent presentation facts.
 */
export interface AcousticTextCandidate {
  readonly id: string;
  readonly sourceId: string;
  readonly priority: number;
  readonly salience: number;
  readonly anchor: AcousticTextPoint;
  readonly box: AcousticTextSize;
}

export const MAX_ACOUSTIC_TEXT_PLACEMENTS = 4;
export const DEFAULT_ACOUSTIC_TEXT_PER_SOURCE_CAP = 1;
export const DEFAULT_ACOUSTIC_TEXT_GUTTER = 8;
/**
 * Labels may settle across a nearby screen edge, but an off-screen source may
 * not acquire a false exact edge anchor through arbitrary viewport clamping.
 */
export const MAX_ACOUSTIC_TEXT_EDGE_CLAMP = 16;

export interface AcousticTextLayoutOptions {
  readonly lanes: readonly AcousticTextLane[];
  /** Playable screen aperture. Every placed label remains wholly inside it. */
  readonly viewport: AcousticTextRect;
  /** Requested cap, hard-bounded by `MAX_ACOUSTIC_TEXT_PLACEMENTS`. */
  readonly globalCap?: number;
  /** Requested arbitration-shortlist cap for any one physical source. */
  readonly perSourceCap?: number;
  /** Minimum screen-space separation between placed rectangles. */
  readonly gutter?: number;
}

export interface AcousticTextPlacement<
  Candidate extends AcousticTextCandidate = AcousticTextCandidate,
> {
  readonly candidate: Candidate;
  readonly laneId: string;
  readonly rect: AcousticTextRect;
}

export type AcousticTextSuppressionReason =
  | "invalid-candidate"
  | "duplicate-id"
  | "per-source-cap"
  | "global-cap"
  | "no-fitting-lane"
  | "overlap";

export interface AcousticTextSuppression<
  Candidate extends AcousticTextCandidate = AcousticTextCandidate,
> {
  readonly candidate: Candidate;
  readonly reason: AcousticTextSuppressionReason;
}

export interface AcousticTextLayoutResult<
  Candidate extends AcousticTextCandidate = AcousticTextCandidate,
> {
  readonly placements: readonly AcousticTextPlacement<Candidate>[];
  readonly suppressions: readonly AcousticTextSuppression<Candidate>[];
}

interface IndexedCandidate<Candidate extends AcousticTextCandidate> {
  readonly candidate: Candidate;
  readonly inputIndex: number;
}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareFiniteNumber = (left: number, right: number): number => {
  const leftFinite = Number.isFinite(left);
  const rightFinite = Number.isFinite(right);
  if (leftFinite !== rightFinite) return leftFinite ? -1 : 1;
  if (!leftFinite) return 0;
  return left < right ? -1 : left > right ? 1 : 0;
};

const rank = (value: number): number =>
  Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;

function compareCandidates<Candidate extends AcousticTextCandidate>(
  left: IndexedCandidate<Candidate>,
  right: IndexedCandidate<Candidate>,
): number {
  const leftPriority = rank(left.candidate.priority);
  const rightPriority = rank(right.candidate.priority);
  if (leftPriority !== rightPriority) return leftPriority > rightPriority ? -1 : 1;

  const leftSalience = rank(left.candidate.salience);
  const rightSalience = rank(right.candidate.salience);
  if (leftSalience !== rightSalience) return leftSalience > rightSalience ? -1 : 1;

  return compareText(left.candidate.id, right.candidate.id)
    || compareText(left.candidate.sourceId, right.candidate.sourceId)
    || compareFiniteNumber(left.candidate.anchor.x, right.candidate.anchor.x)
    || compareFiniteNumber(left.candidate.anchor.y, right.candidate.anchor.y)
    || compareFiniteNumber(left.candidate.box.width, right.candidate.box.width)
    || compareFiniteNumber(left.candidate.box.height, right.candidate.box.height)
    || left.inputIndex - right.inputIndex;
}

const validRect = (rect: AcousticTextRect): boolean =>
  Number.isFinite(rect.x)
  && Number.isFinite(rect.y)
  && Number.isFinite(rect.width)
  && Number.isFinite(rect.height)
  && rect.width > 0
  && rect.height > 0;

const validCandidate = (candidate: AcousticTextCandidate): boolean =>
  candidate.id.trim().length > 0
  && candidate.sourceId.trim().length > 0
  && Number.isFinite(candidate.priority)
  && Number.isFinite(candidate.salience)
  && Number.isFinite(candidate.anchor.x)
  && Number.isFinite(candidate.anchor.y)
  && Number.isFinite(candidate.box.width)
  && Number.isFinite(candidate.box.height)
  && candidate.box.width > 0
  && candidate.box.height > 0;

function compareLanes(left: AcousticTextLane, right: AcousticTextLane): number {
  return compareFiniteNumber(left.order, right.order)
    || compareText(left.id, right.id)
    || compareFiniteNumber(left.offset.x, right.offset.x)
    || compareFiniteNumber(left.offset.y, right.offset.y);
}

/** Malformed or duplicate lane identities are ignored rather than guessed through. */
function canonicalLanes(lanes: readonly AcousticTextLane[]): readonly AcousticTextLane[] {
  const valid = lanes
    .filter((lane) => (
      lane.id.trim().length > 0
      && Number.isFinite(lane.order)
      && Number.isFinite(lane.offset.x)
      && Number.isFinite(lane.offset.y)
    ))
    .slice()
    .sort(compareLanes);
  const counts = new Map<string, number>();
  for (const lane of valid) counts.set(lane.id, (counts.get(lane.id) ?? 0) + 1);
  return valid.filter((lane) => counts.get(lane.id) === 1);
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

function rectInLane(
  candidate: AcousticTextCandidate,
  lane: AcousticTextLane,
  viewport: AcousticTextRect,
): AcousticTextRect | null {
  if (
    candidate.box.width > viewport.width
    || candidate.box.height > viewport.height
  ) return null;
  const maximumX = viewport.x + viewport.width - candidate.box.width;
  const maximumY = viewport.y + viewport.height - candidate.box.height;
  const rawX = candidate.anchor.x + lane.offset.x - candidate.box.width / 2;
  const rawY = candidate.anchor.y + lane.offset.y - candidate.box.height / 2;
  const x = clamp(rawX, viewport.x, maximumX);
  const y = clamp(rawY, viewport.y, maximumY);
  // A visible source may sit on an edge or beneath a reserved HUD gutter, so
  // account for one label half-extent and the authored lane reach. Anything
  // beyond that plus the small settling allowance is not a nearby lane: it is
  // an off-screen source being dragged into an exact-looking edge position.
  const maximumClampX = candidate.box.width / 2
    + Math.abs(lane.offset.x)
    + MAX_ACOUSTIC_TEXT_EDGE_CLAMP;
  const maximumClampY = candidate.box.height / 2
    + Math.abs(lane.offset.y)
    + MAX_ACOUSTIC_TEXT_EDGE_CLAMP;
  if (
    Math.abs(x - rawX) > maximumClampX
    || Math.abs(y - rawY) > maximumClampY
  ) return null;
  return Object.freeze({
    x,
    y,
    width: candidate.box.width,
    height: candidate.box.height,
  });
}

/** True when two rectangles have less than the requested gutter between them. */
export function acousticTextRectsOverlap(
  left: AcousticTextRect,
  right: AcousticTextRect,
  gutter = DEFAULT_ACOUSTIC_TEXT_GUTTER,
): boolean {
  const safeGutter = Number.isFinite(gutter) ? Math.max(0, gutter) : DEFAULT_ACOUSTIC_TEXT_GUTTER;
  return left.x < right.x + right.width + safeGutter
    && left.x + left.width + safeGutter > right.x
    && left.y < right.y + right.height + safeGutter
    && left.y + left.height + safeGutter > right.y;
}

const boundedInteger = (value: number | undefined, fallback: number, maximum: number): number => {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(maximum, Math.floor(value)));
};

const suppression = <Candidate extends AcousticTextCandidate>(
  candidate: Candidate,
  reason: AcousticTextSuppressionReason,
): AcousticTextSuppression<Candidate> => Object.freeze({ candidate, reason });

/**
 * Deterministically arbitrates and places a small set of acoustic text boxes.
 *
 * Higher priority wins, then higher salience, then ascending stable ID. Only
 * the capped shortlist reaches geometry work. Each shortlisted candidate tries
 * fixed source-relative lanes in canonical order. Its measured rectangle is
 * centered on the lane offset and clamped wholly inside the playable viewport.
 * A box is suppressed when every fitting lane would violate the shared gutter.
 *
 * This function is pure: it reads no clock, frame counter, RNG, or retained
 * renderer state. Given equal candidates, lanes, and options, Chart and Relief
 * therefore receive equal placement and suppression decisions.
 */
export function layoutAcousticText<Candidate extends AcousticTextCandidate>(
  candidates: readonly Candidate[],
  options: AcousticTextLayoutOptions,
): AcousticTextLayoutResult<Candidate> {
  const globalCap = boundedInteger(
    options.globalCap,
    MAX_ACOUSTIC_TEXT_PLACEMENTS,
    MAX_ACOUSTIC_TEXT_PLACEMENTS,
  );
  const perSourceCap = boundedInteger(
    options.perSourceCap,
    Math.min(DEFAULT_ACOUSTIC_TEXT_PER_SOURCE_CAP, globalCap),
    globalCap,
  );
  const gutter = Number.isFinite(options.gutter)
    ? Math.max(0, options.gutter ?? DEFAULT_ACOUSTIC_TEXT_GUTTER)
    : DEFAULT_ACOUSTIC_TEXT_GUTTER;
  const lanes = canonicalLanes(options.lanes);
  const viewport = validRect(options.viewport) ? options.viewport : null;
  const ordered = candidates
    .map((candidate, inputIndex): IndexedCandidate<Candidate> => ({ candidate, inputIndex }))
    .sort(compareCandidates);
  const candidateIdCounts = new Map<string, number>();
  for (const { candidate } of ordered) {
    candidateIdCounts.set(candidate.id, (candidateIdCounts.get(candidate.id) ?? 0) + 1);
  }

  const placements: AcousticTextPlacement<Candidate>[] = [];
  const suppressions: AcousticTextSuppression<Candidate>[] = [];
  const admittedBySource = new Map<string, number>();
  let admittedCount = 0;

  for (const { candidate } of ordered) {
    if (!validCandidate(candidate)) {
      suppressions.push(suppression(candidate, "invalid-candidate"));
      continue;
    }
    if ((candidateIdCounts.get(candidate.id) ?? 0) !== 1) {
      suppressions.push(suppression(candidate, "duplicate-id"));
      continue;
    }
    if ((admittedBySource.get(candidate.sourceId) ?? 0) >= perSourceCap) {
      suppressions.push(suppression(candidate, "per-source-cap"));
      continue;
    }
    if (admittedCount >= globalCap) {
      suppressions.push(suppression(candidate, "global-cap"));
      continue;
    }
    let fittingLaneCount = 0;
    let chosen: AcousticTextPlacement<Candidate> | null = null;
    if (viewport === null) {
      suppressions.push(suppression(candidate, "no-fitting-lane"));
      continue;
    }
    for (const lane of lanes) {
      const rect = rectInLane(candidate, lane, viewport);
      if (rect === null) continue;
      fittingLaneCount += 1;
      const overlaps = placements.some((placed) => (
        acousticTextRectsOverlap(rect, placed.rect, gutter)
      ));
      if (overlaps) continue;
      chosen = Object.freeze({ candidate, laneId: lane.id, rect });
      break;
    }

    if (chosen === null) {
      suppressions.push(suppression(
        candidate,
        fittingLaneCount === 0 ? "no-fitting-lane" : "overlap",
      ));
      continue;
    }
    admittedBySource.set(
      candidate.sourceId,
      (admittedBySource.get(candidate.sourceId) ?? 0) + 1,
    );
    admittedCount += 1;
    placements.push(chosen);
  }

  return Object.freeze({
    placements: Object.freeze(placements),
    suppressions: Object.freeze(suppressions),
  });
}
