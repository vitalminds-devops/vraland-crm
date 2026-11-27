"use client";

import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  budgetRanges,
  employmentTypes,
  purchaseTypeLabels,
  purchaseTypes,
} from "@/features/contacts/lib/contact-options";
import { cn } from "@/lib/utils/cn";

import type { OpportunityDraft } from "../queries/opportunity.queries";
import { Field, fieldClass } from "./opportunity-field";

/** Step 3 of Move to Opportunity: the contact's budget and property interest. */
export function OpportunityInterestStep({
  active,
  draft,
  restoredFields,
  budget,
  onBudgetChange,
}: {
  active: boolean;
  draft: OpportunityDraft;
  restoredFields: Record<string, string>;
  budget: string;
  onBudgetChange: (value: string) => void;
}) {
  return (
    <div className={cn("grid gap-4", !active && "hidden")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Budget range" required>
          <NativeSelect
            required={active}
            value={budget}
            onChange={(event) => onBudgetChange(event.target.value)}
          >
            <NativeSelectOption value="">Select budget</NativeSelectOption>
            {budgetRanges.map((range) => (
              <NativeSelectOption key={range.value} value={range.value}>
                {range.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Property type">
          <NativeSelect
            name="purchaseType"
            defaultValue={restoredFields.purchaseType ?? draft.interest.purchaseType ?? ""}
          >
            <NativeSelectOption value="">Not specified</NativeSelectOption>
            {purchaseTypes.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {purchaseTypeLabels[type]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Employment">
          <NativeSelect
            name="employmentType"
            defaultValue={restoredFields.employmentType ?? draft.interest.employmentType ?? ""}
          >
            <NativeSelectOption value="">Not specified</NativeSelectOption>
            {employmentTypes.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {type}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Annual income">
          <MoneyInput
            name="annualIncome"
            defaultValue={restoredFields.annualIncome ?? draft.interest.annualIncome}
            className={fieldClass}
          />
        </Field>
      </div>
    </div>
  );
}
