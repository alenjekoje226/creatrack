// ============================================================
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

  document.getElementById('reset-hydration').addEventListener('click', () => {
    ensureTodayReset();
    data.hydrationToday = 0;
    saveData();
    checkAndRecordGoal();
    renderHydration();
  });
}

function renderHydration() {
  ensureTodayReset();
  const targets = computeTargets();
  const goalMl = targets.waterL * 1000;
  const currentL = data.hydrationToday / 1000;
  const pct = Math.min(100, Math.round((data.hydrationToday / goalMl) * 100));
  const remaining = Math.max(0, (goalMl - data.hydrationToday) / 1000);

  document.getElementById('hydration-current').textContent = currentL.toFixed(2);
  document.getElementById('hydration-goal').textContent = targets.waterL.toFixed(1);
  document.getElementById('hydration-pct').textContent = pct + '%';
  document.getElementById('hydration-remaining').textContent = remaining.toFixed(2);
  document.getElementById('creatine-today-mini').textContent = data.creatineToday.toFixed(1);
  document.getElementById('creatine-goal-mini').textContent = targets.creatineG.toFixed(1);
  document.getElementById('streak-count').textContent = data.streak;

  const circumference = 628; // 2 * PI * 100
  const offset = circumference - (circumference * pct / 100);
  document.getElementById('hydration-ring').style.strokeDashoffset = offset;
}

// ---------- Creatine Tab ----------
function initCreatineTab() {
  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const seg = btn.dataset.seg;
      document.getElementById('creatine-log-view').classList.toggle('hidden', seg !== 'log');
      document.getElementById('creatine-profile-view').classList.toggle('hidden', seg !== 'profile');
      if (seg === 'profile') syncProfileView();
    });
  });

  document.querySelectorAll('.dose-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      data.doseAmount = parseFloat(chip.dataset.g);
      document.getElementById('dose-amount').textContent = data.doseAmount.toFixed(1);
    });
  });

  document.getElementById('add-dose-btn').addEventListener('click', () => {
    ensureTodayReset();
    data.creatineToday += data.doseAmount;
    data.creatineLifetime += data.doseAmount;
    saveData();
    checkAndRecordGoal();
    renderCreatine();
    renderHydration();
  });

  // Profile view controls
  document.querySelectorAll('#creatine-profile-view .age-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#creatine-profile-view .age-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('#creatine-profile-view .activity-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#creatine-profile-view .activity-option').forEach(b => {
        b.classList.remove('active');
        b.querySelector('.activity-radio').innerHTML = '';
      });
      btn.classList.add('active');
      btn.querySelector('.activity-radio').innerHTML = '<div class="activity-check">✓</div>';
    });
  });

  document.getElementById('save-profile-btn').addEventListener('click', () => {
    const age = document.querySelector('#creatine-profile-view .age-option.active').dataset.age;
    const activity = document.querySelector('#creatine-profile-view .activity-option.active').dataset.activity;
    const weight = parseFloat(document.getElementById('weight-input-2').value) || data.weightKg;
    data.ageGroup = age;
    data.activity = activity;
    data.weightKg = weight;
    saveData();
    renderCreatine();
    renderHydration();
    // switch back to log view
    document.querySelector('.seg-btn[data-seg="log"]').click();
  });
}

function syncProfileView() {
  document.querySelectorAll('#creatine-profile-view .age-option').forEach(b => {
    b.classList.toggle('active', b.dataset.age === data.ageGroup);
  });
  document.querySelectorAll('#creatine-profile-view .activity-option').forEach(b => {
    const isActive = b.dataset.activity === data.activity;
    b.classList.toggle('active', isActive);
    b.querySelector('.activity-radio').innerHTML = isActive ? '<div class="activity-check">✓</div>' : '';
  });
  document.getElementById('weight-input-2').value = data.weightKg;
  document.getElementById('weight-label-2').textContent = data.units === 'imperial' ? 'WEIGHT (LBS)' : 'WEIGHT (KG)';
}

function renderCreatine() {
  ensureTodayReset();
  const targets = computeTargets();
  document.getElementById('creatine-recommended').textContent = targets.creatineG.toFixed(1);
  document.getElementById('creatine-today').textContent = data.creatineToday.toFixed(1);
  document.getElementById('creatine-lifetime').textContent = data.creatineLifetime.toFixed(1);
  document.getElementById('dose-amount').textContent = data.doseAmount.toFixed(1);
}

// ---------- History Tab ----------
function initHistoryTab() {
  document.getElementById('cal-prev').addEventListener('click', () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
    renderHistory();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
    renderHistory();
  });
}

function renderHistory() {
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month-label').textContent = monthNames[month] + ' ' + year;

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay(); // 0 = Sunday

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
  let goalsMetCount = 0;
  let totalEntries = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const entry = data.entries[key];
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = day;

    if (entry) {
      totalEntries++;
      if (entry.goalMet) {
        cell.classList.add('goal-met');
        goalsMetCount++;
      }
    }

    if (isCurrentMonth && day === now.getDate()) {
      cell.classList.add('today');
    }

    grid.appendChild(cell);
  }

  document.getElementById('goals-met-count').textContent = goalsMetCount;
  document.getElementById('total-entries-count').textContent = totalEntries;
}

// ---------- Body Tab ----------
const BODY_PARTS = [
  { key: 'arms', label: 'ARMS', icon: '🏋️' },
  { key: 'neck', label: 'NECK', icon: '👕' },
  { key: 'chest', label: 'CHEST', icon: '❤️' },
  { key: 'waist', label: 'WAIST', icon: '📏' },
  { key: 'thighs', label: 'THIGHS', icon: '🦵' },
  { key: 'weight', label: 'WEIGHT', icon: '⚖️' }
];

function initBodyTab() {
  // delegated listeners added at render time
}

function unitForPart(key) {
  if (key === 'weight') return data.units === 'imperial' ? 'lbs' : 'kg';
  return data.units === 'imperial' ? 'in' : 'cm';
}

function renderBody() {
  const container = document.getElementById('body-measurements');
  container.innerHTML = '';

  BODY_PARTS.forEach(part => {
    const history = data.body[part.key] || [];
    const latest = history.length ? history[history.length - 1].value : null;
    const prev = history.length > 1 ? history[history.length - 2].value : null;
    const delta = (latest !== null && prev !== null) ? (latest - prev) : null;

    const card = document.createElement('div');
    card.className = 'body-card';

    const headerHtml = `
      <div class="body-card-header">
        <div class="body-icon">${part.icon}</div>
        <div>
          <div class="body-name">${part.label}</div>
          <div class="body-value">${latest !== null ? latest.toFixed(1) : '—'} <span style="font-size:14px;color:#3ad0ff;">${unitForPart(part.key)}</span></div>
        </div>
        ${delta !== null ? `<div class="body-delta">${delta >= 0 ? '↗' : '↘'} ${Math.abs(delta).toFixed(1)}</div>` : ''}
      </div>
      <div class="body-input-row">
        <input type="number" class="body-input" placeholder="${latest !== null ? latest.toFixed(1) : 'Enter value'}" inputmode="decimal" data-key="${part.key}">
        <button class="body-add-btn" data-key="${part.key}">+</button>
      </div>
      <div class="body-history-toggle" data-key="${part.key}">Show history (${history.length}) ⌄</div>
      <div class="body-history-list hidden" id="history-${part.key}"></div>
    `;

    card.innerHTML = headerHtml;
    container.appendChild(card);
  });

  // attach listeners
  container.querySelectorAll('.body-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const input = container.querySelector(`.body-input[data-key="${key}"]`);
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) {
        data.body[key].push({ date: todayKey(), value: val });
        saveData();
        input.value = '';
        renderBody();
      }
    });
  });

  container.querySelectorAll('.body-history-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const key = toggle.dataset.key;
      const listEl = document.getElementById('history-' + key);
      const isHidden = listEl.classList.contains('hidden');
      if (isHidden) {
        const history = (data.body[key] || []).slice().reverse();
        listEl.innerHTML = history.length
          ? history.map(h => `<div class="body-history-item"><span>${h.date}</span><span>${h.value.toFixed(1)} ${unitForPart(key)}</span></div>`).join('')
          : `<div class="body-history-item"><span>No entries yet</span></div>`;
      }
      listEl.classList.toggle('hidden');
    });
  });
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initOnboarding();
  if (data.onboarded) {
    startApp();
  }
});
