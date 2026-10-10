/* Server entry, used only by scripts/build.mjs (loaded through Vite's SSR module loader): renders one route to an HTML string. */
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import App from "./App";
import { HeadCtx, renderHead, type HeadData } from "@/lib/head";
import { allRoutes, fileFor, notFoundRoute, type RouteDef } from "./routes";

export { allRoutes, fileFor, notFoundRoute };
export type { RouteDef };

export async function render(route: RouteDef): Promise<{ html: string; head: string; campaign?: RouteDef["campaign"] }> {
  await route.Component.preload();
  let data: HeadData | undefined;
  const collect = (d: HeadData) => { data = d; };
  const location = route.kind === "campaign" ? (route.campaign!.view === "thanks" ? "/thanks/" : "/") : route.path;
  const tree = (
    <HeadCtx.Provider value={{ collect }}>
      <StaticRouter location={location}>
        {route.kind === "campaign" ? <route.Component /> : route === notFoundRoute ? <App /> : <App />}
      </StaticRouter>
    </HeadCtx.Provider>
  );
  const html = renderToString(tree);
  if (!data) throw new Error(`No <Seo/> rendered for ${route.path}`);
  return { html, head: renderHead(data), campaign: route.campaign };
}
