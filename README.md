# Verida

Your intelligent business companion. A cross-platform app that helps small business owners capture records, understand their performance and learn as they go.

Built with Expo, React Native Paper and Supabase, using MVVM with repositories. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing code, and see [docs/TRACEABILITY.md](docs/TRACEABILITY.md) for the status of each requirement.

## Getting started

Requires Node 22 or later.

```sh
npm install
```

> If your machine sets `NODE_ENV=production`, npm skips dev dependencies without warning, and `jest` and `eslint` will be missing. Run `npm install --include=dev` instead.

There are two ways to run the app.

### Option A: local backend (no account or Docker needed)

Runs the real migrations on an in-memory Postgres behind an emulated Supabase API. Data is lost when it stops, and **every emailed code is `123456`**.

```sh
# Terminal 1. Add "-- --demo" for sample businesses and an account that is owner, reviewer and
# administrator, signing in as demo@verida.test / Verida2026
npm run dev:backend
```

```sh
# Terminal 2: create .env.local containing
#   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local
npm run web
```

The address `127.0.0.1` only works on the same machine, so use the web target with this option. A phone needs a real Supabase project (option B), or the emulator's address changed to one the phone can reach.

To try the reviewer flow, make an account a reviewer:

```sh
curl -X POST http://127.0.0.1:54321/__emulator/grant-role -d '{"email":"you@example.com","role":"learning_reviewer"}'
```

### Option B: a Supabase project

1. **Create a project** at [supabase.com](https://supabase.com).
2. **Apply the migrations:**
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --remote
   ```
3. **Apply the project settings.** Preview with `npx supabase config diff`, then run `npx supabase config push`. This exposes the module schemas, without which every request fails with an "Invalid schema" error. It also sets 6-digit email codes, which the app requires (new projects default to 8).
4. **Set up email.** The app verifies codes rather than links, so Confirm signup, Reset password and Change email address must contain `{{ .Token }}`. Free-tier projects can't edit templates on Supabase's built-in email, so first add a custom SMTP provider under Authentication > SMTP. Then uncomment the template sections in `supabase/config.toml` and run `npx supabase config push`, or copy the files from [supabase/templates/](supabase/templates/) into Authentication > Email Templates.
5. **Configure the app:** copy `.env.example` to `.env.local` and fill in both values.
6. **Run it:** `npm start`, then open it on a device or simulator.

### Turn on the server-side features

1. **Assign the first administrator** in the SQL editor. After this, administrators assign roles and individual permissions on the Roles screen, under My account > Verida platform.
   ```sql
   insert into authz.platform_role_assignments (user_id, role)
   select id, 'administrator' from identity.profiles where email = 'you@example.com';
   ```
2. **Deploy the functions:** `npx supabase functions deploy ask-verida generate-lesson dispatch-email --use-api --remote`
3. **Set the secrets** in your own terminal, so that they never appear anywhere else:
   ```sh
   npx supabase secrets set ANTHROPIC_API_KEY=your-key
   npx supabase secrets set RESEND_API_KEY=your-key
   ```
   Optional: `EMAIL_FROM` (a sender on your verified Resend domain), `ANTHROPIC_MODEL` (defaults to `claude-opus-5-5`) and `AI_HOURLY_LIMIT` (requests per user per hour, defaults to 30).
4. **Schedule the background jobs:** replace `PROJECT_REF` in [supabase/setup/schedule_jobs.sql](supabase/setup/schedule_jobs.sql), then run it in the SQL editor.

The app works without steps 2 to 4. Ask Verida and lessons use built-in rules and approved content, and emails wait in a queue.

### Demo data

[supabase/dev/load_demo_data.sql](supabase/dev/load_demo_data.sql) gives an existing account the prototype's two demo businesses with 45 days of records. Development only.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run web` | Run in a browser |
| `npm run dev:backend` | Start the local emulated Supabase |
| `npm run typecheck` | Type check |
| `npm run lint` | Lint, including the architecture rules |
| `npm test` | Unit, ViewModel and repository integration tests |
| `npm run test:db` | Database tests: migrations, RLS, KPIs |
| `npm run test:edge` | The Edge Functions under Deno, with fake Claude and Resend servers |
| `npm run verify` | Type check, lint, `npm test` and `test:db`. Run before every commit |

## Project layout

```
src/
  app/             Routes only: navigation and which screen goes where
  composition/     Composition root: wires modules to their implementations
  core/            Cross-cutting tools with no knowledge of any module
  design-system/   Theme and shared UI built on React Native Paper
  modules/         One folder per business module
    <module>/
      domain/        Models, repository interfaces, validation (plain TypeScript)
      data/          Repository implementations (the only code that talks to Supabase)
      presentation/
        viewmodels/  State and commands for a screen
        views/       Screens that render a ViewModel
      index.ts       The module's public API
supabase/
  migrations/      Postgres schemas and changes, named by module
  functions/       Edge Functions: the AI service and email dispatch
  setup/           One-time setup for a hosted project
  templates/       Email templates
  dev/             Development-only scripts
tests/
  database/        Tests of the SQL itself, on real Postgres (PGlite)
  integration/     Real repositories and supabase-js against the emulator
  edge/            Real Edge Functions under Deno, with fake upstream services
docs/
  requirements/    The specification, prototype and colour palette
```
