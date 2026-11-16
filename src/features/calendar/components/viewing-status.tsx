"use client";
import { useState, useTransition } from "react";
import { updateViewingStatus } from "../actions/calendar.actions";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
export function ViewingStatus({
  id,
  status,
  feedback,
  interestLevel,
}: {
  id: string;
  status: string;
  feedback: string | null;
  interestLevel: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <>
      <Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => setOpen(!open)}>
        Update
      </Button>
      {open && (
        <form
          className="mt-3 grid gap-2 rounded-lg bg-muted/50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await updateViewingStatus({
                id,
                status: f.get("status"),
                feedback: f.get("feedback"),
                interestLevel: f.get("interestLevel"),
              });
              if (r.success) setOpen(false);
              else setMessage(r.error.message);
            });
          }}
        >
          <NativeSelect name="status" defaultValue={status} className={input + " pr-9"}>
            {["scheduled", "confirmed", "completed", "cancelled", "no_show", "rescheduled"].map(
              (v) => (
                <NativeSelectOption key={v} value={v}>
                  {v.replaceAll("_", " ")}
                </NativeSelectOption>
              ),
            )}
          </NativeSelect>
          <NativeSelect
            name="interestLevel"
            defaultValue={interestLevel ?? ""}
            className={input + " pr-9"}
          >
            <NativeSelectOption value="">Interest not rated</NativeSelectOption>
            {[1, 2, 3, 4, 5].map((v) => (
              <NativeSelectOption key={v} value={v}>
                {v} / 5
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Textarea
            name="feedback"
            defaultValue={feedback ?? ""}
            placeholder="Outcome or feedback"
            className={input}
          />
          {message && <p className="text-xs text-red-600">{message}</p>}
          <Button type="submit" variant="primary" className="h-8 px-2 text-xs" disabled={pending}>
            {pending ? "Saving…" : "Save update"}
          </Button>
        </form>
      )}
    </>
  );
}
const input = "rounded-md border bg-background px-2 py-1.5 text-xs";
