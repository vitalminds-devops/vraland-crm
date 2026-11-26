"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { useTransition } from "react";
import { type FieldPath, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
// The form design lives in the kit, taken from the contact form.
import {
  FormField,
  FormRow,
  FormSection,
  FormSelect,
  FormStyle,
  formActionsClass,
  formInputClass,
  formShellClass,
  formTextareaClass,
} from "@/components/ui/form-kit";
import { notify } from "@/components/ui/toast";
import { createProperty, updateProperty } from "../actions/property.actions";
import { propertySchema, type PropertyInput } from "../schemas/property.schema";
import { label } from "../lib/helpers";
import { propertyTypes, propertyTransactionTypes } from "../lib/constants";
import { getUserFacingMessage } from "@/lib/error-handler";
import {
  allProvinces,
  barangaysForCity,
  citiesForProvince,
  postalCodeForCity,
  getCityCodeByName,
} from "@/lib/location";

type Props = {
  propertyId?: string;
  initial?: Partial<PropertyInput>;
  options: {
    developments: {
      id: string;
      name: string;
      status: string;
      addressLine1: string | null;
      province: string | null;
      city: string | null;
      barangay: string | null;
      postalCode: string | null;
    }[];
  };
};

export function PropertyForm({ propertyId, initial, options }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const developmentAddress = (id: string | null | undefined) => {
    const development = options.developments.find((d) => d.id === id);
    if (!development) return {};
    return {
      addressLine1: development.addressLine1 ?? "",
      province: development.province ?? "",
      city: development.city ?? "",
      barangay: development.barangay ?? "",
      postalCode:
        development.postalCode ??
        postalCodeForCity(getCityCodeByName(development.city, development.province)) ??
        "",
    };
  };
  const {
    register,
    control,
    getValues,
    setValue,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PropertyInput>({
    resolver: zodResolver(propertySchema) as never,
    defaultValues: {
      propertyType: "house_and_lot",
      listingType: "sale",
      status: "draft",
      // Every property is in pesos; amounts are set on its Design page.
      currency: "PHP",
      features: "",
      unitIdentifierStyle: "letter",
      ...(propertyId ? {} : developmentAddress(initial?.developmentId)),
      ...initial,
      floorCount: null,
      unitsPerFloor: null,
      postalCode:
        initial?.postalCode ??
        (propertyId ? undefined : developmentAddress(initial?.developmentId).postalCode) ??
        postalCodeForCity(getCityCodeByName(initial?.city ?? null, initial?.province)) ??
        "",
    },
  });
  const province = useWatch({ control, name: "province" });
  const city = useWatch({ control, name: "city" });
  const listingType = useWatch({ control, name: "listingType" });
  const cityOptions = citiesForProvince(province ?? null);
  const barangayOptions = barangaysForCity(getCityCodeByName(city ?? null, province));

  function handleDevelopmentChange(id: string) {
    if (getValues("addressLine1") || getValues("province")) return;
    const address = developmentAddress(id);
    if (!address.province && !address.addressLine1) return;
    // City and barangay options appear only after their parent is set, so each step renders first.
    flushSync(() => {
      setValue("addressLine1", address.addressLine1 ?? "", {
        shouldDirty: true,
      });
      setValue("province", address.province ?? "", { shouldDirty: true });
    });
    flushSync(() => setValue("city", address.city ?? "", { shouldDirty: true }));
    setValue("barangay", address.barangay ?? "", { shouldDirty: true });
    setValue("postalCode", address.postalCode ?? "", { shouldDirty: true });
  }

  function handleProvinceChange() {
    setValue("city", "", { shouldDirty: true });
    setValue("barangay", "", { shouldDirty: true });
    setValue("postalCode", "", { shouldDirty: true });
  }

  function handleCityChange(cityName: string) {
    const cityCode = getCityCodeByName(cityName, province);
    setValue("postalCode", postalCodeForCity(cityCode) ?? "", {
      shouldDirty: true,
    });
    const barangay = getValues("barangay");
    if (barangay && !barangaysForCity(cityCode).some((option) => option.name === barangay))
      setValue("barangay", "", { shouldDirty: true });
  }

  function submit(values: PropertyInput) {
    startTransition(async () => {
      try {
        const result = propertyId
          ? await updateProperty(propertyId, values)
          : await createProperty(values);
        if (!result.success) {
          for (const [field, messages] of Object.entries(result.errors ?? {}))
            if (messages[0])
              setError(field as FieldPath<PropertyInput>, {
                type: "server",
                message: messages[0],
              });
          notify(result.message, "error");
          return;
        }

        router.push(`/properties/${result.id}`);
        router.refresh();
      } catch (error) {
        notify(getUserFacingMessage(error), "error");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit(submit, (invalid) => {
        // The fields' own messages ("Enter the property name."), not their internal names.
        notify(
          Object.values(invalid)
            .map((error) => error?.message)
            .filter(Boolean)
            .join(" ") || "Check the highlighted fields.",
          "error",
        );
      })}
      aria-label="Property details"
      className={formShellClass}
    >
      <FormStyle />
      <FormSection id="section-1" number={1} title="Basics">
        <FormField
          label="Development"
          hint={options.developments.length ? "Its address is copied into Location." : undefined}
          error={errors.developmentId?.message}
        >
          <FormSelect
            {...register("developmentId", {
              onChange: (event) => handleDevelopmentChange(event.target.value),
            })}
          >
            <option value="">Independent property</option>
            {options.developments.map((v) => (
              <option key={v.id} value={v.id}>
                {v.status === "active" ? v.name : `${v.name} (${label(v.status)})`}
              </option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label="Property name" required error={errors.title?.message}>
          <Input
            {...register("title")}
            aria-invalid={errors.title ? true : undefined}
            className={formInputClass}
            placeholder="e.g., Tower 1"
          />
        </FormField>
        <FormRow>
          <FormField label="Property type" required error={errors.propertyType?.message}>
            <FormSelect {...register("propertyType")}>
              {propertyTypes.map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="Offer type" required error={errors.listingType?.message}>
            <FormSelect {...register("listingType")}>
              {propertyTransactionTypes.map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </FormSelect>
          </FormField>
        </FormRow>
        <FormField
          label="Status"
          required
          hint="Draft keeps it hidden from the property list."
          error={errors.status?.message}
        >
          <FormSelect {...register("status")}>
            {[
              "draft",
              "active",
              "reserved",
              "pending",
              "under_contract",
              "sold",
              "rented",
              "withdrawn",
              "inactive",
            ].map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </FormSelect>
        </FormField>
      </FormSection>

      <FormSection id="section-2" number={2} title="Location">
        <div className="space-y-5">
          <FormRow>
            <FormField label="Province" error={errors.province?.message}>
              <FormSelect
                {...register("province", {
                  onChange: () => handleProvinceChange(),
                })}
              >
                <option value="">Not specified</option>
                {allProvinces.map((province) => (
                  <option key={province.id} value={province.name}>
                    {province.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField
              label="City"
              hint={cityOptions.length === 0 ? "Select a province first" : undefined}
              error={errors.city?.message}
            >
              <FormSelect
                {...register("city", {
                  onChange: (event) => handleCityChange(event.target.value),
                })}
                disabled={cityOptions.length === 0}
              >
                <option value="">Not specified</option>
                {cityOptions.map((city) => (
                  <option key={city.id} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField
              label="Barangay"
              hint={barangayOptions.length === 0 ? "Select a city first" : undefined}
              error={errors.barangay?.message}
            >
              <FormSelect {...register("barangay")} disabled={barangayOptions.length === 0}>
                <option value="">Not specified</option>
                {barangayOptions.map((barangay) => (
                  <option key={barangay.id} value={barangay.name}>
                    {barangay.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Postal code" hint="Set from the city">
              <Input
                {...register("postalCode")}
                readOnly
                className={`${formInputClass} bg-muted text-muted-foreground cursor-not-allowed`}
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Street" error={errors.addressLine1?.message}>
              <Input
                {...register("addressLine1")}
                className={formInputClass}
                placeholder="House or lot no., street, subdivision"
              />
            </FormField>
            <FormField label="Building / unit" error={errors.addressLine2?.message}>
              <Input
                {...register("addressLine2")}
                className={formInputClass}
                placeholder="Building, floor, unit"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField
              label="Latitude"
              hint="Optional, for the map."
              error={errors.latitude?.message}
            >
              <Input
                type="number"
                step="any"
                {...register("latitude")}
                className={formInputClass}
                placeholder="e.g., 14.6091"
              />
            </FormField>
            <FormField label="Longitude" error={errors.longitude?.message}>
              <Input
                type="number"
                step="any"
                {...register("longitude")}
                className={formInputClass}
                placeholder="e.g., 121.0222"
              />
            </FormField>
          </FormRow>
        </div>
      </FormSection>

      <input type="hidden" {...register("unitIdentifierStyle")} />

      <FormSection id="section-5" number={3} title="More details">
        <FormField label="Description" error={errors.description?.message}>
          <Textarea
            rows={4}
            {...register("description")}
            className={formTextareaClass}
            placeholder="Key features and condition"
          />
        </FormField>
        <FormRow>
          <FormField label="Listed date" error={errors.listedAt?.message}>
            <DatePicker {...register("listedAt")} className={formInputClass} />
          </FormField>
          <FormField label="Available from" error={errors.availableFrom?.message}>
            <DatePicker {...register("availableFrom")} className={formInputClass} />
          </FormField>
        </FormRow>
        {/* A sale has no contract; the dates stay in the form so switching back keeps them. */}
        {listingType !== "sale" && (
          <FormRow>
            <FormField label="Contract start" error={errors.contractStartDate?.message}>
              <DatePicker {...register("contractStartDate")} className={formInputClass} />
            </FormField>
            <FormField label="Contract end" error={errors.contractEndDate?.message}>
              <DatePicker {...register("contractEndDate")} className={formInputClass} />
            </FormField>
          </FormRow>
        )}
      </FormSection>

      {!propertyId && (
        <p className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground/80">
          <Layers aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          After saving, design its floors, units and parking.
        </p>
      )}
      <div className={`${formActionsClass} sm:justify-end`}>
        <div className="flex w-full gap-3 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : propertyId ? "Save changes" : "Create property"}
          </Button>
        </div>
      </div>
    </form>
  );
}
