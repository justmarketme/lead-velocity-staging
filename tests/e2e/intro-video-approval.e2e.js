// Browser e2e for the broker intro-video approval on the PRODUCTION build (vite preview of dist/ on :4317).
// Put a real take at dist/__e2e_test.mp4 first (e.g. Mark's 12.9 s edit). Every Supabase call is intercepted:
// a synthetic broker session, no real data read or written.
// Run via the Playwright MCP `browser_run_code_unsafe` (copy into Desktop\EMMA\.playwright-mcp first).
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
  const S = { approved: false, rpc: [], signSeconds: [], failNextVideo: false };

  await page.context().unrouteAll({ behavior: "ignoreErrors" });
  await page.context().route(`${SB}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const accept = req.headers()["accept"] || "";
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/auth/v1/user")) return json(user);
    if (path.startsWith("/auth/v1/")) return json({});
    if (path.startsWith("/storage/v1/object/sign/e2e/")) {
      if (S.failNextVideo) { S.failNextVideo = false; return json({ error: "InvalidJWT", message: "exp" }, 400); }
      return route.fulfill({ response: await route.fetch({ url: `${BASE}/__e2e_test.mp4`, headers: req.headers() }) });
    }
    if (path.startsWith("/storage/v1/object/sign/")) {
      S.signSeconds.push(JSON.parse(req.postData() || "{}").expiresIn);
      return json({ signedURL: `/object/sign/e2e/video.mp4?token=${Date.now()}` });
    }
    if (path === "/rest/v1/rpc/broker_approve_intro_video") {
      S.rpc.push({ body: req.postDataJSON(), auth: req.headers()["authorization"] });
      S.approved = true;
      return json({ media_id: mediaId, approved_at: new Date().toISOString(), client_delivery_ready: false, changed: true });
    }
    if (path === "/rest/v1/rpc/has_role") return json(false);
    if (path.startsWith("/rest/v1/rpc/")) return json(null);
    if (path === "/rest/v1/brokers") return json(accept.includes("object") ? broker : [broker]);
    if (path === "/rest/v1/broker_media") {
      const row = { id: mediaId, kind: "video", state: S.approved ? "approved" : "ready", version: 1, created_at: "2026-10-15T10:00:00Z",
        approved_at: S.approved ? new Date().toISOString() : null, url: `broker-media/${brokerId}/intro.mp4`, thumbnail_url: null, ai_check: { source: "whatsapp" } };
      return json(accept.includes("object") ? row : [row]);
    }
    if (req.method() !== "GET") return json(null, 201);
    return json(accept.includes("object") ? null : []);
  });

  const out = {};
  const sw = page.getByRole("switch", { name: "Approve my intro video" });
  const vid = page.locator('video[aria-label="Preview your intro video"]');
  const open = async () => {
    await page.goto(`${BASE}/broker-elite?tab=intro`);
    await sw.waitFor({ timeout: 20000 });
    await vid.evaluate((v) => new Promise((r) => { if (v.readyState >= 1) r(); else v.addEventListener("loadedmetadata", r, { once: true }); }));
  };
  const playToEnd = async () => {
    await vid.evaluate((v) => { v.muted = true; return v.play(); });
    await page.waitForFunction(() => document.querySelector('video[aria-label="Preview your intro video"]')?.ended, null, { timeout: 40000 });
    await page.waitForTimeout(300);
  };

  await page.goto(`${BASE}/`);
  await page.evaluate(([k, v]) => { sessionStorage.clear(); localStorage.setItem(k, v); }, ["sb-cmsylaupctrbsvzrgzwy-auth-token",
    JSON.stringify({ access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user })]);

  // 1. An expired link on first play is re-signed once and the video still plays.
  S.failNextVideo = true;
  await open();
  out.linkLastsAnHour = S.signSeconds.includes(3600);
  out.lockedBeforeWatching = await sw.isDisabled();
  out.deadLinkGone = (await page.getByText("Watch and approve your video").count()) === 0;

  // 2. Dragging to the end while paused does not unlock it.
  await vid.evaluate((v) => { v.currentTime = v.duration - 0.05; });
  await page.waitForTimeout(500);
  out.lockedAfterPausedScrub = await sw.isDisabled();

  // 3. Part-watched: the note shows progress.
  await vid.evaluate((v) => { v.currentTime = 0; v.muted = true; return v.play(); });
  await page.waitForTimeout(4000);
  await vid.evaluate((v) => v.pause());
  out.progressNote = (await page.getByText(/watched \d+%/).textContent())?.match(/watched \d+%/)?.[0] || null;
  out.lockedWhilePartWatched = await sw.isDisabled();

  // 4. Watching through unlocks it.
  await playToEnd();
  out.unlockedAfterWatching = !(await sw.isDisabled());

  // 5. A reload keeps it unlocked (no need to watch again).
  await open();
  await page.waitForTimeout(500);
  out.unlockedAfterReload = !(await sw.isDisabled());

  // 6. Approve.
  await sw.click();
  await page.getByRole("button", { name: "Yes, switch on" }).click();
  await page.getByText("You approved this video.", { exact: false }).waitFor({ timeout: 10000 });
  out.approvedMessageShown = true;
  out.rpcCalls = S.rpc.length;
  out.rpcBody = S.rpc[0]?.body;
  out.rpcUsedBrokerJwt = S.rpc[0]?.auth === `Bearer ${jwt}`;
  return out;
}
