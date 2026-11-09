# Admin Realtime Implementation Plan

> Execute inline using superpowers:executing-plans. The user's “hazlo” authorizes implementation of the agreed scope.

**Goal:** Refresh admin data across sessions, excluding Content and Settings.
**Architecture:** One authenticated Postgres Changes channel, explicit table routing and a serial queue per module. Adapters reread authoritative data, checking session and interaction state before applying it.
**Tech Stack:** Existing vanilla JavaScript, Supabase JS 2.49.8, Node test runner.
**Spec:** ../specs/2026-11-08-admin-realtime-design.md

## Constraints and decisions

- Preserve current user changes in admin.html; work in this checkout so the result is available here.
- No new runtime dependencies, database permission changes or production writes.
- Table list matches sql/admin-realtime.sql; never route content/settings events.
- Keep manual refresh. Only defer the affected module; retain a queued refresh during editing, requests and writes.
- Do not claim live cross-session validation without authenticated access.

## Review focus

Reconnect gaps; events during in-flight reads; logout followed by login as the same user; editing begun while a response is pending; finance cache invalidation while its previous request is pending.

## Tasks

- [x] 1. Add failing Node tests for authenticated channel lifecycle, routing/exclusions, event coalescing, pending work, errors and reconnection. Implement admin-realtime.js with register(name, {refresh, blocked}), request(name), canApply(name), and session-bound refresh contexts.
- [x] 2. Add guarded background adapters to admin.js, orders.js, finance-api.js and finance-approvals.js. Reuse existing renderers and preserve filters/notes/details. Protect financial renders that finish after the user starts editing. Test session changes and cache freshness.
- [x] 3. Load the coordinator before adapters in admin.html; show a discreet connection status. Update the integration guide with two-session verification steps and known database prerequisites.
- [x] 4. Run Node tests, JavaScript syntax checks and browser integration checks where tooling is available. Perform an independent review and fix important findings. Leave changes reviewable in the current workspace without publishing.

## Execution record

- Initial checkout has user edits in admin.html and untracked .vscode, docs and sql. No existing test suite or package manifest is present.
- Coordinator: missing implementation produced 8 failing tests, then 8 passed. Added asynchronous channel-removal regression, observed failure and fixed with unique topics per connection attempt.
- Finance: observed failures for an old in-flight snapshot and an interaction-blocked refresh; fixed cache invalidation and guarded application. Added a failing dependent-view error test and made refresh await all financial views.
- Browser: Edge with simulated Supabase passed routing, bursts, editor drafts, late responses, order search/notes/details, deletions, financial snapshot reuse, excluded modules, reconnect and logout.
- Independent review identified a deleted selected account causing repeated ledger errors. Added a browser test that failed, reset selection to a surviving account or empty state, and reran successfully. No other important findings.
- Final Node suite: 13 tests passing. No live database writes, deployment, commits or permission changes performed.
