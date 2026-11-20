"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

type Person = { id: string; firstName: string; lastName: string | null };

const personName = (person: Person) => `${person.firstName} ${person.lastName ?? ""}`.trim();

/**
 * Who an event is for: chosen people, everyone, or (nobody chosen) only you. Submits
 * `inviteeUserIds` per person, or `inviteEveryone`, plus `invitePicker` so an edit can tell
 * "nobody chosen" apart from "couldn't choose".
 */
export function InvitePicker({
  people,
  canInviteEveryone,
  defaultIds = [],
}: {
  people: Person[];
  canInviteEveryone: boolean;
  defaultIds?: string[];
}) {
  const [everyone, setEveryone] = useState(false);
  const [selected, setSelected] = useState<string[]>(defaultIds);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const shown = people.filter((person) => personName(person).toLowerCase().includes(query));
  const byId = new Map(people.map((person) => [person.id, person]));
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="grid gap-2">
      <input type="hidden" name="invitePicker" value="1" />
      {everyone ? (
        <input type="hidden" name="inviteEveryone" value="on" />
      ) : (
        selected.map((id) => <input key={id} type="hidden" name="inviteeUserIds" value={id} />)
      )}
      {canInviteEveryone ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={everyone}
            onChange={(event) => setEveryone(event.target.checked)}
            className="size-4 accent-primary"
          />
          Everyone
        </label>
      ) : null}
      {everyone || !people.length ? null : (
        <>
          {selected.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Invited">
              {selected.map((id) => {
                const name = byId.get(id) ? personName(byId.get(id)!) : "Former user";
                return (
                  <li
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {name}
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => toggle(id)}
                      className="grid size-4 place-content-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <X aria-hidden="true" className="size-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Only me</p>
          )}
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name"
            aria-label="Search people to invite"
          />
          <ul className="max-h-36 divide-y divide-border/50 overflow-y-auto rounded-md border border-border/60">
            {shown.map((person) => (
              <li key={person.id}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={selected.includes(person.id)}
                    onChange={() => toggle(person.id)}
                    className="size-4 accent-primary"
                  />
                  {personName(person)}
                </label>
              </li>
            ))}
            {shown.length ? null : (
              <li className="px-3 py-2 text-xs text-muted-foreground">No one matches.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
