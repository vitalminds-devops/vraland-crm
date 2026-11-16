"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { type FieldPath, useForm, useWatch } from "react-hook-form";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  FormField,
  FormRow,
  FormSection,
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
import { saveSmsTemplate } from "../actions/marketing.actions";
import { smsTemplateSchema, type SmsTemplateInput } from "../lib/marketing-schemas";
import { InsertFirstName, MessagePreview } from "./message-helpers";

const SMS_SEGMENT = 160;

export function SmsTemplateForm({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<SmsTemplateInput>({
    resolver: zodResolver(smsTemplateSchema) as never,
    defaultValues: { name: "", category: "", body: "" },
  });
  const body = useWatch({ control, name: "body" }) ?? "";
  const characters = body.length;
  const segments = Math.max(1, Math.ceil(characters / SMS_SEGMENT));

  function submit(values: SmsTemplateInput) {
    startTransition(async () => {
      try {
        const result = await saveSmsTemplate({
          ...values,
          category: values.category || undefined,
        });
        if (!result.success) {
          for (const [field, messages] of Object.entries(fieldErrorsOf(result)))
            if (messages[0])
              setError(field as FieldPath<SmsTemplateInput>, {
                type: "server",
                message: messages[0],
              });
          notify(result.error.message, "error");
          return;
        }
        notify("SMS template saved.", "success");
        router.push(`/marketing/sms-templates/${result.data.id}`);
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

      <FormSection id="section-1" number={1} title="Template">
        <FormRow>
          <FormField label="Template name" required error={errors.name?.message}>
            <Input
              {...register("name")}
              className={formInputClass}
              placeholder="e.g. Viewing reminder"
              aria-invalid={Boolean(errors.name)}
            />
          </FormField>
          <FormField label="Category" error={errors.category?.message}>
            <Input
              {...register("category")}
              className={formInputClass}
              placeholder="e.g. Reminders"
              list="sms-template-categories"
              aria-invalid={Boolean(errors.category)}
            />
          </FormField>
        </FormRow>
        <datalist id="sms-template-categories">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </FormSection>

      <FormSection id="section-2" number={2} title="Message">
        <FormField label="Message" required error={errors.body?.message}>
          <Textarea
            id="sms-body"
            {...register("body")}
            rows={6}
            maxLength={1_600}
            className={formTextareaClass}
            placeholder="Hi, this is a reminder about your viewing tomorrow."
            aria-invalid={Boolean(errors.body)}
          />
        </FormField>
        <div className="-mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          {/* Carriers bill each 160-character part as one SMS. */}
          <span className="tabular-nums">
            {characters} characters · sent as {segments} SMS
          </span>
          <InsertFirstName
            target="sms-body"
            onInsert={(value) => setValue("body", value, { shouldDirty: true })}
          />
        </div>
        <MessagePreview channel="sms" body={body} />
      </FormSection>

      <div className="flex items-center justify-end gap-2">
        <ButtonLink href="/marketing/sms-templates" variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save template"}
        </Button>
      </div>
    </form>
  );
}
