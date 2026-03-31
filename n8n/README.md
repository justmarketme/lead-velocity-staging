# Lead Velocity — n8n Workflow Automation

n8n handles background automation so the AI models only run when truly needed, saving tokens and cost.

## Quick Start

```bash
# Copy env template
cp ../.env.example .env
# Edit .env with your actual values

# Start n8n
docker compose up -d

# Access UI at http://localhost:5678
# Username: admin  /  Password: changeme_in_production
```

## Importing Workflows

1. Open n8n at http://localhost:5678
2. Go to **Workflows → Import from File**
3. Import each JSON from `./workflows/`

Or via CLI:
```bash
docker compose exec n8n n8n import:workflow --separate --input=/home/node/.n8n/workflows
```

## Workflows

### `lead-processing.json`
**Trigger:** Supabase webhook → `scraped_leads` table INSERT  
**Steps:**
1. Filter for new leads only
2. Enrich lead data via Gemini (priority score, company size, suggested approach)
3. Update lead record in Supabase
4. Send Telegram notification to admin

**Webhook URL (set in Supabase):**  
`http://<your-n8n-host>:5678/webhook/new-scraped-lead`

### `campaign-notifications.json`
**Trigger:** Supabase webhook → `voice_campaign_calls` table UPDATE  
**Steps:**
1. Filter for appointment outcomes
2. Create appointment record in Supabase
3. Increment campaign appointments_set counter
4. Send Telegram notification

**Webhook URL (set in Supabase):**  
`http://<your-n8n-host>:5678/webhook/campaign-call-update`

## Setting up Supabase Webhooks

In the Supabase dashboard → **Database → Webhooks**, create:

| Name | Table | Events | URL |
|------|-------|--------|-----|
| n8n-new-lead | scraped_leads | INSERT | `http://<n8n-host>/webhook/new-scraped-lead` |
| n8n-call-update | voice_campaign_calls | UPDATE | `http://<n8n-host>/webhook/campaign-call-update` |

## Environment Variables

Set these in your `.env` file (Docker will inject them into n8n):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
```

## Production Deployment

For production, set `WEBHOOK_URL` in `docker-compose.yml` to your public URL  
(e.g., `https://n8n.yourdomain.co.za`) so Supabase can reach the webhooks.
