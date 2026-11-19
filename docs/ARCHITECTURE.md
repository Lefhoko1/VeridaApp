# Architecture

Verida separates concerns in two directions: **by business module** (section 3 of the requirements) and **by layer** (MVVM with repositories). The same module boundaries run through the code and the database. The boundaries are enforced by tooling, so a violation fails `npm run lint` or a test rather than relying on review.

## Layers

```
View  ──▶  ViewModel  ──▶  Repository interface  ◀──  Repository implementation  ──▶  Supabase
(renders)  (state and      (domain, plain TS)         (data, the only Supabase
            commands)                                  code in a module)
```

| Layer | Folder | Does | May not |
| --- | --- | --- | --- |
| **Model** | `domain/` | Types, repository interfaces, validation rules, pure business logic | Import React, Expo, Supabase, or another module |
| **Data** | `data/` | Implements repository interfaces. Converts rows to domain models, validating them with zod on arrival | Import UI or the query cache |
| **ViewModel** | `presentation/viewmodels/` | Holds screen state, loads data with TanStack Query, exposes commands | Render, navigate, or know about Supabase |
| **View** | `presentation/views/` | Renders one ViewModel using the design system | Run queries, call repositories, or navigate |

### Why navigation lives in the routes

Views receive navigation as props, such as `onCreate` and `onDone`. Routes in `src/app` are the only place that knows URLs. This keeps a module usable without any knowledge of the others' screens, and the only code a route contains is the decision of where to go next.

### How dependencies reach a ViewModel

Each module declares what it needs in `presentation/di.ts` using `createDependencies`. `src/composition` is the single place that chooses concrete classes. A test passes fakes through the same provider:

```tsx
<RecordsDependenciesProvider value={{ sales: fakeSales, ... }}>
```

No mocking of Supabase is needed to test a ViewModel. See `useSaleFormViewModel.test.tsx`.

## Modules

| Module | Requirements | Postgres schema | Owns | Must not own |
| --- | --- | --- | --- | --- |
| `account` | A | `identity` | Identity, profile, account status | Business records |
| `business` | B | `business` | Business profile, membership, invitations | Authentication |
| `records` | C | `records` | Sales, expenses, products | KPI interpretation |
| `operations` | D | `operations` | Flocks and industry activity records | User identity |
| `analytics` | E | `analytics` | KPIs, trends, insights | Conversational AI |
| `learning` | F | `learning` | Content, lessons, review, progress | Record calculations |
| `assistant` | G | `assistant` | Conversations, AI gateway | Authoritative figures |
| `notifications` | H | `notifications` | Delivery and preferences | Business decisions |
| `plan` | Plan Module Specification | `plan` | Goals, milestones, progress observations, tasks and their links, repeating series, events, reminders, comments and weekly reviews | Business records and measures |
| `administration` | A4, B3, G4, I | `platform`, and role-checked functions in others | Staff screens for users, businesses, configuration, roles and monitoring | Routine business operations |

Learning content administration (F2) stays in `learning`, which owns that data. `authz` holds roles and permissions (the authorisation service in section 3.1), and `platform` holds industry configuration.

### Staff screens

Staff routes live in the `(platform)` route group, which requires a platform role and not a business, because Verida staff may have no business of their own. The guard only decides what to offer. Each administrative function asks for the one permission it needs through `authz.require_platform_permission`. `tests/database/administration.test.mjs` proves an ordinary user is refused, and `schema-invariants.test.mjs` fails if an `admin_*` function has no such check.

Profiles remain private to their owner under RLS, so administrators reach them only through those functions, and every change to roles, permissions and configuration is written to the audit log.

### Permissions

Both sides of the platform use the same model: a role gives a set of permissions, and one person can be given or denied a permission on top of that (`authz.member_permission_overrides` in a business, `authz.platform_staff_overrides` at Verida). A business owner and a Verida administrator always hold everything, so neither can be locked out. `authz.has_business_permission` and `authz.platform_permission_for` are the only places that work this out, and every RLS policy goes through them.

Nobody can change their own access or give out a permission they don't hold, and only an administrator can create or remove an administrator.

### Choosing an area at sign-in and registration

Sign-in asks for Business or Verida team, and registration asks for My business, I was invited or Verida team. The choice is saved on the device and only decides which area opens first (`src/composition/entryDestination.ts`). It never grants anything: choosing the Verida team without a role leads to a waiting screen, and an administrator gives the role under Roles and permissions. Business roles are not offered at all, because a person's role can differ between businesses and is set by each owner.

### Rules between modules

- A module imports another only through its `index.ts`, never its internal files.
- Allowed dependencies are declared in `MODULE_DEPENDENCIES` in `eslint.config.js`. Every module may depend on `business` for the active workspace, and `business` depends on `account`. Nothing else crosses over.
- Where two modules must cooperate, they meet in a layer above them. The assistant needs KPI figures, so it declares a `BusinessFactsProvider` port, and `src/composition/createAppDependencies.ts` connects it to analytics. The assistant has no dependency on analytics.
- Records read receipts through a `ReceiptReader` port. The composition root connects it to the assistant's AI service, as it does for `BusinessFactsProvider`.
- Receipts, product photos and logos go through one `BusinessFileStore` (`src/core/files`, implemented in `core/supabase`), which each module that attaches files receives through its dependencies. Files live under `<business id>/<folder>/` in the private `business-files` bucket, and storage rules apply the business permission of the data each folder belongs to.
- Writes refresh other modules without coupling them: all business data is cached under `businessScope(id)`, so invalidating that key refreshes every dependent screen (FR-E08).

## Database

### Separation

Each module has its own Postgres schema and its own migration file. A module's tables are written only by that module. Later migrations may react to earlier ones but never the reverse: for example, notifications run last and attach triggers to `learning.lessons`, so the learning module doesn't know notifications exist.

### Security model

**The database is the security boundary.** Route guards and hidden buttons exist for usability only, because anyone holding the publishable key can call the API directly.

- **Row-level security on every table**, going through the functions in `authz`, which is the single definition of who may do what.
- **Column-level grants.** Clients can update `full_name` but not `account_status`, and no client can write a sale's `status`.
- **State changes go through functions.** Voiding a sale or publishing a lesson is a named function that checks permission and validity. There is no `DELETE` grant on sales or expenses at all.
- **Private by default.** The foundation migration removes `PUBLIC`'s default execute right on functions, so each must be granted explicitly. `SECURITY DEFINER` functions pin an empty `search_path`.
- **Composite foreign keys** such as `(product_id, business_id)` make it structurally impossible for a sale to reference another business's product.
- **Append-only audit.** `audit.record_changes` is written by triggers and is not writable by any client.

`tests/database/schema-invariants.test.mjs` checks the rules that must hold for every object, including objects added later: RLS enabled, no `PUBLIC` execute, `search_path` pinned, and no `anon` access.

### Extending the platform

Industries are data, not code. Each business type (`platform.industries`, a subcategory in the Business Taxonomy) belongs to a main category in `platform.business_categories`. Staff add both on the Business types screen. A new type automatically gets the shared financial KPIs, and its own rows in `record_categories`, `activity_types` and `industry_kpis` add the rest. Forms, categories and dashboards adapt without any app change. Only a genuinely new kind of calculation needs a new `formula` in `analytics.evaluate_kpi`.

Activity types belong to an activity group (`platform.activity_groups`) and can carry extra form fields (`platform.activity_type_fields`), which the app draws as a form and the database checks in `operations.check_activity_details`. `operations.business_activity_types` gives a business everything its forms need, and owners switch types on or off with `operations.set_activity_type_enabled`. An activity's lifecycle lives in `status`, where `recorded` means completed, so every measure, which counts only recorded rows, ignores planned and cancelled work. Activities link to sales, expenses and products through a `RelatedRecordsSource` port that `src/composition` connects to the records module.

### Where calculations live

KPIs are calculated in SQL, in `analytics`. That gives one source of truth that clients can't alter and that an AI service can later read. Each KPI returns a value, a status (`actual`, `estimated` or `unavailable`) and an explanation, and it refuses to calculate when the data doesn't support it (FR-E15, FR-E16).

`generateInsights` in TypeScript only reads those results and describes them. It never performs a financial calculation of its own, and it labels each statement as a fact, an interpretation, a recommendation or a data-quality note (FR-E24).

### Adding a migration

Migrations are immutable once applied to a shared environment. Add a new timestamped file rather than editing an old one. A new function is private until granted, a new table must enable RLS, and `npm run test:db` fails if it doesn't.

## Leaving and erasure

Deactivating an account or requesting deletion is refused while the person owns a running business or is the only active administrator (`identity.assert_can_leave`). A request starts the retention period, stored in `platform.retention_settings`. After that, staff with `deletions.process` can erase it from `platform.admin_deletion_queue`. Nothing erases on a schedule, because it can't be undone.

Erasing an account keeps the profile row as "Deleted user", so records keep their `created_by`, and removes the personal data around it, including in Supabase's `auth` tables and the audit log. Erasing a business deletes it and everything that cascades from it, then removes the audit copies those deletes created. Any new table holding personal data must be added to `identity.admin_erase_account`.

## The AI boundary

The model is called only from Edge Functions in `supabase/functions`, which hold the API key. No client ever sees it.

- **`ask-verida`** reads the business's KPIs and records using the caller's own token, so row-level security decides what it can see. It returns structured JSON and never writes a business record. Suggested record values only fill in a form, which the user must still save (FR-G20).
- **`generate-lesson`** drafts from approved content and stores the result as pending review, using a function clients can't call. It refuses a draft that names content outside what it was given. Only a reviewer can obtain the context needed to regenerate.
- **Prompts and output contracts** are in `_shared/*-core.ts`, plain TypeScript tested under Jest. `_shared/claude.ts` makes the API call and treats a refusal, truncation or invalid output as a failure.
- **Fallback:** `FallbackAssistantGateway` uses `RuleBasedAssistantGateway` whenever the service is unavailable, unconfigured or over its hourly limit, and the app tells the user. Lessons fall back to `learning.request_weekly_lesson` in the same way.
- **Cost:** each account is limited per hour by `AI_HOURLY_LIMIT`, counted from `assistant.request_log`.

Administrators see request metadata only. Question text is stored only in the user's own conversation, which RLS keeps private to them.

## Plan schedule and reminders

Repeating tasks are generated by the database, not the app. `plan.materialise_occurrences` creates each occurrence of a series about a week ahead, with `(rule_id, occurrence_on)` unique so that any number of runs gives the same result. It runs when a series is created, whenever someone opens the Plan tab (`plan.generate_occurrences`) and nightly (`plan.generate_all_occurrences`). `plan.schedule` returns tasks, events and the later occurrences a series will produce, leaving out any date that already has its task.

Reminders are delivered by `plan.send_due_reminders`, run every five minutes, through `notifications.deliver` with the type `task`. It claims each reminder with `for update skip locked`, so overlapping runs never send one twice, and it respects the person's task reminder setting and quiet hours in the business's time zone.

## Email

Notifications are written to `notifications.outbox` in the same transaction as the event that caused them. The `dispatch-email` function, run every minute by `pg_cron`, claims a batch, sends it through Resend and records each result. A failed send is retried up to five times before being marked failed, and each outcome updates `notifications.deliveries` (FR-H09). Supabase Auth's own messages, such as verification codes, go through its SMTP settings instead.

## Testing

| Suite | Command | Proves |
| --- | --- | --- |
| Database | `npm run test:db` | The SQL itself on real Postgres: RLS, tenant isolation, role permissions, every KPI formula |
| Integration | `npm test` | Real repositories and real supabase-js against the real migrations, through an emulated API: column names, function arguments and response schemas all match |
| Edge | `npm run test:edge` | Real functions under Deno, with fake Claude and Resend: request shape, access checks, quota, fallback, draft validation and email retries |
| Live | See `live-supabase.test.ts` | Real repositories against a real project. Run on demand, because it writes to that project. `live-cleanup.sql` removes what it creates |
| ViewModel | `npm test` | Screen logic with fake repositories: validation, permissions, error handling, cache clearing |
| Unit | `npm test` | Validation, insights, assistant rules, error mapping, contrast of the palette |

### What the emulator can't prove

`tests/integration/emulator.mjs` stands in for Supabase so that all of this runs without Docker. It is an approximation written for this project, not PostgREST or GoTrue, and the live suite has already caught a difference it missed: how upserts treat column grants. **Run the live suite after any migration that changes grants.** The fake model in the edge tests also proves only the wiring, not the quality of real answers or lessons.

## Viewing before editing

Opening anything from a list shows its profile, read-only, with an Edit button and any actions such as Void. A route's `[id]/index.tsx` is the profile and `[id]/edit.tsx` the form, and each module has a detail ViewModel beside its form ViewModel. Forms only edit. Screens that hold their details alongside other work, such as My account or a staff member's view of a user, show them read-only with an Edit button on that panel. The one exception is reviewing a lesson, where correcting the text is the task itself.

## Choosing from lists

`SelectField` and `MultiSelectField` share `OptionSheet`, which adds search for nine or more options. `allowOther` accepts a typed answer, and a value outside the options still displays. Several answers to one question are stored in one text column with `joinChoices` (`core/forms/choices.ts`), so older single answers still read correctly.

A sale, expense or activity keeps one category or type, because a figure counted under two would be counted twice in reports. A category typed under Other joins the list for next time. Every sale and expense is also reported under one universal category from `platform.finance_categories`, which the database derives from the chosen name (`records.universal_category`) and stores in `category_code`. `records.category_options` lists what a business can choose, with each option's group. Filtering can use several categories at once.

Countries and currencies are plain data in `core/geo/countries.ts`, generated from the MIT-licensed `countries-list` package. A country suggests its currency, and the person can choose another.

A business has a main type (`industry_code`) and any number of others (`additional_industries`), plus a typed description (`other_type`). Setup asks for a category first and then a type within it, and `platform.is_selectable_industry` decides which types can be chosen. Categories, activities and measures come from all of them. Only the main type's highlights lead the dashboard, and lessons and the assistant use the main type. `business.all_industries` is the one place that combines them. A type can be removed only while no activity record depends on it.

## Look and motion

Everything visual lives in `src/design-system`, so a view asks for a `HeroCard` or an `EmptyState` and never draws its own gradient or animation. The aim is calm: one typeface, one soft shadow, the five palette colours, and a picture only where it helps.

- **Type:** Inter, loaded as one family with five weights in `theme/fonts.ts`, so `fontWeight` picks the face. If it fails to load, the app carries on with the system font.
- **Pictures:** original artwork in `assets/illustrations` and `assets/scenes`, drawn from the SVG sources in `assets/source`. `IllustrationName` and `SceneName` list what exists. Pictures are decorative unless given a label, so screen readers skip them, and text on a picture sits on a dark wash that keeps it readable.
- **Motion:** `components/motion.tsx`, using Reanimated. Content arrives with `entrance()`, values grow into place, and tappable surfaces respond to a press. Animations last half a second at most, apart from the loading pulse and the sign-in picture's slow drift. All of it follows the device's reduced motion setting, and any new loop must check `useReducedMotion` itself.
- **Buttons:** views import `Button` from the design system rather than Paper, for a consistent touch target.
- **Headers:** tabs use a gradient. Stack screens use the solid brand colour, because a native header would have to become transparent, with its content moved beneath it, to show one.

### The website on a wide window

The same screens serve the app and the website. On the web, a window at least 1024px wide (`useWideLayout`) gets a desktop layout following the prototype in `docs/requirements`: a sidebar instead of tabs (`WebShell`, connected in `src/composition/WebShells.tsx`), a page title in place of the coloured header, wider pages, forms kept to a reading width (`<Screen variant="form">`), short fields two to a row (`FieldGrid`), panels side by side (`Columns`, `CardGrid`), lists as tables (`DataTable`), pickers as dialogs, and a split sign-in screen. Everywhere else, including the website on a phone, each of these renders exactly as the mobile layout, so a change for the website can't alter the app. Keep it that way: a view that needs a different website layout branches on `useWideLayout()` and leaves its mobile path untouched.

Expo Go shows the app icon rather than the splash screen, so check the splash on a real build.

## Testing on a phone without a development server

The app is published to the `veridaapp` Expo project with EAS Update, on the `go` channel, so a phone can open it through Expo Go from anywhere. `EXPO_GO_UPDATE=1` gives the update the runtime version Expo Go requires (`app.config.js`), and store builds keep the normal policy. The project isn't in git, so `EAS_NO_VCS=1` is needed too.

```powershell
$env:EAS_NO_VCS='1'; $env:EXPO_GO_UPDATE='1'
eas update --channel go --platform ios --environment preview --message "What changed"
```

Then open `exp://u.expo.dev/0bb37f94-8f9a-47c3-b404-0211d1b4f3dc?runtime-version=exposdk%3A58.0.0&channel-name=go`.

`EXPO_PUBLIC_` values come from the `preview` environment on Expo, not from `.env.local`. They are built into the app and anyone can read them, so only ever put the publishable key there.

## Conventions

- **Dates** are `YYYY-MM-DD` strings wherever they represent a business day, so no timezone can move a record to another day.
- **Errors** cross layers only as `AppError`, with a message written for the user. Provider messages never reach the screen.
- **Money** is `numeric` in the database and is formatted only in presentation.
- **Every operation reports its outcome** through `useFeedback` (section 7).
- **Sign-out clears the query cache**, so the next person on a shared device can't see cached data.
