"use client";
import { useState, useTransition } from "react";
import { addContactNote } from "../actions/contact.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function NoteForm({ contactId }: { contactId: string }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await addContactNote({ contactId, note, isPinned: false });
          if (r.success) setNote("");
        });
      }}
      className="flex gap-2"
    >
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        required
        placeholder="Add a note…"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <Button variant="primary" disabled={pending}>
        Add
      </Button>
    </form>
  );
}
