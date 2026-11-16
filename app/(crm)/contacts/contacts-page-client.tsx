"use client";

import { useState } from "react";
import { ContactsTable, ContactsGroupedByBroker, BrokerReassignModal } from "@/features/contacts";

type ContactsPageClientProps = {
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
  viewMode?: "table" | "grouped";
};

export function ContactsPageClient({
  data,
  brokers,
  canCreate,
  canEdit,
  canViewDocuments,
  canArchive,
  canReassign,
  isSuperAdmin,
  viewMode = "table",
}: ContactsPageClientProps) {
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const handleSingleContactReassign = (contactId: string) => {
    setSelectedContactId(contactId);
    setShowReassignModal(true);
  };

  return (
    <>
      {viewMode === "table" ? (
        <ContactsTable
          contacts={data.rows}
          total={data.total}
          page={data.page}
          pages={data.pages}
          pageSize={20}
          canCreate={canCreate}
          canEdit={canEdit}
          canViewDocuments={canViewDocuments}
          canArchive={canArchive}
          canReassign={canReassign}
          onReassignBroker={handleSingleContactReassign}
        />
      ) : (
        <ContactsGroupedByBroker contacts={data.rows} />
      )}

      <BrokerReassignModal
        isOpen={showReassignModal}
        onClose={() => {
          setShowReassignModal(false);
          setSelectedContactId(null);
        }}
        brokers={brokers}
        isSuperAdmin={isSuperAdmin}
        selectedContactIds={selectedContactId ? [selectedContactId] : []}
        contacts={data.rows}
        isSingleContactMode={true}
      />
    </>
  );
}
