import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../..');
const release='C:/Users/Jono/AppData/Local/Temp/lv-portal-onboarding-release';
const explainer=`import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BrokerOnboardingVideo from "@/components/broker/BrokerOnboardingVideo";
export default function Explainer() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [home, setHome] = useState("/broker/orders");
  useEffect(() => {
    let active = true;
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { navigate("/broker", { replace: true }); return; }
      const { data: broker } = await supabase.from("brokers").select("id,portal_type").eq("user_id", data.session.user.id).single();
      if (!broker) { navigate("/broker", { replace: true }); return; }
      if (active) { setHome(["marketing", "premium"].includes(broker.portal_type || "") ? "/broker-elite" : "/broker/orders"); setReady(true); }
    }
    void check();
    return () => { active = false; };
  }, [navigate]);
  return <main className="min-h-screen bg-[#170c25] px-5 py-8 text-white"><div className="mx-auto max-w-5xl"><button onClick={() => navigate(home)} className="mb-8 text-sm text-pink-300 hover:text-white">← Back to your portal</button>{ready ? <BrokerOnboardingVideo /> : <p role="status">Checking your broker account…</p>}</div></main>;
}
`;
for(const dest of [repo,release]){
 const client=path.join(dest,'src/integrations/supabase/client.ts');let clientCode=fs.readFileSync(client,'utf8');clientCode=clientCode.replace('= import.meta.env.VITE_SUPABASE_URL;','= import.meta.env.VITE_SUPABASE_URL?.trim();').replace('= import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;','= import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();');fs.writeFileSync(client,clientCode);
 const media=path.join(dest,'public/media/explainer/en');fs.mkdirSync(media,{recursive:true});
 if(dest!==repo)fs.copyFileSync(path.join(repo,'src/components/broker/PremiumDashboard.tsx'),path.join(dest,'src/components/broker/PremiumDashboard.tsx'));
 for(const file of ['explainer.mp4','explainer.vtt','thumbnail.jpg','Lead-Velocity-Broker-Onboarding-WhatsApp.mp4'])fs.copyFileSync(path.join(root,'final',file),path.join(media,file));
 fs.copyFileSync(path.join(root,'final','chapters.json'),path.join(dest,'src/lib/broker-onboarding-chapters.json'));
 if(dest!==repo)fs.copyFileSync(path.join(repo,'src/components/broker/BrokerOnboardingVideo.tsx'),path.join(dest,'src/components/broker/BrokerOnboardingVideo.tsx'));
 fs.writeFileSync(path.join(dest,'src/pages/broker/Explainer.tsx'),explainer);
 const premium=path.join(dest,'src/pages/PremiumBrokerPortalPage.tsx');let p=fs.readFileSync(premium,'utf8');
 if(!p.includes('label: "Onboarding guide"'))p=p.replace('{ id: "settings", label:', '{ id: "onboarding-guide", label: "Onboarding guide", icon: Sparkles },\n        { id: "settings", label:');
 const menuHandler='onClick={() => item.id === "onboarding-guide" ? navigate("/broker/explainer") : item.id === "leads" ? navigate("/broker/leads") : setActiveTab(item.id)}';
 p=p.replace('onClick={() => setActiveTab(item.id)}',menuHandler).replace('onClick={() => item.id === "onboarding-guide" ? navigate("/broker/explainer") : setActiveTab(item.id)}',menuHandler);
 p=p.replace('.select("*, broker_onboarding_responses(*), profiles(*)")','.select("*, broker_onboarding_responses(*)")');
 if(!p.includes('data: brokerProfile'))p=p.replace('const enrichedBroker = {','const { data: brokerProfile } = await supabase.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle();\n            const enrichedBroker = {\n                profiles: brokerProfile,');
 fs.writeFileSync(premium,p);
 const app=path.join(dest,'src/App.tsx');let routes=fs.readFileSync(app,'utf8');routes=routes.replace('shared(<PortalLeads />, <Navigate to="/broker/orders" replace />)','shared(<PortalLeads />, <BrokerLeads />)');fs.writeFileSync(app,routes);
 const start=path.join(dest,'src/pages/portal/Start.tsx');if(fs.existsSync(start)){let t=fs.readFileSync(start,'utf8');const chapters=JSON.parse(fs.readFileSync(path.join(root,'final','chapters.json'),'utf8'));t=t.replace(/const CHAPTERS: \[string, number\]\[\] = \[[\s\S]*?\];/, 'const CHAPTERS: [string, number][] = '+JSON.stringify(chapters.map(c=>[c.title,c.start]))+';');t=t.replace("Start here: 3 minutes, then you're set","Start here: your broker onboarding guide").replace('Start here: 3 minutes, then you’re set','Start here: your broker onboarding guide').replace('The 3-minute explainer video','Broker onboarding explainer video');t=t.replace('<video ref={video}', '<video poster="/media/explainer/en/thumbnail.jpg" ref={video}');fs.writeFileSync(start,t);}
}
fs.copyFileSync(path.join(root,'final','Lead-Velocity-Broker-Onboarding-WhatsApp.mp4'),'C:/Users/Jono/Desktop/Lead-Velocity-Broker-Onboarding-WhatsApp.mp4');
console.log('Integrated generic video into both portal versions and isolated production export.');
