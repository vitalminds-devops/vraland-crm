"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { type FieldPath, useForm, useWatch } from "react-hook-form";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  FormField,
  FormSection,
  FormSelect,
  FormStyle,
  formInputClass,
  formShellClass,
  formTextareaClass,
} from "@/components/ui/form-kit";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/components/ui/toast";
import { getUserFacingMessage } from "@/lib/error-handler";
import { fieldErrorsOf } from "@/lib/types/action-result.client";
import { createSequence } from "../actions/marketing.actions";
import { sequenceTriggers, triggerLabel } from "../lib/marketing-meta";
import { sequenceSchema, type SequenceInput } from "../lib/marketing-schemas";

export function SequenceForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<SequenceInput>({
    resolver: zodResolver(sequenceSchema) as never,
    defaultValues: {
      name: "",
      description: "",
      triggerType: "manual",
    },
  });

  const trigger = useWatch({ control, name: "triggerType" });

  function submit(values: SequenceInput) {
    startTransition(async () => {
      try {
        const result = await createSequence(values);
        if (!result.success) {
          for (const [field, messages] of Object.entries(fieldErrorsOf(result)))
            if (messages[0])
              setError(field as FieldPath<SequenceInput>, {
                type: "server",
                message: messages[0],
              });
          notify(result.error.message, "error");
          return;
        }
        notify("Follow-up created. Now add its messages.", "success");
        router.push(`/marketing/automations/${result.data.id}`);
        router.refresh();
      } catch (error) {
        notify(getUserFacingMessage(error), "error");
      }
    });
  }

  return (
    <form
      className={formShellClass}
      onSubmit={handleSubmit(submit, () => notify("Review the highlighted fields below.", "error"))}
    >
      <FormStyle />

      <FormSection id="section-1" number={1} title="Follow-up">
        <FormField label="Name" required error={errors.name?.message}>
          <Input
            {...register("name")}
            className={formInputClass}
            placeholder="e.g. New lead follow-up"
            aria-invalid={Boolean(errors.name)}
          />
        </FormField>
        <FormField label="Description" error={errors.description?.message}>
          <Textarea
            {...register("description")}
            rows={5}
            className={formTextareaClass}
            placeholder="Optional"
            aria-invalid={Boolean(errors.description)}
          />
        </FormField>
      </FormSection>

      <FormSection id="section-2" number={2} title="Who gets it">
        <FormField
          label="Start it when"
          required
          hint={
            trigger === "manual"
              ? "You add people from the follow-up page."
              : "People are added automatically when this happens."
          }
          error={errors.triggerType?.message}
        >
          <FormSelect {...register("triggerType")} aria-invalid={Boolean(errors.triggerType)}>
            {sequenceTriggers.map((value) => (
              <option key={value} value={value}>
                {triggerLabel(value)}
              </option>
            ))}
          </FormSelect>
        </FormField>
      </FormSection>

      <div className="flex items-center justify-end gap-2">
        <ButtonLink href="/marketing/automations" variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create follow-up"}
        </Button>
      </div>
    </form>
  );
}
