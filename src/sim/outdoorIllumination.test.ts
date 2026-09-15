import { describe, expect, it } from "vitest";

import { REGION_COORD_LIMIT, type RegionTileAddress } from "./regions";
import {
  MAX_OUTDOOR_LOCAL_LIGHT_RADIUS_TILES,
  MAX_OUTDOOR_LOCAL_LIGHT_SOURCES,
  evaluateOutdoorIllumination,
  outdoorTerrainTransmission,
  outdoorWeatherTransmission,
  type OutdoorIlluminationInput,
  type OutdoorLocalLightSource,
} from "./outdoorIllumination";
import { FIXED_POINT, WORLD_WIDTH } from "./types";
import {
  WORLD_DAY_START_TICK,
  WORLD_NIGHT_START_TICK,
} from "./worldTime";

const ORIGIN: RegionTileAddress = Object.freeze({
  region: Object.freeze({ x: 0, y: 0 }),
  localX: 12,
  localY: 12,
});

function sample(
  overrides: Partial<OutdoorIlluminationInput> = {},
): OutdoorIlluminationInput {
  return {
    tick: WORLD_DAY_START_TICK,
    weather: { kind: "clear", intensity: 0 },
    target: ORIGIN,
    terrain: { kind: "deep-water", roughness: 0 },
    coverTransmission: FIXED_POINT,
    localLights: [],
    ...overrides,
  };
}

function lamp(
  stableId: string,
  overrides: Partial<OutdoorLocalLightSource> = {},
): OutdoorLocalLightSource {
  return {
    stableId,
    kind: "settlement-lamp",
    position: ORIGIN,
    intensity: 600_000,
    radiusTiles: 8,
    lineTransmission: FIXED_POINT,
    ...overrides,
  };
}

describe("authoritative outdoor illumination", () => {
  it("derives physical daylight and night from the one shared world clock", () => {
    const day = evaluateOutdoorIllumination(sample());
    const night = evaluateOutdoorIllumination(sample({ tick: WORLD_NIGHT_START_TICK }));

    expect(day).toMatchObject({
      version: 1,
      openSkyIllumination: FIXED_POINT,
      weatherTransmission: FIXED_POINT,
      terrainTransmission: FIXED_POINT,
      ambientIllumination: FIXED_POINT,
      localIllumination: 0,
      physicalIllumination: FIXED_POINT,
    });
    expect(night).toMatchObject({
      openSkyIllumination: 100_000,
      ambientIllumination: 100_000,
      physicalIllumination: 100_000,
    });
    expect(evaluateOutdoorIllumination(sample({ tick: WORLD_NIGHT_START_TICK })))
      .toEqual(night);
  });

  it("makes weather, coarse terrain, and physical cover independently reduce ambient light", () => {
    expect(outdoorWeatherTransmission("clear", FIXED_POINT)).toBe(FIXED_POINT);
    expect(outdoorWeatherTransmission("rain", FIXED_POINT)).toBe(620_000);
    expect(outdoorWeatherTransmission("mist", FIXED_POINT)).toBe(450_000);
    expect(outdoorWeatherTransmission("storm", FIXED_POINT)).toBe(330_000);
    expect(outdoorTerrainTransmission("deep-water", FIXED_POINT)).toBe(FIXED_POINT);
    expect(outdoorTerrainTransmission("marsh", FIXED_POINT)).toBe(600_000);

    const open = evaluateOutdoorIllumination(sample())!;
    const storm = evaluateOutdoorIllumination(sample({
      weather: { kind: "storm", intensity: FIXED_POINT },
    }))!;
    const roughMarsh = evaluateOutdoorIllumination(sample({
      terrain: { kind: "marsh", roughness: FIXED_POINT },
    }))!;
    const underCover = evaluateOutdoorIllumination(sample({ coverTransmission: 250_000 }))!;

    expect(storm.ambientIllumination).toBe(330_000);
    expect(roughMarsh.ambientIllumination).toBe(600_000);
    expect(underCover.ambientIllumination).toBe(250_000);
    expect(open.ambientIllumination).toBeGreaterThan(storm.ambientIllumination);
    expect(storm.ambientIllumination).toBeGreaterThan(0);
  });

  it("lets an actual local lamp reveal a dark covered target without rewriting ambient light", () => {
    const withoutLamp = evaluateOutdoorIllumination(sample({
      tick: WORLD_NIGHT_START_TICK,
      coverTransmission: 0,
    }))!;
    const withLamp = evaluateOutdoorIllumination(sample({
      tick: WORLD_NIGHT_START_TICK,
      coverTransmission: 0,
      localLights: [lamp("settlement:lamp-1")],
    }))!;

    expect(withoutLamp.physicalIllumination).toBe(0);
    expect(withLamp).toMatchObject({
      ambientIllumination: 0,
      localIllumination: 600_000,
      physicalIllumination: 600_000,
      localSourcesConsidered: 1,
      localSourcesContributing: 1,
    });
    expect("presentationLegibility" in withLamp).toBe(false);
  });

  it("attenuates local light by exact distance, weather, and physical line transmission", () => {
    const halfRadius = { ...ORIGIN, localX: ORIGIN.localX + 4 };
    const clear = evaluateOutdoorIllumination(sample({
      tick: WORLD_NIGHT_START_TICK,
      coverTransmission: 0,
      localLights: [lamp("lamp:half-radius", { position: halfRadius })],
    }))!;
    const rain = evaluateOutdoorIllumination(sample({
      tick: WORLD_NIGHT_START_TICK,
      weather: { kind: "rain", intensity: FIXED_POINT },
      coverTransmission: 0,
      localLights: [lamp("lamp:half-radius", { position: halfRadius })],
    }))!;
    const blocked = evaluateOutdoorIllumination(sample({
      tick: WORLD_NIGHT_START_TICK,
      coverTransmission: 0,
      localLights: [lamp("lamp:blocked", {
        position: halfRadius,
        lineTransmission: 0,
      })],
    }))!;
    const outside = evaluateOutdoorIllumination(sample({
      tick: WORLD_NIGHT_START_TICK,
      coverTransmission: 0,
      localLights: [lamp("lamp:outside", {
        position: { ...ORIGIN, localX: ORIGIN.localX + 8 },
      })],
    }))!;

    // Squared-distance falloff is 0.75 at half the configured radius.
    expect(clear.localIllumination).toBe(450_000);
    expect(rain.localIllumination).toBe(279_000);
    expect(blocked.localIllumination).toBe(0);
    expect(outside.localIllumination).toBe(0);
  });

  it("is invariant to local-source order", () => {
    const first = lamp("lamp:a", { intensity: 200_000 });
    const second = lamp("lamp:b", { intensity: 200_000 });
    const forward = evaluateOutdoorIllumination(sample({
      tick: WORLD_NIGHT_START_TICK,
      coverTransmission: 0,
      localLights: [second, first],
    }));
    const reversed = evaluateOutdoorIllumination(sample({
      tick: WORLD_NIGHT_START_TICK,
      coverTransmission: 0,
      localLights: [first, second],
    }));

    expect(forward).toEqual(reversed);
    expect(forward).toMatchObject({
      localIllumination: 400_000,
      localSourcesContributing: 2,
    });
  });

  it("is seamless across signed region edges and safe at the coordinate envelope", () => {
    const edgeTarget: RegionTileAddress = {
      region: { x: -1, y: 0 },
      localX: WORLD_WIDTH - 1,
      localY: 12,
    };
    const acrossEdge: RegionTileAddress = {
      region: { x: 0, y: 0 },
      localX: 0,
      localY: 12,
    };
    const sameRegionNeighbor = { ...ORIGIN, localX: ORIGIN.localX + 1 };
    const seam = evaluateOutdoorIllumination(sample({
      tick: WORLD_NIGHT_START_TICK,
      target: edgeTarget,
      coverTransmission: 0,
      localLights: [lamp("lamp:seam", { position: acrossEdge })],
    }))!;
    const local = evaluateOutdoorIllumination(sample({
      tick: WORLD_NIGHT_START_TICK,
      coverTransmission: 0,
      localLights: [lamp("lamp:local", { position: sameRegionNeighbor })],
    }))!;
    const envelopeTarget: RegionTileAddress = {
      region: { x: -REGION_COORD_LIMIT, y: -REGION_COORD_LIMIT },
      localX: 0,
      localY: 0,
    };
    const envelopeSource: RegionTileAddress = {
      region: { x: REGION_COORD_LIMIT, y: REGION_COORD_LIMIT },
      localX: WORLD_WIDTH - 1,
      localY: 0,
    };
    const distant = evaluateOutdoorIllumination(sample({
      tick: WORLD_NIGHT_START_TICK,
      target: envelopeTarget,
      coverTransmission: 0,
      localLights: [lamp("lamp:distant", { position: envelopeSource })],
    }))!;

    expect(seam.localIllumination).toBe(local.localIllumination);
    expect(seam.localIllumination).toBe(590_625);
    expect(distant.localIllumination).toBe(0);
    expect(distant.localSourcesContributing).toBe(0);
  });

  it("fails malformed and unbounded samples closed without mutating caller data", () => {
    const tooMany = Array.from(
      { length: MAX_OUTDOOR_LOCAL_LIGHT_SOURCES + 1 },
      (_, index) => lamp(`lamp:${index}`),
    );
    const input = sample({ localLights: [lamp("lamp:valid")] });
    const before = structuredClone(input);
    const duplicate = lamp("lamp:duplicate");

    expect(evaluateOutdoorIllumination(input)).toBeTruthy();
    expect(input).toEqual(before);
    expect(Object.isFrozen(evaluateOutdoorIllumination(input))).toBe(true);
    expect(evaluateOutdoorIllumination(sample({ tick: -1 }))).toBeNull();
    expect(evaluateOutdoorIllumination(sample({
      weather: { kind: "rain", intensity: 1.5 },
    }))).toBeNull();
    expect(evaluateOutdoorIllumination(sample({
      terrain: { kind: "marsh", roughness: FIXED_POINT + 1 },
    }))).toBeNull();
    expect(evaluateOutdoorIllumination(sample({ coverTransmission: -1 }))).toBeNull();
    expect(evaluateOutdoorIllumination(sample({ localLights: tooMany }))).toBeNull();
    expect(evaluateOutdoorIllumination(sample({ localLights: [duplicate, duplicate] }))).toBeNull();
    expect(evaluateOutdoorIllumination(sample({
      localLights: [lamp("lamp:wide", {
        radiusTiles: MAX_OUTDOOR_LOCAL_LIGHT_RADIUS_TILES + 1,
      })],
    }))).toBeNull();
    expect(evaluateOutdoorIllumination(sample({
      target: { ...ORIGIN, localX: WORLD_WIDTH },
    }))).toBeNull();
  });
});
