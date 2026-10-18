/**
 * /admin/preview/broker/:brokerId — admins only. Renders the broker's real landing portal (/broker-elite) with his data,
 * loaded through the admin's session, read-only. See src/lib/brokerPreview.tsx.
 */
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useIsAdmin } from "@/lib/smc";
import { BrokerPreviewContext, installPreviewWriteGuard } from "@/lib/brokerPreview";
import PremiumBrokerPortalPage from "./PremiumBrokerPortalPage";

export default function AdminBrokerPreview() {
  const { brokerId = "" } = useParams();
  const { loading, isAdmin, userId } = useIsAdmin();
  const [guarded, setGuarded] = useState(false);

  // The portal mounts only after the write guard is in place, so none of its effects can run unguarded.
  useEffect(() => {
    if (!isAdmin) return;
    const remove = installPreviewWriteGuard();
    setGuarded(true);
    return () => { remove(); setGuarded(false); };
  }, [isAdmin]);

  if (loading) return <div className="min-h-screen bg-[#020617]" />;
  if (!userId) return <Navigate to="/admin" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  if (!guarded) return <div className="min-h-screen bg-[#020617]" />;
  return (
    <BrokerPreviewContext.Provider value={{ brokerId }}>
      <PremiumBrokerPortalPage key={brokerId} />
    </BrokerPreviewContext.Provider>
  );
}
