import { assertEquals } from "jsr:@std/assert@1";
import { plan, TEAM } from "./index.ts";

Deno.test("team-notify: sends to team addresses from howzit@", () => {
  const p = plan({ to: ["motsopule@gmail.com", "kgomotsopule@leadvelocity.co.za"], cc: ["howzit@leadvelocity.co.za"], subject: "Hi", text: "x" });
  assertEquals(p.ok, true);
  if (p.ok) {
    assertEquals(p.payload.from, "Lead Velocity <howzit@leadvelocity.co.za>");
    assertEquals(p.payload.reply_to, "howzit@leadvelocity.co.za");
    assertEquals(p.payload.cc, ["howzit@leadvelocity.co.za"]);
  }
});

Deno.test("team-notify: refuses any address outside the team", () => {
  const p = plan({ to: ["someone@example.com"], subject: "Hi", text: "x" });
  assertEquals(p.ok, false);
  const q = plan({ to: ["motsopule@gmail.com"], cc: ["client@gmail.com"], subject: "Hi", text: "x" });
  assertEquals(q.ok, false);
});

Deno.test("team-notify: needs a subject and a body", () => {
  assertEquals(plan({ to: ["howzit@leadvelocity.co.za"], text: "x" }).ok, false);
  assertEquals(plan({ to: ["howzit@leadvelocity.co.za"], subject: "Hi" }).ok, false);
  assertEquals(plan({ subject: "Hi", text: "x" }).ok, false);
});

Deno.test("team-notify: addresses are case-insensitive", () => {
  assertEquals(plan({ to: ["MotsoPule@Gmail.com"], subject: "Hi", text: "x" }).ok, true);
  assertEquals(TEAM.size, 5);
});
