import { describe, expect, it } from "vitest";

import { hitTestFieldResource } from "./resourceHitTest";
import type { FieldResourceNodeView } from "./types";

const nodes: readonly FieldResourceNodeView[] = [
  {
    id: "node-b",
    material: "cordreed",
    label: "Cordreed",
    position: { x: 20, y: 20 },
    knowledge: "charted",
  },
  {
    id: "node-a",
    material: "hookstone",
    label: "Hookstone",
    position: { x: 24, y: 20 },
    knowledge: "sounded",
    rarity: "rare",
    stockUnits: 2,
  },
];

describe("field resource hit testing", () => {
  it("selects only visible supplied nodes inside the world-space radius", () => {
    expect(hitTestFieldResource(nodes, { x: 23, y: 20 }, 4)?.node.id).toBe("node-a");
    expect(hitTestFieldResource(nodes, { x: 80, y: 80 }, 12)).toBeNull();
    expect(hitTestFieldResource(nodes, { x: 20, y: 20 }, 0)).toBeNull();
  });

  it("breaks exact-distance ties by stable node ID, independent of input order", () => {
    const point = { x: 22, y: 20 };
    expect(hitTestFieldResource(nodes, point, 4)?.node.id).toBe("node-a");
    expect(hitTestFieldResource([...nodes].reverse(), point, 4)?.node.id).toBe("node-a");
  });
});
