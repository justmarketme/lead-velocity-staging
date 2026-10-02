# Verified facts (4.0a) — the only lookups any agent may make

Written by the orchestrator. One row per 4.0a item. The cloud sandbox blocks outbound web fetches (egress proxy), so most rows are **ASSUMPTION** until the laptop session or Jonathan checks them; nobody else re-checks.

| Fact | Owner | Status (2026-10-02) | Value in use | How it gets verified |
|---|---|---|---|---|
| WhatsApp Cloud API per-message rates for ZA (utility/service/marketing) + free-tier threshold (repriced 1 Oct 2026) | automation-engineer, Phase 2 start | **ASSUMPTION** (fetch blocked) | ~US$0.0076–0.0095 per utility/service message (≈ R0.14–0.17); 1,000 free service messages per number per month; ~R2 per lead at ~12 messages (3.1) | Laptop session: Meta pricing page, one fetch; or the first WABA invoice. |
| Hostinger KVM 2 price + n8n template availability | devops-security, W26 at purchase | Not due (after first payment) | ≈ $8.99/month on 24-month billing (6.7) | At GATE-VPS purchase screen. |
| Paystack / Ozow fee schedule + KYC document list | billing-automation, Phase 0 | **ASSUMPTION** (fetch blocked) | Instant EFT ≈ 1.5–2% (≈ R250 on R16,500); card 2.9% + R1; KYC: CIPC docs, director ID, proof of address, bank letter (6.5) | At GATE-PAYSTACK-KYC on the Paystack dashboard. |
| Meta template category decision + Flow JSON version supported | automation-engineer, on submission | **ASSUMPTION** — two fetches tried, both `EGRESS_BLOCKED` (see deliverables/automation-engineer/verified-facts.md) | Flow JSON `version` "7.0", `data_api_version` "3.0"; all templates submitted as UTILITY | Meta's Flow Builder validates on paste (W28 step 5); category per template at GATE-TEMPLATES. |
| Claude model names and prices for 4A routing | orchestrator, session start | **As given in 4A** (platform docs dated 1 Oct 2026, grade A); no re-check possible offline | fable `claude-fable-5-1` $10/$50 · opus `claude-opus-5-5` $4/$20 · sonnet `claude-sonnet-5-5` $2/$10 · haiku `claude-haiku-4-5-20251001` $1/$5 per MTok | Monthly retro (W32) re-reads Anthropic release notes. |
| SA public holidays for the booking calendar | automation-engineer, yearly | **ASSUMPTION** — written from the Public Holidays Act rules, file `data/za-public-holidays.json` | 2026 + 2027 lists | Verify against gov.za before go-live (Section 7 booking line). |
| FSCA register entry per broker's FSP number | broker-success / W20, onboarding | Not due (no broker row yet) | — | At Mark's onboarding (GATE-AGREEMENT prerequisites). |

Rule reminder (0.1 Research status): anything else marked ASSUMPTION is measured in production, not researched.
