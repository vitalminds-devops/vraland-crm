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
import { saveEmailTemplate } from "../actions/marketing.actions";
import { emailTemplateSchema, type EmailTemplateInput } from "../lib/marketing-schemas";
import { textToHtml } from "../lib/merge-fields";
import { InsertFirstName, MessagePreview } from "./message-helpers";

export function EmailTemplateForm({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    setError,
    formState: { errors },
  } = useForm<EmailTemplateInput>({
    resolver: zodResolver(emailTemplateSchema) as never,
    defaultValues: {
      name: "",
      subject: "",
      category: "",
      bodyHtml: "",
      bodyText: "",
    },
  });

  const [subject = "", bodyText = ""] = useWatch({ control, name: ["subject", "bodyText"] });

  // Most people write a plain message; the email's HTML is built from it unless they wrote their own.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const values = getValues();
    if (!values.bodyHtml?.trim() && values.bodyText?.trim())
      setValue("bodyHtml", textToHtml(values.bodyText));
    return handleSubmit(submit, () => notify("Review the highlighted fields below.", "error"))(
      event,
    );
  }

  function submit(values: EmailTemplateInput) {
    startTransition(async () => {
      try {
        const result = await saveEmailTemplate({
          ...values,
          bodyText: values.bodyText || undefined,
          category: values.category || undefined,
        });
        if (!result.success) {
          for (const [field, messages] of Object.entries(fieldErrorsOf(result)))
            if (messages[0])
              setError(field as FieldPath<EmailTemplateInput>, {
                type: "server",
                message: messages[0],
              });
          notify(result.error.message, "error");
          return;
        }
        notify("Email template saved.", "success");
        router.push(`/marketing/email-templates/${result.data.id}`);
        router.refresh();
      } catch (error) {
        notify(getUserFacingMessage(error), "error");
      }
    });
  }

  return (
    <form className={formShellClass} onSubmit={onSubmit}>
      <FormStyle />

      <FormSection id="section-1" number={1} title="Template">
        <FormRow>
          <FormField label="Template name" required error={errors.name?.message}>
            <Input
              {...register("name")}
              className={formInputClass}
              placeholder="e.g. New listing announcement"
              aria-invalid={Boolean(errors.name)}
            />
          </FormField>
          <FormField label="Category" error={errors.category?.message}>
            <Input
              {...register("category")}
              className={formInputClass}
              placeholder="e.g. Listings"
              list="email-template-categories"
              aria-invalid={Boolean(errors.category)}
            />
          </FormField>
        </FormRow>
        <datalist id="email-template-categories">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <FormField label="Subject" required error={errors.subject?.message}>
          <Input
            id="email-subject"
            {...register("subject")}
            className={formInputClass}
            placeholder="New listings this week"
            aria-invalid={Boolean(errors.subject)}
          />
        </FormField>
        <div className="-mt-4 flex justify-end">
          <InsertFirstName
            target="email-subject"
            onInsert={(value) => setValue("subject", value, { shouldDirty: true })}
          />
        </div>
      </FormSection>

      <FormSection id="section-2" number={2} title="Message">
        <FormField
          label="Message"
          required
          error={errors.bodyHtml?.message ?? errors.bodyText?.message}
        >
          <Textarea
            id="email-body"
            {...register("bodyText")}
            rows={10}
            className={formTextareaClass}
            placeholder="Hi, we have new units open this week…"
            aria-invalid={Boolean(errors.bodyHtml || errors.bodyText)}
          />
        </FormField>
        <div className="-mt-4 flex justify-end">
          <InsertFirstName
            target="email-body"
            onInsert={(value) => setValue("bodyText", value, { shouldDirty: true })}
          />
        </div>
        <MessagePreview channel="email" subject={subject} body={bodyText} />
        <details className="rounded-lg border border-[var(--border)] p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Custom design (HTML, optional)
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Leave empty and the email is built from your message.
          </p>
          <Textarea
            {...register("bodyHtml")}
            rows={10}
            className={`${formTextareaClass} mt-3 font-mono text-[13px]`}
            placeholder="<p>Hi {{first_name}},</p>"
            aria-label="Custom HTML"
          />
        </details>
      </FormSection>

      <div className="flex items-center justify-end gap-2">
        <ButtonLink href="/marketing/email-templates" variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save template"}
        </Button>
      </div>
    </form>
  );
}
