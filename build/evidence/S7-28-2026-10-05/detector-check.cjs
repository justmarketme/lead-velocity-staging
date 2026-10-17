const w=require('C:/Users/Jono/lead-velocity-sortmycover/automation/W34.json');
const code=w.nodes.find(n=>n.name.startsWith('Detect breach')).parameters.jsCode;
const run=(mails)=>new Function('$input','$env','require',code)({all:()=>mails.map(json=>({json}))},{},require);
const cases=[
 ['broker misroute EN','Wrong lead','Hi, I received a lead this morning that is not mine. The client details were sent to me by mistake. Please check.'],
 ['broker misroute EN 2','Lead sent to the wrong broker','You sent me someone else\'s client. Her name and number came through to me.'],
 ['consumer wrong person','Who is this?','A stranger WhatsApped me saying your company gave him my number and my details. I never agreed to that.'],
 ['consumer consent','Spam','Without my consent you shared my number with an adviser.'],
 ['AF misroute','Verkeerde lead','Ek het n lead gekry wat nie myne is nie. Die kliënt se besonderhede is per ongeluk aan my gestuur.'],
 ['drill1 gist','Your data is public','I found your lead export on a public GitHub gist, names and numbers are exposed.'],
 ['DSR (must not match)','Delete my details','Please delete my details, what data do you hold about me?'],
];
for(const [label,subject,body] of cases){const r=run([{id:label,subject,bodyPreview:body,from:{emailAddress:{address:'x@example.invalid'}},receivedDateTime:'2026-10-05T08:00:00Z'}]);console.log((r.length?'MATCH ':'miss  ')+label+(r.length?' '+r[0].json.matched.join(','):''));}
