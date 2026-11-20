import { AlertTriangle } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { OpportunityAddress } from "@/features/contacts/schemas/opportunity-contact.schema";
import {
  allProvinces,
  barangaysForCity,
  citiesForProvince,
  getCityCodeByName,
  postalCodeForCity,
} from "@/lib/location";
import { cn } from "@/lib/utils/cn";

import type { IdAddressField } from "../lib/id-address";
import type { IdAddressHints } from "../lib/id-address-autofill";
import { Field, fieldClass } from "./opportunity-field";

const checkClass = "border-amber-500 ring-2 ring-amber-500/20";

/** Province, city, barangay, postal code and street, with "Please check" on doubtful ID reads. */
export function OpportunityAddressStep({
  address,
  required,
  hints,
  onChange,
}: {
  address: OpportunityAddress;
  required: boolean;
  hints: IdAddressHints;
  onChange: (next: OpportunityAddress, field: IdAddressField) => void;
}) {
  const id = useId();
  const hintId = (field: IdAddressField) => (hints.review[field] ? `${id}-${field}` : undefined);
  const checked = (field: IdAddressField) => hints.review[field] && checkClass;
  const hint = (field: IdAddressField) =>
    hints.review[field] && (
      <span
        id={hintId(field)}
        className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"
      >
        <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
        Please check
      </span>
    );
  const cityCode = getCityCodeByName(address.currentCity, address.currentProvince);
  const pickBarangay = (name: string) =>
    onChange({ ...address, currentBarangay: name }, "currentBarangay");

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Field label="Province" required>
            <NativeSelect
              name="currentProvince"
              required={required}
              value={address.currentProvince ?? ""}
              aria-describedby={hintId("currentProvince")}
              className={checked("currentProvince")}
              onChange={(event) =>
                onChange(
                  {
                    ...address,
                    currentProvince: event.target.value,
                    currentCity: null,
                    currentBarangay: null,
                    currentPostalCode: null,
                  },
                  "currentProvince",
                )
              }
            >
              <NativeSelectOption value="">Select province</NativeSelectOption>
              {allProvinces.map((province) => (
                <NativeSelectOption key={province.id} value={province.name}>
                  {province.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {hint("currentProvince")}
        </div>
        <div className="grid content-start gap-1.5">
          <Field label="City" required>
            <NativeSelect
              name="currentCity"
              required={required}
              disabled={!address.currentProvince}
              value={address.currentCity ?? ""}
              aria-describedby={hintId("currentCity")}
              className={checked("currentCity")}
              onChange={(event) =>
                onChange(
                  {
                    ...address,
                    currentCity: event.target.value,
                    currentBarangay: null,
                    currentPostalCode:
                      postalCodeForCity(
                        getCityCodeByName(event.target.value, address.currentProvince),
                      ) ?? null,
                  },
                  "currentCity",
                )
              }
            >
              <NativeSelectOption value="">Select city</NativeSelectOption>
              {citiesForProvince(address.currentProvince).map((city) => (
                <NativeSelectOption key={city.id} value={city.name}>
                  {city.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {hint("currentCity")}
        </div>
        <div className="grid content-start gap-1.5">
          <Field label="Barangay" required>
            <NativeSelect
              name="currentBarangay"
              required={required}
              disabled={!address.currentCity}
              value={address.currentBarangay ?? ""}
              aria-describedby={hintId("currentBarangay")}
              className={checked("currentBarangay")}
              onChange={(event) => pickBarangay(event.target.value)}
            >
              <NativeSelectOption value="">Select barangay</NativeSelectOption>
              {barangaysForCity(cityCode).map((barangay) => (
                <NativeSelectOption key={barangay.id} value={barangay.name}>
                  {barangay.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {hint("currentBarangay")}
          {!address.currentBarangay && hints.barangaySuggestions.length > 0 && (
            <div role="group" aria-label="Suggested barangays" className="flex flex-wrap gap-1.5">
              {hints.barangaySuggestions.map((name) => (
                <Button
                  key={name}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => pickBarangay(name)}
                >
                  {name}
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="grid content-start gap-1.5">
          <Field label="Postal code">
            <Input
              name="currentPostalCode"
              value={address.currentPostalCode ?? ""}
              readOnly
              aria-describedby={hintId("currentPostalCode")}
              className={cn(fieldClass, checked("currentPostalCode"))}
            />
          </Field>
          {hint("currentPostalCode")}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Field label="Street">
          <Input
            name="currentAddressLine1"
            value={address.currentAddressLine1 ?? ""}
            onChange={(event) =>
              onChange(
                { ...address, currentAddressLine1: event.target.value },
                "currentAddressLine1",
              )
            }
            maxLength={255}
            placeholder="House or lot no., street, subdivision"
            aria-describedby={hintId("currentAddressLine1")}
            className={cn(fieldClass, checked("currentAddressLine1"))}
          />
        </Field>
        {hint("currentAddressLine1")}
      </div>
    </>
  );
}
