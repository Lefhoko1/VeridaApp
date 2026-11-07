This is the Verida Expo app. Read `docs/ARCHITECTURE.md` before changing code, and update `docs/TRACEABILITY.md` when a requirement's status changes.

## Rules

- MVVM with repositories. Views render a ViewModel; ViewModels hold state and commands; only a module's `data/` folder may touch Supabase. `npm run lint` enforces this, so fix the design rather than disabling the rule.
- Modules import each other only through `index.ts`, and only as allowed by `MODULE_DEPENDENCIES` in `eslint.config.js`.
- Routes in `src/app` hold navigation only, with no business logic.
- The database is the security boundary. Any new table needs RLS, and any new function needs an explicit grant. `npm run test:db` checks this.
- Never edit a migration that has reached a shared environment. Add a new one.
- Run `npm run verify` before declaring work done.

## Expo

Expo ships breaking changes every SDK release, so check the docs for the version in `package.json` (https://docs.expo.dev/versions/) rather than relying on memory.

- Install packages with `npx expo install <package>`, which picks SDK-compatible versions.
- `ios/` and `android/` are generated. Configure native behaviour through `app.json` and config plugins.
- Native modules outside Expo Go need a development build.

## This machine

If `NODE_ENV=production` is set, npm skips dev dependencies. Use `npm install --include=dev`.
