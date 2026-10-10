import { Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { apexRoutes } from "./routes";

export default function App() {
  return (
    <Layout>
      <Suspense fallback={null}>
        <Routes>
          {apexRoutes.map((r) => <Route key={r.path} path={r.path} element={<r.Component />} />)}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
