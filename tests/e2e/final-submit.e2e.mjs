// Final Submit for marks against a running server (needs a mysql client + the demo teacher). Run: BASE=http://127.0.0.1:4042 node tests/e2e/final-submit.e2e.mjs
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
const B='http://127.0.0.1:4042', J={'Content-Type':'application/json'};
let n=0; const ok=m=>console.log('  ok   '+(++n)+'. '+m);
const sqlx=q=>execSync(`mysql -uroot -S /tmp/mdb.sock erp -e "${q}"`).toString();
const call=async(m,p,b,ck)=>{const r=await fetch(B+p,{method:m,headers:{...J,...(ck?{cookie:ck}:{}),'x-forwarded-for':'7.7.7.'+(1+n%200)},body:b?JSON.stringify(b):undefined});const t=await r.text();let d;try{d=JSON.parse(t)}catch(e){d=t}return{s:r.status,d,ck:(r.headers.getSetCookie?.()||[]).map(c=>c.split(';')[0]).join('; ')}};
const login=async(u)=>call('POST','/api/login',{username:u,password:'Demo@123',audience:'staff'});
const ad=await login('demo.admin'), te=await login('demo.teacher'); assert.equal(ad.s,200); assert.equal(te.s,200);
const E='zz_exam_'+Date.now(), mk=(id,sid,sub,v)=>({id,examId:E,studentId:sid,subject:sub,marks:v,absent:false});
let r;
r=await call('POST','/api/exam-results',mk('r1','s1','MATHS',40),te.ck); assert.ok([200,201].includes(r.s),JSON.stringify(r)); ok('teacher enters a mark');
sqlx(`UPDATE exam_results SET created_at = created_at - INTERVAL 5 DAY WHERE id='r1'`);
r=await call('PUT','/api/exam-results',mk('r1','s1','MATHS',42),te.ck); assert.equal(r.s,200,JSON.stringify(r)); ok('5 days later (new mark, not submitted) the teacher can still change it - no 24h timer');
r=await call('POST','/api/exam-results',mk('r2','s2','MATHS',30),te.ck); assert.ok([200,201].includes(r.s)); ok('more marks can be added any time');
// legacy row (entered before the feature went live) keeps the old 24h rule
sqlx(`INSERT INTO exam_results (id,exam_id,student_id,subject,marks,absent,created_at) VALUES ('rl','${E}','s3','ENGLISH',50,0,NOW() - INTERVAL 40 DAY)`);
r=await call('PUT','/api/exam-results',mk('rl','s3','ENGLISH',55),te.ck); assert.equal(r.s,403); assert.equal(r.d.code,'RECORD_LOCKED'); ok('a mark saved before this feature (older than 24h) stays locked exactly as before');
// finalize
r=await call('POST','/api/marks-finalized',{examId:E,className:'8th Class',section:'A',subject:'SCIENCE'},te.ck); assert.equal(r.s,403); ok('teacher cannot Final Submit a subject they do not teach');
r=await call('POST','/api/marks-finalized',{examId:E,className:'8th Class',section:'A',subject:'MATHS',blanks:1},te.ck); assert.equal(r.s,201,JSON.stringify(r)); ok('teacher Final Submits MATHS');
r=await call('POST','/api/marks-finalized',{examId:E,className:'8th Class',section:'A',subject:'MATHS'},te.ck); assert.equal(r.s,200); assert.equal(r.d.already,true); ok('submitting twice is harmless');
r=await call('PUT','/api/exam-results',mk('r1','s1','MATHS',99),te.ck); assert.equal(r.s,403); assert.equal(r.d.code,'MARKS_FINALIZED'); assert.match(r.d.error,/Final Submitted/); ok('after Final Submit the entered mark cannot be changed');
r=await call('DELETE','/api/exam-results?id=r1',null,te.ck); assert.equal(r.s,403); ok('nor deleted');
r=await call('POST','/api/exam-results',mk('r3','s3','MATHS',20),te.ck); assert.ok([200,201].includes(r.s),JSON.stringify(r)); ok('a blank cell can still be filled after Final Submit (late/missed mark)');
r=await call('PUT','/api/exam-results',mk('r3','s3','MATHS',21),te.ck); assert.equal(r.s,403); ok('...and once filled, it is locked too');
sqlx(`INSERT INTO exam_results (id,exam_id,student_id,subject,marks,absent) VALUES ('re1','${E}','s1','ENGLISH',10,0)`);
r=await call('PUT','/api/exam-results',mk('re1','s1','ENGLISH',12),te.ck); assert.equal(r.s,200); ok('another subject (ENGLISH) is not affected');
r=await call('GET','/api/marks-finalized',null,te.ck); assert.ok(r.d.some(f=>f.subject==='MATHS'&&f.examId===E)); ok('the list shows MATHS as Final Submitted');
r=await call('DELETE',`/api/marks-finalized?examId=${E}&className=8th%20Class&section=A&subject=MATHS`,null,te.ck); assert.equal(r.s,403); ok('teacher cannot re-open');
r=await call('PUT','/api/exam-results',mk('r1','s1','MATHS',44),ad.ck); assert.equal(r.s,200); ok('Admin can still correct a Final Submitted mark');
r=await call('GET','/api/audit-log?q=r1&limit=10',null,ad.ck); assert.ok(r.d.rows.some(x=>x.method==='CORRECTION')); ok('and the correction is audited');
r=await call('DELETE',`/api/marks-finalized?examId=${E}&className=8th%20Class&section=A&subject=MATHS`,null,ad.ck); assert.equal(r.s,200); ok('Admin re-opens MATHS');
r=await call('PUT','/api/exam-results',mk('r1','s1','MATHS',45),te.ck); assert.equal(r.s,200); ok('teacher can edit again after re-open');
r=await call('POST','/api/marks-finalized',{examId:E,className:'8th Class',section:'A',subject:'MATHS'},te.ck); assert.equal(r.s,201);
r=await call('GET','/api/exam-results',null,te.ck); assert.equal(r.s,200); ok('teacher can still read the marks');
sqlx(`DELETE FROM exam_results WHERE exam_id='${E}'; DELETE FROM marks_finalized WHERE exam_id='${E}'`);
console.log(n+' checks passed');
