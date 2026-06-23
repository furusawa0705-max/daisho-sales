const GAS_URL = process.env.GAS_WEB_APP_URL || 'https://script.google.com/macros/s/AKfycbwyO9fNzTO5YW5sn6r0SbDPlwj5ytCNMft-zmsuqcoV-DySqUiqMnJrYpp5g4zY6-bc1Q/exec';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({error:'Method not allowed'});
  try {
    const upstream = await fetch(GAS_URL, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(request.body), redirect:'follow'
    });
    const data = await upstream.json();
    response.status(upstream.ok ? 200 : 502).json(data);
  } catch (error) {
    response.status(502).json({error:'スプレッドシートに接続できませんでした。'});
  }
}
