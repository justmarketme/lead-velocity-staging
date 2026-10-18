/**
 * Wraps /broker/calendar. ms-oauth always redirects there after Microsoft sign-in; if the sign-in was started from another
 * portal page (elite Appointment Center, legacy dashboard) the broker goes straight back to it, result params attached.
 */
import { ReactNode, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { takeMsReturn, withCallbackParams } from "@/lib/smcMsClient";

export default function MsReturnGate({ children }: { children: ReactNode }) {
  const { search } = useLocation();
  const [target] = useState<string | null>(() => {
    const p = new URLSearchParams(search);
    return p.has("calendar") || p.has("error") ? takeMsReturn() : null;
  });
  if (target) return <Navigate to={withCallbackParams(target, search)} replace />;
  return <>{children}</>;
}
