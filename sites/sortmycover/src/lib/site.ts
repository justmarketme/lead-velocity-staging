import cfg from "../../config/site.json";
import consent from "../../config/consent.json";
import strings from "../../config/strings.json";

export const site = cfg;
export const company = cfg.company;
export const consentCfg = consent;
export const strs = strings;

/** One value switches the whole site between n8n hosts (n8n.leadvelocity.co.za <-> n8n.sortmycover.co.za): config/site.json -> n8n_base. */
export const API_BASE = (cfg.n8n_base + cfg.api_prefix).replace(/\/+$/, "");

export const APEX = cfg.site_url.replace(/\/$/, "");
export const campaignOrigin = (slug: string) => `https://${slug}${cfg.campaign_host_suffix}`;

/** Absolute apex URL for a path ("/privacy/"). Campaign hosts link to the apex for every legal page (each page lives on one host). */
export const apex = (path: string) => APEX + path;

export const BOOK_LABEL = "Book my adviser call";
export const COST_LINE = "The call costs you nothing.";
export const FEE_LINE = "Advisers pay SortMyCover a fee for the service. The fee does not depend on whether you buy anything.";
export const NO_COMMISSION = "SortMyCover takes no commission and no share of any premium.";
/** FOOTER-v2 (spec C.1): stored once in config/site.json, rendered from there, never retyped. */
export const FOOTER_LINE: string = cfg.footer_line;
export const NOT_FSP_LINE = "SortMyCover is not a financial services provider and gives no financial advice.";
