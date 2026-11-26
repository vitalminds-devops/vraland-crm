"use client";

import { Button } from "@/components/ui/button";

export default function ContactsError({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl p-8 text-center">
      <h2 className="text-xl font-semibold">Couldn’t load contacts</h2>
      <Button className="mt-5" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
