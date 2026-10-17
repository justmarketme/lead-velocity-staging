# WhatsApp openers: the contract between the site and Lindi (W07)

Jono, 17 Oct 2026: WhatsApp is the primary call to action on every SortMyCover page and every campaign landing page. Booking on the website is the secondary path. Source of truth in code: `src/lib/whatsapp.ts`.

## How a visitor reaches WhatsApp

1. They tap any "Chat on WhatsApp" button, or the green launcher at the bottom right.
2. The chat panel opens. It introduces Lindi as SortMyCover's AI booking assistant, lists what happens on WhatsApp, and asks for the consent tick. The consent text is `config/consent.json` -> `generic`, version **CONSENT-GENERIC-v5web**, the same wording as the booking form. The flow spec requires consent before WhatsApp.
3. "Open WhatsApp" stays blocked until the box is ticked. It then opens `https://wa.me/27600156480?text=<opener>`.
4. Without JavaScript, the buttons link straight to the same URL. The opener states the consent in the person's own words, so the chat itself records it.

## The opener (the first message Lindi receives)

```
Hi Lindi, I'd like to chat about <topic>. I agree that SortMyCover may message me on WhatsApp about this and share my details with <who>. Ref <code>
```

- `<who>` is `an authorised adviser`, or `Capital Legacy` for wills topics.
- The person can edit the text before sending, so parse defensively.

Parse with:

```
/^Hi Lindi, I'd like to chat about (.+?)\. I agree that SortMyCover may message me on WhatsApp about this and share my details with (.+?)\. Ref ([a-z0-9-]+)\s*$/i
```

| Group | Meaning |
|---|---|
| 1 | Topic, plain words. Use it to pre-select the option in the welcome list. |
| 2 | Who the details go to. `Capital Legacy` means a will call. |
| 3 | Source code (table below). Store it on the lead as the source. |

## What Lindi should do with it (to set up in W07)

1. **Unknown number plus a matching opener:** create the lead. Set `source` to the ref code. Record consent with version `CONSENT-GENERIC-v5web`, the inbound message SID as evidence and the received time. Then run the flow spec from step 2 (greet, then "what brings you here?").
2. **Topic to welcome option:** cover topics map to life cover, disability or income protection, or review my cover. Wills topics map to wills. Pre-select the option, but still let the person change it.
3. **No match** (edited text, or any other first message): run the normal flow and ask for consent in chat before booking. Never treat an edited message as consent if the consent sentence was removed.
4. **Never go silent.** If a delegate (W04 slots, W28) fails, send the fallback reply and alert ops. The 17 Oct test messages got no reply because of exactly this.

## Ref codes

| Code | Where |
|---|---|
| `w-home` | Home: header, hero, final card, launcher |
| `w-home-bond`, `w-home-baby`, `w-home-income`, `w-home-business`, `w-home-will` | Home life-moment panels |
| `w-cover` | /cover/ hub and the four cover type pages |
| `w-wills` | /wills/ hub and every wills guide (opener names Capital Legacy) |
| `w-learn` | Other /learn/ pages |
| `w-learn-bond`, `w-learn-income`, `w-learn-owner`, `w-learn-adviser` | The four guides the cycle-1 ads link to |
| `w-book` | /book/ |
| `w-site` | Any other page (About, FAQ, legal) |
| `a01` to `a06`, `b01` to `b04` | Campaign landing pages, which use the angle's neutral `meta_code` from `config/angles.json` |

## Topics per campaign angle

| Angle | Code | Topic |
|---|---|---|
| adviser-conversation | a01 | a call with an authorised adviser |
| new-bond | a02 | cover and my new bond |
| salary-stops | a03 | income protection |
| cover-gap | a04 | my life cover |
| owners-directors | a05 | cover as a business owner |
| new-baby | a06 | cover for my family |
| children-guardian | b01 | a will and a guardian for my children |
| will-myth, will-and-cover, where-is-the-will | b02, b03, b04 | a will |

## Measurement

- An "Open WhatsApp" tap fires the Meta Pixel `Contact` event, only with ad-measurement consent, with `content_name` set to the ref code.
- It also sends the first-party beacon `e: "wa"`, `a: <ref code>`. `SUB-visit-beacon` must accept `e = "wa"` for these to be counted.
