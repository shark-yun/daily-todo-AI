document.addEventListener('DOMContentLoaded', () => {
  
  // ==========================================
  // 【請將您的 Google Apps Script 部署網址貼在這裡】
  // ==========================================
  const GOOGLE_SHEET_URL = ''; 

  const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const WEEKDAYS = ['日','一','二','三','四','五','六'];

  const realToday = new Date();
  let calYear = realToday.getFullYear();
  let calMonth = realToday.getMonth();
  let selectedKey = '';
  
  let currentUser = JSON.parse(localStorage.getItem('todo_user'));
  let friends = JSON.parse(localStorage.getItem('todo_friends') || '[]');
  let syncTimeout = null;

  /* ── Auth Logic ── */
  function initAuth() {
    if (currentUser && currentUser.id && currentUser.phone) {
      document.getElementById('view-login').classList.remove('active');
      document.getElementById('view-cal').classList.add('active');
      fetchFromGoogleSheet(); // Initial sync pull
      renderCal();
    } else {
      document.getElementById('view-cal').classList.remove('active');
      document.getElementById('view-list').classList.remove('active');
      document.getElementById('view-ranking').classList.remove('active');
      document.getElementById('view-login').classList.add('active');
    }
  }

  document.getElementById('btn-login').addEventListener('click', () => {
    const id = document.getElementById('login-id').value.trim();
    const phone = document.getElementById('login-phone').value.trim();
    const errorEl = document.getElementById('login-error');
    
    if (!id || !phone) {
      errorEl.textContent = '請輸入完整 ID 與手機號碼';
      return;
    }
    
    currentUser = { id, phone };
    localStorage.setItem('todo_user', JSON.stringify(currentUser));
    errorEl.textContent = '';
    initAuth();
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('todo_user');
    currentUser = null;
    initAuth();
  });

  /* ── Sync Logic ── */
  async function syncToGoogleSheet(dateStr, tasks) {
    if (!currentUser || !GOOGLE_SHEET_URL.startsWith('http')) return;
    
    const statusEl = document.getElementById('sync-status');
    statusEl.textContent = '同步中...';
    statusEl.className = 'sync-status syncing';

    try {
      await fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        body: JSON.stringify({
          id: currentUser.id,
          phone: currentUser.phone,
          date: dateStr,
          tasks: tasks
        })
      });
      statusEl.textContent = '已同步雲端';
      statusEl.className = 'sync-status';
    } catch(err) {
      console.error('Sync failed', err);
      statusEl.textContent = '同步失敗';
      statusEl.className = 'sync-status error';
    }
  }

  async function fetchFromGoogleSheet() {
    if (!currentUser || !GOOGLE_SHEET_URL.startsWith('http')) return;
    
    try {
      const res = await fetch(`${GOOGLE_SHEET_URL}?id=${currentUser.id}&phone=${currentUser.phone}`);
      const data = await res.json();
      
      Object.keys(data).forEach(dateStr => {
        if (Array.isArray(data[dateStr])) {
          localStorage.setItem('todos_' + dateStr, JSON.stringify(data[dateStr]));
        }
      });
      renderCal(); 
      if (selectedKey) renderList(); 
    } catch(err) {}
  }

  /* ── Storage ── */
  function dateKey(y, m, d) {
    return y + '-' + String(m + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
  }
  function todayKey() {
    return dateKey(realToday.getFullYear(), realToday.getMonth(), realToday.getDate());
  }
  function getTasks(key) {
    try { return JSON.parse(localStorage.getItem('todos_' + key) || '[]'); } catch(e) { return []; }
  }
  function saveTasks(key, tasks) {
    try { 
      localStorage.setItem('todos_' + key, JSON.stringify(tasks)); 
      
      if(syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        syncToGoogleSheet(key, tasks);
      }, 1000);
      
      updateDashboard();

    } catch(e) {}
  }

  /* ── Dashboard Stats ── */
  function updateDashboard() {
    let monthlyTotal = 0; let monthlyDone = 0;
    let weeklyTotal = 0; let weeklyDone = 0;
    
    // Get week dates
    const today = new Date();
    const currDay = today.getDay(); // 0-6
    const firstDayOfWeek = new Date(today);
    firstDayOfWeek.setDate(today.getDate() - currDay);
    
    const weekDates = [];
    for(let i=0; i<7; i++) {
      const d = new Date(firstDayOfWeek);
      d.setDate(d.getDate() + i);
      weekDates.push(dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    
    const monthPrefix = `${calYear}-${String(calMonth+1).padStart(2,'0')}`;
    const allDates = Object.keys(localStorage).filter(k => k.startsWith('todos_')).map(k => k.replace('todos_',''));
    
    allDates.forEach(dateStr => {
      if (dateStr.startsWith(monthPrefix)) {
        const tasks = getTasks(dateStr);
        monthlyTotal += tasks.length;
        monthlyDone += tasks.filter(t => t.done).length;
      }
      if (weekDates.includes(dateStr)) {
        const tasks = getTasks(dateStr);
        weeklyTotal += tasks.length;
        weeklyDone += tasks.filter(t => t.done).length;
      }
    });
    
    const mRate = monthlyTotal === 0 ? 0 : Math.round((monthlyDone/monthlyTotal)*100);
    const wRate = weeklyTotal === 0 ? 0 : Math.round((weeklyDone/weeklyTotal)*100);
    
    document.getElementById('stat-monthly').textContent = mRate + '%';
    document.getElementById('stat-weekly').textContent = wRate + '%';
  }

  /* ── Completion rate & colour ── */
  function getRate(key) {
    const t = getTasks(key);
    if (!t.length) return -1;
    return t.filter(x => x.done).length / t.length;
  }
  function rateColor(rate) {
    if (rate < 0)   return null;
    if (rate === 0) return '#e8f5e9';
    if (rate < 0.4) return '#a5d6a7';
    if (rate < 0.8) return '#66bb6a';
    return '#2e7d32';
  }
  function textOnColor(rate) {
    return rate >= 0.8 ? '#fff' : null;
  }

  /* ── Calendar ── */
  function renderCal() {
    document.getElementById('cal-month-label').textContent = calYear + '年 ' + MONTHS[calMonth];
    const container = document.getElementById('cal-days');
    container.innerHTML = '';

    updateDashboard();

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      const el = document.createElement('div');
      el.className = 'cal-day empty';
      container.appendChild(el);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(calYear, calMonth, d);
      const isToday = key === todayKey();
      const isSel   = key === selectedKey;
      const rate    = getRate(key);
      const color   = rateColor(rate);

      const el = document.createElement('div');
      el.className = 'cal-day' + (isToday ? ' today' : '') + (isSel ? ' selected' : '');

      if (color && !isSel) {
        const bg = document.createElement('div');
        bg.className = 'day-bg';
        bg.style.background = color;
        el.appendChild(bg);
      }

      const num = document.createElement('div');
      num.className = 'day-num';
      num.textContent = d;
      if (color && !isSel && textOnColor(rate)) num.style.color = textOnColor(rate);
      el.appendChild(num);

      el.addEventListener('click', () => showList(calYear, calMonth, d));
      container.appendChild(el);
    }
  }

  /* ── List view ── */
  function showList(y, m, d) {
    selectedKey = dateKey(y, m, d);
    const dt = new Date(y, m, d);
    document.getElementById('list-date-label').textContent = y + '年 ' + MONTHS[m];
    document.getElementById('list-title').textContent = d + ' ' + MONTHS[m] + '　星期' + WEEKDAYS[dt.getDay()];
    document.getElementById('view-cal').classList.remove('active');
    document.getElementById('view-list').classList.add('active');
    document.getElementById('fab').classList.add('visible');
    
    document.getElementById('sync-status').textContent = GOOGLE_SHEET_URL ? '已載入' : '離線模式';
    document.getElementById('sync-status').className = 'sync-status';

    renderList();
  }

  function showCal() {
    selectedKey = '';
    document.getElementById('view-list').classList.remove('active');
    document.getElementById('view-ranking').classList.remove('active');
    document.getElementById('view-cal').classList.add('active');
    document.getElementById('fab').classList.remove('visible');
    renderCal();
  }

  function renderList() {
    const tasks   = getTasks(selectedKey);
    const pending = tasks.filter(t => !t.done);
    const done    = tasks.filter(t => t.done);
    const total   = tasks.length;
    const pct     = total === 0 ? 0 : Math.round(done.length / total * 100);

    document.getElementById('progress').style.width = pct + '%';
    document.getElementById('progress-pct').textContent = pct + '%';
    document.getElementById('pending-label').textContent =
      '待完成' + (pending.length ? '  ·  ' + pending.length : '');

    const tl = document.getElementById('todo-list');
    const dl = document.getElementById('done-list');
    tl.innerHTML = ''; dl.innerHTML = '';

    if (pending.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-state';
      li.textContent = done.length ? '全部完成！🎉' : '按右下角 + 新增任務';
      tl.appendChild(li);
    } else {
      pending.forEach(t => tl.appendChild(makeItem(t)));
    }

    done.forEach(t => dl.appendChild(makeItem(t)));
    document.getElementById('done-section').style.display = done.length ? 'block' : 'none';
  }

  function makeItem(task) {
    const li = document.createElement('li');
    li.className = 'todo-item' + (task.done ? ' done' : '');
    li.addEventListener('click', (e) => { 
        if (!e.target.classList.contains('del-btn')) toggle(task.id); 
    });

    const box = document.createElement('div');
    box.className = 'check-box';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 10 10');
    svg.classList.add('check-icon');
    svg.innerHTML = '<polyline points="1.5,5.2 3.8,7.5 8.5,2.5" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
    box.appendChild(svg);

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = task.text;

    const del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '×';
    del.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        remove(task.id); 
    });

    li.append(box, text, del);
    return li;
  }

  /* ── Task actions ── */
  function addTask() {
    const input = document.getElementById('new-task');
    const text = input.value.trim();
    if (!text) return;
    const tasks = getTasks(selectedKey);
    tasks.push({ id: Date.now(), text, done: false });
    saveTasks(selectedKey, tasks);
    input.value = '';
    renderList();
    closeSheet();
  }

  function toggle(id) {
    const tasks = getTasks(selectedKey);
    const t = tasks.find(t => t.id === id);
    if (t) t.done = !t.done;
    saveTasks(selectedKey, tasks);
    renderList();
  }

  function remove(id) {
    saveTasks(selectedKey, getTasks(selectedKey).filter(t => t.id !== id));
    renderList();
  }

  /* ── Ranking ── */
  document.getElementById('btn-open-ranking').addEventListener('click', () => {
    document.getElementById('view-cal').classList.remove('active');
    document.getElementById('view-ranking').classList.add('active');
    document.getElementById('ranking-title').textContent = `${calMonth+1}月 排行榜`;
    fetchRanking();
  });
  
  document.getElementById('btn-back-ranking').addEventListener('click', showCal);
  
  document.getElementById('btn-add-friend').addEventListener('click', () => {
    const phone = document.getElementById('friend-phone').value.trim();
    if (phone && !friends.includes(phone) && phone !== currentUser?.phone) {
      friends.push(phone);
      localStorage.setItem('todo_friends', JSON.stringify(friends));
      document.getElementById('friend-phone').value = '';
      fetchRanking();
    }
  });

  async function fetchRanking() {
    const listEl = document.getElementById('ranking-list');
    listEl.innerHTML = '<li class="empty-state">載入中...</li>';
    
    if (!GOOGLE_SHEET_URL.startsWith('http')) {
      listEl.innerHTML = '<li class="empty-state">請先依照教學設定 Google Sheet URL</li>';
      return;
    }
    
    const phones = [currentUser.phone, ...friends].join(',');
    const month = `${calYear}-${String(calMonth+1).padStart(2,'0')}`;
    
    try {
      const res = await fetch(`${GOOGLE_SHEET_URL}?action=ranking&month=${month}&phones=${phones}`);
      const ranking = await res.json();
      
      listEl.innerHTML = '';
      if (ranking.length === 0) {
        listEl.innerHTML = '<li class="empty-state">本月尚無資料</li>';
        return;
      }
      
      ranking.forEach((r, idx) => {
        const li = document.createElement('li');
        li.className = 'rank-item';
        
        let numStr = (idx+1).toString();
        if(idx===0) numStr = '🥇';
        if(idx===1) numStr = '🥈';
        if(idx===2) numStr = '🥉';
        
        li.innerHTML = `
          <div class="rank-info">
            <span class="rank-num">${numStr}</span>
            <div>
              <div class="rank-id">${r.id} ${r.phone === currentUser.phone ? '(我)' : ''}</div>
              <div class="rank-phone">${r.phone}</div>
            </div>
          </div>
          <div class="rank-score">${r.rate}%</div>
        `;
        listEl.appendChild(li);
      });
      
    } catch(err) {
      listEl.innerHTML = '<li class="empty-state">排行榜載入失敗</li>';
    }
  }

  /* ── Sheet ── */
  function openSheet() {
    document.getElementById('sheet').classList.add('open');
    document.getElementById('overlay').classList.add('open');
    setTimeout(() => document.getElementById('new-task').focus(), 350);
  }
  function closeSheet() {
    document.getElementById('sheet').classList.remove('open');
    document.getElementById('overlay').classList.remove('open');
    document.getElementById('new-task').value = '';
  }

  /* ── Event Listeners ── */
  document.getElementById('prev-btn').addEventListener('click', () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCal();
  });
  document.getElementById('next-btn').addEventListener('click', () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCal();
  });
  document.getElementById('new-task').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTask();
  });
  document.getElementById('back-btn').addEventListener('click', showCal);
  document.getElementById('fab').addEventListener('click', openSheet);
  document.getElementById('overlay').addEventListener('click', closeSheet);
  document.getElementById('btn-cancel').addEventListener('click', closeSheet);
  document.getElementById('btn-add').addEventListener('click', addTask);

  // Init
  initAuth();
});
