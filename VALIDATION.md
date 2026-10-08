# Firebase migration validation — 8 October 2026

- 12 backend checks passed: brand requirements, input/date validation, preserved leading zeros, Firebase identity, receipt/download ownership, Bangkok date boundaries, concurrent duplicate submissions, existing archive sequence reservations, worker leases, Sheets/PDF recovery, notification ambiguity, secret-free receipt responses and login throttling.
- 5 portal/dashboard DOM checks passed: script syntax, queued-to-saved state, recovery after lost responses, stable retry IDs, preparation-error cleanup, management filters/counts and safe rendering of untrusted text.
- Production frontend bundle builds successfully; cloud function exports load successfully.
- Firebase security rules compile and deny all direct browser database access.
- Visual browser inspection is unverified: the computer-use browser could not verify its enforced access policy for either the live site or localhost preview. No alternate browser was used to bypass that restriction.
- Live owner OAuth and archive/master/template access passed. Inbound (21 lines, 2 A4 pages) and outbound (2 lines, 1 A4 page) native Sheets/PDF/Excel checks passed, including duplicate-file reuse, leading-zero SKU preservation and visual PDF inspection of Thai text, totals and swapped sender/recipient details. SKU width and address wrapping were corrected on generated copies; the master template remains read-only.
- Live customer login, Firebase token exchange, session, authorized SKU loading and own receipt history passed. Customer access to management was correctly denied. Credentials stayed in memory and were not printed.
- Google management login in the browser, actual notification delivery and custom-domain cutover remain unverified. Unit/DOM tests are not a substitute for these live checks.
- Test fixtures are synthetic. Native file/worker fixtures created no real customer shipment and sent no email or LINE message. A separately approved owner-only test email was sent after Gmail setup; its acceptance is documented below.

Firebase staging deployment completed successfully. Both `asnApi` and `processAsn` are deployed as Node 22 functions in Singapore. Hosting URL: https://speedship-asn-cloud.web.app

Live transport checks passed: Hosting `/api/health` returns 200; unauthenticated session and download requests return 401 JSON. Only the customer API uses public Cloud Run transport; the worker remains private.

A temporary verification-only Firestore record was created and immediately removed. Both create/delete events reached the private worker and returned HTTP 204. The handler deliberately skipped ASN processing for this fixture; this checks event delivery without creating documents in Drive or sending notifications.

Firebase custom-domain preparation completed; the live CNAME still points to GitHub Pages. Exact certificate/DNS requirements are documented in `DNS-CUTOVER.md`.

The deployed worker completed an isolated synthetic queued-to-saved receipt and created valid native Sheet/PDF/Excel files. The test used an existing authorized customer identity, a preselected validation folder, and explicit skipped notification states. It did not reserve a customer ASN sequence. The temporary receipt was removed after verification.

All synthetic archive files were moved to Drive trash by verifying the fixture folder name and its archive parent before cleanup. Generated local PDFs are excluded from version control.

Owner approval for Gmail sending was saved securely, and the refresh credential was verified to contain Drive, Sheets and Gmail send scopes. Receipt email is enabled in deployment configuration. The separately approved test email was accepted by Google; inbox verification remains pending. LINE remains disabled pending configuration.

The active deployed worker pins workspace credential version 3, with receipt email enabled and LINE disabled. Google accepted the approved `[TEST] Speedship ASN Firebase` email to `arun.l@speedshipsolution.com`, with the verified synthetic inbound PDF attached. No other recipients were used. A local attempt record prevents automatic resending. Owner inbox confirmation remains pending. API health is 200 and unauthenticated session requests remain 401 after deployment.
