const SPREADSHEET_ID = '11sHpazKqky3s_5c9Up5zFMWZBf7rKbfFBa8-GG7ZTto';
const SALES_SHEET = '売上データ';
const MASTER_SHEET = 'マスタ';

function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'bootstrap') {
    return json_(getBootstrapData());
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('大商 売上管理')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Vercelからの保存・削除リクエストを受け取るAPI。
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    let result;
    if (request.action === 'saveSale') result = saveSale(request.sale);
    else if (request.action === 'addMasterItem') result = addMasterItem(request.type, request.name);
    else if (request.action === 'deleteSale') result = deleteSale(request.id);
    else throw new Error('未対応の処理です。');
    return json_(result);
  } catch (error) {
    return json_({error: error.message || '処理に失敗しました。'});
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function getBootstrapData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const master = ss.getSheetByName(MASTER_SHEET);
  const values = master.getDataRange().getValues();
  return {
    // 「古嵜」は担当者リストの最後に固定する。
    owners: moveToEnd_(values.slice(1).map(row => row[0]).filter(String), '古嵜'),
    categories: values.slice(1).map(row => row[1]).filter(String),
    primes: values.slice(1).map(row => row[2]).filter(String),
    sales: getSales_()
  };
}

// アプリの「マスタ管理」から追加した内容も、スプレッドシートのマスタに保存する。
function addMasterItem(type, name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('名称を入力してください。');
  if (!['owner', 'prime'].includes(type)) throw new Error('追加する種類が不正です。');

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(MASTER_SHEET);
  const column = type === 'owner' ? 1 : 3;
  const current = sheet.getRange(2, column, Math.max(sheet.getLastRow() - 1, 1), 1)
    .getDisplayValues().flat().map(value => value.trim()).filter(Boolean);
  if (current.includes(cleanName)) return { added: false, name: cleanName };

  // 他の列を崩さず、該当するマスタ列の末尾へ追加する。
  sheet.getRange(sheet.getLastRow() + 1, column).setValue(cleanName);
  return { added: true, name: cleanName };
}

function moveToEnd_(items, value) {
  return [...items.filter(item => item !== value), ...items.filter(item => item === value)];
}

function saveSale(sale) {
  const required = ['term', 'month', 'project', 'prime', 'category', 'owner', 'amount', 'labor'];
  required.forEach(key => {
    if (sale[key] === undefined || sale[key] === null || sale[key] === '') {
      throw new Error(`必須項目が不足しています: ${key}`);
    }
  });
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SALES_SHEET);
  const id = Utilities.getUuid();
  const amount = Number(sale.amount);
  const labor = Number(sale.labor);
  sheet.appendRow([
    id, Number(sale.term), sale.month, sale.project, sale.prime,
    sale.category, sale.owner, amount, labor, labor ? amount / labor : 0, sale.note || ''
  ]);
  return { id, savedAt: new Date().toISOString() };
}

function deleteSale(id) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SALES_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('削除対象が見つかりません。');
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat();
  const index = ids.indexOf(String(id));
  if (index < 0) throw new Error('削除対象が見つかりません。');
  sheet.deleteRow(index + 2);
  return {deleted: true, id: String(id)};
}

function getSales_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SALES_SHEET);
  const rows = sheet.getDataRange().getValues().slice(1);
  return rows.filter(row => row[0]).map(row => ({
    id: row[0], term: row[1], month: row[2], project: row[3], prime: row[4],
    category: row[5], owner: row[6], amount: Number(row[7]), labor: Number(row[8]), note: row[10] || ''
  }));
}
