/* ===== MAP ===== */
const map = L.map('map').setView([13.5475, 100.2744], 14);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(map);

let polyline = L.polyline([],{color:'#ff5a1f',weight:5}).addTo(map);
let startMarker = null;

/* ===== STATE ===== */
let watchId=null, route=[], distance=0, startTime=null, timerInterval=null;
let isRunning=false;
let currentGoalType='distance';
let planData={days:3,dist:5.0,pace:6};
let goalData={type:'distance',value:5};
let bodyData={weight:65,age:30,gender:'male'};

/* ===== ELS ===== */
const distanceEl=document.getElementById('distance');
const durationEl=document.getElementById('duration');
const paceEl=document.getElementById('pace');
const caloriesEl=document.getElementById('calories');
const speedEl=document.getElementById('speed');
const stepsEl=document.getElementById('steps');

/* ===== LOAD SAVED DATA ===== */
function loadAll(){
  const b=JSON.parse(localStorage.getItem('jarun_body')||'null');
  if(b){bodyData=b;document.getElementById('bodyWeight').textContent=b.weight;document.getElementById('bodyAge').textContent=b.age;document.getElementById('bodyGender').value=b.gender;}

  const p=JSON.parse(localStorage.getItem('jarun_plan')||'null');
  if(p){planData=p;document.getElementById('planDays').textContent=p.days;document.getElementById('planDist').textContent=p.dist.toFixed(1);document.getElementById('planPace').value=p.pace;}

  const g=JSON.parse(localStorage.getItem('jarun_goal')||'null');
  if(g){
    goalData=g;
    selectGoalType(g.type,document.querySelector(`.goal-type-btn[data-type="${g.type}"]`),true);
    if(g.type==='distance')document.getElementById('goalDistVal').textContent=g.value;
    if(g.type==='time')document.getElementById('goalTimeVal').textContent=g.value;
    if(g.type==='calories')document.getElementById('goalCalVal').textContent=g.value;
    updateHeaderGoal();
  }

  buildPrograms();
  buildWeeklySchedule();
  loadHistory();
  loadStats();
  buildMilestones();
}

/* ===== TABS ===== */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab==='stats'){loadStats();}
  });
});

/* ===== RUN ===== */
document.getElementById('startBtn').addEventListener('click',startRun);
document.getElementById('stopBtn').addEventListener('click',stopRun);
document.getElementById('saveBtn').addEventListener('click',saveRun);

function startRun(){
  if(isRunning)return;
  isRunning=true;
  route=[]; distance=0;
  distanceEl.textContent='0.00';
  caloriesEl.textContent='0';
  speedEl.textContent='0.0';
  stepsEl.textContent='0';
  paceEl.textContent='--:--';
  polyline.setLatLngs([]);
  if(startMarker){map.removeLayer(startMarker);startMarker=null;}
  startTime=Date.now();
  timerInterval=setInterval(updateTimer,1000);

  const progressWrap=document.getElementById('goalProgressWrap');
  if(goalData&&goalData.value){progressWrap.style.display='block';}

  document.getElementById('gpsStatus').textContent='📡 กำลังหา GPS...';

  watchId=navigator.geolocation.watchPosition(
    onGPS,
    ()=>{document.getElementById('gpsStatus').textContent='⚠ GPS ไม่พร้อม';},
    {enableHighAccuracy:true,timeout:15000}
  );
}

function onGPS(pos){
  const lat=pos.coords.latitude;
  const lng=pos.coords.longitude;
  const acc=pos.coords.accuracy;
  document.getElementById('gpsStatus').textContent=`📡 GPS ±${Math.round(acc)}m`;

  const pt=[lat,lng];
  route.push(pt);

  if(route.length===1){
    startMarker=L.circleMarker(pt,{radius:8,color:'#ff5a1f',fillColor:'#fff',fillOpacity:1,weight:3}).addTo(map);
  }
  map.setView(pt,16);
  polyline.setLatLngs(route);

  if(route.length>1){
    const d=calcDist(route[route.length-2],route[route.length-1]);
    distance+=d;
    distanceEl.textContent=distance.toFixed(2);

    const spdMs=pos.coords.speed||0;
    const spdKmh=spdMs*3.6;
    speedEl.textContent=spdKmh.toFixed(1);

    const cal=calcCalories(distance);
    caloriesEl.textContent=Math.round(cal);

    const stepEst=Math.round(distance*1300);
    stepsEl.textContent=stepEst.toLocaleString();

    updatePace();
    updateGoalProgress();
  }
}

function stopRun(){
  if(!isRunning)return;
  isRunning=false;
  navigator.geolocation.clearWatch(watchId);
  clearInterval(timerInterval);
  document.getElementById('gpsStatus').textContent='⏹ หยุดแล้ว';
}

function updateTimer(){
  const elapsed=Math.floor((Date.now()-startTime)/1000);
  const min=String(Math.floor(elapsed/60)).padStart(2,'0');
  const sec=String(elapsed%60).padStart(2,'0');
  durationEl.textContent=`${min}:${sec}`;
  updateGoalProgress();
}

function updatePace(){
  const minutes=(Date.now()-startTime)/60000;
  if(distance>0){
    const p=minutes/distance;
    const pm=Math.floor(p);
    const ps=String(Math.round((p-pm)*60)).padStart(2,'0');
    paceEl.textContent=`${pm}:${ps}`;
  }
}

function calcCalories(km){
  // MET ~8 for running, formula: MET * weight(kg) * time(hr)
  const hrs=(Date.now()-startTime)/3600000;
  return 8*bodyData.weight*hrs;
}

function calcDist(a,b){
  const R=6371;
  const dLat=(b[0]-a[0])*Math.PI/180;
  const dLon=(b[1]-a[1])*Math.PI/180;
  const la1=a[0]*Math.PI/180, la2=b[0]*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.sin(dLon/2)**2*Math.cos(la1)*Math.cos(la2);
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

/* ===== GOAL PROGRESS ===== */
function updateGoalProgress(){
  if(!goalData)return;
  const fill=document.getElementById('goalProgressFill');
  const pct=document.getElementById('goalProgressPct');
  const detail=document.getElementById('goalProgressDetail');
  let ratio=0,detailStr='';

  if(goalData.type==='distance'){
    ratio=distance/goalData.value;
    detailStr=`${distance.toFixed(2)} / ${goalData.value} กม.`;
  } else if(goalData.type==='time'){
    const elapsed=Math.floor((Date.now()-startTime)/60000);
    ratio=elapsed/goalData.value;
    detailStr=`${elapsed} / ${goalData.value} นาที`;
  } else if(goalData.type==='calories'){
    const cal=Math.round(calcCalories(distance));
    ratio=cal/goalData.value;
    detailStr=`${cal} / ${goalData.value} kcal`;
  }

  ratio=Math.min(ratio,1);
  fill.style.width=(ratio*100)+'%';
  pct.textContent=Math.round(ratio*100)+'%';
  detail.textContent=detailStr;
}

/* ===== SAVE RUN ===== */
function saveRun(){
  if(distance<0.01){alert('ยังไม่ได้วิ่งเลยนะ 😅');return;}
  const cal=Math.round(calcCalories(distance));
  const paceRaw=(Date.now()-startTime)/60000/distance;
  const pm=Math.floor(paceRaw);
  const ps=String(Math.round((paceRaw-pm)*60)).padStart(2,'0');

  const run={
    date:new Date().toLocaleString('th-TH'),
    distance:distance.toFixed(2),
    duration:durationEl.textContent,
    pace:`${pm}:${ps}`,
    calories:cal,
    steps:Math.round(distance*1300)
  };

  let runs=JSON.parse(localStorage.getItem('jarun')||'[]');
  runs.unshift(run);
  localStorage.setItem('jarun',JSON.stringify(runs));
  loadHistory();
  loadStats();
  buildMilestones();
  alert('✅ บันทึกสำเร็จ!');
}

/* ===== HISTORY (run tab) ===== */
function loadHistory(){
  const runs=JSON.parse(localStorage.getItem('jarun')||'[]');
  const container=document.getElementById('historyList');
  if(!runs.length){container.innerHTML='<p style="color:#6e7681;font-size:.82rem;text-align:center;padding:16px;">ยังไม่มีประวัติ เริ่มวิ่งเลย! 🏃</p>';return;}
  container.innerHTML=runs.slice(0,5).map(r=>`
    <div class="run-card">
      <div>
        <strong>${r.date}</strong>
        <p>📏 ${r.distance} กม. &nbsp;⏱ ${r.duration} &nbsp;⚡ ${r.pace}/กม.</p>
        <p>👣 ${Number(r.steps||0).toLocaleString()} ก้าว</p>
      </div>
      <div class="run-cals">🔥${r.calories||0}</div>
    </div>
  `).join('');
}

/* ===== STATS TAB ===== */
function loadStats(){
  const runs=JSON.parse(localStorage.getItem('jarun')||'[]');
  const n=runs.length;
  document.getElementById('totalRuns').textContent=n;
  if(!n){
    document.getElementById('totalDist').textContent='0.00';
    document.getElementById('totalCals').textContent='0';
    document.getElementById('avgPace').textContent='--:--';
    document.getElementById('bestDist').textContent='0.00';
    document.getElementById('bestPace').textContent='--:--';
    buildWeekChart([]);
    document.getElementById('fullHistory').innerHTML='<p style="color:#6e7681;font-size:.82rem;text-align:center;padding:16px;">ยังไม่มีประวัติ</p>';
    return;
  }
  const totalDist=runs.reduce((a,r)=>a+parseFloat(r.distance),0);
  const totalCals=runs.reduce((a,r)=>a+(r.calories||0),0);
  const bestDist=Math.max(...runs.map(r=>parseFloat(r.distance)));

  // avg pace
  const paces=runs.map(r=>paceToMin(r.pace)).filter(x=>x>0);
  const avgPaceMin=paces.length?paces.reduce((a,b)=>a+b,0)/paces.length:0;
  const bestPaceMin=paces.length?Math.min(...paces):0;

  document.getElementById('totalDist').textContent=totalDist.toFixed(2);
  document.getElementById('totalCals').textContent=totalCals.toLocaleString();
  document.getElementById('avgPace').textContent=minToDisplay(avgPaceMin);
  document.getElementById('bestDist').textContent=bestDist.toFixed(2);
  document.getElementById('bestPace').textContent=minToDisplay(bestPaceMin);

  buildWeekChart(runs);

  const fh=document.getElementById('fullHistory');
  fh.innerHTML=runs.map(r=>`
    <div class="hist-row">
      <div>
        <div class="hist-date">${r.date}</div>
        <div class="hist-meta">⏱ ${r.duration} &nbsp;⚡ ${r.pace}/กม. &nbsp;🔥 ${r.calories||0} kcal</div>
      </div>
      <div class="hist-dist">${r.distance} กม.</div>
    </div>
  `).join('');
}

function paceToMin(s){
  if(!s||s==='--:--')return 0;
  const parts=s.split(':');
  return parseInt(parts[0])+(parseInt(parts[1]||0)/60);
}
function minToDisplay(m){
  if(!m)return '--:--';
  const pm=Math.floor(m);
  const ps=String(Math.round((m-pm)*60)).padStart(2,'0');
  return `${pm}:${ps}`;
}

function buildWeekChart(runs){
  const days=['อา','จ','อ','พ','พฤ','ศ','ส'];
  const now=new Date();
  const buckets=Array(7).fill(0);
  runs.forEach(r=>{
    const d=new Date(r.date);
    const diff=Math.floor((now-d)/86400000);
    if(diff>=0&&diff<7) buckets[6-diff]+=parseFloat(r.distance);
  });
  const max=Math.max(...buckets,1);
  const chart=document.getElementById('weekChart');
  chart.innerHTML=buckets.map((v,i)=>{
    const dayIdx=(now.getDay()-6+i+7)%7;
    const h=Math.max(Math.round((v/max)*80),v>0?6:0);
    return `<div class="bar-wrap">
      <div class="bar-val">${v>0?v.toFixed(1):''}</div>
      <div class="bar" style="height:${h}px"></div>
      <div class="bar-label">${days[dayIdx]}</div>
    </div>`;
  }).join('');
}

/* ===== PLAN TAB ===== */
const PROGRAMS=[
  {name:'มือใหม่',icon:'🌱',desc:'3 วัน/สัปดาห์ 3-5 กม.',days:3,dist:3,pace:7},
  {name:'พัฒนาฟอร์ม',icon:'📈',desc:'4 วัน/สัปดาห์ 5-8 กม.',days:4,dist:5,pace:6},
  {name:'Half Marathon',icon:'🏅',desc:'5 วัน/สัปดาห์ 8-15 กม.',days:5,dist:10,pace:5},
  {name:'Full Marathon',icon:'🏆',desc:'6 วัน/สัปดาห์ 15+ กม.',days:6,dist:15,pace:4},
];

function buildPrograms(){
  const grid=document.getElementById('programGrid');
  grid.innerHTML=PROGRAMS.map((p,i)=>`
    <div class="prog-item" onclick="selectProgram(${i},this)">
      <span class="prog-name">${p.icon} ${p.name}</span>
      <span class="prog-desc">${p.desc}</span>
    </div>
  `).join('');
}

function selectProgram(i,el){
  document.querySelectorAll('.prog-item').forEach(x=>x.classList.remove('selected'));
  el.classList.add('selected');
  const p=PROGRAMS[i];
  planData={days:p.days,dist:p.dist,pace:p.pace};
  document.getElementById('planDays').textContent=p.days;
  document.getElementById('planDist').textContent=p.dist.toFixed(1);
  document.getElementById('planPace').value=p.pace;
}

function changePlanVal(key,delta){
  if(key==='days'){
    planData.days=Math.min(7,Math.max(1,planData.days+delta));
    document.getElementById('planDays').textContent=planData.days;
  } else {
    planData.dist=Math.max(1,Math.round((planData.dist+delta)*10)/10);
    document.getElementById('planDist').textContent=planData.dist.toFixed(1);
  }
  buildWeeklySchedule();
}

function savePlan(){
  planData.pace=parseInt(document.getElementById('planPace').value);
  localStorage.setItem('jarun_plan',JSON.stringify(planData));
  buildWeeklySchedule();
  alert('✅ บันทึกแผนแล้ว!');
}

function buildWeeklySchedule(){
  const DAYNAMES=['วันอาทิตย์','วันจันทร์','วันอังคาร','วันพุธ','วันพฤหัสฯ','วันศุกร์','วันเสาร์'];
  const today=new Date().getDay();
  // Distribute run days evenly
  const runDays=[];
  const step=7/planData.days;
  for(let i=0;i<planData.days;i++) runDays.push(Math.round(i*step)%7);

  const rows=Array(7).fill(0).map((_,i)=>{
    const isRun=runDays.includes(i);
    const isToday=i===today;
    return `<div class="week-row" style="${isToday?'background:#1f1208;border-radius:10px;padding:8px 10px;':''}">
      <span class="week-day">${DAYNAMES[i].slice(3,6)}</span>
      <span class="week-task">${isRun?`วิ่ง ${planData.dist} กม. (pace ${planData.pace}:00/กม.)`:'พัก / ยืดเส้น'}</span>
      <span class="week-badge ${isRun?'badge-run':'badge-rest'}">${isRun?'วิ่ง':'พัก'}</span>
    </div>`;
  }).join('');
  document.getElementById('weeklySchedule').innerHTML=rows;
}

/* ===== GOAL TAB ===== */
function selectGoalType(type, el, silent=false){
  currentGoalType=type;
  document.querySelectorAll('.goal-type-btn').forEach(b=>b&&b.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('goalDistanceInput').style.display=type==='distance'?'block':'none';
  document.getElementById('goalTimeInput').style.display=type==='time'?'block':'none';
  document.getElementById('goalCalInput').style.display=type==='calories'?'block':'none';
}

function changeGoal(delta){
  if(currentGoalType==='distance'){
    const el=document.getElementById('goalDistVal');
    el.textContent=Math.max(1,parseInt(el.textContent)+delta);
  } else if(currentGoalType==='time'){
    const el=document.getElementById('goalTimeVal');
    el.textContent=Math.max(5,parseInt(el.textContent)+delta);
  } else {
    const el=document.getElementById('goalCalVal');
    el.textContent=Math.max(50,parseInt(el.textContent)+delta);
  }
}

function saveGoal(){
  let value;
  if(currentGoalType==='distance') value=parseInt(document.getElementById('goalDistVal').textContent);
  else if(currentGoalType==='time') value=parseInt(document.getElementById('goalTimeVal').textContent);
  else value=parseInt(document.getElementById('goalCalVal').textContent);
  goalData={type:currentGoalType,value};
  localStorage.setItem('jarun_goal',JSON.stringify(goalData));
  updateHeaderGoal();
  buildMilestones();
  alert('✅ ตั้งโกลแล้ว!');
}

function updateHeaderGoal(){
  const badge=document.getElementById('headerGoalText');
  if(!goalData)return;
  const labels={distance:`🎯 ${goalData.value} กม.`,time:`🎯 ${goalData.value} นาที`,calories:`🎯 ${goalData.value} kcal`};
  badge.textContent=labels[goalData.type]||'ตั้งโกลก่อนวิ่ง';
}

/* ===== BODY DATA ===== */
function changeBody(key,delta){
  if(key==='weight'){
    bodyData.weight=Math.max(30,Math.min(200,bodyData.weight+delta));
    document.getElementById('bodyWeight').textContent=bodyData.weight;
  } else {
    bodyData.age=Math.max(10,Math.min(99,bodyData.age+delta));
    document.getElementById('bodyAge').textContent=bodyData.age;
  }
}
function saveBody(){
  bodyData.gender=document.getElementById('bodyGender').value;
  localStorage.setItem('jarun_body',JSON.stringify(bodyData));
  alert('✅ บันทึกข้อมูลแล้ว!');
}

/* ===== MILESTONES ===== */
const MILESTONES=[
  {km:1,icon:'🎽',title:'วิ่งครั้งแรก',desc:'เริ่มต้นการเดินทาง'},
  {km:10,icon:'🥉',title:'10 กม.',desc:'สะสมได้ 10 กม.'},
  {km:21,icon:'🥈',title:'Half Marathon',desc:'สะสมได้ 21 กม.'},
  {km:42,icon:'🥇',title:'Full Marathon',desc:'สะสมได้ 42 กม.'},
  {km:100,icon:'🏆',title:'100 กม.',desc:'นักวิ่งตัวจริง'},
  {km:200,icon:'🌟',title:'200 กม.',desc:'ระดับสุดยอด'},
];

function buildMilestones(){
  const runs=JSON.parse(localStorage.getItem('jarun')||'[]');
  const totalDist=runs.reduce((a,r)=>a+parseFloat(r.distance),0);
  const container=document.getElementById('goalMilestones');
  container.innerHTML=MILESTONES.map(m=>{
    const done=totalDist>=m.km;
    return `<div class="milestone">
      <div class="ms-icon">${m.icon}</div>
      <div class="ms-info">
        <div class="ms-title">${m.title}</div>
        <div class="ms-desc">${m.desc} · ${m.km} กม.</div>
      </div>
      <span class="ms-badge ${done?'ms-done':'ms-todo'}">${done?'✓ สำเร็จ':'ยังไม่ถึง'}</span>
    </div>`;
  }).join('');
}

/* ===== INIT ===== */
loadAll();
