/* Vercel公開時だけ有効になる、Googleスプレッドシート連携用の処理。 */
(() => {
  const remote = location.protocol === 'https:' && !location.hostname.includes('script.google');
  if (!remote) return;

  const api = async (path, body) => {
    const response = await fetch(`/api/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? {'Content-Type':'application/json'} : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || '通信に失敗しました。');
    return result;
  };

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
      const data = await api('bootstrap');
      OWNERS = data.owners || [];
      PRIMES = data.primes || [];
      sales = data.sales || [];
      resetSelects();
      fillSelects();
      renderDashboard();
      renderTable();
    } catch (error) {
      toast(`データを読み込めませんでした：${error.message}`);
    }
  }

  document.addEventListener('submit', async event => {
    if (event.target.id !== 'sales-form') return;
    event.preventDefault();
    event.stopImmediatePropagation();
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
      document.querySelector('#entry-month').value = '6月';
      renderDashboard();
      showCompletion(sale);
    } catch (error) {
      toast(`保存に失敗しました：${error.message}`);
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
    const id = event.target.closest('[data-delete]')?.dataset.delete;
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!confirm('この売上データを削除しますか？')) return;
    try {
      await api('sales', {action:'deleteSale', id});
      sales = sales.filter(sale => sale.id !== id);
      renderTable(); renderDashboard(); toast('削除しました。');
    } catch (error) {
      toast(`削除に失敗しました：${error.message}`);
    }
  }, true);

  boot();
})();
