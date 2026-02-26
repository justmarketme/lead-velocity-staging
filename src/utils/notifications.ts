import { supabase } from "@/integrations/supabase/client";

/**
 * Sends a notification email to the broker when an appointment is changed.
 * NOTE: This is a front-end trigger for a backend Supabase Edge Function.
 */
export const notifyBrokerOfAppointmentChange = async (brokerId: string, leadName: string, newDate: string) => {
    try {
        // Fetch broker email
        const { data: broker } = await supabase
            .from("brokers")
            .select("email, contact_person")
            .eq("id", brokerId)
            .single();

        if (broker && broker.email) {
            // Trigger the Edge Function
            const { error } = await supabase.functions.invoke("send-appointment-update", {
                body: {
                    to: broker.email,
                    brokerName: broker.contact_person,
                    leadName: leadName,
                    newDate: newDate,
                }
            });

            if (error) throw error;
            console.log("Notification sent successfully");
        }
    } catch (error) {
        console.error("Failed to notify broker:", error);
    }
};
