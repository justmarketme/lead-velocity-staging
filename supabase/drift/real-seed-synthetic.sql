-- SYNTHETIC rows only (random-looking fake data) so row counts / checksums of the mirror can be compared before and after the smc chain.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('00000000-0000-4000-8000-000000000001','admin@example.test','{}'),
 ('00000000-0000-4000-8000-000000000002','broker1@example.test','{"user_type":"broker"}'),
 ('00000000-0000-4000-8000-000000000003','broker2@example.test','{"user_type":"broker"}') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-000000000001','admin'),('00000000-0000-4000-8000-000000000002','broker'),('00000000-0000-4000-8000-000000000003','broker') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (user_id, full_name) VALUES ('00000000-0000-4000-8000-000000000001','Admin Test'),('00000000-0000-4000-8000-000000000002','Broker One') ON CONFLICT DO NOTHING;
INSERT INTO public.brokers (id, user_id, firm_name, contact_person, email, status, tier) VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Firm One','Broker One','broker1@example.test','Active','Pilot'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','Firm Two','Broker Two','broker2@example.test','Active','Bronze'),
 ('10000000-0000-4000-8000-000000000003',NULL,'Prospect Firm','Prospect','prospect@example.test','Prospect','Pilot');
INSERT INTO public.leads (id, email, phone, broker_id, first_name, last_name, source, current_status, company, role, vibe)
SELECT ('20000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid, 'lead'||g||'@example.test', '+2760000'||lpad(g::text,4,'0'),
       CASE WHEN g%3=0 THEN '10000000-0000-4000-8000-000000000001'::uuid WHEN g%3=1 THEN '10000000-0000-4000-8000-000000000002'::uuid ELSE NULL END,
       'First'||g, 'Last'||g, 'Search Lead', 'New', 'Co '||g, 'Owner', g%100
FROM generate_series(1,40) g;
INSERT INTO public.appointments (broker_id, client_id, appointment_date, status) VALUES
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003', now()+interval '1 day','Scheduled');
INSERT INTO public.lead_activities (lead_id, agent_id, activity_type, notes) VALUES ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','call','synthetic');
INSERT INTO public.lead_orders (id, broker_id, title, lead_count, amount_zar, status) VALUES ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Order 1',5,5000,'paid');
INSERT INTO public.lead_order_items (order_id, lead_id) SELECT '30000000-0000-4000-8000-000000000001', id FROM public.leads LIMIT 5;
INSERT INTO public.broker_notes (lead_id, author_id, author_role, content) VALUES ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','broker','synthetic note');
INSERT INTO public.communications (channel, direction, sender_type, recipient_type, recipient_contact, broker_id, lead_id) VALUES ('email','outbound','admin','broker','broker1@example.test','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
INSERT INTO public.clients (id, name, email) VALUES ('40000000-0000-4000-8000-000000000001','Client A','clienta@example.test');
INSERT INTO public.reports (client_id, health_score) VALUES ('40000000-0000-4000-8000-000000000001', 80);
INSERT INTO public.conversations (teams_thread_id, conversation_ref) VALUES ('synthetic-thread','{}');
INSERT INTO public.conversation_messages (conversation_id, role, content) VALUES ('emma-global','user','synthetic');
INSERT INTO public.research_notes (query, note) VALUES ('q','n');
INSERT INTO public.tunnel_config (url) VALUES ('https://example.test');
INSERT INTO public.message_templates (name, channel, content, created_by) VALUES ('t','email','body','00000000-0000-4000-8000-000000000001');
INSERT INTO public.sla_thresholds (channel) VALUES ('email'),('sms');
INSERT INTO public.broker_onboarding_responses (full_name, email, firm_name, crm_usage, speed_to_contact, team_size, follow_up_process, monthly_lead_spend, cpl_awareness, pricing_comfort, desired_leads_weekly, max_capacity_weekly, product_focus_clarity, geographic_focus_clarity, growth_goal_clarity, timeline_to_start)
 VALUES ('Onb One','onb1@example.test','Onb Firm','none','fast','1','manual','1000','yes','ok',10,20,'clear','clear','clear','now');
