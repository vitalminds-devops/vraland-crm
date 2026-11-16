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
  canEdit: boolean;
  canViewDocuments: boolean;
  canArchive: boolean;
  isSuperAdmin: boolean;
  viewMode?: "table" | "grouped";
};

export function ContactsPageClient({
  data,
  brokers,
  canEdit,
  canViewDocuments,
  canArchive,
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
          canEdit={canEdit}
          canViewDocuments={canViewDocuments}
          canArchive={canArchive}
          canReassign={isSuperAdmin}
          onReassignBroker={handleSingleContactReassign}
          isSuperAdmin={isSuperAdmin}
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
