"use client";

import { useState, useTransition, useMemo } from "react";
import { X, AlertTriangle } from "lucide-react";
import { notify } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { reassignContactBroker } from "../actions/contact.actions";

type Broker = {
  id: string;
  firstName: string;
  lastName: string;
};

type Contact = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  mobilePhone1: string | null;
  mobilePhone2: string | null;
  mobilePhone3: string | null;
  preferredContactMethods: readonly string[];
  employmentType: string | null;
  lifecycleStage: string | null;
  pipelineStage: string | null;
  stageProbability: number | null;
  assignedFirstName: string | null;
  assignedLastName: string | null;
  brokerUserId?: string | null;
  brokerFirstName: string | null;
  brokerLastName: string | null;
  approvalStatus: string;
  createdAt: Date | string;
};

type BrokerReassignModalProps = {
  isOpen: boolean;
  onClose: () => void;
  brokers: Broker[];
  isSuperAdmin: boolean;
  selectedContactIds: string[];
  contacts: Contact[];
  isSingleContactMode?: boolean;
};

export function BrokerReassignModal({
  isOpen,
  onClose,
  brokers,
  isSuperAdmin,
  selectedContactIds,
  contacts,
  isSingleContactMode = false,
}: BrokerReassignModalProps) {
  const [pending, startTransition] = useTransition();
  const [toBrokerId, setToBrokerId] = useState("");
  const [reason, setReason] = useState("");
  const [overrideClosedWon, setOverrideClosedWon] = useState(false);
  // Get the selected contacts
  const selectedContacts = useMemo(() => {
    return contacts.filter((c) => selectedContactIds.includes(c.id));
  }, [contacts, selectedContactIds]);

  // Calculate current broker summary
  const currentBrokerSummary = useMemo(() => {
    const brokerCounts = new Map<string, number>();
    const brokerNames = new Map<string, string>();

    selectedContacts.forEach((contact) => {
      if (contact.brokerUserId) {
        brokerCounts.set(contact.brokerUserId, (brokerCounts.get(contact.brokerUserId) || 0) + 1);
        const name = `${contact.brokerFirstName || ""} ${contact.brokerLastName || ""}`.trim();
        brokerNames.set(contact.brokerUserId, name);
      }
    });

    if (brokerCounts.size === 0) {
      return "No broker assigned";
    }

    if (brokerCounts.size === 1) {
      const [brokerId] = brokerCounts.keys();
      const count = brokerCounts.get(brokerId);
      const name = brokerNames.get(brokerId) || "Unknown";
      return `Current broker: ${name} (${count} contact${count !== 1 ? "s" : ""})`;
    }

    const summary = Array.from(brokerCounts.entries())
      .map(([id, count]) => {
        const name = brokerNames.get(id) || "Unknown";
        return `${name} (${count})`;
      })
      .join(", ");

    return summary;
  }, [selectedContacts]);

  // Check if all contacts share the same broker
  const commonBrokerId = useMemo(() => {
    const uniqueBrokers = new Set(selectedContacts.map((c) => c.brokerUserId).filter(Boolean));
    return uniqueBrokers.size === 1 ? Array.from(uniqueBrokers)[0] : null;
  }, [selectedContacts]);

  // Filter brokers to exclude the common broker
  const availableBrokers = useMemo(() => {
    if (!commonBrokerId) return brokers;
    return brokers.filter((b) => b.id !== commonBrokerId);
  }, [brokers, commonBrokerId]);

  // Check if any contact would actually change
  const wouldChange = useMemo(() => {
    if (!toBrokerId) return false;
    return selectedContacts.some((c) => c.brokerUserId !== toBrokerId);
  }, [selectedContacts, toBrokerId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) {
      notify("A reason is required.", "error");
      return;
    }

    if (!toBrokerId) {
      notify("Select a broker.", "error");
      return;
    }

    if (!wouldChange) {
      notify("Already on this broker.", "error");
      return;
    }

    startTransition(async () => {
      const result = await reassignContactBroker({
        contactIds: selectedContactIds,
        toBrokerUserId: toBrokerId,
        reason: reason.trim(),
        overrideClosedWon: isSuperAdmin && overrideClosedWon,
      });

      if (result.success) {
        notify(result.data.message, "success");
        onClose();
        setReason("");
        setToBrokerId("");
        setOverrideClosedWon(false);
      } else {
        notify(result.error.message, "error");
      }
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <DialogPopup
            aria-describedby={undefined}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-gray-900"
          >
            <div className="mb-4 flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold">
                {isSingleContactMode
                  ? "Reassign contact"
                  : `Reassign ${selectedContactIds.length} contact(s)`}
              </DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="size-auto rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Current brokers
                </label>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {currentBrokerSummary}
                </p>
              </div>

              <div>
                <Label htmlFor="toBroker" className="block text-sm font-medium">
                  To Broker <span className="text-red-500">*</span>
                </Label>
                <NativeSelect
                  id="toBroker"
                  value={toBrokerId}
                  onChange={(e) => setToBrokerId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-800"
                >
                  <NativeSelectOption value="">Select target broker</NativeSelectOption>
                  {availableBrokers.map((broker) => (
                    <NativeSelectOption key={broker.id} value={broker.id}>
                      {broker.firstName} {broker.lastName}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div>
                <Label htmlFor="reason" className="block text-sm font-medium">
                  Reason <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  required
                  placeholder="Reason"
                  className="mt-1 w-full rounded-md border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-800"
                />
              </div>

              {isSuperAdmin && (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="override"
                    checked={overrideClosedWon}
                    onCheckedChange={(v) => setOverrideClosedWon(v === true)}
                    className="rounded border-gray-300 mt-0.5"
                  />
                  <Label htmlFor="override" className="text-sm">
                    Override the lock on won sales
                  </Label>
                </div>
              )}

              {overrideClosedWon && (
                <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 dark:bg-amber-900/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    This affects commission history.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                  disabled={pending}
                  className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={pending || !wouldChange}
                  className="rounded-md bg-primary px-4 py-2 text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {pending ? "Reassigning..." : "Reassign"}
                </Button>
              </div>
            </form>
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
