# Requirements traceability

Status of each requirement in the [Functional Requirements Specification v1.0](requirements/Verida_Functional_Requirements_Specification_v1.0.docx).

- **Done:** implemented in the app and the database, and covered by tests.
- **Needs setup:** the code is complete and tested, but it needs something only the project owner can provide before it runs for real. Until then the app uses its stated fallback.

## Summary

| Module | Total | Done | Needs setup |
| --- | --- | --- | --- |
| A User account | 27 | 27 | 0 |
| B Business management | 26 | 26 | 0 |
| C Business records | 37 | 37 | 0 |
| D Industry operations | 28 | 28 | 0 |
| E Business intelligence | 25 | 25 | 0 |
| F Verida Learn | 40 | 36 | 4 |
| G Ask Verida | 23 | 15 | 8 |
| H Notifications | 9 | 7 | 2 |
| I Platform administration | 14 | 14 | 0 |
| **Total** | **229** | **215** | **14** |

Administrative requirements are complete, but nobody can use them until a first administrator is assigned, as described in the README.

## What "done" has been tested against

| Check | Scope |
| --- | --- |
| Database tests (`npm run test:db`) | Every migration, role, permission and KPI, on real Postgres |
| Integration tests (`npm test`) | Every repository through the real client, against the local emulator |
| Edge tests (`npm run test:edge`) | The real functions under Deno, with fake Claude and Resend servers |
| Live suite (`tests/integration/live-supabase.test.ts`) | Core journeys and permission rules on the real Supabase project, last run 2026-11-03 after every migration: 34 passed, with lesson approval skipped |
| Browser walkthroughs | Owner, reviewer and administrator journeys on web, against the emulator |

**Not yet tested:** any device or simulator (web only so far), real Claude responses, real delivery of notification emails, lesson approval on the real project (the live suite skips it until an account holds the reviewer role), and a permanent erasure on the real project. Erasing an account and a business was rehearsed there on 2026-11-03, including Supabase's own `auth` tables, inside a block that rolled everything back.

## Needs setup

| Requirements | Needs | Until then |
| --- | --- | --- |
| FR-F16, F17, F18, F29 AI lesson drafts and regeneration | An Anthropic API key set as a Supabase secret | Drafts are adapted from approved content matched to the learner's industry and chosen topics. Regenerating moves to other approved content |
| FR-G07, G11, G14 AI understanding of questions | The same key | Keyword rules, and the app says so beside the answer |
| FR-G16 to G20 Capture assistance from free text | The same key | Explains the fields and opens the form, but can't pre-fill it from what the user typed |
| Reading receipts into a sale or expense form | The same key, and deploying the `read-receipt` function | Receipts can be attached and viewed. "Fill in from receipt" says the AI is not switched on, and the user fills in the form |
| FR-H09 Email delivery | A Resend API key set as a Supabase secret. The dispatch job has been scheduled since 2026-11-03 | In-app delivery works and is recorded. Emails wait in the queue |
| FR-H04 Learning reminders | A first run to confirm. The daily job has been scheduled since 2026-11-03, and had not yet run when checked on 2026-11-04 | The function that sends them is built and tested |

Emails are sent from `accounts@verida.vinabbie.com`, on the `verida.vinabbie.com` subdomain verified in Resend on 2026-11-17 (the parent `vinabbie.com` was verified on 2026-11-13). Cloudflare Email Routing forwards `accounts@`, `sales@` and `support@verida.vinabbie.com` to the team's Gmail, and a test message and reply worked on 2026-11-17. The live project still needs `npx supabase config push` and a redeploy of `dispatch-email` before it sends from the new address, and the auth sign-up codes need a first delivery from it to confirm. Notification emails (FR-H09) still need a first real delivery to confirm.

## Notes on how some requirements are met

| Requirement | Note |
| --- | --- |
| Choosing an area at sign-in and registration | Added at the project owner's request. It chooses which area opens first and grants nothing, so Verida team access still needs a role from an administrator |
| Receipts, product photos and logos | Added at the project owner's request. Sales, expenses and activity records can carry up to ten receipts (photos or PDFs), products a photo, and the business a logo. A file uploaded but never saved is deleted when the form closes, and one removed from a saved record is deleted when the change is saved. Files sit in a private storage bucket under the business, and each folder follows the permission of its data: receipts need Capture or Edit records, photos Manage products, the logo Manage business, and seeing any of them View records. Staff erasing a business remove its files first. The AI reads a receipt into the form for the user to check and save (FR-G20); it never saves a record |
| Landing page and sign-in | Added at the project owner's request. Everyone who is not signed in, in the app and on the website, first sees a page about Verida. Sign-in and registration default to a business; the Verida team uses a small link at the foot of each |
| Viewing before editing | Added at the project owner's request. Lists open a read-only profile with an Edit button, for sales, expenses, activity, products, flocks and learning content. Lesson review still opens its editable text, because correcting it is the task |
| FR-B02, B03 Business details | Extended at the project owner's request. Business type follows the taxonomy: a main category, a type within it, and optionally more types. Reasons and record keeping accept several answers, All of the above and Other. Country is searchable across 251 countries, and it suggests the currency, which is required and can be changed. Lessons and the assistant use only the main business type |
| FR-C04, C05 Categories | A record keeps one category, so that no figure is counted twice. Other adds a new category from the dropdown, and filters accept several |
| FR-A20, A21, A27, B13 Leaving Verida | Nobody can leave while they own a running business or are the only active administrator. A request removes access and waits out a retention period, 90 days and changeable on screen. Staff then cancel or erase from the deletion queue. Nothing is erased automatically |
| Erasing an account | Personal details, sign-in details, conversations, lessons and notifications are removed. The row stays as "Deleted user", so records the person entered for a business still say who entered them |
| Erasing a business | Every record goes, including its audit history, leaving only a note of who erased it. Staff must first check that no law requires financial records to be kept: the system does not know |
| FR-B22 Member permissions | A person's own setting overrides their role, and changing their role resets it. Nobody can change their own, or give out a permission they don't hold. Owners always hold everything |
| FR-C12 to C14 CSV import | Covers sales, expenses and activity records. A file with any invalid row is refused as a whole, listing each problem by line |
| FR-D28 Stock movement | Starts from the latest count on or before the period end. A count is treated as end of day, so that day's sales come after it |
| FR-E07, E25 History | Any past date range can be chosen. Insights are regenerated from current records for that range rather than stored, so they reflect later corrections |
| FR-F35 Lesson activities | Each lesson has its practical activity, plus any further activities written in the content or by the reviewer, each answered separately. AI drafts keep the activities of the content they are based on, rather than writing new ones |
| Section 5, lesson response | A learner, or staff who can review lessons, can delete a response. The lesson stays completed, and the audit log keeps only who deleted it and when |
| Section 5, assigning a lesson | Staff assign approved content to a learner for one of their businesses. It joins the normal review queue |
| FR-G21 AI logs | Administrators see metadata only: never what anyone asked (Appendix A default) |
| FR-C35, D21 Removing products | A product with no sales can be deleted. One with sales can only be deactivated |
| FR-H05 Business account changes | Covers account and business status, and a person's role, permissions or removal, for business members and Verida staff alike. Staff also hear about deletion requests and lessons awaiting review |
| FR-I05 to I07 Industry configuration | A new KPI can total or take the latest value of an activity without code. A genuinely new kind of calculation needs a new formula in `analytics.evaluate_kpi`. Configurable validation covers an activity's minimum, maximum, whether it may be negative or must be whole, whether a note is required, and its allowed units. It does not extend to sales and expenses |
| FR-I10 Monitoring | Availability is measured from the staff member's own device when the screen opens. Reported errors alert staff, at most once an hour. Nothing checks availability in the background, so an outage that reports no error raises no alert |
| FR-I12 Roles and permissions | Staff hold an Administrator, Learning reviewer or Support role, and each person can be given or denied individual permissions. Administrators always hold everything, and only they can create or remove another. The business role matrix applies to every business at once |

## Specifications added on 2026-11-18

Three later specifications in `requirements/` extend the original: the Business Taxonomy & Configuration Catalogue, the Industry-specific Activity Catalogue and the Plan Module Developer Specification. They are being built in phases.

| Phase | Scope | Status |
| --- | --- | --- |
| 1a Business categories and types | Taxonomy section 2: ten main categories and their subcategories, stored in `platform.business_categories` and `platform.industries`. Verida staff with Configuration add, rename, reorder and deactivate both under Business types, without app changes. Setup asks for a category, then a type within it, then any other types from any category | Done |
| 1b Universal sales and expense categories | Taxonomy sections 3 and 4: nine sales and twelve expense categories, with the expense subcategories, in `platform.finance_categories`. Staff add, rename, reorder and deactivate them under Sales and expense categories. Each business type's own categories are reported under one of them, and every sale and expense stores the universal category it belongs to | Done |
| 2 Activity catalogue | Ten activity groups, activity forms defined as data, an activity lifecycle, links to sales, expenses, products and a responsible person, owners switching activity types on or off, complete Poultry and Tuckshop sets, and the catalogue's activities for every other subcategory | Done |
| 3 Plan module, core (P0) | A Plan tab between Insights and Learn with Overview, Goals and Tasks. Measurable goals (increase, reduce, keep at a level, reach at least) and milestone goals, progress observations, goals that follow a Verida measure, tasks with priorities, statuses, due dates, assignees and blockers, many-to-many task and goal links, and the section 7 measures. New permissions: View plan, Work on tasks, Manage goals | Done |
| 4a Plan module, schedule and collaboration (P1) | Schedule and Progress sections, so Plan has all five from section 1.2. A schedule with list, day, week and month views; events; repeating tasks (daily, weekly on chosen days, monthly, every n), editing one occurrence or the series; reminders with snooze and dismiss, a task reminders setting and quiet hours; task comments; task history; weekly reviews; goal progress history; conflicting edits refused rather than overwritten | Done |
| 4b Plan module, AI planning (P2) | On-request planning, insight-to-task suggestions, goal breakdown and weekly suggestions, each approved by the owner before anything is created | Not started |
| 5 Sales, payments and offline capture | Line items, refunds, payments and offline sync | Not started |

Notes on phase 4a:

- A repeating task is a series (`plan.recurring_rules`). Each date becomes its own task about a week ahead, with the series and date as a unique key, so generating twice, from the app and the nightly job, never creates a duplicate. Later dates appear on the schedule as "Repeats" until they become tasks, and never next to their own task. A series started with a past date does not create overdue work for days before it existed.
- Editing an occurrence asks whether the change is for that task only or for it and later ones. Changing the series updates later occurrences nobody has started or changed on their own; past ones keep their history. The pattern itself cannot change, so a different pattern is a new series. Stopping a series cancels the later tasks nobody had touched and keeps today's.
- Events have a day and optional local times in the business's time zone. Recurring events are not covered; repeating applies to tasks.
- Reminders belong to the person who sets them. They arrive as in-app notifications, and by email when that person allows it. A reminder inside their quiet hours waits until the hours end, one for a closed task is not sent, and turning off task reminders stops them. Snoozing or dismissing never changes the due date. A reminder well past its time that has not gone out is shown as waiting rather than sent. Delivery needs the jobs in `supabase/setup/schedule_jobs.sql`.
- Comments can be edited and removed only by their author. Viewers can read them but not write.
- A task's history comes from the audit log and shows the fields that matter to the team, with old and new values.
- A weekly review lists what was completed, what was due and is still open, what is blocked and what is due next week, beside the week's completion and on-time rates. Owners and managers write the notes, one review per week. Finishing tasks is never shown as proof that a goal moved.
- Saving a task sends the version it was opened at. If someone changed it meanwhile, nothing is saved and the person is told to reopen it (section 8). Full offline capture remains in phase 5.
- Section 13's open decisions were taken as: in-app and email notifications for the pilot, with push later; attachments on tasks deferred.

Notes on phase 3:

- Progress is calculated only in the database (`plan.goal_progress`), using section 7's formulas. Without a starting value, an increase or reduction goal shows its actual and target but no percentage. A goal to keep a level or reach at least a figure says whether it is on track, never a percentage. A milestone goal shows how many milestones are done. Above 100% is shown as it is, with a note that the target was passed.
- A goal can follow a measure the analytics service already calculates, over the goal's period so far. Otherwise people record dated observations, which are never edited; a later one replaces an earlier one.
- Completion rate counts tasks due in the period, leaving out cancelled ones, and uses each task's current due date, so a rescheduled task counts where it now falls (an open decision in section 13). On-time rate counts completed tasks with a due date. Overdue uses the business's own day, from its time zone, which defaults to Africa/Gaborone.
- Tasks and goals are never deleted, only cancelled, and every change is in the audit log. A task records a new version on each change, ready for offline sync in phase 5.
- Owners and managers manage goals; staff create, update, assign and complete tasks; viewers can look. Owners can change this per person as with other permissions.
- The decisions left open in section 13 were taken as: staff can be assigned tasks from the start, goals belong to one business, and AI plans come later and only on request.

Notes on phase 2:

- An activity's status is planned, in progress, completed, needs review, cancelled or voided. Only completed activities count in any measure, because every measure already counted only recorded rows, and completed is stored as recorded.
- Staff define each type's group, whether it records a quantity (needed, optional or not at all), whether new businesses start with it on, and its extra form fields: text, whole numbers, numbers, dates, times, yes or no, and one or several choices from a list. The database checks every answer against those fields, and asks for required answers only when an activity is completed.
- Changing a type's fields raises its form version, and each record keeps the version it was made with. A field that records already use cannot be deleted, only hidden.
- Poultry and Tuckshop have complete sets with their fields. 82 other subcategories have the catalogue's 696 activities, each starting as a dated record with a status and notes but no quantity or extra fields, for staff to refine. The catalogue lists none for Other manufacturing and Other care services, so those start with four general ones each, and Other business keeps its three general ones. Each activity's group was assigned by keyword and can be changed on the Business types screen.
- A link to a sale or expense never copies its amount. The database checks that the linked record and the responsible person belong to the same business.
- Not yet covered: links to customers, suppliers, assets and payments, which have no records yet, and offline capture (phase 5).

Notes on phase 1b:

- A sale or expense still keeps the name the person chose, so the forms, filters, imports and receipts work as before. The database works out the universal category from that name into `category_code`, which clients cannot write. Existing records were classified the same way, without changing who last edited them.
- A name is matched first against the universal categories and subcategories, then against the business type's own categories. A category someone typed under Other is reported under Other operating sales or Other business expenses.
- Forms list the business type's own categories first, then the ones the business typed, then the universal ones, and show each with its group, such as "Feed · Stock and materials".
- Not yet covered from sections 3 and 4: sale line items, discounts, refunds, payment status, expense status and capital purchases. These belong to phase 5.

Notes on phase 1a:

- The catalogue's lists hold 87 subcategories, although its summary says 85. All 87 are loaded.
- The six original types kept their codes and became subcategories: Poultry, Tuckshop / convenience shop, Hair salon, Restaurant, Consulting and Other business. Existing businesses and records are unchanged. Their activities and measures remain, and new types start with the shared financial measures until phase 2 adds their activities.
- A type can be chosen only while it and its category are both active. A business that already has a deactivated type keeps it. The database enforces this, not just the screens.
- A category cannot be deleted while it has types, and a type cannot be deleted while a business uses it. Deactivate them instead, which keeps history readable.

## Section 5: CRUD and action classification

All covered, including member and conversation search, the activity date filter, correcting and deleting a lesson response, assigning a lesson, deactivating a learner profile, archiving lessons and content, and an owner's view of a business's change history. As the section recommends, sales, expenses and activity records are voided rather than deleted.

## Appendix A: decisions made so development could proceed

The specification lists these as open. Each default below is easy to change, but please confirm them.

| Question | Default chosen | Where it lives |
| --- | --- | --- |
| Can a user own or join multiple businesses? | **Yes.** The app has a workspace switcher | `business.memberships` |
| Staff role and permission matrix | **Owner, Manager, Staff, Viewer.** Staff capture and edit but can't void; only owners manage the business and its members. Administrators can change this on screen | `authz.role_permissions` |
| Deletion in MVP or handled administratively? | **The user requests it; staff erase it after a 90-day retention period, as the project owner chose.** Check it against local law, especially for financial records | `platform.retention_settings`, `platform.admin_deletion_queue` |
| CSV import in the first pilot? | **Yes, now built**, since all requirements were requested | `core/import` |
| Only poultry and retail for MVP? | **All six industries from the prototype.** Poultry and retail have dedicated KPIs; the other four use activity totals | `platform` schema |
| Can administrators read AI conversations? | **No, metadata only** | `assistant.admin_list_requests` |
| KPI catalogue and formulas | **Proposed in the migrations.** Needs business validation, especially `recorded_balance` | `platform.kpi_definitions`, `analytics.evaluate_kpi` |

Also assumed: only feed recorded in kilograms counts towards feed per egg.
