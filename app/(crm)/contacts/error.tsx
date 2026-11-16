"use client";

import { Button } from "@/components/ui/button";

export default function ContactsError({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl p-8 text-center">
      <h2 className="text-xl font-semibold">Contacts could not be loaded.</h2>
      <Button className="mt-5" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
