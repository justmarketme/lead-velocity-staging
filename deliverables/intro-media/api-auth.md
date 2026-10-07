# Intro-media API auth (I-32a)

Static hosting (Hostinger) cannot proxy same-origin `/intro/*`, and magic-link cookie login is not built (I-30l). So the recorder calls n8n directly with the broker's Supabase session.

| Piece | What it does |
|---|---|
| `portal/intro-media/inject-api.mjs` | Build step. Reads `VITE_N8N_WEBHOOK_BASE` (and optional `VITE_SUPABASE_PROJECT_ID`) and sets `data-api="<base>/intro"` and `data-sb-key` on the five pages. Names only, no secret. |
| `portal/intro-media/app.js` | `api()` reads the Supabase access token from the portal session in `localStorage` (`sb-<ref>-auth-token`; the page is served from the portal origin, so it is readable), sends `Authorization: Bearer ...`, `credentials: 'omit'`. Expired or missing token: asks the broker to open the portal first. It never sends a broker id. |
| `automation/W23.json` (patched by `automation/media/patch-w23-auth.mjs`) | `intro/upload-confirm` and `intro/approve` webhooks: no header-auth credential, `responseMode: responseNode`, CORS only `https://leadvelocity.co.za`. First node is **Verify broker JWT**: the same `verifySupabaseJwt` as the broker `/slots` path (HS256, `SUPABASE_JWT_SECRET`, aud/role `authenticated`, uuid `sub`; alg `none` refused; missing secret fails closed). Broker = `brokers.user_id = sub` in SQL. `broker_id` / `approved_by` in the body are discarded. 401 bad token, 403 no broker or nothing to approve, 200 otherwise. The existing media-row logic (insert processing, ready, approve, version retention, spot-check alert) is unchanged. |
| Test | `automation/media/w23-auth.test.js` (9 tests; run `cd automation/media && node --test media.test.js w23-auth.test.js`). |

Not built, still needed for the recorder to run end to end: `GET /intro/status`, `POST /intro/interview`, `POST /intro/script-select`, and `POST /intro/upload` phase 1 (signed URL). They must use the same JWT check and the same `brokers.user_id = sub` rule. Env: `SUPABASE_JWT_SECRET` and `NODE_FUNCTION_ALLOW_BUILTIN=crypto` on n8n. If the project moves to asymmetric Supabase signing keys, swap the verifier (CONTRACTS.md ASSUMPTION).
