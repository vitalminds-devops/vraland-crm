"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type FieldPath, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField, FormSelect, FormStyle, formInputClass } from "@/components/ui/form-kit";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/toast";
import { getUserFacingMessage } from "@/lib/error-handler";
import { fieldErrorsOf } from "@/lib/types/action-result.client";
import { addAutomationStep } from "../actions/marketing.actions";
import { stepActionLabel } from "../lib/marketing-meta";
import { stepSchema, type StepInput } from "../lib/marketing-schemas";
import { MarketingSection } from "./marketing-section";
import { NoTemplateYet } from "./message-helpers";

// "Wait" and "Assign user" are left out: each step has its own wait, and assigning is not carried out yet.
const offeredActions = ["send_email", "send_sms", "create_task"] as const;

const delayUnits = { minutes: 1, hours: 60, days: 1_440 } as const;
type DelayUnit = keyof typeof delayUnits;

export function StepForm({
  sequenceId,
  options,
}: {
  sequenceId: string;
  options: {
    emailTemplates: { id: string; name: string }[];
    smsTemplates: { id: string; name: string }[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [delayAmount, setDelayAmount] = useState("0");
  const [delayUnit, setDelayUnit] = useState<DelayUnit>("days");
  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    setError,
    formState: { errors },
  } = useForm<StepInput>({
    resolver: zodResolver(stepSchema) as never,
    defaultValues: {
      actionType: "send_email",
      delayMinutes: 0,
      emailTemplateId: "",
      smsTemplateId: "",
      taskTitle: "",
      configuration: "",
    },
  });
  const actionType = useWatch({ control, name: "actionType" });

  // The wait is picked as days, hours or minutes and stored as minutes.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const amount = Number(delayAmount);
    setValue(
      "delayMinutes",
      Number.isFinite(amount) ? Math.round(amount * delayUnits[delayUnit]) : Number.NaN,
    );
    return handleSubmit(submit, () => notify("Review the highlighted fields below.", "error"))(
      event,
    );
  }

  function submit(values: StepInput) {
    startTransition(async () => {
      try {
        const result = await addAutomationStep({
          sequenceId,
          actionType: values.actionType,
          delayMinutes: values.delayMinutes,
          emailTemplateId: values.actionType === "send_email" ? values.emailTemplateId : "",
          smsTemplateId: values.actionType === "send_sms" ? values.smsTemplateId : "",
          taskTitle: values.actionType === "create_task" ? values.taskTitle : "",
          configuration: values.configuration,
        });
        if (!result.success) {
          for (const [field, messages] of Object.entries(fieldErrorsOf(result)))
            if (messages[0])
              setError(field as FieldPath<StepInput>, {
                type: "server",
                message: messages[0],
              });
          notify(result.error.message, "error");
          return;
        }
        notify("Step added.", "success");
        reset();
        setDelayAmount("0");
        router.refresh();
      } catch (error) {
        notify(getUserFacingMessage(error), "error");
      }
    });
  }

  return (
    <MarketingSection title="Add a step" description="Steps run in order, top to bottom.">
      <form className="crm-form space-y-4" onSubmit={onSubmit}>
        <FormStyle />
        <FormField label="What happens" required error={errors.actionType?.message}>
          <FormSelect {...register("actionType")} aria-invalid={Boolean(errors.actionType)}>
            {offeredActions.map((value) => (
              <option key={value} value={value}>
                {stepActionLabel(value)}
              </option>
            ))}
          </FormSelect>
        </FormField>

        <FormField
          label="Wait before this step"
          hint="Counted from the step before, or from when the person was added."
          error={errors.delayMinutes?.message}
        >
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              step="any"
              value={delayAmount}
              onChange={(event) => setDelayAmount(event.target.value)}
              className={`${formInputClass} w-24`}
              aria-label="Wait amount"
              aria-invalid={Boolean(errors.delayMinutes)}
            />
            <FormSelect
              value={delayUnit}
              onChange={(event) => setDelayUnit(event.target.value as DelayUnit)}
              aria-label="Wait unit"
            >
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </FormSelect>
          </div>
        </FormField>

        {actionType === "send_email" ? (
          <FormField label="Email template" required error={errors.emailTemplateId?.message}>
            <FormSelect
              {...register("emailTemplateId")}
              aria-invalid={Boolean(errors.emailTemplateId)}
            >
              <option value="">Select a template</option>
              {options.emailTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </FormSelect>
            {!options.emailTemplates.length && <NoTemplateYet kind="email" />}
          </FormField>
        ) : null}

        {actionType === "send_sms" ? (
          <FormField label="SMS template" required error={errors.smsTemplateId?.message}>
            <FormSelect {...register("smsTemplateId")} aria-invalid={Boolean(errors.smsTemplateId)}>
              <option value="">Select a template</option>
              {options.smsTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </FormSelect>
            {!options.smsTemplates.length && <NoTemplateYet kind="sms" />}
          </FormField>
        ) : null}

        {actionType === "create_task" ? (
          <FormField label="Task title" required error={errors.taskTitle?.message}>
            <Input
              {...register("taskTitle")}
              className={formInputClass}
              placeholder="e.g. Call the lead"
              aria-invalid={Boolean(errors.taskTitle)}
            />
          </FormField>
        ) : null}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Adding…" : "Add step"}
        </Button>
      </form>
    </MarketingSection>
  );
}
