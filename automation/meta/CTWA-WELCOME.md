# CTWA welcome message: consent before the first message (24 Oct 2026)

**What it is.** Every SortMyCover click-to-WhatsApp (CTWA) ad gets a *welcome message* with ONE button. The welcome
message is the POPIA consent wording; the button is **Yes, I agree**. The person reads the wording on the WhatsApp screen
before anything is sent, taps the button, and that tap becomes their first message to us. W03 recognises it and records the
consent on first contact (`consent_text_version` **`ctwa-icebreaker-v1`**), then answers at once with "how it works" and the
Start here card. Nobody gets asked the consent question twice, and nobody lands in WhatsApp without the wording in front
of them.

**Why.** Funnel, 17 to 24 Oct 2026: 18 people messaged from the ads, 8 never answered Lindi's consent question, 3 consented,
0 booked. The consent question was the first drop-off.

The exact field JSON: **`automation/meta/ctwa-welcome-message.json`** (`page_welcome_message`). The runtime copy of the
two texts lives in the n8n `.env` (below). The three must say the same thing.

## The Marketing API field (reference)

Doc: https://developers.facebook.com/docs/marketing-api/ad-creative/messaging-ads/click-to-whatsapp (API v26.0, section
"Adding icebreakers with a greeting message"; read 24 Oct 2026). The field is `page_welcome_message` inside the creative's
`object_story_spec.link_data` (or `video_data`), next to the `WHATSAPP_MESSAGE` call to action:

```json
{
  "name": "SMC CTWA <angle> <date>",
  "object_story_spec": {
    "page_id": "1291324720737673",
    "link_data": {
      "image_hash": "<IMAGE_HASH>",
      "link": "https://api.whatsapp.com/send",
      "message": "<primary text>",
      "name": "<headline>",
      "call_to_action": { "type": "WHATSAPP_MESSAGE", "value": { "app_destination": "WHATSAPP" } },
      "page_welcome_message": {
        "type": "VISUAL_EDITOR",
        "version": 2,
        "landing_screen_type": "welcome_message",
        "media_type": "text",
        "text_format": {
          "customer_action_type": "ice_breakers",
          "message": {
            "text": "<SMC_CTWA_WELCOME_TEXT, word for word>",
            "ice_breakers": [ { "title": "Yes, I agree" } ]
          }
        }
      }
    }
  }
}
```

`page_welcome_message` is a creative field, so an existing ad cannot be edited into it: create a new creative (or duplicate
the ad in Ads Manager) and let the old one run out. The ad set stays `destination_type: WHATSAPP`.

Meta documents no character limit for the WhatsApp welcome message; the same field for Messenger allows 300 characters of
greeting and 80 per ice breaker, so the texts in the JSON stay inside those (greeting 297, button 12). Ads Manager's
preview is the final check.

What arrives on our side when the button is tapped: an inbound text whose body is the ice-breaker title, with the `referral`
object (`source_type: ad`, `source_id`, `ctwa_clid`, headline, body). The Cloud API webhook also carries the greeting as
`referral.welcome_message.text` ("Click to WhatsApp ad greeting text", https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text);
Twilio's inbound parameters do not, which is why the wording is also kept in env. W03 stores the referral's text when it is
there and the env text otherwise (`provenance.welcome_text_from`: `referral` | `env`).

## How to apply

### A. API (Graph API Explorer or curl, token with `ads_management` on the SMC ad account)

```bash
# 1. the image hash of the ad's image (or reuse the existing creative's)
curl -F "filename=@creative.jpg" -F "access_token=$TOKEN" "https://graph.facebook.com/v26.0/act_<AD_ACCOUNT_ID>/adimages"
# 2. the creative: object_story_spec as above, page_welcome_message pasted from automation/meta/ctwa-welcome-message.json
curl -X POST "https://graph.facebook.com/v26.0/act_<AD_ACCOUNT_ID>/adcreatives" \
  -F "name=SMC CTWA <angle> <date>" \
  -F "object_story_spec=<the object above, one line>" \
  -F "access_token=$TOKEN"
# 3. the ad, in the existing WhatsApp ad set
curl -X POST "https://graph.facebook.com/v26.0/act_<AD_ACCOUNT_ID>/ads" \
  -F "name=<same name>" -F "adset_id=<ADSET_ID>" -F "creative={\"creative_id\":\"<CREATIVE_ID>\"}" -F "status=PAUSED" -F "access_token=$TOKEN"
```

Preview the ad (`/ads?fields=preview_shareable_link`), tap through to WhatsApp on a phone, confirm the welcome bubble shows
the full wording and the one button, then set the ad ACTIVE and pause the old one.

### B. Ads Manager (no API)

Ad level > **Message template** > *Create new* (or edit the template the SMC ads use) >
- **Greeting** (the welcome message): paste `SMC_CTWA_WELCOME_TEXT` exactly.
- **Customer actions**: choose *Frequently asked questions*, add ONE question: `Yes, I agree`. Remove any prefilled
  message / other questions (one button means one meaning).
- Preview on the right: the wording must be fully visible above the button, nothing cut.
- Save, publish. Duplicate the live ads onto this template (Ads Manager > Duplicate), confirm the new ones in WhatsApp
  from a phone, then pause the old ones.

### C. Our side (before the ads change)

1. `.env` on the VPS (`/opt/leadvelocity-n8n/repo/.env`): `SMC_CTWA_ICEBREAKER_CONSENT=Yes, I agree` and
   `SMC_CTWA_WELCOME_TEXT=<the greeting, one line, exactly as in the JSON>`, then `./dc up -d --force-recreate n8n`
   (a restart does not reload env). Values with commas and colons are fine in a dotenv line; do not quote them.
2. Import W03 (`DEPLOY-CTWA-FUNNEL.md`). Until both are in place a tap on the button is harmless: W03 treats it as an
   ordinary first message and asks the consent question as before.

## POPIA reasoning

Section 1 of POPIA: consent is a *voluntary, specific and informed* expression of will.

- **Informed.** The wording is on the screen before the tap, in full, in the same bubble the button hangs off: who we are
  (SortMyCover), what we do (message on WhatsApp to book the call; share **name and number** with **an authorised financial
  adviser who will contact you**), who is responsible (Lead Velocity (Pty) Ltd), how to stop (reply STOP), where the policy
  is (sortmycover.co.za/privacy). Nothing is collected before the tap: Meta shows the welcome message client-side.
- **Specific.** One purpose (book the call, hand the name and number to one adviser), one button, one meaning. There is no
  prefilled message and no second question, so the tap cannot mean anything else.
- **Voluntary.** The person can type anything instead of tapping; then W03 asks the normal consent question
  (`ctwa-generic-v4`) and nothing is stored until they answer. A STOPped number is never answered. No adviser is named
  before consent (generic mode), so no personal data moves on the strength of the ad alone.
- **Evidence.** Stored exactly as a tap on the consent question would be: `leads.consent_text` = the wording shown,
  `consent_text_version = ctwa-icebreaker-v1`, `consent_mode = generic`, `consent_source = ctwa_ad`, `consent_at` = the
  inbound time; `lead_activities ctwa_consent` with the provenance (door `ctwa_ad`, referral ad id / ctwa_clid, inbound sid,
  `consent_method: icebreaker`, `opener_text` = the tapped words, `welcome_text_from`); one `lead_optins` row (channel
  derived from the referral: facebook_ad / instagram_ad). The CRM shows it like every other opt-in.
- **Change control.** The wording is the consent. Change the ad, the env values and `ctwa-welcome-message.json` together,
  and bump `ICEBREAKER_CONSENT_VERSION` in `automation/ctwa/w03.js` (v2, v3 ...) so old and new consents stay distinguishable.

## Checks

```sql
-- ice-breaker consents (last 7 days)
select id, first_name, consent_at, consent_source, left(consent_text, 60) from public.leads
 where consent_text_version = 'ctwa-icebreaker-v1' and created_at > now() - interval '7 days' order by consent_at desc;
-- taps that arrived WITHOUT referral data (would have got the consent question instead): should stay 0
select count(*) from public.communications c
 where c.direction = 'inbound' and c.channel = 'whatsapp' and lower(trim(c.content)) = lower('Yes, I agree')
   and c.created_at > now() - interval '7 days'
   and not exists (select 1 from public.leads l where l.id = c.lead_id and l.consent_text_version = 'ctwa-icebreaker-v1');
```
