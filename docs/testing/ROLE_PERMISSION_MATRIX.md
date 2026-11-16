# Role permission matrix

Derived directly from [catalog.ts](../../src/lib/permissions/catalog.ts), 2026-11-16: **15 roles × 65 permissions = 975 default grant decisions**. These are provisioning defaults; runtime [authorization.ts](../../src/lib/permissions/authorization.ts) reads organization-owned DB roles/role_permissions and unions all assigned role grants. Inactive/deleted users and inactive organizations cannot receive CRM authorization. Custom roles/edited database grants can differ.

`Y` = granted by default; `—` = absent. The complete matrix has 15 role rows and 65 permission columns, identified as P01–P65 and expanded below.

## Policy differences beyond flags

Sources: [policy.ts](../../src/lib/permissions/policy.ts), [scope.ts](../../src/lib/permissions/scope.ts), [property-access.ts](../../src/lib/permissions/property-access.ts), [document-scope.ts](../../src/features/documents/lib/document-scope.ts), catalog and authorization links above.

- Permissions alone decide access, administrators included; the only remaining administrator shortcut is the inventory grant bypass. Removing a permission from an administrator's role removes it.
- Other roles use the broadest `records.*` permission they hold, from roles and per-user `user_permissions` (own < broker_team < organization). Holding none means own records only. Organization isolation remains in SQL. Organization scope alone does not grant administrator predicates/inventory bypass.
- Own scope matches owner columns. Broker-team scope includes own records, nondeleted team users selected by broker ID, and matching broker columns when provided. Without owner/broker columns a scope condition supplies organization isolation only; inventory grants provide the finer inventory restriction.
- Inventory grants target a property, optionally floors/units. No positive targets means whole property. Floor/unit grants and exclusions restrict targeted visibility. Floor visibility may follow a visible unit. Current property/floor/unit file loaders omit grant filters; four file API denial regressions retain expected restrictions.
- `canGrantUnitAccess` accepts administrator inventory bypass or properties.grant_unit_access. Grantees exclude self, administrators, deleted/inactive users and other organizations. Master brokers may grant to broker equivalents and agents; broker equivalents may grant to users whose broker ID is the caller. The permission alone does not bypass these target rules. The access list shows only grants to those grantees unless the caller has properties.view_all_access (administrators and sales managers by default).
- Billing needs billing.view (broker-type roles have it by default); managing payments also needs billing.manage. Both are limited to opportunities in the user's data access.
- Master broker defaults to organization scope, with no settings/billing keys and no inventory bypass. Sales manager excludes marketing/billing/settings/users/roles, inventory delegation and moving opportunities back. Viewer includes .view/dashboard keys except billing; settings.view alone grants no user/role management.
- User-document files require users.manage. General documents reject user-bound files and require at least one accessible linked contact, deal or property (OR semantics), or an unlinked document within creator scope. Sensitive access accepts documents.view_sensitive **or** sales-manager/administrator/super-administrator role even if that key is removed; otherwise a sensitive deal document may be read by a listed deal agent, primary agent, broker or deal creator. This sensitivity exception still requires document scope and documents.view.
- Super-administrator is provisioned outside normal role editing. The legacy string agent-broker appears in broker-ID target recognition but is not a sixteenth provisioned role.

## Existing test evidence and limits

[Identity fixture](../../tests/fixtures/identity.ts) creates a unique organization and DB grants per test, then cleans up by cascade. [Authenticated API tests](../../tests/api/authenticated.spec.ts) parameterize all 15 roles for sign-in/session/export grant or denial/sign-out: one permission across 15 roles, not all 975 decisions. [File tests](../../tests/api/files.spec.ts) cover organization isolation and agent inventory denial. [Inventory tests](../../tests/api/inventory.spec.ts) cover hierarchy selectors. [Auth security](../../tests/api/auth-security.spec.ts) covers credentials, account activation, expiry/reset/origin and disabled framework features. Unit tests in src/lib/permissions cover policy/scope/grant helpers. Full HTTP coverage of every key, arbitrary DB overrides, multiple-role unions and every owner/team/peer combination is not established.

## Default scopes and counts

| Role                | Default scope | Granted / 65 |
| ------------------- | ------------- | ------------ |
| super-administrator | organization  | 65           |
| administrator       | organization  | 65           |
| sales-manager       | organization  | 50           |
| broker              | broker_team   | 31           |
| master-broker       | organization  | 55           |
| agent               | own           | 28           |
| viewer              | organization  | 22           |
| license-broker      | broker_team   | 31           |
| network-partner-ih  | broker_team   | 31           |
| network-partner-ind | broker_team   | 31           |
| sales-executive-ih  | broker_team   | 31           |
| sales-executive-ind | broker_team   | 31           |
| sales-director-ih   | broker_team   | 31           |
| consultant-ih       | broker_team   | 31           |
| sales-executive     | broker_team   | 31           |

## Complete 15 × 65 default matrix

| Role                | P01 | P02 | P03 | P04 | P05 | P06 | P07 | P08 | P09 | P10 | P11 | P12 | P13 | P14 | P15 | P16 | P17 | P18 | P19 | P20 | P21 | P22 | P23 | P24 | P25 | P26 | P27 | P28 | P29 | P30 | P31 | P32 | P33 | P34 | P35 | P36 | P37 | P38 | P39 | P40 | P41 | P42 | P43 | P44 | P45 | P46 | P47 | P48 | P49 | P50 | P51 | P52 | P53 | P54 | P55 | P56 | P57 | P58 | P59 | P60 | P61 | P62 | P63 | P64 | P65 |
| ------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| super-administrator | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   |
| administrator       | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   |
| sales-manager       | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | Y   | Y   |
| broker              | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | Y   | Y   | Y   | —   | —   | —   | —   | —   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | Y   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | Y   | —   |
| master-broker       | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | Y   | Y   |
| agent               | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | Y   | Y   | Y   | —   | —   | —   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | Y   | —   | —   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | —   | —   |
| viewer              | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | —   | —   | Y   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | —   | Y   | —   | —   | —   | Y   | —   | —   | Y   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | Y   |
| license-broker      | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | Y   | Y   | Y   | —   | —   | —   | —   | —   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | Y   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | Y   | —   |
| network-partner-ih  | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | Y   | Y   | Y   | —   | —   | —   | —   | —   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | Y   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | Y   | —   |
| network-partner-ind | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | Y   | Y   | Y   | —   | —   | —   | —   | —   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | Y   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | Y   | —   |
| sales-executive-ih  | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | Y   | Y   | Y   | —   | —   | —   | —   | —   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | Y   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | Y   | —   |
| sales-executive-ind | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | Y   | Y   | Y   | —   | —   | —   | —   | —   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | Y   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | Y   | —   |
| sales-director-ih   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | Y   | Y   | Y   | —   | —   | —   | —   | —   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | Y   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | Y   | —   |
| consultant-ih       | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | Y   | Y   | Y   | —   | —   | —   | —   | —   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | Y   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | Y   | —   |
| sales-executive     | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | Y   | —   | —   | —   | —   | Y   | Y   | Y   | —   | —   | —   | —   | —   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | —   | —   | —   | Y   | Y   | Y   | —   | Y   | Y   | —   | —   | —   | —   | Y   | —   | —   | —   | Y   | —   | —   | —   | —   | —   | —   | —   | —   | Y   | Y   | —   |

## Permission key

| ID  | Module       | Permission                      |
| --- | ------------ | ------------------------------- |
| P01 | dashboard    | dashboard.view                  |
| P02 | dashboard    | dashboard.view_pipeline         |
| P03 | dashboard    | dashboard.view_metrics          |
| P04 | dashboard    | dashboard.view_revenue          |
| P05 | dashboard    | dashboard.view_summary          |
| P06 | dashboard    | dashboard.view_priorities       |
| P07 | dashboard    | dashboard.view_closings         |
| P08 | dashboard    | dashboard.view_task_load        |
| P09 | dashboard    | dashboard.view_inventory        |
| P10 | dashboard    | dashboard.view_activity         |
| P11 | contacts     | contacts.view                   |
| P12 | contacts     | contacts.create                 |
| P13 | contacts     | contacts.update                 |
| P14 | contacts     | contacts.delete                 |
| P15 | contacts     | contacts.import                 |
| P16 | contacts     | contacts.export                 |
| P17 | contacts     | contacts.reassign_broker        |
| P18 | requirements | requirements.view               |
| P19 | requirements | requirements.manage             |
| P20 | properties   | properties.view                 |
| P21 | properties   | properties.create               |
| P22 | properties   | properties.update               |
| P23 | properties   | properties.delete               |
| P24 | properties   | properties.manage_units         |
| P25 | properties   | properties.manage_unit_pictures |
| P26 | properties   | properties.grant_unit_access    |
| P27 | properties   | properties.view_all_access      |
| P28 | developments | developments.view               |
| P29 | developments | developments.create             |
| P30 | developments | developments.update             |
| P31 | developments | developments.delete             |
| P32 | deals        | deals.view                      |
| P33 | deals        | deals.create                    |
| P34 | deals        | deals.update                    |
| P35 | deals        | deals.delete                    |
| P36 | deals        | deals.change_stage              |
| P37 | deals        | deals.reassign_agent            |
| P38 | deals        | deals.approve_stage_change      |
| P39 | deals        | deals.move_back                 |
| P40 | tasks        | tasks.view                      |
| P41 | tasks        | tasks.create                    |
| P42 | tasks        | tasks.update                    |
| P43 | tasks        | tasks.delete                    |
| P44 | calendar     | calendar.view                   |
| P45 | calendar     | calendar.manage                 |
| P46 | marketing    | marketing.view                  |
| P47 | marketing    | marketing.manage                |
| P48 | marketing    | marketing.send                  |
| P49 | marketing    | marketing.delete                |
| P50 | documents    | documents.view                  |
| P51 | documents    | documents.manage                |
| P52 | documents    | documents.view_sensitive        |
| P53 | reports      | reports.view                    |
| P54 | billing      | billing.view                    |
| P55 | billing      | billing.manage                  |
| P56 | settings     | settings.view                   |
| P57 | settings     | settings.system                 |
| P58 | settings     | users.manage                    |
| P59 | settings     | users.delete                    |
| P60 | settings     | users.restore                   |
| P61 | settings     | roles.manage                    |
| P62 | settings     | settings.audit                  |
| P63 | records      | records.view_own                |
| P64 | records      | records.view_team               |
| P65 | records      | records.view_all                |

## Main update review: eb91ddf

Master Broker creation can assign multiple active Broker/License Broker users from the same organization through `brokerIds`; other manager roles cannot use that selection. Selection is validated and applied transactionally with cycle/team checks. This adds hierarchy behavior, not a catalog role or permission. The updated user-access browser scenario checks multi-selection persistence; upstream unit tests cover inactive/deleted/foreign/wrong-role selections and duplicate IDs. Administrator pipeline advancement now requires the same reservation/monthly payment gates as other roles; administrator permission does not bypass payment prerequisites.

## Main c3aaaad authorization update

Broker, License Broker, Network Partner IND, Sales Director IH and Network Partner IH can now lead Agents in addition to their compatible Sales Executive role. My team permits broker-access roles and Master Broker (leadsATeam); administrator alone is denied. Property grant controls moved to /properties/[id]/access and retain canGrantUnitAccess checks. The catalog remains 15 roles / 63 permission keys; these hierarchy/route rules are separate from the grant matrix.
