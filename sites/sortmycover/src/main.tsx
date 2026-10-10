/* Browser entry. The HTML is already complete (pre-rendered); this hydrates it. The current route's chunk is loaded first so that
   hydration renders exactly what the server sent. Campaign pages carry data-campaign / data-view on #root (the URL on a campaign
   host is "/" while the file is /_c/<slug>/). */
import { hydrateRoot, createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { allRoutes, apexRoutes, notFoundRoute } from "./routes";
import { bootPixel } from "@/lib/pixel";
import { startRum } from "@/lib/rum";

async function start() {
  const rootEl = document.getElementById("root")!;
  const slug = rootEl.dataset.campaign;
  let tree;
  if (slug) {
    const view = (rootEl.dataset.view as "landing" | "thanks") || "landing";
    const r = allRoutes.find((x) => x.campaign?.slug === slug && x.campaign.view === view)!;
    await r.Component.preload();
    tree = <BrowserRouter><r.Component /></BrowserRouter>;
  } else {
    const path = location.pathname.endsWith("/") || location.pathname.endsWith(".html") ? location.pathname : location.pathname + "/";
    const r = apexRoutes.find((x) => x.path === path);
    await (r ? r.Component : notFoundRoute.Component).preload();
    tree = <BrowserRouter><App /></BrowserRouter>;
  }
  if (rootEl.hasChildNodes()) hydrateRoot(rootEl, tree);
  else createRoot(rootEl).render(tree); // dev server (no pre-rendered HTML)
  startRum(slug || "site");
  bootPixel(); // loads Meta only if the visitor already gave the optional consent
}
start();
