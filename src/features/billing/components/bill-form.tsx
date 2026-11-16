"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify } from "@/components/ui/toast";
import { groupDigits } from "@/lib/utils/group-digits";
import { manilaDate } from "@/lib/utils/manila-time";
import { saveBill } from "../actions/billing.actions";
import { peso } from "../lib/format";
import { Modal } from "./payment-dialogs";
import type { BillLine } from "../queries/billing.queries";
import { billApplicantSchema, type BillApplicant } from "../schemas/bill-applicant.schema";
import {
  applicantAge,
  applicantSections,
  applicantSectionApplies,
  applicantTypeLabels,
} from "../lib/bill-applicant";

const emptyLine: BillLine = { unitLabel: "", unitPrice: "", miscellaneousFee: "" };

/** One line per unit; a lead buying two units is billed for both here. */
type BillInitial = {
  lines: BillLine[];
  reservationDiscount: string;
  notes: string;
  applicantDetails?: BillApplicant;
  applicantAsOf?: string;
};

/** Opens the bill form in a dialog, for a bill that already exists. */
export function EditBillButton({
  dealId,
  initial,
  priceLocked = false,
}: {
  dealId: string;
  initial: BillInitial;
  /** A won deal's price is fixed: its commissions were split from it. */
  priceLocked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Pencil aria-hidden="true" className="size-3.5" /> Edit bill
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Edit bill"
        className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto"
      >
        <div className="mt-4">
          <BillForm
            dealId={dealId}
            initial={initial}
            priceLocked={priceLocked}
            onSaved={() => setOpen(false)}
          />
        </div>
      </Modal>
    </>
  );
}

export function BillForm({
  dealId,
  initial,
  onSaved,
  priceLocked = false,
}: {
  dealId: string;
  initial: BillInitial;
  onSaved?: () => void;
  priceLocked?: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initial.lines.length ? initial.lines : [emptyLine]);
  const [reservationDiscount, setReservationDiscount] = useState(initial.reservationDiscount);
  const [notes, setNotes] = useState(initial.notes);
  const [applicant, setApplicant] = useState(
    () => initial.applicantDetails ?? billApplicantSchema.parse({}),
  );
  const asOf = initial.applicantAsOf ?? manilaDate();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const setLine = (index: number, key: keyof BillLine) => (event: { target: { value: string } }) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, [key]: event.target.value } : line)),
    );
  const total = lines.reduce(
    (sum, line) => sum + (Number(line.unitPrice) || 0) + (Number(line.miscellaneousFee) || 0),
    -(Number(reservationDiscount) || 0),
  );

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(undefined);
        start(async () => {
          const result = await saveBill({
            dealId,
            items: lines.map((line) => ({
              ...line,
              miscellaneousFee: line.miscellaneousFee || 0,
            })),
            reservationDiscount: reservationDiscount || 0,
            notes,
            applicantDetails: applicant,
          });
          if (!result.success) {
            setError(result.error.message);
            return;
          }
          notify("Bill saved.", "success");
          onSaved?.();
          router.refresh();
        });
      }}
    >
      <section className="space-y-4" aria-label="Bill applicant details">
        <div>
          <h3 className="font-semibold">Applicant details</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Prefilled from the client. Review and complete the details for this bill.
          </p>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Applicant type
          <NativeSelect
            aria-label="Applicant type"
            value={applicant.applicantType}
            onChange={(event) =>
              setApplicant({
                ...applicant,
                applicantType: event.target.value as BillApplicant["applicantType"],
              })
            }
          >
            {Object.entries(applicantTypeLabels).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        {applicantSections.map(
          (section, index) =>
            applicantSectionApplies(index, applicant.applicantType) && (
              <fieldset key={section.title} className="rounded-xl border p-4">
                <legend className="px-1 text-sm font-semibold">{section.title}</legend>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.fields.map((field) => (
                    <label
                      key={field.key}
                      className={`grid content-start gap-1.5 text-sm ${field.wide ? "sm:col-span-2 lg:col-span-3" : ""}`}
                    >
                      <span className="font-medium">{field.label}</span>
                      {field.wide ? (
                        <Textarea
                          rows={2}
                          maxLength={1000}
                          value={applicant[field.key]}
                          onChange={(event) =>
                            setApplicant({ ...applicant, [field.key]: event.target.value })
                          }
                        />
                      ) : (
                        <Input
                          type={field.type ?? "text"}
                          maxLength={255}
                          inputMode={field.grouped ? "numeric" : undefined}
                          value={
                            field.grouped ? groupDigits(applicant[field.key]) : applicant[field.key]
                          }
                          onChange={(event) =>
                            setApplicant({
                              ...applicant,
                              [field.key]: field.grouped
                                ? groupDigits(event.target.value)
                                : event.target.value,
                            })
                          }
                        />
                      )}
                    </label>
                  ))}
                  {index === 0 && (
                    <label className="grid content-start gap-1.5 text-sm">
                      <span className="font-medium">Age</span>
                      <Input
                        readOnly
                        value={applicantAge(applicant.birthDate, asOf)}
                        placeholder="Calculated from birth date"
                      />
                    </label>
                  )}
                </div>
              </fieldset>
            ),
        )}
      </section>
      <h3 className="mt-2 font-semibold">Bill items</h3>
      {lines.map((line, index) => (
        <fieldset
          key={index}
          className="grid gap-3 rounded-lg border p-3"
          aria-label={`Unit ${index + 1}`}
        >
          <div className="flex items-end gap-2">
            <label className="grid flex-1 gap-1.5">
              <span className="text-sm font-medium">
                {lines.length > 1 ? `Unit ${index + 1}` : "Unit"}
              </span>
              <Input
                required
                maxLength={220}
                value={line.unitLabel}
                onChange={setLine(index, "unitLabel")}
                placeholder="e.g. Unit 205 · Tower 1 · Fairfield Heights"
              />
            </label>
            {lines.length > 1 && !priceLocked && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove unit ${index + 1}`}
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Unit price (₱)</span>
              <MoneyInput
                required
                disabled={priceLocked}
                value={line.unitPrice}
                onValueChange={(value) => setLine(index, "unitPrice")({ target: { value } })}
                placeholder="e.g. 2,300,000"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Miscellaneous fee (₱)</span>
              <MoneyInput
                value={line.miscellaneousFee}
                onValueChange={(value) => setLine(index, "miscellaneousFee")({ target: { value } })}
                placeholder="e.g. 161,000"
              />
            </label>
          </div>
        </fieldset>
      ))}
      {priceLocked ? (
        <p className="text-xs text-muted-foreground">Won deal: price and discount are locked.</p>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="justify-self-start"
          onClick={() => setLines((current) => [...current, emptyLine])}
        >
          <Plus className="size-4" /> Add unit
        </Button>
      )}
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Reservation discount (₱)</span>
        <MoneyInput
          disabled={priceLocked}
          value={reservationDiscount}
          onValueChange={setReservationDiscount}
          placeholder="0"
        />
      </label>
      <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-sm">
        <span className="font-medium">Total net selling price</span>
        <span className="font-semibold tabular-nums">{peso(total)}</span>
      </div>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Notes</span>
        <Textarea
          rows={2}
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save bill"}
        </Button>
      </div>
    </form>
  );
}
