import { Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { apexRoutes, isBarePath } from "./routes";

export default function App() {
  const routes = (
    <Suspense fallback={null}>
      <Routes>
        {apexRoutes.map((r) => <Route key={r.path} path={r.path} element={<r.Component />} />)}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
  // the private /start/ page draws its own minimal header and compliance footer: no site nav, no chat widget
  return isBarePath(useLocation().pathname) ? routes : <Layout>{routes}</Layout>;
}
