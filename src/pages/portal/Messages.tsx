/** /broker/messages (SortMyCover skin): the "Message Lead Velocity" box. */
import PortalShell, { usePortal } from "./PortalShell";
import MessageUs from "@/components/broker/smc/MessageUs";

function Body() {
  const { broker } = usePortal();
  return <MessageUs brokerId={broker.id} />;
}

export default function Messages() {
  return <PortalShell title="Message us" progress={false}><Body /></PortalShell>;
}
