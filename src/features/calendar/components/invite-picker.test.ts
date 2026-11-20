import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InvitePicker } from "./invite-picker";

const people = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", firstName: "Ana", lastName: "Reyes" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", firstName: "Ben", lastName: null },
];

it("submits the people already invited and offers Everyone only when allowed", () => {
  const html = renderToStaticMarkup(
    createElement(InvitePicker, { people, canInviteEveryone: false, defaultIds: [people[0].id] }),
  );
  expect(html).toContain(`name="inviteeUserIds" value="${people[0].id}"`);
  expect(html).not.toContain(`name="inviteeUserIds" value="${people[1].id}"`);
  expect(html).toContain('name="invitePicker"');
  expect(html).toContain("Remove Ana Reyes");
  expect(html).not.toContain("Everyone");
  const open = renderToStaticMarkup(
    createElement(InvitePicker, { people, canInviteEveryone: true }),
  );
  expect(open).toContain("Everyone");
  expect(open).toContain("Only me");
});
