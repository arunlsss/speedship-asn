# ASN domain preparation — 8 October 2026

Firebase Hosting has registered `asn.speedshipsolution.com` for site `speedship-asn-cloud`. Public DNS still points to GitHub Pages. Nameservers are `ns13.domaincontrol.com` and `ns14.domaincontrol.com` (GoDaddy).

Before switching traffic, complete receipt notification configuration and verify the Firebase customer portal and Google management login. The staging portal is https://speedship-asn-cloud.web.app and management is https://speedship-asn-cloud.web.app/management.

## Certificate preparation without switching traffic

Firebase supplied this certificate verification record on 8 October 2026. Recheck the Firebase custom-domain screen immediately before applying it because certificate challenges can change.

| Type | GoDaddy name | Value |
| --- | --- | --- |
| TXT | `_acme-challenge.asn` | `VAkRI505RcJQhmmppvCz-4Wzj9TgsiNSOWtnbe549bQ` |

Adding this TXT record does not move ASN traffic. Keep it until Firebase confirms certificate verification. Do not edit any existing mail, attendance, Nakama or main website records.

## Traffic cutover

When migration validation is complete and Firebase has a valid certificate, edit the existing `asn` CNAME:

| Type | Name | Old value | New value |
| --- | --- | --- | --- |
| CNAME | `asn` | `arunlsss.github.io` | `speedship-asn-cloud.web.app` |

These exact requirements come from Firebase Hosting's custom-domain resource. Confirm the desired record in Firebase before changing DNS. Use the current TTL. Verify HTTPS, customer login, a controlled submission and the management dashboard through the custom domain after propagation.

## Rollback

Restore the `asn` CNAME to `arunlsss.github.io`. Keep the old GitHub Pages/Apps Script deployment available until cutover has passed. DNS caches can retain the previous value until its TTL expires.

Sources: [Firebase custom-domain setup](https://firebase.google.com/docs/hosting/custom-domain), [Firebase custom-domain API](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/projects.sites.customDomains).

Verification update: the owner added the certificate TXT record, and authoritative/public/Google DNS all return the exact expected value. Firebase's certificate DNS check has also detected it. Receipt email delivery with PDF is owner-confirmed. The current CNAME still points to GitHub Pages. Wait for Firebase certificate readiness before traffic cutover.
