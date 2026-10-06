import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BrokerLayout from "@/components/broker/BrokerLayout";
import OrderAgreements from "@/components/broker/OrderAgreements";

// Read-only documents home: the broker's Agreement + Invoice (view / sign / download).
// No uploads — brokers never add documents here.
const BrokerDocuments = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any | null>(null);
  const [broker, setBroker] = useState<{ contact_person: string | null; firm_name: string | null; email: string | null }>({
    contact_person: null,
    firm_name: null,
    email: null,
  });

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }
      const { data: b } = await supabase
        .from("brokers")
        .select("id, contact_person, firm_name, email")
        .eq("user_id", session.user.id)
        .single();

      if (!b) {
        setLoading(false);
        return;
      }
      setBroker({
        contact_person: (b as any).contact_person ?? null,
        firm_name: (b as any).firm_name ?? null,
        email: (b as any).email ?? null,
      });

      const { data: orders } = await (supabase as any)
        .from("lead_orders")
        .select("*")
        .eq("broker_id", (b as any).id)
        .order("created_at", { ascending: false });

      setOrder((orders && orders[0]) || null);
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSigned = (result: { signedAt: string | null; signature: string | null; signatureImage?: string | null; status: string }) => {
    setOrder((prev: any) =>
      prev
        ? {
            ...prev,
            contract_signed_at: result.signedAt,
            contract_signature: result.signature,
            contract_signature_image: result.signatureImage ?? prev.contract_signature_image,
            status: result.status || "contract_signed",
          }
        : prev,
    );
  };

  return (
    <BrokerLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-muted-foreground">
            Your agreement and invoice — review, sign and download.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : !order ? (
          <p className="text-muted-foreground">
            Your agreement and invoice will appear here once your order is set up.
          </p>
        ) : (
          <OrderAgreements
            order={order}
            brokerContactName={broker.contact_person || ""}
            brokerFirmName={broker.firm_name || ""}
            brokerEmail={broker.email || ""}
            onSigned={handleSigned}
          />
        )}
      </div>
    </BrokerLayout>
  );
};

export default BrokerDocuments;
