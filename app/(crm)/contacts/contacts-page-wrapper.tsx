"use client";

import { useState } from "react";
import { ContactsPageClient } from "./contacts-page-client";
import { ContactFilters } from "@/features/contacts";
import { CardToolbar, CardContent } from "@/components/ui/card";

type ContactsPageWrapperProps = {
  data: {
    rows: Array<{
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
      contactCode?: string;
    }>;
    total: number;
    page: number;
    pages: number;
  };
  brokers: { id: string; firstName: string; lastName: string }[];
  canCreate: boolean;
  canEdit: boolean;
  canViewDocuments: boolean;
  canArchive: boolean;
  canReassign: boolean;
  /** Super administrators may override the lock on won sales. */
  isSuperAdmin: boolean;
  search?: string;
  lifecycle?: string;
  employment?: string;
  broker?: string;
  preservedQuery?: string;
};

export function ContactsPageWrapper({
  data,
  brokers,
  canCreate,
  canEdit,
  canViewDocuments,
  canArchive,
  canReassign,
  isSuperAdmin,
  search,
  lifecycle,
  employment,
  broker,
  preservedQuery,
}: ContactsPageWrapperProps) {
  const [viewMode, setViewMode] = useState<"table" | "grouped">("table");

  return (
    <>
      <CardToolbar>
        <ContactFilters
          search={search}
          lifecycle={lifecycle}
          employment={employment}
          broker={broker}
          brokers={brokers}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          preservedQuery={preservedQuery}
        />
      </CardToolbar>
      <CardContent className="p-0">
        <ContactsPageClient
          data={data}
          brokers={brokers}
          canCreate={canCreate}
          canEdit={canEdit}
          canViewDocuments={canViewDocuments}
          canArchive={canArchive}
          canReassign={canReassign}
          isSuperAdmin={isSuperAdmin}
          viewMode={viewMode}
        />
      </CardContent>
    </>
  );
}
