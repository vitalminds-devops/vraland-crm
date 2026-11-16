"use client";

import { PipelineStageBadge } from "./pipeline-stage-badge";
import { Building2, ChevronDown, ChevronRight, Eye } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { getInitials, formatContactName } from "../lib/helpers";

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

type BrokerGroup = {
  brokerName: string;
  brokerId: string;
  contacts: Contact[];
  count: number;
};

type ContactsGroupedByBrokerProps = {
  contacts: Contact[];
};

export function ContactsGroupedByBroker({ contacts }: ContactsGroupedByBrokerProps) {
  const [expandedBrokers, setExpandedBrokers] = useState<Set<string>>(new Set());

  // Group contacts by broker
  const grouped = contacts.reduce(
    (acc, contact) => {
      const brokerName = contact.brokerFirstName
        ? `${contact.brokerFirstName} ${contact.brokerLastName}`.trim()
        : "No broker";
      const brokerId = (contact.brokerFirstName && contact.brokerUserId) || "none";

      if (!acc[brokerId]) {
        acc[brokerId] = {
          brokerName,
          brokerId: String(brokerId),
          contacts: [],
          count: 0,
        };
      }
      acc[brokerId].contacts.push(contact);
      acc[brokerId].count++;
      return acc;
    },
    {} as Record<string, BrokerGroup>,
  );

  const groups = Object.values(grouped).sort((a, b) => a.brokerName.localeCompare(b.brokerName));

  const toggleBroker = (brokerId: string) => {
    const newExpanded = new Set(expandedBrokers);
    if (newExpanded.has(brokerId)) {
      newExpanded.delete(brokerId);
    } else {
      newExpanded.add(brokerId);
    }
    setExpandedBrokers(newExpanded);
  };

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isExpanded = expandedBrokers.has(group.brokerId);
        return (
          <div key={group.brokerId} className="border border-border/50 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleBroker(group.brokerId)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{group.brokerName}</span>
                <span className="text-sm text-muted-foreground">
                  ({group.count} lead{group.count !== 1 ? "s" : ""})
                </span>
              </div>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {isExpanded && (
              <div className="divide-y divide-border/40">
                {group.contacts.map((contact) => {
                  const initials = getInitials(contact.firstName, contact.lastName);
                  const displayName = formatContactName(contact);
                  const assignedAgent = [contact.assignedFirstName, contact.assignedLastName]
                    .filter(Boolean)
                    .join(" ");
                  const broker = [contact.brokerFirstName, contact.brokerLastName]
                    .filter(Boolean)
                    .join(" ");
                  const createdDate =
                    typeof contact.createdAt === "string"
                      ? new Date(contact.createdAt)
                      : contact.createdAt;
                  const isNew =
                    !isNaN(createdDate.getTime()) &&
                    Date.now() - createdDate.getTime() < 7 * 24 * 60 * 60 * 1000;

                  return (
                    <div
                      key={contact.id}
                      className="px-4 py-3 hover:bg-muted/30 flex items-center gap-4"
                    >
                      <div className="relative shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/15">
                          {initials}
                        </div>
                        {isNew && (
                          <span className="absolute -top-1.5 -right-1.5 rounded-full bg-green-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm">
                            NEW
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/contacts/${contact.id}`}
                          className="block truncate font-medium text-foreground transition-colors hover:text-primary hover:underline"
                        >
                          {displayName}
                        </Link>
                        <div className="mt-1.5 sm:hidden" aria-label="Pipeline stage">
                          <PipelineStageBadge
                            stage={contact.pipelineStage}
                            probability={contact.stageProbability}
                          />
                        </div>
                      </div>
                      <div className="hidden lg:block text-sm text-foreground">
                        {assignedAgent || <span className="text-muted-foreground">Unassigned</span>}
                      </div>
                      <div className="hidden xl:block text-sm text-foreground">
                        {broker || <span className="text-muted-foreground">No broker</span>}
                      </div>
                      <div className="hidden sm:block" aria-label="Pipeline stage">
                        <PipelineStageBadge
                          stage={contact.pipelineStage}
                          probability={contact.stageProbability}
                        />
                      </div>
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted/60 h-8"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">View</span>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {groups.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No contacts found.</div>
      )}
    </div>
  );
}
