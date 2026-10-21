import cfg from "../../config/site.json";
import consent from "../../config/consent.json";
import strings from "../../config/strings.json";

export const site = cfg;
/** The JSON import types an empty list as never[] and a null as null; these keys are filled in later (spec section 3), so type them here. */
export const company = cfg.company as Omit<typeof cfg.company, "directors" | "service_address" | "codes_of_conduct" | "footer_identity"> & {
  directors: string[];
  service_address: string | null;
  codes_of_conduct: string[];
  footer_identity: boolean;
};
export const consentCfg = consent;
export const strs = strings;

/** One value switches the whole site between n8n hosts (n8n.leadvelocity.co.za <-> n8n.sortmycover.co.za): config/site.json -> n8n_base. */
export const API_BASE = (cfg.n8n_base + cfg.api_prefix).replace(/\/+$/, "");

export const APEX = cfg.site_url.replace(/\/$/, "");
export const campaignOrigin = (slug: string) => `https://${slug}${cfg.campaign_host_suffix}`;

/** Absolute apex URL for a path ("/privacy/"). Campaign hosts link to the apex for every legal page (each page lives on one host). */
export const apex = (path: string) => APEX + path;

export const FEE_LINE = "Advisers pay SortMyCover a fee for the service. The fee does not depend on whether you buy anything.";
export const NO_COMMISSION = "SortMyCover takes no commission and no share of any premium.";
export const NOT_FSP_LINE = "SortMyCover is not a financial services provider and gives no financial advice.";
/** The optional identity half of FOOTER-v3. Recommended (Companies Act s32, CPA s41), not required: the full identity is on /legal/,
    linked from every footer (ECT s43). Off by Jono's decision (21 Oct 2026); company.footer_identity=true turns it on everywhere. */
export const FOOTER_IDENTITY = `It is a trading name of ${company.legal_name}.`;
/** FOOTER-v3 (spec FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21 section 2): the one disclosure line on every footer, built from
    config/site.json, never retyped. */
export const FOOTER_LINE: string = company.footer_identity ? `${cfg.footer_line} ${FOOTER_IDENTITY}` : cfg.footer_line;
/** The old FOOTER-v2 text, verbatim. Shown on /legal/ #role only. */
export const DISCLOSURE_STATEMENT: string = cfg.disclosure_statement;

/** Wills and estate (theme B): public lines only. Jono, 18 Oct 2026: the will provider is not named on the site; its identity lives in
    config/will-provider.internal.json, which no browser code imports, and Lindi names it on WhatsApp before the call. */
export const provider = cfg.will_provider;
/** Kept for angle copy: a stray {provider} token renders as the generic label, never a name. */
export const fillProvider = (s: string) => s.replace(/\{provider\}/g, provider.public_label);
export const PROVIDER_SERVICE_LINE = fillProvider(provider.service_line);
export const PROVIDER_COST_LINE = fillProvider(provider.cost_line);
export const PROVIDER_ROLE_LINE = fillProvider(provider.role_line);
