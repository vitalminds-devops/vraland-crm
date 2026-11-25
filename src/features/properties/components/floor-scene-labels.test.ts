import { afterEach, expect, it, vi } from "vitest";
import { UnitPlaque } from "./floor-scene-kit";
import { PaintedText } from "./game-look";
import { UnitChip } from "./unit-markers";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useMemo: (create: () => unknown) => create(),
  useEffect: () => {},
}));

// A 1000 × 500 canvas with an identity projection: a sprite N px tall scales to N * 2 / 500.
vi.mock("@react-three/fiber", () => ({
  useThree: () => ({
    size: { width: 1000, height: 500 },
    camera: {
      projectionMatrix: { elements: Object.assign(new Array(16).fill(0), { 0: 1, 5: 1 }) },
    },
  }),
}));

afterEach(() => vi.unstubAllGlobals());

function canvasContext() {
  const context = {
    font: "",
    measureText(text: string) {
      return { width: text.length * Number(this.font.match(/(\d+)px/)?.[1]) * 0.6 };
    },
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    restore: vi.fn(),
  };
  vi.stubGlobal("document", {
    documentElement: {},
    createElement: () => ({ getContext: () => context }),
  });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "#5431ab" }));
  return context;
}

it("puts unit identity and sales details on separate rows, at a fixed size on screen", () => {
  const context = canvasContext();
  const label = UnitPlaque({
    unit: {
      id: "u1",
      code: "1A",
      group: { name: "Tower A", hex: "#0f766e" },
      price: "₱3M",
      status: "available",
    },
    selected: false,
  });
  // 46 px tall at any zoom.
  expect(label.props.scale[1]).toBeCloseTo((46 * 2) / 500);
  expect(context.fillText.mock.calls.map(([text, , y]) => [text, y])).toEqual([
    ["1A", 57],
    ["Tower A", 57],
    ["₱3M", 130],
    ["Available", 130],
  ]);
  expect(context.fillText.mock.calls[1][1]).toBeGreaterThan(context.fillText.mock.calls[0][1]);
});

it("widens for long labels and supports missing group and price", () => {
  const context = canvasContext();
  const label = UnitPlaque({
    unit: { id: "u2", code: "PENTHOUSE-1201", status: "sold" },
    selected: true,
  });
  expect(label.props.scale[0]).toBeGreaterThan(label.props.scale[1]);
  expect(context.fillText.mock.calls.map(([text]) => text)).toEqual(["PENTHOUSE-1201", "Sold out"]);
  expect(context.roundRect).toHaveBeenCalled();
});

it("backs room names with a solid surface at full opacity", () => {
  const context = canvasContext();
  const label = PaintedText({ text: "BEDROOM", w: 3 });
  expect(context.roundRect).toHaveBeenCalledWith(4, 4, expect.any(Number), 80, 12);
  expect(label.props.children.props.opacity).toBeUndefined();
});

it("fills a quarter of the unit capsule and keeps the code in its white area", () => {
  const context = canvasContext();
  const chip = UnitChip({ code: "104", status: "deposit_paid", w: 7, h: 8 });
  const canvas = chip.props.children.props.map.image;
  expect(context.clip).toHaveBeenCalledOnce();
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, canvas.width / 4, 96);
  expect(context.fillText).toHaveBeenCalledWith("104", canvas.width / 4 + 16, 52);
  expect(canvas.width * 0.75).toBeGreaterThan(context.measureText("104").width);
  expect(context.arc).not.toHaveBeenCalled();
});
