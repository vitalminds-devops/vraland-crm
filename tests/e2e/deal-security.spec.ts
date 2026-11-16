import { test, expect } from "../fixtures/identity";
import {
  seedOpportunityDetails,
  seedReservation,
  seedStages,
  withDatabase,
} from "../helpers/database";
import { randomUUID } from "node:crypto";

test.setTimeout(120_000);

for (const decision of [
  "approve",
  "reject",
  "self-approve",
  "already-decided",
  "stale-stage",
] as const) {
  test(`stage approval ${decision} preserves authorization and persisted state`, async ({
    page,
    identity,
  }) => {
    const stages = await seedStages(identity.organizationId);
    const from = stages.find((stage) => stage.slug === "leads")!.id;
    const to = stages.find((stage) => stage.slug === "opportunity")!.id;
    const preparation = randomUUID();
    const deal = randomUUID(),
      request = randomUUID(),
      requester = decision === "self-approve" ? identity.userId : randomUUID();
    const title = `Approval ${decision} ${deal}`;
    await withDatabase(async (c) => {
      if (requester !== identity.userId)
        await c.query(
          "insert into users(id,organization_id,email,first_name,last_name) values($1,$2,$3,$4,$5)",
          [
            requester,
            identity.organizationId,
            `${requester}@example.invalid`,
            "Approval",
            "Requester",
          ],
        );
      await c.query("update pipeline_stages set requires_approval=true where id=$1", [to]);
      await c.query(
        "insert into deals(id,organization_id,deal_code,title,stage_id,created_by) values($1,$2,$3,$4,$5,$6)",
        [deal, identity.organizationId, `approval-${deal}`, title, from, requester],
      );
      await c.query(
        "insert into deal_stage_change_requests(id,organization_id,deal_id,from_stage_id,to_stage_id,requested_by,reason) values($1,$2,$3,$4,$5,$6,$7)",
        [request, identity.organizationId, deal, from, to, requester, "Fixture approval requested"],
      );
    });
    // Reservation is now required for administrators as well as other roles.
    await seedReservation(identity.organizationId, deal);
    await seedOpportunityDetails(identity.organizationId, deal);
    expect(
      (
        await page.request.post("/api/auth/sign-in/email", {
          data: { email: identity.email, password: identity.password },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/pipeline/approvals");
    const row = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: title, exact: true }) });
    await expect(row).toHaveCount(1);
    if (decision === "already-decided")
      await withDatabase(async (c) => {
        await c.query(
          "update deal_stage_change_requests set status='rejected',decided_by=$2,decided_at=now() where id=$1",
          [request, identity.userId],
        );
      });
    if (decision === "stale-stage")
      await withDatabase(async (c) => {
        await c.query(
          "insert into pipeline_stages(id,organization_id,name,slug,position,default_probability,is_won_stage,is_lost_stage,requires_approval) values($1,$2,'Preparation','preparation',0,0,false,false,false)",
          [preparation, identity.organizationId],
        );
        await c.query("update deals set stage_id=$2 where id=$1", [deal, preparation]);
      });
    if (decision === "reject") {
      await row.getByRole("button", { name: "Reject", exact: true }).click();
      await expect(
        page.getByText("A reason is required when rejecting a stage change.", { exact: true }),
      ).toBeVisible();
      await withDatabase(async (c) => {
        expect(
          (await c.query("select status from deal_stage_change_requests where id=$1", [request]))
            .rows[0].status,
        ).toBe("pending");
      });
      await row
        .getByLabel("Reason for rejecting this stage change")
        .fill("Requested documents are incomplete");
      await row.getByRole("button", { name: "Reject", exact: true }).click();
    } else {
      const submitted = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          Boolean(response.request().headers()["next-action"]),
      );
      await row.getByRole("button", { name: "Approve", exact: true }).click();
      expect((await submitted).status()).toBe(200);
      await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
    }
    if (decision === "self-approve") {
      await expect(
        page.getByText("You cannot approve your own stage change request.", { exact: true }),
      ).toBeVisible();
    } else if (decision === "already-decided") {
      await expect(
        page.getByText("That request has already been decided.", { exact: true }),
      ).toBeVisible();
    } else if (decision === "stale-stage") {
      // Approval re-evaluates the current stage: position 0 -> 2 now skips a stage.
      await expect(page.getByText("Stages can't be skipped.", { exact: true })).toBeVisible();
      await expect
        .poll(() =>
          withDatabase(
            async (c) =>
              (await c.query("select stage_id from deals where id=$1", [deal])).rows[0].stage_id,
          ),
        )
        .toBe(preparation);
    } else {
      await expect
        .poll(() =>
          withDatabase(
            async (c) =>
              (
                await c.query("select status from deal_stage_change_requests where id=$1", [
                  request,
                ])
              ).rows[0].status,
          ),
        )
        .toBe(decision === "approve" ? "approved" : "rejected");
    }
    await withDatabase(async (c) => {
      const persisted = (
        await c.query(
          "select r.status,r.decided_by,d.stage_id from deal_stage_change_requests r join deals d on d.id=r.deal_id where r.id=$1",
          [request],
        )
      ).rows[0];
      if (decision === "approve") {
        expect(persisted).toMatchObject({
          status: "approved",
          decided_by: identity.userId,
          stage_id: to,
        });
        expect(
          (
            await c.query(
              "select from_stage_id,to_stage_id,changed_by from deal_stage_history where deal_id=$1",
              [deal],
            )
          ).rows,
        ).toContainEqual(
          expect.objectContaining({
            from_stage_id: from,
            to_stage_id: to,
            changed_by: identity.userId,
          }),
        );
      } else if (decision === "reject" || decision === "already-decided")
        expect(persisted).toMatchObject({
          status: "rejected",
          decided_by: identity.userId,
          stage_id: from,
        });
      else if (decision === "self-approve")
        expect(persisted).toMatchObject({ status: "pending", decided_by: null, stage_id: from });
      else
        expect(persisted).toMatchObject({
          status: "pending",
          decided_by: null,
          stage_id: preparation,
        });
    });
  });
}
