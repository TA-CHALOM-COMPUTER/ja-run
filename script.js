/* ============================================================
   FIREBASE CONFIG — คงไว้เหมือนเดิม
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
   STATE
   ============================================================ */
let currentUser = null;
let allRuns     = [];
let bodyData    = { weight: 65, age: 30, gender: 'male' };
let goalData    = { type: 'distance', value: 5 };
let currentGoalType = 'distance';
let currentFeeling  = 3;
let deleteTarget    = null;
let historyFilter   = 'all';

/* ============================================================
   AUTH
   ============================================================ */
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

document.getElementById('googleSignInBtn').addEventListener('click', async () => {
  const btn = document.getElementById('googleSignInBtn');
  btn.innerHTML = '<span class="spin"></span> กำลังเข้าสู่ระบบ...';
  btn.disabled = true;
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (e) {
    alert('เข้าสู่ระบบไม่สำเร็จ: ' + e.message);
    btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" height="20" alt="G"> เข้าสู่ระบบด้วย Google';
    btn.disabled = false;
  }
});

function setUserUI(user) {
  const av = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName||'U')}&background=ff4d00&color=fff`;
  document.getElementById('userAvatar').src = av;
  document.getElementById('mAvatar').src    = av;
  document.getElementById('mName').textContent  = user.displayName || 'ผู้ใช้';
  document.getElementById('mEmail').textContent = user.email || '';
}

function toggleMenu() {
  document.getElementById('pmenu').classList.toggle('open');
  document.getElementById('pmenuOverlay').classList.toggle('open');
}

async function signOut() {
  await auth.signOut();
  toggleMenu();
}

/* ============================================================
   FIRESTORE HELPERS
   ============================================================ */
function uid() { return currentUser.uid; }
function runsCol() { return db.collection('users').doc(uid()).collection('runs'); }
function settCol() { return db.collection('users').doc(uid()).collection('settings'); }

async function fsSet(doc, data) { await settCol().doc(doc).set(data, { merge: true }); }
async function fsGet(doc) {
  const s = await settCol().doc(doc).get();
  return s.exists ? s.data() : null;
}

/* ============================================================
   LOAD ALL
   ============================================================ */
async function loadAll() {
  // Load body
  const b = await fsGet('body');
  if (b) {
    bodyData = b;
    document.getElementById('bWeight').textContent = b.weight;
    document.getElementById('bAge').textContent    = b.age;
    document.getElementById('bGender').value       = b.gender;
  }

  // Load goal
  const g = await fsGet('goal');
  if (g) {
    goalData = g;
    setGoalType(g.type, document.querySelector(`.gt-btn[data-gt="${g.type}"]`), true);
    if (g.type === 'distance') document.getElementById('gv-dist').textContent = g.value;
    if (g.type === 'time')     document.getElementById('gv-time').textContent = g.value;
    if (g.type === 'calories') document.getElementById('gv-cals').textContent = g.value;
  }

  // Load runs
  const snap = await runsCol().orderBy('timestamp', 'desc').get();
  allRuns = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  renderAll();
  buildPrograms();
}

function renderAll() {
  updateHeaderGoal();
  renderHome();
  renderHistory();
  renderStats();
  updateMenuStats();
}

/* ============================================================
   TABS
   ============================================================ */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

/* ============================================================
   HOME
   ============================================================ */
function renderHome() {
  buildWeekStrip();
  buildQuickStats();
  renderGoalProgress();
  renderLastRun();
}

function buildWeekStrip() {
  const days = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const now = new Date();
  const todayIdx = now.getDay();
  const strip = document.getElementById('weekStrip');

  // Build 7-day window (Mon-Sun of current week)
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - todayIdx + i);
    const dateStr = d.toISOString().slice(0,10);
    const runOnDay = allRuns.filter(r => r.date === dateStr);
    const dist = runOnDay.reduce((a,r) => a + (r.distance||0), 0);
    rows.push({ dayName: days[i], dateStr, dist, isToday: i === todayIdx });
  }

  strip.innerHTML = rows.map(r => `
    <div class="wday${r.dist > 0 ? ' ran' : ''}${r.isToday ? ' today' : ''}">
      <span class="wday-name">${r.dayName}</span>
      <div class="wday-dot"></div>
      <span class="wday-dist">${r.dist > 0 ? r.dist.toFixed(1) : ''}</span>
    </div>
  `).join('');
}

function buildQuickStats() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  monday.setHours(0,0,0,0);

  const weekRuns = allRuns.filter(r => {
    const d = new Date(r.date);
    return d >= monday;
  });

  const dist = weekRuns.reduce((a,r) => a + (r.distance||0), 0);
  const cals = weekRuns.reduce((a,r) => a + (r.calories||0), 0);
  const paces = weekRuns.filter(r => r.pace && r.pace !== '--:--').map(r => paceToMin(r.pace));
  const avgPace = paces.length ? paces.reduce((a,b)=>a+b,0)/paces.length : 0;

  document.getElementById('qs-dist').textContent  = dist.toFixed(1);
  document.getElementById('qs-runs').textContent  = weekRuns.length;
  document.getElementById('qs-cals').textContent  = Math.round(cals);
  document.getElementById('qs-pace').textContent  = avgPace ? minToDisplay(avgPace) : '--:--';
}

function renderGoalProgress() {
  if (!goalData || !goalData.value) return;
  const box = document.getElementById('goalBox');
  box.style.display = 'block';

  const today = new Date().toISOString().slice(0,10);
  const todayRuns = allRuns.filter(r => r.date === today);

  let current = 0, unit = '', label = '';
  if (goalData.type === 'distance') {
    current = todayRuns.reduce((a,r) => a + (r.distance||0), 0);
    unit = 'กม.'; label = 'โกลระยะทางวันนี้';
  } else if (goalData.type === 'time') {
    current = todayRuns.reduce((a,r) => a + (r.duration||0), 0);
    unit = 'นาที'; label = 'โกลเวลาวันนี้';
  } else {
    current = todayRuns.reduce((a,r) => a + (r.calories||0), 0);
    unit = 'kcal'; label = 'โกลแคลอรี่วันนี้';
  }

  const pct = Math.min(100, Math.round((current / goalData.value) * 100));
  document.getElementById('gLabel').textContent  = label;
  document.getElementById('gPct').textContent    = pct + '%';
  document.getElementById('gFill').style.width   = pct + '%';
  document.getElementById('gDetail').textContent = `${current.toFixed(goalData.type==='distance'?1:0)} / ${goalData.value} ${unit}`;
}

function renderLastRun() {
  if (!allRuns.length) {
    document.getElementById('lastRunWrap').style.display = 'none';
    document.getElementById('ctaWrap').style.display = 'block';
    return;
  }
  document.getElementById('ctaWrap').style.display = 'none';
  document.getElementById('lastRunWrap').style.display = 'block';
  const r = allRuns[0];
  const feelEmoji = ['😫','😕','😊','😄','🔥'][r.feeling-1] || '😊';
  document.getElementById('lastRunCard').innerHTML = `
    <div class="re-top">
      <div>
        <div style="font-weight:700;font-size:.9rem;">${formatDate(r.date)}</div>
        <div class="re-date">${r.note || ''}</div>
      </div>
      <div class="re-feeling">${feelEmoji}</div>
    </div>
    <div class="re-metrics">
      <div class="re-m"><span class="re-mv">${r.distance}</span><span class="re-ml">กม.</span></div>
      <div class="re-m"><span class="re-mv">${r.duration}</span><span class="re-ml">นาที</span></div>
      <div class="re-m"><span class="re-mv">${r.pace||'--:--'}</span><span class="re-ml">pace</span></div>
      <div class="re-m"><span class="re-mv">${Math.round(r.calories||0)}</span><span class="re-ml">kcal</span></div>
    </div>
  `;
}

/* ============================================================
   HISTORY
   ============================================================ */
function filterHistory(f, el) {
  historyFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderHistory();
}

function renderHistory() {
  const now = new Date();
  let filtered = allRuns;

  if (historyFilter === 'week') {
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1);
    monday.setHours(0,0,0,0);
    filtered = allRuns.filter(r => new Date(r.date) >= monday);
  } else if (historyFilter === 'month') {
    filtered = allRuns.filter(r => {
      const d = new Date(r.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }

  const el = document.getElementById('histList');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty"><span class="empty-icon">🏃</span>ยังไม่มีประวัติการวิ่ง</div>';
    return;
  }

  el.innerHTML = filtered.map(r => {
    const feelEmoji = ['😫','😕','😊','😄','🔥'][(r.feeling||3)-1];
    return `
    <div class="run-entry">
      <div class="re-top">
        <div>
          <div style="font-weight:700;font-size:.88rem;">${formatDate(r.date)}</div>
          ${r.heartRate ? `<div class="re-hr">❤️ ${r.heartRate} bpm</div>` : ''}
        </div>
        <div class="re-feeling">${feelEmoji}</div>
      </div>
      <div class="re-metrics">
        <div class="re-m"><span class="re-mv">${r.distance}</span><span class="re-ml">กม.</span></div>
        <div class="re-m"><span class="re-mv">${r.duration}</span><span class="re-ml">นาที</span></div>
        <div class="re-m"><span class="re-mv">${r.pace||'--:--'}</span><span class="re-ml">pace</span></div>
        <div class="re-m"><span class="re-mv">${Math.round(r.calories||0)}</span><span class="re-ml">kcal</span></div>
      </div>
      ${r.note ? `<div class="re-note">💬 ${r.note}</div>` : ''}
      <div class="re-actions"><button class="re-del" onclick="openDelete('${r.id}')">🗑 ลบ</button></div>
    </div>`;
  }).join('');
}

/* ============================================================
   STATS
   ============================================================ */
function renderStats() {
  if (!allRuns.length) return;

  const totalDist = allRuns.reduce((a,r) => a + (r.distance||0), 0);
  const totalCals = allRuns.reduce((a,r) => a + (r.calories||0), 0);
  const paces = allRuns.filter(r => r.pace && r.pace !== '--:--').map(r => paceToMin(r.pace));
  const avgPace = paces.length ? paces.reduce((a,b)=>a+b,0)/paces.length : 0;
  const bestDist = Math.max(...allRuns.map(r => r.distance||0));
  const bestPace = paces.length ? Math.min(...paces) : 0;

  document.getElementById('st-total-dist').textContent = totalDist.toFixed(1);
  document.getElementById('st-total-runs').textContent = allRuns.length;
  document.getElementById('st-total-cals').textContent = Math.round(totalCals);
  document.getElementById('st-avg-pace').textContent   = avgPace ? minToDisplay(avgPace) : '--:--';
  document.getElementById('st-best-dist').textContent  = bestDist.toFixed(1);
  document.getElementById('st-best-pace').textContent  = bestPace ? minToDisplay(bestPace) : '--:--';

  buildBarChart();
  buildPaceChart();
  buildMilestones(totalDist);
}

function buildBarChart() {
  const days = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const now = new Date();
  const buckets = Array(7).fill(0);
  const labels  = Array(7).fill('');

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - 6 + i);
    labels[i] = days[d.getDay()];
    const ds = d.toISOString().slice(0,10);
    buckets[i] = allRuns.filter(r => r.date === ds).reduce((a,r) => a+(r.distance||0), 0);
  }

  const max = Math.max(...buckets, 1);
  document.getElementById('barChart').innerHTML = buckets.map((v,i) => {
    const h = Math.max(Math.round((v/max)*80), v>0?4:0);
    return `<div class="bc-wrap">
      <div class="bc-val">${v>0?v.toFixed(1):''}</div>
      <div class="bc-bar${v===0?' empty':''}" style="height:${h}px"></div>
      <div class="bc-lbl">${labels[i]}</div>
    </div>`;
  }).join('');
}

function buildPaceChart() {
  const last10 = [...allRuns].reverse().slice(-10);
  if (!last10.length) return;
  const paces = last10.map(r => paceToMin(r.pace||''));
  const maxP = Math.max(...paces.filter(Boolean), 1);

  document.getElementById('paceChart').innerHTML = last10.map((r,i) => {
    const p = paces[i];
    const h = p ? Math.max(Math.round((p/maxP)*60), 6) : 0;
    return `<div class="pc-wrap">
      <div class="pc-bar${!p?' empty':''}" style="height:${h}px"></div>
      <div class="pc-lbl">${p ? minToDisplay(p) : '--'}</div>
    </div>`;
  }).join('');
}

const MILESTONES_DEF = [
  { km:1,   icon:'🎽', name:'วิ่งครั้งแรก' },
  { km:10,  icon:'🥉', name:'10 กม.' },
  { km:21,  icon:'🥈', name:'Half Marathon' },
  { km:42,  icon:'🥇', name:'Full Marathon' },
  { km:100, icon:'🏆', name:'100 กม.' },
  { km:200, icon:'🌟', name:'200 กม.' },
  { km:500, icon:'💎', name:'500 กม.' },
];

function buildMilestones(totalDist) {
  document.getElementById('milestones').innerHTML = MILESTONES_DEF.map(m => {
    const done = totalDist >= m.km;
    const pct = Math.min(100, Math.round((totalDist / m.km)*100));
    return `<div class="mstone">
      <div class="ms-ico">${m.icon}</div>
      <div class="ms-body">
        <div class="ms-name">${m.name}</div>
        <div class="ms-km">${m.km} กม. · สะสม ${Math.min(totalDist,m.km).toFixed(1)} กม.</div>
      </div>
      <span class="ms-badge ${done?'ms-done':'ms-todo'}">${done?'✓ สำเร็จ':pct+'%'}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   MENU STATS
   ============================================================ */
function updateMenuStats() {
  const totalDist = allRuns.reduce((a,r) => a+(r.distance||0), 0);
  const totalCals = allRuns.reduce((a,r) => a+(r.calories||0), 0);
  document.getElementById('mDist').textContent = totalDist.toFixed(1);
  document.getElementById('mRuns').textContent = allRuns.length;
  document.getElementById('mCals').textContent = Math.round(totalCals);
}

/* ============================================================
   LOG MODAL
   ============================================================ */
function openLog() {
  // Default date = today
  document.getElementById('logDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('logDist').value = '';
  document.getElementById('logTime').value = '';
  document.getElementById('logHR').value   = '';
  document.getElementById('logNote').value = '';
  document.getElementById('logCalcRow').style.display = 'none';
  setFeeling(3, document.querySelector('.feel-btn[data-f="3"]'));

  document.getElementById('logOverlay').classList.add('open');
  document.getElementById('logModal').classList.add('open');
  setTimeout(() => document.getElementById('logDist').focus(), 400);
}

function closeLog() {
  document.getElementById('logOverlay').classList.remove('open');
  document.getElementById('logModal').classList.remove('open');
}

function calcLog() {
  const dist = parseFloat(document.getElementById('logDist').value);
  const time = parseFloat(document.getElementById('logTime').value);
  if (!dist || !time) { document.getElementById('logCalcRow').style.display = 'none'; return; }

  const paceMin = time / dist;
  const speed   = (dist / time) * 60;

  // MET-based calorie calculation
  let met = 8;
  if (speed < 8) met = 6;
  else if (speed < 10) met = 8;
  else if (speed < 12) met = 10;
  else if (speed < 14) met = 11;
  else met = 12.5;

  const cals = met * bodyData.weight * (time / 60);

  document.getElementById('calcPace').textContent  = minToDisplay(paceMin);
  document.getElementById('calcSpeed').textContent = speed.toFixed(1);
  document.getElementById('calcCals').textContent  = Math.round(cals);
  document.getElementById('logCalcRow').style.display = 'grid';
}

function setFeeling(val, el) {
  currentFeeling = val;
  document.querySelectorAll('.feel-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
}

async function saveLog() {
  const dist = parseFloat(document.getElementById('logDist').value);
  const time = parseFloat(document.getElementById('logTime').value);
  const date = document.getElementById('logDate').value;

  if (!dist || !time || !date) { alert('กรุณากรอกระยะทาง เวลา และวันที่'); return; }

  const paceMin = time / dist;
  const speed   = (dist / time) * 60;
  let met = 8;
  if (speed < 8) met = 6;
  else if (speed < 10) met = 8;
  else if (speed < 12) met = 10;
  else if (speed < 14) met = 11;
  else met = 12.5;
  const cals = met * bodyData.weight * (time / 60);

  const hrVal = document.getElementById('logHR').value;
  const note  = document.getElementById('logNote').value.trim();

  const btn = document.getElementById('saveLogBtn');
  btn.innerHTML = '<span class="spin"></span> บันทึก...';
  btn.disabled = true;

  try {
    const docRef = await runsCol().add({
      date,
      distance:  Math.round(dist * 100) / 100,
      duration:  Math.round(time),
      pace:      minToDisplay(paceMin),
      speed:     Math.round(speed * 10) / 10,
      calories:  Math.round(cals),
      heartRate: hrVal ? parseInt(hrVal) : null,
      note:      note || null,
      feeling:   currentFeeling,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Add to local array
    allRuns.unshift({
      id: docRef.id,
      date, distance: Math.round(dist*100)/100,
      duration: Math.round(time),
      pace: minToDisplay(paceMin),
      speed: Math.round(speed*10)/10,
      calories: Math.round(cals),
      heartRate: hrVal ? parseInt(hrVal) : null,
      note: note || null,
      feeling: currentFeeling
    });

    // Re-sort by date desc
    allRuns.sort((a,b) => new Date(b.date) - new Date(a.date));

    renderAll();
    closeLog();
  } catch(e) {
    alert('บันทึกไม่สำเร็จ: ' + e.message);
  } finally {
    btn.innerHTML = '💾 บันทึก';
    btn.disabled = false;
  }
}

/* ============================================================
   DELETE
   ============================================================ */
function openDelete(id) {
  deleteTarget = id;
  document.getElementById('delOverlay').classList.add('open');
  document.getElementById('delModal').classList.add('open');
}

function closeDelete() {
  deleteTarget = null;
  document.getElementById('delOverlay').classList.remove('open');
  document.getElementById('delModal').classList.remove('open');
}

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  if (!deleteTarget) return;
  try {
    await runsCol().doc(deleteTarget).delete();
    allRuns = allRuns.filter(r => r.id !== deleteTarget);
    renderAll();
    closeDelete();
  } catch(e) {
    alert('ลบไม่สำเร็จ: ' + e.message);
  }
});

/* ============================================================
   GOAL TAB
   ============================================================ */
function setGoalType(type, el, silent = false) {
  currentGoalType = type;
  document.querySelectorAll('.gt-btn').forEach(b => b && b.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('gi-distance').style.display = type === 'distance' ? 'block' : 'none';
  document.getElementById('gi-time').style.display     = type === 'time'     ? 'block' : 'none';
  document.getElementById('gi-calories').style.display = type === 'calories' ? 'block' : 'none';
}

function adjGoal(delta) {
  const ids = { distance:'gv-dist', time:'gv-time', calories:'gv-cals' };
  const el = document.getElementById(ids[currentGoalType]);
  el.textContent = Math.max(1, parseInt(el.textContent) + delta);
}

async function saveGoal() {
  let value;
  if (currentGoalType === 'distance') value = parseInt(document.getElementById('gv-dist').textContent);
  else if (currentGoalType === 'time') value = parseInt(document.getElementById('gv-time').textContent);
  else value = parseInt(document.getElementById('gv-cals').textContent);

  goalData = { type: currentGoalType, value };
  await fsSet('goal', goalData);
  updateHeaderGoal();
  renderGoalProgress();
  alert('✅ บันทึกโกลแล้ว!');
}

function updateHeaderGoal() {
  const labels = {
    distance: `🎯 ${goalData.value} กม./วัน`,
    time:     `🎯 ${goalData.value} นาที/วัน`,
    calories: `🎯 ${goalData.value} kcal/วัน`
  };
  document.getElementById('headerGoalText').textContent = labels[goalData.type] || 'ตั้งโกลก่อน';
}

/* ============================================================
   BODY
   ============================================================ */
function adjBody(key, delta) {
  if (key === 'weight') {
    bodyData.weight = Math.max(30, Math.min(200, bodyData.weight + delta));
    document.getElementById('bWeight').textContent = bodyData.weight;
  } else {
    bodyData.age = Math.max(10, Math.min(99, bodyData.age + delta));
    document.getElementById('bAge').textContent = bodyData.age;
  }
}

async function saveBody() {
  bodyData.gender = document.getElementById('bGender').value;
  await fsSet('body', bodyData);
  alert('✅ บันทึกข้อมูลร่างกายแล้ว!');
}

/* ============================================================
   PROGRAMS
   ============================================================ */
const PROGRAMS = [
  { icon:'🌱', name:'มือใหม่',       desc:'3 วัน/สัปดาห์\n3–5 กม./ครั้ง\nPace ~7 น./กม.' },
  { icon:'📈', name:'พัฒนาฟอร์ม',   desc:'4 วัน/สัปดาห์\n5–8 กม./ครั้ง\nPace ~6 น./กม.' },
  { icon:'🏅', name:'Half Marathon', desc:'5 วัน/สัปดาห์\n8–15 กม./ครั้ง\nPace ~5 น./กม.' },
  { icon:'🏆', name:'Full Marathon', desc:'6 วัน/สัปดาห์\n15+ กม./ครั้ง\nPace ~4 น./กม.' },
];

function buildPrograms() {
  document.getElementById('progGrid').innerHTML = PROGRAMS.map(p => `
    <div class="prog-card">
      <div class="prog-icon">${p.icon}</div>
      <div class="prog-name">${p.name}</div>
      <div class="prog-desc">${p.desc.replace(/\n/g,'<br>')}</div>
    </div>
  `).join('');
}



/* ============================================================
   HELPERS
   ============================================================ */
function paceToMin(s) {
  if (!s || s === '--:--') return 0;
  const [m, sec] = s.split(':');
  return parseInt(m) + (parseInt(sec||0)/60);
}

function minToDisplay(m) {
  if (!m) return '--:--';
  const pm = Math.floor(m);
  const ps = String(Math.round((m - pm) * 60)).padStart(2, '0');
  return `${pm}:${ps}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()+543} (${days[d.getDay()]})`;
}
