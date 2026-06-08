/* ============================================================
   FIREBASE CONFIG
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyDEtUkxWSO6P7xrAzFnDoIbjpC4eI0djBE",
  authDomain: "ja-run.firebaseapp.com",
  projectId: "ja-run",
  storageBucket: "ja-run.firebasestorage.app",
  messagingSenderId: "835459403423",
  appId: "1:835459403423:web:9db37f5eeb4bbced9cdcaa",
  measurementId: "G-6DNNJ1E0DH"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* ============================================================
   AUTH STATE
   ============================================================ */
let currentUser = null;

auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    setUserUI(user);
    loadAll();
  } else {
    currentUser = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
  }
});

/* ===== GOOGLE SIGN IN ===== */
document.getElementById('googleSignInBtn').addEventListener('click', async () => {
  const btn = document.getElementById('googleSignInBtn');
  btn.innerHTML = '<span class="spinner"></span> กำลังเข้าสู่ระบบ...';
  btn.disabled = true;
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (e) {
    alert('เข้าสู่ระบบไม่สำเร็จ: ' + e.message);
    btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" height="20" alt="Google"> เข้าสู่ระบบด้วย Google';
    btn.disabled = false;
  }
});

function setUserUI(user) {
  document.getElementById('userAvatar').src = user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'U') + '&background=ff5a1f&color=fff';
  document.getElementById('menuAvatar').src  = document.getElementById('userAvatar').src;
  document.getElementById('menuName').textContent  = user.displayName || 'ผู้ใช้';
  document.getElementById('menuEmail').textContent = user.email || '';
}

function toggleProfileMenu() {
  document.getElementById('profileMenu').classList.toggle('open');
  document.getElementById('profileOverlay').classList.toggle('open');
}

async function signOut() {
  await auth.signOut();
  toggleProfileMenu();
}

/* ============================================================
   FIRESTORE HELPERS
   ============================================================ */
function userDoc(path) {
  return db.collection('users').doc(currentUser.uid).collection(path);
}

async function fsSet(col, docId, data) {
  await db.collection('users').doc(currentUser.uid).collection(col).doc(docId).set(data, { merge: true });
}

async function fsGet(col, docId) {
  const snap = await db.collection('users').doc(currentUser.uid).collection(col).doc(docId).get();
  return snap.exists ? snap.data() : null;
}

/* ============================================================
   MAP
   ============================================================ */
const map = L.map('map').setView([13.5475, 100.2744], 14);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
let polyline   = L.polyline([], { color: '#ff5a1f', weight: 5 }).addTo(map);
let startMarker = null;

/* ============================================================
   RUN STATE
   ============================================================ */
let watchId = null, route = [], distance = 0, startTime = null, timerInterval = null;
let isRunning = false;
let currentGoalType = 'distance';
let planData  = { days: 3, dist: 5.0, pace: 6 };
let goalData  = { type: 'distance', value: 5 };
let bodyData  = { weight: 65, age: 30, gender: 'male' };

const distanceEl = document.getElementById('distance');
const durationEl = document.getElementById('duration');
const paceEl     = document.getElementById('pace');
const caloriesEl = document.getElementById('calories');
const speedEl    = document.getElementById('speed');
const stepsEl    = document.getElementById('steps');

/* ============================================================
   LOAD ALL USER DATA
   ============================================================ */
async function loadAll() {
  // Body
  const b = await fsGet('settings', 'body');
  if (b) {
    bodyData = b;
    document.getElementById('bodyWeight').textContent = b.weight;
    document.getElementById('bodyAge').textContent    = b.age;
    document.getElementById('bodyGender').value       = b.gender;
  }

  // Plan
  const p = await fsGet('settings', 'plan');
  if (p) {
    planData = p;
    document.getElementById('planDays').textContent = p.days;
    document.getElementById('planDist').textContent = p.dist.toFixed(1);
    document.getElementById('planPace').value       = p.pace;
  }

  // Goal
  const g = await fsGet('settings', 'goal');
  if (g) {
    goalData = g;
    selectGoalType(g.type, document.querySelector(`.goal-type-btn[data-type="${g.type}"]`), true);
    if (g.type === 'distance') document.getElementById('goalDistVal').textContent = g.value;
    if (g.type === 'time')     document.getElementById('goalTimeVal').textContent = g.value;
    if (g.type === 'calories') document.getElementById('goalCalVal').textContent  = g.value;
    updateHeaderGoal();
  }

  buildPrograms();
  buildWeeklySchedule();
  await loadHistory();
  await loadStats();
  await buildMilestones();
}

/* ============================================================
   TABS
   ============================================================ */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'stats') loadStats();
  });
});

/* ============================================================
   RUN CONTROLS
   ============================================================ */
document.getElementById('startBtn').addEventListener('click', startRun);
document.getElementById('stopBtn').addEventListener('click', stopRun);
document.getElementById('saveBtn').addEventListener('click', saveRun);

function startRun() {
  if (isRunning) return;
  isRunning = true;
  route = []; distance = 0;
  distanceEl.textContent = '0.00';
  caloriesEl.textContent = '0';
  speedEl.textContent    = '0.0';
  stepsEl.textContent    = '0';
  paceEl.textContent     = '--:--';
  polyline.setLatLngs([]);
  if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
  startTime = Date.now();
  timerInterval = setInterval(updateTimer, 1000);

  if (goalData && goalData.value) document.getElementById('goalProgressWrap').style.display = 'block';
  document.getElementById('gpsStatus').textContent = '📡 กำลังหา GPS...';

  watchId = navigator.geolocation.watchPosition(onGPS,
    () => { document.getElementById('gpsStatus').textContent = '⚠ GPS ไม่พร้อม'; },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

function onGPS(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const acc = pos.coords.accuracy;
  document.getElementById('gpsStatus').textContent = `📡 GPS ±${Math.round(acc)}m`;

  const pt = [lat, lng];
  route.push(pt);
  if (route.length === 1) {
    startMarker = L.circleMarker(pt, { radius: 8, color: '#ff5a1f', fillColor: '#fff', fillOpacity: 1, weight: 3 }).addTo(map);
  }
  map.setView(pt, 16);
  polyline.setLatLngs(route);

  if (route.length > 1) {
    distance += calcDist(route[route.length - 2], route[route.length - 1]);
    distanceEl.textContent = distance.toFixed(2);

    const spdKmh = (pos.coords.speed || 0) * 3.6;
    speedEl.textContent    = spdKmh.toFixed(1);
    caloriesEl.textContent = Math.round(calcCalories());
    stepsEl.textContent    = Math.round(distance * 1300).toLocaleString();
    updatePace();
    updateGoalProgress();
  }
}

function stopRun() {
  if (!isRunning) return;
  isRunning = false;
  navigator.geolocation.clearWatch(watchId);
  clearInterval(timerInterval);
  document.getElementById('gpsStatus').textContent = '⏹ หยุดแล้ว';
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  durationEl.textContent = `${String(Math.floor(elapsed / 60)).padStart(2,'0')}:${String(elapsed % 60).padStart(2,'0')}`;
  updateGoalProgress();
}

function updatePace() {
  const minutes = (Date.now() - startTime) / 60000;
  if (distance > 0) {
    const p  = minutes / distance;
    const pm = Math.floor(p);
    const ps = String(Math.round((p - pm) * 60)).padStart(2, '0');
    paceEl.textContent = `${pm}:${ps}`;
  }
}

function calcCalories() {
  const hrs = (Date.now() - startTime) / 3600000;
  return 8 * bodyData.weight * hrs;
}

function calcDist(a, b) {
  const R = 6371, dLat = (b[0]-a[0])*Math.PI/180, dLon = (b[1]-a[1])*Math.PI/180;
  const la1 = a[0]*Math.PI/180, la2 = b[0]*Math.PI/180;
  const x = Math.sin(dLat/2)**2 + Math.sin(dLon/2)**2 * Math.cos(la1) * Math.cos(la2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

/* ===== GOAL PROGRESS ===== */
function updateGoalProgress() {
  if (!goalData) return;
  let ratio = 0, detailStr = '';
  if (goalData.type === 'distance') {
    ratio = distance / goalData.value;
    detailStr = `${distance.toFixed(2)} / ${goalData.value} กม.`;
  } else if (goalData.type === 'time') {
    const elapsed = Math.floor((Date.now() - startTime) / 60000);
    ratio = elapsed / goalData.value;
    detailStr = `${elapsed} / ${goalData.value} นาที`;
  } else {
    const cal = Math.round(calcCalories());
    ratio = cal / goalData.value;
    detailStr = `${cal} / ${goalData.value} kcal`;
  }
  ratio = Math.min(ratio, 1);
  document.getElementById('goalProgressFill').style.width  = (ratio * 100) + '%';
  document.getElementById('goalProgressPct').textContent   = Math.round(ratio * 100) + '%';
  document.getElementById('goalProgressDetail').textContent = detailStr;
}

/* ============================================================
   SAVE RUN → FIRESTORE
   ============================================================ */
async function saveRun() {
  if (distance < 0.01) { alert('ยังไม่ได้วิ่งเลยนะ 😅'); return; }
  const cal = Math.round(calcCalories());
  const paceRaw = (Date.now() - startTime) / 60000 / distance;
  const pm = Math.floor(paceRaw);
  const ps = String(Math.round((paceRaw - pm) * 60)).padStart(2, '0');

  const run = {
    date:      new Date().toLocaleString('th-TH'),
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    distance:  parseFloat(distance.toFixed(2)),
    duration:  durationEl.textContent,
    pace:      `${pm}:${ps}`,
    calories:  cal,
    steps:     Math.round(distance * 1300),
    uid:       currentUser.uid,
    displayName: currentUser.displayName || '',
    photoURL:    currentUser.photoURL || ''
  };

  try {
    await userDoc('runs').add(run);
    await loadHistory();
    await loadStats();
    await buildMilestones();
    // update profile menu stats
    await updateMenuStats();
    alert('✅ บันทึกสำเร็จ!');
  } catch (e) {
    alert('บันทึกไม่สำเร็จ: ' + e.message);
  }
}

/* ============================================================
   LOAD HISTORY (run tab) — Firestore
   ============================================================ */
async function loadHistory() {
  try {
    const snap = await userDoc('runs').orderBy('timestamp', 'desc').limit(5).get();
    const container = document.getElementById('historyList');
    if (snap.empty) {
      container.innerHTML = '<p style="color:#6e7681;font-size:.82rem;text-align:center;padding:16px;">ยังไม่มีประวัติ เริ่มวิ่งเลย! 🏃</p>';
      return;
    }
    container.innerHTML = snap.docs.map(d => {
      const r = d.data();
      return `<div class="run-card">
        <div>
          <strong>${r.date}</strong>
          <p>📏 ${r.distance} กม. &nbsp;⏱ ${r.duration} &nbsp;⚡ ${r.pace}/กม.</p>
          <p>👣 ${(r.steps||0).toLocaleString()} ก้าว</p>
        </div>
        <div class="run-cals">🔥${r.calories||0}</div>
      </div>`;
    }).join('');
  } catch(e) { console.error(e); }
}

/* ============================================================
   STATS TAB — Firestore
   ============================================================ */
async function loadStats() {
  try {
    const snap = await userDoc('runs').orderBy('timestamp', 'desc').get();
    const runs = snap.docs.map(d => d.data());
    const n = runs.length;

    document.getElementById('totalRuns').textContent = n;
    if (!n) {
      ['totalDist','totalCals','avgPace','bestDist','bestPace'].forEach(id => {
        document.getElementById(id).textContent = id.includes('Pace') ? '--:--' : '0';
      });
      buildWeekChart([]);
      document.getElementById('fullHistory').innerHTML = '<p style="color:#6e7681;font-size:.82rem;text-align:center;padding:16px;">ยังไม่มีประวัติ</p>';
      return;
    }

    const totalDist = runs.reduce((a,r) => a + (r.distance||0), 0);
    const totalCals = runs.reduce((a,r) => a + (r.calories||0), 0);
    const bestDist  = Math.max(...runs.map(r => r.distance||0));
    const paces     = runs.map(r => paceToMin(r.pace)).filter(x => x > 0);
    const avgP      = paces.length ? paces.reduce((a,b) => a+b, 0)/paces.length : 0;
    const bestP     = paces.length ? Math.min(...paces) : 0;

    document.getElementById('totalDist').textContent = totalDist.toFixed(2);
    document.getElementById('totalCals').textContent = totalCals.toLocaleString();
    document.getElementById('avgPace').textContent   = minToDisplay(avgP);
    document.getElementById('bestDist').textContent  = bestDist.toFixed(2);
    document.getElementById('bestPace').textContent  = minToDisplay(bestP);

    buildWeekChart(runs);

    document.getElementById('fullHistory').innerHTML = runs.map(r => `
      <div class="hist-row">
        <div>
          <div class="hist-date">${r.date}</div>
          <div class="hist-meta">⏱ ${r.duration} &nbsp;⚡ ${r.pace}/กม. &nbsp;🔥 ${r.calories||0} kcal</div>
        </div>
        <div class="hist-dist">${r.distance} กม.</div>
      </div>`).join('');

    await updateMenuStats(totalDist, n, totalCals);
  } catch(e) { console.error(e); }
}

async function updateMenuStats(dist, runs, cals) {
  if (dist === undefined) {
    const snap = await userDoc('runs').get();
    const data = snap.docs.map(d => d.data());
    dist = data.reduce((a,r) => a+(r.distance||0), 0);
    runs = data.length;
    cals = data.reduce((a,r) => a+(r.calories||0), 0);
  }
  document.getElementById('menuTotalDist').textContent = dist.toFixed(1);
  document.getElementById('menuTotalRuns').textContent = runs;
  document.getElementById('menuTotalCals').textContent = Math.round(cals);
}

function paceToMin(s) {
  if (!s || s === '--:--') return 0;
  const parts = s.split(':');
  return parseInt(parts[0]) + (parseInt(parts[1]||0)/60);
}
function minToDisplay(m) {
  if (!m) return '--:--';
  const pm = Math.floor(m);
  const ps = String(Math.round((m-pm)*60)).padStart(2,'0');
  return `${pm}:${ps}`;
}

function buildWeekChart(runs) {
  const days = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const now = new Date();
  const buckets = Array(7).fill(0);
  runs.forEach(r => {
    if (!r.timestamp) return;
    const d = r.timestamp.toDate ? r.timestamp.toDate() : new Date(r.date);
    const diff = Math.floor((now - d) / 86400000);
    if (diff >= 0 && diff < 7) buckets[6 - diff] += (r.distance||0);
  });
  const max = Math.max(...buckets, 1);
  document.getElementById('weekChart').innerHTML = buckets.map((v,i) => {
    const dayIdx = (now.getDay() - 6 + i + 7) % 7;
    const h = Math.max(Math.round((v/max)*80), v>0?6:0);
    return `<div class="bar-wrap">
      <div class="bar-val">${v>0?v.toFixed(1):''}</div>
      <div class="bar" style="height:${h}px"></div>
      <div class="bar-label">${days[dayIdx]}</div>
    </div>`;
  }).join('');
}

/* ============================================================
   PLAN TAB
   ============================================================ */
const PROGRAMS = [
  { name:'มือใหม่',       icon:'🌱', desc:'3 วัน/สัปดาห์ 3-5 กม.',   days:3, dist:3,  pace:7 },
  { name:'พัฒนาฟอร์ม',   icon:'📈', desc:'4 วัน/สัปดาห์ 5-8 กม.',   days:4, dist:5,  pace:6 },
  { name:'Half Marathon', icon:'🏅', desc:'5 วัน/สัปดาห์ 8-15 กม.',  days:5, dist:10, pace:5 },
  { name:'Full Marathon', icon:'🏆', desc:'6 วัน/สัปดาห์ 15+ กม.',   days:6, dist:15, pace:4 },
];

function buildPrograms() {
  document.getElementById('programGrid').innerHTML = PROGRAMS.map((p,i) => `
    <div class="prog-item" onclick="selectProgram(${i},this)">
      <span class="prog-name">${p.icon} ${p.name}</span>
      <span class="prog-desc">${p.desc}</span>
    </div>`).join('');
}

function selectProgram(i, el) {
  document.querySelectorAll('.prog-item').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
  const p = PROGRAMS[i];
  planData = { days:p.days, dist:p.dist, pace:p.pace };
  document.getElementById('planDays').textContent = p.days;
  document.getElementById('planDist').textContent = p.dist.toFixed(1);
  document.getElementById('planPace').value = p.pace;
  buildWeeklySchedule();
}

function changePlanVal(key, delta) {
  if (key === 'days') {
    planData.days = Math.min(7, Math.max(1, planData.days + delta));
    document.getElementById('planDays').textContent = planData.days;
  } else {
    planData.dist = Math.max(1, Math.round((planData.dist + delta) * 10) / 10);
    document.getElementById('planDist').textContent = planData.dist.toFixed(1);
  }
  buildWeeklySchedule();
}

async function savePlan() {
  planData.pace = parseInt(document.getElementById('planPace').value);
  await fsSet('settings', 'plan', planData);
  buildWeeklySchedule();
  alert('✅ บันทึกแผนแล้ว!');
}

function buildWeeklySchedule() {
  const DAYNAMES = ['วันอาทิตย์','วันจันทร์','วันอังคาร','วันพุธ','วันพฤหัสฯ','วันศุกร์','วันเสาร์'];
  const today = new Date().getDay();
  const runDays = [];
  const step = 7 / planData.days;
  for (let i = 0; i < planData.days; i++) runDays.push(Math.round(i * step) % 7);
  document.getElementById('weeklySchedule').innerHTML = Array(7).fill(0).map((_,i) => {
    const isRun   = runDays.includes(i);
    const isToday = i === today;
    return `<div class="week-row" style="${isToday?'background:#1f1208;border-radius:10px;padding:8px 10px;':''}">
      <span class="week-day">${DAYNAMES[i].slice(3,6)}</span>
      <span class="week-task">${isRun?`วิ่ง ${planData.dist} กม. (pace ${planData.pace}:00/กม.)`:'พัก / ยืดเส้น'}</span>
      <span class="week-badge ${isRun?'badge-run':'badge-rest'}">${isRun?'วิ่ง':'พัก'}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   GOAL TAB
   ============================================================ */
function selectGoalType(type, el, silent=false) {
  currentGoalType = type;
  document.querySelectorAll('.goal-type-btn').forEach(b => b && b.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('goalDistanceInput').style.display = type==='distance'?'block':'none';
  document.getElementById('goalTimeInput').style.display     = type==='time'?'block':'none';
  document.getElementById('goalCalInput').style.display      = type==='calories'?'block':'none';
}

function changeGoal(delta) {
  const ids = { distance:'goalDistVal', time:'goalTimeVal', calories:'goalCalVal' };
  const el = document.getElementById(ids[currentGoalType]);
  el.textContent = Math.max(1, parseInt(el.textContent) + delta);
}

async function saveGoal() {
  let value;
  if (currentGoalType === 'distance') value = parseInt(document.getElementById('goalDistVal').textContent);
  else if (currentGoalType === 'time') value = parseInt(document.getElementById('goalTimeVal').textContent);
  else value = parseInt(document.getElementById('goalCalVal').textContent);
  goalData = { type: currentGoalType, value };
  await fsSet('settings', 'goal', goalData);
  updateHeaderGoal();
  await buildMilestones();
  alert('✅ ตั้งโกลแล้ว!');
}

function updateHeaderGoal() {
  if (!goalData) return;
  const labels = { distance:`🎯 ${goalData.value} กม.`, time:`🎯 ${goalData.value} นาที`, calories:`🎯 ${goalData.value} kcal` };
  document.getElementById('headerGoalText').textContent = labels[goalData.type] || 'ตั้งโกลก่อนวิ่ง';
}

/* ============================================================
   BODY DATA — Firestore
   ============================================================ */
function changeBody(key, delta) {
  if (key === 'weight') {
    bodyData.weight = Math.max(30, Math.min(200, bodyData.weight + delta));
    document.getElementById('bodyWeight').textContent = bodyData.weight;
  } else {
    bodyData.age = Math.max(10, Math.min(99, bodyData.age + delta));
    document.getElementById('bodyAge').textContent = bodyData.age;
  }
}

async function saveBody() {
  bodyData.gender = document.getElementById('bodyGender').value;
  await fsSet('settings', 'body', bodyData);
  alert('✅ บันทึกข้อมูลแล้ว!');
}

/* ============================================================
   MILESTONES — Firestore aggregate
   ============================================================ */
const MILESTONES = [
  { km:1,   icon:'🎽', title:'วิ่งครั้งแรก',    desc:'เริ่มต้นการเดินทาง' },
  { km:10,  icon:'🥉', title:'10 กม.',           desc:'สะสมได้ 10 กม.' },
  { km:21,  icon:'🥈', title:'Half Marathon',    desc:'สะสมได้ 21 กม.' },
  { km:42,  icon:'🥇', title:'Full Marathon',    desc:'สะสมได้ 42 กม.' },
  { km:100, icon:'🏆', title:'100 กม.',          desc:'นักวิ่งตัวจริง' },
  { km:200, icon:'🌟', title:'200 กม.',          desc:'ระดับสุดยอด' },
];

async function buildMilestones() {
  const snap = await userDoc('runs').get();
  const totalDist = snap.docs.reduce((a,d) => a + (d.data().distance||0), 0);
  document.getElementById('goalMilestones').innerHTML = MILESTONES.map(m => {
    const done = totalDist >= m.km;
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
