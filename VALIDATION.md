# Firebase migration validation — 8 October 2026

- 12 backend checks passed: brand requirements, input/date validation, preserved leading zeros, Firebase identity, receipt/download ownership, Bangkok date boundaries, concurrent duplicate submissions, existing archive sequence reservations, worker leases, Sheets/PDF recovery, notification ambiguity, secret-free receipt responses and login throttling.
- 5 portal/dashboard DOM checks passed: script syntax, queued-to-saved state, recovery after lost responses, stable retry IDs, preparation-error cleanup, management filters/counts and safe rendering of untrusted text.
- Production frontend bundle builds successfully; cloud function exports load successfully.
- Firebase security rules compile and deny all direct browser database access.
- Visual browser inspection is unverified: the computer-use browser could not verify its enforced access policy for either the live site or localhost preview. No alternate browser was used to bypass that restriction.
- Live Google Drive access, native file/PDF rendering, customer login, Google management login, notification delivery and custom-domain cutover are pending required connection checks. Unit/DOM tests are not a substitute for these live checks.
- Test fixtures are synthetic. No real customer submission, email or LINE message was sent by validation.

Firebase staging deployment completed successfully. Both `asnApi` and `processAsn` are deployed as Node 22 functions in Singapore. Hosting URL: https://speedship-asn-cloud.web.app

Live transport checks passed: Hosting `/api/health` returns 200; unauthenticated session and download requests return 401 JSON. Only the customer API uses public Cloud Run transport; the worker remains private.
