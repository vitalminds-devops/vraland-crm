"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type FieldPath, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelectOption } from "@/components/ui/native-select";
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
import { CoverImageField } from "@/components/ui/cover-image-field";
import { notify } from "@/components/ui/toast";
import { getUserFacingMessage } from "@/lib/error-handler";
import { fieldErrorsOf } from "@/lib/types/action-result.client";
import {
  type Barangay,
  allProvinces,
  barangaysForCity,
  citiesForProvince,
  postalCodeForCity,
  getCityCodeByName,
} from "@/lib/location";

import { createDevelopment, updateDevelopment } from "../actions/development.actions";
import {
  removeDevelopmentCoverImage,
  saveDevelopmentCoverImage,
} from "../actions/development-cover.actions";
import { label } from "../lib/development-utils";
import {
  developmentSchema,
  developmentStatuses,
  type DevelopmentInput,
} from "../schemas/development.schema";

export const developmentFormSections = [
  { id: "section-1", label: "1. Development information" },
  { id: "section-2", label: "2. Location" },
  { id: "section-3", label: "3. Timeline" },
];

type Props = {
  developmentId?: string;
  initial?: Partial<DevelopmentInput>;
  coverImageUrl?: string | null;
};

export function DevelopmentForm({ developmentId, initial, coverImageUrl = null }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [removingCover, setRemovingCover] = useState(false);
  // Seeded from the saved address, so an edit opens with its city and barangay selectable.
  const [barangayOptions, setBarangayOptions] = useState<Barangay[]>(() =>
    initial?.city && initial.province
      ? barangaysForCity(getCityCodeByName(initial.city, initial.province))
      : [],
  );
  const [cityOptions, setCityOptions] = useState<ReturnType<typeof citiesForProvince>>(() =>
    initial?.province ? citiesForProvince(initial.province) : [],
  );
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<DevelopmentInput>({
    resolver: zodResolver(developmentSchema) as never,
    defaultValues: {
      status: "planning",
      ...initial,
    },
  });

  const handleProvinceChange = (provinceName: string) => {
    const cities = citiesForProvince(provinceName);
    setCityOptions(cities);
    setValue("city", "");
    setValue("barangay", "");
    setValue("postalCode", "");
  };

  const handleCityChange = (cityName: string) => {
    const cityCode = getCityCodeByName(cityName, getValues("province"));
    setBarangayOptions(barangaysForCity(cityCode));
    setValue("postalCode", postalCodeForCity(cityCode) ?? "");
  };

  function submit(values: DevelopmentInput) {
    startTransition(async () => {
      try {
        const result = developmentId
          ? await updateDevelopment(developmentId, values)
          : await createDevelopment(values);
        if (!result.success) {
          for (const [field, messages] of Object.entries(fieldErrorsOf(result)))
            if (messages[0])
              setError(field as FieldPath<DevelopmentInput>, {
                type: "server",
                message: messages[0],
              });
          notify(result.error.message, "error");
          return;
        }
        if (coverFile) {
          const formData = new FormData();
          formData.set("developmentId", result.data.id);
          formData.set("image", coverFile);
          const upload = await saveDevelopmentCoverImage(formData);
          if (!upload.success)
            notify(`Saved, but the cover photo failed: ${upload.message}`, "error");
        }

        router.push(`/developments/${result.data.id}`);
        router.refresh();
      } catch (error) {
        notify(getUserFacingMessage(error), "error");
      }
    });
  }

  function removeCover() {
    if (!developmentId) return;
    setRemovingCover(true);
    startTransition(async () => {
      const result = await removeDevelopmentCoverImage(developmentId);
      setRemovingCover(false);
      if (!result.success) {
        notify(result.message, "error");
        return;
      }
      notify(result.message, "success");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit(submit, () => notify("Review the highlighted fields.", "error"))}
      className={formShellClass}
    >
      <FormStyle />
      <FormSection id="section-1" number={1} title="Development information">
        <FormField label="Name" required error={errors.name?.message}>
          <Input
            {...register("name")}
            className={formInputClass}
            placeholder="e.g., Fairfield Heights"
          />
        </FormField>
        <FormField label="Status" required error={errors.status?.message}>
          <FormSelect {...register("status")}>
            {developmentStatuses.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {label(value)}
              </NativeSelectOption>
            ))}
          </FormSelect>
        </FormField>
        <FormField label="Description" error={errors.description?.message}>
          <Textarea
            rows={4}
            {...register("description")}
            className={formTextareaClass}
            placeholder="Short description"
          />
        </FormField>
        <CoverImageField
          label="Cover photo"
          hint="Shown on the developments list"
          currentUrl={coverImageUrl}
          onSelect={setCoverFile}
          onRemove={developmentId ? removeCover : undefined}
          removing={removingCover}
          disabled={pending}
        />
      </FormSection>

      <FormSection id="section-2" number={2} title="Location">
        <FormRow>
          <FormField label="Province" error={errors.province?.message}>
            <FormSelect
              {...register("province", {
                onChange: (event) => handleProvinceChange(event.target.value),
              })}
            >
              <NativeSelectOption value="">Not specified</NativeSelectOption>
              {allProvinces.map((province) => (
                <NativeSelectOption key={province.id} value={province.name}>
                  {province.name}
                </NativeSelectOption>
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
              <NativeSelectOption value="">Not specified</NativeSelectOption>
              {cityOptions.map((city) => (
                <NativeSelectOption key={city.id} value={city.name}>
                  {city.name}
                </NativeSelectOption>
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
              <NativeSelectOption value="">Not specified</NativeSelectOption>
              {barangayOptions.map((barangay) => (
                <NativeSelectOption key={barangay.id} value={barangay.name}>
                  {barangay.name}
                </NativeSelectOption>
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
        <FormField label="Street" error={errors.addressLine1?.message}>
          <Input
            {...register("addressLine1")}
            className={formInputClass}
            placeholder="House or lot no., street, subdivision"
          />
        </FormField>
      </FormSection>

      <FormSection id="section-3" number={3} title="Timeline">
        <FormRow>
          <FormField label="Launch date" error={errors.launchDate?.message}>
            <DatePicker {...register("launchDate")} className={formInputClass} />
          </FormField>
          <FormField label="Completion date" error={errors.completionDate?.message}>
            <DatePicker {...register("completionDate")} className={formInputClass} />
          </FormField>
        </FormRow>
      </FormSection>

      <div className={`${formActionsClass} sm:justify-end`}>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => router.push("/developments")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save development"}
          </Button>
        </div>
      </div>
    </form>
  );
}
