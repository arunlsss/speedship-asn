# Speedship ASN migration

This package preserves the supplied single-file site's branding, Thai form, customer login, brand rules, SKU autocomplete and CSV/Excel import. It adds inbound/outbound selection and a new compatible Apps Script backend. It is prepared for `https://asn.speedshipsolution.com` but has **not been deployed**.

The supplied repository contains `index.html` only. Its original Apps Script code and LINE configuration were not supplied. `backend/Code.gs` is a new backend, not a recovered copy of that missing source. Do not replace an existing LINE webhook with this ASN API.

## Archive behavior

Database: https://docs.google.com/spreadsheets/d/1Kgy8JoioazRK3jlWBqhu5XH0F-MhAmmtIq2O6Z4zZpM/edit

Destination: https://drive.google.com/drive/folders/1MjEjuz758C27CzLQeZwxCUTbDbTpanzB

| Folder | Files for each submission |
| --- | --- |
| `[Destination]/[Brand]/Inbound/` | `[Brand] YYYY-MM-DD 001` (native Google Sheet), `[Brand] YYYY-MM-DD 001.pdf` |
| `[Destination]/[Brand]/Outbound/` | `[Brand] YYYY-MM-DD 001` (native Google Sheet), `[Brand] YYYY-MM-DD 001.pdf` |

The count restarts daily **per brand and direction**, using the submission date in **Asia/Bangkok**. Inbound and outbound can each have `001` because they live in different folders. The expected arrival/dispatch date is recorded inside the document and does not determine the archive filename. If a submission reserves a number but never finishes, that number remains reserved; numbering may contain gaps.

Customer, Brand and SKU are read-only masters. `ASN_raw_format` supplies the existing document layout. The new backend does **not** append to `ASN_Document`, `ASN_Lines`, `ASN_History >>`, or create history tabs in the main database. Existing history is untouched. Only these four master/template tabs are needed by the new backend; keep the old tabs for the original app until cutover is complete.

For outbound, the form asks for recipient company, address, contact and telephone. The archive swaps the source template's warehouse/customer contact blocks. The existing brand-required fields apply to both directions; no master columns are changed. The archive contains copied template pages with up to 20 items per tab, plus a hidden `Submission_Data` tab holding the exact submitted data. The PDF exports the visible form tabs. Maximum 200 items and 20 combined email recipients per submission.

Both files must be saved before success is returned. Clicking retry with unchanged fields reuses the same request ID; a failed PDF export resumes against the existing Sheet. A completed request does not create duplicate files or resend notifications on retry. Retry recovery is persisted in the archive file descriptions, not the main database. The browser retains the request ID in memory for the current page; after an ambiguous response, **retry without refreshing or changing fields**. A reload starts a new attempt, so check the archive before resubmitting after a reload.

## 1. Deploy the Apps Script backend

1. Use the Google account that will operate ASN. It needs permission to read the database and create/move files in the destination folder. The connected account used during preparation received a not-found response for the destination; this can mean it lacks permission. Confirm the exact folder opens in the deployment account, and grant it appropriate access if necessary. The code never falls back to another destination or makes files public.
2. Create a **new standalone Apps Script project** at https://script.google.com/. Keep the existing ASN backend running until cutover is verified. Paste `backend/Code.gs` into `Code.gs`.
3. In Project Settings, enable “Show appsscript.json manifest file in editor”. Replace the manifest with `backend/appsscript.json`.
4. Run `checkConfiguration` manually and authorize the requested Google permissions. It reads the masters and archive folder, with no submissions, emails or LINE messages. Check that it reports the intended database, folder and Bangkok time zone.
5. Deploy → New deployment → Web app. Set **Execute as: Me** and **Who has access: Anyone**, because the existing site uses its own Customer username/password rather than a Google sign-in. A Workspace administrator may restrict public web apps. If this access option is unavailable, ask the Workspace administrator before going live.
6. Copy the deployment URL ending in `/exec`. Edit `config.js`:

   ```js
   window.ASN_CONFIG = { apiUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec' };
   ```

7. Opening this URL should return a JSON service/version response. Test a Customer account in the new frontend before changing the LINE menu URL. No deployment secrets or LINE tokens belong in the repository.

The package's `config.js` now points to the new Apps Script deployment supplied on 7 October 2026. Its public service check returned `{"success":true,"service":"Speedship ASN","version":2}`. The deployment owner also ran `checkConfiguration`, which reported database `01 ASN Main database`, archive folder `ASN` and time zone `Asia/Bangkok`. Keep this configured `config.js` when publishing the frontend. This is Apps Script, so **Firebase login/deploy commands are not needed** for this package.

The source Customer sheet's current password format is preserved. The new API issues a random, expiring session after login and checks active accounts/brand grants again on every protected action. Passwords and fixed recipient lists are not returned to the browser. Sessions may expire early if Apps Script evicts its cache; users can sign in again. Existing plaintext Customer passwords remain in the source sheet; this migration does not rewrite them.

## 2. Publish at asn.speedshipsolution.com

The matching public repository is https://github.com/sss-ph/sss-asn-submission. The connected GitHub account has read access and **no push/admin access**, so this package has not been committed or published there.

1. With a GitHub account that can write that repository, upload the package's `index.html`, configured `config.js`, `CNAME`, `.nojekyll` and `assets` to the root of its publishing branch. You can also commit `backend`, `tests` and this README for source tracking. Keep all credentials in Apps Script Script Properties.
2. In repository Settings → Pages, publish the intended branch's root. Set the custom domain to `asn.speedshipsolution.com` and enable HTTPS when its certificate is ready.
3. At the DNS provider, create:

   | Type | Name | Target |
   | --- | --- | --- |
   | CNAME | `asn` | `sss-ph.github.io` |

   Use `sss-ph.github.io` only if Pages is hosted under the `sss-ph` GitHub owner. If the site moves to another owner, use that owner's `<owner>.github.io` instead. Do not include a repository path in the DNS target. Existing DNS records for the same `asn` hostname must be reconciled by the domain administrator.
4. Verify both the new `/exec` API and the HTTPS custom domain before changing LINE links. The attendance website's domain and backend do not need changes.

## 3. LINE OA migration

The same Speedship OA can be retained. The supplied frontend has no LIFF SDK, channel token, webhook handler or LINE API calls, so its exact existing connection cannot be established from this repository alone.

| Existing connection | Migration |
| --- | --- |
| OA rich-menu button or message opens a website | Update that URI to `https://asn.speedshipsolution.com/` after HTTPS is ready. Keep the OA, followers and current webhook. |
| Existing LIFF app opens ASN | Keep its channel/LIFF ID, update its Endpoint URL in LINE Developers, and port the existing LIFF initialization if any. No LIFF login has been invented in this package. |
| Old backend sends OA messages | Review the original `Code.gs` and all helper files. The included optional Messaging API adapter can reuse the current channel's access token and the intended target user/group ID, but it does not reproduce unseen message routing or Flex Message layouts. |
| OA receives webhook events | Keep the current receiver unchanged. This backend is an ASN API, not a LINE webhook replacement. |

For an exact migration, supply the **existing Apps Script source and the type of LINE connection**. Do not paste channel access tokens in chat or commit them to GitHub.

Optional outbound notifications are **disabled by default**. To enable receipt emails for normal submissions, set Script Property `EMAIL_ENABLED` to `true`. Recipients come from the authenticated Customer row's `Fixed_Emails` plus valid optional receipt addresses. Email includes the PDF attachment; Drive links retain their existing folder permissions.

To enable the optional LINE summary after reviewing the intended destination, set these Script Properties:

| Property | Value |
| --- | --- |
| `LINE_ENABLED` | `true` |
| `LINE_CHANNEL_ACCESS_TOKEN` | Current OA Messaging API channel access token |
| `LINE_TARGET_ID` | Intended user or group ID the bot is permitted to message |

There is one configured LINE destination for this adapter. Existing per-customer/per-brand routing requires porting the original backend. A successful HTTP response means the LINE API accepted the push; it does not prove the recipient read the message. If a notification fails or its outcome is uncertain, the archive stays successful and retries do not automatically resend it. An operator should check delivery before any manual resend. Email/LINE quota limits still apply.

## Validation and cutover

Run offline tests with Node 18 or newer:

```sh
node --test tests/backend.test.cjs
```

Tests cover session/brand authorization, leading-zero SKUs, inbound/outbound counters, daily reset, unchanged retries across midnight, partial PDF recovery, interrupted final commits, malformed quantities/dates/emails, missing destination access, paginated data, literal spreadsheet text and notification opt-in. Tests use synthetic data and mocked Google services; they do not write to the live database or Drive.

Before cutover, perform controlled live checks under the deployment account:

1. Leave email/LINE notification properties disabled. Submit one authorized inbound and one outbound test using clearly identified test PO references.
2. Confirm the correct brand/direction folders, matching Sheet/PDF names, warehouse/recipient blocks, quantities, leading-zero SKUs and a long submission spanning multiple template tabs. Open the real PDF and check all pages. Native template images, merged cells and PDF layout need this live check; offline mocks cannot verify them.
3. Verify new submissions create no database history rows or tabs. Retry an unchanged request and confirm no duplicate files. Verify a disabled customer or unauthorized brand cannot submit.
4. Confirm archive sharing matches your intended audience. No public sharing is added. Enable the intended receipt/LINE behavior only after the configuration and recipient checks.
5. Publish the custom domain, update the OA link, and retain the old deployment for rollback. For rollback, restore the previous frontend/API URL and OA link; newly archived Drive files remain available.

The app uses a script-wide lock to serialize number allocation and archive generation. During concurrent submissions, other users may receive a retry message. If ASN volume grows beyond Apps Script execution, Drive or notification quotas, use a queued backend while retaining the same archive format.

Official references:

- Apps Script web apps: https://developers.google.com/apps-script/guides/web
- Google template-to-PDF pattern: https://developers.google.com/apps-script/samples/automations/generate-pdfs
- GitHub custom domains: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- LINE rich menus: https://developers.line.biz/en/docs/messaging-api/using-rich-menus/
- LIFF configuration: https://developers.line.biz/en/docs/liff/registering-liff-apps/
- LINE push messages: https://developers.line.biz/en/reference/messaging-api/#send-push-message
