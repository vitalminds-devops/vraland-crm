import { expect, it } from "vitest";
import { completeWithGuess, guessIdAddress } from "./id-address-guess";

it("recovers the address from a garbled national ID read", () => {
  const started = performance.now();
  expect(
    guessIdAddress(["Tirahan/Address\nCONCEPCION TA | GUMPAY. BAC6 RENTAL MHOORO (@ 5"]),
  ).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Baco",
    currentBarangay: "Tagumpay",
    currentPostalCode: "5201",
  });
  // It runs in the browser after OCR, so it must stay quick.
  expect(performance.now() - started).toBeLessThan(1500);
});

it("combines pieces read correctly in different OCR passes", () => {
  expect(
    guessIdAddress([
      "Address\nSITIO CONCEPCION TAGUMPAY 8ACO.\n%% ##",
      "Address\nSIN CONCEPCION TASUMSAY\nORIENTAL MIND0RO 5201",
    ]),
  ).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Baco",
    currentBarangay: "Tagumpay",
  });
});

it("reads a licence whose city lost its CITY and whose barangay is misspelled", () => {
  expect(guessIdAddress(["Address\nNAC0CO SANT0 NINO CALAPAN 0RIENTAL MIND0RO"])).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Calapan City",
    currentBarangay: "Sto. Niño",
  });
});

it("does not guess from one weak piece or from the issuer's office", () => {
  expect(guessIdAddress(["Address\nSIN CONCEPCION TASUMSAY DACE"])).toBeNull();
  expect(
    guessIdAddress(["LAND TRANSPORTATION OFFICE\nQUEZON CITY\nTEST BUYER\nDATE OF BIRTH 1990"]),
  ).toBeNull();
  expect(guessIdAddress([""])).toBeNull();
});

it("keeps a full parse, fills a missing barangay and replaces a parse without a city", () => {
  const texts = ["Tirahan/Address\nCONCEPCION TA | GUMPAY. BAC6 RENTAL MHOORO (@ 5"];
  const full = { currentProvince: "Cebu", currentCity: "Cebu City", currentBarangay: "Lahug" };
  expect(completeWithGuess(full, texts)).toBe(full);
  expect(
    completeWithGuess(
      { currentProvince: "Oriental Mindoro", currentCity: "Baco", currentAddressLine1: "SITIO" },
      texts,
    ),
  ).toMatchObject({ currentBarangay: "Tagumpay", currentAddressLine1: "SITIO" });
  expect(completeWithGuess(null, texts)).toMatchObject({ currentCity: "Baco" });
  expect(completeWithGuess({ currentProvince: "Cebu" }, texts)).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Baco",
  });
});

it("reads a split national ID address without taking the street or a zone for the town", () => {
  // MABINI is also a town and many towns have a "Zone III" barangay; neither may decide it.
  const texts = [
    "fESY CITY OF CALAPAN\nTirahan/Addres. FF | C=\nMABINI ST. ZONE. 3. IBABA\nORIENTAL MINDORO",
    "Tirahan/Addres,\nMABINI ST.\nZONE 3. IBABA\nORIENTAL MIN\nPHL\nSEL\nna 2)\nCITY OF CALAPAN",
  ];
  const guess = guessIdAddress(texts);
  expect(guess).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Calapan City",
    currentPostalCode: "5200",
    // "IBABA" is Ibaba East or Ibaba West: the user picks.
    barangaySuggestions: ["Ibaba East", "Ibaba West"],
  });
  expect(guess).not.toHaveProperty("currentBarangay");
  // A guess is never filled silently.
  expect(Object.values(guess?.confidence ?? {}).every((value) => value >= 80 && value <= 90)).toBe(
    true,
  );
});

it("carries the parser's confidence through and resolves its barangay suggestions", () => {
  const texts = ["Tirahan/Address\nCONCEPCION TA | GUMPAY. BAC6 RENTAL MHOORO (@ 5"];
  const merged = completeWithGuess(
    {
      currentProvince: "Oriental Mindoro",
      currentAddressLine1: "Sitio Concepcion",
      confidence: { currentProvince: 100, currentAddressLine1: 95 },
    },
    texts,
  );
  expect(merged).toMatchObject({
    currentCity: "Baco",
    currentBarangay: "Tagumpay",
    currentAddressLine1: "Sitio Concepcion",
    confidence: { currentProvince: 100, currentAddressLine1: 95 },
  });
  // Guessed fields always ask for a check.
  expect(merged?.confidence?.currentCity).toBeLessThanOrEqual(90);
  expect(merged?.confidence?.currentBarangay).toBeLessThanOrEqual(90);

  const ambiguous = {
    currentProvince: "Oriental Mindoro",
    currentCity: "Calapan City",
    barangaySuggestions: ["Ibaba East", "Ibaba West"],
    confidence: { currentProvince: 100, currentCity: 100 },
  };
  const resolved = completeWithGuess(ambiguous, [
    "Address\nZONE 3 IBABA WEST CITY OF CALAPAN ORIENTAL MINDORO",
  ]);
  expect(resolved).toMatchObject({
    currentBarangay: "Ibaba West",
    confidence: { currentCity: 100 },
  });
  expect(resolved).not.toHaveProperty("barangaySuggestions");
});
