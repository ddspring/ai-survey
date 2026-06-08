let allData = [];
let currentPage = 1;
const PAGE_SIZE = 15;
let tcbApp = null;
let authReady = false;
let adminPwd = '';

const FIELD_LABELS = {
  companyName: '单位名称', industry: '所属行业', railSub: '轨道交通细分', energySub: '新能源细分',
  department: '部门', position: '职务', contactInfo: '联系方式',
  aiDeployment: 'AI部署状态', aiDeploymentDesc: '部署简述', currentAiScenes: '已部署场景',
  aiProblems: '主要问题', corePainPoint: '核心痛点',
  networkBandwidth: '网络带宽', videoBottleneck: '视频瓶颈', edgeAiAcceptance: '边缘AI接受度',
  aiSwitchPriority: 'AI交换机看重能力', deployForm: '部署形态',
  budget: '预算', timeline: '落地时间', coopMode: '合作模式', pilotWilling: '试点意愿',
  aiConcerns: 'AI落地顾虑', expectations: '对卓越信通期待',
  submittedAt: '提交时间', id: 'ID'
};

const RATING_LABELS = {
  rail_videoAnalysis: '轨道交通-视频智能分析', rail_networkOps: '轨道交通-网络智能运维',
  rail_edgeAi: '轨道交通-边缘AI推理', rail_smartDispatch: '轨道交通-智能调度',
  rail_stationMgmt: '轨道交通-车站智慧管理', rail_disasterMonitor: '轨道交通-灾害监测',
  rail_energyMgmt: '轨道交通-智慧能源',
  energy_smartInspection: '新能源-智能巡检', energy_powerForecast: '新能源-功率预测',
  energy_videoMonitor: '新能源-视频监控', energy_faultPredict: '新能源-故障预测',
  energy_storageSched: '新能源-储能调度', energy_chargingOps: '新能源-充电桩运维',
  energy_edgeComm: '新能源-边缘通信一体化'
};

async function initCloudBase() {
  if (typeof cloudbase === 'undefined' || typeof CLOUDBASE_ENV_ID === 'undefined' || CLOUDBASE_ENV_ID === 'your-env-id') return false;
  try {
    tcbApp = cloudbase.init({ env: CLOUDBASE_ENV_ID });
    const auth = tcbApp.auth();
    await auth.anonymousAuthProvider().signIn();
    authReady = true;
    return true;
  } catch (e) {
    console.warn('CloudBase 初始化失败，将使用本地API', e);
    return false;
  }
}

async function callAPI(action, data) {
  if (authReady && tcbApp) {
    const result = await tcbApp.callFunction({ name: 'survey', data: { action, data, adminPwd } });
    return result.result;
  }
  const routes = {
    submit: { method: 'POST', url: '/api/surveys' },
    list:   { method: 'GET',  url: '/api/surveys' },
    stats:  { method: 'GET',  url: '/api/surveys/stats' },
    delete: { method: 'DELETE', url: '/api/surveys/' + (data ? data.id : '') },
    clear:  { method: 'DELETE', url: '/api/surveys' },
    export: { method: 'GET',  url: '/api/surveys/export/csv' },
  };
  const route = routes[action];
  if (!route) throw new Error('Unknown action');
  const opts = { method: route.method, headers: { 'Content-Type': 'application/json' } };
  if (action === 'submit') opts.body = JSON.stringify(data);
  const res = await fetch(route.url, opts);
  return res.json();
}

// 管理员登录
async function doLogin() {
  const pwd = document.getElementById('adminPwdInput').value.trim();
  if (!pwd) return;
  adminPwd = pwd;
  try {
    if (authReady && tcbApp) {
      const result = await tcbApp.callFunction({ name: 'survey', data: { action: 'verifyAdmin', adminPwd: pwd } });
      if (result.result && result.result.success) {
        showAdmin();
      } else {
        showLoginError();
      }
    } else {
      if (pwd === 'zx2024ai') { showAdmin(); } else { showLoginError(); }
    }
  } catch (e) { showLoginError(); }
}

function showAdmin() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('adminContent').style.display = '';
  loadData();
}

function showLoginError() {
  document.getElementById('loginError').style.display = 'block';
  document.getElementById('adminPwdInput').value = '';
  adminPwd = '';
}

document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('adminPwdInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doLogin();
});

async function loadStats() {
  try {
    const json = await callAPI('stats');
    if (!json.success) return;
    const s = json.data;
    document.getElementById('statTotal').textContent = s.total;
    document.getElementById('statToday').textContent = s.today;
    document.getElementById('statRail').textContent = s.byIndustry['轨道交通'] || 0;
    document.getElementById('statEnergy').textContent = s.byIndustry['新能源'] || 0;
  } catch (e) { console.error(e); }
}

async function loadData() {
  try {
    const json = await callAPI('list');
    if (!json.success) {
      if (json.error === '管理员密码错误') { alert('登录已过期，请重新登录'); location.reload(); }
      return;
    }
    allData = json.data;
    currentPage = 1;
    renderTable();
    loadStats();
  } catch (e) { console.error(e); }
}

function getFiltered() {
  const kw = (document.getElementById('searchBox').value || '').trim().toLowerCase();
  if (!kw) return allData;
  return allData.filter(d => (d.companyName || '').toLowerCase().includes(kw) || (d.industry || '').toLowerCase().includes(kw));
}

function renderTable() {
  const data = getFiltered();
  const tbody = document.getElementById('tableBody');
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageData = data.slice(start, start + PAGE_SIZE);
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无数据</td></tr>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  tbody.innerHTML = pageData.map((d, i) => {
    const idx = start + i + 1;
    const tag = d.industry === '轨道交通' ? 'tag-rail' : d.industry === '新能源' ? 'tag-energy' : '';
    const rowId = d._id || d.id || '';
    return `<tr>
      <td>${idx}</td>
      <td title="${d.companyName || ''}">${d.companyName || '-'}</td>
      <td><span class="tag ${tag}">${d.industry || '-'}</span></td>
      <td>${Array.isArray(d.department) ? d.department.join(', ') : (d.department || '-')}</td>
      <td>${d.aiDeployment || '-'}</td>
      <td>${d.budget || '-'}</td>
      <td>${d.submittedAt ? new Date(d.submittedAt).toLocaleString('zh-CN') : '-'}</td>
      <td>
        <button class="btn btn-outline" style="padding:4px 12px;font-size:12px" onclick="viewDetail('${rowId}')">详情</button>
        <button class="btn btn-danger" style="padding:4px 12px;font-size:12px" onclick="deleteOne('${rowId}')">删除</button>
      </td>
    </tr>`;
  }).join('');
  const pg = document.getElementById('pagination');
  let pgHtml = `<button ${currentPage <= 1 ? 'disabled' : ''} onclick="goPage(${currentPage - 1})">上一页</button>`;
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7 && Math.abs(p - currentPage) > 2 && p !== 1 && p !== totalPages) {
      if (p === currentPage - 3 || p === currentPage + 3) pgHtml += '<button disabled>...</button>';
      continue;
    }
    pgHtml += `<button class="${p === currentPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
  }
  pgHtml += `<button ${currentPage >= totalPages ? 'disabled' : ''} onclick="goPage(${currentPage + 1})">下一页</button>`;
  pg.innerHTML = pgHtml;
}

function goPage(p) { currentPage = p; renderTable(); }
function filterData() { currentPage = 1; renderTable(); }

function viewDetail(id) {
  const d = allData.find(x => (x._id || x.id) === id);
  if (!d) return;
  const grid = document.getElementById('detailGrid');
  let html = '';
  const sections = [
    { title: '基本信息', keys: ['companyName','industry','railSub','energySub','department','position','contactInfo'] },
    { title: 'AI应用现状', keys: ['aiDeployment','aiDeploymentDesc','currentAiScenes','aiProblems'] },
    { title: 'AI需求评分', keys: Object.keys(RATING_LABELS) },
    { title: '核心痛点', keys: ['corePainPoint'] },
    { title: '部署与通信', keys: ['networkBandwidth','videoBottleneck','edgeAiAcceptance','aiSwitchPriority','deployForm'] },
    { title: '采购与合作', keys: ['budget','timeline','coopMode','pilotWilling'] },
    { title: '开放性问题', keys: ['aiConcerns','expectations'] },
  ];
  sections.forEach(sec => {
    html += `<div class="detail-item full"><div class="dk" style="font-weight:700;color:#4F46E5;font-size:14px">${sec.title}</div></div>`;
    sec.keys.forEach(k => {
      if (d[k] === undefined || d[k] === null || d[k] === '') return;
      let val = d[k];
      if (Array.isArray(val)) val = val.join('；');
      const label = RATING_LABELS[k] || FIELD_LABELS[k] || k;
      const isLong = String(val).length > 40;
      html += `<div class="detail-item${isLong ? ' full' : ''}"><div class="dk">${label}</div><div class="dv">${val}</div></div>`;
    });
  });
  html += `<div class="detail-item full"><div class="dk">提交时间</div><div class="dv">${d.submittedAt ? new Date(d.submittedAt).toLocaleString('zh-CN') : '-'}</div></div>`;
  grid.innerHTML = html;
  document.getElementById('detailModal').classList.add('show');
}

function closeModal() { document.getElementById('detailModal').classList.remove('show'); }

async function deleteOne(id) {
  if (!confirm('确定删除此条记录？')) return;
  try { await callAPI('delete', { id }); loadData(); } catch (e) { alert('删除失败'); }
}

async function clearAll() {
  if (!confirm('确定清空所有数据？此操作不可恢复！')) return;
  try { await callAPI('clear'); loadData(); } catch (e) { alert('操作失败'); }
}

async function exportCSV() {
  try {
    if (authReady && tcbApp) {
      const result = await callAPI('export');
      if (!result.success) { alert(result.error || '导出失败'); return; }
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = result.filename || 'survey_export.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      window.open('/api/surveys/export/csv', '_blank');
    }
  } catch (e) { alert('导出失败：' + e.message); }
}

document.getElementById('detailModal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });

// 初始化
(async function() { await initCloudBase(); })();
