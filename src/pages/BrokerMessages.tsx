/** /broker/messages (legacy/elite skin): the "Message Lead Velocity" box. The SortMyCover skin is pages/portal/Messages.tsx. */
import { Navigate } from "react-router-dom";
import BrokerLayout from "@/components/broker/BrokerLayout";
import MessageUs from "@/components/broker/smc/MessageUs";
import { useCurrentBroker } from "@/lib/smc";

export default function BrokerMessages() {
  const { broker, userId, loading } = useCurrentBroker();
  // Signed out: go to the broker sign-in, as the other /broker/* pages do (not the portal shell with Logout).
  if (!loading && !userId) return <Navigate to="/broker" replace />;
  return (
    <BrokerLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Message us</h1>
        {loading ? <p className="text-slate-400">Loading…</p> : broker ? <MessageUs brokerId={broker.id} /> : <p className="text-slate-400">Your account isn't linked to a broker profile yet.</p>}
      </div>
    </BrokerLayout>
  );
}
