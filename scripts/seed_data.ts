
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY; // Fallback for dev

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase credentials in environment variables.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DUMMY_BROKERS = [
    {
        id: "00000000-0000-0000-0000-000000000001",
        firm_name: "Apex Financial",
        contact_person: "John Smith",
        email: "john@apex.com",
        phone_number: "+15550101",
        user_id: "00000000-0000-0000-0000-000000000001",
        status: "active"
    },
    {
        id: "00000000-0000-0000-0000-000000000002",
        firm_name: "Velocity Brokers",
        contact_person: "Sarah Connor",
        email: "sarah@velocity.com",
        phone_number: "+15550102",
        user_id: "00000000-0000-0000-0000-000000000002",
        status: "active"
    }
];

const DUMMY_LEADS = [
    { first_name: "Alice", last_name: "Johnson", email: "alice.j@example.com", phone: "+15550201", current_status: "New", source: "Website", notes: "Interested in life insurance." },
    { first_name: "Bob", last_name: "Williams", email: "bob.w@example.com", phone: "+15550202", current_status: "Contacted", source: "Referral", notes: "Spoke yesterday, needs follow up." },
    { first_name: "Charlie", last_name: "Brown", email: "charlie.b@example.com", phone: "+15550203", current_status: "Appointment Booked", source: "Seminar", notes: "Meeting scheduled for next Tuesday." },
    { first_name: "Diana", last_name: "Prince", email: "diana.p@example.com", phone: "+15550204", current_status: "New", source: "Facebook Ad", notes: "Clicked on retirement planning ad." },
    { first_name: "Edward", last_name: "Norton", email: "edward@example.com", phone: "+15550205", current_status: "Will Done", source: "Google Search", notes: "Will completed and signed." },
    { first_name: "Fiona", last_name: "Gallagher", email: "fiona@example.com", phone: "+15550206", current_status: "Follow-up", source: "Referral", notes: "Needs a follow-up call after the move." },
    { first_name: "George", last_name: "Clooney", email: "george@example.com", phone: "+15550207", current_status: "New", source: "Event", notes: "Met at the insurance gala." },
    { first_name: "Hannah", last_name: "Abbott", email: "hannah@example.com", phone: "+15550208", current_status: "Contacted", source: "Website", notes: "Requested a quote online." },
    { first_name: "Ian", last_name: "McKellen", email: "ian@example.com", phone: "+15550209", current_status: "Appointment Booked", source: "Direct Mail", notes: "Interested in estate planning." },
    { first_name: "Julia", last_name: "Roberts", email: "julia@example.com", phone: "+15550210", current_status: "Rejected", source: "Seminar", notes: "Not interested at this time." },
    { first_name: "Kevin", last_name: "Hart", email: "kevin@example.com", phone: "+15550211", current_status: "New", source: "Facebook Ad", notes: "Laughing at the prices, but interested." },
    { first_name: "Laura", last_name: "Palmer", email: "laura@example.com", phone: "+15550212", current_status: "Contacted", source: "Referral", notes: "Referred by Cooper." },
    { first_name: "Michael", last_name: "Scott", email: "michael@paper.com", phone: "+15550213", current_status: "Appointment Booked", source: "Website", notes: "Needs insurance for the warehouse." },
    { first_name: "Nancy", last_name: "Drew", email: "nancy@mystery.com", phone: "+15550214", current_status: "Will Done", source: "Google Search", notes: "Mystery solved, will complete." },
    { first_name: "Oscar", last_name: "Isaac", email: "oscar@example.com", phone: "+15550215", current_status: "Follow-up", source: "Event", notes: "Follow up about life insurance." },
    { first_name: "Paul", last_name: "Rudd", email: "paul@example.com", phone: "+15550216", current_status: "New", source: "Website", notes: "Ant-sized interest in life insurance." },
    { first_name: "Quinn", last_name: "Fabray", email: "quinn@example.com", phone: "+15550217", current_status: "Contacted", source: "Direct Mail", notes: "Checking out the mailer." },
    { first_name: "Rachel", last_name: "Green", email: "rachel@fashion.com", phone: "+15550218", current_status: "Appointment Booked", source: "Referral", notes: "Ross referred her." },
    { first_name: "Sam", last_name: "Winchester", email: "sam@example.com", phone: "+15550219", current_status: "Rejected", source: "Event", notes: "Busy with family business." },
    { first_name: "Tina", last_name: "Fey", email: "tina@example.com", phone: "+15550220", current_status: "New", source: "Seminar", notes: "Great interaction at the seminar." }
];

async function seedData() {
    console.log("Seeding data...");

    // 1. Insert/Update Brokers
    console.log("Processing brokers...");
    for (const broker of DUMMY_BROKERS) {
        const { error } = await supabase
            .from("brokers")
            .upsert(broker, { onConflict: "email" });
        if (error) console.error(`Error with broker ${broker.email}:`, error.message);
    }

    const { data: brokers } = await supabase.from("brokers").select("id");
    if (!brokers || brokers.length === 0) {
        console.error("No brokers available to assign leads.");
        return;
    }

    // 2. Insert Leads
    const assignedLeads = DUMMY_LEADS.map(lead => ({
        ...lead,
        broker_id: brokers[Math.floor(Math.random() * brokers.length)].id
    }));

    console.log("Inserting leads...");
    const { data: insertedLeads, error: leadError } = await supabase
        .from("leads")
        .upsert(assignedLeads, { onConflict: "email" })
        .select();

    if (leadError) {
        console.error("Error inserting leads:", leadError.message);
    } else {
        console.log(`Successfully processed ${insertedLeads?.length || 0} leads.`);
    }

    console.log("Seeding complete.");
}

seedData();
