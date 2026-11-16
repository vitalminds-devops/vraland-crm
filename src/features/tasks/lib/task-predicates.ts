import "server-only";

import { and, gte, lt, notInArray } from "drizzle-orm";

import { tasks } from "@/db/schema";
import { startOfManilaDay } from "@/lib/utils/manila-time";

// One definition of each timing bucket, shared by the dashboard and the Tasks screen.
const open = () => notInArray(tasks.status, ["completed", "cancelled"]);

// Overdue is "due before today", so a task is never both overdue and due today.
export const taskOverdue = (now = new Date()) =>
  and(open(), lt(tasks.dueAt, startOfManilaDay(now)))!;

export const taskDueToday = (now = new Date()) =>
  and(open(), gte(tasks.dueAt, startOfManilaDay(now)), lt(tasks.dueAt, startOfManilaDay(now, 1)))!;

export const taskUpcoming = (now = new Date()) =>
  and(open(), gte(tasks.dueAt, startOfManilaDay(now, 1)))!;
