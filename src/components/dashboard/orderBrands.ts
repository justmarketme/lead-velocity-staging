/**
 * Brand of a CRM lead order and the progress of SortMyCover (nurtured) orders.
 * lead_orders.brand_id (crm-nurture smc_03): NULL = Lead Velocity raw leads (the existing Discovery orders),
 * the SortMyCover brand id = nurtured leads routed one by one; each delivered lead is a lead_order_items row
 * (written by the routing trigger), and a booking is a SortMyCover appointment for that lead.
 * Before the migrations are applied brand_id / brands do not exist: every loader then returns "unavailable" and the
 * admin UI behaves exactly as before.
 */
import { smcDb } from "@/lib/smc";

export interface Brand { id: string; code: string; name: string; is_active: boolean }
export interface OrderProgress { delivered: number; booked: number }

const CHUNK = 200; // keep PostgREST `in.(…)` URLs short

async function inChunks<T>(ids: string[], run: (part: string[]) => Promise<T[] | null>): Promise<T[] | null> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const r = await run(ids.slice(i, i + CHUNK));
    if (r === null) return null;
    out.push(...r);
  }
  return out;
}

export async function loadBrands(): Promise<Brand[] | null> {
  const { data, error } = await smcDb.from("brands").select("id, code, name, is_active").order("name");
  return error ? null : ((data as Brand[]) || []);
}

/** order id -> brand id (null = Lead Velocity). null result = column not there yet. */
export async function loadOrderBrands(): Promise<Record<string, string | null> | null> {
  const { data, error } = await smcDb.from("lead_orders").select("id, brand_id");
  if (error) return null;
  return Object.fromEntries(((data as { id: string; brand_id: string | null }[]) || []).map((r) => [r.id, r.brand_id]));
}

const BOOKED = ["booked", "confirmed", "rescheduled", "attended", "no_show"];

/** Delivered (lead_order_items rows) and booked (distinct leads with a SortMyCover appointment) per order. */
export async function loadNurturedProgress(orderIds: string[]): Promise<Record<string, OrderProgress>> {
  const res: Record<string, OrderProgress> = Object.fromEntries(orderIds.map((id) => [id, { delivered: 0, booked: 0 }]));
  if (!orderIds.length) return res;
  const items = await inChunks<{ order_id: string; lead_id: string }>(orderIds, async (part) => {
    const { data, error } = await smcDb.from("lead_order_items").select("order_id, lead_id").in("order_id", part);
    return error ? null : ((data as { order_id: string; lead_id: string }[]) || []);
  });
  if (!items) return res;
  for (const it of items) res[it.order_id].delivered += 1;
  const leadIds = [...new Set(items.map((i) => i.lead_id))];
  const appts = await inChunks<{ client_id: string }>(leadIds, async (part) => {
    const { data, error } = await smcDb.from("appointments").select("client_id")
      .in("client_id", part).not("brand_id", "is", null).in("status", BOOKED);
    return error ? null : ((data as { client_id: string }[]) || []);
  });
  if (!appts) return res;
  const bookedLeads = new Set(appts.map((a) => a.client_id));
  for (const it of items) if (bookedLeads.has(it.lead_id)) res[it.order_id].booked += 1;
  return res;
}

export const isSmcBrand = (brands: Brand[] | null, brandId: string | null | undefined) =>
  !!brandId && !!brands?.find((b) => b.id === brandId && b.code === "SMC");
