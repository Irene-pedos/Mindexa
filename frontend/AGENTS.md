# Repository Guidelines

## Project Structure & Module Organization
This frontend is a Next.js App Router app. Route entries live in `app/`, with role-based areas under `app/admin`, `app/lecturer`, and `app/student`, plus auth pages such as `app/login` and `app/signup`. Reusable UI primitives live in `components/ui`, product-specific building blocks live in `components/mindexa` and `components/sections`, shared hooks live in `hooks/`, and API/service helpers live in `lib/` and `lib/api/`. Static assets belong in `public/`.

## Build, Test, and Development Commands
- `npm run dev`: start the local dev server at `http://localhost:3000`.
- `npm run build`: create the production build and catch type or route-level issues.
- `npm run start`: serve the production build locally after `npm run build`.
- `npm run lint`: run ESLint with the Next.js core-web-vitals and TypeScript rules.

Use `npm` for consistency because both `package-lock.json` and `node_modules/` are present in the repo.

## Coding Style & Naming Conventions
Use TypeScript for all new code. Follow the existing pattern of 2-space indentation, single-responsibility React components, and the `@/` path alias from `tsconfig.json`. Name React components in `PascalCase`, hooks as `useX.ts`, and API modules by domain, for example `lib/api/student.ts`. Prefer Tailwind utility classes in JSX and reuse shared helpers from `lib/utils.ts`. Keep lint clean before opening a PR.

## Testing Guidelines
There is no dedicated test runner configured yet. Until one is added, treat `npm run lint` and `npm run build` as required validation for every change. When adding tests, place them next to the feature or in a nearby `__tests__` folder, and use `*.test.ts` or `*.test.tsx` naming.

## Commit & Pull Request Guidelines
Recent history uses short, imperative summaries such as `update on dashboards` and `big changes in frontend`. Keep commit messages brief, present tense, and focused on one change area. For pull requests, include:
- a clear summary of what changed
- linked issue or task reference when available
- screenshots or short recordings for UI changes
- notes about new env vars, API dependencies, or manual verification steps

## Configuration Notes
Keep secrets in `.env.local`. Document new variables in the PR and align API-facing changes with `lib/api/client.ts` and `AUTHENTICATION_SETUP.md`.
