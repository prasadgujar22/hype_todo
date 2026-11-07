import { initAuth, isAuthReloadPending, onSessionInvalidated, reloadForAccountChange } from './auth.js';

// Do not load account data until a verified session and onboarding are ready.
const initializedUser = await initAuth();

const PROJECTS = ['Personal', 'Work', 'Ideas'];
const PRIORITIES = ['low', 'medium', 'high'];
const VIEWS = ['all', 'today', 'upcoming', 'completed'];
const SVG_NS = 'http://www.w3.org/2000/svg';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ui = {
  greeting: $('#greeting-text'),
  todayDate: $('#today-date'),
  welcomeCopy: $('#welcome-copy'),
  openCount: $('#open-count'),
  todayCount: $('#today-count'),
  completedCount: $('#completed-count'),
  progressRing: $('#progress-ring'),
  progressPercent: $('#progress-percent'),
  progressDetail: $('#progress-detail'),
  syncDot: $('#sync-dot'),
  syncText: $('#sync-text'),
  search: $('#search-input'),
  clearSearch: $('#clear-search'),
  newTask: $('#new-task'),
  projectFilter: $('#project-filter'),
  heading: $('#tasks-heading'),
  visibleCount: $('#visible-count'),
  viewDescription: $('#view-description'),
  viewButtons: $$('[data-view]'),
  viewCounts: $$('[data-view-count]'),
  projectButtons: $$('[data-project]'),
  projectCounts: $$('[data-project-count]'),
  quickForm: $('#quick-form'),
  quickTitle: $('#quick-title'),
  quickSubmit: $('#quick-submit'),
  quickDetails: $('#quick-details'),
  quickHelp: $('#quick-help'),
  quickError: $('#quick-error'),
  list: $('#task-list-region'),
  resultsAnnouncement: $('#results-announcement'),
  taskDialog: $('#task-dialog'),
  taskForm: $('#task-form'),
  dialogTitle: $('#dialog-title'),
  dialogDescription: $('#dialog-description'),
  dialogKicker: $('#dialog-kicker'),
  closeTaskDialog: $('#close-task-dialog'),
  cancelTaskDialog: $('#cancel-task-dialog'),
  taskTitle: $('#task-title'),
  taskNotes: $('#task-notes'),
  taskProject: $('#task-project'),
  taskPriority: $('#task-priority'),
  taskDue: $('#task-due'),
  saveTask: $('#save-task'),
  dialogError: $('#dialog-error'),
  deleteDialog: $('#delete-dialog'),
  deleteTaskName: $('#delete-task-name'),
  deleteError: $('#delete-error'),
  cancelDelete: $('#cancel-delete'),
  confirmDelete: $('#confirm-delete'),
  toast: $('#toast'),
  toastMessage: $('#toast-message'),
  toastAction: $('#toast-action'),
  dismissToast: $('#dismiss-toast'),
};

const state = {
  tasks: [],
  loadStatus: 'idle',
  loadError: '',
  view: 'all',
  project: 'all',
  query: '',
  today: localDateKey(new Date()),
  greeting: '',
  quickBusy: false,
  dialogBusy: false,
  dialog: null,
  deleteBusy: false,
  deleteId: null,
  deleteOpener: null,
  // Pending checkbox values let a row stay visually stable if another request
  // causes a render while its own change is still in flight.
  pending: new Map(),
  requestCount: 0,
  syncError: false,
};

let toastTimer;
let toastActionHandler = null;
const taskRequestControllers = new Set();

onSessionInvalidated(() => {
  for (const controller of taskRequestControllers) controller.abort();
  taskRequestControllers.clear();
  state.tasks = [];
  state.pending.clear();
  state.loadStatus = 'idle';
  state.loadError = '';
  state.query = '';
  state.dialog = null;
  state.deleteId = null;
  state.deleteOpener = null;
  ui.list.replaceChildren();
  ui.taskForm.reset();
  ui.quickForm.reset();
  ui.search.value = '';
  ui.deleteTaskName.textContent = '';
  ui.resultsAnnouncement.textContent = '';
  ui.toast.hidden = true;
  ui.toastMessage.textContent = '';
  clearTimeout(toastTimer);
  toastActionHandler = null;
});

function localDateKey(date) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  // setFullYear avoids Date's special handling of years 0–99.
  date.setFullYear(year, month - 1, day);
  return date;
}

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = dateFromKey(value);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function tomorrowKey() {
  const date = dateFromKey(state.today);
  date.setDate(date.getDate() + 1);
  return localDateKey(date);
}

function formatDueDate(value) {
  const date = dateFromKey(value);
  const options = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== Number(state.today.slice(0, 4))) options.year = 'numeric';
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function updateClock() {
  if (isAuthReloadPending()) return;
  const now = new Date();
  const newToday = localDateKey(now);
  const dayChanged = state.today !== newToday;
  state.today = newToday;
  const hour = now.getHours();
  const greeting = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening';
  if (state.greeting !== greeting) {
    state.greeting = greeting;
    ui.greeting.textContent = greeting;
  }
  ui.todayDate.dateTime = newToday;
  ui.todayDate.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now);
  if (dayChanged) render();
}

function isTask(task) {
  return task !== null && typeof task === 'object' && !Array.isArray(task)
    && typeof task.id === 'string' && typeof task.title === 'string'
    && typeof task.notes === 'string' && PRIORITIES.includes(task.priority)
    && (task.dueDate === null || isDateKey(task.dueDate))
    && PROJECTS.includes(task.project) && typeof task.completed === 'boolean'
    && typeof task.createdAt === 'string' && typeof task.updatedAt === 'string'
    && (task.completedAt === null || typeof task.completedAt === 'string');
}

class RequestError extends Error {}
class SessionChangedError extends Error {}

function renderSync() {
  if (isAuthReloadPending()) return;
  if (state.requestCount > 0) {
    ui.syncDot.dataset.state = 'loading';
    ui.syncText.textContent = state.loadStatus === 'loading' ? 'Connecting' : 'Saving';
  } else if (state.syncError) {
    ui.syncDot.dataset.state = 'error';
    ui.syncText.textContent = 'Sync issue';
  } else {
    ui.syncDot.dataset.state = 'ready';
    ui.syncText.textContent = 'Up to date';
  }
}

async function apiRequest(method, path, payload, validate) {
  if (isAuthReloadPending()) throw new SessionChangedError();
  state.requestCount += 1;
  renderSync();
  const controller = new AbortController();
  taskRequestControllers.add(controller);
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 25_000);
  try {
    const options = {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-Hype-User': initializedUser.id },
      signal: controller.signal,
    };
    if (payload !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(payload);
    }
    const response = await fetch(path, options);
    if (isAuthReloadPending()) throw new SessionChangedError();
    let data = null;
    if (response.status !== 204) {
      try {
        data = await response.json();
      } catch {
        if (response.ok) throw new RequestError('The server returned an unexpected response. Please try again.');
      }
    }
    if (isAuthReloadPending()) throw new SessionChangedError();
    if (!response.ok) {
      if (response.status === 409 && data?.code === 'ACCOUNT_CHANGED') {
        reloadForAccountChange();
        throw new SessionChangedError();
      }
      if (response.status === 401) throw new RequestError('Your session has ended. Reload the page to sign in again.');
      const message = typeof data?.error === 'string' && data.error.trim()
        ? data.error.trim().slice(0, 300)
        : 'The server couldn’t complete that request. Please try again.';
      throw new RequestError(message);
    }
    if (validate && !validate(data)) throw new RequestError('The server returned an unexpected response. Please try again.');
    state.syncError = false;
    return data;
  } catch (error) {
    if (isAuthReloadPending()) throw new SessionChangedError();
    state.syncError = true;
    if (timedOut) throw new RequestError('The request timed out. Refresh the page to check your list before retrying.');
    if (error instanceof RequestError) throw error;
    throw new RequestError(method === 'GET'
      ? 'Couldn’t connect. Check your connection and try again.'
      : 'Couldn’t connect. Refresh the page to check your list before retrying.');
  } finally {
    clearTimeout(timeout);
    taskRequestControllers.delete(controller);
    state.requestCount -= 1;
    renderSync();
  }
}

async function loadTasks() {
  if (isAuthReloadPending() || state.loadStatus === 'loading') return;
  state.loadStatus = 'loading';
  state.loadError = '';
  render();
  try {
    const tasks = await apiRequest('GET', '/api/tasks', undefined, (value) => Array.isArray(value) && value.every(isTask));
    if (isAuthReloadPending()) return;
    state.tasks = tasks;
    state.loadStatus = 'ready';
  } catch (error) {
    if (isAuthReloadPending()) return;
    state.loadError = error.message;
    state.loadStatus = 'error';
  }
  render();
}

function matchesProject(task, project = state.project) {
  return project === 'all' || task.project === project;
}

function matchesView(task, view = state.view) {
  if (view === 'today') return !task.completed && task.dueDate === state.today;
  if (view === 'upcoming') return !task.completed && task.dueDate !== null && task.dueDate > state.today;
  if (view === 'completed') return task.completed;
  return true;
}

function matchesSearch(task) {
  const query = state.query.trim().toLocaleLowerCase();
  if (!query) return true;
  return [task.title, task.notes, task.project, task.priority].some((value) => value.toLocaleLowerCase().includes(query));
}

function matchesCurrent(task) {
  return matchesProject(task) && matchesView(task) && matchesSearch(task);
}

function countLabel(count, singular = 'task') {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function renderOverview() {
  const ready = state.loadStatus === 'ready';
  if (!ready) {
    ui.openCount.textContent = '—';
    ui.todayCount.textContent = '—';
    ui.completedCount.textContent = '—';
    ui.progressPercent.textContent = '—';
    ui.progressDetail.textContent = state.loadStatus === 'error' ? 'Progress is unavailable right now.' : 'Your progress will show up here.';
    ui.progressRing.style.setProperty('--progress', '0%');
    ui.progressRing.setAttribute('aria-label', 'Overall progress unavailable');
    ui.welcomeCopy.textContent = 'A little space to bring your plans to life.';
    return;
  }
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.completed).length;
  const open = total - completed;
  const dueToday = state.tasks.filter((task) => !task.completed && task.dueDate === state.today).length;
  ui.openCount.textContent = String(open);
  ui.todayCount.textContent = String(dueToday);
  ui.completedCount.textContent = String(completed);
  if (!total) {
    ui.welcomeCopy.textContent = 'A little space to bring your plans to life.';
    ui.progressPercent.textContent = '—';
    ui.progressDetail.textContent = 'Add a task to see your progress.';
    ui.progressRing.style.setProperty('--progress', '0%');
    ui.progressRing.setAttribute('aria-label', 'Overall progress: no tasks yet');
  } else {
    ui.welcomeCopy.textContent = open === 0
      ? 'All clear. You’ve made space for what’s next.'
      : `You have ${countLabel(open)} to do. Take it one step at a time.`;
    const percent = Math.round((completed / total) * 100);
    ui.progressPercent.textContent = `${percent}%`;
    ui.progressDetail.textContent = `${completed} of ${countLabel(total)} completed.`;
    ui.progressRing.style.setProperty('--progress', `${percent}%`);
    ui.progressRing.setAttribute('aria-label', `Overall progress: ${completed} of ${countLabel(total)} completed, ${percent} percent`);
  }
}

function renderFilters() {
  const ready = state.loadStatus === 'ready';
  const scopedTasks = ready ? state.tasks.filter((task) => matchesProject(task)) : [];
  const viewCounts = Object.fromEntries(VIEWS.map((view) => [view, scopedTasks.filter((task) => matchesView(task, view)).length]));
  const projectCounts = { all: state.tasks.length };
  for (const project of PROJECTS) projectCounts[project] = state.tasks.filter((task) => task.project === project).length;

  ui.viewButtons.forEach((button) => {
    const view = button.dataset.view;
    button.setAttribute('aria-pressed', String(view === state.view));
    // Only the sidebar buttons have counts; the tab labels stay concise.
    if (button.classList.contains('side-link')) {
      const name = { all: 'All tasks', today: 'Today', upcoming: 'Upcoming', completed: 'Completed' }[view];
      const count = viewCounts[view];
      const detail = view === 'today' ? `${countLabel(count, 'open task')} due today` : view === 'upcoming' ? `${countLabel(count, 'open task')} due in the future` : view === 'completed' ? countLabel(count, 'completed task') : countLabel(count);
      button.setAttribute('aria-label', ready ? `${name}, ${detail}` : name);
    }
  });
  ui.viewCounts.forEach((element) => { element.textContent = ready ? String(viewCounts[element.dataset.viewCount]) : '—'; });
  ui.projectButtons.forEach((button) => {
    const project = button.dataset.project;
    const label = project === 'all' ? 'All projects' : project;
    button.setAttribute('aria-pressed', String(project === state.project));
    button.setAttribute('aria-label', ready ? `${label}, ${countLabel(projectCounts[project])}` : label);
  });
  ui.projectCounts.forEach((element) => { element.textContent = ready ? String(projectCounts[element.dataset.projectCount]) : '—'; });
  ui.projectFilter.value = state.project;
  ui.clearSearch.hidden = ui.search.value.length === 0;
}

function renderControls() {
  const ready = state.loadStatus === 'ready';
  ui.newTask.disabled = !ready;
  ui.quickTitle.disabled = !ready || state.quickBusy;
  ui.quickSubmit.disabled = !ready || state.quickBusy;
  ui.quickDetails.disabled = !ready || state.quickBusy;
  const quickProject = state.project === 'all' ? 'Personal' : state.project;
  ui.quickHelp.textContent = `Quick add: ${quickProject} · Medium priority · no due date. Choose Details for more.`;
  ui.quickSubmit.querySelector('span').textContent = state.quickBusy ? 'Adding…' : 'Add task';
}

function viewHeading() {
  const name = { all: 'All tasks', today: 'Today', upcoming: 'Upcoming', completed: 'Completed' }[state.view];
  return state.project === 'all' ? name : `${name} · ${state.project}`;
}

function viewDescription() {
  const project = state.project === 'all' ? '' : ` in ${state.project}`;
  if (state.view === 'today') return `Open tasks due today${project}.`;
  if (state.view === 'upcoming') return `Open tasks with a future due date${project}.`;
  if (state.view === 'completed') return `The tasks you’ve checked off${project}.`;
  return state.project === 'all' ? 'Everything you want to make happen, in one place.' : `Everything in ${state.project}, in one place.`;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

const ICON_PATHS = {
  check: ['M5 12.5 9.5 17 19 7'],
  edit: ['M13.8 5.2 18.8 10.2', 'M4.5 19.5 8.4 18.7 19 8.1a2.2 2.2 0 0 0-3.1-3.1L5.3 15.6l-.8 3.9Z'],
  delete: ['M4 7h16', 'M9 7V4.5h6V7', 'm18 7-.8 12a1.5 1.5 0 0 1-1.5 1.4H8.3A1.5 1.5 0 0 1 6.8 19L6 7', 'M10 10.5v6M14 10.5v6'],
  calendar: ['M7.5 3.5v4M16.5 3.5v4M4 9.5h16', 'M6 5.5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z'],
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const pathData of ICON_PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData);
    svg.append(path);
  }
  return svg;
}

function makeMeta(task) {
  const meta = makeElement('div', 'task-meta');
  const project = makeElement('span', 'task-meta-item');
  const projectDot = makeElement('span', `meta-dot ${task.project.toLowerCase()}`);
  projectDot.setAttribute('aria-hidden', 'true');
  project.append(projectDot, document.createTextNode(task.project));
  meta.append(project);

  const priority = makeElement('span', `task-meta-item priority-${task.priority}`);
  const marker = makeElement('span', 'priority-marker');
  marker.setAttribute('aria-hidden', 'true');
  priority.append(marker, document.createTextNode(`${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`));
  meta.append(priority);

  if (task.dueDate) {
    let dueText;
    let dueClass = '';
    if (!task.completed && task.dueDate < state.today) {
      dueText = `Overdue · ${formatDueDate(task.dueDate)}`;
      dueClass = ' due-overdue';
    } else if (!task.completed && task.dueDate === state.today) {
      dueText = 'Due today';
      dueClass = ' due-today';
    } else if (!task.completed && task.dueDate === tomorrowKey()) {
      dueText = 'Due tomorrow';
    } else {
      dueText = `Due ${formatDueDate(task.dueDate)}`;
    }
    const due = makeElement('span', `task-meta-item${dueClass}`);
    const dueTime = makeElement('time', '', dueText);
    dueTime.dateTime = task.dueDate;
    due.append(icon('calendar'), dueTime);
    meta.append(due);
  }
  return meta;
}

function makeTaskRow(task) {
  const pending = state.pending.get(task.id);
  const row = makeElement('li', `task-row${task.completed ? ' is-completed' : ''}`);
  row.dataset.taskId = task.id;
  if (pending) row.setAttribute('aria-busy', 'true');

  const checkLabel = makeElement('label', 'check-control');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'check-input';
  check.dataset.taskAction = 'toggle';
  check.checked = pending && typeof pending.completed === 'boolean' ? pending.completed : task.completed;
  check.disabled = Boolean(pending);
  check.setAttribute('aria-label', `${check.checked ? 'Mark as not completed' : 'Mark as completed'}: ${task.title}`);
  const visual = makeElement('span', 'check-visual');
  visual.setAttribute('aria-hidden', 'true');
  visual.append(icon('check'));
  checkLabel.append(check, visual);
  check.addEventListener('change', () => toggleTask(task.id, check.checked, check));

  const content = makeElement('div', 'task-content');
  content.append(makeElement('p', 'task-name', task.title));
  if (task.notes.trim()) content.append(makeElement('p', 'task-notes', task.notes));
  content.append(makeMeta(task));

  const actions = makeElement('div', 'task-actions');
  const edit = makeElement('button', 'icon-button');
  edit.type = 'button';
  edit.dataset.taskAction = 'edit';
  edit.setAttribute('aria-label', `Edit task: ${task.title}`);
  edit.title = 'Edit task';
  edit.disabled = Boolean(pending);
  edit.append(icon('edit'));
  edit.addEventListener('click', () => openTaskDialog('edit', task.id));

  const remove = makeElement('button', 'icon-button');
  remove.type = 'button';
  remove.dataset.taskAction = 'delete';
  remove.setAttribute('aria-label', `Delete task: ${task.title}`);
  remove.title = 'Delete task';
  remove.disabled = Boolean(pending);
  remove.append(icon('delete'));
  remove.addEventListener('click', () => openDeleteDialog(task.id));
  actions.append(edit, remove);
  row.append(checkLabel, content, actions);
  return row;
}

function sortOpenTasks(a, b) {
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const priorityDifference = priorityRank[a.priority] - priorityRank[b.priority];
  if (priorityDifference) return priorityDifference;
  return compareNewest(a.createdAt, b.createdAt) || a.id.localeCompare(b.id);
}

function compareNewest(a, b) {
  const aTime = Date.parse(a);
  const bTime = Date.parse(b);
  if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
  return b.localeCompare(a);
}

function sortCompletedTasks(a, b) {
  const aDate = a.completedAt || a.updatedAt || a.createdAt;
  const bDate = b.completedAt || b.updatedAt || b.createdAt;
  return compareNewest(aDate, bDate) || a.id.localeCompare(b.id);
}

function makeTaskGroup(title, tasks) {
  const section = makeElement('section', 'task-group');
  const heading = makeElement('h3', 'task-group-heading');
  const count = makeElement('span', 'group-count', String(tasks.length));
  count.setAttribute('aria-label', countLabel(tasks.length));
  heading.append(document.createTextNode(title), count);
  const list = makeElement('ul', 'task-items');
  tasks.forEach((task) => list.append(makeTaskRow(task)));
  section.append(heading, list);
  return section;
}

function focusDescriptor() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  const row = active.closest('[data-task-id]');
  return row && active.dataset.taskAction ? { id: row.dataset.taskId, action: active.dataset.taskAction } : null;
}

function focusTaskControl(id, action) {
  const row = [...ui.list.querySelectorAll('[data-task-id]')].find((item) => item.dataset.taskId === id);
  const target = row ? [...row.querySelectorAll('[data-task-action]')].find((item) => item.dataset.taskAction === action && !item.disabled) : null;
  (target || ui.heading).focus({ preventScroll: true });
}

function captureDialogOpener() {
  return { task: focusDescriptor(), element: document.activeElement instanceof HTMLElement ? document.activeElement : null };
}

function restoreDialogFocus(opener) {
  if (isAuthReloadPending() || ui.taskDialog.open || ui.deleteDialog.open) return;
  const active = document.activeElement;
  // Native dialog focus restoration works in the usual case. A background
  // render can remove the original row while the modal is open; recover it.
  if (active && active !== document.body && active !== document.documentElement
      && !ui.taskDialog.contains(active) && !ui.deleteDialog.contains(active)) return;
  if (opener?.task) focusTaskControl(opener.task.id, opener.task.action);
  else if (opener?.element?.isConnected && !opener.element.disabled) opener.element.focus({ preventScroll: true });
  else ui.heading.focus({ preventScroll: true });
}

function emptyState(title, description, options = {}) {
  const container = makeElement('div', 'empty-state');
  const glyph = makeElement('span', `empty-icon${options.error ? ' error' : ''}`, options.error ? '!' : '✳');
  glyph.setAttribute('aria-hidden', 'true');
  container.append(glyph, makeElement('h3', '', title), makeElement('p', '', description));
  if (options.actionLabel && options.action) {
    const button = makeElement('button', `button ${options.error ? 'button-secondary' : 'button-primary'}`, options.actionLabel);
    button.type = 'button';
    button.addEventListener('click', options.action);
    container.append(button);
  }
  return container;
}

function makeEmptyResult() {
  if (state.query.trim()) {
    return emptyState('No matches found.', 'Try another search, or clear it to see more of your list.', {
      actionLabel: 'Clear search', action: clearSearch,
    });
  }
  if (state.view === 'today') {
    return emptyState('Nothing due today.', 'Open tasks due today will show up here. Enjoy a little breathing room.', {
      actionLabel: 'View all tasks', action: viewAllInCurrentProject,
    });
  }
  if (state.view === 'upcoming') {
    return emptyState('Nothing coming up.', 'Open tasks with a future due date will appear here.', {
      actionLabel: 'View all tasks', action: viewAllInCurrentProject,
    });
  }
  if (state.view === 'completed') {
    return emptyState('A fresh start.', 'When you complete a task, it will land here as a little win.', {
      actionLabel: 'View all tasks', action: viewAllInCurrentProject,
    });
  }
  if (state.project !== 'all') {
    return emptyState(`No ${state.project} tasks yet.`, 'Add a task or assign an existing one to this project.', {
      actionLabel: 'Add a task', action: () => openTaskDialog('create'),
    });
  }
  return emptyState('A little room to start.', 'Your list is empty. Add the first thing you’d like to make happen.', {
    actionLabel: 'Create your first task', action: () => openTaskDialog('create'),
  });
}

function renderTaskList() {
  const focus = focusDescriptor();
  const ready = state.loadStatus === 'ready';
  ui.heading.textContent = viewHeading();
  ui.viewDescription.textContent = viewDescription();
  ui.list.setAttribute('aria-busy', String(state.loadStatus === 'loading' || state.loadStatus === 'idle'));
  if (!ready) {
    ui.visibleCount.textContent = '—';
    ui.visibleCount.setAttribute('aria-label', 'Task count unavailable');
    ui.resultsAnnouncement.textContent = '';
    if (state.loadStatus === 'error') {
      ui.list.replaceChildren(emptyState('Couldn’t load your tasks.', state.loadError || 'Please check your connection and try again.', {
        error: true,
        actionLabel: 'Try again',
        action: async () => {
          await loadTasks();
          if (document.activeElement === document.body) ui.heading.focus({ preventScroll: true });
        },
      }));
    } else {
      const loading = makeElement('div', 'loading-state');
      loading.setAttribute('role', 'status');
      const orbit = makeElement('span', 'loading-orbit');
      orbit.setAttribute('aria-hidden', 'true');
      loading.append(orbit, makeElement('span', '', 'Getting your tasks ready...'));
      ui.list.replaceChildren(loading);
    }
    return;
  }

  const visible = state.tasks.filter(matchesCurrent);
  ui.visibleCount.textContent = String(visible.length);
  ui.visibleCount.setAttribute('aria-label', `${countLabel(visible.length)} shown`);
  ui.resultsAnnouncement.textContent = `Showing ${countLabel(visible.length)} in ${viewHeading()}.`;
  if (!visible.length) {
    ui.list.replaceChildren(makeEmptyResult());
  } else {
    const open = visible.filter((task) => !task.completed).sort(sortOpenTasks);
    const completed = visible.filter((task) => task.completed).sort(sortCompletedTasks);
    const groups = [];
    if (open.length) groups.push(makeTaskGroup('TO DO', open));
    if (completed.length) groups.push(makeTaskGroup('COMPLETED', completed));
    ui.list.replaceChildren(...groups);
  }
  if (focus) focusTaskControl(focus.id, focus.action);
}

function render() {
  if (isAuthReloadPending()) return;
  renderOverview();
  renderFilters();
  renderControls();
  renderTaskList();
}

function setView(view) {
  if (!VIEWS.includes(view)) return;
  state.view = view;
  render();
}

function setProject(project) {
  if (project !== 'all' && !PROJECTS.includes(project)) return;
  state.project = project;
  render();
}

function viewAllInCurrentProject() {
  setView('all');
  ui.heading.focus({ preventScroll: true });
}

function clearSearch() {
  ui.search.value = '';
  state.query = '';
  render();
  ui.search.focus();
}

function clearAllFilters() {
  state.project = 'all';
  state.view = 'all';
  state.query = '';
  ui.search.value = '';
  render();
  hideToast();
  ui.heading.focus({ preventScroll: true });
}

function hideToast() {
  const hadFocus = ui.toast.contains(document.activeElement);
  clearTimeout(toastTimer);
  ui.toast.hidden = true;
  toastActionHandler = null;
  if (hadFocus) ui.heading.focus({ preventScroll: true });
}

function scheduleToastDismiss() {
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (ui.toast.contains(document.activeElement)) scheduleToastDismiss();
    else hideToast();
  }, 8000);
}

function showToast(message, options = {}) {
  if (isAuthReloadPending()) return;
  ui.toast.dataset.kind = options.error ? 'error' : 'success';
  ui.toastMessage.textContent = message;
  toastActionHandler = options.action || null;
  ui.toastAction.hidden = !toastActionHandler;
  ui.toastAction.textContent = options.actionLabel || 'Show all';
  ui.toast.hidden = false;
  scheduleToastDismiss();
}

function showCreatedToast(task, verb) {
  if (matchesCurrent(task)) {
    showToast(verb === 'added' ? 'Task added. You’ve got this.' : 'Task updated.');
  } else {
    showToast(`Task ${verb}, but hidden by your current filters.`, { action: clearAllFilters, actionLabel: 'Show all' });
  }
}

function setQuickError(message, invalidTitle = false) {
  ui.quickError.textContent = message;
  ui.quickError.hidden = !message;
  if (invalidTitle) ui.quickTitle.setAttribute('aria-invalid', 'true');
  else ui.quickTitle.removeAttribute('aria-invalid');
}

function setDialogError(message, invalidControl = null) {
  ui.dialogError.textContent = message;
  ui.dialogError.hidden = !message;
  [ui.taskTitle, ui.taskDue, ui.taskProject, ui.taskPriority].forEach((control) => control.removeAttribute('aria-invalid'));
  if (invalidControl) invalidControl.setAttribute('aria-invalid', 'true');
}

function setDialogBusy(busy) {
  state.dialogBusy = busy;
  [...ui.taskForm.elements].forEach((control) => { control.disabled = busy; });
  ui.closeTaskDialog.disabled = busy;
  ui.saveTask.textContent = busy ? 'Saving…' : state.dialog?.mode === 'edit' ? 'Save changes' : 'Create task';
}

function openTaskDialog(mode, id = null, fromQuick = false) {
  if (state.loadStatus !== 'ready' || state.dialogBusy || ui.taskDialog.open || ui.deleteDialog.open) return;
  const task = mode === 'edit' ? state.tasks.find((item) => item.id === id) : null;
  if (mode === 'edit' && (!task || state.pending.has(id))) return;
  const quickValue = fromQuick ? ui.quickTitle.value : '';
  state.dialog = { mode, id, fromQuick, quickValue, opener: captureDialogOpener() };
  ui.taskForm.reset();
  setDialogError('');
  ui.dialogKicker.textContent = mode === 'edit' ? 'EDIT TASK' : 'NEW TASK';
  ui.dialogTitle.textContent = mode === 'edit' ? 'Edit task.' : 'Make it happen.';
  ui.dialogDescription.textContent = mode === 'edit' ? 'Update the details whenever you need to.' : 'Give your idea a little structure.';
  ui.taskTitle.value = task ? task.title : quickValue;
  ui.taskNotes.value = task ? task.notes : '';
  ui.taskProject.value = task ? task.project : state.project === 'all' ? 'Personal' : state.project;
  ui.taskPriority.value = task ? task.priority : 'medium';
  ui.taskDue.value = task?.dueDate || '';
  setDialogBusy(false);
  ui.taskDialog.showModal();
  ui.taskTitle.focus();
}

function closeTaskDialog() {
  if (!state.dialogBusy && ui.taskDialog.open) ui.taskDialog.close();
}

function replaceTask(task) {
  const index = state.tasks.findIndex((item) => item.id === task.id);
  if (index < 0) state.tasks.push(task);
  else state.tasks[index] = task;
}

function taskPath(id) {
  return `/api/tasks/${encodeURIComponent(id)}`;
}

async function submitQuickTask(event) {
  event.preventDefault();
  if (state.quickBusy || state.loadStatus !== 'ready') return;
  const original = ui.quickTitle.value;
  const title = original.trim();
  setQuickError('');
  if (!title) {
    setQuickError('Give your task a name to add it.', true);
    ui.quickTitle.focus();
    return;
  }
  const payload = { title, notes: '', priority: 'medium', dueDate: null, project: state.project === 'all' ? 'Personal' : state.project };
  const hadFocus = ui.quickForm.contains(document.activeElement);
  state.quickBusy = true;
  renderControls();
  try {
    const task = await apiRequest('POST', '/api/tasks', payload, isTask);
    if (isAuthReloadPending()) return;
    replaceTask(task);
    if (ui.quickTitle.value === original) ui.quickTitle.value = '';
    render();
    showCreatedToast(task, 'added');
  } catch (error) {
    if (!isAuthReloadPending()) setQuickError(error.message);
  } finally {
    state.quickBusy = false;
    if (!isAuthReloadPending()) {
      renderControls();
      if (hadFocus && document.activeElement === document.body && !ui.taskDialog.open && !ui.deleteDialog.open) ui.quickTitle.focus();
    }
  }
}

async function submitTaskDialog(event) {
  event.preventDefault();
  if (state.dialogBusy || state.loadStatus !== 'ready' || !state.dialog) return;
  setDialogError('');
  const title = ui.taskTitle.value.trim();
  if (!title) {
    setDialogError('Give your task a name.', ui.taskTitle);
    ui.taskTitle.focus();
    return;
  }
  if (!PROJECTS.includes(ui.taskProject.value)) {
    setDialogError('Choose a project.', ui.taskProject);
    ui.taskProject.focus();
    return;
  }
  if (!PRIORITIES.includes(ui.taskPriority.value)) {
    setDialogError('Choose a priority.', ui.taskPriority);
    ui.taskPriority.focus();
    return;
  }
  if (ui.taskDue.validity.badInput || (ui.taskDue.value && !isDateKey(ui.taskDue.value))) {
    setDialogError('Enter a valid due date.', ui.taskDue);
    ui.taskDue.focus();
    return;
  }
  const payload = {
    title,
    notes: ui.taskNotes.value,
    priority: ui.taskPriority.value,
    dueDate: ui.taskDue.value || null,
    project: ui.taskProject.value,
  };
  const dialog = { ...state.dialog };
  setDialogBusy(true);
  let failed = false;
  try {
    const task = dialog.mode === 'edit'
      ? await apiRequest('PATCH', taskPath(dialog.id), payload, (value) => isTask(value) && value.id === dialog.id)
      : await apiRequest('POST', '/api/tasks', payload, isTask);
    if (isAuthReloadPending()) return;
    replaceTask(task);
    if (dialog.fromQuick && ui.quickTitle.value === dialog.quickValue) {
      ui.quickTitle.value = '';
      setQuickError('');
    }
    // Restore the invoking control before the list is re-rendered, so its
    // equivalent in the new list can receive focus.
    ui.taskDialog.close();
    render();
    showCreatedToast(task, dialog.mode === 'edit' ? 'updated' : 'added');
  } catch (error) {
    if (!isAuthReloadPending()) {
      failed = true;
      setDialogError(error.message);
    }
  } finally {
    if (!isAuthReloadPending()) {
      setDialogBusy(false);
      if (failed && ui.taskDialog.open) ui.saveTask.focus();
    }
  }
}

async function toggleTask(id, completed, control) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || state.pending.has(id) || task.completed === completed) return;
  const hadFocus = document.activeElement === control;
  state.pending.set(id, { completed });
  control.setAttribute('aria-label', `${completed ? 'Mark as not completed' : 'Mark as completed'}: ${task.title}`);
  const row = control.closest('[data-task-id]');
  if (row) {
    row.setAttribute('aria-busy', 'true');
    row.querySelectorAll('input, button').forEach((element) => { element.disabled = true; });
  }
  try {
    const updated = await apiRequest('PATCH', taskPath(id), { completed }, (value) => isTask(value) && value.id === id && value.completed === completed);
    if (isAuthReloadPending()) return;
    replaceTask(updated);
    state.pending.delete(id);
    render();
    if (hadFocus && document.activeElement === document.body && !ui.taskDialog.open && !ui.deleteDialog.open) focusTaskControl(id, 'toggle');
    showToast(completed ? 'Task completed. Nice work.' : 'Task moved back to your list.');
  } catch (error) {
    if (isAuthReloadPending()) return;
    state.pending.delete(id);
    render();
    if (hadFocus && document.activeElement === document.body && !ui.taskDialog.open && !ui.deleteDialog.open) focusTaskControl(id, 'toggle');
    showToast(error.message, { error: true });
  }
}

function setDeleteBusy(busy) {
  state.deleteBusy = busy;
  ui.cancelDelete.disabled = busy;
  ui.confirmDelete.disabled = busy;
  ui.confirmDelete.textContent = busy ? 'Deleting…' : 'Delete task';
}

function openDeleteDialog(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || state.pending.has(id) || state.deleteBusy || ui.taskDialog.open || ui.deleteDialog.open) return;
  state.deleteId = id;
  state.deleteOpener = captureDialogOpener();
  ui.deleteTaskName.textContent = task.title;
  ui.deleteError.textContent = '';
  ui.deleteError.hidden = true;
  setDeleteBusy(false);
  ui.deleteDialog.showModal();
  ui.cancelDelete.focus();
}

async function confirmDelete() {
  const id = state.deleteId;
  if (id === null || state.deleteBusy || !state.tasks.some((task) => task.id === id)) return;
  ui.deleteError.textContent = '';
  ui.deleteError.hidden = true;
  setDeleteBusy(true);
  let failed = false;
  try {
    await apiRequest('DELETE', taskPath(id));
    if (isAuthReloadPending()) return;
    state.tasks = state.tasks.filter((task) => task.id !== id);
    ui.deleteDialog.close();
    render();
    showToast('Task deleted.');
  } catch (error) {
    if (!isAuthReloadPending()) {
      failed = true;
      ui.deleteError.textContent = error.message;
      ui.deleteError.hidden = false;
    }
  } finally {
    if (!isAuthReloadPending()) {
      setDeleteBusy(false);
      if (failed && ui.deleteDialog.open) ui.confirmDelete.focus();
    }
  }
}

ui.viewButtons.forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
ui.projectButtons.forEach((button) => button.addEventListener('click', () => setProject(button.dataset.project)));
ui.projectFilter.addEventListener('change', () => setProject(ui.projectFilter.value));
ui.search.addEventListener('input', () => { state.query = ui.search.value; render(); });
ui.clearSearch.addEventListener('click', clearSearch);
ui.newTask.addEventListener('click', () => openTaskDialog('create'));
ui.quickDetails.addEventListener('click', () => openTaskDialog('create', null, true));
ui.quickForm.addEventListener('submit', submitQuickTask);
ui.quickTitle.addEventListener('input', () => setQuickError(''));
ui.taskForm.addEventListener('submit', submitTaskDialog);
ui.taskTitle.addEventListener('input', () => setDialogError(''));
ui.taskDue.addEventListener('input', () => { if (!ui.dialogError.hidden) setDialogError(''); });
ui.closeTaskDialog.addEventListener('click', closeTaskDialog);
ui.cancelTaskDialog.addEventListener('click', closeTaskDialog);
ui.taskDialog.addEventListener('cancel', (event) => { if (state.dialogBusy) event.preventDefault(); });
ui.taskDialog.addEventListener('close', () => restoreDialogFocus(state.dialog?.opener));
ui.cancelDelete.addEventListener('click', () => { if (!state.deleteBusy) ui.deleteDialog.close(); });
ui.confirmDelete.addEventListener('click', confirmDelete);
ui.deleteDialog.addEventListener('cancel', (event) => { if (state.deleteBusy) event.preventDefault(); });
ui.deleteDialog.addEventListener('close', () => restoreDialogFocus(state.deleteOpener));
ui.dismissToast.addEventListener('click', hideToast);
ui.toastAction.addEventListener('click', () => { if (toastActionHandler) toastActionHandler(); });

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.activeElement === ui.search && ui.search.value) {
    event.preventDefault();
    clearSearch();
    return;
  }
  const target = event.target;
  const isEditing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditing && !ui.taskDialog.open && !ui.deleteDialog.open) {
    event.preventDefault();
    ui.search.focus();
  }
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) updateClock(); });
setInterval(updateClock, 60_000);
updateClock();
loadTasks();
