/* Vercel公開時だけ有効になる、Googleスプレッドシート連携用の処理。 */
(() => {
  const remote = location.protocol === 'https:' && !location.hostname.includes('script.google');
  if (!remote) return;

  const BOOTSTRAP_CACHE_KEY = 'daisho-remote-bootstrap-cache-v1';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const hideSplash = () => {
    document.querySelector('#splash')?.classList.add('done');
  };

  const api = async (path, body, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);
    let response;
    try {
      response = await fetch(`/api/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? {'Content-Type':'application/json'} : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: body ? 'no-store' : 'no-store',
      signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || '通信に失敗しました。');
    return result;
  };

  const getBootstrapWithRetry = async () => {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await api('bootstrap', null, {timeout: attempt === 1 ? 10000 : 16000});
      } catch (error) {
        lastError = error;
        if (attempt < 3) await sleep(attempt * 900);
      }
    }
    throw lastError;
  };

  const currentSelectValues = () => Object.fromEntries(
    ['#dashboard-owner','#dashboard-term','#dashboard-month','#filter-term','#filter-month','#filter-category','#filter-prime','#entry-term','#entry-month','#entry-category','#entry-owner','#entry-prime']
      .map(selector => [selector, document.querySelector(selector)?.value])
  );

  const restoreSelectValues = values => {
    Object.entries(values).forEach(([selector, value]) => {
      const select = document.querySelector(selector);
      if (select && value && [...select.options].some(option => option.value === value)) select.value = value;
    });
  };

  const applyBootstrapData = (data, options = {}) => {
    const values = options.preserveControls ? currentSelectValues() : null;
    OWNERS = data.owners || [];
    PRIMES = data.primes || [];
    sales = data.sales || [];
    resetSelects();
    fillSelects();
    if (values) restoreSelectValues(values);
    renderDashboard();
    renderTable();
  };

  let saleSaving = false;
  let deleteRunning = false;
  let refreshRunning = false;
  let lastBootstrapAt = 0;

  function resetSelects() {
    document.querySelector('#dashboard-month').innerHTML = '<option value="all">年間</option>';
    document.querySelector('#filter-month').innerHTML = '<option value="all">すべての月</option>';
    document.querySelector('#filter-category').innerHTML = '<option value="all">すべての業種</option>';
    document.querySelector('#filter-prime').innerHTML = '<option value="all">すべての元請</option>';
    ['#dashboard-term','#filter-term','#entry-term','#dashboard-owner','#entry-owner','#entry-category','#entry-prime'].forEach(selector => {
      document.querySelector(selector).innerHTML = '';
    });
  }

  async function boot() {
    try {
      const data = await getBootstrapWithRetry();
      applyBootstrapData(data);
      lastBootstrapAt = Date.now();
      localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({savedAt: Date.now(), data}));
    } catch (error) {
      const cached = localStorage.getItem(BOOTSTRAP_CACHE_KEY);
      if (cached) {
        try {
          applyBootstrapData(JSON.parse(cached).data);
          toast('通信が不安定です。前回読み込めたデータを表示しています。');
        } catch {
          toast(`データを読み込めませんでした：${error.message}`);
        }
      } else {
        toast(`データを読み込めませんでした。電波を確認して再読み込みしてください。`);
      }
    } finally {
      setTimeout(hideSplash, 300);
    }
  }

  async function refreshLatestData() {
    if (refreshRunning || saleSaving) return;
    if (Date.now() - lastBootstrapAt < 30000) return;
    refreshRunning = true;
    try {
      const data = await getBootstrapWithRetry();
      applyBootstrapData(data, {preserveControls:true});
      lastBootstrapAt = Date.now();
      localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({savedAt: Date.now(), data}));
    } catch (error) {
      console.warn('refresh failed', error);
    } finally {
      refreshRunning = false;
    }
  }

  async function forceRefreshLatestData() {
    if (refreshRunning) return;
    refreshRunning = true;
    try {
      const data = await getBootstrapWithRetry();
      applyBootstrapData(data, {preserveControls:true});
      lastBootstrapAt = Date.now();
      localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({savedAt: Date.now(), data}));
    } catch (error) {
      console.warn('force refresh failed', error);
    } finally {
      refreshRunning = false;
    }
  }

  document.addEventListener('submit', async event => {
    if (event.target.id !== 'sales-form') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // 通信中の二度押し・Enter連打による重複登録を防ぐ。
    if (saleSaving) return;
    saleSaving = true;
    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = '登録中…';
    const data = Object.fromEntries(new FormData(event.target));
    if (data.prime === 'その他') data.prime = data.primeOther;
    delete data.primeOther;
    const sale = {...data, term:Number(data.term), amount:Number(data.amount), labor:Number(data.labor)};
    try {
      const saved = await api('sales', {action:'saveSale', sale});
      sale.id = saved.id;
      sales.push(sale);
      event.target.reset();
      document.querySelector('#prime-other-wrap').hidden = true;
      document.querySelector('#entry-term').value = CURRENT_TERM;
      document.querySelector('#entry-month').value = MONTHS.includes(CURRENT_MONTH_LABEL) ? CURRENT_MONTH_LABEL : '6月';
      renderDashboard();
      showCompletion(sale);
    } catch (error) {
      toast(`保存に失敗しました：${error.message}`);
    } finally {
      saleSaving = false;
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  }, true);

  document.addEventListener('submit', async event => {
    const type = event.target.id === 'owner-master-form' ? 'owner' : event.target.id === 'prime-master-form' ? 'prime' : '';
    if (!type) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = document.querySelector(type === 'owner' ? '#owner-master-input' : '#prime-master-input');
    const name = input.value.trim();
    if (!name) return;
    try {
      const result = await api('sales', {action:'addMasterItem', type, name});
      if (result.added) {
        if (type === 'owner') OWNERS.push(result.name); else PRIMES.push(result.name);
        resetSelects(); fillSelects(); renderMaster();
      }
      input.value = '';
      toast(result.added ? '追加しました。' : 'すでに登録されています。');
    } catch (error) {
      toast(`追加に失敗しました：${error.message}`);
    }
  }, true);

  document.addEventListener('click', async event => {
    const deleteButton = event.target.closest('[data-delete]');
    const id = deleteButton?.dataset.delete;
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (deleteRunning) return;
    if (!confirm('この売上データを削除しますか？')) return;
    deleteRunning = true;
    const originalLabel = deleteButton.textContent;
    deleteButton.disabled = true;
    deleteButton.textContent = '削除中';
    const row = deleteButton.closest('tr');
    if (row) row.style.opacity = '.45';
    try {
      await api('sales', {action:'deleteSale', id});
      sales = sales.filter(sale => sale.id !== id);
      renderTable();
      renderDashboard();
      toast('削除しました。一覧を更新しています。');
      await forceRefreshLatestData();
    } catch (error) {
      toast(`削除に失敗しました：${error.message}`);
      if (row) row.style.opacity = '';
      deleteButton.disabled = false;
      deleteButton.textContent = originalLabel;
    } finally {
      deleteRunning = false;
    }
  }, true);

  boot();
  window.addEventListener('focus', refreshLatestData);
  window.addEventListener('pageshow', refreshLatestData);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshLatestData();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') refreshLatestData();
  }, 120000);
})();
