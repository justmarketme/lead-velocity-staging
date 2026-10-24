/* Deployment config generators: vercel.json (legacy "routes" style, which is the only style that can rewrite "/" per host, D1) and the
   Hostinger .htaccess. Pure functions of site.json + angles.json + the old-URL map; scripts/gen-config.mjs writes the files and a
   test fails if the committed files drift from this output. */
import { ANGLES, hostLabel, isAttached, type Angle } from "../campaigns";
import { OLD_URL_MAP } from "./redirects";
import { site } from "../lib/site";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CAMPAIGN_SUFFIX = site.campaign_host_suffix; // ".sortmycover.co.za"
const APEX_HOST = site.site_url.replace(/^https?:\/\//, "");
const hostOf = (a: Angle) => hostLabel(a) + CAMPAIGN_SUFFIX;
export const campaignAngles = (): Angle[] => ANGLES.filter(isAttached);
const N8N = site.n8n_base;

/** CSP: 'self' plus exactly what the site needs (Meta Pixel domains, the n8n host, Cloudflare Turnstile). No 'unsafe-inline': no inline script or style exists.
    `imgExtra`: further image origins, for one path only (see START_HEADERS). */
export function csp(imgExtra: readonly string[] = []): string {
  return [
    "default-src 'self'",
    "script-src 'self' https://connect.facebook.net https://challenges.cloudflare.com",
    "style-src 'self'",
    ["img-src 'self' https://www.facebook.com", ...imgExtra].join(" "),
    "font-src 'self'",
    `connect-src 'self' ${N8N} https://www.facebook.com https://connect.facebook.net`,
    "frame-src https://challenges.cloudflare.com",
    `form-action 'self' ${N8N}`,
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": csp(),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=86400",
  "X-Frame-Options": "DENY",
};

/** The adviser's approved headshot / intro card on /start/: public objects in Supabase Storage on this one origin. */
export const START_IMG_ORIGIN = "https://cmsylaupctrbsvzrgzwy.supabase.co";
/** /start/ (Lindi's per-lead link): noindex in a header as well as the meta tag, no referrer at all, and the site CSP with the
    adviser photo origin added to img-src (this path only; set after SECURITY_HEADERS, so it replaces the site-wide CSP there). */
export const START_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": csp([START_IMG_ORIGIN]),
};

const dest = (to: string) =>({ status: 301, headers: { Location: to } });

export function vercelConfig() {
  const routes: Record<string, unknown>[] = [];
  // 1. host canonicalisation
  routes.push({ src: "/(.*)", has: [{ type: "host", value: "(www\\.)?sortmycover\\.com" }], ...dest(`${site.site_url}/$1`) });
  routes.push({ src: "/(.*)", has: [{ type: "host", value: "www\\." + esc(APEX_HOST) }], ...dest(`${site.site_url}/$1`) });
  // 2. old .html URLs (permanent, forever)
  for (const r of OLD_URL_MAP) routes.push({ src: "^" + esc(r.from) + "$", ...dest(r.to) });
  // 3. each page lives on exactly one host: apex /<slug>/ and /_c/<slug>/ go to the campaign host (307 first; 308 after a month, README)
  for (const a of campaignAngles()) {
    routes.push({ src: `^/(?:_c/)?${esc(a.slug)}/?$`, has: [{ type: "host", value: esc(APEX_HOST) }], status: 307, headers: { Location: `https://${hostOf(a)}/` } });
  }
  // 4. security headers on every response, noindex on campaign hosts and *.vercel.app, long cache for hashed assets
  routes.push({ src: "/(.*)", headers: SECURITY_HEADERS, continue: true });
  routes.push({ src: "/(.*)", has: [{ type: "host", value: ".+" + esc(CAMPAIGN_SUFFIX) }], headers: { "X-Robots-Tag": "noindex, nofollow" }, continue: true });
  routes.push({ src: "/(.*)", has: [{ type: "host", value: ".*\\.vercel\\.app" }], headers: { "X-Robots-Tag": "noindex, nofollow, noarchive" }, continue: true });
  // the private per-lead page: never indexed, never leaks a referrer
  routes.push({ src: "^/start(?:/.*)?$", headers: START_HEADERS, continue: true });
  routes.push({ src: "/assets/(.*)", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true });
  routes.push({ src: "/fonts/(.*)", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true });
  routes.push({ src: "/(.*)\\.(png|webp|avif|jpg|ico|svg|webmanifest)", headers: { "Cache-Control": "public, max-age=86400" }, continue: true });
  // /sitemap.xml exists on the apex only (spec C.5): a campaign host answers 404
  routes.push({ src: "^/sitemap\\.xml$", has: [{ type: "host", value: ".+" + esc(CAMPAIGN_SUFFIX) }], status: 404, dest: "/404.html" });
  // 5. campaign hosts: "/" and "/thanks/" are the only pages; shared files pass through; everything else goes to the apex
  for (const a of campaignAngles()) {
    const h = [{ type: "host", value: esc(hostOf(a)) }];
    routes.push({ src: "^/$", has: h, dest: `/_c/${a.slug}/index.html` });
    routes.push({ src: "^/thanks/?$", has: h, dest: `/_c/${a.slug}/thanks/index.html` });
  }
  routes.push({
    src: "^/(?!assets/|fonts/|img/|thanks(?:/|$)|robots\\.txt$|favicon|apple-touch-icon|icon-|mask-icon|manifest|browserconfig|mstile)(.+)$",
    has: [{ type: "host", value: ".+" + esc(CAMPAIGN_SUFFIX) }],
    status: 307,
    headers: { Location: `${site.site_url}/$1` },
  });
  // 6. files, then: slashless folder URL -> trailing slash, then 404
  routes.push({ handle: "filesystem" });
  routes.push({ src: "^/([^./]+(?:/[^./]+)*)$", status: 308, headers: { Location: "/$1/" } });
  routes.push({ src: "/(.*)", status: 404, dest: "/404.html" });
  return {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: null,
    installCommand: "npm install",
    buildCommand: "npm run build",
    outputDirectory: "dist",
    routes,
  };
}

/** Hostinger (Apache). Point the apex AND every campaign subdomain's document root at the same folder (the unzipped dist/);
    the Host header then picks the page. */
export function htaccess(): string {
  const L: string[] = [];
  const p = (s = "") => L.push(s);
  p("# GENERATED by scripts/gen-config.mjs from config/site.json + config/angles.json. Do not edit by hand.");
  p("# Deploy: upload dist/ to the apex document root; point every campaign subdomain's document root at the SAME folder (see README).");
  p("Options -Indexes +FollowSymLinks");
  p("DirectorySlash On");
  p("DirectoryIndex index.html");
  p("ErrorDocument 404 /404.html");
  p("");
  p("<IfModule mod_rewrite.c>");
  p("RewriteEngine On");
  p("# https");
  p("RewriteCond %{HTTPS} !=on");
  p("RewriteCond %{HTTP:X-Forwarded-Proto} !https");
  p("RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]");
  p("# www and .com -> apex");
  p("RewriteCond %{HTTP_HOST} ^(www\\.)?sortmycover\\.com$ [NC]");
  p(`RewriteRule ^(.*)$ ${site.site_url}/$1 [L,R=301]`);
  p(`RewriteCond %{HTTP_HOST} ^www\\.${esc(APEX_HOST)}$ [NC]`);
  p(`RewriteRule ^(.*)$ ${site.site_url}/$1 [L,R=301]`);
  p("# old .html URLs");
  for (const r of OLD_URL_MAP) p(`RewriteRule ^${esc(r.from.replace(/^\//, ""))}$ ${r.to} [L,R=301]`);
  p("# apex: the calendar file (/c/<booking_id>) and join link (/j/<booking_id>) in W05's WhatsApp and email messages are served by n8n (QSA keeps ?k=)");
  p(`RewriteCond %{HTTP_HOST} ^${esc(APEX_HOST)}$ [NC]`);
  p(`RewriteRule ^c/([^/]+)/?$ ${N8N}/webhook/w05-ics-get/c/$1 [R=302,L,QSA]`);
  p(`RewriteCond %{HTTP_HOST} ^${esc(APEX_HOST)}$ [NC]`);
  p(`RewriteRule ^j/([^/]+)/?$ ${N8N}/webhook/w05-join-get/j/$1 [R=302,L,QSA]`);
  p("# apex: campaign pages live on their own host");
  for (const a of campaignAngles()) {
    p(`RewriteCond %{HTTP_HOST} ^${esc(APEX_HOST)}$ [NC]`);
    p(`RewriteRule ^(?:_c/)?${esc(a.slug)}/?$ https://${hostOf(a)}/ [L,R=307]`);
  }
  p("# campaign hosts: '/' and '/thanks/' map into _c/<slug>/; everything else goes to the apex");
  for (const a of campaignAngles()) {
    p(`RewriteCond %{HTTP_HOST} ^${esc(hostOf(a))}$ [NC]`);
    p(`RewriteRule ^$ /_c/${a.slug}/index.html [L]`);
    p(`RewriteCond %{HTTP_HOST} ^${esc(hostOf(a))}$ [NC]`);
    p(`RewriteRule ^thanks/?$ /_c/${a.slug}/thanks/index.html [L]`);
  }
  p(`RewriteCond %{HTTP_HOST} ^[a-z0-9-]+${esc(CAMPAIGN_SUFFIX)}$ [NC]`);
  p("RewriteRule ^sitemap\\.xml$ - [R=404,L]");
  p(`RewriteCond %{HTTP_HOST} ^[a-z0-9-]+${esc(CAMPAIGN_SUFFIX)}$ [NC]`);
  // images (top level and /img/) stay on the campaign host: a redirect to the apex would be blocked by the CSP (img-src 'self')
  p("RewriteCond %{REQUEST_URI} !^/(assets/|fonts/|img/|robots\\.txt|favicon|apple-touch-icon|icon-|mask-icon|manifest|browserconfig|mstile|_c/|[^/]+\\.(webp|avif|jpg|png)$)");
  p(`RewriteRule ^(.+)$ ${site.site_url}/$1 [L,R=307]`);
  p("</IfModule>");
  p("");
  p("<IfModule mod_headers.c>");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) p(`Header always set ${k} "${v}"`);
  p(`SetEnvIfNoCase Host "${esc(CAMPAIGN_SUFFIX)}$" CAMPAIGN_HOST=1`);
  p('Header always set X-Robots-Tag "noindex, nofollow" env=CAMPAIGN_HOST');
  p("# /start/ (per-lead page): noindex and no referrer (mod_dir serves start/index.html as an internal redirect, hence both env names)");
  p('SetEnvIf Request_URI "^/start(/|$)" START_PAGE=1');
  for (const env of ["START_PAGE", "REDIRECT_START_PAGE"]) for (const [k, v] of Object.entries(START_HEADERS)) p(`Header always set ${k} "${v}" env=${env}`);
  p('<FilesMatch "\\.(html)$">');
  p('  Header set Cache-Control "public, max-age=0, must-revalidate"');
  p("</FilesMatch>");
  p("<FilesMatch \"\\.(js|css|woff2)$\">");
  p('  Header set Cache-Control "public, max-age=31536000, immutable"');
  p("</FilesMatch>");
  p("# the site fonts are also used by the client emails (supabase/functions/_shared/smc_layout.ts), so mail clients may load them");
  p("<FilesMatch \"\\.woff2$\">");
  p('  Header set Access-Control-Allow-Origin "*"');
  p("</FilesMatch>");
  p("<FilesMatch \"\\.(png|webp|avif|jpg|ico|svg|webmanifest)$\">");
  p('  Header set Cache-Control "public, max-age=86400"');
  p("</FilesMatch>");
  p("</IfModule>");
  p("");
  p("<IfModule mod_deflate.c>");
  p("AddOutputFilterByType DEFLATE text/html text/css application/javascript image/svg+xml application/xml text/plain");
  p("</IfModule>");
  p("AddType application/manifest+json .webmanifest");
  return L.join("\n") + "\n";
}
