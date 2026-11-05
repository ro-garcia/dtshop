# Supabase login implementation plan

Scope approved in conversation: real password login, persistent session, logout, partner role lookup; user fills URL/public key. Existing business modules remain local/demo.
Approach: official browser SDK with pinned version; separate configuration and auth controller, existing static hosting retained. No server or build conversion needed. No demo fallback. Roles come from dtshop.app_user, never editable metadata.

- [x] Add mocked browser regression covering missing config, wrong credentials, both partner roles, forbidden/inactive profiles, reload and logout.
- [x] Add configuration and auth controller; wire existing admin visibility to verified profile; remove demo token access; distinguish local data from real identity.
- [x] Document setup and hosted verification; run tests and independent review.

Execution: inline, preserving all existing uncommitted work. Session errors close the panel; dialogs close on sign-out. Catalogue editing restricted to operations; accounting remains explicitly a demonstration until its RPC integration. No live credentials available, so hosted verification remains for user configuration.

Validation: mocked auth browser tests and existing admin/accounting/cash browser suites. Review corrections: preserve drafts during background auth verification, restrict finance social video controls. Hosted test pending user configuration.
