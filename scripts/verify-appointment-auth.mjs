// Run the actual Edge Function entrypoint offline. Every database/network boundary is stubbed.
import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { mintLeadToken } from '../supabase/functions/_shared/smc_voice_lib.ts';
const calls=[];
const leadId='00000000-0000-4000-8000-000000000021';
const secret='synthetic-service-credential';
const leadSecret='synthetic-lead-token-secret-32-chars-only';
globalThis.Deno={env:{get:key=>({SUPABASE_URL:'http://localhost.invalid',SUPABASE_SERVICE_ROLE_KEY:secret,SUPABASE_ANON_KEY:'test-anon',SMC_LEAD_TOKEN_SECRET:leadSecret})[key]},serve:handler=>{globalThis.edgeHandler=handler;}};
globalThis.mockClient=(_url,_key,options)=>({
  rpc:async(name,args)=>{calls.push({name,args,auth:options?.global?.headers?.Authorization});
    if(name==='appointment_request_upsert')return {data:{ok:true,id:'synthetic-request'},error:null};
    return {data:null,error:{code:'42501',message:'admins only'}};
  },
  from:()=>{throw Error('Unexpected database read');}
});
const entry=new URL('../supabase/functions/appointment-allocation/index.ts',import.meta.url);
const source=fs.readFileSync(entry,'utf8')
  .replace(/import \{ createClient, type SupabaseClient \} from "https:\/\/esm.sh\/\@supabase\/supabase-js\@2";/,'const createClient=globalThis.mockClient; type SupabaseClient=any;')
  .replace(/from "(\.\.?\/[^\"]+)"/g,(_match,relative)=>'from "'+new URL(relative,entry).href+'"');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('External network forbidden in security tests');};
try{
  await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
  const send=(body,headers={},method='POST')=>globalThis.edgeHandler(new Request('http://localhost/allocation',{method,headers:{'content-type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})}));
  const forged=['header',Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),'forged'].join('.');
  for(const token of ['',forged,'synthetic-user-jwt','synthetic-service-credentiaL']){
    const before=calls.length;const r=await send({action:'request',lead_id:leadId},{authorization:`Bearer ${token}`});
    assert.equal(r.status,401);assert.equal(calls.length,before,'Denied token must cause no RPC writes');
  }
  assert.equal((await send({action:'request',lead_id:leadId},{authorization:`Bearer ${secret}`})).status,200);
  assert.equal(calls.at(-1).args.p_lead_id,leadId);
  assert.equal((await send({action:'request'},{authorization:`Bearer ${secret}`})).status,400);
  const leadToken=await mintLeadToken(leadId,leadSecret);
  assert.equal((await send({action:'request',lead_id:'different-lead'},{'x-lead-token':leadToken})).status,200);
  assert.equal(calls.at(-1).args.p_lead_id,leadId,'Signed token, not body, binds the lead');
  const before=calls.length;
  assert.equal((await send({action:'request',lead_id:leadId},{authorization:`Bearer ${secret}`,'x-lead-token':'invalid'})).status,401);
  assert.equal(calls.length,before,'Invalid lead token cannot fall back to service credentials');
  assert.equal((await send({action:'allocate',start:'2026-10-15T08:00:00Z'})).status,401);
  assert.equal((await send({action:'cancel'})).status,401);
  for(const action of ['allocate','cancel']){
    assert.equal((await send({action,start:'2026-10-15T08:00:00Z'},{authorization:'Bearer synthetic-broker-session'})).status,403);
    assert.equal(calls.at(-1).auth,'Bearer synthetic-broker-session','RPC must preserve caller identity and SQL role check');
  }
  assert.equal((await send({action:'allocate',start:'invalid'},{authorization:'Bearer synthetic-admin-session'})).status,400);
  assert.equal((await send({}, {},'OPTIONS')).status,200);
  assert.equal((await send({}, {},'GET')).status,405);
  console.log('PASS: actual appointment endpoint rejects forged/missing/user service authority without writes; configured service and signed lead-token requests work; allocate/cancel retain caller-bound SQL auth; no external sends.');
}finally{globalThis.fetch=originalFetch;}
