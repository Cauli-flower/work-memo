/* store.js — 本地数据层。所有数据存在浏览器 localStorage，只在本机，不上传任何服务器。
 * 数据结构：{ tasks: [...], notes: [...] }
 *   task = { id, title, assignee, due (YYYY-MM-DD|''), notes, done, doneAt, createdAt, updatedAt }
 *   note = { id, title, body, createdAt, updatedAt }
 */
(function () {
  const KEY = 'work-memo-v1';

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { tasks: [], notes: [] };
      const data = JSON.parse(raw);
      return { tasks: data.tasks || [], notes: data.notes || [] };
    } catch (e) {
      console.warn('读取本地数据失败，使用空数据', e);
      return { tasks: [], notes: [] };
    }
  }

  let state = load();

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert('保存失败：本地存储空间可能已满。');
      console.error(e);
    }
  }

  const nowISO = () => new Date().toISOString();

  /* ---------- 任务 ---------- */
  function getTasks() {
    return state.tasks.slice();
  }

  function addTask(fields) {
    const t = {
      id: uid(),
      title: (fields.title || '').trim(),
      assignee: (fields.assignee || '').trim(),
      due: fields.due || '',
      notes: (fields.notes || '').trim(),
      done: false,
      doneAt: '',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    state.tasks.push(t);
    persist();
    return t;
  }

  function updateTask(id, fields) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return null;
    if ('title' in fields) t.title = (fields.title || '').trim();
    if ('assignee' in fields) t.assignee = (fields.assignee || '').trim();
    if ('due' in fields) t.due = fields.due || '';
    if ('notes' in fields) t.notes = (fields.notes || '').trim();
    if ('done' in fields) {
      t.done = !!fields.done;
      t.doneAt = t.done ? nowISO() : '';
    }
    t.updatedAt = nowISO();
    persist();
    return t;
  }

  function removeTask(id) {
    state.tasks = state.tasks.filter((x) => x.id !== id);
    persist();
  }

  /* ---------- 速记 ---------- */
  function getNotes() {
    return state.notes.slice();
  }

  function addNote(fields) {
    const n = {
      id: uid(),
      title: (fields.title || '').trim(),
      body: (fields.body || '').trim(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    state.notes.push(n);
    persist();
    return n;
  }

  function updateNote(id, fields) {
    const n = state.notes.find((x) => x.id === id);
    if (!n) return null;
    if ('title' in fields) n.title = (fields.title || '').trim();
    if ('body' in fields) n.body = (fields.body || '').trim();
    n.updatedAt = nowISO();
    persist();
    return n;
  }

  function removeNote(id) {
    state.notes = state.notes.filter((x) => x.id !== id);
    persist();
  }

  /* ---------- 备份 ---------- */
  function exportData() {
    return JSON.stringify(state, null, 2);
  }

  function importData(json, mode) {
    // mode: 'replace' 覆盖 | 'merge' 合并
    const incoming = JSON.parse(json);
    const inTasks = incoming.tasks || [];
    const inNotes = incoming.notes || [];
    if (mode === 'merge') {
      const seenT = new Set(state.tasks.map((t) => t.id));
      const seenN = new Set(state.notes.map((n) => n.id));
      inTasks.forEach((t) => { if (!seenT.has(t.id)) state.tasks.push(t); });
      inNotes.forEach((n) => { if (!seenN.has(n.id)) state.notes.push(n); });
    } else {
      state = { tasks: inTasks, notes: inNotes };
    }
    persist();
  }

  function clearAll() {
    state = { tasks: [], notes: [] };
    persist();
  }

  function counts() {
    return {
      tasks: state.tasks.length,
      notes: state.notes.length,
    };
  }

  window.Store = {
    getTasks, addTask, updateTask, removeTask,
    getNotes, addNote, updateNote, removeNote,
    exportData, importData, clearAll, counts,
  };
})();
