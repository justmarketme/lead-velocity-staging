/* Sitemap and robots.txt generators (pure; unit tested). */
export interface SitemapEntry { path: string; lastmod: string; indexable: boolean; campaign?: boolean }

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Only indexable apex pages. Campaign pages, thank-you pages, noindex legal drafts and the 404 are never listed. */
export function buildSitemap(entries: SitemapEntry[], origin: string): string {
  const rows = entries
    .filter((e) => e.indexable && !e.campaign)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((e) => `  <url><loc>${x(origin + e.path)}</loc><lastmod>${e.lastmod}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
}

/** Retrieval and training crawlers that must stay allowed (spec DEC-9, G2/G3/G12). */
export const ALLOWED_BOTS = [
  "Googlebot", "Bingbot", "OAI-SearchBot", "ChatGPT-User", "GPTBot", "PerplexityBot", "Perplexity-User",
  "Claude-SearchBot", "Claude-User", "ClaudeBot", "Google-Extended", "Applebot", "Applebot-Extended",
];

/** Allow-all robots.txt, identical on every host (campaign hosts are kept out of the index by header + meta noindex, NOT by robots.txt). */
export function buildRobots(origin: string): string {
  const groups = ["User-agent: *\nAllow: /", ...ALLOWED_BOTS.map((b) => `User-agent: ${b}\nAllow: /`)];
  return `${groups.join("\n\n")}\n\nSitemap: ${origin}/sitemap.xml\n`;
}
