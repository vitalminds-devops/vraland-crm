"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/components/ui/toast";
import { groupDigits } from "@/lib/utils/group-digits";
import { manilaDate } from "@/lib/utils/manila-time";
import { saveBill } from "../actions/billing.actions";
import { peso } from "../lib/format";
import { Modal } from "./payment-dialogs";
import type { BillLine } from "../queries/billing.queries";
import { billApplicantSchema, type BillApplicant } from "../schemas/bill-applicant.schema";
import { applicantAge, applicantFields } from "../lib/bill-applicant";

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
      className="@container grid min-w-0 gap-4"
      onInvalidCapture={(event) => {
        const details = (event.target as HTMLElement).closest("details");
        if (details) details.open = true;
      }}
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
      <div>
        <h3 className="font-semibold">Bill items</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Enter the price and miscellaneous fee for each unit in pesos. Leave the fee blank if there
          is none.
        </p>
      </div>
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
          <div className="grid gap-3 @min-[32rem]:grid-cols-2">
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-3 text-sm">
        <span className="font-medium">Bill total</span>
        <span className="font-semibold tabular-nums">{peso(total)}</span>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Unit prices − reservation discount + miscellaneous fees.
      </p>
      <details className="border-t pt-4" aria-label="Bill applicant details">
        <summary className="cursor-pointer rounded-sm text-sm marker:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          <span className="font-semibold">Review applicant details</span>
          <span className="mt-1 block leading-relaxed text-muted-foreground">
            Prefilled from the contact. Expand to review or update the details for this bill.
          </span>
        </summary>
        <fieldset className="mt-4 min-w-0 rounded-xl border p-4 @min-[32rem]:p-5">
          <legend className="px-2 text-sm font-semibold">Applicant Information</legend>
          <div className="grid gap-5 @min-[32rem]:grid-cols-2 @min-[48rem]:grid-cols-3">
            {applicantFields.map((field) => (
              <label
                key={field.key}
                className={`flex min-w-0 flex-col gap-2 text-sm ${field.wide ? "col-span-full" : ""}`}
              >
                <span className="flex-1 font-medium leading-5">{field.label}</span>
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
                    value={field.grouped ? groupDigits(applicant[field.key]) : applicant[field.key]}
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
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              <span className="flex-1 font-medium leading-5">Age</span>
              <Input
                readOnly
                className="bg-muted/50 text-muted-foreground shadow-none tabular-nums"
                value={applicantAge(applicant.birthDate, asOf)}
                placeholder="Calculated from birth date"
              />
            </label>
          </div>
        </fieldset>
      </details>
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
        <Button type="submit" disabled={pending} className="w-full @min-[32rem]:w-auto">
          {pending ? "Saving…" : "Save bill"}
        </Button>
      </div>
    </form>
  );
}
