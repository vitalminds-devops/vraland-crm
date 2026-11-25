"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Check, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils/cn";
import { createDealForContact, saveDealForContact } from "@/features/deals/actions/deal.actions";
import { contactDealSchema, type ContactDealInput } from "@/features/deals/schemas/deal.schema";
import type { MoveStage } from "@/features/deals/lib/stage-move";
import { canStartDealInStage } from "@/features/deals/lib/stage-transitions";
import { isBrokerAccessRoleSlug } from "@/lib/permissions/catalog";
import {
  checkContactDuplicate,
  createContact,
  updateContact,
  type ContactErrorDetails,
  type VisibleDuplicateMatch,
} from "../actions/contact.actions";
import { detailsOf, fieldErrorsOf } from "@/lib/types/action-result.client";
import { formatContactName } from "../lib/helpers";
import { contactSchema, contactCreateSchema, type ContactInput } from "../schemas/contact.schema";
import { getUserFacingMessage } from "@/lib/error-handler";
import {
  allProvinces,
  barangaysForCity,
  COUNTRY_NAME,
  citiesForProvince,
  postalCodeForCity,
  getCityCodeByName,
} from "@/lib/location";

import { manilaToday } from "@/lib/utils/manila-time";
import { propertyTypes, propertyTransactionTypes } from "@/features/properties/lib/constants";
import { label } from "@/features/properties/lib/helpers";
import {
  ageOn,
  budgetForRange,
  budgetRangeFor,
  budgetRanges,
  citizenshipOptions,
  civilStatusOptions,
  channelInputMeta,
  channelValueFields,
  employmentTypes,
  genderOptions,
  mobilePhoneFields,
  preferredMethodLabels,
  preferredMethodOptions,
  purchaseTypeLabels,
  type PreferredMethod,
} from "../lib/contact-options";

const singleValueChannels = [
  "landline",
  "email",
  "whatsapp",
  "viber",
  "instagram",
  "facebook",
] as const;

const singleValueChannelLabels: Record<(typeof singleValueChannels)[number], string> = {
  landline: "Landline number",
  email: "Email address",
  whatsapp: "WhatsApp number",
  viber: "Viber number",
  instagram: "Instagram",
  facebook: "Facebook",
};

function seedChannels(initial?: Partial<ContactInput>): PreferredMethod[] {
  const ticked = new Set<PreferredMethod>(initial?.preferredContactMethods ?? []);
  const phoneNumber = [initial?.mobilePhone1, initial?.mobilePhone2, initial?.mobilePhone3].find(
    (value) => value && value.trim(),
  );
  const owned: [PreferredMethod, string | null | undefined][] = [
    ["phone", phoneNumber],
    ["landline", initial?.landline],
    ["email", initial?.email],
    ["whatsapp", initial?.whatsappNumber],
    ["viber", initial?.viberNumber],
    ["instagram", initial?.instagramHandle],
    ["facebook", initial?.facebookHandle],
  ];
  for (const [method, value] of owned) {
    if (value && value.trim()) ticked.add(method);
  }
  return preferredMethodOptions.filter((method) => ticked.has(method));
}

function seedPhoneSlots(initial?: Partial<ContactInput>): number {
  let slots = 1;
  mobilePhoneFields.forEach((field, index) => {
    const value = initial?.[field];
    if (value && value.trim()) slots = index + 1;
  });
  return slots;
}

type ContactFormProps = {
  contactId?: string;
  initial?: Partial<ContactInput>;
  /** True when the active user may create deals (deals.create). */
  canCreateDeal?: boolean;
  /** True when the active user may update deals (deals.update). Edit only. */
  canUpdateDeal?: boolean;
  /** The contact's existing deal, used to prefill the deal section on edit. */
  initialDeal?: Partial<ContactDealInput> | null;
  /** Current user's ID for assignment restrictions */
  currentUserId?: string;
  /** Current user's roles for assignment restrictions */
  currentRoles?: readonly string[];
  options: {
    assignees: {
      id: string;
      firstName: string;
      lastName: string;
      brokerId: string | null;
      brokerFirstName: string | null;
      brokerLastName: string | null;
    }[];
    /** Deal-related options used by the embedded "Deal information" section. */
    dealStages: MoveStage[];
    /** Developments offered as the contact's "Preferred development". */
    developments: { id: string; name: string }[];
  };
};

export function ContactForm({
  contactId,
  initial,
  canCreateDeal = false,
  canUpdateDeal = false,
  initialDeal = null,
  currentUserId,
  currentRoles = [],
  options,
}: ContactFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const creationId = useRef<string | null>(null);
  const submitting = useRef(false);
  const savedContactId = useRef<string | null>(null);
  // Separate from `pending`: a duplicate check fired by leaving a field must not disable Save under the click.
  const [, startDuplicateCheck] = useTransition();
  const [duplicate, setDuplicate] = useState<VisibleDuplicateMatch | null>(null);
  const [dealError, setDealError] = useState<string>();
  const {
    register,
    control,
    getValues,
    setValue,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactId ? contactSchema : contactCreateSchema) as never,
    defaultValues: {
      lifecycleStage: "active_client",
      purchaseType: "house_and_lot",
      marketingConsent: false,
      assignedAgentId: initial?.assignedAgentId ?? "",
      ...initial,
      preferredContactMethods: seedChannels(initial),
      // Country is pinned to Philippines
      currentCountry: COUNTRY_NAME,
      preferredUnitIds: initial?.preferredUnitIds ?? [],
      // Province, city and barangay are required fields - user must select them
      currentProvince: initial?.currentProvince ?? "",
      currentCity: initial?.currentCity ?? "",
      currentBarangay: initial?.currentBarangay ?? "",
      currentPostalCode:
        initial?.currentPostalCode ??
        postalCodeForCity(
          getCityCodeByName(initial?.currentCity ?? null, initial?.currentProvince),
        ) ??
        "",
    },
  });
  const [phoneSlots, setPhoneSlots] = useState(() => seedPhoneSlots(initial));
  const startableStages = options.dealStages.filter((stage) => canStartDealInStage(stage).allowed);
  const currentStageId = initialDeal?.stageId ?? null;
  const visibleStages = options.dealStages.filter(
    (stage) => canStartDealInStage(stage).allowed || stage.id === currentStageId,
  );
  const hasUsableStage = visibleStages.length > 0;
  const {
    register: registerDeal,
    getValues: getDealValues,
    trigger: triggerDeal,
    formState: { errors: dealErrors },
  } = useForm<ContactDealInput>({
    resolver: zodResolver(contactDealSchema) as never,
    defaultValues: {
      dealType: "sale",
      stageId: currentStageId ?? startableStages[0]?.id ?? "",
      amount: "",
      expectedCommission: "",
      expectedCloseDate: "",
      ...initialDeal,
    },
  });
  const canEditDeal = initialDeal ? canUpdateDeal : canCreateDeal;
  const showDealFields = canEditDeal && hasUsableStage;
  const assignedAgentId = useWatch({ control, name: "assignedAgentId" });
  const birthDate = useWatch({ control, name: "birthDate" });
  const [today] = useState(manilaToday);
  const age = ageOn(birthDate, today);
  const channels = useWatch({ control, name: "preferredContactMethods" }) ?? [];
  const phoneChannel = channels.includes("phone");
  // The province, city and barangay lists cascade: province → city → barangay
  const currentProvince = useWatch({ control, name: "currentProvince" });
  const currentCity = useWatch({ control, name: "currentCity" });
  const cityOptions = citiesForProvince(currentProvince ?? null);
  const barangayOptions = barangaysForCity(getCityCodeByName(currentCity ?? null, currentProvince));

  const budgetMin = useWatch({ control, name: "budgetMin" });
  const budgetMax = useWatch({ control, name: "budgetMax" });
  const budgetRange = budgetRangeFor(budgetMin, budgetMax);

  function handleBudgetRangeChange(event: ChangeEvent<HTMLSelectElement>) {
    const { budgetMin, budgetMax } = budgetForRange(event.target.value);
    setValue("budgetMin", budgetMin, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("budgetMax", budgetMax, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  const isAdmin =
    currentRoles.includes("super-administrator") ||
    currentRoles.includes("administrator") ||
    currentRoles.includes("master-broker");
  const isBroker = currentRoles.some(isBrokerAccessRoleSlug);
  const isAgent = currentRoles.includes("agent");

  const filteredAssignees = isAdmin
    ? options.assignees
    : isBroker
      ? options.assignees.filter((a) => a.id === currentUserId || a.brokerId === currentUserId)
      : isAgent
        ? options.assignees.filter((a) => a.id === currentUserId)
        : options.assignees;

  // Find the broker for the selected agent
  const selectedAgent = options.assignees.find((a) => a.id === assignedAgentId);
  const brokerName =
    selectedAgent && selectedAgent.brokerFirstName
      ? `${selectedAgent.brokerFirstName} ${selectedAgent.brokerLastName}`.trim()
      : null;

  function toggleChannel(method: PreferredMethod, checked: boolean) {
    const current = getValues("preferredContactMethods") ?? [];
    setValue(
      "preferredContactMethods",
      checked
        ? // A channel cannot be ticked twice; the schema rejects a repeat.
          current.includes(method)
          ? current
          : [...current, method]
        : current.filter((value) => value !== method),
      { shouldDirty: true },
    );
    if (checked) return;

    if (method === "phone") {
      for (const field of mobilePhoneFields) {
        setValue(field, null, { shouldDirty: true });
      }
      setPhoneSlots(1);
      return;
    }
    setValue(channelValueFields[method], null, { shouldDirty: true });
  }

  function removePhoneSlot(index: number) {
    const values = mobilePhoneFields.slice(0, phoneSlots).map((field) => getValues(field) ?? null);
    values.splice(index, 1);
    mobilePhoneFields.forEach((field, slot) => {
      setValue(field, values[slot] ?? null, { shouldDirty: true });
    });
    setPhoneSlots(Math.max(1, phoneSlots - 1));
  }

  // No shouldValidate: checking a just-cleared field marks it missing, and before the first
  // save picking a value does not re-check it, so "Select a city." would stick.
  function handleProvinceChange() {
    setValue("currentCity", "", { shouldDirty: true });
    setValue("currentBarangay", "", { shouldDirty: true });
    setValue("currentPostalCode", "", { shouldDirty: true });
  }

  function handleCityChange(cityName: string) {
    const cityCode = getCityCodeByName(cityName, currentProvince);
    setValue("currentPostalCode", postalCodeForCity(cityCode) ?? "", { shouldDirty: true });
    const barangay = getValues("currentBarangay");
    if (barangay && !barangaysForCity(cityCode).some((option) => option.name === barangay))
      setValue("currentBarangay", "", { shouldDirty: true });
  }

  function checkDuplicate() {
    const values = getValues();
    if (!values.email && !values.mobilePhone1 && !values.mobilePhone2 && !values.mobilePhone3) {
      setDuplicate(null);
      return;
    }
    startDuplicateCheck(async () => {
      const result = await checkContactDuplicate({
        firstName: values.firstName,
        middleName: values.middleName ?? null,
        lastName: values.lastName,
        email: values.email,
        mobilePhone1: values.mobilePhone1,
        mobilePhone2: values.mobilePhone2,
        mobilePhone3: values.mobilePhone3,
        contactId,
      });
      if (result.success) setDuplicate(result.data.match);
    });
  }

  function submit(values: ContactInput) {
    if (submitting.current) return;
    submitting.current = true;
    setDealError(undefined);
    startTransition(async () => {
      try {
        const dealValues = canEditDeal ? getDealValues() : undefined;
        const wantsDeal = Boolean(dealValues) && hasUsableStage;
        if (dealValues && wantsDeal) {
          const valid = await triggerDeal(undefined, { shouldFocus: true });
          if (!valid) {
            setDealError("Review the highlighted fields below.");
            return;
          }
        }
        if (!contactId && !creationId.current) {
          // Keep the request id through the error page's Retry button and browser reloads.
          const url = new URL(window.location.href);
          creationId.current = url.searchParams.get("creationId") || crypto.randomUUID();
          url.searchParams.set("creationId", creationId.current);
          window.history.replaceState(null, "", url);
        }
        const result = contactId
          ? await updateContact(contactId, values)
          : await createContact(values, creationId.current!);
        if (!result.success) {
          for (const [field, messages] of Object.entries(fieldErrorsOf(result))) {
            if (messages[0])
              setError(field as FieldPath<ContactInput>, {
                type: "server",
                message: messages[0],
              });
          }
          const duplicateMatch = detailsOf<ContactErrorDetails>(result)?.duplicate;
          if (duplicateMatch) setDuplicate(duplicateMatch);
          notify(result.error.message, "error");
          return;
        }
        savedContactId.current = result.data.id;
        if (dealValues && wantsDeal) {
          const saveDeal = contactId ? saveDealForContact : createDealForContact;
          const dealResult = await saveDeal(
            result.data.id,
            values.assignedAgentId ?? null,
            dealValues,
          );
          if (!dealResult.success) {
            const message = `${dealResult.error.message} The contact was saved, but its deal was not ${contactId ? "updated" : "created"}.`;
            setDealError(message);
            notify(message, "error");
            router.push("/contacts");
            router.refresh();
            return;
          }
        }
        router.push("/contacts");
        router.refresh();
      } catch (error) {
        notify(
          savedContactId.current
            ? "The contact was saved, but the remaining steps could not finish. Retry Save to continue with the same contact."
            : getUserFacingMessage(error),
          "error",
        );
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(submit, () => notify("Review the highlighted fields below.", "error"))(
          event,
        );
      }}
      className={formShellClass}
    >
      <FormStyle />

      {duplicate && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-[#f59e0b] bg-[rgba(245,158,11,0.12)] px-4 py-3 text-[13px] text-[var(--text)]"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#d97706]" />
          <div className="space-y-1">
            <p className="font-medium">
              {duplicate.kind === "exact"
                ? duplicate.reason === "email"
                  ? "Another contact already uses this email address."
                  : "Another contact already uses this mobile number."
                : "Another contact has the same name."}
            </p>
            <p className="text-[var(--text-muted)]">
              {duplicate.contact ? (
                <>
                  <Link
                    href={`/contacts/${duplicate.contact.id}`}
                    className="font-medium underline"
                    target="_blank"
                  >
                    {formatContactName(duplicate.contact)}
                  </Link>{" "}
                  ({duplicate.contact.contactCode})
                </>
              ) : (
                "It belongs to a contact outside your access"
              )}
              {duplicate.kind === "exact"
                ? ` — each ${duplicate.reason === "email" ? "email" : "mobile number"} can belong to one contact only.`
                : " — you can still save if this is a different person."}
            </p>
          </div>
        </div>
      )}

      <div className="min-w-0 space-y-6 sm:space-y-10">
        <FormSection id="section-1" number={1} title="Details">
          <FormRow>
            <FormField label="First name" required error={errors.firstName?.message}>
              <Input
                {...register("firstName")}
                className={`${formInputClass} uppercase placeholder:normal-case`}
                autoCapitalize="characters"
                placeholder="Enter first name"
              />
            </FormField>
            <FormField label="Last name" required error={errors.lastName?.message}>
              <Input
                {...register("lastName")}
                className={`${formInputClass} uppercase placeholder:normal-case`}
                autoCapitalize="characters"
                placeholder="Enter last name"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Middle name" error={errors.middleName?.message}>
              <Input
                {...register("middleName")}
                className={`${formInputClass} uppercase placeholder:normal-case`}
                autoCapitalize="characters"
                placeholder="Optional"
              />
            </FormField>
            <FormField label="Company" error={errors.companyName?.message}>
              <Input
                {...register("companyName")}
                className={`${formInputClass} uppercase placeholder:normal-case`}
                autoCapitalize="characters"
                placeholder="Optional"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField
              label="Date of birth"
              hint={age === null ? undefined : `Age ${age}`}
              error={errors.birthDate?.message}
            >
              <DatePicker max={today} {...register("birthDate")} className={formInputClass} />
            </FormField>
            <FormField label="Gender" error={errors.gender?.message}>
              <FormSelect {...register("gender")}>
                <option value="">Not specified</option>
                {genderOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Civil status" error={errors.civilStatus?.message}>
              <FormSelect {...register("civilStatus")}>
                <option value="">Not specified</option>
                {civilStatusOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Citizenship" error={errors.citizenship?.message}>
              <FormSelect {...register("citizenship")}>
                <option value="">Not specified</option>
                {/* Keeps a value typed before this became a list. */}
                {initial?.citizenship &&
                  !(citizenshipOptions as readonly string[]).includes(initial.citizenship) && (
                    <option value={initial.citizenship}>{initial.citizenship}</option>
                  )}
                {citizenshipOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <div className="space-y-2">
            <label className="text-[14px] font-medium text-[var(--text)]">Contact channels</label>
            <p className="text-[12px] text-[var(--text-muted)]">Tick how to reach this contact.</p>
            <div className="flex flex-wrap gap-2 sm:grid sm:grid-cols-7 sm:gap-1.5">
              {preferredMethodOptions.map((method) => {
                const selected = channels.includes(method);
                return (
                  <label
                    key={method}
                    className={`flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-medium whitespace-nowrap sm:gap-1 sm:px-1.5 sm:py-1.5 sm:text-[12px] transition-colors select-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/35 ${
                      selected
                        ? "border-[var(--form-accent)] bg-[var(--accent-light)] text-[var(--text)]"
                        : "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selected}
                      onChange={(event) => toggleChannel(method, event.target.checked)}
                    />
                    <span
                      aria-hidden="true"
                      className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        selected
                          ? "border-[var(--form-accent)] bg-[var(--form-accent)] text-primary-foreground"
                          : "border-[var(--border-strong)] bg-transparent"
                      }`}
                    >
                      {selected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {preferredMethodLabels[method]}
                  </label>
                );
              })}
            </div>
            {errors.preferredContactMethods?.message && (
              <p role="alert" className="text-[12px] text-[var(--danger)]">
                {errors.preferredContactMethods.message}
              </p>
            )}
          </div>

          {phoneChannel && (
            <div className="space-y-5">
              {mobilePhoneFields.slice(0, phoneSlots).map((field, index) => (
                <FormField
                  key={field}
                  label={`Mobile phone ${index + 1}`}
                  required={index === 0}
                  hint={index === 0 ? "Main number" : undefined}
                  error={errors[field]?.message}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      type="tel"
                      {...register(field, { onBlur: checkDuplicate })}
                      className={formInputClass}
                      placeholder={channelInputMeta.phone.placeholder}
                    />
                    {index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePhoneSlot(index)}
                        aria-label={`Remove mobile phone ${index + 1}`}
                        title={`Remove mobile phone ${index + 1}`}
                        className="flex size-[42px] shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)] focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:outline-none"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </Button>
                    )}
                  </div>
                </FormField>
              ))}
              {phoneSlots < mobilePhoneFields.length && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPhoneSlots((count) => count + 1)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border-strong)] px-3 py-1.5 text-[13px] font-medium text-[var(--form-accent)] transition-colors hover:border-[var(--form-accent)] hover:bg-[var(--accent-light)] focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:outline-none"
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  Add another number
                </Button>
              )}
            </div>
          )}

          {singleValueChannels.map((method) => {
            if (!channels.includes(method)) return null;
            const field = channelValueFields[method];
            return (
              <FormField
                key={method}
                label={singleValueChannelLabels[method]}
                required
                error={errors[field]?.message}
              >
                <Input
                  type={
                    channelInputMeta[method].input === "handle"
                      ? "text"
                      : channelInputMeta[method].input
                  }
                  {...register(field, { onBlur: checkDuplicate })}
                  className={formInputClass}
                  placeholder={channelInputMeta[method].placeholder}
                />
              </FormField>
            );
          })}
        </FormSection>

        {contactId && (
          <>
            <FormSection id="section-2" number={2} title="Address">
              <FormRow>
                <FormField label="Province" required error={errors.currentProvince?.message}>
                  <FormSelect
                    {...register("currentProvince", {
                      onChange: () => handleProvinceChange(),
                    })}
                  >
                    <option value="">Select province</option>
                    {allProvinces.map((province) => (
                      <option key={province.id} value={province.name}>
                        {province.name}
                      </option>
                    ))}
                  </FormSelect>
                </FormField>
                <FormField
                  label="City"
                  required
                  hint={cityOptions.length === 0 ? "Select a province first" : undefined}
                  error={errors.currentCity?.message}
                >
                  <FormSelect
                    {...register("currentCity", {
                      onChange: (event) => handleCityChange(event.target.value),
                    })}
                    disabled={cityOptions.length === 0}
                  >
                    <option value="">Select city</option>
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
                  required
                  hint={barangayOptions.length === 0 ? "Select a city first" : undefined}
                  error={errors.currentBarangay?.message}
                >
                  <FormSelect
                    {...register("currentBarangay")}
                    disabled={barangayOptions.length === 0}
                  >
                    <option value="">Select barangay</option>
                    {barangayOptions.map((barangay) => (
                      <option key={barangay.id} value={barangay.name}>
                        {barangay.name}
                      </option>
                    ))}
                  </FormSelect>
                </FormField>
                <FormField
                  label="Postal code"
                  hint="Set from the city"
                  error={errors.currentPostalCode?.message}
                >
                  <Input
                    {...register("currentPostalCode")}
                    readOnly
                    className={`${formInputClass} bg-[var(--surface)] text-[var(--text-muted)] cursor-not-allowed`}
                  />
                </FormField>
              </FormRow>
              <FormField label="Street" error={errors.currentAddressLine1?.message}>
                <Input
                  {...register("currentAddressLine1")}
                  className={formInputClass}
                  placeholder="House or lot no., street, subdivision"
                />
              </FormField>
            </FormSection>

            <FormSection id="section-3" number={3} title="Property interest">
              <FormRow>
                <FormField label="Budget range" required error={errors.budgetMax?.message}>
                  <FormSelect value={budgetRange ?? ""} onChange={handleBudgetRangeChange}>
                    <option value="">Select budget</option>
                    {budgetRanges.map((range) => (
                      <option key={range.value} value={range.value}>
                        {range.label}
                      </option>
                    ))}
                  </FormSelect>
                </FormField>
                <FormField label="Property type" error={errors.purchaseType?.message}>
                  <FormSelect {...register("purchaseType")}>
                    {initial?.purchaseType === "residential" && (
                      <option value="residential">Residential</option>
                    )}
                    {propertyTypes.map((type) => (
                      <option key={type} value={type}>
                        {purchaseTypeLabels[type]}
                      </option>
                    ))}
                  </FormSelect>
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="Employment" error={errors.employmentType?.message}>
                  <FormSelect {...register("employmentType")}>
                    <option value="">Not specified</option>
                    {employmentTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </FormSelect>
                </FormField>
                <FormField label="Annual income" error={errors.annualIncome?.message}>
                  <Controller
                    control={control}
                    name="annualIncome"
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
          </>
        )}
        <FormSection id="section-4" number={contactId ? 4 : 2} title="Opportunity">
          <p className="text-[13px] text-[var(--text-muted)]">
            {!canEditDeal
              ? initialDeal
                ? "You can't edit this opportunity."
                : "You can't create opportunities."
              : options.dealStages.length === 0
                ? "No pipeline stages yet."
                : !hasUsableStage
                  ? "No stage is open to you."
                  : initialDeal
                    ? "Changes here update this contact's existing opportunity."
                    : "It starts in Leads."}
          </p>
          <FormRow>
            <FormField label="Agent" required error={errors.assignedAgentId?.message}>
              <FormSelect {...register("assignedAgentId")}>
                <option value="">Select an agent</option>
                {initial?.assignedAgentId &&
                  !filteredAssignees.some((agent) => agent.id === initial.assignedAgentId) && (
                    <option value={initial.assignedAgentId} disabled>
                      Current agent
                    </option>
                  )}
                {filteredAssignees.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.firstName} {value.lastName}
                  </option>
                ))}
              </FormSelect>
              {brokerName && (
                <div className="mt-1.5 text-xs text-[var(--text-muted)]">Broker: {brokerName}</div>
              )}
            </FormField>
            {showDealFields && (
              <FormField label="Transaction type" error={dealErrors.dealType?.message}>
                <FormSelect {...registerDeal("dealType")}>
                  {propertyTransactionTypes.map((type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ))}
                </FormSelect>
              </FormField>
            )}
          </FormRow>
          {dealError && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {dealError}
            </p>
          )}
          <FormField label="Notes" error={errors.notes?.message}>
            <Textarea
              rows={4}
              {...register("notes")}
              className={formTextareaClass}
              placeholder="Notes about this contact"
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("marketingConsent")}
              className="rounded border-[var(--border)]"
            />
            Agreed to marketing
          </label>
        </FormSection>
      </div>

      {/* Phones keep Cancel and Save pinned to the bottom of the screen. */}
      <div className={cn(formActionsClass, "bg-card sm:static")}>
        <div className="flex w-full flex-wrap justify-end gap-3 max-sm:[&>button]:flex-1 sm:ml-auto sm:w-auto">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => router.push("/contacts")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : contactId ? "Save changes" : "Create contact"}
          </Button>
        </div>
      </div>
    </form>
  );
}
