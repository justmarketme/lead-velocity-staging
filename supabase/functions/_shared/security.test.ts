// Offline only: fabricated records, fake credentials, stub email sender. No external I/O.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configuredServiceCredential } from './service_credential.ts';
import { messageNotificationHandler, type NotificationDependencies } from './message_notification.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const USER = 'synthetic-admin';
const payload = { leadId: ID, message: 'Synthetic saved message', senderRole: 'admin',
  leadName: 'Forged name', recipientEmail: 'untrusted@example.invalid', recipientName: 'Forged recipient' };
const req = (token: string | null = 'test-admin', body: unknown = payload, method = 'POST') => new Request('http://localhost/notification', {
  method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});
function fixture(overrides: Partial<NotificationDependencies> = {}) {
  const sends: unknown[] = [];
  const calls: string[] = [];
  const deps: NotificationDependencies = {
    async verifyUser(token) { calls.push('auth'); return token === 'test-admin' ? USER : null; },
    async isAdmin() { calls.push('role'); return true; },
    async lead() { calls.push('lead'); return { id: ID, broker_id: 'synthetic-broker', first_name: 'Synthetic', last_name: 'Lead', is_synthetic: true }; },
    async broker() { calls.push('broker'); return { email: 'broker@example.invalid', contact_person: 'Synthetic Broker', firm_name: 'Synthetic Practice' }; },
    async message() { calls.push('message'); return { message: payload.message, sender_role: 'admin', user_id: USER }; },
    async send(to, values) { sends.push({ to, values }); return { id: 'stub-email' }; },
    ...overrides,
  };
  return { handler: messageNotificationHandler(deps), sends, calls };
}
test('only possession of the configured service credential grants service access', () => {
  const expected = 'synthetic-service-credential';
  const forged = ['header', Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'), 'forged'].join('.');
  for (const token of ['', forged, 'test-user-token', 'synthetic-service-credentiaL']) assert.equal(configuredServiceCredential(token, expected), false);
  assert.equal(configuredServiceCredential(expected, expected), true);
  assert.equal(configuredServiceCredential('', ''), false);
  assert.equal(configuredServiceCredential(expected, ''), false);
});
test('CORS preflight works without authentication or database access', async () => {
  const f=fixture();const response=await f.handler(req(null,null,'OPTIONS'));
  assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');assert.deepEqual(f.calls,[]);
});
test('missing and invalid sessions are rejected before lead reads or sends', async () => {
  for (const token of [null,'forged-user']) { const f=fixture();assert.equal((await f.handler(req(token))).status,401);assert(!f.calls.includes('lead'));assert.equal(f.sends.length,0); }
});
test('raw token without Bearer is rejected', async () => {
  const f=fixture();const r=new Request('http://localhost',{method:'POST',headers:{authorization:'test-admin'},body:JSON.stringify(payload)});
  assert.equal((await f.handler(r)).status,401);assert.deepEqual(f.calls,[]);
});
test('broker and other signed-in non-admin users cannot send notifications', async () => {
  const f=fixture({isAdmin:async()=>false});assert.equal((await f.handler(req())).status,403);assert(!f.calls.includes('lead'));assert.equal(f.sends.length,0);
});
test('unsupported methods and malformed payloads fail without sending', async () => {
  const f=fixture();assert.equal((await f.handler(req(null,null,'GET'))).status,405);
  for (const body of [null,[],{}, {...payload,leadId:'bad'}, {...payload,message:''}, {...payload,senderRole:'broker'}]) assert.equal((await f.handler(req('test-admin',body))).status,400);
  const invalid=new Request('http://localhost',{method:'POST',headers:{authorization:'Bearer test-admin'},body:'{'});
  assert.equal((await f.handler(invalid)).status,400);assert.equal(f.sends.length,0);
});
test('unknown lead and unsaved/spoofed messages fail closed', async () => {
  assert.equal((await fixture({lead:async()=>null}).handler(req())).status,404);
  for (const stored of [null,{message:payload.message,sender_role:'broker',user_id:USER},{message:payload.message,sender_role:'admin',user_id:'another-admin'}]) {
    const f=fixture({message:async()=>stored});assert.equal((await f.handler(req())).status,403);assert.equal(f.sends.length,0);
  }
});
test('synthetic lead notifications are a dry run, never an email', async () => {
  const f=fixture();const response=await f.handler(req());assert.equal(response.status,200);assert.equal((await response.json()).dry_run,true);assert.equal(f.sends.length,0);
});
test('missing broker, invalid email and unassigned leads skip sending safely', async () => {
  const f=fixture({broker:async()=>null});assert.equal((await f.handler(req())).status,200);assert.equal(f.sends.length,0);
  const invalid=fixture({broker:async()=>({email:'invalid',contact_person:null,firm_name:null})});assert.equal((await invalid.handler(req())).status,200);assert.equal(invalid.sends.length,0);
  const unassigned=fixture({lead:async()=>({id:ID,broker_id:null,first_name:'Synthetic',last_name:null,is_synthetic:true})});assert.equal((await unassigned.handler(req())).status,200);assert(!unassigned.calls.includes('broker'));
});
test('stored recipient and message win over client-supplied values (stub sender only)', async () => {
  // Fabricated in-memory record toggles only the delivery flag to cover the send branch; it is never stored in a DB.
  const f=fixture({lead:async()=>({id:ID,broker_id:'synthetic-broker',first_name:'Synthetic',last_name:'Lead',is_synthetic:false})});
  assert.equal((await f.handler(req())).status,200);
  assert.deepEqual(f.sends,[{to:'broker@example.invalid',values:{leadName:'Synthetic Lead',message:payload.message,senderRole:'admin',recipientName:'Synthetic Broker'}}]);
});
test('role lookup/database/provider failures do not expose details', async () => {
  const f=fixture({isAdmin:async()=>{throw new Error('sensitive detail');}});const response=await f.handler(req());assert.equal(response.status,500);assert(!(await response.text()).includes('sensitive'));assert.equal(f.sends.length,0);
});
