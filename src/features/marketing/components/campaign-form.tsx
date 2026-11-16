"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { type FieldPath, useForm, useWatch } from "react-hook-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormField,
  FormRow,
  FormSection,
  FormSelect,
  FormStyle,
  formInputClass,
  formShellClass,
} from "@/components/ui/form-kit";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { notify } from "@/components/ui/toast";
import { ToolbarSearch } from "@/components/ui/toolbar-helpers";
import { getUserFacingMessage } from "@/lib/error-handler";
import { fieldErrorsOf } from "@/lib/types/action-result.client";
import { createCampaign } from "../actions/marketing.actions";
import { campaignSchema, type CampaignInput } from "../lib/marketing-schemas";
import { MessagePreview, NoTemplateYet } from "./message-helpers";

export type CampaignFormOptions = {
  emailTemplates: { id: string; name: string; subject: string; preview: string }[];
  smsTemplates: { id: string; name: string; body: string }[];
  contacts: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    mobilePhone: string | null;
  }[];
};

export function CampaignForm({ options }: { options: CampaignFormOptions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [recipientSearch, setRecipientSearch] = useState("");
  const [contactIds, setContactIds] = useState<string[]>([]);
  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    formState: { errors },
  } = useForm<CampaignInput>({
    resolver: zodResolver(campaignSchema) as never,
    defaultValues: {
      name: "",
      channel: "email",
      emailTemplateId: "",
      smsTemplateId: "",
      scheduledAt: "",
      contactIds: [],
    },
  });
  const [channel, emailTemplateId, smsTemplateId] = useWatch({
    control,
    name: ["channel", "emailTemplateId", "smsTemplateId"],
  });
  const emailTemplate = options.emailTemplates.find((t) => t.id === emailTemplateId);
  const smsTemplate = options.smsTemplates.find((t) => t.id === smsTemplateId);

  const filteredContacts = useMemo(() => {
    const query = recipientSearch.trim().toLowerCase();
    if (!query) return options.contacts;
    return options.contacts.filter((contact) =>
      `${contact.firstName} ${contact.lastName} ${contact.email ?? ""} ${contact.mobilePhone ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [options.contacts, recipientSearch]);

  function setAudience(next: string[]) {
    setContactIds(next);
    setValue("contactIds", next, { shouldValidate: next.length > 0 });
  }

  function toggleContact(id: string) {
    setAudience(
      contactIds.includes(id) ? contactIds.filter((value) => value !== id) : [...contactIds, id],
    );
  }

  function submit(values: CampaignInput) {
    startTransition(async () => {
      try {
        const result = await createCampaign({
          name: values.name,
          channel: values.channel,
          emailTemplateId: values.channel === "email" ? values.emailTemplateId : "",
          smsTemplateId: values.channel === "sms" ? values.smsTemplateId : "",
          scheduledAt: values.scheduledAt,
          contactIds: values.contactIds,
        });
        if (!result.success) {
          for (const [field, messages] of Object.entries(fieldErrorsOf(result)))
            if (messages[0])
              setError(field as FieldPath<CampaignInput>, {
                type: "server",
                message: messages[0],
              });
          notify(result.error.message, "error");
          return;
        }
        notify("Campaign created.", "success");
        router.push(`/marketing/campaigns/${result.data.id}`);
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

      <FormSection id="section-1" number={1} title="Campaign">
        <FormField label="Campaign name" required error={errors.name?.message}>
          <Input
            {...register("name")}
            className={formInputClass}
            placeholder="e.g. New listings — October"
            aria-invalid={Boolean(errors.name)}
          />
        </FormField>
        <FormField label="Channel" required error={errors.channel?.message}>
          <FormSelect {...register("channel")}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="social" disabled>
              Social — not configured
            </option>
          </FormSelect>
        </FormField>
      </FormSection>

      <FormSection id="section-2" number={2} title="Message">
        {channel === "sms" ? (
          <FormField label="SMS template" required error={errors.smsTemplateId?.message}>
            <FormSelect {...register("smsTemplateId")} aria-invalid={Boolean(errors.smsTemplateId)}>
              <option value="">Select an SMS template</option>
              {options.smsTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </FormSelect>
            {!options.smsTemplates.length && <NoTemplateYet kind="sms" />}
          </FormField>
        ) : (
          <FormField label="Email template" required error={errors.emailTemplateId?.message}>
            <FormSelect
              {...register("emailTemplateId")}
              aria-invalid={Boolean(errors.emailTemplateId)}
            >
              <option value="">Select an email template</option>
              {options.emailTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </FormSelect>
            {!options.emailTemplates.length && <NoTemplateYet kind="email" />}
          </FormField>
        )}
        {channel === "sms"
          ? smsTemplate && <MessagePreview channel="sms" body={smsTemplate.body} />
          : emailTemplate && (
              <MessagePreview
                channel="email"
                subject={emailTemplate.subject}
                body={emailTemplate.preview}
              />
            )}
      </FormSection>

      <FormSection id="section-3" number={3} title="Audience">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">
            {contactIds.length} recipient{contactIds.length === 1 ? "" : "s"} selected
          </p>
          <p className="text-xs text-muted-foreground">
            Only contacts who agreed to receive marketing are listed.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
            <ToolbarSearch
              value={recipientSearch}
              onValueChange={setRecipientSearch}
              placeholder="Search by name, email or mobile"
              aria-label="Search contacts"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!filteredContacts.length}
              onClick={() => setAudience(filteredContacts.map((c) => c.id))}
            >
              Select all shown
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!contactIds.length}
              onClick={() => setAudience([])}
            >
              Clear
            </Button>
          </div>
          <div
            role="group"
            aria-label="Consenting contacts"
            aria-describedby={errors.contactIds ? "audience-error" : undefined}
            className="max-h-64 overflow-auto p-2"
          >
            {filteredContacts.map((contact) => {
              const name = `${contact.firstName} ${contact.lastName}`.trim();
              return (
                <label
                  key={contact.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/60 focus-within:bg-muted/60"
                >
                  <Checkbox
                    checked={contactIds.includes(contact.id)}
                    onCheckedChange={() => toggleContact(contact.id)}
                    aria-label={`Select ${name}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span className="hidden max-w-[45%] truncate text-xs text-muted-foreground sm:block">
                    {(channel === "sms" ? contact.mobilePhone : contact.email) ??
                      (channel === "sms"
                        ? "No mobile number — won't receive it"
                        : "No email — won't receive it")}
                  </span>
                </label>
              );
            })}
            {!filteredContacts.length ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No contacts match. Only contacts who agreed to marketing appear here.
              </p>
            ) : null}
          </div>
        </div>
        {errors.contactIds?.message ? (
          <p id="audience-error" role="alert" className="text-[12px] text-[var(--danger)]">
            {errors.contactIds.message}
          </p>
        ) : null}
      </FormSection>

      <FormSection id="section-4" number={4} title="Schedule">
        <FormRow>
          <FormField label="Send at" hint="Optional" error={errors.scheduledAt?.message}>
            <DatePicker
              type="datetime-local"
              {...register("scheduledAt")}
              className={formInputClass}
            />
          </FormField>
        </FormRow>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Pick a time and it goes out automatically then. Leave it empty to save a draft you send
          yourself from the campaign page.
        </p>
      </FormSection>

      <div className="flex items-center justify-end gap-2">
        <ButtonLink href="/marketing/campaigns" variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create campaign"}
        </Button>
      </div>
    </form>
  );
}
