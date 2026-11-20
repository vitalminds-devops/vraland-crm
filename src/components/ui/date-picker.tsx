"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { inputClass } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { manilaDateTimeLocal } from "@/lib/utils/manila-time";

/** Manila's wall-clock now, in the same local-time form the picker uses for every date. */
const manilaNow = () => new Date(manilaDateTimeLocal(new Date()));

type DatePickerProps = Omit<React.ComponentProps<"input">, "type"> & {
  type?: "date" | "datetime-local";
};

const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const months = Array.from({ length: 12 }, (_, month) => format(new Date(2000, month, 1), "MMMM"));
const hours = Array.from({ length: 12 }, (_, index) => index + 1);
const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
const day = (date: Date) => format(date, "yyyy-MM-dd");

function parse(value: string) {
  const date = value ? parseISO(value) : null;
  return date && isValid(date) ? date : null;
}

/** Sets the real input's value the way typing would, so React's onChange and form libraries see it. */
function setNativeValue(input: HTMLInputElement, next: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * A calendar popover in place of the browser's date field. A hidden native input keeps the
 * `yyyy-MM-dd` (or `yyyy-MM-ddTHH:mm`) value, so forms, `register()` and FormData work unchanged.
 */
export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  {
    type = "date",
    className,
    value,
    defaultValue,
    min,
    max,
    required,
    disabled,
    placeholder,
    id,
    onBlur,
    "aria-invalid": ariaInvalid,
    ...props
  },
  ref,
) {
  const withTime = type === "datetime-local";
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const valueId = React.useId();
  // Inside a <label> the shown date would become part of the field's name ("Starts Jan 1, 2030"), so
  // there it is hidden from the name and read as the description instead. Without a label it stays the name.
  const setTriggerRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      if (node?.closest("label"))
        node.ownerDocument.getElementById(valueId)?.setAttribute("aria-hidden", "true");
    },
    [valueId],
  );
  const [stored, setStored] = React.useState(String(defaultValue ?? ""));
  const current = value === undefined ? stored : String(value ?? "");
  const selected = parse(current);
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(() => startOfMonth(selected ?? manilaNow()));

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  // register() and form resets write the input directly, without an event.
  const readInput = React.useCallback(() => {
    if (inputRef.current) setStored(inputRef.current.value);
  }, []);
  React.useEffect(() => {
    readInput();
    const form = inputRef.current?.form;
    const onReset = () => setTimeout(readInput);
    form?.addEventListener("reset", onReset);
    return () => form?.removeEventListener("reset", onReset);
  }, [readInput]);

  function commit(next: string) {
    if (!inputRef.current) return;
    setNativeValue(inputRef.current, next);
    setStored(next);
  }

  function openChange(next: boolean) {
    if (next) {
      readInput();
      setMonth(startOfMonth(parse(inputRef.current?.value ?? "") ?? manilaNow()));
    } else {
      inputRef.current?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    }
    setOpen(next);
  }

  const time = selected && withTime ? format(selected, "HH:mm") : "09:00";
  function pickDay(date: Date) {
    commit(withTime ? `${day(date)}T${time}` : day(date));
    if (!withTime) openChange(false);
  }
  function pickTime(hour12: number, minute: number, pm: boolean) {
    const hour = (hour12 % 12) + (pm ? 12 : 0);
    const base = selected ?? manilaNow();
    commit(`${day(base)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }

  const minDay = min ? String(min).slice(0, 10) : null;
  const maxDay = max ? String(max).slice(0, 10) : null;
  const outOfRange = (date: Date) =>
    (minDay !== null && day(date) < minDay) || (maxDay !== null && day(date) > maxDay);
  const thisYear = manilaNow().getFullYear();
  const firstYear = minDay ? Number(minDay.slice(0, 4)) : thisYear - 100;
  const lastYear = maxDay ? Number(maxDay.slice(0, 4)) : thisYear + 15;
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => lastYear - index);
  const gridStart = startOfWeek(month);
  const cells = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const today = day(manilaNow());
  const hour = selected ? Number(format(selected, "h")) : 9;
  const minute = selected ? selected.getMinutes() : 0;
  const pm = selected ? selected.getHours() >= 12 : false;

  const select =
    "h-8 rounded-md border border-border/60 bg-background px-1.5 text-sm font-medium outline-none hover:border-border focus-visible:ring-2 focus-visible:ring-ring/30";

  return (
    <Popover.Root open={open} onOpenChange={openChange}>
      <div className="relative w-full">
        <Popover.Trigger asChild>
          <button
            ref={setTriggerRef}
            id={id}
            type="button"
            aria-describedby={valueId}
            disabled={disabled}
            data-invalid={ariaInvalid ? true : undefined}
            className={cn(
              inputClass,
              "items-center gap-2 text-left data-[invalid]:border-destructive data-[invalid]:ring-destructive/20 data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/20",
              className,
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span id={valueId} className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected
                ? format(selected, withTime ? "MMM d, yyyy · h:mm a" : "MMM d, yyyy")
                : (placeholder ?? (withTime ? "Select date and time" : "Select date"))}
            </span>
          </button>
        </Popover.Trigger>
        <input
          {...props}
          ref={setRefs}
          type={type}
          value={value}
          defaultValue={defaultValue}
          min={min}
          max={max}
          required={required}
          disabled={disabled}
          onBlur={onBlur}
          tabIndex={-1}
          aria-hidden
          // Kept in the layout (not display:none) so a "required" warning points at the field.
          className="pointer-events-none absolute inset-0 -z-10 opacity-0"
          onFocus={() => triggerRef.current?.focus()}
        />
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          // Scrolls when the screen is too short, so the time controls and Done stay reachable.
          className="z-50 max-h-[var(--radix-popover-content-available-height)] w-[296px] overflow-y-auto rounded-xl border border-border/60 bg-popover p-3 text-popover-foreground shadow-lg outline-none"
        >
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(addMonths(month, -1))}
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <select
              aria-label="Month"
              value={month.getMonth()}
              onChange={(event) =>
                setMonth(new Date(month.getFullYear(), Number(event.target.value), 1))
              }
              className={cn(select, "flex-1")}
            >
              {months.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={month.getFullYear()}
              onChange={(event) =>
                setMonth(new Date(Number(event.target.value), month.getMonth(), 1))
              }
              className={select}
            >
              {!years.includes(month.getFullYear()) && <option>{month.getFullYear()}</option>}
              {years.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(addMonths(month, 1))}
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
            {weekdays.map((name) => (
              <span key={name} className="py-1">
                {name}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((date) => {
              const key = day(date);
              const isSelected = selected !== null && key === day(selected);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={outOfRange(date)}
                  aria-label={format(date, "EEEE, MMMM d, yyyy")}
                  aria-pressed={isSelected}
                  onClick={() => pickDay(date)}
                  className={cn(
                    "grid h-9 place-items-center rounded-lg text-sm tabular-nums transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30",
                    !isSameMonth(date, month) && "text-muted-foreground/60",
                    key === today &&
                      !isSelected &&
                      "font-semibold text-primary ring-1 ring-primary/30",
                    isSelected &&
                      "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          {withTime && (
            <div className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-3">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              <select
                aria-label="Hour"
                value={hour}
                onChange={(event) => pickTime(Number(event.target.value), minute, pm)}
                className={select}
              >
                {hours.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <span className="text-muted-foreground">:</span>
              <select
                aria-label="Minute"
                value={minute}
                onChange={(event) => pickTime(hour, Number(event.target.value), pm)}
                className={select}
              >
                {!minutes.includes(minute) && <option value={minute}>{minute}</option>}
                {minutes.map((value) => (
                  <option key={value} value={value}>
                    {String(value).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <select
                aria-label="AM or PM"
                value={pm ? "PM" : "AM"}
                onChange={(event) => pickTime(hour, minute, event.target.value === "PM")}
                className={select}
              >
                <option>AM</option>
                <option>PM</option>
              </select>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
            <div className="flex gap-1">
              {!outOfRange(manilaNow()) && (
                <button
                  type="button"
                  onClick={() => pickDay(manilaNow())}
                  className="h-8 rounded-md px-2.5 text-sm font-medium text-primary hover:bg-primary/10"
                >
                  Today
                </button>
              )}
              {!required && current && (
                <button
                  type="button"
                  onClick={() => {
                    commit("");
                    openChange(false);
                  }}
                  className="h-8 rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            {withTime && (
              <button
                type="button"
                onClick={() => openChange(false)}
                className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Done
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
