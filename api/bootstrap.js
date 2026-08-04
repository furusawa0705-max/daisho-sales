const GAS_URL = process.env.GAS_WEB_APP_URL || 'https://script.google.com/macros/s/AKfycbwyO9fNzTO5YW5sn6r0SbDPlwj5ytCNMft-zmsuqcoV-DySqUiqMnJrYpp5g4zY6-bc1Q/exec';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    const upstream = await fetch(`${GAS_URL}?api=bootstrap`, {
      redirect:'follow',
      headers:{'User-Agent':'Mozilla/5.0 (Daisho Sales App)','Accept':'application/json'}
    });
    if (!upstream.ok) throw new Error(`GAS応答エラー: ${upstream.status}`);
    const data = await upstream.json();
    response.status(200).json(data);
  } catch (error) {
    response.status(502).json({error:'スプレッドシートに接続できませんでした。'});
  }
}
