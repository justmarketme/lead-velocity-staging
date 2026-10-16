// Browser e2e for admin CRM access on the PRODUCTION build (vite preview of dist/ on :4317):
// admin invite sign-up (new + existing email), admin "Forgot password", and the admin reset link.
// Every Supabase call is intercepted: nothing real is read, created or emailed.
// Run via the Playwright MCP `browser_run_code_unsafe` (copy into Desktop\EMMA\.playwright-mcp first).
async (page) => {
  const BASE = "http://localhost:4317";
  const SB = "https://cmsylaupctrbsvzrgzwy.supabase.co";
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const uid = "00000000-0000-4000-8000-0000000000d1";
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: uid, role: "authenticated", exp: 4102444800, aud: "authenticated" })}.sig`;
  const user = { id: uid, aud: "authenticated", role: "authenticated", email: "new-admin@example.test", user_metadata: {}, app_metadata: {} };
  const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user };
  const S = { existing: false, calls: [] };

  await page.context().route(`${SB}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const accept = req.headers()["accept"] || "";
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const log = (name) => S.calls.push({ name, url: req.url(), body: req.postData(), auth: req.headers()["authorization"] });
    if (path === "/auth/v1/signup") {
      log("signup");
      if (S.existing) return json({ code: 422, error_code: "user_already_exists", msg: "User already registered" }, 422);
      return json(session);
    }
    if (path === "/auth/v1/recover") { log("recover"); return json({}); }
    if (path === "/auth/v1/verify") { log("verify"); return json(session); }
    if (path === "/auth/v1/user" && req.method() === "PUT") { log("update_user"); return json(user); }
    if (path === "/auth/v1/user") return json(user);
    if (path === "/auth/v1/logout") { log("logout"); return route.fulfill({ status: 204, body: "" }); }
    if (path.startsWith("/auth/v1/")) return json({});
    if (path === "/rest/v1/rpc/get_admin_invite_by_token") { log("lookup"); return json([{ valid: true, email: S.existing ? "jonojettoo@leadvelocity.co.za" : "new-admin@example.test" }]); }
    if (path === "/rest/v1/rpc/use_admin_invite") { log("use_invite"); return json(true); }
    if (path === "/rest/v1/rpc/has_role") return json(false);
    if (path === "/rest/v1/user_roles") return json(accept.includes("object") ? { role: "admin" } : [{ role: "admin" }]);
    if (path.startsWith("/rest/v1/rpc/")) return json(null);
    if (req.method() !== "GET") return json(null, 201);
    return json(accept.includes("object") ? null : []);
  });
  const out = {};
  const fillInvite = async () => {
    await page.getByPlaceholder("Enter your full name").fill("New Admin");
    await page.getByPlaceholder("Create a password").fill("Sup3rSecret!");
    for (const i of [0, 1]) {
      await page.getByRole("combobox").nth(i).click();
      await page.getByRole("option").filter({ hasNot: page.locator("[data-disabled]") }).nth(i).click();
    }
    await page.getByPlaceholder("Your answer").nth(0).fill("answer one");
    await page.getByPlaceholder("Your answer").nth(1).fill("answer two");
    await page.locator('button[type="submit"]').click();
  };

  // A. New invitee: account created, invite applied on the new session, lands on the admin login.
  await page.goto(`${BASE}/invite/tok-new`);
  await page.getByPlaceholder("Enter your full name").waitFor({ timeout: 20000 });
  out.A_emailLocked = await page.getByPlaceholder("Enter your email").isDisabled();
  await fillInvite();
  await page.waitForURL("**/admin", { timeout: 10000 });
  const useCall = S.calls.find((c) => c.name === "use_invite");
  out.A_inviteUsedNewSession = useCall?.auth === `Bearer ${jwt}`;
  out.A_landedOnAdminLogin = new URL(page.url()).pathname === "/admin";

  // B. Existing login (e.g. jonojettoo@): clear message, buttons to admin sign-in and Forgot password.
  S.existing = true;
  await page.goto(`${BASE}/invite/tok-existing`);
  await page.getByPlaceholder("Enter your full name").waitFor();
  await fillInvite();
  await page.getByText("already has a Lead Velocity login", { exact: false }).waitFor({ timeout: 10000 });
  out.B_existingMessage = true;
  await page.getByRole("button", { name: "Forgot password" }).click();
  await page.waitForURL("**/admin?forgot=1");
  out.B_forgotFormOpen = await page.getByPlaceholder("howzit@leadvelocity.co.za").isVisible();

  // C. Admin Forgot password sends the recovery email back to /reset-password.
  await page.getByPlaceholder("howzit@leadvelocity.co.za").fill("jonojettoo@leadvelocity.co.za");
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForTimeout(800);
  const rec = S.calls.find((c) => c.name === "recover");
  out.C_recoverSent = !!rec && rec.body.includes("jonojettoo@leadvelocity.co.za") && decodeURIComponent(rec.url).includes("/reset-password");

  // D. Admin reset link (as the email builds it): admin wording, saves, lands in the admin CRM.
  await page.goto(`${BASE}/reset-password?token_hash=HASH&type=recovery&portal=admin`);
  await page.getByPlaceholder("At least 8 characters").waitFor({ timeout: 10000 });
  out.D_adminWording = await page.getByText("admin CRM login", { exact: false }).isVisible();
  out.D_noBrokerWording = (await page.getByText("broker portal", { exact: false }).count()) === 0;
  await page.getByPlaceholder("At least 8 characters").fill("N3wPassw0rd!x");
  await page.getByPlaceholder("Type it again").fill("N3wPassw0rd!x");
  await page.getByRole("button", { name: "Save password and continue" }).click();
  await page.waitForURL("**/dashboard", { timeout: 10000 }).catch(() => {});
  const ver = S.calls.find((c) => c.name === "verify");
  out.D_tokenVerified = !!ver && ver.body.includes("HASH");
  out.D_passwordSaved = S.calls.some((c) => c.name === "update_user" && c.body.includes("N3wPassw0rd!x"));
  out.D_wentToAdminCrm = new URL(page.url()).pathname === "/dashboard";

  // E. Dead admin link leads back to the admin Forgot password, not the broker one.
  await page.goto(`${BASE}/reset-password?portal=admin`);
  await page.getByRole("button", { name: "Send me a new link" }).click();
  await page.waitForURL("**/admin?forgot=1", { timeout: 10000 }).catch(() => {});
  out.E_expiredGoesToAdminForgot = page.url().endsWith("/admin?forgot=1");
  return out;
}
