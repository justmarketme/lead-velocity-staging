// Disposable local PostgreSQL only: no host ports, external credentials or production connection.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=process.cwd();
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
function fn(p,name){
  const found=file(p).match(new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\([\\s\\S]*?AS (\\$\\w*\\$)[\\s\\S]*?\\1;'));
  if(!found)throw Error('Function not found: '+name);
  return found[0];
}
const container='smc-security-test-'+process.pid;
const docker=(args,options={})=>{const r=spawnSync('docker',args,{encoding:'utf8',...options});if(r.status!==0)throw Error(r.stderr||r.stdout||'Docker failed');return r.stdout;};
const sql=[file('supabase/tests/fixtures/broker-security-schema.sql'),
  fn('supabase/migrations/20261013090000_broker_go_live.sql','smc_brokers_guard'),
  fn('supabase/migrations/20261013200000_broker_change_requests.sql','broker_approved_items_guard'),
  fn('supabase/migrations/20261012180000_broker_self_service.sql','broker_update_profile'),
  'CREATE TABLE public.broker_activities (broker_id uuid,activity_type text,outcome text,body text);',
  fn('supabase/migrations/20261013160000_broker_bio_review_card_approval.sql','broker_decide_bio_suggestion'),
  'CREATE TRIGGER smc_brokers_guard BEFORE UPDATE ON public.brokers FOR EACH ROW EXECUTE FUNCTION public.smc_brokers_guard();',
  'CREATE TRIGGER broker_approved_items_guard BEFORE UPDATE OF bio_short,headshot_url ON public.brokers FOR EACH ROW EXECUTE FUNCTION public.broker_approved_items_guard();',
  file('supabase/migrations/20261014143717_broker_profile_guard_generated_columns.sql'),
  file('supabase/tests/broker-profile-security.test.sql')].join('\n');
try{
  // Local throwaway database; no passwords, accounts or terms for an external service.
  docker(['run','--detach','--name',container,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine']);
  let ready=false;
  for(let i=0;i<30;i++){
    const r=spawnSync('docker',['exec',container,'pg_isready','-U','postgres'],{encoding:'utf8'});
    if(r.status===0){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw Error('Scratch PostgreSQL did not start');
  console.log(docker(['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],{input:sql}));
}finally{spawnSync('docker',['rm','--force',container],{encoding:'utf8'});}
