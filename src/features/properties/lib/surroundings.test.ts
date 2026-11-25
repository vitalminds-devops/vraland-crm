import { expect, it } from "vitest";
import { surroundingsFor } from "./surroundings";

it("picks the surroundings from the property type", () => {
  expect(surroundingsFor("condominium")).toBe("city");
  expect(surroundingsFor("office")).toBe("city");
  expect(surroundingsFor("house_and_lot")).toBe("suburb");
  expect(surroundingsFor("townhouse")).toBe("suburb");
  expect(surroundingsFor("warehouse")).toBe("industrial");
  expect(surroundingsFor("farm")).toBe("rural");
  expect(surroundingsFor(null)).toBe("city");
});
