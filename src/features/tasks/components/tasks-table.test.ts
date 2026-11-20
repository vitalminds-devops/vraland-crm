import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { TasksTable, type TaskRow } from "./tasks-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/tasks",
}));
vi.mock("@/features/contacts", async () => import("@/features/contacts/lib/helpers"));
vi.mock("./task-form", () => ({ TaskForm: () => null }));
vi.mock("./task-status", () => ({ TaskStatus: () => null }));

const row: TaskRow = {
  id: "task",
  title: "Call the client",
  description: null,
  taskType: "call",
  priority: "medium",
  status: "todo",
  dueAt: null,
  reminderAt: null,
  assignedUserId: "agent",
  assignedFirstName: "Assigned",
  assignedLastName: "Agent",
  creatorFirstName: "John",
  creatorLastName: "Doe",
  contactId: null,
  contactFirstName: null,
  contactMiddleName: null,
  contactLastName: null,
  propertyId: null,
  propertyTitle: null,
  dealId: null,
  dealTitle: null,
};

function render(task = row) {
  return renderToStaticMarkup(
    createElement(TasksTable, { rows: [task], page: 1, pages: 1, pageSize: 25, canUpdate: false }),
  );
}

it("shows who created the task separately from its assignee", () => {
  const html = render();
  expect(html).toMatch(/<th[^>]*>Type<\/th>/);
  expect(html).toMatch(/<th[^>]*>Created by<\/th>/);
  const cells = html.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) ?? [];
  expect(cells).toHaveLength(7);
  expect(cells[1]).toContain("Call");
  expect(cells[4]).toContain("Assigned Agent");
  expect(cells[5]).toContain("John Doe");
  expect(cells[5]).not.toContain("Assigned Agent");
  expect(html).toContain("Created by: John Doe");
  expect(html).toContain("Assigned Agent");
  expect(html).not.toContain("Created by: Assigned Agent");
});

it("keeps the creator visible after reassignment", () => {
  expect(
    render({ ...row, assignedUserId: "another-agent", assignedFirstName: "Another" }),
  ).toContain("Created by: John Doe");
});

it("handles a missing creator without crediting the assignee", () => {
  expect(render({ ...row, creatorFirstName: null, creatorLastName: null })).toContain(
    "Created by: Unknown user",
  );
});
