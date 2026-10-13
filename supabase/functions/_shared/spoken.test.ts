// Run: node supabase/functions/_shared/spoken.test.ts  (Node ≥23 strips types natively)
import { normalizeEmail, normalizeUrl, normalizeZaPhone, localZaFormat } from "./spoken.ts";

const cases: Array<[string, unknown, unknown]> = [
  ["email spoken", normalizeEmail("jono at leadvelocity dot co dot za"), "jono@leadvelocity.co.za"],
  ["email mixed case + spaces", normalizeEmail("Jono AT Lead Velocity . co . za"), "jono@leadvelocity.co.za"],
  ["email already clean", normalizeEmail("jono@leadvelocity.co.za"), "jono@leadvelocity.co.za"],
  ["email underscore/dash", normalizeEmail("thabo underscore m dash 2 at gmail dot com"), "thabo_m-2@gmail.com"],
  ["email at sign", normalizeEmail("info at sign acme dot com"), "info@acme.com"],
  ["email keeps words containing at/dot", normalizeEmail("matt at dotnet dot co dot za"), "matt@dotnet.co.za"],
  ["email trailing punctuation", normalizeEmail("sam@abc.co.za."), "sam@abc.co.za"],
  ["email invalid", normalizeEmail("jono leadvelocity"), null],
  ["email empty", normalizeEmail(""), null],
  ["url spoken www", normalizeUrl("w w w dot leadvelocity dot co dot za"), "www.leadvelocity.co.za"],
  ["url triple w", normalizeUrl("triple w dot acme dot co dot za slash contact"), "www.acme.co.za/contact"],
  ["url https", normalizeUrl("https://www.leadvelocity.co.za/"), "www.leadvelocity.co.za"],
  ["url invalid", normalizeUrl("lead velocity"), null],
  ["phone local", normalizeZaPhone("082 555 1234"), "+27825551234"],
  ["phone 27", normalizeZaPhone("27825551234"), "+27825551234"],
  ["phone e164", normalizeZaPhone("+27 82 555 1234"), "+27825551234"],
  ["phone 00", normalizeZaPhone("0027825551234"), "+27825551234"],
  ["phone too short", normalizeZaPhone("12345"), null],
  ["local format", localZaFormat("+27737651664"), "073 765 1664"],
];

let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (want ${JSON.stringify(want)})`}`);
}
console.log(failed ? `${failed} failed` : "all passed");
if (failed) process.exit(1);
