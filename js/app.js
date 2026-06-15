/* app.js — 工作备忘主逻辑：任务 / 速记 / 设置 三个页面 + 编辑弹层。
 * 纯前端、纯本地，无网络请求。 */
(function () {
  const appEl = document.getElementById('app');
  const titleEl = document.getElementById('view-title');
  const subEl = document.getElementById('header-sub');
  const sheetEl = document.getElementById('sheet');
  const tabs = Array.from(document.querySelectorAll('.tab'));

  const VIEW_TITLES = { tasks: '任务', notes: '速记', settings: '设置' };
  let currentView = 'tasks';
  let taskFilter = 'active'; // active | done

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

  function taskCard(t) {
    const di = dueInfo(t.due);
    const meta = [];
    if (t.assignee) meta.push('<span class="chip">' + ico('person') + esc(t.assignee) + '</span>');
    if (di) meta.push('<span class="chip due-' + di.cls + '">' + ico('clock') + esc(di.label) + '</span>');
    const notes = t.notes
      ? '<div class="card-notes">' + nl2br(t.notes) + '</div>' : '';
    return '' +
      '<div class="card task' + (t.done ? ' done' : '') + '" data-edit-task="' + t.id + '">' +
        '<button class="checkbox' + (t.done ? ' on' : '') + '" data-toggle="' + t.id + '" aria-label="完成">' +
          (t.done ? window.Icons.svg('check') : '') + '</button>' +
        '<div class="card-body">' +
          '<div class="card-title">' + (esc(t.title) || '<span class="muted">（无标题）</span>') + '</div>' +
          (meta.length ? '<div class="card-meta">' + meta.join('') + '</div>' : '') +
          notes +
        '</div>' +
      '</div>';
  }

  function renderTasks() {
    const all = Store.getTasks();
    const active = all.filter((t) => !t.done).sort(sortActive);
    const done = all.filter((t) => t.done).sort((a, b) => new Date(b.doneAt) - new Date(a.doneAt));
    const list = taskFilter === 'done' ? done : active;

    let html = '';
    html += '<button class="add-btn" data-new-task>' + window.Icons.svg('plus') + '新建任务</button>';
    html += '<div class="chips-row">' +
      '<button class="filter' + (taskFilter === 'active' ? ' on' : '') + '" data-filter="active">进行中 ' + active.length + '</button>' +
      '<button class="filter' + (taskFilter === 'done' ? ' on' : '') + '" data-filter="done">已完成 ' + done.length + '</button>' +
      '</div>';

    if (!list.length) {
      html += '<div class="empty">' +
        (taskFilter === 'done' ? '还没有已完成的任务。' : '暂无进行中的任务，点上方「新建任务」添加。') +
        '</div>';
    } else {
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
        '<div class="section-title">数据</div>' +
        '<div class="hint">当前：' + c.tasks + ' 项任务 · ' + c.notes + ' 条速记。<br>' +
          '所有数据只保存在本机此应用里，不会上传任何服务器。卸载应用或清除浏览器数据会丢失，建议定期导出备份。</div>' +
        '<button class="row-btn danger" data-clear>' + ico('trash') + '<span>清空所有数据</span></button>' +
      '</div>' +
      '<div class="about">工作备忘 · 本地版</div>';
  }

  /* ---------------- 编辑弹层 ---------------- */
  function openSheet(innerHTML) {
    sheetEl.innerHTML = '<div class="sheet">' + innerHTML + '</div>';
    sheetEl.hidden = false;
    window.Icons.paint(sheetEl);
    requestAnimationFrame(() => sheetEl.classList.add('open'));
  }
  function closeSheet() {
    sheetEl.classList.remove('open');
    setTimeout(() => { sheetEl.hidden = true; sheetEl.innerHTML = ''; }, 200);
  }

  function taskEditor(task) {
    const t = task || { title: '', assignee: '', due: '', notes: '' };
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
      (editing ? '<button class="row-btn danger" data-del-task>' + ico('trash') + '<span>删除任务</span></button>' : ''));

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
    sheetEl.querySelector('#f-title').focus();

    function save() {
      const fields = {
        title: sheetEl.querySelector('#f-title').value,
        assignee: sheetEl.querySelector('#f-assignee').value,
        due: sheetEl.querySelector('#f-due').value,
        notes: sheetEl.querySelector('#f-notes').value,
      };
      if (!fields.title.trim() && !fields.notes.trim()) { closeSheet(); return; }
      if (editing) Store.updateTask(task.id, fields); else Store.addTask(fields);
      closeSheet();
      render();
    }
    sheetEl.querySelector('[data-save-task]').addEventListener('click', save);
    sheetEl.querySelector('[data-cancel]').addEventListener('click', closeSheet);
    const del = sheetEl.querySelector('[data-del-task]');
    if (del) del.addEventListener('click', () => {
      if (confirm('删除这条任务？')) { Store.removeTask(task.id); closeSheet(); render(); }
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
        '<textarea id="n-body" rows="10" placeholder="随手记…">' + esc(n.body) + '</textarea></label>' +
      (editing ? '<button class="row-btn danger" data-del-note>' + ico('trash') + '<span>删除速记</span></button>' : ''));

    sheetEl.querySelector('#n-body').focus();

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

  /* ---------------- 事件委托 ---------------- */
  appEl.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle],[data-edit-task],[data-edit-note],[data-new-task],[data-new-note],[data-filter],[data-export],[data-import],[data-clear]');
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
    if (t.hasAttribute('data-filter')) { taskFilter = t.getAttribute('data-filter'); render(); return; }
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

  /* ---------------- 标签栏 ---------------- */
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      currentView = tab.getAttribute('data-view');
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
