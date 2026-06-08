(function() {
  'use strict';
  const STEP_NAMES = ['基本信息', 'AI应用现状', 'AI需求优先级', '部署与通信', '采购与合作', '开放性问题'];
  const TOTAL_STEPS = 6;
  let currentStep = 1;
  let tcbApp = null;
  let authReady = false;
  let useLocalStorage = false;

  const railScenes = [
    { name: 'rail_videoAnalysis', label: '轨旁/车载视频智能分析（入侵检测、烟火识别、司机状态监测等）' },
    { name: 'rail_networkOps', label: '交换机/网络设备智能运维（故障预测、根因定位、自动恢复）' },
    { name: 'rail_edgeAi', label: '边缘AI推理（就地分析，减少数据回传，降低延迟）' },
    { name: 'rail_smartDispatch', label: '智能调度辅助决策（列车运行图优化、晚点恢复）' },
    { name: 'rail_stationMgmt', label: '站台/车站智慧管理（客流分析、设备联动）' },
    { name: 'rail_disasterMonitor', label: '环境与灾害监测（滑坡、水淹、异物侵限预警）' },
    { name: 'rail_energyMgmt', label: '智慧能源管理（牵引供电、空调照明节能）' },
  ];
  const energyScenes = [
    { name: 'energy_smartInspection', label: '风机/光伏阵列智能巡检（无人机巡检、热斑识别、叶片裂纹检测）' },
    { name: 'energy_powerForecast', label: '功率预测与并网优化（超短期/短期功率预测、AGC优化）' },
    { name: 'energy_videoMonitor', label: '场站视频AI监控（安全帽检测、违规作业识别、周界安防）' },
    { name: 'energy_faultPredict', label: '设备故障预测与健康管理（逆变器、风机齿轮箱、储能BMS等）' },
    { name: 'energy_storageSched', label: '储能系统智能调度（充放电策略优化、电池寿命管理）' },
    { name: 'energy_chargingOps', label: '充电桩/换电站智能运维与负荷调度' },
    { name: 'energy_edgeComm', label: '偏远场站边缘AI+通信一体化（弱网环境下就地推理+压缩回传）' },
  ];

  // 初始化 CloudBase
  async function initCloudBase() {
    if (typeof cloudbase === 'undefined' || typeof CLOUDBASE_ENV_ID === 'undefined' || CLOUDBASE_ENV_ID === 'your-env-id') return false;
    try {
      tcbApp = cloudbase.init({ env: CLOUDBASE_ENV_ID });
      const auth = tcbApp.auth();
      await auth.anonymousAuthProvider().signIn();
      authReady = true;
      console.log('CloudBase 初始化成功，匿名登录已就绪');
      return true;
    } catch (e) {
      console.warn('CloudBase 初始化失败，使用本地存储模式:', e.message);
      useLocalStorage = true;
      return false;
    }
  }

  // 统一 API 调用
  async function callAPI(action, data) {
    // 优先使用 CloudBase
    if (authReady && tcbApp) {
      try {
        const result = await tcbApp.callFunction({ name: 'survey', data: { action, data } });
        return result.result;
      } catch (e) {
        console.error('云函数调用失败，切换到本地存储:', e);
        useLocalStorage = true;
      }
    }

    // 尝试本地 Express API
    try {
      const routes = {
        submit: { method: 'POST', url: '/api/surveys' },
        list:   { method: 'GET',  url: '/api/surveys' },
        stats:  { method: 'GET',  url: '/api/surveys/stats' },
        delete: { method: 'DELETE', url: '/api/surveys/' + (data ? data.id : '') },
        clear:  { method: 'DELETE', url: '/api/surveys' },
      };
      const route = routes[action];
      if (!route) throw new Error('Unknown action: ' + action);
      const opts = { method: route.method, headers: { 'Content-Type': 'application/json' } };
      if (action === 'submit') opts.body = JSON.stringify(data);
      const res = await fetch(route.url, opts);
      if (res.ok) return res.json();
      throw new Error('Express API 返回错误: ' + res.status);
    } catch (e) {
      console.warn('Express API 不可用，切换到本地存储:', e.message);
    }

    // localStorage 回退方案
    return localAPI(action, data);
  }

  // localStorage API 实现
  function localAPI(action, data) {
    const STORAGE_KEY = 'ai_survey_data';
    function getAll() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
    }
    function saveAll(arr) { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }

    switch (action) {
      case 'submit': {
        const all = getAll();
        const record = { ...data, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), submittedAt: new Date().toISOString() };
        all.push(record);
        saveAll(all);
        return { success: true, data: record };
      }
      case 'list': {
        return { success: true, data: getAll() };
      }
      case 'stats': {
        const all = getAll();
        const today = new Date().toISOString().slice(0, 10);
        const byIndustry = {};
        all.forEach(d => { if (d.industry) byIndustry[d.industry] = (byIndustry[d.industry] || 0) + 1; });
        return { success: true, data: { total: all.length, today: all.filter(d => d.submittedAt && d.submittedAt.startsWith(today)).length, byIndustry } };
      }
      case 'delete': {
        let all = getAll();
        all = all.filter(d => (d._id || d.id) !== (data && data.id));
        saveAll(all);
        return { success: true };
      }
      case 'clear': {
        saveAll([]);
        return { success: true };
      }
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  // 动态生成评分行
  function buildRatingRows(containerId, scenes) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    scenes.forEach(s => {
      const row = document.createElement('div');
      row.className = 'rating-row';
      row.innerHTML = `<span class="rating-label">${s.label}</span>
        <div class="rating-stars" data-name="${s.name}">
          ${[1,2,3,4,5].map(v => `<button type="button" data-val="${v}">${v}</button>`).join('')}
        </div>`;
      container.appendChild(row);
    });
  }

  // 侧栏导航
  function buildStepNav() {
    const nav = document.getElementById('stepNav');
    nav.innerHTML = '';
    STEP_NAMES.forEach((name, i) => {
      const step = i + 1;
      const item = document.createElement('div');
      item.className = 'step-item' + (step === currentStep ? ' active' : '') + (step < currentStep ? ' completed' : '');
      item.dataset.step = step;
      item.innerHTML = `<span class="step-dot">${step}</span><span>${name}</span>`;
      item.addEventListener('click', () => goToStep(step));
      nav.appendChild(item);
    });
  }

  function goToStep(step) {
    if (step < 1 || step > TOTAL_STEPS) return;
    if (step > currentStep && !validateStep(currentStep)) return;
    currentStep = step;
    updateUI();
  }

  function updateUI() {
    document.querySelectorAll('.form-section').forEach(s => {
      s.classList.toggle('active', parseInt(s.dataset.step) === currentStep);
    });
    buildStepNav();
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    prevBtn.style.display = currentStep > 1 ? '' : 'none';
    nextBtn.style.display = currentStep < TOTAL_STEPS ? '' : 'none';
    submitBtn.style.display = currentStep === TOTAL_STEPS ? '' : 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 验证
  function validateStep(step) {
    const section = document.querySelector(`.form-section[data-step="${step}"]`);
    let valid = true;
    section.querySelectorAll('.form-group').forEach(g => g.classList.remove('has-error'));
    section.querySelectorAll('.error-msg').forEach(e => e.textContent = '');

    section.querySelectorAll('input[required], textarea[required], select[required]').forEach(el => {
      if (!el.value.trim()) {
        const g = el.closest('.form-group');
        if (g) { g.classList.add('has-error'); g.querySelector('.error-msg').textContent = '此项为必填'; }
        valid = false;
      }
    });
    section.querySelectorAll('.radio-group').forEach(rg => {
      const first = rg.querySelector('input[type="radio"]');
      if (first && first.required && !rg.querySelector('input[type="radio"]:checked')) {
        const g = rg.closest('.form-group');
        if (g) { g.classList.add('has-error'); g.querySelector('.error-msg').textContent = '请选择一项'; }
        valid = false;
      }
    });
    return valid;
  }

  // 条件显示
  function setupConditionals() {
    document.querySelectorAll('input[name="industry"]').forEach(r => {
      r.addEventListener('change', () => {
        document.getElementById('railSubGroup').style.display = r.value === '轨道交通' && r.checked ? '' : 'none';
        document.getElementById('energySubGroup').style.display = r.value === '新能源' && r.checked ? '' : 'none';
      });
    });
    document.querySelectorAll('.other-input, .sub-input').forEach(inp => {
      const triggerName = inp.dataset.trigger;
      const triggerVal = inp.dataset.triggerVal;
      if (!triggerName) return;
      const parent = inp.closest('.form-group') || inp.closest('form');
      parent.querySelectorAll(`input[name="${triggerName}"]`).forEach(el => {
        el.addEventListener('change', () => {
          const checked = el.checked && el.value === triggerVal;
          inp.style.display = checked ? '' : 'none';
          if (!checked) inp.value = '';
        });
      });
    });
  }

  // 评分按钮
  function setupRatings() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.rating-stars button');
      if (!btn) return;
      const container = btn.closest('.rating-stars');
      const val = parseInt(btn.dataset.val);
      container.querySelectorAll('button').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.val) <= val);
      });
      container.dataset.value = val;
    });
  }

  // 多选限制
  function setupMaxSelect() {
    document.querySelectorAll('.checkbox-group[data-max-select]').forEach(group => {
      const max = parseInt(group.dataset.maxSelect);
      group.addEventListener('change', () => {
        const checked = group.querySelectorAll('input:checked').length;
        group.querySelectorAll('.checkbox-item').forEach(item => {
          const cb = item.querySelector('input');
          if (checked >= max && !cb.checked) {
            item.classList.add('disabled');
          } else {
            item.classList.remove('disabled');
          }
        });
      });
    });
  }

  // 收集数据
  function collectData() {
    const data = {};
    const form = document.getElementById('surveyForm');
    form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], select, textarea').forEach(el => {
      if (el.name && el.value) data[el.name] = el.value;
    });
    form.querySelectorAll('input[type="radio"]:checked').forEach(el => {
      data[el.name] = el.value;
    });
    const multiSelects = {};
    form.querySelectorAll('input[type="checkbox"]:checked').forEach(el => {
      if (!multiSelects[el.name]) multiSelects[el.name] = [];
      multiSelects[el.name].push(el.value);
    });
    Object.assign(data, multiSelects);
    document.querySelectorAll('.rating-stars[data-value]').forEach(rs => {
      data[rs.dataset.name] = parseInt(rs.dataset.value);
    });
    return data;
  }

  // 提交
  async function submitSurvey() {
    if (!validateStep(currentStep)) return;
    const data = collectData();
    try {
      const result = await callAPI('submit', data);
      if (result.success) {
        document.getElementById('successModal').classList.add('show');
      } else {
        alert('提交失败：' + (result.error || '请稍后重试'));
      }
    } catch (err) {
      alert('提交出错：' + err.message);
    }
  }

  // 初始化
  async function init() {
    await initCloudBase();
    if (useLocalStorage) {
      console.log('使用本地存储模式（数据保存在浏览器中）');
    }
    buildRatingRows('railRatings', railScenes);
    buildRatingRows('energyRatings', energyScenes);
    buildStepNav();
    setupConditionals();
    setupRatings();
    setupMaxSelect();

    document.getElementById('prevBtn').addEventListener('click', () => goToStep(currentStep - 1));
    document.getElementById('nextBtn').addEventListener('click', () => {
      if (validateStep(currentStep)) goToStep(currentStep + 1);
    });
    document.getElementById('submitBtn').addEventListener('click', submitSurvey);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
