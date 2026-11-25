"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { manilaDateTimeLocal } from "@/lib/utils/manila-time";

import { createTask, deleteTask, updateTask } from "../actions/task.actions";
import { TASK_PRIORITIES, TASK_TYPES, taskTypeLabel, titleCase } from "../lib/task-options";
import { taskSchema, type TaskInput } from "../schemas/task.schema";
import type { TaskRow } from "./tasks-table";

type Person = { id: string; firstName: string; lastName: string | null };
/** Keeps a task's current link selectable when it falls outside the capped option list. */
function withCurrent<T extends { id: string }>(list: T[], current: T | null): T[] {
  return current && !list.some((item) => item.id === current.id) ? [current, ...list] : list;
}

export function TaskForm({
  options,
  task,
  canDelete = false,
}: {
  /** Edits this task instead of creating one. */
  task?: TaskRow;
  canDelete?: boolean;
  options: {
    agents: Person[];
  };
}) {
  const [open, setOpen] = useState(false);
  const agents = withCurrent(
    options.agents,
    task?.assignedUserId
      ? {
          id: task.assignedUserId,
          firstName: task.assignedFirstName ?? "",
          lastName: task.assignedLastName,
        }
      : null,
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TaskInput>({
    resolver: zodResolver(taskSchema) as never,
    defaultValues: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      taskType: (task?.taskType ?? "follow_up") as TaskInput["taskType"],
      priority: (task?.priority ?? "medium") as TaskInput["priority"],
      assignedUserId: task?.assignedUserId ?? "",
      contactId: task?.contactId ?? "",
      propertyId: task?.propertyId ?? "",
      dealId: task?.dealId ?? "",
      dueAt: task?.dueAt ? manilaDateTimeLocal(task.dueAt) : "",
      reminderAt: task?.reminderAt ? manilaDateTimeLocal(task.reminderAt) : "",
    },
  });

  const submit = (values: TaskInput) =>
    startTransition(async () => {
      const result = task ? await updateTask(task.id, values) : await createTask(values);
      if (result.success) {
        if (!task) reset();
        setOpen(false);
        notify(task ? "Task saved." : "Task created.", "success");
      } else {
        notify(result.error.message, "error");
      }
    });

  const remove = () => {
    if (!task || !window.confirm(`Delete "${task.title}"?`)) return;
    startTransition(async () => {
      const result = await deleteTask(task.id);
      if (!result.success) {
        notify(result.error.message, "error");
        return;
      }
      setOpen(false);
      notify("Task deleted.", "success");
      router.refresh();
    });
  };

  return (
    <>
      {task ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${task.title}`}
          title={`Edit ${task.title}`}
          onClick={() => setOpen(true)}
        >
          <Pencil aria-hidden="true" className="size-4" />
        </Button>
      ) : (
        <Button variant="primary" className="gap-2" onClick={() => setOpen(true)}>
          <Plus aria-hidden="true" className="size-4" />
          New task
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
            <DialogPopup asChild>
              <form
                onSubmit={handleSubmit(submit)}
                className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl"
              >
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/50 p-4 sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                    >
                      {task ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                    </span>
                    <div className="min-w-0">
                      <DialogTitle className="text-base font-semibold text-foreground">
                        {task ? "Edit task" : "Create task"}
                      </DialogTitle>
                      <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
                        {task
                          ? "Update the task details, assignee or timing."
                          : "Give your task a title, then choose who will do it."}
                      </DialogDescription>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border/60 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:outline-none"
                  >
                    <X aria-hidden="true" size={16} />
                  </Button>
                </header>

                <div className="grid min-h-0 gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:p-5">
                  <Field label="Title" error={errors.title?.message} className="sm:col-span-2">
                    <Input
                      {...register("title")}
                      autoFocus
                      placeholder="What needs to happen?"
                      maxLength={220}
                      aria-invalid={Boolean(errors.title)}
                    />
                  </Field>

                  <Field label="Type">
                    <NativeSelect {...register("taskType")}>
                      {TASK_TYPES.map((type) => (
                        <NativeSelectOption key={type} value={type}>
                          {taskTypeLabel(type)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Priority">
                    <NativeSelect {...register("priority")}>
                      {TASK_PRIORITIES.map((priority) => (
                        <NativeSelectOption key={priority} value={priority}>
                          {titleCase(priority)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Assignee" className="sm:col-span-2">
                    <NativeSelect {...register("assignedUserId")}>
                      <NativeSelectOption value="">Assign to me</NativeSelectOption>
                      {agents.map((agent) => (
                        <NativeSelectOption key={agent.id} value={agent.id}>
                          {`${agent.firstName} ${agent.lastName ?? ""}`.trim()}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Due date (optional)" error={errors.dueAt?.message}>
                    <DatePicker
                      type="datetime-local"
                      {...register("dueAt")}
                      aria-invalid={Boolean(errors.dueAt)}
                    />
                  </Field>

                  <Field label="Reminder (optional)" error={errors.reminderAt?.message}>
                    <DatePicker
                      type="datetime-local"
                      {...register("reminderAt")}
                      aria-invalid={Boolean(errors.reminderAt)}
                    />
                  </Field>
                  <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">
                    Dates and times use Philippine time (UTC+8).
                  </p>

                  <Field
                    label="Description (optional)"
                    error={errors.description?.message}
                    className="sm:col-span-2"
                  >
                    <Textarea
                      {...register("description")}
                      rows={3}
                      placeholder="Add context or instructions for this task"
                      maxLength={5000}
                      aria-invalid={Boolean(errors.description)}
                      className="min-h-24 resize-y"
                    />
                  </Field>
                </div>

                <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/50 bg-muted/30 p-4">
                  {task && canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mr-auto text-destructive"
                      onClick={remove}
                      disabled={pending}
                    >
                      Delete
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={pending}>
                    {pending ? "Saving…" : task ? "Save changes" : "Create task"}
                  </Button>
                </footer>
              </form>
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>
    </>
  );
}

function Field({
  label: caption,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-foreground">{caption}</span>
        {children}
      </label>
      {error && (
        <span role="alert" className="mt-1 block text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
