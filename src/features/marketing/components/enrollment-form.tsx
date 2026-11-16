"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { type FieldPath, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField, FormSelect, FormStyle } from "@/components/ui/form-kit";
import { notify } from "@/components/ui/toast";
import { getUserFacingMessage } from "@/lib/error-handler";
import { fieldErrorsOf } from "@/lib/types/action-result.client";
import { enrollInSequence } from "../actions/marketing.actions";
import { enrollmentSchema, type EnrollmentInput } from "../lib/marketing-schemas";
import { MarketingSection } from "./marketing-section";

export function EnrollmentForm({
  sequenceId,
  options,
}: {
  sequenceId: string;
  options: {
    contacts: {
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      mobilePhone: string | null;
    }[];
    deals: { id: string; title: string }[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<EnrollmentInput>({
    resolver: zodResolver(enrollmentSchema) as never,
    defaultValues: { contactId: "", dealId: "" },
  });

  function submit(values: EnrollmentInput) {
    startTransition(async () => {
      try {
        const result = await enrollInSequence({
          sequenceId,
          contactId: values.contactId,
          dealId: values.dealId,
        });
        if (!result.success) {
          for (const [field, messages] of Object.entries(fieldErrorsOf(result)))
            if (messages[0])
              setError(field as FieldPath<EnrollmentInput>, {
                type: "server",
                message: messages[0],
              });
          notify(result.error.message, "error");
          return;
        }
        notify("Added to the follow-up.", "success");
        reset();
        router.refresh();
      } catch (error) {
        notify(getUserFacingMessage(error), "error");
      }
    });
  }

  return (
    <MarketingSection
      title="Add a person"
      description="Start this follow-up for one contact, or for the client of a deal."
    >
      <form
        className="crm-form space-y-4"
        onSubmit={handleSubmit(submit, () => notify("Select a contact or a deal.", "error"))}
      >
        <FormStyle />
        <FormField
          label="Contact"
          hint="Pick a contact, or a deal below."
          error={errors.contactId?.message}
        >
          <FormSelect {...register("contactId")} aria-invalid={Boolean(errors.contactId)}>
            <option value="">Select a contact</option>
            {options.contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.firstName} {contact.lastName}
              </option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label="Deal" error={errors.dealId?.message}>
          <FormSelect {...register("dealId")} aria-invalid={Boolean(errors.dealId)}>
            <option value="">Select a deal</option>
            {options.deals.map((deal) => (
              <option key={deal.id} value={deal.id}>
                {deal.title}
              </option>
            ))}
          </FormSelect>
        </FormField>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Adding…" : "Add to follow-up"}
        </Button>
      </form>
    </MarketingSection>
  );
}
