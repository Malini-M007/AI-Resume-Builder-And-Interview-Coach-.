const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.page-view');
const breadcrumb = document.getElementById('breadcrumbCurrent');
const toast = document.getElementById('toast');
let dashboardData = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 3200);
}

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

function renderDashboard(data) {
  dashboardData = data;
  const metricValues = document.querySelectorAll('.metric-card > strong');
  if (metricValues[0]) metricValues[0].innerHTML = `${data.metrics.profileStrength}<span>%</span>`;
  if (metricValues[1]) metricValues[1].textContent = data.metrics.applications;
  if (metricValues[2]) metricValues[2].textContent = String(data.metrics.coachSessions).padStart(2, '0');
  const resumeTitles = document.querySelectorAll('.resume-info h3');
  data.resumes.slice(0, 2).forEach((resume, index) => {
    if (resumeTitles[index]) resumeTitles[index].textContent = resume.title;
  });
  const planButtons = document.querySelectorAll('.plan-item button');
  data.plan.slice(2).forEach((item, index) => {
    if (planButtons[index]) planButtons[index].dataset.planId = item.id;
  });
  const completedCount = data.plan.filter((item) => item.completed).length;
  const planProgress = document.querySelector('.plan-progress');
  if (planProgress) planProgress.textContent = `${completedCount} / ${data.plan.length} complete`;
  document.querySelectorAll('.plan-item').forEach((row, index) => {
    const item = data.plan[index];
    if (!item) return;
    row.classList.toggle('done', item.completed);
    const marker = row.querySelector(':scope > span');
    const title = row.querySelector('strong');
    const description = row.querySelector('p');
    if (marker) marker.textContent = item.completed ? '✓' : String(index + 1);
    if (title) title.textContent = item.title;
    if (description) description.textContent = item.description;
  });
}

async function loadDashboard() {
  try {
    renderDashboard(await request('/api/dashboard'));
  } catch {
    showToast('Working offline with the saved workspace preview.');
  }
}

function switchView(viewName) {
  views.forEach((view) => view.classList.toggle('active-view', view.id === `${viewName}View`));
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
  const currentItem = [...navItems].find((item) => item.dataset.view === viewName);
  breadcrumb.textContent = currentItem ? [...currentItem.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim() : 'Overview';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach((item) => {
  if (item.dataset.view) item.addEventListener('click', () => switchView(item.dataset.view));
});

document.querySelectorAll('[data-view]').forEach((item) => {
  if (!item.classList.contains('nav-item')) item.addEventListener('click', () => switchView(item.dataset.view));
});

document.getElementById('newResumeBtn').addEventListener('click', async () => {
  try {
    await request('/api/resumes', { method: 'POST', body: JSON.stringify({ title: 'New tailored resume' }) });
    await loadDashboard();
    showToast('Your new resume was saved to the workspace.');
  } catch {
    showToast('Resume preview opened. Connect the server to save it.');
  }
  switchView('resume');
});
document.getElementById('coachBtn').addEventListener('click', () => switchView('coach'));
document.getElementById('startSessionBtn').addEventListener('click', async () => {
  try {
    const result = await request('/api/coaching/session', { method: 'POST' });
    showToast(result.message);
  } catch {
    showToast('Your coaching session is ready to start.');
  }
});
document.getElementById('sessionAction').addEventListener('click', () => showToast('Preparation checklist opened.'));
document.querySelectorAll('.edit-btn').forEach((button) => button.addEventListener('click', () => showToast('Opening the resume editor.')));
document.querySelectorAll('.task-arrow, .round-arrow, .row-arrow').forEach((button) => button.addEventListener('click', () => showToast('This detail is ready to review.')));
document.querySelectorAll('.plan-item button').forEach((button) => button.addEventListener('click', async () => {
  if (!button.dataset.planId) return;
  try {
    await request(`/api/plan/${button.dataset.planId}/complete`, { method: 'PATCH' });
    await loadDashboard();
    showToast('Plan progress saved.');
  } catch {
    showToast('Plan progress could not be saved.');
  }
}));

loadDashboard();
