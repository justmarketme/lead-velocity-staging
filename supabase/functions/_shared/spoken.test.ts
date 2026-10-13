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
  ["email gmail dot com (brief)", normalizeEmail("john at gmail dot com"), "john@gmail.com"],
  ["email 'at' already symbol, 'dot' spoken", normalizeEmail("john@gmail dot com"), "john@gmail.com"],
  ["email period", normalizeEmail("Mary period Smith at outlook period com"), "mary.smith@outlook.com"],
  ["email full stop co za", normalizeEmail("thandi at company full stop co full stop za"), "thandi@company.co.za"],
  ["email spelled letters", normalizeEmail("j o h n at g mail dot com"), "john@gmail.com"],
  ["email at symbol words", normalizeEmail("pat at symbol pat dot co dot za"), "pat@pat.co.za"],
  ["email double at rejected", normalizeEmail("a at b at c dot com"), null],
  ["email no tld rejected", normalizeEmail("john at gmail"), null],
  ["email invalid", normalizeEmail("jono leadvelocity"), null],
  ["email empty", normalizeEmail(""), null],
  ["url spoken www", normalizeUrl("w w w dot leadvelocity dot co dot za"), "www.leadvelocity.co.za"],
  ["url triple w", normalizeUrl("triple w dot acme dot co dot za slash contact"), "www.acme.co.za/contact"],
  ["url https", normalizeUrl("https://www.leadvelocity.co.za/"), "www.leadvelocity.co.za"],
  ["url invalid", normalizeUrl("lead velocity"), null],
  ["url no www", normalizeUrl("acme insurance dot co dot za"), "acmeinsurance.co.za"],
  ["url http colon slash slash", normalizeUrl("h t t p s colon slash slash acme dot com slash about"), "acme.com/about"],
  ["url uppercase", normalizeUrl("WWW.LeadVelocity.CO.ZA/Pricing"), "www.leadvelocity.co.za/pricing"],
  ["phone local", normalizeZaPhone("082 555 1234"), "+27825551234"],
  ["phone 27", normalizeZaPhone("27825551234"), "+27825551234"],
  ["phone e164", normalizeZaPhone("+27 82 555 1234"), "+27825551234"],
  ["phone 00", normalizeZaPhone("0027825551234"), "+27825551234"],
  ["phone too short", normalizeZaPhone("12345"), null],
  ["phone spoken words", normalizeZaPhone("oh eight two double five five, one two three four"), "+27825551234"],
  ["phone spoken triple", normalizeZaPhone("zero seven three triple seven, one six six four"), "+27737771664"],
  ["phone dashes", normalizeZaPhone("082-555-1234"), "+27825551234"],
  ["phone plus words", normalizeZaPhone("plus two seven eight two five five five one two three four"), "+27825551234"],
  ["phone number type", normalizeZaPhone(825551234), "+27825551234"],
  ["phone landline 010", normalizeZaPhone("010 976 5618"), "+27109765618"],
  ["phone garbage", normalizeZaPhone("call me maybe"), null],
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
