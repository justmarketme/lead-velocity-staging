'use strict';
// The browser origins allowed to call the public n8n webhooks (CORS "Allowed Origins"). n8n does NOT evaluate an expression
// in that option: "={{ $env.PUBLIC_ALLOWED_ORIGINS || ... }}" went out verbatim as Access-Control-Allow-Origin (live, 18 Oct
// 2026), so every browser call from sortmycover.co.za was blocked. Builders write this literal list instead; it mirrors the
// live PUBLIC_ALLOWED_ORIGINS (the SortMyCover apex + www + the ten campaign hosts) plus the Lead Velocity portal origins.
// Adding a campaign host = add it here, regenerate the workflows, re-import them.
const CAMPAIGN_HOSTS = ['adviser-conversation', 'new-bond', 'salary-stops', 'cover-gap', 'owners-directors', 'new-baby',
  'children-guardian', 'will-myth', 'will-and-cover', 'where-is-the-will'];
const PUBLIC_ORIGINS = [
  'https://sortmycover.co.za', 'https://www.sortmycover.co.za',
  ...CAMPAIGN_HOSTS.map((h) => `https://${h}.sortmycover.co.za`),
  'https://leadvelocity.co.za', 'https://www.leadvelocity.co.za',
];
/** The value for a webhook node's options.allowedOrigins: comma-separated, never an expression. */
const ALLOWED_ORIGINS = PUBLIC_ORIGINS.join(',');
module.exports = { CAMPAIGN_HOSTS, PUBLIC_ORIGINS, ALLOWED_ORIGINS };
