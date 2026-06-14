// 统一 API 模块 —— 优先 jsonbin.io，回退 localStorage
// 供 survey.js 和 admin.js 共用
(function(global) {
  'use strict';

  var STORAGE_KEY = 'ai_survey_data';
  var dataCache = null; // 缓存从 jsonbin 读取的数据，避免重复请求
  var cacheTime = 0;

  // ========== jsonbin.io API ==========
  var BIN_URL = 'https://api.jsonbin.io/v3/b/' + JSONBIN_BIN_ID;
  var HEADERS = {
    'Content-Type': 'application/json',
    'X-Access-Key': JSONBIN_ACCESS_KEY
  };

  function isJsonbinConfigured() {
    return JSONBIN_BIN_ID && JSONBIN_BIN_ID !== 'YOUR_BIN_ID_HERE' &&
           JSONBIN_ACCESS_KEY && JSONBIN_ACCESS_KEY !== '$2a$10$YOUR_ACCESS_KEY_HERE';
  }

  // 从 jsonbin 读取所有数据
  async function jsonbinRead() {
    var res = await fetch(BIN_URL + '/latest', { headers: HEADERS });
    if (!res.ok) throw new Error('jsonbin 读取失败: ' + res.status);
    var json = await res.json();
    // jsonbin v3 返回结构: { record: ..., metadata: ... }
    var data = json.record;
    if (!Array.isArray(data)) data = [];
    dataCache = data;
    cacheTime = Date.now();
    return data;
  }

  // 写入全部数据到 jsonbin
  async function jsonbinWrite(data) {
    var res = await fetch(BIN_URL, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('jsonbin 写入失败: ' + res.status);
    var json = await res.json();
    dataCache = json.record;
    cacheTime = Date.now();
    return json.record;
  }

  async function remoteAPI(action, data) {
    if (!isJsonbinConfigured()) {
      throw new Error('jsonbin.io 未配置');
    }

    // 读取当前数据
    var all = (dataCache && (Date.now() - cacheTime < 2000)) ? dataCache : await jsonbinRead();

    switch (action) {
      case 'submit': {
        var record = Object.assign({}, data, {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          submittedAt: new Date().toISOString()
        });
        all.push(record);
        await jsonbinWrite(all);
        return { success: true, data: record };
      }
      case 'list': {
        var pwd = data && data.adminPwd;
        if (pwd !== 'zx2024ai') return { success: false, error: '管理员密码错误' };
        return { success: true, data: all };
      }
      case 'stats': {
        var pwd = data && data.adminPwd;
        if (pwd !== 'zx2024ai') return { success: false, error: '管理员密码错误' };
        var today = new Date().toISOString().slice(0, 10);
        var byIndustry = {};
        all.forEach(function(d) {
          if (d.industry) byIndustry[d.industry] = (byIndustry[d.industry] || 0) + 1;
        });
        return {
          success: true,
          data: {
            total: all.length,
            today: all.filter(function(d) { return d.submittedAt && d.submittedAt.startsWith(today); }).length,
            byIndustry: byIndustry
          }
        };
      }
      case 'delete': {
        var pwd = data && data.adminPwd;
        if (pwd !== 'zx2024ai') return { success: false, error: '管理员密码错误' };
        all = all.filter(function(d) { return (d._id || d.id) !== (data && data.id); });
        await jsonbinWrite(all);
        return { success: true };
      }
      case 'clear': {
        var pwd = data && data.adminPwd;
        if (pwd !== 'zx2024ai') return { success: false, error: '管理员密码错误' };
        await jsonbinWrite([]);
        return { success: true };
      }
      case 'export': {
        var pwd = data && data.adminPwd;
        if (pwd !== 'zx2024ai') return { success: false, error: '管理员密码错误' };
        if (all.length === 0) return { success: false, error: '暂无数据' };
        var allKeys = new Set();
        all.forEach(function(d) { Object.keys(d).forEach(function(k) { allKeys.add(k); }); });
        var keys = Array.from(allKeys);
        var csv = '\uFEFF' + keys.join(',') + '\n';
        all.forEach(function(d) {
          csv += keys.map(function(k) {
            var v = d[k];
            if (Array.isArray(v)) v = v.join(';');
            if (v === undefined || v === null) v = '';
            return '"' + String(v).replace(/"/g, '""') + '"';
          }).join(',') + '\n';
        });
        return { success: true, csv: csv, filename: 'survey_export_' + new Date().toISOString().slice(0, 10) + '.csv' };
      }
      case 'verifyAdmin': {
        var pwd = data && data.adminPwd;
        return { success: pwd === 'zx2024ai' };
      }
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  // ========== localStorage API（回退方案）==========
  function localAPI(action, data) {
    function getAll() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
    }
    function saveAll(arr) { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }

    switch (action) {
      case 'submit': {
        var all = getAll();
        var record = Object.assign({}, data, {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          submittedAt: new Date().toISOString()
        });
        all.push(record);
        saveAll(all);
        return { success: true, data: record };
      }
      case 'list':
        return { success: true, data: getAll() };
      case 'stats': {
        var all = getAll();
        var today = new Date().toISOString().slice(0, 10);
        var byIndustry = {};
        all.forEach(function(d) {
          if (d.industry) byIndustry[d.industry] = (byIndustry[d.industry] || 0) + 1;
        });
        return {
          success: true,
          data: {
            total: all.length,
            today: all.filter(function(d) { return d.submittedAt && d.submittedAt.startsWith(today); }).length,
            byIndustry: byIndustry
          }
        };
      }
      case 'delete': {
        var all = getAll();
        all = all.filter(function(d) { return (d._id || d.id) !== (data && data.id); });
        saveAll(all);
        return { success: true };
      }
      case 'clear':
        saveAll([]);
        return { success: true };
      case 'export': {
        var all = getAll();
        if (all.length === 0) return { success: false, error: '暂无数据' };
        var allKeys = new Set();
        all.forEach(function(d) { Object.keys(d).forEach(function(k) { allKeys.add(k); }); });
        var keys = Array.from(allKeys);
        var csv = '\uFEFF' + keys.join(',') + '\n';
        all.forEach(function(d) {
          csv += keys.map(function(k) {
            var v = d[k];
            if (Array.isArray(v)) v = v.join(';');
            if (v === undefined || v === null) v = '';
            return '"' + String(v).replace(/"/g, '""') + '"';
          }).join(',') + '\n';
        });
        return { success: true, csv: csv, filename: 'survey_export_' + new Date().toISOString().slice(0, 10) + '.csv' };
      }
      case 'verifyAdmin':
        return { success: true };
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  // ========== 公开 API ==========
  async function callAPI(action, data) {
    // 优先 jsonbin.io（统一数据源，跨设备可见）
    if (isJsonbinConfigured()) {
      try {
        return await remoteAPI(action, data);
      } catch (e) {
        console.warn('jsonbin.io 不可用，切换本地存储:', e.message);
      }
    }

    // 回退 localStorage
    return localAPI(action, data);
  }

  async function init() {
    if (isJsonbinConfigured()) {
      try {
        await jsonbinRead();
        console.log('jsonbin.io 后端已就绪');
        return;
      } catch (e) {
        console.log('jsonbin.io 不可达，使用本地存储模式');
      }
    } else {
      console.log('jsonbin.io 未配置，使用本地存储模式');
    }
  }

  global.SurveyAPI = { callAPI: callAPI, init: init };

})(window);
