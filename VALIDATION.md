# Validation: 7 October 2026

- 9/9 offline backend tests passed using Node and mocked Apps Script/Drive/Sheets services.
- Frontend and Apps Script source passed JavaScript syntax checks.
- Chromium checks passed at desktop (1365 × 900) and mobile (390 × 844) sizes with no page JavaScript errors or mobile document overflow.
- Browser checks covered login/session handling, password clearing, outbound labels, SKU autofill, email input identifiers, interrupted response retry with the same request ID, headerless CSV imports, Excel imports using the site's actual SheetJS 0.18.5 dependency, leading-zero SKU/lot values, no-expiry handling, expiry-date import, quantity validation, form clearing across brands and logout.
- The original embedded logo is byte-for-byte unchanged. The original backend URL is removed; the frontend uses config.js.
- Preview screenshots use synthetic Example Brand data.

- The deployment owner's `checkConfiguration` output reported database `01 ASN Main database`, archive folder `ASN` and time zone `Asia/Bangkok`.
- The new public `/exec` endpoint returned `{"success":true,"service":"Speedship ASN","version":2}` on 7 October 2026. `config.js` is configured with that deployment URL.

Not verified live: authenticated customer flows, Google-native template copies and actual PDF rendering, destination-folder write access, notification delivery, GitHub Pages publishing, DNS/HTTPS, and the existing LINE integration. No live submissions, database writes, emails or LINE messages were made. Follow the controlled live checks in README.md before cutover.
