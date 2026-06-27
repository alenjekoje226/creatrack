//============================================================
// CREATRACK - app logic
// All data persisted with localStorage (free, on-device, forever)
// ============================================================

const STORAGE_KEY = 'creatrack_data_v1';

const DEFAULT_DATA = {
  onboarded: false,
  units: 'metric', // metric | imperial
  ageGroup: 'adult', // teen | adult | senior
  weightKg: 75,
  activity: 'moderate', // sedentary | light | moderate | intense
  streak: 0,
  lastLogDate: null,
  hydrationToday: 0, // ml
  hydrationDate: null,
  creatineToday: 0, // g
  creatineDate: null,
  creatineLifetime: 0,
  doseAmount: 5,
  // entries: { "2026-06-26": { hydrationMl: 1250, creatineG: 5, goalMet: true } }
  entries: {},
  body: {
    arms: [],
    neck: [],
    chest: [],
    waist: [],
    thighs: [],
    weight: []
  }
};

let data = loadData();

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_DATA);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_DATA), ...parsed, body: { ...structuredClone(DEFAULT_DATA.body), ...(parsed.body || {}) } };
  } catch (e) {
    console.error('Failed to load data', e);
    return structuredClone(DEFAULT_DATA);
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save data', e);
  }
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function ensureTodayReset() {
  const tk = todayKey();
  if (data.hydrationDate !== tk) {
    data.hydrationDate = tk;
    data.hydrationToday = 0;
  }
  if (data.creatineDate !== tk) {
    data.creatineDate = tk;
    data.creatineToday = 0;
  }
  saveData();
}

// ---------- Targets calculation ----------
function getActivityMultiplier(activity) {
  switch (activity) {
    case 'sedentary': return 0;
    case 'light': return 1;
    case 'moderate': return 2;
    case 'intense': return 3;
    default: return 2;
  }
}

function computeTargets() {
  const weightKg = data.units === 'imperial' ? data.weightKg * 0.453592 : data.weightKg;
  // Creatine: base 0.07g/kg + activity bonus, clamp sensible range, default moderate 75kg => 5.3g per screenshots
  const mult = getActivityMultiplier(data.activity);
  let creatine = (weightKg * 0.05) + (mult * 0.5);
  if (data.ageGroup === 'teen') creatine *= 0.85;
  if (data.ageGroup === 'senior') creatine *= 1.05;
  creatine = Math.max(2, Math.min(10, creatine));

  // Water: ~35ml/kg base + activity bonus liters
  let waterL = (weightKg * 0.035) + (mult * 0.4);
  waterL = Math.max(1.5, Math.min(5, waterL));

  return {
    creatineG: Math.round(creatine * 10) / 10,
    waterL: Math.round(waterL * 10) / 10
  };
}

// ============================================================
// ONBOARDING
// ============================================================

let obState = {
  units: data.units,
  ageGroup: data.ageGroup,
  weightKg: data.weightKg,
  activity: data.activity
};

function initOnboarding() {
  // Step 1: units
  document.querySelectorAll('#ob-step-1 .unit-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ob-step-1 .unit-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      obState.units = btn.dataset.unit;
    });
  });

  document.getElementById('btn-step1-continue').addEventListener('click', () => {
    document.getElementById('ob-step-1').classList.add('hidden');
    document.getElementById('ob-step-2').classList.remove('hidden');
    updateWeightLabel();
  });

  // Step 2: details
  document.querySelectorAll('#ob-step-2 .age-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ob-step-2 .age-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      obState.ageGroup = btn.dataset.age;
    });
  });

  document.getElementById('weight-input').addEventListener('input', (e) => {
    obState.weightKg = parseFloat(e.target.value) || 0;
  });

  document.getElementById('btn-step2-back').addEventListener('click', () => {
    document.getElementById('ob-step-2').classList.add('hidden');
    document.getElementById('ob-step-1').classList.remove('hidden');
  });

  document.getElementById('btn-step2-continue').addEventListener('click', () => {
    document.getElementById('ob-step-2').classList.add('hidden');
    document.getElementById('ob-step-3').classList.remove('hidden');
    updateObTargets();
  });

  // Step 3: activity
  document.querySelectorAll('#ob-step-3 .activity-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ob-step-3 .activity-option').forEach(b => {
        b.classList.remove('active');
        b.querySelector('.activity-radio').innerHTML = '';
      });
      btn.classList.add('active');
      btn.querySelector('.activity-radio').innerHTML = '<div class="activity-check">✓</div>';
      obState.activity = btn.dataset.activity;
      updateObTargets();
    });
  });

  document.getElementById('btn-step3-back').addEventListener('click', () => {
    document.getElementById('ob-step-3').classList.add('hidden');
    document.getElementById('ob-step-2').classList.remove('hidden');
  });

  document.getElementById('btn-start-tracking').addEventListener('click', () => {
    data.units = obState.units;
    data.ageGroup = obState.ageGroup;
    data.weightKg = obState.weightKg;
    data.activity = obState.activity;
    data.onboarded = true;
    saveData();
    startApp();
  });
}

function updateWeightLabel() {
  const isImperial = obState.units === 'imperial';
  document.getElementById('weight-label').textContent = isImperial ? 'WEIGHT (LBS)' : 'WEIGHT (KG)';
}

function updateObTargets() {
  const tempData = { ...data, ageGroup: obState.ageGroup, weightKg: obState.weightKg, activity: obState.activity, units: obState.units };
  const oldData = data;
  data = tempData;
  const targets = computeTargets();
  data = oldData;
  document.getElementById('target-creatine').textContent = targets.creatineG.toFixed(1);
  document.getElementById('target-water').textContent = targets.waterL.toFixed(1);
}

// ============================================================
// MAIN APP
// ============================================================

let calendarViewDate = new Date();

function startApp() {
  document.getElementById('onboarding').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  ensureTodayReset();
  updateStreak();
  initTabs();
  initHydrationTab();
  initCreatineTab();
  initHistoryTab();
  initBodyTab();
  renderHydration();
  renderCreatine();
  renderHistory();
  renderBody();
  setGreeting();
}

function setGreeting() {
  const hour = new Date().getHours();
  let greet = 'day';
  if (hour < 12) greet = 'morning';
  else if (hour < 18) greet = 'afternoon';
  else greet = 'evening';
  document.getElementById('greet-time').textContent = greet;

  const today = new Date();
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  document.getElementById('date-today').textContent = today.toLocaleDateString('en-US', options);
}

function updateStreak() {
  // Recompute streak by walking back from today through entries with goalMet
  let streak = 0;
  let d = new Date();
  while (true) {
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const entry = data.entries[key];
    if (entry && entry.goalMet) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  data.streak = streak;
  saveData();
}

function checkAndRecordGoal() {
  const targets = computeTargets();
  const goalMetHydration = data.hydrationToday >= targets.waterL * 1000;
  const goalMetCreatine = data.creatineToday >= targets.creatineG;
  const goalMet = goalMetHydration && goalMetCreatine;
  const tk = todayKey();
  data.entries[tk] = {
    hydrationMl: data.hydrationToday,
    creatineG: data.creatineToday,
    goalMet: goalMet
  };
  saveData();
  updateStreak();
}

// ---------- Tabs ----------
function initTabs() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.tab-page').forEach(p => p.classList.add('hidden'));
      document.getElementById('tab-' + tab).classList.remove('hidden');
      if (tab === 'history') renderHistory();
      if (tab === 'body') renderBody();
    });
  });
}

// ---------- Hydration Tab ----------
function initHydrationTab() {
  document.querySelectorAll('.quick-add').forEach(btn => {
    btn.addEventListener('click', () => {
      ensureTodayReset();
      data.hydrationToday += parseInt(btn.dataset.ml, 10);
      saveData();
      checkAndRecordGoal();
      renderHydration();
    });
  });

  
