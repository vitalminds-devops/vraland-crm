import {
  getAllProvinces,
  getAllMunicipalities,
  getAllBarangays,
  getPostalCodesByMunicipality,
} from "@aivangogh/ph-address";

export interface Province {
  id: string;
  name: string;
  code: string;
  regionCode: string;
}

export interface City {
  id: string;
  name: string;
  provinceCode: string;
  code: string;
  postalCode: string;
}

export interface Barangay {
  id: string;
  name: string;
  municipalityCode: string;
  code: string;
}

// The dataset files Metro Manila's cities under the region code (1300000000)
// and has no province for them, so without this entry they cannot be chosen.
const METRO_MANILA_CODE = "1300000000";

// Convert PH types to our interface
const provinces: Province[] = [
  ...getAllProvinces().map((p) => ({
    id: p.psgcCode,
    name: p.name,
    code: p.psgcCode,
    regionCode: p.regionCode,
  })),
  {
    id: METRO_MANILA_CODE,
    name: "Metro Manila",
    code: METRO_MANILA_CODE,
    regionCode: METRO_MANILA_CODE,
  },
];

const cities: City[] = getAllMunicipalities().map((m) => {
  const postalCodes = getPostalCodesByMunicipality(m.psgcCode);
  const postalCode = postalCodes.length > 0 ? postalCodes[0].postalCode : "";
  return {
    id: m.psgcCode,
    name: m.name,
    provinceCode: m.provinceCode,
    code: m.psgcCode,
    postalCode,
  };
});

const barangays: Barangay[] = getAllBarangays().map((b) => ({
  id: b.psgcCode,
  name: b.name,
  municipalityCode: b.municipalCityCode,
  code: b.psgcCode,
}));

// Helper functions
const getCitiesByProvince = (provinceCode: string): City[] => {
  return cities.filter((city) => city.provinceCode === provinceCode);
};

const getBarangaysByCity = (municipalityCode: string): Barangay[] => {
  return barangays.filter((barangay) => barangay.municipalityCode === municipalityCode);
};

/** The country the business operates in. */
export const COUNTRY_NAME = "Philippines";

/** All provinces in the Philippines, sorted alphabetically. */
export const allProvinces: Province[] = [...provinces].sort((a, b) => a.name.localeCompare(b.name));

export const citiesForProvince = (provinceName: string | null): City[] => {
  if (!provinceName) return [];
  const province = provinces.find((p) => p.name === provinceName);
  if (!province) return [];
  return getCitiesByProvince(province.code).sort((a, b) => a.name.localeCompare(b.name));
};

export const barangaysForCity = (municipalityCode: string | null): Barangay[] => {
  if (!municipalityCode) return [];
  return getBarangaysByCity(municipalityCode).sort((a, b) => a.name.localeCompare(b.name));
};

export const postalCodeForCity = (municipalityCode: string | null): string | null => {
  if (!municipalityCode) return null;
  const city = cities.find((c) => c.code === municipalityCode);
  return city?.postalCode || null;
};

/**
 * 115 city names repeat across provinces ("San Jose" is in 9), so pass the
 * province whenever it is known; the name alone returns the first match.
 */
export const getCityCodeByName = (
  cityName: string | null,
  provinceName?: string | null,
): string | null => {
  if (!cityName) return null;
  const pool = provinceName ? citiesForProvince(provinceName) : cities;
  const city = pool.find((c) => c.name === cityName);
  return city?.code || null;
};
