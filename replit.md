# MED-A Study Companion

MED-A generates focused, payment-gated revision questions in a warm notebook-style study experience.

## Run & Operate

- `pnpm run start:local` — build and start MED-A at `http://127.0.0.1:5000/`
- `pnpm --filter @workspace/api-server run dev` — run the API service in the Replit workspace
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Question generation uses the Ollama server on the same computer; no hosted AI API key is required.
- Optional environment variable: `OLLAMA_BASE_URL` — local Ollama address; defaults to `http://127.0.0.1:11434`.
- Optional environment variable: `OLLAMA_MODEL` — exact installed Ollama model name; when omitted, the first installed model is selected.
- Subscription verification uses the reference endpoint `https://api.zetubridge.co.ke/verify-access` with the saved `user_email` and `device_id`
- Optional env: `VITE_SUBSCRIPTION_URL` — checkout URL shown in the subscription guide
- Windows setup steps are in `LOCAL-WINDOWS.md`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: Vite frontend and esbuild-bundled Express API

## Where things live

- `artifacts/med-a/src/App.tsx` — setup form, local-storage subscription gate, notebook question pages, and recap
- `artifacts/med-a/src/index.css` — paper, book-page, ruling, and motion styles
- `artifacts/api-server/src/routes/study.ts` — subscription verification and question generation
- `scripts/start-local.mjs` — starts the built API and frontend together on the laptop
- `LOCAL-WINDOWS.md` — step-by-step Windows setup
- `lib/api-spec/openapi.yaml` — source of truth for study and access API contracts
- `REFER HERE HOW PAYMENT IS CHECKED` — payment/access behavior reference

## Architecture decisions

- Subscription identity is read from `user_email` and `device_id` in local storage, matching the reference flow; neither is collected in a form.
- Question generation is blocked both in the UI and on the API route until the configured subscription verifier confirms access.
- Question generation runs through the local Ollama server. Subscription verification remains online and is not bypassed for laptop use.
- The subscription verifier follows the reference response contract: `access === true` grants access, `disabled === true` blocks the account, and unknown or missing access fails closed.
- Question pages use a book-page surface with paper grain and ruled writing space instead of a dashboard card layout.

## Product

- Students complete department, course, level, module, and topic context before starting.
- Students choose MCQ, short-answer, or long-answer practice and receive generated questions.
- Each question supports answer reveal, explanation, progress tracking, and a recap.
- Subscription guidance explains the three-step checkout flow and checks saved access automatically.

## User preferences

- Do not add manual email or account-ID fields; use the existing local-storage identity flow.

## Gotchas

- If the direct ZetuBridge access service cannot be reached, the API intentionally returns `SUBSCRIPTION_UNAVAILABLE` rather than allowing question generation.
- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
