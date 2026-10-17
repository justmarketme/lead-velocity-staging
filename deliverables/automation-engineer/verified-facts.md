# Verified facts (4.0a): automation-engineer

| Date | Fact | URL tried | Result | Value used |
|---|---|---|---|---|
| 2026-10-02 | Flow JSON `version` currently supported | https://developers.facebook.com/docs/whatsapp/flows/changelogs | **Fetch failed.** The sandbox egress proxy blocked developers.facebook.com (`EGRESS_BLOCKED`). | **ASSUMPTION: `"7.0"`** (the fallback the orchestrator set). `data_api_version` "3.0" is also an ASSUMPTION. |
| 2026-10-02 | CalendarPicker property names | https://developers.facebook.com/docs/whatsapp/flows/reference/components | **Fetch failed** (same block). | **ASSUMPTION** (not checked against live docs): `name`, `label`, `mode: "single"`, `min-date`, `max-date` (`YYYY-MM-DD`), `include-days` (`Mon`…`Sun`), `unavailable-dates` (array of `YYYY-MM-DD`), `init-value`, `required`, `on-select-action` (`data_exchange`). Also used: `visible` on TextBody, `init-value` on RadioButtonsGroup/TextInput, `Form`-less layout (Flow JSON ≥ 4.0). |
| — | Template category decision | — | Not checkable until submission (this is a Meta review outcome). | Everything is submitted as UTILITY. The decision is logged per template when Jonathan submits. |

**What happens next:** both 4.0a fetches have now been used. No one else needs to look these up. Meta's Flow Builder validates `version` and the property names when the JSON is pasted in (W28 step 5). If it rejects "7.0" or a property, the Chrome agent edits the value shown in the Builder error and writes the corrected value into this file. That is a check by the tool, not new research.
