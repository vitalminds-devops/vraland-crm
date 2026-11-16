"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Car, FileText, Layers, Ruler, Tag, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput } from "@/components/ui/money-input";
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

const currencies = [
  { code: "PHP", name: "Philippine peso", symbol: "₱" },
  { code: "USD", name: "US dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British pound", symbol: "£" },
  { code: "JPY", name: "Japanese yen", symbol: "¥" },
  { code: "SGD", name: "Singapore dollar", symbol: "S$" },
  { code: "AUD", name: "Australian dollar", symbol: "A$" },
] as const;

const currencySymbol = (code: string | undefined) =>
  currencies.find((option) => option.code === code)?.symbol ?? code?.slice(0, 1) ?? "₱";

export const propertyFormSections = [
  { id: "section-1", label: "1. Basics" },
  { id: "section-2", label: "2. Location" },
  { id: "section-3", label: "3. Pricing" },
  { id: "section-4", label: "4. Floors, units & parking" },
  { id: "section-5", label: "5. More details" },
];

/** Adding a property has no Floors & units step; those come after saving. */
export const newPropertyFormSections = [
  ...propertyFormSections.slice(0, 3),
  { id: "section-5", label: "4. More details" },
];

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
  const currency = useWatch({ control, name: "currency" });
  const city = useWatch({ control, name: "city" });
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
          <FormField label="Transaction type" required error={errors.listingType?.message}>
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

      <FormSection id="section-3" number={3} title="Pricing">
        <div className="sm:max-w-xs">
          <FormField
            label="Currency"
            required
            hint="Used for every amount below."
            error={errors.currency?.message}
          >
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-md bg-primary/10 text-sm font-semibold text-primary"
              >
                {currencySymbol(currency)}
              </span>
              <FormSelect {...register("currency")} style={{ paddingLeft: "2.75rem" }}>
                {/* Keeps a code saved before this became a list. */}
                {currency && !currencies.some((option) => option.code === currency) && (
                  <option value={currency}>{currency}</option>
                )}
                {currencies.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code} · {option.name}
                  </option>
                ))}
              </FormSelect>
            </div>
          </FormField>
        </div>
        <FormRow>
          <FormField label="Gross list price" error={errors.askingPrice?.message}>
            <Controller
              control={control}
              name="askingPrice"
              render={({ field }) => (
                <MoneyInput
                  value={field.value as string | number | null | undefined}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  className={formInputClass}
                />
              )}
            />
          </FormField>
          <FormField label="Reservation fee" error={errors.reservationFee?.message}>
            <Controller
              control={control}
              name="reservationFee"
              render={({ field }) => (
                <MoneyInput
                  value={field.value as string | number | null | undefined}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  className={formInputClass}
                />
              )}
            />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Monthly amortization" error={errors.monthlyRent?.message}>
            <Controller
              control={control}
              name="monthlyRent"
              render={({ field }) => (
                <MoneyInput
                  value={field.value as string | number | null | undefined}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  className={formInputClass}
                />
              )}
            />
          </FormField>
          <FormField label="Parking price" hint="Per slot." error={errors.parkingPrice?.message}>
            <Controller
              control={control}
              name="parkingPrice"
              render={({ field }) => (
                <MoneyInput
                  value={field.value as string | number | null | undefined}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  className={formInputClass}
                />
              )}
            />
          </FormField>
        </FormRow>
      </FormSection>

      {/* New properties get floors, units and parking on their details page after saving. */}
      {propertyId && (
        <FormSection id="section-4" number={4} title="Floors, units & parking">
          <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <p className="text-sm text-muted-foreground">
              Add, remove and arrange them on the property page.
            </p>
            <div className="flex flex-wrap gap-2">
              <ButtonLink
                href={`/properties/${propertyId}#floors-units`}
                variant="secondary"
                // The default secondary hover matches this muted panel, so give it a visible one.
                className="gap-2 hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                <Layers aria-hidden="true" className="size-4" />
                Floors & units
              </ButtonLink>
              <ButtonLink
                href={`/properties/${propertyId}#parking`}
                variant="secondary"
                className="gap-2 hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                <Car aria-hidden="true" className="size-4" />
                Parking
              </ButtonLink>
            </div>
          </div>
        </FormSection>
      )}
      <input type="hidden" {...register("unitIdentifierStyle")} />

      <FormSection id="section-5" number={propertyId ? 5 : 4} title="More details">
        <p className="-mt-3 text-[13px] text-muted-foreground">
          All optional. Fill in what you know.
        </p>

        <DetailGroup icon={FileText} title="About the property">
          <FormField label="Description" error={errors.description?.message}>
            <Textarea
              rows={4}
              {...register("description")}
              className={formTextareaClass}
              placeholder="Key features and condition"
            />
          </FormField>
          <Controller
            control={control}
            name="features"
            render={({ field }) => (
              <FormField
                label="Features"
                hint="Press Enter or comma to add."
                error={errors.features?.message}
              >
                <FeaturesInput value={field.value ?? ""} onChange={field.onChange} />
              </FormField>
            )}
          />
        </DetailGroup>

        <DetailGroup icon={Ruler} title="Size & rooms" hint="Areas in square metres.">
          <FormRow>
            <FormField label="Lot area (sqm)" error={errors.lotAreaSqm?.message}>
              <Input
                type="number"
                min="0"
                step="0.01"
                {...register("lotAreaSqm")}
                className={formInputClass}
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Floor area (sqm)" error={errors.floorAreaSqm?.message}>
              <Input
                type="number"
                min="0"
                step="0.01"
                {...register("floorAreaSqm")}
                className={formInputClass}
                placeholder="0.00"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Bedrooms" error={errors.bedrooms?.message}>
              <Input
                type="number"
                min="0"
                step="1"
                {...register("bedrooms")}
                className={formInputClass}
                placeholder="0"
              />
            </FormField>
            <FormField label="Bathrooms" error={errors.bathrooms?.message}>
              <Input
                type="number"
                min="0"
                step="0.5"
                {...register("bathrooms")}
                className={formInputClass}
                placeholder="0"
              />
            </FormField>
          </FormRow>
        </DetailGroup>

        <DetailGroup
          icon={CalendarDays}
          title="Dates"
          hint="Contract dates are for leased or rented properties."
        >
          <FormRow>
            <FormField label="Listed date" error={errors.listedAt?.message}>
              <DatePicker {...register("listedAt")} className={formInputClass} />
            </FormField>
            <FormField label="Available from" error={errors.availableFrom?.message}>
              <DatePicker {...register("availableFrom")} className={formInputClass} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Contract start" error={errors.contractStartDate?.message}>
              <DatePicker {...register("contractStartDate")} className={formInputClass} />
            </FormField>
            <FormField label="Contract end" error={errors.contractEndDate?.message}>
              <DatePicker {...register("contractEndDate")} className={formInputClass} />
            </FormField>
          </FormRow>
        </DetailGroup>
      </FormSection>

      {!propertyId && (
        <p className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground/80">
          <Layers aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          After saving, add floors, units and parking on the property page.
        </p>
      )}
      <div className={`${formActionsClass} sm:justify-end`}>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving..." : propertyId ? "Save changes" : "Create property"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** A labelled group of related optional fields inside More details. */
function DetailGroup({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border border-[var(--border)] p-4 sm:p-5">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-content-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)]">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
          {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </fieldset>
  );
}

const parseFeatures = (value: string) =>
  value
    .split(",")
    .map((feature) => feature.trim())
    .filter(Boolean);

function FeaturesInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState("");
  const features = useMemo(() => parseFeatures(value), [value]);

  const commit = () => {
    const addition = draft.trim().replace(/,+$/, "").trim();
    setDraft("");
    if (!addition) return;
    const exists = features.some((feature) => feature.toLowerCase() === addition.toLowerCase());
    if (exists) return;
    onChange([...features, addition].join(", "));
  };

  const remove = (feature: string) =>
    onChange(features.filter((current) => current !== feature).join(", "));

  return (
    <div className="rounded-lg border border-border/60 bg-background p-2.5 transition-all hover:border-border focus-within:ring-2 focus-within:ring-primary/25">
      {features.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {features.map((feature) => (
            <span
              key={feature}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[12px] font-medium text-primary"
            >
              <Tag aria-hidden="true" className="size-3" />
              {feature}
              <button
                type="button"
                aria-label={`Remove ${feature}`}
                onClick={() => remove(feature)}
                className="rounded-full p-0.5 hover:bg-primary/15"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();
          } else if (event.key === "Backspace" && !draft && features.length > 0) {
            remove(features[features.length - 1]);
          }
        }}
        onBlur={commit}
        placeholder="Pool, balcony, gym…"
        className="w-full bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
      />
    </div>
  );
}
