import { keyedRandomInt, keyedRandomU32, type RootSeed } from "./rng";
import { isRegionCoord } from "./regions";
import {
  FIXED_POINT,
  type EntityId,
  type ResidentCondition,
  type ResidentHistoryEvent,
  type ResidentIdentity,
  type ResidentNeeds,
  type ResidentPlayerKnowledge,
  type ResidentRole,
  type ResidentSkill,
  type ResidentSkillKind,
  type ResidentTemperament,
  type ResidentTraits,
  type ResidentVisibleGear,
} from "./types";

export const NPC_GENERATION_VERSION = 1;
export const RESIDENT_SPECIES = "human" as const;
export const RESIDENT_STABLE_ID_PREFIX = "H-" as const;
export const MAX_RESIDENT_MEMORIES = 12;

const IDENTITY_DOMAIN = 0x4e50_4349;
const RELATIONSHIP_DOMAIN = 0x4e50_4352;

/**
 * Generation-v1 identity data. Array order is authoritative because selection
 * is deterministic; once v1 ships, changing an entry requires a new generator
 * version so established people cannot be silently renamed.
 *
 * Names are deliberately independent from appearance, temperament, morality,
 * and role. A displayed name never infers a protected personal trait.
 */
const GIVEN_NAMES = [
  "Aaliyah", "Aarav", "Ada", "Adama", "Adil", "Aiko", "Aisha", "Akari", "Akira", "Aleksa",
  "Alma", "Amara", "Amir", "Ana", "Ananya", "Anders", "André", "Anika", "Anwar", "Aoife",
  "Aria", "Ari", "Arjun", "Aroha", "Asha", "Aster", "Astrid", "Aya", "Ayana", "Aziz",
  "Bảo", "Beatriz", "Béla", "Benicio", "Bilal", "Binta", "Björn", "Bogdan", "Brigid", "Brin",
  "Camila", "Carmen", "Caro", "Carys", "Celyn", "Chidi", "Chioma", "Chloé", "Cian", "Clara",
  "Conor", "Cora", "Dalia", "Daniel", "Dara", "David", "Deepa", "Deni", "Diego", "Dima",
  "Dinesh", "Ece", "Edda", "Eileen", "Elena", "Elian", "Elias", "Elif", "Elio", "Eshe",
  "Esteban", "Eva", "Farah", "Farid", "Farrow", "Fatima", "Femi", "Fenn", "Fionn", "Freja",
  "Gabriela", "Gábor", "Gale", "Gilda", "Hana", "Haru", "Hassan", "Hawa", "Heidi", "Hesper",
  "Hiro", "Hollis", "Hugo", "Imani", "Inés", "Ingrid", "Iona", "Ira", "Irina", "Isaac",
  "Isen", "Isla", "Ivan", "Jae", "Jamal", "Jana", "Javier", "Jia", "João", "Jordan",
  "Jori", "José", "Jun", "Junia", "Kai", "Kalani", "Kamil", "Karima", "Kato", "Keiko",
  "Kel", "Kenji", "Kest", "Kiran", "Kwame", "Lara", "Leila", "Lena", "Levent", "Lian",
  "Lila", "Lin", "Lio", "Lior", "Luca", "Lucía", "Luka", "Lumen", "Maja", "Malika",
  "Manu", "Mara", "Mateo", "Maya", "Mei", "Mica", "Miguel", "Mina", "Mira", "Miriam",
  "Miro", "Musa", "Nadia", "Naima", "Nandi", "Naomi", "Nell", "Nia", "Nicolás", "Noor",
  "Nori", "Noura", "Oksana", "Omar", "Oriel", "Orin", "Pablo", "Perri", "Pia", "Priya",
  "Quill", "Rafael", "Ravi", "Reem", "Ren", "Rhea", "Rosa", "Rowan", "Saanvi", "Safiya",
  "Sami", "Samir", "Sana", "Santiago", "Saoirse", "Satoshi", "Selam", "Sigrid", "Simón", "Sofia",
  "Sonam", "Soraya", "Stefan", "Tadeo", "Tala", "Tariq", "Tashi", "Tavi", "Thandi", "Thiago",
  "Tomás", "Tuuli", "Uchenna", "Uma", "Una", "Valentina", "Veda", "Venn", "Vera", "Viktor",
  "Wafa", "Wanjiku", "Wei", "Wren", "Xara", "Ximena", "Yara", "Yasmin", "Yori", "Yuna",
  "Yusuf", "Zahra", "Zain", "Zanele", "Zev", "Zofia",
] as const;
const FAMILY_NAMES = [
  "Abadi", "Abebe", "Abdalla", "Adeyemi", "Afolayan", "Ahmed", "Akhtar", "Alder", "Ali", "Almeida",
  "Alvarez", "Andersen", "Andersson", "Antonov", "Aoki", "Araya", "Arslan", "Asante", "Aung", "Azoulay",
  "Bae", "Bakker", "Banda", "Banerjee", "Baranov", "Barros", "Becker", "Bekele", "Benali", "Bennett",
  "Berg", "Bhandari", "Bianchi", "Boateng", "Bogdanović", "Bourne", "Brack", "Brown", "Byrne", "Cabrera",
  "Campbell", "Carvalho", "Chandra", "Chen", "Choi", "Costa", "Cruz", "Dahl", "Diallo", "Dimitrov",
  "D'Souza", "Dubois", "Eklund", "El-Sayed", "Farah", "Fernández", "Fischer", "Flores", "Fujimoto", "García",
  "Georgiou", "Ghosh", "Girma", "Gómez", "González", "Green", "Gupta", "Haddad", "Hansen", "Hassan",
  "Hernández", "Hoàng", "Holm", "Horváth", "Hossain", "Hu", "Ibrahim", "Ionescu", "Ivanov", "Jallow",
  "Jensen", "Jiménez", "Johnson", "Jónsdóttir", "Joseph", "Kaczmarek", "Kamau", "Kapoor", "Kaya", "Keita",
  "Khan", "Kim", "Kovač", "Kowalski", "Kumar", "Larsen", "Lee", "Li", "Lindberg", "López",
  "Mabhena", "MacLeod", "Mahfouz", "Malik", "Mansour", "Martin", "Martínez", "Mensah", "Meyer", "Mihai",
  "Miller", "Mohamud", "Molina", "Moreau", "Moreno", "Moyo", "Müller", "Nakamura", "Ndlovu", "Nelson",
  "Nguyễn", "Nielsen", "Novak", "Nwosu", "O'Connor", "Okafor", "Oliveira", "Ortiz", "Osman", "Owusu",
  "Park", "Patel", "Pereira", "Petrov", "Popescu", "Rahman", "Ramos", "Reddy", "Reyes", "Ribeiro",
  "Rivera", "Rossi", "Ruiz", "Saito", "Salazar", "Santos", "Schmidt", "Silva", "Singh", "Sokolov",
  "Sørensen", "Suzuki", "Tan", "Taylor", "Tesfaye", "Thompson", "Torres", "Traoré", "Trần", "Valdez",
  "Varga", "Vargas", "Wang", "Weber", "Williams", "Wilson", "Wong", "Yamada", "Yang", "Yılmaz",
  "Young", "Zhang", "Zieliński", "Žorić", "Anchor", "Bay", "Breaker", "Channel", "Current", "Drift",
  "Dunlin", "Ebb", "Estuary", "Fathom", "Flint", "Gannet", "Harbor", "Heron", "Inlet", "Islet",
  "Jetty", "Keel", "Kelp", "Lantern", "Marsh", "Mooring", "Reed", "Rill", "Shoal", "Sound",
  "Tern", "Tide", "Vale", "Wake", "Weaver", "Wether",
] as const;

export const RESIDENT_NAME_DICTIONARY_COUNTS: Readonly<{
  given: number;
  family: number;
}> = Object.freeze({
  given: GIVEN_NAMES.length,
  family: FAMILY_NAMES.length,
});

function assertNameDictionary(
  label: "given" | "family",
  values: readonly string[],
): void {
  const normalizedKeys = new Set<string>();
  for (const value of values) {
    if (
      value.length === 0
      || value !== value.trim()
      || /\s/u.test(value)
      || value !== value.normalize("NFC")
    ) {
      throw new Error(`Resident ${label}-name dictionary contains an empty, whitespace, or non-NFC entry`);
    }
    const key = value.normalize("NFC").toLocaleLowerCase("und");
    if (normalizedKeys.has(key)) {
      throw new Error(`Resident ${label}-name dictionary contains normalized duplicate ${value}`);
    }
    normalizedKeys.add(key);
  }
}

/** Development/test guard for deterministic identity data without exporting its mutable pools. */
export function assertResidentNameDictionaries(): void {
  assertNameDictionary("given", GIVEN_NAMES);
  assertNameDictionary("family", FAMILY_NAMES);
}

const COMPATIBILITY_SETTLEMENT_KEY = /:0:0:settlement:n:([0-6])$/u;

const AGES: readonly ResidentIdentity["age"][] = [
  "young-adult",
  "adult",
  "adult",
  "adult",
  "older-adult",
];
const BUILDS: readonly ResidentIdentity["build"][] = [
  "slight",
  "lean",
  "average",
  "average",
  "broad",
  "stocky",
];
const HAIR: readonly ResidentIdentity["appearance"]["hair"][] = [
  "black",
  "brown",
  "auburn",
  "gray",
  "silver",
  "cropped",
  "covered",
];
const MARKS: readonly ResidentIdentity["appearance"]["mark"][] = [
  "none",
  "none",
  "freckles",
  "weathered",
  "brow-scar",
  "hand-scar",
  "round-glasses",
];
const PALETTES: readonly ResidentIdentity["appearance"]["palette"][] = [
  "silt",
  "reed",
  "tide",
  "ember",
  "lichen",
  "storm",
];
/** Curated pairs preserve variety without generating self-cancelling personality soup. */
const TEMPERAMENT_PAIRS: readonly (readonly [ResidentTemperament, ResidentTemperament])[] = [
  ["calm", "practical"],
  ["calm", "patient"],
  ["calm", "protective"],
  ["nervous", "cautious"],
  ["nervous", "social"],
  ["bold", "curious"],
  ["bold", "social"],
  ["cautious", "patient"],
  ["cautious", "practical"],
  ["curious", "optimistic"],
  ["curious", "social"],
  ["reserved", "patient"],
  ["reserved", "practical"],
  ["patient", "protective"],
  ["practical", "stubborn"],
  ["protective", "social"],
  ["stubborn", "optimistic"],
];
const SECONDARY_SKILLS: readonly ResidentSkillKind[] = [
  "navigation",
  "first-aid",
  "swimming",
  "weather-knowledge",
  "rope-work",
  "animal-handling",
  "repair",
  "foraging",
];
const HISTORY_KINDS: readonly ResidentHistoryEvent["kind"][] = [
  "survived-storm",
  "worked-another-route",
  "rescued-traveler",
  "lost-equipment",
  "learned-trade",
  "migrated-settlement",
];

const ROLE_SKILL: Readonly<Record<ResidentRole, ResidentSkillKind>> = {
  fisher: "swimming",
  harvester: "foraging",
  medic: "first-aid",
  mechanic: "repair",
  navigator: "navigation",
  steward: "weather-knowledge",
};

const ROLE_GEAR: Readonly<Record<ResidentRole, readonly ResidentVisibleGear[]>> = {
  fisher: ["reed-hat", "waterproof-pack", "walking-pole"],
  harvester: ["reed-hat", "rope-coil", "walking-pole"],
  medic: ["medical-satchel", "rain-shell", "walking-pole"],
  mechanic: ["tool-roll", "waterproof-pack", "rain-shell"],
  navigator: ["map-case", "walking-pole", "rain-shell"],
  steward: ["waterproof-pack", "map-case", "rain-shell"],
};

export interface ResidentIdentityGenerationInput {
  readonly seed: RootSeed;
  readonly originSettlementId: EntityId;
  /** Stable semantic origin; unlike numeric IDs this survives allocator insertions. */
  readonly originSettlementKey: string;
  readonly originActorOrdinal: number;
  readonly role: ResidentRole;
  readonly originRegion: { readonly x: number; readonly y: number };
}

function semanticTextToken(value: string, initial = 0x811c_9dc5): number {
  let hash = initial;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }
  return hash;
}

function semanticSettlementToken(input: ResidentIdentityGenerationInput): number {
  return semanticTextToken(input.originSettlementKey);
}

/**
 * Symmetric relationship baseline addressed by persistent actor identity.
 * Numeric entity allocation and resident-array order therefore cannot reroll
 * an established pair's social starting point.
 */
export function residentRelationshipTrust(
  seed: RootSeed,
  leftStableId: string,
  rightStableId: string,
): number {
  if (leftStableId.length === 0 || rightStableId.length === 0 || leftStableId === rightStableId) {
    throw new RangeError("Resident relationship IDs must be distinct persistent identities");
  }
  const low = leftStableId < rightStableId ? leftStableId : rightStableId;
  const high = leftStableId < rightStableId ? rightStableId : leftStableId;
  const lowPrimary = semanticTextToken(low);
  const highPrimary = semanticTextToken(high);
  const lowSecondary = semanticTextToken(low, 0x9e37_79b9);
  const highSecondary = semanticTextToken(high, 0x85eb_ca6b);
  return keyedRandomInt(
    seed,
    RELATIONSHIP_DOMAIN,
    lowPrimary,
    highPrimary,
    lowSecondary,
    280_000,
    620_000,
    highSecondary,
  );
}

function choose<T>(
  values: readonly T[],
  input: ResidentIdentityGenerationInput,
  purpose: number,
  ordinal = 0,
): T {
  const index = keyedRandomInt(
    input.seed,
    IDENTITY_DOMAIN,
    input.originRegion.x,
    input.originRegion.y,
    purpose,
    0,
    values.length - 1,
    semanticSettlementToken(input) * 97 + input.originActorOrdinal * 11 + ordinal,
  );
  const value = values[index];
  if (value === undefined) throw new Error("Resident identity dictionary is empty");
  return value;
}

function signedCoordinate(value: number): string {
  return value < 0 ? `n${Math.abs(value).toString(36)}` : `p${value.toString(36)}`;
}

function assertGenerationInput(input: ResidentIdentityGenerationInput): void {
  if (
    !Array.isArray(input.seed)
    || input.seed.length !== 4
    || input.seed.some((word) =>
      !Number.isSafeInteger(word)
      || word < 0
      || word > 0xffff_ffff
      || Object.is(word, -0)
    )
    || !Number.isSafeInteger(input.originSettlementId) || input.originSettlementId <= 0
    || typeof input.originSettlementKey !== "string" || input.originSettlementKey.length === 0
    || !Number.isSafeInteger(input.originActorOrdinal) || input.originActorOrdinal < 0
    || !isRegionCoord(input.originRegion)
  ) throw new RangeError("Resident identity inputs must be stable safe integers");
}

/** Display identity is semantic: allocator order and numeric actor ID cannot rename a person. */
export function generateResidentDisplayName(input: ResidentIdentityGenerationInput): string {
  assertGenerationInput(input);
  const compatibilityOrdinalText = COMPATIBILITY_SETTLEMENT_KEY.exec(input.originSettlementKey)?.[1];
  const compatibilityOrdinal = compatibilityOrdinalText === undefined
    ? -1
    : Number(compatibilityOrdinalText);
  if (compatibilityOrdinal >= 0 && input.originActorOrdinal < 6) {
    const seedShift = keyedRandomInt(
      input.seed,
      IDENTITY_DOMAIN,
      input.originRegion.x,
      input.originRegion.y,
      90,
      0,
      GIVEN_NAMES.length - 1,
    );
    const given = GIVEN_NAMES[
      (seedShift + compatibilityOrdinal * 6 + input.originActorOrdinal) % GIVEN_NAMES.length
    ];
    if (given === undefined) throw new Error("Resident given-name dictionary is empty");
    return `${given} ${choose(FAMILY_NAMES, input, 92)}`;
  }
  return `${choose(GIVEN_NAMES, input, 91)} ${choose(FAMILY_NAMES, input, 92)}`;
}

function stableResidentIdV1(input: ResidentIdentityGenerationInput): string {
  assertGenerationInput(input);
  const settlementToken = semanticSettlementToken(input);
  const token = keyedRandomU32(
    input.seed,
    IDENTITY_DOMAIN,
    input.originRegion.x,
    input.originRegion.y,
    settlementToken,
    input.originActorOrdinal + 10_000,
  ).toString(36).padStart(7, "0");
  return `${RESIDENT_STABLE_ID_PREFIX}v1-${signedCoordinate(input.originRegion.x)}${signedCoordinate(input.originRegion.y)}-${settlementToken.toString(36)}-${input.originActorOrdinal.toString(36)}-${token}`;
}

/**
 * Routes validation through the algorithm that originally created an identity.
 * Historical promoted actors therefore remain authoritative after a generator
 * upgrade instead of being silently rerolled by the latest implementation.
 */
export function stableResidentIdForGeneration(
  input: ResidentIdentityGenerationInput,
  generationVersion: number,
): string {
  switch (generationVersion) {
    case 1:
      return stableResidentIdV1(input);
    default:
      throw new RangeError(`Unsupported resident generation version ${String(generationVersion)}`);
  }
}

export function stableResidentId(input: ResidentIdentityGenerationInput): string {
  return stableResidentIdForGeneration(input, NPC_GENERATION_VERSION);
}

function heightFor(input: ResidentIdentityGenerationInput, age: ResidentIdentity["age"]): number {
  const baseline = keyedRandomInt(
    input.seed,
    IDENTITY_DOMAIN,
    input.originRegion.x,
    input.originRegion.y,
    41,
    154,
    193,
    semanticSettlementToken(input) * 53 + input.originActorOrdinal,
  );
  return age === "older-adult" ? Math.max(150, baseline - 1) : baseline;
}

function temperamentFor(input: ResidentIdentityGenerationInput): ResidentTemperament[] {
  return [...choose(TEMPERAMENT_PAIRS, input, 51)];
}

function skillsFor(input: ResidentIdentityGenerationInput): ResidentSkill[] {
  const primary = ROLE_SKILL[input.role];
  let secondary = choose(SECONDARY_SKILLS, input, 61);
  if (secondary === primary) {
    secondary = SECONDARY_SKILLS[(SECONDARY_SKILLS.indexOf(primary) + 3) % SECONDARY_SKILLS.length]
      ?? "rope-work";
  }
  return [
    {
      kind: primary,
      aptitude: keyedRandomInt(
        input.seed,
        IDENTITY_DOMAIN,
        input.originRegion.x,
        input.originRegion.y,
        62,
        620_000,
        940_000,
        semanticSettlementToken(input) + input.originActorOrdinal,
      ),
    },
    {
      kind: secondary,
      aptitude: keyedRandomInt(
        input.seed,
        IDENTITY_DOMAIN,
        input.originRegion.x,
        input.originRegion.y,
        63,
        280_000,
        760_000,
        semanticSettlementToken(input) + input.originActorOrdinal,
      ),
    },
  ];
}

function gearFor(input: ResidentIdentityGenerationInput): ResidentVisibleGear[] {
  const choices = ROLE_GEAR[input.role];
  const first = choices[input.originActorOrdinal % choices.length] ?? choices[0];
  const second = choices[(input.originActorOrdinal + 1) % choices.length] ?? choices[1];
  return [...new Set([first, second].filter((item): item is ResidentVisibleGear => item !== undefined))];
}

export function generateResidentIdentity(input: ResidentIdentityGenerationInput): ResidentIdentity {
  assertGenerationInput(input);

  const age = choose(AGES, input, 11);
  const historyCount = 1 + (input.originActorOrdinal % 2);
  const history: ResidentHistoryEvent[] = [];
  for (let index = 0; index < historyCount; index += 1) {
    const kind = choose(HISTORY_KINDS, input, 71, index);
    if (history.some((event) => event.kind === kind)) continue;
    history.push({
      kind,
      worldDay: keyedRandomInt(
        input.seed,
        IDENTITY_DOMAIN,
        input.originRegion.x,
        input.originRegion.y,
        72,
        1,
        240,
        semanticSettlementToken(input) + input.originActorOrdinal * 3 + index,
      ),
    });
  }

  return {
    stableId: stableResidentId(input),
    generationVersion: NPC_GENERATION_VERSION,
    species: RESIDENT_SPECIES,
    originRegion: { x: input.originRegion.x, y: input.originRegion.y },
    originSettlementKey: input.originSettlementKey,
    originActorOrdinal: input.originActorOrdinal,
    originSettlementId: input.originSettlementId,
    originRole: input.role,
    age,
    heightCm: heightFor(input, age),
    build: choose(BUILDS, input, 21),
    appearance: {
      hair: choose(HAIR, input, 31),
      mark: choose(MARKS, input, 32),
      palette: choose(PALETTES, input, 33),
    },
    temperament: temperamentFor(input),
    skills: skillsFor(input),
    visibleGear: gearFor(input),
    history,
  };
}

export function createResidentCondition(input: ResidentIdentityGenerationInput): ResidentCondition {
  return {
    wetness: 0,
    coldStress: 0,
    exhaustion: keyedRandomInt(
      input.seed,
      IDENTITY_DOMAIN,
      input.originRegion.x,
      input.originRegion.y,
      81,
      40_000,
      180_000,
      semanticSettlementToken(input) + input.originActorOrdinal,
    ),
    emotion: "content",
    emotionCause: "ROUTINE_SAFE",
    sheltering: false,
    routeDelayTicks: 0,
  };
}

function semanticBaseline(
  input: ResidentIdentityGenerationInput,
  purpose: number,
  minimum: number,
  maximum: number,
): number {
  return keyedRandomInt(
    input.seed,
    IDENTITY_DOMAIN,
    input.originRegion.x,
    input.originRegion.y,
    purpose,
    minimum,
    maximum,
    semanticSettlementToken(input) * 131 + input.originActorOrdinal,
  );
}

/** Persistent behavioral baselines follow the same semantic actor as appearance. */
export function generateResidentTraits(input: ResidentIdentityGenerationInput): ResidentTraits {
  assertGenerationInput(input);
  return {
    resolve: semanticBaseline(input, 101, 180_000, 900_000),
    empathy: semanticBaseline(input, 102, 180_000, 900_000),
    curiosity: semanticBaseline(input, 103, 180_000, 900_000),
  };
}

/** Needs begin differently per person without depending on numeric allocation order. */
export function generateResidentNeeds(input: ResidentIdentityGenerationInput): ResidentNeeds {
  assertGenerationInput(input);
  return {
    food: semanticBaseline(input, 111, 120_000, 420_000),
    rest: semanticBaseline(input, 112, 100_000, 460_000),
    belonging: semanticBaseline(input, 113, 80_000, 400_000),
  };
}

export function createResidentPlayerKnowledge(): ResidentPlayerKnowledge {
  return {
    level: "unfamiliar",
    firstObservedTick: null,
    introducedTick: null,
    facts: [],
  };
}

export function residentSkillAptitude(
  identity: ResidentIdentity,
  kind: ResidentSkillKind,
): number {
  return identity.skills.find((skill) => skill.kind === kind)?.aptitude ?? 0;
}

export function residentRainProtection(identity: ResidentIdentity): number {
  const shell = identity.visibleGear.includes("rain-shell") ? 430_000 : 0;
  const pack = identity.visibleGear.includes("waterproof-pack") ? 80_000 : 0;
  const weatherSkill = Math.trunc(residentSkillAptitude(identity, "weather-knowledge") / 5);
  return Math.min(FIXED_POINT, shell + pack + weatherSkill);
}

export function residentKnowsFact(
  knowledge: ResidentPlayerKnowledge,
  fact: ResidentPlayerKnowledge["facts"][number],
): boolean {
  return knowledge.facts.includes(fact);
}
