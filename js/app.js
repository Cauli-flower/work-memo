/* app.js — 工作备忘主逻辑：任务 / 速记 / 设置 三个页面 + 编辑弹层。
 * 纯前端、纯本地，无网络请求。 */
(function () {
  const appEl = document.getElementById('app');
  const titleEl = document.getElementById('view-title');
  const subEl = document.getElementById('header-sub');
  const sheetEl = document.getElementById('sheet');
  const tabs = Array.from(document.querySelectorAll('.tab'));

  const APP_VERSION = 'v10'; // 与 service-worker.js 的缓存版本同步；改动发布时一起 +1
  const VIEW_TITLES = { tasks: '任务', notes: '速记', settings: '设置' };
  let currentView = 'tasks';
  let taskFilter = 'active'; // active | done
  let taskSort = 'due';      // due 按截止日期 | assignee 按负责人分组
  let selectMode = false;    // 已完成的批量删除选择模式
  let selectedIds = new Set();
  let collapsedAssignees = new Set(); // 「按负责人」视图里已折叠的分组（按人名/'' 未指派）

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

  function startOfToday() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function parseDue(due) {
    const [y, m, d] = due.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function toInputDate(date) {
    const p = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
  }
  function dueInfo(due) {
    if (!due) return null;
    const diff = Math.round((parseDue(due) - startOfToday()) / 86400000);
    let label, cls;
    if (diff < 0) { label = '逾期 ' + -diff + ' 天'; cls = 'overdue'; }
    else if (diff === 0) { label = '今天到期'; cls = 'soon'; }
    else if (diff === 1) { label = '明天到期'; cls = 'soon'; }
    else if (diff <= 3) { label = '还剩 ' + diff + ' 天'; cls = 'soon'; }
    else { label = '还剩 ' + diff + ' 天'; cls = 'later'; }
    return { diff, label, cls, dateText: (parseDue(due).getMonth() + 1) + '/' + parseDue(due).getDate() };
  }
  function relTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function ico(name, cls) {
    return '<span class="ico' + (cls ? ' ' + cls : '') + '">' + window.Icons.svg(name) + '</span>';
  }

  /* ---------------- 顶部副标题 ---------------- */
  function renderHeader() {
    titleEl.textContent = VIEW_TITLES[currentView];
    if (currentView === 'tasks') {
      const tasks = Store.getTasks();
      const active = tasks.filter((t) => !t.done);
      const overdue = active.filter((t) => t.due && dueInfo(t.due).diff < 0).length;
      const today = active.filter((t) => t.due && dueInfo(t.due).diff === 0).length;
      const bits = [active.length + ' 项进行中'];
      if (today) bits.push('今天到期 ' + today);
      if (overdue) bits.push('已逾期 ' + overdue);
      subEl.textContent = bits.join(' · ');
    } else if (currentView === 'notes') {
      subEl.textContent = Store.getNotes().length + ' 条速记';
    } else {
      subEl.textContent = '数据只存本机';
    }
  }

  /* ---------------- 任务页 ---------------- */
  function sortActive(a, b) {
    // 有截止日期的在前、按日期升序；无日期的按创建时间倒序
    if (a.due && b.due) return parseDue(a.due) - parseDue(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  }

  function taskCardBody(t, opts) {
    opts = opts || {};
    const meta = [];
    if (t.assignee) meta.push('<span class="chip">' + ico('person') + esc(t.assignee) + '</span>');
    if (!opts.hideDue) {
      const di = dueInfo(t.due);
      if (di) meta.push('<span class="chip due-' + di.cls + '">' + ico('clock') + esc(di.label) + '</span>');
    }
    const notes = t.notes
      ? '<div class="card-notes">' + nl2br(t.notes) + '</div>' : '';
    return '<div class="card-body">' +
        '<div class="card-title">' + (esc(t.title) || '<span class="muted">（无标题）</span>') + '</div>' +
        (meta.length ? '<div class="card-meta">' + meta.join('') + '</div>' : '') +
        notes +
      '</div>';
  }

  function taskCard(t) {
    // 已完成卡片：不显示左侧勾选框、不显示限时倒计时（完成状态靠标题删除线体现）
    if (t.done) {
      return '<div class="card task done" data-edit-task="' + t.id + '">' +
          taskCardBody(t, { hideDue: true }) +
        '</div>';
    }
    return '<div class="card task" data-edit-task="' + t.id + '">' +
        '<button class="checkbox" data-toggle="' + t.id + '" aria-label="完成"></button>' +
        taskCardBody(t) +
      '</div>';
  }

  // 批量删除模式下的卡片：整张卡可点选，左侧方块表示是否选中；同样不显示倒计时
  function taskSelectCard(t, selected) {
    return '<div class="card task done' + (selected ? ' sel' : '') + '" data-select-toggle="' + t.id + '">' +
        '<button class="checkbox' + (selected ? ' on' : '') + '" tabindex="-1" aria-label="选择">' +
          (selected ? window.Icons.svg('check') : '') + '</button>' +
        taskCardBody(t, { hideDue: true }) +
      '</div>';
  }

  // 按负责人分组：人多的组排前面，未指派排最后；组内按截止日期
  function groupByAssignee(list) {
    const groups = new Map();
    list.forEach((t) => {
      const key = t.assignee || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });
    const entries = Array.from(groups.entries());
    entries.sort((a, b) => {
      if (!a[0]) return 1;            // a 未指派 → 最后
      if (!b[0]) return -1;           // b 未指派 → 最后
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0], 'zh');
    });
    const allCollapsed = entries.length > 0 && entries.every(([name]) => collapsedAssignees.has(name || ''));
    let html = '<div class="group-actions">' +
      '<button class="link-btn" data-group-collapse-all>' + (allCollapsed ? '全部展开' : '全部收起') + '</button>' +
      '</div>';
    html += entries.map(([name, items]) => {
      items.sort(sortActive);
      const key = name || '';
      const collapsed = collapsedAssignees.has(key);
      return '<div class="group' + (collapsed ? ' collapsed' : '') + '">' +
        '<button class="group-head" data-group-toggle="' + esc(key) + '">' +
          '<span class="group-caret">' + window.Icons.svg('chevron') + '</span>' +
          '<span class="group-name">' + (name ? esc(name) : '未指派') + '</span>' +
          '<span class="group-count">' + items.length + ' 项</span>' +
        '</button>' +
        (collapsed ? '' : '<div class="list">' + items.map(taskCard).join('') + '</div>') +
      '</div>';
    }).join('');
    return html;
  }

  function renderTasks() {
    const all = Store.getTasks();
    const active = all.filter((t) => !t.done);
    const done = all.filter((t) => t.done);

    // —— 已完成：批量删除（多选）模式 ——
    if (selectMode && taskFilter === 'done') {
      const list = done.slice().sort((a, b) => new Date(b.doneAt) - new Date(a.doneAt));
      const selCount = list.filter((t) => selectedIds.has(t.id)).length;
      const allSel = list.length > 0 && selCount === list.length;
      let h = '<div class="select-bar">' +
        '<button class="text-btn" data-select-cancel>取消</button>' +
        '<button class="text-btn" data-select-all>' + (allSel ? '取消全选' : '全选') + '</button>' +
        '<button class="del-selected" data-select-delete' + (selCount ? '' : ' disabled') + '>删除' + (selCount ? ' ' + selCount : '') + '</button>' +
        '</div>';
      h += '<div class="list">' + list.map((t) => taskSelectCard(t, selectedIds.has(t.id))).join('') + '</div>';
      appEl.innerHTML = h;
      return;
    }

    const base = taskFilter === 'done' ? done : active;

    let html = '';
    html += '<button class="add-btn" data-new-task>' + window.Icons.svg('plus') + '新建任务</button>';
    html += '<div class="chips-row">' +
      '<button class="filter' + (taskFilter === 'active' ? ' on' : '') + '" data-filter="active">进行中 ' + active.length + '</button>' +
      '<button class="filter' + (taskFilter === 'done' ? ' on' : '') + '" data-filter="done">已完成 ' + done.length + '</button>' +
      '</div>';
    html += '<div class="chips-row sort-row">' +
      '<span class="sort-label">排序</span>' +
      '<button class="filter' + (taskSort === 'due' ? ' on' : '') + '" data-sort="due">截止日期</button>' +
      '<button class="filter' + (taskSort === 'assignee' ? ' on' : '') + '" data-sort="assignee">负责人</button>' +
      '</div>';

    if (!base.length) {
      html += '<div class="empty">' +
        (taskFilter === 'done' ? '还没有已完成的任务。' : '暂无进行中的任务，点上方「新建任务」添加。') +
        '</div>';
    } else if (taskFilter === 'done') {
      // 已完成列表顶部放「批量删除」入口
      html += '<div class="done-actions"><button class="link-btn" data-select-start>批量删除</button></div>';
      if (taskSort === 'assignee') {
        html += groupByAssignee(base);
      } else {
        const list = base.slice().sort((a, b) => new Date(b.doneAt) - new Date(a.doneAt));
        html += '<div class="list">' + list.map(taskCard).join('') + '</div>';
      }
    } else if (taskSort === 'assignee') {
      html += groupByAssignee(base);
    } else {
      const list = base.slice().sort(sortActive);
      html += '<div class="list">' + list.map(taskCard).join('') + '</div>';
    }
    appEl.innerHTML = html;
  }

  /* ---------------- 速记页 ---------------- */
  function noteCard(n) {
    const title = n.title || (n.body.split('\n')[0] || '（空速记）');
    const preview = n.title ? n.body : n.body.split('\n').slice(1).join('\n');
    return '' +
      '<div class="card note" data-edit-note="' + n.id + '">' +
        '<div class="card-body">' +
          '<div class="card-title">' + esc(title) + '</div>' +
          (preview ? '<div class="card-notes">' + nl2br(preview) + '</div>' : '') +
          '<div class="card-time">' + relTime(n.updatedAt) + '</div>' +
        '</div>' +
      '</div>';
  }

  function renderNotes() {
    const notes = Store.getNotes().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    let html = '<button class="add-btn" data-new-note>' + window.Icons.svg('plus') + '新建速记</button>';
    if (!notes.length) {
      html += '<div class="empty">还没有速记，点上方「新建速记」记一笔。</div>';
    } else {
      html += '<div class="list">' + notes.map(noteCard).join('') + '</div>';
    }
    appEl.innerHTML = html;
  }

  /* ---------------- 设置页 ---------------- */
  function renderSettings() {
    const c = Store.counts();
    appEl.innerHTML = '' +
      '<div class="section">' +
        '<div class="section-title">备份</div>' +
        '<button class="row-btn" data-export>' + ico('download') + '<span>导出备份（下载 JSON）</span></button>' +
        '<button class="row-btn" data-import>' + ico('upload') + '<span>导入备份（从 JSON 恢复）</span></button>' +
        '<input type="file" id="import-file" accept="application/json,.json" hidden />' +
      '</div>' +
      '<div class="section">' +
        '<div class="section-title">更新</div>' +
        '<button class="row-btn" data-check-update>' + ico('refresh') + '<span>检查更新</span></button>' +
        '<div class="hint">当前版本 ' + APP_VERSION + '。联网时一般会自动更新；若没更新到，点这里手动拉取最新版（无需卸载主屏图标）。</div>' +
      '</div>' +
      '<div class="section">' +
        '<div class="section-title">数据</div>' +
        '<div class="hint">当前：' + c.tasks + ' 项任务 · ' + c.notes + ' 条速记。<br>' +
          '所有数据只保存在本机此应用里，不会上传任何服务器。卸载应用或清除浏览器数据会丢失，建议定期导出备份。</div>' +
        '<button class="row-btn danger" data-clear>' + ico('trash') + '<span>清空所有数据</span></button>' +
      '</div>' +
      '<div class="about">工作备忘 · 本地版 · ' + APP_VERSION + '</div>';
  }

  /* ---------------- 编辑弹层 ---------------- */
  // iOS 软键盘是盖在页面上的，不会顶起布局。用 VisualViewport 把弹层收进
  // 「键盘上方的可见区域」，这样表单始终浮在键盘之上，不会被挡。
  function syncSheetVV() {
    const vv = window.visualViewport;
    if (!vv) return;
    sheetEl.style.top = vv.offsetTop + 'px';
    sheetEl.style.height = vv.height + 'px';
    sheetEl.style.bottom = 'auto';
  }
  function openSheet(innerHTML) {
    sheetEl.innerHTML = '<div class="sheet">' + innerHTML + '</div>';
    sheetEl.hidden = false;
    window.Icons.paint(sheetEl);
    requestAnimationFrame(() => sheetEl.classList.add('open'));
    if (window.visualViewport) {
      syncSheetVV();
      window.visualViewport.addEventListener('resize', syncSheetVV);
      window.visualViewport.addEventListener('scroll', syncSheetVV);
    }
  }
  function closeSheet() {
    sheetEl.classList.remove('open');
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', syncSheetVV);
      window.visualViewport.removeEventListener('scroll', syncSheetVV);
    }
    setTimeout(() => {
      sheetEl.hidden = true;
      sheetEl.innerHTML = '';
      sheetEl.style.top = sheetEl.style.height = sheetEl.style.bottom = '';
    }, 200);
  }
  // 聚焦输入框，并在键盘弹出后把它滚进可见区域（确保看得到光标）
  function focusField(el) {
    if (!el) return;
    el.focus();
    setTimeout(() => { try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {} }, 250);
  }

  function taskEditor(task, opts) {
    opts = opts || {};
    const t = task || opts.seed || { title: '', assignee: '', due: '', notes: '' };
    const editing = !!task;
    openSheet('' +
      '<div class="sheet-head">' +
        '<button class="icon-btn" data-cancel>' + ico('close') + '</button>' +
        '<span>' + (editing ? '编辑任务' : '新建任务') + '</span>' +
        '<button class="text-btn" data-save-task>保存</button>' +
      '</div>' +
      '<label class="field"><span>标题</span>' +
        '<input id="f-title" type="text" placeholder="要做的事" value="' + esc(t.title) + '" /></label>' +
      '<label class="field"><span>负责人</span>' +
        '<input id="f-assignee" type="text" placeholder="谁负责" value="' + esc(t.assignee) + '" /></label>' +
      '<label class="field"><span>截止日期</span>' +
        '<input id="f-due" type="date" value="' + esc(t.due) + '" /></label>' +
      '<div class="quick-due">' +
        '<button data-due="0">今天</button><button data-due="1">明天</button>' +
        '<button data-due="3">+3天</button><button data-due="7">+7天</button>' +
        '<button data-due="clear">清除</button>' +
      '</div>' +
      '<label class="field"><span>备注（可自由编辑）</span>' +
        '<textarea id="f-notes" rows="4" placeholder="补充说明…">' + esc(t.notes) + '</textarea></label>' +
      (editing
        ? (task.done
            ? '<button class="row-btn" data-restore-task>' + ico('undo') + '<span>恢复为任务（取消完成）</span></button>'
            : '<button class="row-btn danger" data-del-task>' + ico('trash') + '<span>删除任务</span></button>')
        : ''));

    const dueInput = sheetEl.querySelector('#f-due');
    sheetEl.querySelectorAll('.quick-due button').forEach((b) => {
      b.addEventListener('click', () => {
        const v = b.getAttribute('data-due');
        if (v === 'clear') { dueInput.value = ''; return; }
        const d = startOfToday();
        d.setDate(d.getDate() + Number(v));
        dueInput.value = toInputDate(d);
      });
    });
    focusField(sheetEl.querySelector('#f-title'));

    function save() {
      const fields = {
        title: sheetEl.querySelector('#f-title').value,
        assignee: sheetEl.querySelector('#f-assignee').value,
        due: sheetEl.querySelector('#f-due').value,
        notes: sheetEl.querySelector('#f-notes').value,
      };
      if (!fields.title.trim() && !fields.notes.trim()) { closeSheet(); return; }
      if (editing) {
        Store.updateTask(task.id, fields);
      } else {
        Store.addTask(fields);
        if (opts.fromNoteId) Store.removeNote(opts.fromNoteId); // 速记转任务：成功保存后删掉原速记
      }
      closeSheet();
      if (opts.switchToTasks) currentView = 'tasks';
      render();
    }
    sheetEl.querySelector('[data-save-task]').addEventListener('click', save);
    sheetEl.querySelector('[data-cancel]').addEventListener('click', closeSheet);
    const del = sheetEl.querySelector('[data-del-task]');
    if (del) del.addEventListener('click', () => {
      if (confirm('删除这条任务？')) { Store.removeTask(task.id); closeSheet(); render(); }
    });
    const restore = sheetEl.querySelector('[data-restore-task]');
    if (restore) restore.addEventListener('click', () => {
      Store.updateTask(task.id, { done: false }); // 取消完成状态，移回进行中
      taskFilter = 'active';                       // 切到「进行中」让用户看到它已移回
      closeSheet();
      render();
    });
  }

  function noteEditor(note) {
    const n = note || { title: '', body: '' };
    const editing = !!note;
    openSheet('' +
      '<div class="sheet-head">' +
        '<button class="icon-btn" data-cancel>' + ico('close') + '</button>' +
        '<span>' + (editing ? '编辑速记' : '新建速记') + '</span>' +
        '<button class="text-btn" data-save-note>保存</button>' +
      '</div>' +
      '<label class="field"><span>标题（可留空）</span>' +
        '<input id="n-title" type="text" placeholder="标题" value="' + esc(n.title) + '" /></label>' +
      '<label class="field"><span>内容</span>' +
        '<textarea id="n-body" rows="5" placeholder="随手记…">' + esc(n.body) + '</textarea></label>' +
      (editing ? '<button class="row-btn" data-to-task>' + ico('check') + '<span>转为任务</span></button>' : '') +
      (editing ? '<button class="row-btn danger" data-del-note>' + ico('trash') + '<span>删除速记</span></button>' : ''));

    focusField(sheetEl.querySelector('#n-body'));

    const toTask = sheetEl.querySelector('[data-to-task]');
    if (toTask) toTask.addEventListener('click', () => {
      const title = sheetEl.querySelector('#n-title').value;
      const body = sheetEl.querySelector('#n-body').value;
      // 标题为空时用正文首行当任务标题，其余正文进任务备注
      const seedTitle = (title.trim() || body.split('\n')[0] || '').trim();
      const seedNotes = (title.trim() ? body : body.split('\n').slice(1).join('\n')).trim();
      if (!seedTitle && !seedNotes) return; // 空速记不转
      taskEditor(null, {
        seed: { title: seedTitle, assignee: '', due: '', notes: seedNotes },
        fromNoteId: note.id,   // 任务保存成功后才删掉这条速记；取消则速记保留
        switchToTasks: true,
      });
    });

    function save() {
      const fields = {
        title: sheetEl.querySelector('#n-title').value,
        body: sheetEl.querySelector('#n-body').value,
      };
      if (!fields.title.trim() && !fields.body.trim()) { closeSheet(); return; }
      if (editing) Store.updateNote(note.id, fields); else Store.addNote(fields);
      closeSheet();
      render();
    }
    sheetEl.querySelector('[data-save-note]').addEventListener('click', save);
    sheetEl.querySelector('[data-cancel]').addEventListener('click', closeSheet);
    const del = sheetEl.querySelector('[data-del-note]');
    if (del) del.addEventListener('click', () => {
      if (confirm('删除这条速记？')) { Store.removeNote(note.id); closeSheet(); render(); }
    });
  }

  /* ---------------- 备份导入导出 ---------------- */
  function doExport() {
    const blob = new Blob([Store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = url;
    a.download = '工作备忘-备份-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function doImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        JSON.parse(reader.result); // 校验
        const merge = confirm('点「确定」= 合并到现有数据；点「取消」= 覆盖现有数据。');
        Store.importData(reader.result, merge ? 'merge' : 'replace');
        render();
        alert('导入完成。');
      } catch (e) {
        alert('导入失败：不是有效的备份文件。');
      }
    };
    reader.readAsText(file);
  }

  /* ---------------- 手动检查更新 ---------------- */
  // 主动拉取新版 Service Worker + 清掉旧缓存再刷新，强制用上最新版本。
  function checkForUpdate(btn) {
    if (!navigator.onLine) { alert('需要联网才能检查更新。'); return; }
    if (btn) { btn.disabled = true; const s = btn.querySelector('span'); if (s) s.textContent = '正在检查更新…'; }
    Promise.resolve()
      .then(() => ('serviceWorker' in navigator) ? navigator.serviceWorker.getRegistration() : null)
      .then((reg) => reg ? reg.update() : null)               // 有新版 SW 就拉下来
      .then(() => window.caches ? caches.keys() : [])
      .then((keys) => Promise.all((keys || []).map((k) => caches.delete(k)))) // 清旧缓存
      .catch(() => {})
      .then(() => location.reload());                          // 联网刷新 → 取到最新文件
  }

  /* ---------------- 事件委托 ---------------- */
  appEl.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle],[data-edit-task],[data-edit-note],[data-new-task],[data-new-note],[data-filter],[data-sort],[data-group-toggle],[data-group-collapse-all],[data-select-start],[data-select-cancel],[data-select-all],[data-select-toggle],[data-select-delete],[data-export],[data-import],[data-clear],[data-check-update]');
    if (!t) return;

    if (t.hasAttribute('data-toggle')) {
      e.stopPropagation();
      const id = t.getAttribute('data-toggle');
      const task = Store.getTasks().find((x) => x.id === id);
      Store.updateTask(id, { done: !task.done });
      render();
      return;
    }
    if (t.hasAttribute('data-new-task')) return taskEditor(null);
    if (t.hasAttribute('data-new-note')) return noteEditor(null);
    if (t.hasAttribute('data-edit-task')) {
      const task = Store.getTasks().find((x) => x.id === t.getAttribute('data-edit-task'));
      if (task) taskEditor(task);
      return;
    }
    if (t.hasAttribute('data-edit-note')) {
      const note = Store.getNotes().find((x) => x.id === t.getAttribute('data-edit-note'));
      if (note) noteEditor(note);
      return;
    }
    if (t.hasAttribute('data-filter')) { taskFilter = t.getAttribute('data-filter'); exitSelect(); render(); return; }
    if (t.hasAttribute('data-sort')) { taskSort = t.getAttribute('data-sort'); render(); return; }
    if (t.hasAttribute('data-group-toggle')) {
      const key = t.getAttribute('data-group-toggle');
      if (collapsedAssignees.has(key)) collapsedAssignees.delete(key); else collapsedAssignees.add(key);
      render();
      return;
    }
    if (t.hasAttribute('data-group-collapse-all')) {
      const src = Store.getTasks().filter((x) => taskFilter === 'done' ? x.done : !x.done);
      const keys = Array.from(new Set(src.map((x) => x.assignee || '')));
      const allCollapsed = keys.length > 0 && keys.every((k) => collapsedAssignees.has(k));
      keys.forEach((k) => { if (allCollapsed) collapsedAssignees.delete(k); else collapsedAssignees.add(k); });
      render();
      return;
    }
    if (t.hasAttribute('data-select-start')) { selectMode = true; selectedIds = new Set(); render(); return; }
    if (t.hasAttribute('data-select-cancel')) { exitSelect(); render(); return; }
    if (t.hasAttribute('data-select-all')) {
      const doneIds = Store.getTasks().filter((x) => x.done).map((x) => x.id);
      const allSel = doneIds.length > 0 && doneIds.every((id) => selectedIds.has(id));
      selectedIds = new Set(allSel ? [] : doneIds);
      render();
      return;
    }
    if (t.hasAttribute('data-select-toggle')) {
      const id = t.getAttribute('data-select-toggle');
      if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
      render();
      return;
    }
    if (t.hasAttribute('data-select-delete')) {
      const ids = Array.from(selectedIds);
      if (!ids.length) return;
      if (confirm('确定删除选中的 ' + ids.length + ' 项已完成任务？此操作不可恢复（建议先在「设置」导出备份）。')) {
        ids.forEach((id) => Store.removeTask(id));
        exitSelect();
        render();
      }
      return;
    }
    if (t.hasAttribute('data-check-update')) return checkForUpdate(t);
    if (t.hasAttribute('data-export')) return doExport();
    if (t.hasAttribute('data-import')) { appEl.querySelector('#import-file').click(); return; }
    if (t.hasAttribute('data-clear')) {
      if (confirm('确定清空所有任务和速记？此操作不可恢复（建议先导出备份）。')) { Store.clearAll(); render(); }
      return;
    }
  });

  appEl.addEventListener('change', (e) => {
    if (e.target.id === 'import-file' && e.target.files[0]) doImport(e.target.files[0]);
  });

  // 点背景关闭弹层
  sheetEl.addEventListener('click', (e) => { if (e.target === sheetEl) closeSheet(); });

  function exitSelect() { selectMode = false; selectedIds = new Set(); }

  /* ---------------- 标签栏 ---------------- */
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      currentView = tab.getAttribute('data-view');
      exitSelect();
      render();
    });
  });

  function render() {
    tabs.forEach((tab) => tab.classList.toggle('on', tab.getAttribute('data-view') === currentView));
    renderHeader();
    if (currentView === 'tasks') renderTasks();
    else if (currentView === 'notes') renderNotes();
    else renderSettings();
    window.Icons.paint(appEl);
    window.Icons.paint(document.querySelector('.tabbar'));
  }

  /* ---------------- 启动 ---------------- */
  render();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
})();
