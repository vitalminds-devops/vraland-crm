"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button, buttonVariants, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { notify, notifyLoading } from "@/components/ui/toast";
import { manilaToday } from "@/lib/utils/manila-time";
import { documentFileError, requirementFileTypes } from "@/lib/storage/document-validation";
import { recordPayment, removePayment } from "../actions/billing.actions";
import { paymentClassificationLabels, paymentClassifications } from "../schemas/billing.schema";
import { peso } from "../lib/format";
import { PaymentMethodSelect } from "./payment-method-select";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
          <DialogPopup
            className={cn(
              "w-full max-w-md rounded-lg border bg-card p-5 text-left shadow-xl",
              className,
            )}
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
                {description && (
                  <DialogDescription className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </DialogDescription>
                )}
              </div>
              <DialogClose
                aria-label="Close"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
              >
                <X aria-hidden="true" size={16} />
              </DialogClose>
            </header>
            {children}
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

const field = "grid gap-1.5";
const fieldLabel = "text-sm font-medium";

/** Records a payment against one bill, or lets the admin pick the bill when `bills` is given. */
export function RecordPaymentButton({
  billId,
  balance,
  bills,
  size,
}: {
  billId?: string;
  balance?: string;
  bills?: { id: string; label: string; balance: string }[];
  size?: ButtonProps["size"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState(billId ?? "");
  const [method, setMethod] = useState("");
  const selectedBalance = billId ? balance : bills?.find((b) => b.id === selected)?.balance;

  return (
    <>
      <Button
        type="button"
        size={size}
        className="gap-2 whitespace-nowrap"
        onClick={() => {
          setError(undefined);
          setSelected(billId ?? "");
          setMethod("");
          setOpen(true);
        }}
      >
        <Plus aria-hidden="true" className="size-4" />
        Record payment
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Record payment"
        className="max-w-xl"
        description={selectedBalance ? `Balance: ${peso(selectedBalance)}` : undefined}
      >
        <form
          className="mt-5 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setError(undefined);
            start(async () => {
              const toastId = notifyLoading("Saving payment…", "record-payment");
              try {
                const file = form.get("transactionSlip");
                const slip = file instanceof File && file.name ? file : undefined;
                if (method === "online" && !slip) {
                  setError("Upload a transaction slip before recording the payment.");
                  notify("Transaction slip required", "error", {
                    id: toastId,
                    description: "Upload a transaction slip for this Online payment.",
                  });
                  return;
                }
                if (slip) {
                  const fileError = await documentFileError(slip, requirementFileTypes);
                  if (fileError) {
                    setError(fileError);
                    notify("Transaction slip not accepted", "error", {
                      id: toastId,
                      description: fileError,
                    });
                    return;
                  }
                }
                const result = await recordPayment(
                  {
                    billId: selected,
                    amount: form.get("amount"),
                    paidOn: form.get("paidOn"),
                    method: form.get("method"),
                    classification: form.get("classification"),
                    referenceNo: form.get("referenceNo"),
                    notes: form.get("notes"),
                  },
                  slip,
                );
                if (!result.success) {
                  setError(result.error.message);
                  notify("Payment was not saved", "error", {
                    id: toastId,
                    description: result.error.message,
                  });
                  return;
                }
                setOpen(false);
                notify(result.data.message || "Payment recorded.", "success", toastId);
                router.refresh();
              } catch {
                setError(
                  "Payment confirmation was not received. Check this bill's payments before submitting again.",
                );
                notify("Could not confirm payment", "error", {
                  id: toastId,
                  description:
                    "Check this bill's payments before submitting again. Your entries are still here.",
                });
              }
            });
          }}
        >
          {bills && (
            <label className={field}>
              <span className={fieldLabel}>Bill</span>
              <NativeSelect
                required
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
              >
                <NativeSelectOption value="" disabled>
                  {bills.length ? "Select a bill" : "No bill has a balance"}
                </NativeSelectOption>
                {bills.map((bill) => (
                  <NativeSelectOption key={bill.id} value={bill.id}>
                    {bill.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          )}
          <label className={field}>
            <span className={fieldLabel}>Payment for</span>
            <NativeSelect
              name="classification"
              required
              defaultValue=""
              onChange={(event) => {
                // A full payment is the remaining balance; fill it in.
                const amount = event.currentTarget.form?.elements.namedItem("amount");
                if (
                  event.currentTarget.value === "full_payment" &&
                  selectedBalance &&
                  amount instanceof HTMLInputElement
                )
                  amount.value = Number(selectedBalance).toFixed(2);
              }}
            >
              <NativeSelectOption value="" disabled>
                Select what this pays
              </NativeSelectOption>
              {paymentClassifications.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {paymentClassificationLabels[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={field}>
              <span className={fieldLabel}>Amount (₱)</span>
              <MoneyInput name="amount" required autoFocus placeholder="e.g. 25,000" />
            </label>
            <label className={field}>
              <span className={fieldLabel}>Date paid</span>
              <DatePicker name="paidOn" required defaultValue={manilaToday()} max={manilaToday()} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={field}>
              <span className={fieldLabel}>Method</span>
              <PaymentMethodSelect
                name="method"
                required
                value={method}
                onValueChange={setMethod}
                label="Method"
                placeholder="Select method"
                disabled={pending}
              />
            </label>
            <label className={field}>
              <span className={fieldLabel}>Invoice no.</span>
              <Input name="referenceNo" maxLength={120} placeholder="e.g. INV-0001" />
            </label>
          </div>
          {method === "online" && (
            <label className={field}>
              <span className={fieldLabel}>
                Upload transaction slip
                <span aria-hidden="true" className="ml-0.5 text-destructive">
                  *
                </span>
              </span>
              <Input
                name="transactionSlip"
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png"
                onInvalid={() =>
                  notify("Transaction slip required", "error", {
                    id: "record-payment",
                    description:
                      "Choose a PDF, JPG or PNG file up to 15 MB for this Online payment.",
                  })
                }
                disabled={pending}
                onChange={() => setError(undefined)}
              />
              <span className="text-xs text-muted-foreground">PDF, JPG or PNG · maximum 15 MB</span>
            </label>
          )}
          <label className={field}>
            <span className={fieldLabel}>Notes</span>
            <Textarea name="notes" rows={2} maxLength={2000} placeholder="Optional" />
          </label>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose className={buttonVariants({ variant: "secondary" })}>Cancel</DialogClose>
            <Button type="submit" disabled={pending || !selected}>
              {pending ? "Saving…" : "Record payment"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function RemovePaymentButton({ paymentId, amount }: { paymentId: string; amount: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${peso(amount)} payment`}
        title="Remove payment"
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
        className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Remove this payment?"
        description={`${peso(amount)} is taken off the bill.`}
      >
        {error && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose className={buttonVariants({ variant: "secondary" })}>Cancel</DialogClose>
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await removePayment({ id: paymentId });
                if (!result.success) {
                  setError(result.error.message);
                  return;
                }
                setOpen(false);
                notify("Payment removed.", "success");
                router.refresh();
              })
            }
          >
            {pending ? "Removing…" : "Remove payment"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
