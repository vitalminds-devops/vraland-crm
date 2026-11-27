"use client";

import { Input } from "@/components/ui/input";
import { PaymentMethodSelect } from "@/features/billing/components/payment-method-select";
import { bankOptions } from "@/features/contacts/lib/contact-options";

import type { OpportunityDraft } from "../queries/opportunity.queries";
import { Field, fieldClass } from "./opportunity-field";

/** How the contact will pay, with the bank or other method when one is needed. */
export function OpportunityFinancingFields({
  active,
  draft,
  restoredFields,
  financing,
  onFinancingChange,
  disabled,
}: {
  active: boolean;
  draft: OpportunityDraft;
  restoredFields: Record<string, string>;
  financing: string;
  onFinancingChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Financing" required>
        <PaymentMethodSelect
          required={active}
          name="financingPreference"
          value={financing}
          onValueChange={onFinancingChange}
          disabled={disabled}
        />
      </Field>
      {financing === "bank_financing" && (
        <Field label="Bank" required>
          <Input
            required={active}
            name="bankName"
            list="opportunity-banks"
            defaultValue={restoredFields.bankName ?? draft.bankName}
            placeholder="e.g. BDO Unibank"
            className={fieldClass}
          />
          <datalist id="opportunity-banks">
            {bankOptions.map((bank) => (
              <option key={bank} value={bank} />
            ))}
          </datalist>
        </Field>
      )}
      {financing === "other" && (
        <Field label="Other financing" required>
          <Input
            required={active}
            name="financingPreferenceOther"
            defaultValue={restoredFields.financingPreferenceOther ?? draft.financingPreferenceOther}
            className={fieldClass}
          />
        </Field>
      )}
    </div>
  );
}
