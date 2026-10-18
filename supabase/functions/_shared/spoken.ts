// Turns what a caller SAYS into what we STORE. Voice agents hear "jono at
// leadvelocity dot co dot za" and sometimes pass it through literally; nothing
// downstream (Cal.com, the CRM, Twilio) may ever see the spoken form.

const SPOKEN_SYMBOLS: Array<[RegExp, string]> = [
  [/\b(at sign|at symbol|at)\b/g, "@"],
  [/\b(dot|period|full stop)\b/g, "."],
  [/\b(dash|hyphen)\b/g, "-"],
  [/\bunderscore\b/g, "_"],
  [/\b(forward slash|slash)\b/g, "/"],
  [/\bcolon\b/g, ":"],
];

function unspeak(raw: string): string {
  let s = ` ${raw.toLowerCase().trim()} `;
  // "w w w" / "triple w" / "dub dub dub" → www
  s = s.replace(/\b(w\s+w\s+w|triple\s+w|treble\s+w|dub\s+dub\s+dub)\b/g, "www");
  for (const [re, sym] of SPOKEN_SYMBOLS) s = s.replace(re, sym);
  // Drop every remaining space — addresses never contain one.
  return s.replace(/\s+/g, "").replace(/[,;!?]+$/g, "").replace(/\.{2,}/g, ".");
}

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** "Jono AT LeadVelocity dot co dot za" → "jono@leadvelocity.co.za"; null if it still isn't an email. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = unspeak(raw).replace(/^mailto:/, "").replace(/^\.+|\.+$/g, "");
  return EMAIL_RE.test(s) ? s : null;
}

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?$/;

/** "w w w dot leadvelocity dot co dot za" → "www.leadvelocity.co.za"; null if not a domain/URL. */
export function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = unspeak(raw).replace(/^https?:\/\//, "").replace(/\/$/, "");
  return DOMAIN_RE.test(s) ? s : null;
}

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", o: "0", nought: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
};

/** "oh eight two double five five, one two three four" → "0825551234". Leaves digits alone. */
function spokenDigits(raw: string): string {
  const words = raw.toLowerCase().replace(/[-,.]/g, " ").split(/\s+/).filter(Boolean);
  let out = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const rep = w === "double" ? 2 : w === "triple" ? 3 : 0;
    if (rep && i + 1 < words.length) {
      const next = DIGIT_WORDS[words[i + 1]] ?? (/^\d$/.test(words[i + 1]) ? words[i + 1] : "");
      if (next) {
        out += next.repeat(rep);
        i++;
        continue;
      }
    }
    if (w === "plus") out += "+";
    else out += DIGIT_WORDS[w] ?? w;
  }
  return out;
}

/** South-African-first E.164: "082 555 1234" / "27825551234" / "+27 82…" / "oh eight two…" → "+27825551234". */
export function normalizeZaPhone(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let d = spokenDigits(String(raw)).replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("0") && d.length === 10) d = "+27" + d.slice(1);
  else if (d.startsWith("27") && d.length === 11) d = "+" + d;
  else if (/^[1-9]\d{8}$/.test(d)) d = "+27" + d;
  return /^\+[1-9]\d{8,14}$/.test(d) ? d : null;
}

/** "+27737651664" → "073 765 1664" for an agent to read out. */
export function localZaFormat(e164: string): string {
  const m = e164.match(/^\+27(\d{2})(\d{3})(\d{4})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}
