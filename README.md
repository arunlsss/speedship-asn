# Speedship ASN — Firebase migration

Project: `speedship-asn-cloud`, region: `asia-southeast1`.

## Behavior

- Customer portal preserves the existing brand requirements, SKU lists, inbound/outbound form and logo.
- Existing Customer usernames and passwords are validated server-side against the read-only master sheet. Firebase custom authentication then manages the customer session. No passwords are stored in Firestore or sent back to the browser.
- Submissions are accepted into Firestore with a unique, stable request ID. A background worker creates native Google Sheets and PDFs under `ASN/<Brand>/<Inbound|Outbound>`. Numbering reserves existing archive numbers and uses Bangkok dates.
- Retries reuse the original receipt, Sheet and PDF. Spreadsheet content is written with RAW values to prevent formulas executing from user text. The master database is never written to or exported.
- `/management` requires Google sign-in and a verified email in the `ASN_ADMIN_EMAILS` Secret Manager list. It shows submission progress, file downloads and email/LINE delivery state separately. The owner's email remains authorized. Keep the real manager list out of source and frontend files; redeploy the API after changing its secret version.
- Management has ASN details, Confirm and Reject actions, and a review-status filter. Only authorized managers can decide once Sheets/PDF are ready. Rejection requires a reason; decisions retain the reviewer and Bangkok display time. Concurrent decisions are atomic, and retries after a lost response reuse the original review ID. Older Firebase records start as pending. Customer history shows the decision and reason; saved documents and delivery status remain separate from business acceptance. Decisions do not send additional email/LINE messages or claim warehouse receipt.
- All Firestore browser reads and writes are denied. The API enforces live customer/brand grants and receipt ownership for every status request and download.
- Receipt email is enabled after the owner approved Gmail sending permission. LINE remains disabled until its live connection is configured. An unconfirmed notification cannot undo saved files. Ambiguous email delivery is never automatically resent.

## Build and test

```sh
npm ci
npm --prefix functions ci
npm test
npm run build
firebase deploy --only functions,firestore,hosting --project speedship-asn-cloud --force
gcloud run services update asnapi --region=asia-southeast1 --project=speedship-asn-cloud --no-invoker-iam-check
gcloud run services add-iam-policy-binding processasn --region=asia-southeast1 --project=speedship-asn-cloud --member=serviceAccount:asn-runtime@speedship-asn-cloud.iam.gserviceaccount.com --role=roles/run.invoker
```

`--force` accepts the explicitly configured worker retry policy. Never change the project to Attendance or Nakama. Dependencies are pinned in lockfiles; functions run on Node 22.

The organization restricts IAM sharing outside its domain. The API uses Google's supported Cloud Run public transport setting instead of an `allUsers` IAM binding; protected actions require Firebase authentication. Run both gcloud commands after deployment and verify `/api/health` returns 200 and unauthenticated session/download requests return 401. Do not disable the check on `processAsn`, which stays private. Its trigger service account alone receives the service-level invoker grant in the final command. See [Google's public Cloud Run access documentation](https://docs.cloud.google.com/run/docs/authenticating/public).

## Google Drive connection

The current master database and archive folder IDs are in `functions/.env.speedship-asn-cloud`. The archive is confirmed as My Drive, owned by `arun.l@speedshipsolution.com`, from the owner's Drive view on 8 October 2026. The approved owner OAuth connection is saved in Secret Manager. Live master/template reads, native Sheets creation, PDF/Excel export, leading-zero SKU preservation and duplicate-file reuse were verified on 8 October 2026 using an isolated synthetic archive folder.

**Shared drive:** grant `asn-runtime@speedship-asn-cloud.iam.gserviceaccount.com` read access to the master sheet and content creation access to the existing ASN archive. Keep `ASN_WORKSPACE_OAUTH` as `{}`. The backend refuses to use service-account file ownership in My Drive.

**My Drive:** create an internal Google OAuth desktop client in this project and connect the existing archive owner with `scripts/connect-workspace.mjs`. The script first checks Cloud sign-in, then waits up to 15 minutes for the owner's Google approval. It verifies the approved account, puts refresh credentials directly in Secret Manager, and checks the master/template and archive access. A failed archive check does not discard an already saved owner connection. Do not paste credentials into chat, commit them, or put them in frontend config. The runtime reads only its own secret. Google Workspace may require administrator approval for Drive/Gmail scopes.

After granting access or saving credentials, redeploy functions to pin the new secret version. The owner verified Google management sign-in and the “ตรวจสอบการเชื่อมต่อ” connection check on 8 October 2026.

## Notifications

- The owner requested that LINE notifications be retained. Run `node scripts/connect-line.mjs` in the owner's Terminal. Supply the owner-controlled LINE Messaging API channel access token and the intended user/group/room ID through its hidden prompts. The old LINE Apps Script is managed by someone else and is not required for this connection. It verifies the bot account, destination access and message format without sending a message, stores both values directly in Secret Manager (`ASN_LINE_TOKEN` and `ASN_LINE_TARGET_ID`), grants only the runtime secret access, and enables the local LINE flag. Redeploy functions only after setup succeeds. Neither token nor destination belongs in the repository or chat.
- Management email authorization does not subscribe a person to LINE. The LINE destination is configured separately; the owner completed signed registration for the intended LINE group on 8 October 2026.
- For a group, enable **Allow bot to join group chats** in the OA’s Messaging API settings and invite it to the intended group. Run `scripts/connect-line-group.mjs` in the owner’s Terminal. It saves the channel secret through masked input, waits for the API’s signed `/api/line-webhook` endpoint, and gives a one-time setup code to post in that group. Only a valid LINE signature and an unexpired registration can capture the group. The script verifies group access, replaces the private destination secret, and removes the temporary registration. It sends no LINE message itself. The worker must then be redeployed to pin the new destination version. Ordinary group conversations are ignored and not stored.
- To stop the OA’s standard automatic response, open LINE Official Account Manager → Settings → Response settings and disable Auto-reply messages. Keep Webhook enabled. The ASN webhook never sends replies to ordinary conversations. See [LINE’s official guidance](https://developers.line.biz/en/docs/messaging-api/building-bot/).
- The signed group webhook and group notification destination are active. The worker pins workspace credential version 3, LINE token version 2 and group recipient secret version 2. Group access and message-format validation passed without sending a group test. New ASN notifications use a Flex card with ตรวจสอบรายละเอียด, ยืนยัน ASN and ปฏิเสธ ASN buttons. They open the exact submission in Management after Google authorization, with a required rejection reason. Opening a link never records a decision; already reviewed records show their existing audit.
- The LINE worker uses a persisted retry key, and reports `unknown` when acceptance cannot be confirmed.
- The owner connected a newly owned OA and their personal LINE account through the hidden Terminal handoff on 8 October 2026. Bot access, recipient access and message validation passed. This original personal connection used token version 2 and recipient secret version 1. LINE accepted one separately approved test message to that account, and the owner confirmed it arrived.
- Email uses the connected owner's Gmail API identity (`arun.l@speedshipsolution.com`). Gmail sending permission was approved and verified on 8 October 2026, and `ASN_EMAIL_ENABLED=true` is configured. Google accepted one separately approved test receipt sent only to the owner with a synthetic PDF. The owner confirmed receipt of the test email and its PDF attachment.

## Cutover

The live portal is https://asn.speedshipsolution.com and management is https://asn.speedshipsolution.com/management. The owner changed the CNAME to Firebase Hosting on 8 October 2026; both authoritative servers and Google/Cloudflare public DNS return the new target. Firebase reports host, ownership and certificate active. Customer/management HTTPS routes and live customer login, SKU loading, receipt history and management protection passed using the new public DNS address with normal certificate verification. The owner is checking Google management sign-in on the custom domain. Some local caches still resolve the old GitHub address, so keep that deployment available for rollback while caches expire. See `DNS-CUTOVER.md` for exact records and rollback.

Historical Apps Script archives remain in Drive. The dashboard currently lists submissions created by this new Firebase backend; it does not claim to include historical archives.

Portal PDF/Excel downloads and new PDF email attachments use the existing receipt name (brand, Bangkok date and sequence), for example `Nakama 2026-10-08 001.pdf`. UTF-8 filenames support Thai brands; browser blob downloads receive the displayed receipt name directly and use API headers as a fallback. Stored Drive files and older sent emails retain their existing names.
