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
  buildTips();
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
    if (btn.dataset.tab === 'water') loadWater();
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
   TIPS
   ============================================================ */
const TIPS = [
  { icon:'💧', title:'ดื่มน้ำก่อนวิ่ง', body:'500ml ก่อนออกวิ่ง 30 นาที และระหว่างวิ่งทุก 20 นาที' },
  { icon:'🧘', title:'วอร์มอัพ 5-10 นาที', body:'ยืดกล้ามเนื้อและเดินเร็วก่อนเพิ่มความเร็ว' },
  { icon:'🌡️', title:'เวลาที่เหมาะ', body:'เช้าตรู่ 05:00-07:00 หรือเย็น 17:00-19:00 หลีกเลี่ยง 10-16 น.' },
  { icon:'👟', title:'เลือกรองเท้าดี', body:'เปลี่ยนรองเท้าทุก 500-800 กม. เพื่อป้องกันบาดเจ็บ' },
  { icon:'📈', title:'เพิ่มระยะค่อยๆ', body:'เพิ่มระยะรายสัปดาห์ไม่เกิน 10% ป้องกัน overtraining' },
  { icon:'😴', title:'พักให้เพียงพอ', body:'นอน 7-9 ชั่วโมง ร่างกายซ่อมแซมตัวเองขณะหลับ' },
];

function buildTips() {
  document.getElementById('tipsGrid').innerHTML = TIPS.map(t => `
    <div class="tip-card">
      <strong>${t.icon} ${t.title}</strong>
      ${t.body}
    </div>
  `).join('');
}

/* ============================================================
   AI ANALYSIS
   ============================================================ */
async function runAI() {
  const btn = document.getElementById('aiAnalyzeBtn');
  btn.innerHTML = '<span class="spin"></span> กำลังวิเคราะห์...';
  btn.disabled = true;

  const result = document.getElementById('aiResult');
  const textEl = document.getElementById('aiText');
  result.style.display = 'none';

  // Build summary for AI
  const totalDist = allRuns.reduce((a,r) => a+(r.distance||0), 0).toFixed(1);
  const totalRuns = allRuns.length;
  const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate()-now.getDay()+1); monday.setHours(0,0,0,0);
  const weekRuns = allRuns.filter(r => new Date(r.date) >= monday);
  const weekDist = weekRuns.reduce((a,r)=>a+(r.distance||0),0).toFixed(1);
  const paces = allRuns.filter(r=>r.pace&&r.pace!=='--:--').map(r=>paceToMin(r.pace));
  const avgPace = paces.length ? minToDisplay(paces.reduce((a,b)=>a+b,0)/paces.length) : 'ไม่มีข้อมูล';
  const feelings = allRuns.map(r=>r.feeling||3);
  const avgFeeling = feelings.length ? (feelings.reduce((a,b)=>a+b,0)/feelings.length).toFixed(1) : 3;
  const recent3 = allRuns.slice(0,3).map(r=>`${r.date}: ${r.distance}กม. ${r.duration}นาที pace ${r.pace||'--'}`).join('\n');

  const prompt = `คุณเป็นโค้ชวิ่งผู้เชี่ยวชาญชาวไทย วิเคราะห์ข้อมูลการวิ่งนี้และให้คำแนะนำเป็นภาษาไทย เป็นกันเอง กระชับ:

ข้อมูลนักวิ่ง:
- น้ำหนัก: ${bodyData.weight} กก. | อายุ: ${bodyData.age} ปี | เพศ: ${bodyData.gender==='male'?'ชาย':'หญิง'}
- โกล: ${goalData.type==='distance'?goalData.value+' กม./วัน':goalData.type==='time'?goalData.value+' นาที/วัน':goalData.value+' kcal/วัน'}

สถิติ:
- วิ่งทั้งหมด: ${totalRuns} ครั้ง รวม ${totalDist} กม.
- สัปดาห์นี้: ${weekRuns.length} ครั้ง รวม ${weekDist} กม.
- Pace เฉลี่ย: ${avgPace}
- ความรู้สึกเฉลี่ย: ${avgFeeling}/5

3 การวิ่งล่าสุด:
${recent3 || 'ยังไม่มีข้อมูล'}

ให้คำแนะนำ 3-4 ข้อ ครอบคลุม: ความก้าวหน้า, จุดที่ต้องพัฒนา, เป้าหมายสัปดาห์หน้า ใช้ emoji ประกอบ`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const text = data.content?.map(c => c.text||'').join('') || 'ไม่สามารถวิเคราะห์ได้';
    textEl.textContent = text;
    result.style.display = 'block';
  } catch(e) {
    textEl.textContent = '❌ เชื่อมต่อ AI ไม่สำเร็จ กรุณาลองใหม่';
    result.style.display = 'block';
  } finally {
    btn.innerHTML = '🔄 วิเคราะห์ใหม่';
    btn.disabled = false;
  }
}

/* ============================================================
   WATER TAB
   ============================================================ */
const WATER_SCHEDULE = [
  { time: '05:55', label: 'หลังตื่นนอน',         ml: 500 },
  { time: '09:00', label: '',                      ml: 250 },
  { time: '10:30', label: '',                      ml: 250 },
  { time: '12:00', label: 'ก่อนอาหารกลางวัน',    ml: 250 },
  { time: '13:30', label: 'หลังอาหารกลางวัน',    ml: 250 },
  { time: '15:00', label: '',                      ml: 250 },
  { time: '16:30', label: '',                      ml: 250 },
  { time: '18:00', label: 'ก่อนอาหารเย็น',       ml: 250 },
  { time: '19:00', label: '',                      ml: 250 },
];

let waterChecked = {};
let waterDateKey = '';

function getWaterKey() {
  return 'water_' + new Date().toISOString().slice(0,10);
}

let waterNotifyTimer = null;
const waterNotified = {}; // track which indices already notified today

function updateNotifyBadge() {
  const badge = document.getElementById('notifyBadge');
  if (!badge) return;
  if (!('Notification' in window)) {
    badge.textContent = '🔕 ไม่รองรับ'; badge.className = 'notify-badge off'; return;
  }
  if (Notification.permission === 'granted') {
    badge.textContent = '🔔 แจ้งเตือน: เปิด'; badge.className = 'notify-badge on';
  } else if (Notification.permission === 'denied') {
    badge.textContent = '🔕 ถูกบล็อก'; badge.className = 'notify-badge off';
  } else {
    badge.textContent = '🔔 เปิดการแจ้งเตือน'; badge.className = 'notify-badge';
  }
}

async function toggleNotify() {
  if (Notification.permission === 'granted') {
    // can't programmatically revoke — guide user
    alert('ปิดการแจ้งเตือนได้ที่:\nการตั้งค่าเบราว์เซอร์ → การแจ้งเตือน → ปิดสำหรับเว็บไซต์นี้');
    return;
  }
  const ok = await requestNotifyPermission();
  if (ok) startWaterNotifyTimer();
  updateNotifyBadge();
}

async function requestNotifyPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function startWaterNotifyTimer() {
  if (waterNotifyTimer) clearInterval(waterNotifyTimer);
  waterNotifyTimer = setInterval(checkWaterNotify, 30_000);
  checkWaterNotify(); // check immediately on load
}

function checkWaterNotify() {
  if (Notification.permission !== 'granted') return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  WATER_SCHEDULE.forEach((w, i) => {
    if (waterChecked[i]) return;          // already done
    if (waterNotified[i]) return;         // already notified today

    const [wh, wm] = w.time.split(':').map(Number);
    const wMin = wh * 60 + wm;
    const diff = wMin - nowMin;

    if (diff >= 0 && diff <= 3) {
      waterNotified[i] = true;
      const label = w.label ? ` (${w.label})` : '';
      const n = new Notification('💧 JA-RUN — ถึงเวลาดื่มน้ำแล้ว!', {
        body: `${w.time}${label} — ${w.ml} ml อีก ${diff <= 0 ? 'ถึงเวลาแล้ว!' : diff + ' นาที'}`,
        icon: 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg',
        badge: 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg',
        tag: 'water-' + i,
        renotify: false,
      });
      n.onclick = () => {
        window.focus();
        document.querySelector('[data-tab="water"]')?.click();
        n.close();
      };
    }
  });
}

function loadWater() {
  waterDateKey = getWaterKey();
  const saved = localStorage.getItem(waterDateKey);
  waterChecked = saved ? JSON.parse(saved) : {};
  requestNotifyPermission().then(ok => {
    if (ok) startWaterNotifyTimer();
    updateNotifyBadge();
  });
  renderWater();
}

function saveWaterState() {
  localStorage.setItem(waterDateKey, JSON.stringify(waterChecked));
}

function toggleWater(idx) {
  waterChecked[idx] = !waterChecked[idx];
  saveWaterState();
  renderWater();
  if (waterChecked[idx]) triggerRipple(idx);
}

function triggerRipple(idx) {
  const row = document.getElementById('wrow-' + idx);
  if (!row) return;
  row.classList.add('wrow-flash');
  setTimeout(() => row.classList.remove('wrow-flash'), 600);
}

function resetWater() {
  if (!confirm('รีเซ็ตการดื่มน้ำวันนี้?')) return;
  waterChecked = {};
  saveWaterState();
  renderWater();
}

function renderWater() {
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const totalMl = WATER_SCHEDULE.reduce((a,w) => a + w.ml, 0);
  const dranks  = WATER_SCHEDULE.filter((_, i) => waterChecked[i]);
  const drankMl = dranks.reduce((a,w) => a + w.ml, 0);
  const pct     = Math.round((drankMl / totalMl) * 100);

  // ring
  const circumference = 314.16;
  const offset = circumference - (circumference * pct / 100);
  const ring = document.getElementById('ringFill');
  if (ring) ring.style.strokeDashoffset = offset;

  document.getElementById('waterTotalVal').textContent = drankMl.toLocaleString();
  document.getElementById('waterGoalVal').textContent  = totalMl.toLocaleString();
  document.getElementById('waterPct').textContent      = pct + '%';
  document.getElementById('wDrank').textContent        = dranks.length;
  document.getElementById('wLeft').textContent         = WATER_SCHEDULE.length - dranks.length;
  document.getElementById('wCups').textContent         = Math.floor(drankMl / 250);

  // ring color based on progress
  if (ring) {
    ring.style.stroke = pct >= 100 ? '#22c55e' : pct >= 60 ? '#3b82f6' : '#ff4d00';
  }

  // rows
  const list = document.getElementById('waterList');
  if (!list) return;

  const [h, m] = ['', ''];
  list.innerHTML = WATER_SCHEDULE.map((w, i) => {
    const [wh, wm] = w.time.split(':').map(Number);
    const wMin = wh * 60 + wm;
    const isPast    = currentTime > wMin;
    const isCurrent = !waterChecked[i] && isPast && currentTime - wMin < 90;
    const isDone    = !!waterChecked[i];

    const timeDisplay = w.label
      ? `<span class="wr-time">${w.time}</span><span class="wr-label">${w.label}</span>`
      : `<span class="wr-time">${w.time}</span>`;

    let rowClass = 'water-row';
    if (isDone)    rowClass += ' wr-done';
    if (isCurrent) rowClass += ' wr-current';
    if (isPast && !isDone && !isCurrent) rowClass += ' wr-missed';

    return `
      <div class="${rowClass}" id="wrow-${i}" onclick="toggleWater(${i})">
        <div class="wr-left">${timeDisplay}</div>
        <div class="wr-ml">${w.ml} <span>ml</span></div>
        <div class="wr-check">
          <div class="wr-checkbox ${isDone ? 'checked' : ''}">
            ${isDone ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
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
