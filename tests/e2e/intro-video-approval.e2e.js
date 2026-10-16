// Browser e2e for the broker intro-video approval on the PRODUCTION build (vite preview of dist/).
// Every Supabase call is intercepted: a synthetic broker session, no real data read or written.
// Run via the Playwright MCP `browser_run_code_unsafe` (filename) or wrap in @playwright/test.
async (page) => {
  const BASE = "http://localhost:4317";
  const SB = "https://cmsylaupctrbsvzrgzwy.supabase.co";
  const uid = "00000000-0000-4000-8000-0000000000a1";
  const brokerId = "00000000-0000-4000-8000-0000000000b1";
  const mediaId = "00000000-0000-4000-8000-0000000000c1";
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: uid, role: "authenticated", exp: 4102444800, aud: "authenticated" })}.sig`;
  const user = { id: uid, aud: "authenticated", role: "authenticated", email: "e2e-broker@example.test", user_metadata: {}, app_metadata: {} };
  const broker = { id: brokerId, user_id: uid, contact_person: "Test Broker", firm_name: "E2E Practice", tier: "Bronze", bio_short: "Test bio.",
    fsp_number: "12345", languages: ["en"], methods_supported: ["teams"], onboarding_progress: {}, broker_onboarding_responses: [] };
  let approved = false;
  const rpcCalls = [];

  await page.context().route(`${SB}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const accept = req.headers()["accept"] || "";
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/auth/v1/user")) return json(user);
    if (path.startsWith("/auth/v1/")) return json({});
    if (path.startsWith("/storage/v1/object/sign/e2e/")) return route.fulfill({ response: await route.fetch({ url: `${BASE}/__e2e_test.mp4` }) });
    if (path.startsWith("/storage/v1/object/sign/")) return json({ signedURL: "/object/sign/e2e/video.mp4?token=t" });
    if (path === "/rest/v1/rpc/broker_approve_intro_video") {
      rpcCalls.push({ body: req.postDataJSON(), auth: req.headers()["authorization"] });
      approved = true;
      return json({ media_id: mediaId, approved_at: new Date().toISOString(), client_delivery_ready: false, changed: true });
    }
    if (path === "/rest/v1/rpc/has_role") return json(false);
    if (path.startsWith("/rest/v1/rpc/")) return json(null);
    if (path === "/rest/v1/brokers") return json(accept.includes("object") ? broker : [broker]);
    if (path === "/rest/v1/broker_media") {
      const row = { id: mediaId, kind: "video", state: approved ? "approved" : "ready", version: 1, created_at: "2026-10-15T10:00:00Z",
        approved_at: approved ? new Date().toISOString() : null, url: `${brokerId}/intro.mp4`, thumbnail_url: null, ai_check: { source: "whatsapp" } };
      return json(accept.includes("object") ? row : [row]);
    }
    if (req.method() !== "GET") return json(null, 201);
    return json(accept.includes("object") ? null : []);
  });

  await page.goto(`${BASE}/`);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), ["sb-cmsylaupctrbsvzrgzwy-auth-token",
    JSON.stringify({ access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user })]);
  await page.goto(`${BASE}/broker-elite?tab=intro`);

  const out = {};
  const sw = page.getByRole("switch", { name: "Approve my intro video" });
  await sw.waitFor({ timeout: 20000 });
  out.lockedBeforeWatching = await sw.isDisabled();
  out.noteBefore = await page.getByText("Watch your video to the end first", { exact: false }).isVisible();
  out.deadLinkGone = (await page.getByText("Watch and approve your video").count()) === 0;

  // Scrubbing straight to the end must NOT unlock it.
  const vid = page.locator('video[aria-label="Preview your intro video"]');
  await vid.evaluate((v) => new Promise((r) => { v.addEventListener("loadedmetadata", r, { once: true }); if (v.readyState >= 1) r(); }));
  await vid.evaluate((v) => { v.currentTime = v.duration - 0.05; v.dispatchEvent(new Event("timeupdate")); });
  await page.waitForTimeout(300);
  out.lockedAfterScrub = await sw.isDisabled();

  // Actually watch it through.
  await vid.evaluate((v) => { v.muted = true; v.currentTime = 0; return v.play(); });
  await vid.evaluate((v) => new Promise((r) => v.addEventListener("ended", r, { once: true })));
  await page.waitForTimeout(300);
  out.unlockedAfterWatching = !(await sw.isDisabled());

  await sw.click();
  await page.getByRole("button", { name: "Yes, switch on" }).click();
  await page.getByText("You approved this video.", { exact: false }).waitFor({ timeout: 10000 });
  out.approvedMessageShown = true;
  out.rpcCalls = rpcCalls.length;
  out.rpcBody = rpcCalls[0]?.body;
  out.rpcUsedBrokerJwt = rpcCalls[0]?.auth === `Bearer ${jwt}`;
  await page.screenshot({ path: "C:/Users/Jono/lv-hotfix/tests/e2e/intro-video-approved.png", fullPage: false });
  return out;
}
