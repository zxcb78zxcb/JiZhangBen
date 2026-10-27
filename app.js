/* ===================================================================
   记账本 (Kakeibo)  —  纯前端 / 数据保存在本浏览器 localStorage
   周 = 小周期(周一~周日)   月 = 小总期   年 = 总单位量
   =================================================================== */
(function () {
'use strict';

/* ---------------- 分类定义 ---------------- */
const CATS = [
  { id:'food',   name:'吃饭费用', subs:[['food_g','买菜'],['food_o','外食'],['food_t','烟酒']] },
  { id:'daily',  name:'日用品',   subs:[['daily','']] },
  { id:'beauty', name:'美容',     subs:[['beauty','']] },
  { id:'cloth',  name:'衣服',     subs:[['cloth_n','普通衣服'],['cloth_a','服饰杂货']] },
  { id:'hobby',  name:'兴趣娱乐', subs:[['hobby','']] },
  { id:'social', name:'交际费用', subs:[['social','']] },
  { id:'edu',    name:'教育',     subs:[['edu','']] },
  { id:'traf',   name:'交通',     subs:[['traf','']] },
  { id:'med',    name:'医疗',     subs:[['med','']] },
  { id:'other',  name:'其他费用', subs:[['other','']] }
];
const INC = 'income';                       // 收入
const ALLSUBS = [];
CATS.forEach(c => c.subs.forEach(s => ALLSUBS.push(s[0])));
const DEFAULT_FIXED = [ '房租', '通信费', '水电费', '会费', '税费' ];

/* ---------------- 数据层 ---------------- */
const KEY = 'kakeibo_v1';
let DB = loadDB();

function emptyDB(){ return { v:2, days:{}, months:{}, budgets:{}, tomb:{} }; }
function loadDB() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const o = JSON.parse(s);
      o.v = 2; o.days = o.days || {}; o.months = o.months || {};
      o.budgets = o.budgets || {}; o.tomb = o.tomb || {};
      return o;
    }
  } catch (e) { console.warn(e); }
  return emptyDB();
}
const nowTs = () => Date.now();
let _t = null;
function save() { clearTimeout(_t); _t = setTimeout(saveNow, 200); schedSync(); }
function saveNow() {
  clearTimeout(_t);
  try { localStorage.setItem(KEY, JSON.stringify(DB)); }
  catch (e) { toast('保存失败：浏览器存储空间不足'); }
}
window.addEventListener('beforeunload', saveNow);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { commitFocused(); saveNow(); } else { syncNow('visible'); }
});

/* ---------------- 工具 ---------------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
const ymOf = d => ymd(d).slice(0,7);
function parseYmd(s){ const p = s.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
function addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function weekStart(d){ const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; }
function lastDay(y,m){ return new Date(y, m, 0).getDate(); }              // m: 1-12
/* 把「380+520」「100×3」「1,200」这类输入算成数字。
   不是算式（纯数字、空、看不懂）就返回 null。 */
function calcExpr(v){
  let s = String(v == null ? '' : v).trim();
  if (!s) return null;
  s = s.replace(/[０-９．]/g, c => '0123456789.'.charAt('０１２３４５６７８９．'.indexOf(c)))
       .replace(/[，,\s]/g, '')            // 千分位逗号、空格
       .replace(/[×xX＊*]/g, '*')
       .replace(/[÷/／]/g, '/')
       .replace(/[＋+]/g, '+')
       .replace(/[－—–ー−-]/g, '-')          // 含 U+2212 真减号
       .replace(/[（(]/g, '(')
       .replace(/[）)]/g, ')');
  if (!/^[\d+\-*/.()]+$/.test(s)) return null;    // 混了别的字符，不碰
  if (!/[+\-*/]/.test(s.slice(1))) return null;   // 没有运算符（开头的负号不算）→ 当普通数字
  if (/[+\-*/(]$/.test(s)) return null;           // 还没输完，先别算
  try {
    const r = evalArith(s);
    if (typeof r === 'number' && isFinite(r)) return Math.round(r * 100) / 100;
  } catch (e) {}
  return null;
}

/* 一个很小的算式解析器，只认数字和 + - * / ( )。
   特意不用 eval / new Function：有些环境（带安全策略的页面）会直接禁掉它们，
   而且也不该让输入框里的文字变成可执行代码。 */
function evalArith(src){
  let i = 0;
  const s = String(src);

  function expr(){                       // 加减
    let v = term();
    while (i < s.length && (s[i] === '+' || s[i] === '-')) {
      const op = s[i++];
      const r = term();
      v = (op === '+') ? v + r : v - r;
    }
    return v;
  }
  function term(){                       // 乘除（优先级更高）
    let v = factor();
    while (i < s.length && (s[i] === '*' || s[i] === '/')) {
      const op = s[i++];
      const r = factor();
      if (op === '*') v = v * r;
      else { if (r === 0) throw new Error('除以 0'); v = v / r; }
    }
    return v;
  }
  function factor(){                     // 正负号、括号、数字
    if (s[i] === '+') { i++; return factor(); }
    if (s[i] === '-') { i++; return -factor(); }
    if (s[i] === '(') {
      i++;
      const v = expr();
      if (s[i] !== ')') throw new Error('括号没闭合');
      i++;
      return v;
    }
    const start = i;
    while (i < s.length && (s[i] === '.' || (s[i] >= '0' && s[i] <= '9'))) i++;
    if (i === start) throw new Error('这里该是个数字');
    const n = parseFloat(s.slice(start, i));
    if (!isFinite(n)) throw new Error('数字不对');
    return n;
  }

  const v = expr();
  if (i !== s.length) throw new Error('有多余的字符');   // 例如 "2(3)" "80+90)"
  return v;
}
/* 求和时也走一遍算式解析：万一哪里漏了换算，合计也不会算错 */
function num(v){
  const c = calcExpr(v);
  if (c !== null) return c;
  const n = parseFloat(String(v == null ? '' : v).replace(/[，,\s]/g, ''));
  return isFinite(n) ? n : 0;
}
function yen(n){ return '¥' + Math.round(n).toLocaleString('en-US'); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const WD = ['周一','周二','周三','周四','周五','周六','周日'];
function wdOf(d){ return WD[(d.getDay()+6)%7]; }

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove('show'), 1900);
}

/* ---------------- 读取 / 写入 ---------------- */
function dayRows(ds, sid){ const d = DB.days[ds]; return (d && d.rows && d.rows[sid]) || []; }
function viewRows(ds, sid){ const a = dayRows(ds, sid); return a.length ? a : [{n:'',a:''}]; }
function subSum(ds, sid){ return dayRows(ds, sid).reduce((t,r)=>t+num(r.a), 0); }
function catSum(ds, cat){ return cat.subs.reduce((t,s)=>t+subSum(ds, s[0]), 0); }
function daySpend(ds){ return ALLSUBS.reduce((t,s)=>t+subSum(ds,s), 0); }
function dayIncome(ds){ return subSum(ds, INC); }
function dayNote(ds){ const d = DB.days[ds]; return (d && d.note) || ''; }

function ensureArr(ds, sid){
  const d = DB.days[ds] || (DB.days[ds] = { rows:{}, note:'' });
  if (!d.rows) d.rows = {};
  return d.rows[sid] || (d.rows[sid] = []);
}
/* 时间戳精确到「某天的某个分类」，这样同一天里手机改交通、电脑改买菜也不会互相顶掉 */
function touchDay(ds, sid){
  const d = DB.days[ds]; if (!d) return;
  const t = nowTs(); d._t = t;
  if (sid) { d.t = d.t || {}; d.t[sid] = t; }
}
function touchMonth(m, field){
  const o = DB.months[m]; if (!o) return;
  const t = nowTs(); o._t = t;
  o.t = o.t || {}; o.t[field || 'fixed'] = t;
}
function setCell(ds, sid, i, f, v){
  const a = ensureArr(ds, sid);
  while (a.length <= i) a.push({n:'',a:''});
  a[i][f] = v; touchDay(ds, sid); save();
}
function addRow(ds, sid){
  const a = ensureArr(ds, sid);
  if (a.length === 0) a.push({n:'',a:''});
  a.push({n:'',a:''}); touchDay(ds, sid); save();
  return a.length - 1;
}
function delRow(ds, sid, i){
  const a = ensureArr(ds, sid);
  if (i < a.length) a.splice(i,1);
  touchDay(ds, sid); save();
}
function pruneDay(ds){
  const d = DB.days[ds]; if (!d) return;
  if ((d.note||'').trim()) return;
  let has = false;
  for (const k in d.rows) if (d.rows[k].some(r => (r.n||'').trim() || String(r.a||'').trim())) { has = true; break; }
  if (!has) {
    if (d._t) DB.tomb['d:' + ds] = nowTs();     // 记个墓碑，免得同步时被别的设备复活
    delete DB.days[ds];
    save();
  }
}

/* 区间合计（ISO 日期字符串可直接比较大小） */
function rangeSub(from, to, sid){
  let t = 0;
  for (const k in DB.days) if (k >= from && k <= to) t += subSum(k, sid);
  return t;
}
function rangeCat(from, to, cat){ return cat.subs.reduce((t,s)=>t+rangeSub(from,to,s[0]), 0); }
function rangeSpend(from, to){ return ALLSUBS.reduce((t,s)=>t+rangeSub(from,to,s), 0); }
function rangeIncome(from, to){ return rangeSub(from, to, INC); }

/* 月固定支出 */
function monthObj(m, create){
  let o = DB.months[m];
  if (!o && create) {
    o = DB.months[m] = { fixed: DEFAULT_FIXED.map(n=>({n:n, a:''})), note:'' };
    save();
  }
  return o;
}
function fixedRows(m){ const o = DB.months[m]; return (o && o.fixed) || []; }
function fixedSum(m){ return fixedRows(m).reduce((t,r)=>t+num(r.a), 0); }
function monthNote(m){ const o = DB.months[m]; return (o && o.note) || ''; }
function monthRange(m){
  const y = +m.slice(0,4), mo = +m.slice(5,7);
  return [ m + '-01', m + '-' + pad(lastDay(y,mo)) ];
}
function monthSpend(m){ const r = monthRange(m); return rangeSpend(r[0], r[1]) + fixedSum(m); }
function monthVar(m){ const r = monthRange(m); return rangeSpend(r[0], r[1]); }
function monthIncome(m){ const r = monthRange(m); return rangeIncome(r[0], r[1]); }
function prevMonth(m){
  let y = +m.slice(0,4), mo = +m.slice(5,7) - 1;
  if (mo === 0) { mo = 12; y--; }
  return y + '-' + pad(mo);
}

/* 环比 */
function pct(cur, prev, invert){
  if (!prev && !cur) return { t:'—', c:'flat' };
  if (!prev) return { t:'新增', c: invert ? 'down' : 'up' };
  const p = (cur - prev) / Math.abs(prev) * 100;
  const cls = Math.abs(p) < 0.05 ? 'flat' : ((p > 0) !== !!invert ? 'up' : 'down');
  return { t:(p>0?'+':'') + p.toFixed(1) + '%', c:cls };
}
function diffTxt(cur, prev){ const d = cur - prev; return (d>0?'+':d<0?'−':'') + yen(Math.abs(d)).slice(1); }

/* ---------------- 状态 ---------------- */
let view = 'day';
let cur  = new Date(); cur.setHours(0,0,0,0);
let curM = ymOf(cur);
let curY = cur.getFullYear();
const app = document.getElementById('app');

/* =====================================================================
   视图：日
   ===================================================================== */
function rowHTML(sid, i, r){
  return '<div class="row" data-sid="'+sid+'" data-i="'+i+'">'
    + '<input class="rn" type="text" placeholder="项目名称" value="'+esc(r.n)+'">'
    + '<input class="ra" type="text" inputmode="decimal" placeholder="0" value="'+esc(r.a)+'">'
    + '<button class="del" title="删除这一行">×</button></div>';
}
function groupHTML(ds, sid, label){
  const rs = viewRows(ds, sid);
  let h = '<div class="sub" data-sub="'+sid+'">';
  if (label) h += '<div class="subname"><span>'+esc(label)+'</span><b data-sum="'+sid+'">'+yen(subSum(ds,sid))+'</b></div>';
  h += '<div class="rowhead"><div>项目名称</div><div class="r">金额</div><div></div></div>';
  h += '<div class="rowlist">' + rs.map((r,i)=>rowHTML(sid,i,r)).join('') + '</div>';
  h += '<button class="addrow" data-add="'+sid+'">＋ 添加一行（也可在「项目名称」栏按回车）</button>';
  h += '</div>';
  return h;
}
function renderDay(){
  const ds = ymd(cur);
  let h = '';

  h += '<div class="navbar">'
     +   '<button class="nb" data-nav="d-1">‹</button>'
     +   '<div class="title">'+ds.replace(/-/g,' / ')+'<small>'+wdOf(cur)+'　第 '+weekNoOfMonth(cur)+' 周</small></div>'
     +   '<button class="nb" data-nav="d+1">›</button>'
     +   '<input type="date" id="dpick" value="'+ds+'">'
     +   '<button class="nb" data-nav="dtoday">今天</button>'
     + '</div>';

  const sp = daySpend(ds), ic = dayIncome(ds);
  h += '<div class="sumbar">'
     +  '<div class="box"><div class="lb">当日支出</div><div class="vl" id="tSpend">'+yen(sp)+'</div></div>'
     +  '<div class="box inc"><div class="lb">当日收入</div><div class="vl" id="tInc">'+yen(ic)+'</div></div>'
     +  '<div class="box bal"><div class="lb">当日结余</div><div class="vl" id="tBal">'+yen(ic-sp)+'</div></div>'
     + '</div>';

  CATS.forEach((c, idx) => {
    h += '<section class="card" data-cat="'+c.id+'">'
       +   '<h3><span><span class="no">'+(idx+1)+'</span>'+c.name+'</span></h3>'
       +   '<div class="body">';
    c.subs.forEach(s => { h += groupHTML(ds, s[0], s[1]); });
    h +=     '<div class="cattotal"><span>'+c.name+' 合计</span><b data-catsum="'+c.id+'">'+yen(catSum(ds,c))+'</b></div>'
       +   '</div></section>';
  });

  h += '<section class="card income">'
     +   '<h3><span><span class="no">11</span>收入</span></h3>'
     +   '<div class="body">'
     +     groupHTML(ds, INC, '')
     +     '<div class="cattotal"><span>收入 合计</span><b data-catsum="income">'+yen(ic)+'</b></div>'
     +   '</div></section>';

  h += '<section class="card"><h3>备注 · 今日笔记</h3><div class="body">'
     + '<textarea class="note" id="dayNote" placeholder="例：A超市鸡蛋比B便宜 ¥60；明天百货店打折；这周外食太多了…">'+esc(dayNote(ds))+'</textarea>'
     + '</div></section>';

  h += '<section class="card"><h3>本周 / 本月 快速合计</h3><div class="body">'+quickHTML()+'</div></section>';

  app.innerHTML = h;
}
function weekNoOfMonth(d){
  return Math.floor((d.getDate() + ((new Date(d.getFullYear(), d.getMonth(), 1).getDay()+6)%7) - 1) / 7) + 1;
}
function quickHTML(){
  const ws = weekStart(cur), we = addDays(ws,6);
  const m  = ymOf(cur), mr = monthRange(m);
  const wS = rangeSpend(ymd(ws), ymd(we)), wI = rangeIncome(ymd(ws), ymd(we));
  const mS = monthSpend(m), mI = monthIncome(m);
  return '<div class="kv"><span>本周支出（'+ymd(ws).slice(5)+' ~ '+ymd(we).slice(5)+'）</span><b>'+yen(wS)+'</b></div>'
       + '<div class="kv"><span>本周收入</span><b style="color:var(--blue)">'+yen(wI)+'</b></div>'
       + '<div class="kv"><span>本周结余</span><b style="color:var(--accent)">'+yen(wI-wS)+'</b></div>'
       + '<div class="kv"><span>本月支出（含固定支出 '+yen(fixedSum(m))+'）</span><b>'+yen(mS)+'</b></div>'
       + '<div class="kv"><span>本月收入</span><b style="color:var(--blue)">'+yen(mI)+'</b></div>'
       + '<div class="kv"><span>本月结余</span><b style="color:var(--accent)">'+yen(mI-mS)+'</b></div>';
}
function refreshDayTotals(){
  const ds = ymd(cur);
  document.querySelectorAll('[data-sum]').forEach(el => { el.textContent = yen(subSum(ds, el.dataset.sum)); });
  CATS.forEach(c => {
    const el = document.querySelector('[data-catsum="'+c.id+'"]');
    if (el) el.textContent = yen(catSum(ds, c));
  });
  const ie = document.querySelector('[data-catsum="income"]');
  const sp = daySpend(ds), ic = dayIncome(ds);
  if (ie) ie.textContent = yen(ic);
  const a = document.getElementById('tSpend'), b = document.getElementById('tInc'), c2 = document.getElementById('tBal');
  if (a) a.textContent = yen(sp);
  if (b) b.textContent = yen(ic);
  if (c2) c2.textContent = yen(ic - sp);
}

/* =====================================================================
   视图：周
   ===================================================================== */
function renderWeek(){
  const ws = weekStart(cur), days = [];
  for (let i=0;i<7;i++) days.push(addDays(ws,i));
  const from = ymd(days[0]), to = ymd(days[6]);

  let h = '<div class="navbar">'
        +   '<button class="nb" data-nav="w-1">‹ 上周</button>'
        +   '<div class="title">'+from.replace(/-/g,'/')+' ~ '+to.slice(5).replace(/-/g,'/')+'<small>周合计（周一 ~ 周日）</small></div>'
        +   '<button class="nb" data-nav="w+1">下周 ›</button>'
        + '</div>';

  const sp = rangeSpend(from,to), ic = rangeIncome(from,to);
  h += '<div class="sumbar">'
     +  '<div class="box"><div class="lb">本周支出</div><div class="vl">'+yen(sp)+'</div></div>'
     +  '<div class="box inc"><div class="lb">本周收入</div><div class="vl">'+yen(ic)+'</div></div>'
     +  '<div class="box bal"><div class="lb">本周结余</div><div class="vl">'+yen(ic-sp)+'</div></div>'
     + '</div>';

  h += '<section class="card"><h3>各项目 · 每日明细</h3><div class="tablewrap"><table><thead><tr>'
     + '<th class="name">项目</th>'
     + days.map(d=>'<th class="n">'+wdOf(d)+'<br>'+ymd(d).slice(5).replace('-','/')+'</th>').join('')
     + '<th class="n">周合计</th></tr></thead><tbody>';

  CATS.forEach((c,idx) => {
    h += '<tr class="catrow"><td class="name">'+(idx+1)+'. '+c.name+'</td>'
       + days.map(d=>cell(catSum(ymd(d), c))).join('')
       + cell(rangeCat(from,to,c)) + '</tr>';
    if (c.subs.length > 1 || c.subs[0][1]) {
      c.subs.forEach(s => {
        h += '<tr class="subrow"><td class="name">'+s[1]+'</td>'
           + days.map(d=>cell(subSum(ymd(d), s[0]))).join('')
           + cell(rangeSub(from,to,s[0])) + '</tr>';
      });
    }
  });
  h += '<tr class="total"><td class="name">支出合计</td>'
     + days.map(d=>cell(daySpend(ymd(d)))).join('') + cell(sp) + '</tr>';
  h += '<tr class="inc"><td class="name">11. 收入</td>'
     + days.map(d=>cell(dayIncome(ymd(d)))).join('') + cell(ic) + '</tr>';
  h += '<tr class="bal"><td class="name">结余</td>'
     + days.map(d=>cell(dayIncome(ymd(d)) - daySpend(ymd(d)))).join('') + cell(ic-sp) + '</tr>';
  h += '</tbody></table></div></section>';

  const notes = days.map(d=>({d:d, n:dayNote(ymd(d))})).filter(x=>x.n.trim());
  h += '<section class="card"><h3>本周备注汇总</h3><div class="body">';
  h += notes.length
     ? notes.map(x=>'<div class="kv" style="display:block"><b style="font-weight:700">'+ymd(x.d).slice(5)+' '+wdOf(x.d)+'</b><div style="color:var(--ink-soft);white-space:pre-wrap">'+esc(x.n)+'</div></div>').join('')
     : '<div class="hint">本周还没有写备注。</div>';
  h += '</div></section>';

  app.innerHTML = h;
}
function cell(v){ return '<td class="n'+(v?'':' zero')+'">'+(v?yen(v):'-')+'</td>'; }

/* =====================================================================
   视图：月（月度新总结）
   ===================================================================== */
function renderMonth(){
  const m = curM, pm = prevMonth(m);
  monthObj(m, true);
  const r = monthRange(m), pr = monthRange(pm);

  let h = '<div class="navbar">'
        +   '<button class="nb" data-nav="m-1">‹</button>'
        +   '<div class="title">'+m.slice(0,4)+' 年 '+(+m.slice(5,7))+' 月<small>月度总结 · 对比 '+(+pm.slice(5,7))+' 月</small></div>'
        +   '<button class="nb" data-nav="m+1">›</button>'
        + '</div>';

  const varS = monthVar(m), fixS = fixedSum(m), totS = varS + fixS, incS = monthIncome(m);
  const pVar = monthVar(pm), pFix = fixedSum(pm), pTot = pVar + pFix, pInc = monthIncome(pm);

  h += '<div class="sumbar">'
     +  '<div class="box"><div class="lb">月支出合计</div><div class="vl" id="mTot">'+yen(totS)+'</div></div>'
     +  '<div class="box inc"><div class="lb">月收入合计</div><div class="vl">'+yen(incS)+'</div></div>'
     +  '<div class="box bal"><div class="lb">月结余</div><div class="vl" id="mBal">'+yen(incS-totS)+'</div></div>'
     + '</div>';

  /* --- 固定支出 --- */
  const fx = fixedRows(m);
  h += '<section class="card"><h3>每月固定支出<span style="font-weight:400;font-size:12px;color:var(--ink-soft)">房租 / 通信费 / 水电费 / 会费 / 税费…</span></h3><div class="body">';
  h += '<div class="rowhead"><div>项目名称</div><div class="r">金额</div><div></div></div><div class="fixlist">';
  h += (fx.length?fx:[{n:'',a:''}]).map((r2,i)=>
        '<div class="row" data-fix="'+i+'">'
        + '<input class="fn" type="text" placeholder="项目名称" value="'+esc(r2.n)+'">'
        + '<input class="fa" type="text" inputmode="decimal" placeholder="0" value="'+esc(r2.a)+'">'
        + '<button class="del" data-delfix="'+i+'" title="删除这一行">×</button></div>').join('');
  h += '</div><button class="addrow" data-addfix="1">＋ 添加固定支出（也可在「项目名称」栏按回车）</button>';
  h += '<div class="cattotal"><span>固定支出 合计</span><b id="fixTotal">'+yen(fixS)+'</b></div>';
  h += '<div class="hint">上月固定支出 '+yen(pFix)+'　'+spanPct(pct(fixS,pFix))+'</div>';
  h += '</div></section>';

  /* --- 各项支出 与上月对比 --- */
  h += '<section class="card"><h3>各项支出合计 · 与上月对比</h3>'
     + '<div class="tablewrap"><table><thead><tr>'
     + '<th class="name">项目</th><th class="n">本月</th><th class="n">上月</th><th class="n">增减</th><th class="n">百分比</th></tr></thead><tbody>';

  CATS.forEach((c,idx) => {
    const a = rangeCat(r[0],r[1],c), b = rangeCat(pr[0],pr[1],c), p = pct(a,b);
    h += '<tr class="catrow"><td class="name">'+(idx+1)+'. '+c.name+'</td>'
       + cell(a) + cell(b) + '<td class="n '+p.c+'">'+diffTxt(a,b)+'</td><td class="n '+p.c+'">'+p.t+'</td></tr>';
    if (c.subs.length > 1 || c.subs[0][1]) {
      c.subs.forEach(s => {
        const x = rangeSub(r[0],r[1],s[0]), y = rangeSub(pr[0],pr[1],s[0]), q = pct(x,y);
        h += '<tr class="subrow"><td class="name">'+s[1]+'</td>'
           + cell(x) + cell(y) + '<td class="n '+q.c+'">'+diffTxt(x,y)+'</td><td class="n '+q.c+'">'+q.t+'</td></tr>';
      });
    }
  });
  let p1 = pct(varS,pVar), p2 = pct(fixS,pFix), p3 = pct(totS,pTot), p4 = pct(incS,pInc,true);
  h += '<tr class="total"><td class="name">变动支出合计</td>'+cell(varS)+cell(pVar)+'<td class="n '+p1.c+'">'+diffTxt(varS,pVar)+'</td><td class="n '+p1.c+'">'+p1.t+'</td></tr>';
  h += '<tr class="total"><td class="name">固定支出合计</td>'+cell(fixS)+cell(pFix)+'<td class="n '+p2.c+'">'+diffTxt(fixS,pFix)+'</td><td class="n '+p2.c+'">'+p2.t+'</td></tr>';
  h += '<tr class="total"><td class="name">支出总计</td>'+cell(totS)+cell(pTot)+'<td class="n '+p3.c+'">'+diffTxt(totS,pTot)+'</td><td class="n '+p3.c+'">'+p3.t+'</td></tr>';
  h += '<tr class="inc"><td class="name">11. 收入</td>'+cell(incS)+cell(pInc)+'<td class="n '+p4.c+'">'+diffTxt(incS,pInc)+'</td><td class="n '+p4.c+'">'+p4.t+'</td></tr>';
  h += '<tr class="bal"><td class="name">结余</td>'+cell(incS-totS)+cell(pInc-pTot)+'<td class="n">'+diffTxt(incS-totS,pInc-pTot)+'</td><td class="n">—</td></tr>';
  h += '</tbody></table></div>'
     + '<div class="body"><div class="hint"><span class="up">红色</span>＝比上月不划算（支出变多 / 收入变少）；<span class="down">绿色</span>＝比上月好。</div></div></section>';

  /* --- 每周小计 --- */
  h += '<section class="card"><h3>本月各周小计</h3><div class="tablewrap"><table><thead><tr>'
     + '<th class="name">周</th><th class="n">支出</th><th class="n">收入</th><th class="n">结余</th></tr></thead><tbody>';
  const y = +m.slice(0,4), mo = +m.slice(5,7), ld = lastDay(y,mo);
  const seen = {};
  for (let d=1; d<=ld; d++) {
    const dt = new Date(y, mo-1, d), ks = ymd(weekStart(dt));
    if (seen[ks]) continue; seen[ks] = 1;
    const a = ymd(weekStart(dt)) < r[0] ? r[0] : ymd(weekStart(dt));
    const bEnd = ymd(addDays(weekStart(dt),6));
    const b = bEnd > r[1] ? r[1] : bEnd;
    const s = rangeSpend(a,b), i2 = rangeIncome(a,b);
    h += '<tr><td class="name">'+a.slice(5).replace('-','/')+' ~ '+b.slice(5).replace('-','/')+'</td>'
       + cell(s) + '<td class="n" style="color:var(--blue)">'+(i2?yen(i2):'-')+'</td>'
       + '<td class="n" style="color:var(--accent)">'+yen(i2-s)+'</td></tr>';
  }
  h += '<tr class="total"><td class="name">变动支出合计</td>'+cell(varS)+'<td class="n" style="color:var(--blue)">'+yen(incS)+'</td><td class="n">'+yen(incS-varS)+'</td></tr>';
  h += '</tbody></table></div></section>';

  /* --- 分析笔记 --- */
  h += '<section class="card"><h3>本月分析笔记</h3><div class="body">'
     + '<div class="hint">为什么这一项比上个月高／低？下个月打算怎么调整？</div>'
     + '<textarea class="note" id="monNote" style="min-height:150px" placeholder="例：\n· 外食比上月 +38%，因为加班多，下月准备周末备餐。\n· 日用品 −20%，上月囤了洗衣液，这个月没买。\n· 会费涨了 ¥500，是流媒体订阅涨价，考虑退订一个。">'+esc(monthNote(m))+'</textarea>'
     + '</div></section>';

  app.innerHTML = h;
}
function spanPct(p){ return '<span class="'+p.c+'">'+p.t+'</span>'; }

/* =====================================================================
   视图：年
   ===================================================================== */
function renderYear(){
  const y = curY, ms = [];
  for (let i=1;i<=12;i++) ms.push(y + '-' + pad(i));

  let h = '<div class="navbar">'
        +   '<button class="nb" data-nav="y-1">‹</button>'
        +   '<div class="title">'+y+' 年<small>年度总合计</small></div>'
        +   '<button class="nb" data-nav="y+1">›</button>'
        + '</div>';

  const totS = ms.reduce((t,m)=>t+monthSpend(m),0);
  const totI = ms.reduce((t,m)=>t+monthIncome(m),0);
  h += '<section class="card"><div class="big"><div class="lb">'+y+' 年 支出总额</div><div class="vl">'+yen(totS)+'</div></div>'
     + '<div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)">'
     + '<div class="big inc" style="border-right:1px solid var(--line)"><div class="lb">年收入</div><div class="vl">'+yen(totI)+'</div></div>'
     + '<div class="big bal"><div class="lb">年结余</div><div class="vl">'+yen(totI-totS)+'</div></div></div></section>';

  h += '<section class="card"><h3>各项目 · 逐月一览</h3><div class="tablewrap"><table><thead><tr>'
     + '<th class="name">项目</th>' + ms.map((m,i)=>'<th class="n">'+(i+1)+'月</th>').join('') + '<th class="n">年合计</th></tr></thead><tbody>';

  CATS.forEach((c,idx) => {
    const vals = ms.map(m=>{ const r = monthRange(m); return rangeCat(r[0],r[1],c); });
    h += '<tr class="catrow"><td class="name">'+(idx+1)+'. '+c.name+'</td>'
       + vals.map(cell).join('') + cell(vals.reduce((a,b)=>a+b,0)) + '</tr>';
    if (c.subs.length > 1 || c.subs[0][1]) {
      c.subs.forEach(s => {
        const v2 = ms.map(m=>{ const r = monthRange(m); return rangeSub(r[0],r[1],s[0]); });
        h += '<tr class="subrow"><td class="name">'+s[1]+'</td>'
           + v2.map(cell).join('') + cell(v2.reduce((a,b)=>a+b,0)) + '</tr>';
      });
    }
  });
  const vFix = ms.map(fixedSum);
  const vVar = ms.map(monthVar);
  const vTot = ms.map(monthSpend);
  const vInc = ms.map(monthIncome);
  h += '<tr class="total"><td class="name">变动支出合计</td>'+vVar.map(cell).join('')+cell(vVar.reduce((a,b)=>a+b,0))+'</tr>';
  h += '<tr class="total"><td class="name">固定支出合计</td>'+vFix.map(cell).join('')+cell(vFix.reduce((a,b)=>a+b,0))+'</tr>';
  h += '<tr class="total"><td class="name">支出总计</td>'+vTot.map(cell).join('')+cell(totS)+'</tr>';
  h += '<tr class="inc"><td class="name">11. 收入</td>'+vInc.map(cell).join('')+cell(totI)+'</tr>';
  h += '<tr class="bal"><td class="name">结余</td>'+ms.map((m,i)=>cell(vInc[i]-vTot[i])).join('')+cell(totI-totS)+'</tr>';
  h += '</tbody></table></div></section>';

  h += '<section class="card"><h3>各月分析笔记</h3><div class="body">';
  const notes = ms.filter(m=>monthNote(m).trim());
  h += notes.length
     ? notes.map(m=>'<div class="kv" style="display:block"><b>'+(+m.slice(5,7))+' 月</b><div style="color:var(--ink-soft);white-space:pre-wrap">'+esc(monthNote(m))+'</div></div>').join('')
     : '<div class="hint">还没有写月度分析笔记。</div>';
  h += '</div></section>';

  app.innerHTML = h;
}

/* =====================================================================
   视图：预算 —— 可以建任意多个，各管各的时间段和额度
   ===================================================================== */
let budEdit = null;                 // null = 不在编辑；'new' = 新建；其它 = 正在编辑的 id

function newBudId(){ return 'b' + nowTs().toString(36) + Math.random().toString(36).slice(2,6); }
function budList(){ return Object.keys(DB.budgets || {}).map(k => DB.budgets[k]).filter(Boolean); }
function daysBetween(a, b){ return Math.round((parseYmd(b) - parseYmd(a)) / 864e5) + 1; }

/* 预算只统计「日常记的账」，不含月度固定支出（房租那些按月走，摊到任意区间没意义） */
function spentIn(from, to, subs){
  const sel = {};
  (subs && subs.length ? subs : ALLSUBS).forEach(s => sel[s] = 1);
  let t = 0;
  for (const k in DB.days) {
    if (k < from || k > to) continue;
    const rows = DB.days[k].rows || {};
    for (const sid in rows) {
      if (sid === INC || !sel[sid]) continue;
      (rows[sid] || []).forEach(r => { t += num(r.a); });
    }
  }
  return t;
}

/* 一个预算当前的全部状态，界面只管显示。
   结构：总预算 + 若干分项（每个分项绑定一些分类）+ 备用金（不绑分类，接收没归到分项的支出）*/
function budItems(b){ return Array.isArray(b.items) ? b.items : []; }

function budStat(b){
  const today = ymd(new Date());
  const limit = num(b.limit);
  const spent = spentIn(b.from, b.to, b.subs);          // 整个预算范围内的总花销
  const remain = limit - spent;
  const total = Math.max(1, daysBetween(b.from, b.to));
  let phase = 'on', passed, left;
  if (today < b.from)      { phase = 'before'; passed = 0;      left = total; }
  else if (today > b.to)   { phase = 'after';  passed = total;  left = 0; }
  else                     { passed = daysBetween(b.from, today); left = daysBetween(today, b.to); }
  const shouldBy = limit * passed / total;              // 按时间推进「本该」花到这里

  /* ---- 分项 ---- */
  const raw = budItems(b);
  const taken = {};                                     // 已经被某个分项认领的分类
  raw.forEach(it => (it.subs || []).forEach(s => taken[s] = 1));
  const scope = (b.subs && b.subs.length) ? b.subs : ALLSUBS;
  const otherSubs = scope.filter(s => !taken[s]);
  const other = otherSubs.length ? spentIn(b.from, b.to, otherSubs) : 0;

  let catchUsed = false;
  const items = raw.map(it => {
    const isCatch = !(it.subs && it.subs.length);       // 没绑分类 = 备用金/意外
    let sp;
    if (isCatch) { sp = catchUsed ? 0 : other; catchUsed = true; }
    else sp = spentIn(b.from, b.to, it.subs);
    const lim = num(it.limit);
    return {
      name: it.name || (isCatch ? '备用金 / 意外' : '未命名'),
      subs: it.subs || [], isCatch: isCatch,
      limit: lim, spent: sp, remain: lim - sp, over: lim > 0 && sp > lim,
      pct: lim > 0 ? Math.min(100, sp / lim * 100) : (sp > 0 ? 100 : 0),
      pctReal: lim > 0 ? sp / lim * 100 : 0
    };
  });
  const allocated = items.reduce((t, it) => t + it.limit, 0);

  return {
    limit: limit, spent: spent, remain: remain,
    total: total, passed: passed, left: left, phase: phase,
    pctSpent: limit > 0 ? Math.min(100, spent / limit * 100) : 0,   // 进度条用，封顶 100
    pctReal:  limit > 0 ? spent / limit * 100 : 0,                  // 文字用，超了就显示真实值
    pctTime:  Math.min(100, passed / total * 100),
    perDayLeft: left > 0 ? remain / left : 0,        // 今天起每天还能花
    perDayPlan: limit / total,
    aheadBy: spent - shouldBy,                       // >0 = 花超前了
    over: remain < 0,
    items: items,
    allocated: allocated,                            // 分项加起来分掉了多少
    unallocated: limit - allocated,                  // 总预算还没分配的部分
    other: other,                                    // 没归到任何分项的支出
    hasCatch: catchUsed
  };
}

function budFormHTML(b){
  const isNew = !b.id;
  const today = ymd(new Date());
  const from  = b.from || today;
  const to    = b.to   || ymd(addDays(parseYmd(from), 29));
  const days  = daysBetween(from, to);
  const limited = !!(b.subs && b.subs.length);
  const sel = {}; (b.subs || []).forEach(s => sel[s] = 1);

  let h = '<section class="card budform"><h3>'+(isNew ? '新建预算' : '修改预算')+'</h3><div class="body">';
  h += '<div class="rowhead"><div>叫什么名字</div></div>';
  h += '<input class="tinp" id="bName" type="text" placeholder="例：11月省钱 / 旅游预算" value="'+esc(b.name||'')+'">';

  h += '<div class="rowhead" style="margin-top:10px"><div>从哪天开始</div></div>';
  h += '<input class="tinp" id="bFrom" type="date" value="'+from+'">';

  h += '<div class="rowhead" style="margin-top:10px"><div>管多少天</div></div>';
  h += '<div class="bdays"><input class="tinp" id="bDays" type="number" inputmode="numeric" min="1" value="'+days+'">'
     + '<span>天，到</span><input class="tinp" id="bTo" type="date" value="'+to+'"></div>';
  h += '<div class="qquick">'
     + [7,14,30,60,90].map(d => '<button class="qb" data-bd="'+d+'">'+d+' 天</button>').join('')
     + '<button class="qb" data-bd="month">到月底</button></div>';

  h += '<div class="rowhead" style="margin-top:10px"><div>总预算：这段时间一共最多花多少（日元）</div></div>';
  h += '<input class="tinp" id="bLimit" type="text" inputmode="decimal" placeholder="例：200000" value="'+esc(b.limit||'')+'">';
  h += '<div class="hint">这里也能写算式，比如 <b>150000+50000</b>，离开输入框自动算。</div>';

  h += '<label class="swline" style="margin-top:8px"><input type="checkbox" id="bLimitCat"'+(limited?' checked':'')+'>'
     + '<span>整个预算只算某几个分类（不勾＝算全部支出）</span></label>';
  if (limited) {
    h += '<div class="bcats">';
    QGROUPS.forEach(g => {
      if (g.id === 'income') return;
      g.subs.forEach(s => {
        h += '<label class="bchip'+(sel[s.id]?' on':'')+'">'
           + '<input type="checkbox" data-bsub="'+s.id+'"'+(sel[s.id]?' checked':'')+'>'
           + esc(g.subs.length>1 ? g.name+'·'+s.name : g.name) + '</label>';
      });
    });
    h += '</div>';
  }

  /* ---------- 分项预算 ---------- */
  const items = budItems(b);
  const takenBy = {};
  items.forEach((it, i) => (it.subs || []).forEach(s => { if (takenBy[s] === undefined) takenBy[s] = i; }));

  h += '<div style="margin-top:16px;border-top:1px solid var(--line2);padding-top:12px">';
  h += '<div style="font-weight:700;font-size:14px;margin-bottom:4px">分项预算（可不填）</div>';
  h += '<div class="hint" style="padding:0 0 8px">'
     + '把总预算拆开，比如「吃饭 6 万、娱乐 2 万、日用品 1 万」。<br>'
     + '再加一个<b>不绑分类</b>的「备用金 / 意外」，<b>所有没归到分项的支出都会算在它头上</b>。</div>';

  if (!items.length) h += '<div class="hint">还没有分项。点下面的按钮加。</div>';

  items.forEach((it, i) => {
    const isCatch = !(it.subs && it.subs.length);
    const open = budCatOpen === i;
    h += '<div class="bitem" data-i="'+i+'">';
    h += '<input class="tinp bi-name" type="text" placeholder="分项名称" value="'+esc(it.name||'')+'">';
    h += '<input class="tinp bi-limit" type="text" inputmode="decimal" placeholder="金额" value="'+esc(it.limit||'')+'">';
    h += '<div class="bi-act">';
    h += '<button class="qb bi-cat'+(open?' on':'')+'" data-bi="'+i+'">'
       + (isCatch ? '不绑分类（备用金）' : '分类 '+it.subs.length+' 项') + ' ▾</button>';
    h += '<button class="qb bi-del" data-bidel="'+i+'">删除</button>';
    h += '</div>';
    if (open) {
      h += '<div class="bchips">';
      QGROUPS.forEach(g => {
        if (g.id === 'income') return;
        g.subs.forEach(s => {
          const mine = (it.subs || []).indexOf(s.id) >= 0;
          const owner = takenBy[s.id];
          const busy = !mine && owner !== undefined;
          h += '<label class="bchip'+(mine?' on':'')+(busy?' busy':'')+'"'
             + (busy ? ' title="已经被「'+esc(items[owner].name||'另一个分项')+'」占用"' : '') + '>'
             + '<input type="checkbox" data-isub="'+s.id+'" data-ii="'+i+'"'
             + (mine?' checked':'') + (busy?' disabled':'') + '>'
             + esc(g.subs.length>1 ? g.name+'·'+s.name : g.name) + '</label>';
        });
      });
      h += '</div><div class="hint">一个分类只能归一个分项，灰掉的是别的分项已经占了。<br>'
         + '一个都不勾＝这是「备用金 / 意外」，会收所有没归类的支出。</div>';
    }
    h += '</div>';
  });

  h += '<div class="qquick" style="margin-top:8px">';
  QGROUPS.forEach(g => {
    if (g.id === 'income') return;
    const used = g.subs.every(s => takenBy[s.id] !== undefined);
    if (used) return;
    h += '<button class="qb" data-badd="'+g.id+'">＋ '+esc(g.name)+'</button>';
  });
  h += '<button class="qb" data-badd="__catch">＋ 备用金 / 意外</button>';
  h += '<button class="qb" data-badd="__blank">＋ 空白分项</button>';
  h += '</div>';

  h += '<div class="balloc" id="bAlloc"></div>';
  h += '</div>';

  h += '<div class="btnrow" style="margin-top:14px">'
     + '<button class="btn primary" id="bSave">保存</button>'
     + '<button class="btn" id="bCancel">取消</button>'
     + (isNew ? '' : '<button class="btn danger" id="bDel">删除这个预算</button>')
     + '</div>';
  h += '</div></section>';
  return h;
}

function budCardHTML(b){
  const s = budStat(b);
  const cls = s.over ? 'over' : (s.phase === 'after' ? 'done' : (s.aheadBy > 0 ? 'ahead' : 'ok'));
  const phaseTxt = s.phase === 'before' ? '还没开始'
                 : s.phase === 'after'  ? '已结束'
                 : '剩 ' + s.left + ' 天';

  let h = '<section class="card budcard '+cls+'" data-bid="'+b.id+'">';
  h += '<h3><span>'+esc(b.name || '未命名预算')+'</span>'
     + '<span style="font-weight:400;font-size:12px;color:var(--ink-soft)">'+phaseTxt+'</span></h3>';
  h += '<div class="body">';

  h += '<div class="budtop">'
     + '<div class="budlb">'+(s.over ? '超支了' : '还能花')+'</div>'
     + '<div class="budbig">'+yen(Math.abs(s.remain))+'</div>'
     + '<div class="budsub">'+b.from.replace(/-/g,'/')+' ~ '+b.to.replace(/-/g,'/')
     + '　共 '+s.total+' 天　预算 '+yen(s.limit)+'</div>'
     + '</div>';

  h += '<div class="budbar"><span class="fill" style="width:'+s.pctSpent.toFixed(1)+'%"></span>'
     + '<span class="mark" style="left:'+s.pctTime.toFixed(1)+'%"></span></div>';
  h += '<div class="budlegend"><span>已花 '+yen(s.spent)+'（'+s.pctReal.toFixed(0)+'%）</span>'
     + '<span>时间过了 '+s.pctTime.toFixed(0)+'%</span></div>';

  h += '<div class="kv"><span>今天起每天还能花</span><b'+(s.over?' style="color:var(--up)"':'')+'>'
     + (s.over ? '已超支' : (s.left > 0 ? yen(s.perDayLeft) : '—')) + '</b></div>';
  h += '<div class="kv"><span>原计划日均</span><b>'+yen(s.perDayPlan)+'</b></div>';
  h += '<div class="kv"><span>已过天数的实际日均</span><b>'
     + (s.passed > 0 ? yen(s.spent / s.passed) : '—') + '</b></div>';
  if (s.phase === 'on') {
    const a = Math.round(Math.abs(s.aheadBy));
    h += '<div class="kv"><span>按进度比</span><b class="'+(s.aheadBy > 0 ? 'up' : 'down')+'">'
       + (s.aheadBy > 0 ? '超前花了 ' + yen(a) : '省下 ' + yen(a)) + '</b></div>';
  }

  /* ---- 分项明细 ---- */
  if (s.items.length) {
    h += '<div class="bsplit"><div class="bsplit-h">分项</div>';
    s.items.forEach(it => {
      h += '<div class="brow'+(it.over?' over':'')+'">';
      h += '<div class="brow-t"><span>'+esc(it.name)
         + (it.isCatch ? '<i class="btag">兜底</i>' : '') + '</span>'
         + '<b>'+yen(it.spent)+' / '+yen(it.limit)+'</b></div>';
      h += '<div class="bminibar"><span style="width:'+it.pct.toFixed(1)+'%"></span></div>';
      h += '<div class="brow-b"><span>'
         + (it.limit > 0 ? (it.over ? '超了 '+yen(it.spent-it.limit) : '还能花 '+yen(it.remain)) : '没设上限')
         + '</span><span>'+(it.limit>0 ? it.pctReal.toFixed(0)+'%' : '')+'</span></div>';
      h += '</div>';
    });
    if (!s.hasCatch && s.other > 0) {
      h += '<div class="brow nolimit"><div class="brow-t"><span>其它（没归到分项）</span>'
         + '<b>'+yen(s.other)+'</b></div>'
         + '<div class="brow-b"><span>没给它设预算，建议加一个「备用金 / 意外」</span><span></span></div></div>';
    }
    h += '<div class="kv" style="margin-top:8px"><span>分项合计已分配</span><b>'+yen(s.allocated)+'</b></div>';
    h += '<div class="kv"><span>' + (s.unallocated >= 0 ? '总预算里还没分配' : '分项加起来已经超过总预算')
       + '</span><b class="'+(s.unallocated < 0 ? 'up' : '')+'">'+yen(Math.abs(s.unallocated))+'</b></div>';
    h += '</div>';
  }

  if (b.subs && b.subs.length) {
    h += '<div class="hint" style="margin-top:6px">整个预算只算：'
       + b.subs.map(x => esc(subLabel(x))).join('、') + '</div>';
  }

  h += '<div class="btnrow" style="margin-top:10px">'
     + '<button class="btn" data-bsee="'+b.id+'">看明细</button>'
     + '<button class="btn" data-bedit="'+b.id+'">修改</button>'
     + '<button class="btn" data-bcopy="'+b.id+'">再来一期</button>'
     + '</div>';
  h += '</div></section>';
  return h;
}

function renderBudget(){
  const today = ymd(new Date());
  const list = budList().sort((x, y) => {
    const rank = b => (today < b.from ? 1 : (today > b.to ? 2 : 0));
    return (rank(x) - rank(y)) || (x.from < y.from ? 1 : -1);
  });

  let h = '';
  if (budEdit !== 'new') {
    h += '<div class="btnrow" style="margin-bottom:12px">'
       + '<button class="btn primary" id="budNew">＋ 新建一个预算</button></div>';
  }
  if (budEdit === 'new') h += budFormHTML({});

  if (!list.length && budEdit !== 'new') {
    h += '<div class="tip">还没有预算。<br>'
       + '点上面「新建一个预算」，设一个「从今天起 30 天最多花 5 万」之类的目标，'
       + '这一页就会实时显示<b>已经花了多少、还能花多少、今天起每天还能花多少</b>。<br>'
       + '可以同时建好几个，各管各的时间段，互不影响。</div>';
  }

  list.forEach(b => {
    h += (budEdit === b.id) ? budFormHTML(b) : budCardHTML(b);
  });

  if (list.length) {
    h += '<div class="hint">预算只统计日常记的账，<b>不含月度固定支出</b>（房租、通信费这些按月走，'
       + '摊到任意区间没意义）。</div>';
  }

  app.innerHTML = h;
  bindBudget();
}

function bindBudget(){
  const $ = id => document.getElementById(id);

  const nb = $('budNew');
  if (nb) nb.onclick = () => { budEdit = 'new'; renderBudget(); };

  /* ---- 表单 ---- */
  const fFrom = $('bFrom'), fDays = $('bDays'), fTo = $('bTo');
  const syncTo = () => {                       // 天数 → 结束日期
    if (!fFrom || !fDays || !fTo) return;
    const n = Math.max(1, parseInt(fDays.value, 10) || 1);
    fTo.value = ymd(addDays(parseYmd(fFrom.value), n - 1));
  };
  const syncDays = () => {                     // 结束日期 → 天数
    if (!fFrom || !fDays || !fTo) return;
    fDays.value = Math.max(1, daysBetween(fFrom.value, fTo.value));
  };
  if (fDays) fDays.oninput = syncTo;
  if (fFrom) fFrom.onchange = syncTo;
  if (fTo)   fTo.onchange = syncDays;

  document.querySelectorAll('.qb[data-bd]').forEach(x => x.onclick = () => {
    if (!fFrom) return;
    if (x.dataset.bd === 'month') {
      const d = parseYmd(fFrom.value);
      fTo.value = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      syncDays();
    } else {
      fDays.value = x.dataset.bd; syncTo();
    }
  });

  const lc = $('bLimitCat');
  if (lc) lc.onchange = () => {
    const cur = budEdit === 'new' ? {} : (DB.budgets[budEdit] || {});
    const draft = readBudForm(cur);
    draft.subs = lc.checked ? (draft.subs && draft.subs.length ? draft.subs : ALLSUBS.slice()) : null;
    budDraft = draft;
    renderBudgetKeepDraft(draft);
  };
  document.querySelectorAll('input[data-bsub]').forEach(c => c.onchange = () => {
    c.closest('.bchip').classList.toggle('on', c.checked);
  });

  /* ---- 分项 ---- */
  const reRender = draft => { budDraft = draft; renderBudgetKeepDraft(draft); };
  // 有未保存的草稿就以草稿为准，否则用已存的记录。
  // （分项的「绑定分类」不在输入框里，只能从这里带过来，拿错了就会丢选择）
  const cur = () => budDraft || (budEdit === 'new' ? {} : (DB.budgets[budEdit] || {}));

  document.querySelectorAll('[data-badd]').forEach(x => x.onclick = () => {
    const d = readBudForm(cur());
    d.items = d.items || [];
    const k = x.dataset.badd;
    if (k === '__catch')      d.items.push({ name:'备用金 / 意外', subs:[], limit:'' });
    else if (k === '__blank') d.items.push({ name:'', subs:[], limit:'' });
    else {
      const g = QGROUPS.find(q => q.id === k);
      const taken = {};
      d.items.forEach(it => (it.subs||[]).forEach(s => taken[s] = 1));
      d.items.push({ name:g.name, subs:g.subs.map(s => s.id).filter(s => !taken[s]), limit:'' });
    }
    budCatOpen = null;
    reRender(d);
  });

  document.querySelectorAll('[data-bidel]').forEach(x => x.onclick = () => {
    const d = readBudForm(cur());
    d.items.splice(+x.dataset.bidel, 1);
    budCatOpen = null;
    reRender(d);
  });

  document.querySelectorAll('.bi-cat').forEach(x => x.onclick = () => {
    const i = +x.dataset.bi;
    const d = readBudForm(cur());
    budCatOpen = (budCatOpen === i) ? null : i;
    reRender(d);
  });

  document.querySelectorAll('input[data-isub]').forEach(c => c.onchange = () => {
    const d = readBudForm(cur());
    const i = +c.dataset.ii, id = c.dataset.isub;
    const it = d.items[i]; if (!it) return;
    it.subs = (it.subs || []).filter(s => s !== id);
    if (c.checked) it.subs.push(id);
    reRender(d);
  });

  /* 已分配 / 未分配，边打边更新 */
  const alloc = () => {
    const box = $('bAlloc'); if (!box) return;
    const tot = num(calcExpr($('bLimit') ? $('bLimit').value : 0) != null
                    ? calcExpr($('bLimit').value) : ($('bLimit') ? $('bLimit').value : 0));
    let sum = 0;
    document.querySelectorAll('.bi-limit').forEach(el => {
      const v = calcExpr(el.value); sum += (v != null ? v : num(el.value));
    });
    const left = tot - sum;
    box.className = 'balloc' + (left < 0 ? ' bad' : '');
    box.innerHTML = '分项合计 <b>'+yen(sum)+'</b>　/　总预算 <b>'+yen(tot)+'</b>　→　'
      + (left >= 0 ? '还没分配 <b>'+yen(left)+'</b>' : '<b>超出总预算 '+yen(-left)+'</b>');
  };
  alloc();
  const bl = $('bLimit'); if (bl) bl.oninput = alloc;
  document.querySelectorAll('.bi-limit').forEach(el => el.oninput = alloc);

  const sv = $('bSave');
  if (sv) sv.onclick = () => {
    const b = readBudForm(cur());
    if (!b.limit || num(b.limit) <= 0) return alert('先填一个金额（这段时间最多花多少）。');
    if (b.to < b.from) return alert('结束日期比开始日期还早，改一下。');
    if (!b.name) b.name = b.from.slice(5).replace('-','/') + ' 起 ' + daysBetween(b.from, b.to) + ' 天';
    b.items = (b.items || []).filter(it => (it.name||'').trim() || num(it.limit) || (it.subs||[]).length);
    b.id = (budEdit && budEdit !== 'new') ? budEdit : newBudId();
    b._t = nowTs();
    DB.budgets[b.id] = b;
    budDraft = null; budEdit = null; budCatOpen = null;
    save(); renderBudget(); toast('预算已保存');
  };

  const cc = $('bCancel');
  if (cc) cc.onclick = () => { budDraft = null; budEdit = null; budCatOpen = null; renderBudget(); };

  const dl = $('bDel');
  if (dl) dl.onclick = () => {
    if (!confirm('删掉这个预算？账目本身不会动。')) return;
    DB.tomb['b:' + budEdit] = nowTs();
    delete DB.budgets[budEdit];
    budDraft = null; budEdit = null; budCatOpen = null;
    save(); renderBudget(); toast('已删除');
  };

  /* ---- 卡片上的按钮 ---- */
  document.querySelectorAll('[data-bedit]').forEach(x => x.onclick = () => {
    budDraft = null; budCatOpen = null; budEdit = x.dataset.bedit; renderBudget();
  });
  document.querySelectorAll('[data-bcopy]').forEach(x => x.onclick = () => {
    const o = DB.budgets[x.dataset.bcopy]; if (!o) return;
    const len = daysBetween(o.from, o.to);
    const from = ymd(addDays(parseYmd(o.to), 1));
    budDraft = { name:o.name, from:from, to:ymd(addDays(parseYmd(from), len - 1)),
                 limit:o.limit, subs:o.subs,
                 items: budItems(o).map(it => ({ name:it.name, limit:it.limit, subs:(it.subs||[]).slice() })) };
    budEdit = 'new'; budCatOpen = null; renderBudgetKeepDraft(budDraft);
  });
  document.querySelectorAll('[data-bsee]').forEach(x => x.onclick = () => {
    const o = DB.budgets[x.dataset.bsee]; if (!o) return;
    setQ({ from:o.from, to:o.to, subs:(o.subs && o.subs.length) ? o.subs.slice() : ALLSUBS.slice() });
    view = 'query'; render();
  });
}

/* 新建/复制时，表单里的临时内容（还没保存） */
let budDraft = null;
let budCatOpen = null;                 // 哪个分项正展开着分类选择
const numStr = v => { const c = calcExpr(v); return String(c != null ? c : (v || '')).trim(); };

function readBudForm(base){
  const $ = id => document.getElementById(id);
  const subs = [];
  document.querySelectorAll('input[data-bsub]').forEach(c => { if (c.checked) subs.push(c.dataset.bsub); });
  const limited = $('bLimitCat') && $('bLimitCat').checked;

  /* 分项：名称和金额从输入框读，分类从上一轮的 draft/记录里取（选分类是另外的动作） */
  const prev = budItems(base);
  const rows = document.querySelectorAll('.bitem');
  let items;
  if (rows.length) {
    items = Array.prototype.map.call(rows, row => {
      const i = +row.dataset.i;
      const nameEl = row.querySelector('.bi-name'), limEl = row.querySelector('.bi-limit');
      return {
        name:  nameEl ? nameEl.value.trim() : ((prev[i] || {}).name || ''),
        limit: limEl  ? numStr(limEl.value) : ((prev[i] || {}).limit || ''),
        subs:  ((prev[i] || {}).subs || []).slice()
      };
    });
  } else items = prev.map(it => ({ name:it.name, limit:it.limit, subs:(it.subs||[]).slice() }));

  return {
    name:  ($('bName') ? $('bName').value : base.name || '').trim(),
    from:  $('bFrom') ? $('bFrom').value : base.from,
    to:    $('bTo')   ? $('bTo').value   : base.to,
    limit: $('bLimit') ? numStr($('bLimit').value) : (base.limit || ''),
    subs:  limited ? subs : null,
    items: items
  };
}
function renderBudgetKeepDraft(draft){
  const keep = budEdit;
  const saved = (keep && keep !== 'new') ? DB.budgets[keep] : null;
  if (saved) { const tmp = Object.assign({}, saved, draft); tmp.id = saved.id;
               app.innerHTML = budFormHTML(tmp); bindBudget(); return; }
  app.innerHTML = budFormHTML(draft || {});
  bindBudget();
}

/* =====================================================================
   视图：查询 —— 任意起止日期 + 任意分类组合
   ===================================================================== */
const QGROUPS = CATS.map(c => ({
  id: c.id, name: c.name,
  subs: c.subs.map(s => ({ id: s[0], name: s[1] || c.name }))
})).concat([{ id:'income', name:'收入', subs:[{ id:'income', name:'收入' }] }]);
const ALLQ = [];
QGROUPS.forEach(g => g.subs.forEach(s => ALLQ.push(s.id)));

function subLabel(sid){
  for (const g of QGROUPS) for (const s of g.subs) if (s.id === sid)
    return (g.subs.length > 1) ? (g.name + '·' + s.name) : g.name;
  return sid;
}
function catNameOf(sid){
  for (const g of QGROUPS) for (const s of g.subs) if (s.id === sid) return g.name;
  return sid;
}
function allDayKeys(){ return Object.keys(DB.days).sort(); }

function getQ(){
  const q = SC.q || {};
  const today = ymd(new Date());
  return {
    from: q.from || today.slice(0,8) + '01',
    to:   q.to   || today,
    // 注意要分清「没设置过」和「一个都没勾」——
    // 写成 q.subs.length ? ... : 全选 的话，点「全不选」会立刻弹回全选
    subs: Array.isArray(q.subs) ? q.subs.slice() : ALLQ.slice()
  };
}
function setQ(patch){
  SC.q = Object.assign(getQ(), patch);
  saveSC();
}

function renderQuery(){
  const q = getQ();
  const sel = {}; q.subs.forEach(s => sel[s] = 1);
  const ks = allDayKeys().filter(k => k >= q.from && k <= q.to);

  /* ---- 取数 ---- */
  const perSub = {}, perCat = {};
  let spend = 0, income = 0, lines = 0;
  const detail = [];                       // [{ds, rows:[{sid,n,a}], note, sum}]
  ks.forEach(ds => {
    const d = DB.days[ds], picked = [];
    let daySum = 0, dayInc = 0;
    for (const sid in (d.rows || {})) {
      if (!sel[sid]) continue;
      (d.rows[sid] || []).forEach(r => {
        const a = num(r.a);
        if (!a && !(r.n || '').trim()) return;
        picked.push({ sid: sid, n: r.n || '', a: a });
        lines++;
        perSub[sid] = (perSub[sid] || 0) + a;
        const cn = catNameOf(sid);
        perCat[cn] = (perCat[cn] || 0) + a;
        if (sid === 'income') { income += a; dayInc += a; }
        else { spend += a; daySum += a; }
      });
    }
    // 只有真的有选中的条目才列出来；备注是附带显示的，不单独成行
    if (picked.length) detail.push({ ds: ds, rows: picked, note: (d.note||'').trim(), sum: daySum, inc: dayInc });
  });
  detail.reverse();                        // 新的在上面

  const nDays = ks.length;
  const spanDays = Math.max(1, Math.round((parseYmd(q.to) - parseYmd(q.from)) / 864e5) + 1);

  /* ---- 时间段 ---- */
  let h = '<section class="card"><h3>看哪段时间</h3><div class="body">';
  h += '<div class="qdates">'
     + '<input class="tinp" type="date" id="qFrom" value="'+q.from+'">'
     + '<span class="qto">~</span>'
     + '<input class="tinp" type="date" id="qTo" value="'+q.to+'">'
     + '</div>';
  h += '<div class="qquick">'
     + [['t7','最近 7 天'],['t30','最近 30 天'],['tw','本周'],['tm','本月'],
        ['lm','上个月'],['ty','今年'],['all','全部']]
        .map(x => '<button class="qb" data-q="'+x[0]+'">'+x[1]+'</button>').join('')
     + '</div>';
  h += '<div class="hint">这段里有记录的天数：'+nDays+' 天（区间共 '+spanDays+' 天）</div>';
  h += '</div></section>';

  /* ---- 分类选择 ---- */
  const allOn = q.subs.length === ALLQ.length;
  h += '<section class="card"><h3>看哪些项目'
     + '<span style="font-weight:400;font-size:12px;color:var(--ink-soft)">已选 '+q.subs.length+' / '+ALLQ.length+'</span>'
     + '</h3><div class="body">';
  h += '<div class="qquick" style="margin-bottom:8px">'
     + '<button class="qb" data-pick="all">全选</button>'
     + '<button class="qb" data-pick="none">全不选</button>'
     + '<button class="qb" data-pick="spend">只看支出</button>'
     + '<button class="qb" data-pick="income">只看收入</button>'
     + '</div>';
  QGROUPS.forEach((g, i) => {
    const on = g.subs.every(s => sel[s.id]);
    const half = !on && g.subs.some(s => sel[s.id]);
    h += '<div class="qgrp'+(g.id==='income'?' inc':'')+'">';
    h += '<label class="qrow"><input type="checkbox" data-grp="'+g.id+'"'+(on?' checked':'')+'>'
       + '<span class="'+(half?'half':'')+'">'+(i+1)+'. '+g.name+'</span>'
       + '<b>'+((perCat[g.name]||0) ? yen(perCat[g.name]) : '')+'</b></label>';
    if (g.subs.length > 1) {
      h += '<div class="qsubs">' + g.subs.map(s =>
          '<label class="qrow sub"><input type="checkbox" data-sub="'+s.id+'"'+(sel[s.id]?' checked':'')+'>'
        + '<span>'+s.name+'</span><b>'+((perSub[s.id]||0)?yen(perSub[s.id]):'')+'</b></label>').join('')
        + '</div>';
    }
    h += '</div>';
  });
  h += '</div></section>';

  /* ---- 合计 ---- */
  h += '<div class="sumbar">'
     +  '<div class="box"><div class="lb">支出</div><div class="vl">'+yen(spend)+'</div></div>'
     +  '<div class="box inc"><div class="lb">收入</div><div class="vl">'+yen(income)+'</div></div>'
     +  '<div class="box bal"><div class="lb">结余</div><div class="vl">'+yen(income-spend)+'</div></div>'
     + '</div>';
  h += '<section class="card"><div class="body">'
     + '<div class="kv"><span>笔数</span><b>'+lines+' 笔</b></div>'
     + '<div class="kv"><span>有记录的天数</span><b>'+nDays+' 天</b></div>'
     + '<div class="kv"><span>日均支出（按区间 '+spanDays+' 天）</span><b>'+yen(spend/spanDays)+'</b></div>'
     + '<div class="kv"><span>有记录那几天的日均</span><b>'+yen(nDays?spend/nDays:0)+'</b></div>'
     + '<div class="btnrow" style="margin-top:10px"><button class="btn" id="qCsv">把这个结果导成 CSV</button></div>'
     + '</div></section>';

  /* ---- 分类占比 ---- */
  const catRows = Object.keys(perCat).filter(k => k !== '收入' && perCat[k])
                        .sort((a,b) => perCat[b] - perCat[a]);
  if (catRows.length) {
    h += '<section class="card"><h3>各项占多少</h3><div class="tablewrap"><table><thead><tr>'
       + '<th class="name">项目</th><th class="n">金额</th><th class="n">占比</th><th style="width:38%">　</th>'
       + '</tr></thead><tbody>';
    catRows.forEach(k => {
      const pc = spend ? (perCat[k] / spend * 100) : 0;
      h += '<tr><td class="name">'+esc(k)+'</td>'+cell(perCat[k])
         + '<td class="n">'+pc.toFixed(1)+'%</td>'
         + '<td><span class="qbar" style="width:'+Math.max(2,Math.round(pc))+'%"></span></td></tr>';
    });
    h += '</tbody></table></div></section>';
  }

  /* ---- 明细 ---- */
  h += '<section class="card"><h3>明细<span style="font-weight:400;font-size:12px;color:var(--ink-soft)">'
     + detail.length+' 天 · 新的在上面</span></h3><div class="body">';
  if (!detail.length) {
    h += '<div class="hint">这段时间里，选中的项目没有记录。换个日期或多勾几项试试。</div>';
  } else {
    detail.forEach(d => {
      const dt = parseYmd(d.ds);
      h += '<div class="qday"><div class="qdh"><span>'+d.ds.replace(/-/g,'/')+' '+wdOf(dt)+'</span>'
         + '<b>'+(d.sum?yen(d.sum):'')+(d.inc?' <span style="color:var(--blue)">+'+yen(d.inc)+'</span>':'')+'</b></div>';
      d.rows.forEach(r => {
        const isInc = r.sid === 'income';
        h += '<div class="qline'+(isInc?' inc':'')+'">'
           + '<span class="qtag">'+esc(subLabel(r.sid))+'</span>'
           + '<span class="qnm">'+esc(r.n || '（没写名称）')+'</span>'
           + '<b>'+(isInc?'+':'')+yen(r.a)+'</b></div>';
      });
      if (d.note) h += '<div class="qnote">📝 '+esc(d.note)+'</div>';
      h += '</div>';
    });
  }
  h += '</div></section>';

  app.innerHTML = h;
  bindQuery(q);
}

function bindQuery(q){
  const $ = id => document.getElementById(id);
  const go = patch => { setQ(patch); renderQuery(); };

  const f = $('qFrom'), t = $('qTo');
  if (f) f.onchange = e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) go({ from:e.target.value }); };
  if (t) t.onchange = e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) go({ to:e.target.value }); };

  document.querySelectorAll('.qb[data-q]').forEach(b => b.onclick = () => {
    const today = new Date(), k = b.dataset.q;
    let from, to = ymd(today);
    if (k === 't7')  from = ymd(addDays(today, -6));
    if (k === 't30') from = ymd(addDays(today, -29));
    if (k === 'tw')  { const ws = weekStart(today); from = ymd(ws); to = ymd(addDays(ws, 6)); }
    if (k === 'tm')  { from = ymd(today).slice(0,8) + '01'; }
    if (k === 'lm')  {
      const m = prevMonth(ymOf(today));
      const r = monthRange(m); from = r[0]; to = r[1];
    }
    if (k === 'ty')  { from = today.getFullYear() + '-01-01'; to = today.getFullYear() + '-12-31'; }
    if (k === 'all') { const ks = allDayKeys(); from = ks[0] || ymd(today); to = ks[ks.length-1] || ymd(today); }
    go({ from:from, to:to });
  });

  document.querySelectorAll('.qb[data-pick]').forEach(b => b.onclick = () => {
    const k = b.dataset.pick;
    if (k === 'all')    go({ subs: ALLQ.slice() });
    if (k === 'none')   go({ subs: [] });
    if (k === 'spend')  go({ subs: ALLQ.filter(s => s !== 'income') });
    if (k === 'income') go({ subs: ['income'] });
  });

  document.querySelectorAll('input[data-grp]').forEach(c => c.onchange = () => {
    const g = QGROUPS.find(x => x.id === c.dataset.grp);
    const ids = g.subs.map(s => s.id);
    let subs = getQ().subs.filter(s => ids.indexOf(s) < 0);
    if (c.checked) subs = subs.concat(ids);
    go({ subs: subs });
  });
  document.querySelectorAll('input[data-sub]').forEach(c => c.onchange = () => {
    const id = c.dataset.sub;
    let subs = getQ().subs.filter(s => s !== id);
    if (c.checked) subs.push(id);
    go({ subs: subs });
  });

  const csv = $('qCsv');
  if (csv) csv.onclick = () => {
    const sel = {}; q.subs.forEach(s => sel[s] = 1);
    const rows = [['日期','星期','大分类','小分类','项目名称','金额','收支','当日备注']];
    allDayKeys().filter(k => k >= q.from && k <= q.to).forEach(ds => {
      const d = DB.days[ds];
      for (const sid in (d.rows || {})) {
        if (!sel[sid]) continue;
        (d.rows[sid] || []).forEach(r => {
          const a = num(r.a);
          if (!a && !(r.n || '').trim()) return;
          const lab = subLabel(sid).split('·');
          rows.push([ds, wdOf(parseYmd(ds)), lab[0], lab[1] || lab[0],
                     r.n || '', a, sid === 'income' ? '收入' : '支出', (d.note||'').replace(/\n/g,' ')]);
        });
      }
    });
    const text = '﻿' + rows.map(r => r.map(x => '"' + String(x).replace(/"/g,'""') + '"').join(',')).join('\r\n');
    download('记账本查询_' + q.from + '_至_' + q.to + '.csv', text, 'text/csv');
    toast('已导出 ' + (rows.length - 1) + ' 笔');
  };
}

/* =====================================================================
   视图：数据
   ===================================================================== */
function renderData(){
  let dn = 0, rn = 0;
  for (const k in DB.days) { dn++; for (const s in DB.days[k].rows) rn += DB.days[k].rows[s].length; }
  const size = (JSON.stringify(DB).length/1024).toFixed(1);

  const lanBase = LAN.base() || '（未检测到，请手动填）';
  app.innerHTML =
    syncCardHTML(lanBase)
  + '<section class="card"><h3>备份与恢复</h3><div class="body">'
  +   '<div class="kv"><span>已记录天数</span><b>'+dn+' 天</b></div>'
  +   '<div class="kv"><span>记账条目</span><b>'+rn+' 条</b></div>'
  +   '<div class="kv"><span>月度总结</span><b>'+Object.keys(DB.months).length+' 个月</b></div>'
  +   '<div class="kv"><span>占用空间</span><b>'+size+' KB</b></div>'
  +   '<div class="btnrow" style="margin-top:12px">'
  +     '<button class="btn primary" id="expBtn">导出备份 (JSON)</button>'
  +     '<button class="btn" id="impBtn">导入备份</button>'
  +     '<button class="btn" id="csvBtn">导出明细 (CSV)</button>'
  +     '<input type="file" id="impFile" accept=".json,application/json" style="display:none">'
  +   '</div>'
  + '</div></section>'
  + '<section class="card"><h3>危险操作</h3><div class="body">'
  +   '<div class="hint">清空后无法恢复，请先导出备份。</div>'
  +   '<div class="btnrow"><button class="btn danger" id="clrBtn">清空全部数据</button></div>'
  + '</div></section>'
  + '<section class="card"><h3>使用说明</h3><div class="body" style="font-size:13.5px;line-height:1.8;color:var(--ink-soft)">'
  +   '· 在<b>「项目名称」</b>栏按 <b>回车</b> → 新增一行；行尾 <b>×</b> 删除该行。<br>'
  +   '· 在<b>「金额」</b>栏按 <b>回车</b> → 把这一格的算式算出来，光标留在原地，不会跳走。<br>'
  +   '　 比如输入 <b>80+90</b>，下面会显示「= ¥170」，按回车就变成 170。<br>'
  +   '　 支持 <b>＋ － × ÷</b> 和括号，也认全角符号和千分位逗号（<b>1,200+800</b>）。<br>'
  +   '　 <b>手机上</b>数字键盘没有这些符号，所以点进金额栏时键盘上方会浮出一条符号按钮。<br>'
  +   '· 支出显示黑字，收入显示蓝字。<br>'
  +   '· 周＝周一~周日；月度总结里可填房租等固定支出，并自动和上月对比。<br>'
  +   '· 数据自动保存，无需点保存按钮。'
  + '</div></section>';

  document.getElementById('expBtn').onclick = doExport;
  document.getElementById('csvBtn').onclick = doCSV;
  document.getElementById('impBtn').onclick = () => document.getElementById('impFile').click();
  document.getElementById('impFile').onchange = doImport;
  document.getElementById('clrBtn').onclick = () => {
    if (!confirm('确定要清空全部记账数据吗？此操作不可恢复。')) return;
    if (!confirm('再确认一次：真的要全部删除吗？')) return;
    const wipeAll = configured().length
      ? confirm('点「确定」＝连同步端（电脑服务器 / 云端）一起清空。\n点「取消」＝只清空这台设备，下次同步会从别的设备把数据拉回来。')
      : false;
    const nb = emptyDB();
    if (wipeAll) {
      const t = nowTs();
      Object.keys(DB.days).forEach(k => nb.tomb['d:'+k] = t);
      Object.keys(DB.months).forEach(k => nb.tomb['m:'+k] = t);
      Object.assign(nb.tomb, DB.tomb || {});
    }
    DB = nb; saveNow(); render(); toast('已清空');
    if (wipeAll) syncNow('wipe');
  };
  bindSyncUI();
}

/* ---------- 同步设置卡片 ---------- */
function syncCardHTML(lanBase){
  const g = SC.gist;
  let h = '<div class="tip">账目数据存在<b>各设备浏览器本地</b>，通过下面的同步在设备之间自动合并。'
        + '同一天两边都改过时，以<b>改得晚的</b>为准。</div>';

  h += '<section class="card"><h3>同步设置<button class="btn" id="syncBtn" style="padding:4px 10px;font-size:12.5px">立即同步</button></h3><div class="body">';

  /* 局域网 */
  h += '<div style="font-weight:700;margin:2px 0 6px">① 局域网同步（电脑当服务器）</div>';
  h += '<label class="swline"><input type="checkbox" id="lanOn"' + (SC.lan.on?' checked':'') + '><span>开启（电脑上双击「手机版启动.command」后生效）</span></label>';
  h += '<div class="rowhead" style="margin-top:6px"><div>服务器地址（留空＝自动）</div></div>';
  h += '<div style="display:flex;gap:6px"><input class="tinp" id="lanUrl" type="text" placeholder="'+esc(lanBase)+'" value="'+esc(SC.lan.url)+'">'
     + '<button class="btn" id="lanTest">测试</button></div>';
  h += '<div class="hint">当前使用：'+esc(LAN.base()||'（无）')+'　　数据文件在电脑上的 记账本/记账本数据.json</div>';

  /* 云 */
  h += '<div style="font-weight:700;margin:14px 0 6px;border-top:1px solid var(--line2);padding-top:12px">② 云同步（GitHub Gist · 在外面也能用）</div>';
  h += '<label class="swline"><input type="checkbox" id="gistOn"' + (g.on?' checked':'') + '><span>开启</span></label>';
  h += '<div class="rowhead" style="margin-top:6px"><div>GitHub 令牌（Token，只需 gist 权限）</div></div>';
  h += '<input class="tinp" id="gistTok" type="password" placeholder="ghp_… / github_pat_…" value="'+esc(g.token)+'">';
  h += '<div class="rowhead" style="margin-top:6px"><div>Gist ID（留空＝第一次同步时自动创建）</div></div>';
  h += '<input class="tinp" id="gistId" type="text" placeholder="自动创建" value="'+esc(g.id)+'">';
  h += '<div class="btnrow" style="margin-top:8px"><button class="btn primary" id="gistSave">保存并同步</button>'
     + (g.token ? '<button class="btn" id="gistScan">查找已有存档</button>' : '')
     + (g.id ? '<button class="btn" id="gistOpen">在 GitHub 打开</button>' : '') + '</div>';
  h += '<div class="hint">令牌只存在这台设备，不会写进备份文件。生成方法见「同步设置教程.md」。</div>';

  /* 配对码：另一台设备粘贴这一串就行，不用分别抄令牌和 Gist ID */
  if (g.token && g.id) {
    h += '<div style="margin-top:12px;padding:10px;border:1px dashed var(--line);border-radius:10px;background:#fdfbf6">';
    h += '<div style="font-weight:700;font-size:13.5px;margin-bottom:6px">配对码</div>';
    h += '<div class="hint" style="padding:0 0 6px">在另一台设备的下面那栏粘贴这串，就会连到<b>同一个</b>云端存档。</div>';
    h += '<div style="display:flex;gap:6px"><input class="tinp" id="pairOut" readonly value="'+esc(pairCode())+'">'
       + '<button class="btn" id="pairCopy">复制</button></div>';
    h += '</div>';
  }
  h += '<div class="rowhead" style="margin-top:10px"><div>粘贴另一台设备的配对码</div></div>';
  h += '<div style="display:flex;gap:6px"><input class="tinp" id="pairIn" type="text" placeholder="KKB1-…">'
     + '<button class="btn primary" id="pairApply">连接</button></div>';

  h += '<div class="btnrow" style="margin-top:10px"><button class="btn" id="gistMergeAll">合并全部云端存档</button></div>';
  h += '<div class="hint">云端有多个存档时（比如以前不小心建了好几个），这个会把它们全部读出来合成一份。</div>';

  const p = pendingCount();
  const localDays = Object.keys(DB.days).length;
  const cd = SC.cloudDays;
  const gap = (cd != null) ? (localDays - cd) : null;
  h += '<div style="margin-top:14px;border-top:1px solid var(--line2);padding-top:10px">';
  h += '<div class="kv"><span>本机记录</span><b>'+localDays+' 天</b></div>';
  h += '<div class="kv"><span>云端记录</span><b style="color:'
     + (gap === null ? 'var(--ink-soft)' : (gap > 0 ? 'var(--up)' : 'var(--down)')) + '">'
     + (cd == null ? '还没核对过' : cd + ' 天' + (gap > 0 ? '（少 ' + gap + ' 天！）' : '（一致 ✓）')) + '</b></div>';
  h += '<div class="kv"><span>云端核对时间</span><b>'+(SC.cloudAt?new Date(SC.cloudAt).toLocaleString():'—')+'</b></div>';
  h += '<div class="kv"><span>当前网络</span><b>'+(online()?'在线':'离线（照常记账，有网自动补传）')+'</b></div>';
  h += '<div class="kv"><span>待同步改动</span><b>'+(p?p+' 项':'无')+'</b></div>';
  h += '<div class="kv"><span>上次成功同步</span><b>'+(SC.last?new Date(SC.last).toLocaleString():'<span style="color:var(--up)">还没成功过</span>')+'</b></div>';
  h += '<div class="kv"><span>上次导出备份</span><b>'+(SC.lastExport?new Date(SC.lastExport).toLocaleString():'<span style="color:var(--up)">从未</span>')+'</b></div>';
  h += '<div class="kv"><span>离线可用</span><b>'+(offlineReady()?'✓ 已缓存，没网也能打开':'未启用（把网址装到主屏后生效）')+'</b></div>';
  h += '</div>';
  h += '<div class="hint" style="margin-top:8px">「云端记录」是每次同步后<b>真的把数据拉回来数过</b>的，不是推送没报错就算数。</div>';
  h += '</div></section>';

  h += '<section class="card"><h3>旅行时怎么用</h3><div class="body" style="font-size:13.5px;line-height:1.8;color:var(--ink-soft)">'
     + '· 出门<b>前</b>：在有网的地方把这个页面打开一次，并「添加到主屏幕」，页面就缓存到手机里了。<br>'
     + '· 飞机上 / 没信号：照常记账，右上角显示「✈ 离线 · N 项待同步」，数据先存在手机里。<br>'
     + '· 一有网（酒店 WiFi、买了当地卡）：自动把这几天的记录传上云端并合并，右上角变回「✓ 已同步」。<br>'
     + '· 回家连上家里 WiFi、电脑开着服务：云端和电脑上的账本也会自动对齐。<br>'
     + '· 保险起见，出门前和回家后各「导出备份」一次。'
     + '</div></section>';
  return h;
}
function bindSyncUI(){
  const $ = id => document.getElementById(id);
  const sb = $('syncBtn'); if (sb) sb.onclick = () => syncNow('manual');
  const lo = $('lanOn'); if (lo) lo.onchange = e => { SC.lan.on = e.target.checked; saveSC(); resetProbe(); syncNow('cfg'); renderData(); };
  const lu = $('lanUrl'); if (lu) lu.onchange = e => {
    let v = e.target.value.trim();
    if (v && !/^https?:\/\//.test(v)) v = 'http://' + v;
    SC.lan.url = v; saveSC(); resetProbe(); renderData();
  };
  const lt = $('lanTest'); if (lt) lt.onclick = async () => {
    const b = LAN.base();
    if (!b) return alert('还没有服务器地址。先在电脑上双击「手机版启动.command」，把窗口里显示的网址填进来。');
    try {
      const r = await fetch(b + '/api/ping', { cache:'no-store' });
      alert(r.ok ? '连接成功 ✅\n' + b : '连接失败：HTTP ' + r.status);
    } catch (e) { alert('连不上 ❌\n' + b + '\n\n检查：电脑上的服务是不是开着？手机和电脑在同一个 WiFi 吗？'); }
  };
  const go = $('gistOn'); if (go) go.onchange = e => { SC.gist.on = e.target.checked; saveSC(); if (e.target.checked) syncNow('cfg'); renderData(); };
  const gs = $('gistSave'); if (gs) gs.onclick = async () => {
    SC.gist.token = $('gistTok').value.trim();
    SC.gist.id    = $('gistId').value.trim();
    SC.gist.on    = !!SC.gist.token;
    lastErr = ''; failN = 0; nextTry = 0;
    saveSC();
    if (!SC.gist.token) { renderData(); return alert('请先填令牌。'); }
    await syncNow('manual');
    renderData();
  };
  const gop = $('gistOpen'); if (gop) gop.onclick = () => window.open('https://gist.github.com/' + SC.gist.id, '_blank');

  const gma = $('gistMergeAll'); if (gma) gma.onclick = async () => {
    if (!SC.gist.token) return alert('先填令牌。');
    gma.disabled = true; gma.textContent = '正在合并…';
    try {
      const list = await GIST.list();
      if (!list.length) { alert('你的账号里还没有任何记账本存档。'); return; }
      let merged = DB, read = 0, failed = 0;
      for (const g of list) {
        try { merged = mergeDB(merged, await GIST.pullById(g.id)); read++; }
        catch (e) { failed++; }
      }
      DB = merged; saveNow();
      SC.gist.id = list[0].id; SC.gist.on = true; saveSC();   // 以内容最多的那个为主存档
      lastErr = ''; failN = 0; nextTry = 0;
      await syncNow('manual');
      render();
      alert('合并完成。\n\n读取了 ' + read + ' 个存档'
        + (failed ? '（' + failed + ' 个读不到）' : '')
        + '\n现在一共 ' + Object.keys(DB.days).length + ' 天的记录。'
        + '\n\n多余的空存档可以去 gist.github.com 删掉。');
    } catch (e) {
      alert('合并失败：' + e.message);
    } finally { gma.disabled = false; gma.textContent = '合并全部云端存档'; }
  };

  const pc = $('pairCopy'); if (pc) pc.onclick = async () => {
    const el = $('pairOut');
    try { await navigator.clipboard.writeText(el.value); toast('配对码已复制'); }
    catch (e) { el.select(); try { document.execCommand('copy'); toast('配对码已复制'); } catch (x) { toast('请长按选中后复制'); } }
  };
  const pa = $('pairApply'); if (pa) pa.onclick = async () => {
    const v = $('pairIn').value.trim();
    if (!v) return alert('先粘贴另一台设备上的配对码。');
    const o = parsePair(v);
    if (!o) return alert('这串配对码看不懂，检查有没有复制全（开头是 KKB1-）。');
    SC.gist.token = o.t; SC.gist.id = o.g; SC.gist.on = true;
    lastErr = ''; failN = 0; nextTry = 0;
    saveSC();
    await syncNow('manual');
    renderData();
    toast('已连接到同一个云端存档');
  };
  const gsc = $('gistScan'); if (gsc) gsc.onclick = async () => {
    try {
      const list = await GIST.list();
      if (!list.length) return alert('你的 GitHub 账号里还没有记账本存档。点「保存并同步」会新建一个。');
      const cur = SC.gist.id;
      const txt = list.map((x,i) => (i+1) + '. ' + x.id.slice(0,10) + '…　'
        + (x.size/1024).toFixed(1) + ' KB　' + new Date(x.at).toLocaleString()
        + (x.id === cur ? '　←当前用的' : '')).join('\n');
      if (list.length === 1) return alert('找到 1 个存档：\n\n' + txt);
      const big = list[0];
      if (big.id === cur) return alert('找到 ' + list.length + ' 个存档：\n\n' + txt
        + '\n\n当前用的就是内容最多的那个。多出来的可以去 gist.github.com 删掉。');
      if (confirm('找到 ' + list.length + ' 个存档：\n\n' + txt
        + '\n\n要改用内容最多的那个吗？\n（这台设备现有的记录会合并进去，不会丢）')) {
        SC.gist.id = big.id; saveSC();
        await syncNow('manual'); renderData(); toast('已切换并合并');
      }
    } catch (e) { alert('查不了：' + e.message + '\n检查一下令牌是否正确、有没有 gist 权限。'); }
  };
}

/* ---- 配对码：把令牌和 Gist ID 打包成一串，方便在另一台设备上粘贴 ---- */
function b64e(s){ return btoa(unescape(encodeURIComponent(s))); }
function b64d(s){ return decodeURIComponent(escape(atob(s))); }
function pairCode(){
  try { return 'KKB1-' + b64e(JSON.stringify({ t:SC.gist.token, g:SC.gist.id })); }
  catch (e) { return ''; }
}
function parsePair(v){
  try {
    const o = JSON.parse(b64d(String(v).trim().replace(/^KKB1-/, '')));
    if (o && o.t && o.g) return o;
  } catch (e) {}
  return null;
}
function download(name, text, type){
  const b = new Blob([text], { type: type || 'application/json' });
  const u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(u); a.remove(); }, 500);
}
function doExport(){
  saveNow();
  download('记账本备份_' + ymd(new Date()) + '.json', JSON.stringify(DB, null, 1));
  SC.lastExport = nowTs(); saveSC();
  refreshStatus();
  toast('已导出备份文件');
}
function doCSV(){
  const rows = [['日期','大分类','小分类','项目名称','金额','收支']];
  Object.keys(DB.days).sort().forEach(ds => {
    CATS.forEach(c => c.subs.forEach(s => {
      dayRows(ds, s[0]).forEach(r => {
        if ((r.n||'').trim() || num(r.a)) rows.push([ds, c.name, s[1]||c.name, r.n||'', num(r.a), '支出']);
      });
    }));
    dayRows(ds, INC).forEach(r => {
      if ((r.n||'').trim() || num(r.a)) rows.push([ds, '收入', '收入', r.n||'', num(r.a), '收入']);
    });
  });
  Object.keys(DB.months).sort().forEach(m => {
    fixedRows(m).forEach(r => {
      if ((r.n||'').trim() || num(r.a)) rows.push([m, '固定支出', '固定支出', r.n||'', num(r.a), '支出']);
    });
  });
  const csv = '﻿' + rows.map(r => r.map(x => '"' + String(x).replace(/"/g,'""') + '"').join(',')).join('\r\n');
  download('记账本明细_' + ymd(new Date()) + '.csv', csv, 'text/csv');
  toast('已导出 CSV');
}
function doImport(e){
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const o = JSON.parse(rd.result);
      if (!o || typeof o !== 'object' || !o.days) throw 0;
      const mode = confirm('点「确定」＝与现有数据智能合并（同一天以修改时间晚的为准）\n点「取消」＝完全覆盖现有数据');
      if (mode) {
        const t = nowTs() - 1;
        for (const k in o.days) if (!o.days[k]._t) o.days[k]._t = t;      // 老备份没有时间戳，视作刚刚
        for (const k in o.months) if (!o.months[k]._t) o.months[k]._t = t;
        DB = mergeDB(DB, o);
      } else {
        DB = Object.assign(emptyDB(), o);
        DB.days = DB.days||{}; DB.months = DB.months||{}; DB.tomb = DB.tomb||{};
      }
      saveNow(); render(); toast('导入成功'); syncNow('import');
    } catch (x) { alert('文件格式不对，请选择本程序导出的 JSON 备份文件。'); }
  };
  rd.readAsText(f);
  e.target.value = '';
}

/* =====================================================================
   同步：局域网（电脑当服务器） + 云端（GitHub Gist）
   合并规则：以「天」和「月」为最小单位，各自带修改时间，改得晚的赢。
   ===================================================================== */
const SKEY = 'kakeibo_sync_v1';
let SC = loadSC();
function loadSC(){
  try { const s = localStorage.getItem(SKEY); if (s) return Object.assign(defSC(), JSON.parse(s)); }
  catch(e){}
  return defSC();
}
function defSC(){
  return { lan:{ on:true, url:'' }, gist:{ on:false, token:'', id:'' },
           last:0, migTax:0, lastExport:0, cloudDays:null, cloudMonths:null, cloudAt:0 };
}

/* 「税费」是后来加的固定支出项。以前就建好的月份里没有这一行，
   在本机补一次（只补一次，之后你删掉它就不会再冒出来）。 */
function migrateTax(){
  if (SC.migTax) return;
  SC.migTax = 1; saveSC();
  let changed = false;
  for (const m in DB.months) {
    const o = DB.months[m];
    if (!o.fixed) o.fixed = [];
    if (o.fixed.some(r => String(r.n || '').trim() === '税费')) continue;
    o.fixed.push({ n:'税费', a:'' });
    const t = nowTs();
    o._t = t; o.t = o.t || {}; o.t.fixed = t;      // 盖时间戳，好让它同步到别的设备
    changed = true;
  }
  if (changed) { saveNow(); schedSync(); }
}
function saveSC(){ try { localStorage.setItem(SKEY, JSON.stringify(SC)); } catch(e){} }

/* ---- 合并 ---- */
function dayScore(d){
  if (!d) return -1;
  let n = (d.note||'').trim() ? 1 : 0;
  for (const k in (d.rows||{})) (d.rows[k]||[]).forEach(r => { if ((r.n||'').trim() || String(r.a||'').trim()) n++; });
  return n;
}
function monScore(o){
  if (!o) return -1;
  let n = (o.note||'').trim() ? 1 : 0;
  (o.fixed||[]).forEach(r => { if ((r.n||'').trim() || String(r.a||'').trim()) n++; });
  return n;
}
/* 时间戳一样时的兜底：先比内容多少，再比 JSON 字典序（保证 merge(a,b) === merge(b,a)）*/
function canon(o){                       // 键名排序的 JSON，和 server.py 那边字节一致
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
}
function tiePick(x, y, score){
  const sx = score(x), sy = score(y);
  if (sx !== sy) return sx > sy ? x : y;
  return canon(x) <= canon(y) ? x : y;
}
/* 某个分组（分类 / 备注）的修改时间。
   有细粒度时间戳就用它；没有（老数据）则用整条记录的时间，
   但前提是这条记录里确实有这个分组的内容——否则算 0，免得空的一方把有内容的一方顶掉。 */
function grpT(rec, key, has){
  if (!rec) return 0;
  if (rec.t && rec.t[key] != null) return rec.t[key];
  return has ? (rec._t || 0) : 0;
}
function rowsScore(rs){ return rs ? rs.reduce((n,r)=> n + (((r.n||'').trim()||String(r.a||'').trim()) ? 1 : 0), 0) : -1; }
function noteScore(s){ return s == null ? -1 : String(s).trim().length; }

/* 按「这一天的某个分类」分别合并，同一天里手机改交通、电脑改买菜可以共存 */
const EMPTY_DAY = { rows:{}, note:'', _t:0, t:{} };
const EMPTY_MON = { fixed:[], note:'', _t:0, t:{} };
function mergeDayRec(x, y){
  if (!x && !y) return null;
  x = x || EMPTY_DAY; y = y || EMPTY_DAY;      // 单边也走同一条路，保证输出形状稳定（幂等）
  const out = { rows:{}, note:'', _t: Math.max(x._t||0, y._t||0), t:{} };
  const sids = {};
  for (const k in (x.rows||{})) sids[k] = 1;
  for (const k in (y.rows||{})) sids[k] = 1;
  for (const s in sids) {
    const rx = (x.rows||{})[s], ry = (y.rows||{})[s];
    const tx = grpT(x, s, !!rx), ty = grpT(y, s, !!ry);
    let use;
    if (tx !== ty) use = (tx > ty ? rx : ry) || rx || ry;
    else use = tiePick(rx, ry, rowsScore);
    if (use) { out.rows[s] = use; out.t[s] = Math.max(tx, ty); }
  }
  const nx = grpT(x, '_note', !!(x.note||'').trim()), ny = grpT(y, '_note', !!(y.note||'').trim());
  out.note = nx !== ny ? (nx > ny ? (x.note||'') : (y.note||''))
                       : tiePick(x.note||'', y.note||'', noteScore);
  out.t._note = Math.max(nx, ny);
  return out;
}
function mergeMonRec(x, y){
  if (!x && !y) return null;
  x = x || EMPTY_MON; y = y || EMPTY_MON;
  const out = { fixed:[], note:'', _t: Math.max(x._t||0, y._t||0), t:{} };
  const fx = grpT(x, 'fixed', rowsScore(x.fixed) > 0), fy = grpT(y, 'fixed', rowsScore(y.fixed) > 0);
  out.fixed = fx !== fy ? (fx > fy ? (x.fixed||[]) : (y.fixed||[]))
                        : tiePick(x.fixed||[], y.fixed||[], rowsScore);
  out.t.fixed = Math.max(fx, fy);
  const nx = grpT(x, '_note', !!(x.note||'').trim()), ny = grpT(y, '_note', !!(y.note||'').trim());
  out.note = nx !== ny ? (nx > ny ? (x.note||'') : (y.note||''))
                       : tiePick(x.note||'', y.note||'', noteScore);
  out.t._note = Math.max(nx, ny);
  return out;
}
/* 预算是一条小记录，不像「一天」那样要拆成好几块，所以整条比时间戳，晚的赢 */
function mergeBudRec(x, y){
  if (!x) return y;
  if (!y) return x;
  const tx = x._t || 0, ty = y._t || 0;
  if (tx !== ty) return tx > ty ? x : y;
  return canon(x) <= canon(y) ? x : y;
}
function mergeDB(a, b){
  a = a || emptyDB(); b = b || emptyDB();
  const out = emptyDB();
  [a.tomb||{}, b.tomb||{}].forEach(t => { for (const k in t) out.tomb[k] = Math.max(out.tomb[k]||0, t[k]||0); });

  const dk = {}; for (const k in (a.days||{})) dk[k]=1; for (const k in (b.days||{})) dk[k]=1;
  for (const k in dk) {
    const rec = mergeDayRec((a.days||{})[k], (b.days||{})[k]);
    if (!rec) continue;
    if ((out.tomb['d:'+k]||0) >= Math.max(rec._t||0, 1)) continue;   // 删得比改得晚 → 保持删除
    out.days[k] = rec;
  }
  const mk = {}; for (const k in (a.months||{})) mk[k]=1; for (const k in (b.months||{})) mk[k]=1;
  for (const k in mk) {
    const rec = mergeMonRec((a.months||{})[k], (b.months||{})[k]);
    if (!rec) continue;
    if ((out.tomb['m:'+k]||0) >= Math.max(rec._t||0, 1)) continue;
    out.months[k] = rec;
  }
  const bk = {}; for (const k in (a.budgets||{})) bk[k]=1; for (const k in (b.budgets||{})) bk[k]=1;
  for (const k in bk) {
    const rec = mergeBudRec((a.budgets||{})[k], (b.budgets||{})[k]);
    if (!rec) continue;
    if ((out.tomb['b:'+k]||0) >= Math.max(rec._t||0, 1)) continue;
    out.budgets[k] = rec;
  }
  const cut = nowTs() - 180*864e5;                              // 半年前的墓碑清掉
  for (const k in out.tomb) if (out.tomb[k] < cut) delete out.tomb[k];
  return out;
}
function sig(db){
  const d = Object.keys(db.days||{}).sort().map(k => [k, db.days[k]]);
  const m = Object.keys(db.months||{}).sort().map(k => [k, db.months[k]]);
  const b = Object.keys(db.budgets||{}).sort().map(k => [k, db.budgets[k]]);
  const t = Object.keys(db.tomb||{}).sort().map(k => [k, db.tomb[k]]);
  return JSON.stringify([d, m, b, t]);
}

/* ---- 传输通道 A：局域网 ---- */
const LAN = {
  name: '局域网',
  base(){
    if (SC.lan.url) return SC.lan.url.replace(/\/+$/, '');
    // 只有页面本身就是局域网服务器发出来的（http，不是 https）才自动用当前地址。
    // 以前这里把 https 也算进来，于是在 GitHub Pages 上「局域网通道」永远算「已配置」，
    // 哪怕云同步根本没开，状态灯也不报警——这就是丢数据那次的根源。
    if (location.protocol === 'http:') return location.origin;
    return '';
  },
  enabled(){ return SC.lan.on && !!this.base(); },
  async pull(){
    const r = await fetch(this.base() + '/api/data', { cache:'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  },
  async push(db){
    const r = await fetch(this.base() + '/api/data', {
      method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(db)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
  }
};

/* ---- 传输通道 B：GitHub Gist ---- */
const FILE = 'kakeibo.json';
const GIST = {
  name: '云同步',
  enabled(){ return SC.gist.on && !!SC.gist.token; },
  hd(){ return { 'Authorization':'Bearer ' + SC.gist.token, 'Accept':'application/vnd.github+json' }; },

  /* 列出这个账号下所有「记账本」存档，内容多的排前面 */
  async list(){
    const r = await fetch('https://api.github.com/gists?per_page=100', { headers: this.hd(), cache:'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return (j || [])
      .filter(g => g.files && g.files[FILE])
      .map(g => ({ id:g.id, size:(g.files[FILE].size || 0), at:g.updated_at }))
      .sort((a,b) => (b.size - a.size) || (a.at < b.at ? 1 : -1));
  },

  /* Gist ID 空着的时候：先找找账号里有没有现成的存档，有就接上去，
     没有才新建 —— 免得两台设备各建一个，谁也看不见谁。 */
  async create(){
    let found = [];
    try { found = await this.list(); } catch (e) {}
    if (found.length) {
      SC.gist.id = found[0].id; saveSC();
      toast('找到已有的云端存档，已自动接上');
      return SC.gist.id;
    }
    const r = await fetch('https://api.github.com/gists', {
      method:'POST', headers: Object.assign({'Content-Type':'application/json'}, this.hd()),
      body: JSON.stringify({ description:'记账本数据（私密）', public:false,
        files:{ [FILE]:{ content: JSON.stringify(DB) } } })
    });
    if (!r.ok) throw new Error('创建失败 HTTP ' + r.status);
    const j = await r.json();
    SC.gist.id = j.id; saveSC();
    toast('已新建云端存档');
    return j.id;
  },
  async pullById(id){
    const r = await fetch('https://api.github.com/gists/' + id + '?t=' + nowTs(),
      { headers: this.hd(), cache:'no-store' });
    if (r.status === 404) throw new Error('找不到这个存档（404）');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const f = j.files && j.files[FILE];
    if (!f) return emptyDB();
    let txt = f.content;
    if (f.truncated && f.raw_url) txt = await (await fetch(f.raw_url)).text();
    try { return JSON.parse(txt); } catch(e){ return emptyDB(); }
  },
  async pull(){
    if (!SC.gist.id) { await this.create(); return emptyDB(); }
    try { return await this.pullById(SC.gist.id); }
    catch (e) {
      if (/404/.test(e.message)) { SC.gist.id = ''; saveSC(); throw new Error('找不到这个存档，已重置'); }
      throw e;
    }
  },
  async push(db){
    if (!SC.gist.id) await this.create();
    const r = await fetch('https://api.github.com/gists/' + SC.gist.id, {
      method:'PATCH', headers: Object.assign({'Content-Type':'application/json'}, this.hd()),
      body: JSON.stringify({ files:{ [FILE]:{ content: JSON.stringify(db) } } })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
  }
};

/* ---- 同步引擎（离线优先：没网照记，有网自动补上） ---- */
let syncing = false, syncTimer = null, pendingRerender = false;
let lanProbe = null;                 // null=没测过 true/false=局域网服务器在不在
let lastErr = '', failN = 0, nextTry = 0;

function configured(){ return [LAN, GIST].filter(c => c.enabled()); }
function online(){ return typeof navigator === 'undefined' || navigator.onLine !== false; }
function resetProbe(){ lanProbe = null; }

/* 局域网通道要先探一下：在 GitHub Pages 上打开时同源并没有服务器，
   探不到就安静地跳过，不当成错误。 */
async function probeLan(){
  if (!LAN.enabled()) return false;
  if (lanProbe !== null) return lanProbe;
  try {
    const r = await fetch(LAN.base() + '/api/ping', { cache:'no-store' });
    const j = await r.json();
    lanProbe = !!(j && j.app === 'kakeibo');
  } catch (e) { lanProbe = false; }
  return lanProbe;
}
async function activeChannels(){
  const list = [];
  if (await probeLan()) list.push(LAN);
  if (GIST.enabled()) list.push(GIST);
  return list;
}

/* 还有多少条改动没传出去 */
function pendingCount(){
  const t = SC.last || 0; let n = 0;
  for (const k in DB.days)   if ((DB.days[k]._t||0)   > t) n++;
  for (const k in DB.months) if ((DB.months[k]._t||0) > t) n++;
  for (const k in DB.tomb)   if ((DB.tomb[k]||0)      > t) n++;
  return n;
}
function setStatus(state, msg){
  const el = document.getElementById('syncChip');
  if (!el) return;
  el.className = 'syncchip ' + state;
  el.textContent = msg;
}
function refreshStatus(){
  refreshWarn();
  if (syncing) return setStatus('busy', '⟳ 同步中');
  if (!GIST.enabled() && !configured().length) return setStatus('err', '⚠ 没开云同步·只存本机');
  if (!configured().length) return setStatus('err', '⚠ 没开云同步·只存本机');
  const p = pendingCount();
  if (!online()) return setStatus('off', p ? '✈ 离线 · ' + p + ' 项待同步' : '✈ 离线 · 已存本机');
  if (lastErr)   return setStatus('err', '⚠ ' + lastErr);
  if (p)         return setStatus('busy', '● ' + p + ' 项待同步');
  if (!SC.last)  return setStatus('err', '⚠ 还没成功传过云端');
  return setStatus('ok', '✓ 已同步 ' + hhmm(new Date(SC.last)));
}
function schedSync(){
  if (!configured().length) return;
  refreshStatus();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow('auto'), 2500);
}
function isTyping(){
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
}
/* 本机有、云端没有的条数。这是「到底传上去没有」的唯一判据 */
function cloudGap(local, remote){
  let n = 0;
  remote = remote || emptyDB();
  for (const k in (local.days || {}))    if (!(remote.days || {})[k])    n++;
  for (const k in (local.months || {}))  if (!(remote.months || {})[k])  n++;
  for (const k in (local.budgets || {})) if (!(remote.budgets || {})[k]) n++;
  return n;
}

async function syncNow(reason){
  if (!configured().length) { refreshStatus(); return; }
  if (syncing) return;
  if (!online()) { refreshStatus(); return; }                    // 离线就安静待着
  if (reason === 'tick' && nowTs() < nextTry) return;            // 连续失败后退避
  saveNow();

  syncing = true; refreshStatus();
  const errs = [];
  try {
    const chs = await activeChannels();
    if (!chs.length) {
      lastErr = GIST.enabled() ? '连不上同步服务器' : '';
      syncing = false; refreshStatus(); return;
    }
    const got = [];
    for (const c of chs) {
      try { got.push({ c:c, db: await c.pull() }); }
      catch (e) { errs.push(c.name + '：' + e.message); if (c === LAN) lanProbe = null; }
    }
    let merged = DB;
    got.forEach(g => { merged = mergeDB(merged, g.db); });
    const ms = sig(merged);
    if (ms !== sig(DB)) {
      DB = merged; saveNow();
      if (isTyping()) pendingRerender = true; else render();
    }
    for (const g of got) {
      if (sig(g.db) !== ms) {
        try { await g.c.push(merged); } catch (e) { errs.push(g.c.name + '：' + e.message); }
      }
    }

    /* 关键一步：推完再拉回来数一遍，确认云端真的收到了。
       以前是「推送没报错就当成功」，所以才会出现「显示已同步、云端其实是空的」。
       现在只有复查通过，才敢把状态标成已同步。 */
    if (!errs.length) {
      for (const g of got) {
        try {
          const back = await g.c.pull();
          const gap = cloudGap(merged, back);
          if (gap > 0) errs.push(g.c.name + '：云端少了 ' + gap + ' 条，还在重试');
          else if (g.c === GIST) {
            SC.cloudDays   = Object.keys(back.days || {}).length;
            SC.cloudMonths = Object.keys(back.months || {}).length;
            SC.cloudAt     = nowTs();
          }
        } catch (e) { errs.push(g.c.name + '：复查失败 ' + e.message); }
      }
    }

    if (errs.length) {
      lastErr = errs[0]; failN++; nextTry = nowTs() + Math.min(20000 * Math.pow(2, failN), 300000);
    } else {
      lastErr = ''; failN = 0; nextTry = 0;
      SC.last = nowTs(); saveSC();
    }
  } catch (e) {
    lastErr = e.message || '同步失败';
    failN++; nextTry = nowTs() + Math.min(20000 * Math.pow(2, failN), 300000);
  } finally {
    syncing = false; refreshStatus();
  }
}
function hhmm(d){ return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

setInterval(() => { if (!document.hidden && !isTyping()) syncNow('tick'); }, 20000);
document.addEventListener('focusout', () => {
  if (pendingRerender && !isTyping()) { pendingRerender = false; render(); }
});
if (typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    resetProbe(); lastErr = ''; failN = 0; nextTry = 0;
    refreshStatus();
    if (configured().length && pendingCount()) toast('网络回来了，正在补同步');
    syncNow('online');
  });
  window.addEventListener('offline', () => { resetProbe(); refreshStatus(); });
}

/* ---- 离线可用：注册 Service Worker（只在 https / localhost 生效） ---- */
function initOffline(){
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  const okHost = location.protocol === 'https:' ||
                 location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!okHost) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const poke = () => { try { reg.update(); } catch (e) {} };   // 每次回到页面都去看看有没有新版
    poke();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poke(); });
  }).catch(() => {});
  let told = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!told) { told = true; toast('已更新到新版本，下次打开生效'); }
  });
}
function offlineReady(){
  return typeof navigator !== 'undefined' && navigator.serviceWorker && !!navigator.serviceWorker.controller;
}

/* =====================================================================
   渲染调度 + 事件
   ===================================================================== */
/* ---------- 常驻警告条：只要数据还没安全落到云端，就一直挂在最上面 ---------- */
function warnItems(){
  const out = [];
  if (!GIST.enabled()) {
    out.push({ lv:'bad', html:'<b>云同步没开</b>——记录只存在这台设备里。'
      + '清浏览器数据、或者删掉主屏图标，就会全部消失。'
      + '<button class="wbtn" data-go="data">去开启</button>' });
  } else {
    const p = pendingCount();
    if (p) out.push({ lv:'warn', html:'<b>' + p + ' 项还没传到云端</b>'
      + (online() ? '，正在重试…' : '（现在离线，一有网会自动补传）')
      + '<button class="wbtn" data-sync="1">立刻同步</button>' });
    if (lastErr) out.push({ lv:'bad', html:'<b>同步出错</b>：' + esc(lastErr)
      + '<button class="wbtn" data-sync="1">重试</button>' });
    const localDays = Object.keys(DB.days).length;
    if (SC.cloudDays != null && localDays - SC.cloudDays > 0) {
      out.push({ lv:'bad', html:'<b>云端比本机少 ' + (localDays - SC.cloudDays) + ' 天</b>'
        + '<button class="wbtn" data-sync="1">立刻同步</button>' });
    }
  }
  const days = SC.lastExport ? Math.floor((nowTs() - SC.lastExport) / 864e5) : null;
  if (Object.keys(DB.days).length && (days === null || days >= 7)) {
    out.push({ lv:'warn', html:(days === null ? '<b>还没导出过备份</b>' : '<b>已经 ' + days + ' 天没导出备份</b>')
      + '，建议存一份文件在手机里。<button class="wbtn" data-export="1">现在导出</button>' });
  }
  return out;
}
function warnBody(){
  return warnItems().map(i => '<div class="warnbar ' + i.lv + '">⚠ ' + i.html + '</div>').join('');
}
function warnHTML(){ return '<div id="warnzone">' + warnBody() + '</div>'; }
function refreshWarn(){
  const z = document.getElementById('warnzone');
  if (!z) return;
  const html = warnBody();
  if (z.innerHTML !== html) { z.innerHTML = html; bindWarn(); }
}
function bindWarn(){
  document.querySelectorAll('.warnbar .wbtn').forEach(b => {
    b.onclick = () => {
      if (b.dataset.sync) { syncNow('manual'); toast('正在同步…'); }
      else if (b.dataset.export) { doExport(); }
      else if (b.dataset.go === 'data') { view = 'data'; render(); }
    };
  });
}

function render(){
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  if (view === 'day')       renderDay();
  else if (view === 'week') renderWeek();
  else if (view === 'month')renderMonth();
  else if (view === 'year') renderYear();
  else if (view === 'budget')renderBudget();
  else if (view === 'query')renderQuery();
  else                      renderData();
  app.insertAdjacentHTML('afterbegin', warnHTML());
  bindWarn();
  window.scrollTo(0, 0);
}
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  commitFocused();
  pruneDay(ymd(cur)); saveNow();
  view = b.dataset.view;
  if (view === 'month') curM = ymOf(cur);
  if (view === 'year')  curY = cur.getFullYear();
  render();
});

/* 导航 */
app.addEventListener('click', e => {
  const nb = e.target.closest('[data-nav]');
  if (nb) {
    const k = nb.dataset.nav;
    commitFocused();
    pruneDay(ymd(cur));
    if (k === 'd-1') cur = addDays(cur,-1);
    else if (k === 'd+1') cur = addDays(cur,1);
    else if (k === 'dtoday') { cur = new Date(); cur.setHours(0,0,0,0); }
    else if (k === 'w-1') cur = addDays(cur,-7);
    else if (k === 'w+1') cur = addDays(cur,7);
    else if (k === 'm-1') curM = prevMonth(curM);
    else if (k === 'm+1') { const y=+curM.slice(0,4), mo=+curM.slice(5,7); curM = mo===12 ? (y+1)+'-01' : y+'-'+pad(mo+1); }
    else if (k === 'y-1') curY--;
    else if (k === 'y+1') curY++;
    render(); return;
  }
  const del = e.target.closest('.del');
  if (del) {
    if (del.dataset.delfix !== undefined) {
      const o = monthObj(curM, true);
      o.fixed.splice(+del.dataset.delfix, 1); touchMonth(curM,'fixed'); save(); renderMonth(); return;
    }
    const row = del.closest('.row');
    delRow(ymd(cur), row.dataset.sid, +row.dataset.i);
    renderDay(); return;
  }
  const add = e.target.closest('[data-add]');
  if (add) {
    const sid = add.dataset.add, i = addRow(ymd(cur), sid);
    renderDay(); focusRow(sid, i); return;
  }
  if (e.target.closest('[data-addfix]')) {
    const o = monthObj(curM, true);
    o.fixed.push({n:'',a:''}); touchMonth(curM,'fixed'); save(); renderMonth();
    const list = document.querySelectorAll('.fixlist .fn');
    if (list.length) list[list.length-1].focus();
    return;
  }
});

/* 输入 */
app.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'dpick') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.value)) return;
    const nd = parseYmd(t.value);
    if (isNaN(nd.getTime())) return;
    pruneDay(ymd(cur)); cur = nd; render(); return;
  }
  if (t.id === 'dayNote') {
    const d = DB.days[ymd(cur)] || (DB.days[ymd(cur)] = {rows:{},note:''});
    d.note = t.value; touchDay(ymd(cur), '_note'); save(); return;
  }
  if (t.id === 'monNote') { monthObj(curM,true).note = t.value; touchMonth(curM,'_note'); save(); return; }
  const row = t.closest('.row'); if (!row) return;
  if (row.dataset.fix !== undefined) {
    const o = monthObj(curM,true), i = +row.dataset.fix;
    while (o.fixed.length <= i) o.fixed.push({n:'',a:''});
    o.fixed[i][t.classList.contains('fn') ? 'n' : 'a'] = t.value;
    touchMonth(curM,'fixed'); save(); refreshMonthFixed();
    if (t.classList.contains('fa')) showCalcHint(t);
    return;
  }
  setCell(ymd(cur), row.dataset.sid, +row.dataset.i, t.classList.contains('rn') ? 'n' : 'a', t.value);
  refreshDayTotals();
  if (t.classList.contains('ra')) showCalcHint(t);
});

/* ---- 金额栏算式：380+520 → 900 ---- */
function isAmountInput(el){
  return !!(el && el.classList && (el.classList.contains('ra') || el.classList.contains('fa')));
}
/* 把输入框里的算式换成结果并写回数据 */
function commitCalc(el){
  if (!isAmountInput(el)) return false;
  const r = calcExpr(el.value);
  if (r === null) return false;
  el.value = r;
  el.dispatchEvent(new Event('input', { bubbles:true }));
  return true;
}
function commitFocused(){ const ok = commitCalc(document.activeElement); hideCalcHint(); hideOpbar(); return ok; }

/* 边打边显示「= 900」，让人知道这里能算 */
function showCalcHint(el){
  hideCalcHint();
  if (isTouch()) { updateOpbar(); return; }     // 手机上结果显示在符号条里
  const r = calcExpr(el.value);
  if (r === null) return;
  const row = el.closest('.row');
  if (!row || !row.parentNode) return;
  const d = document.createElement('div');
  d.className = 'calchint'; d.id = 'calcHint';
  d.textContent = '= ' + yen(r) + '（点别处或按回车自动填入）';
  row.parentNode.insertBefore(d, row.nextSibling);
}
function hideCalcHint(){
  const d = document.getElementById('calcHint');
  if (d && d.parentNode) d.parentNode.removeChild(d);
}

app.addEventListener('change', e => { commitCalc(e.target); hideCalcHint(); });

/* =====================================================================
   手机符号条
   手机的数字键盘没有 + － × ÷，所以金额栏一聚焦就在键盘上方浮一条按钮。
   ===================================================================== */
function isTouch(){
  if (typeof window !== 'undefined' && window.__forceTouch != null) return !!window.__forceTouch;  // 测试用
  try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); }
  catch (e) { return false; }
}
const OPKEYS = [ ['+','＋'], ['-','－'], ['×','×'], ['÷','÷'] ];
let opbarEl = null, opbarTarget = null, opbarHideTimer = null;

function ensureOpbar(){
  if (opbarEl) return opbarEl;
  const bar = document.createElement('div');
  bar.id = 'opbar'; bar.className = 'opbar';
  bar.innerHTML =
      '<span class="opres" id="opRes"></span>'
    + '<span class="opbtns">'
    +   OPKEYS.map(k => '<button type="button" class="opk" data-k="'+k[0]+'">'+k[1]+'</button>').join('')
    +   '<button type="button" class="opk" data-k="back">⌫</button>'
    +   '<button type="button" class="opk ok" data-k="done">＝ 算出来</button>'
    + '</span>';
  document.body.appendChild(bar);

  /* 按下就直接干活，不等 click。
     原因：为了不让输入框失焦（一失焦手机键盘就收起来），按下时必须 preventDefault()，
     而在 iOS 上 preventDefault() 会把后续的 click 事件一起取消掉 ——
     所以挂在 click 上的处理函数永远不会被调用。 */
  function onPress(e){
    if (e.cancelable) e.preventDefault();          // 保住焦点，键盘不收
    const b = (e.target && e.target.closest) ? e.target.closest('.opk') : null;
    if (!b || !opbarTarget) return;
    const k = b.dataset.k;
    if (k === 'done')      { if (commitCalc(opbarTarget)) flashCalc(opbarTarget); }
    else if (k === 'back') { opbarBackspace(opbarTarget); }
    else                   { opbarInsert(opbarTarget, k); }
    updateOpbar();
  }
  // 只挂一条路，免得同一次点击被处理两遍
  if (window.PointerEvent) {
    bar.addEventListener('pointerdown', onPress);
  } else {
    bar.addEventListener('touchstart', onPress, { passive:false });
    bar.addEventListener('mousedown', onPress);
  }
  bar.addEventListener('click', e => { if (e.cancelable) e.preventDefault(); });

  opbarEl = bar;
  return bar;
}
function opbarInsert(el, txt){
  const s = el.selectionStart, e = el.selectionEnd;
  if (typeof s === 'number' && typeof e === 'number') {
    el.value = el.value.slice(0, s) + txt + el.value.slice(e);
    const p = s + txt.length;
    try { el.setSelectionRange(p, p); } catch (x) {}
  } else el.value += txt;
  el.dispatchEvent(new Event('input', { bubbles:true }));
  el.focus();
}
function opbarBackspace(el){
  let s = el.selectionStart; const e = el.selectionEnd;
  if (typeof s !== 'number' || typeof e !== 'number') {
    el.value = el.value.slice(0, -1);
  } else {
    if (s === e) { if (s === 0) return; s -= 1; }
    el.value = el.value.slice(0, s) + el.value.slice(e);
    try { el.setSelectionRange(s, s); } catch (x) {}
  }
  el.dispatchEvent(new Event('input', { bubbles:true }));
  el.focus();
}
function updateOpbar(){
  const res = document.getElementById('opRes');
  if (!res) return;
  const r = opbarTarget ? calcExpr(opbarTarget.value) : null;
  res.textContent = r === null ? '' : '= ' + yen(r);
}
/* 把符号条顶到键盘上方 */
function positionOpbar(){
  if (!opbarEl) return;
  let gap = 0;
  const vv = window.visualViewport;
  if (vv) gap = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
  opbarEl.style.bottom = gap + 'px';
}
function showOpbar(el){
  if (!isTouch()) return;
  clearTimeout(opbarHideTimer);
  opbarTarget = el;
  const bar = ensureOpbar();
  bar.classList.add('show');
  document.body.classList.add('opbar-on');
  positionOpbar(); updateOpbar();
}
function hideOpbar(){
  clearTimeout(opbarHideTimer);
  opbarTarget = null;
  if (opbarEl) opbarEl.classList.remove('show');
  if (document.body && document.body.classList) document.body.classList.remove('opbar-on');
}
if (window.visualViewport && window.visualViewport.addEventListener) {
  window.visualViewport.addEventListener('resize', positionOpbar);
  window.visualViewport.addEventListener('scroll', positionOpbar);
}

app.addEventListener('focusin', e => {
  if (isAmountInput(e.target)) showOpbar(e.target);
  else if (!isTouch()) return;
  else hideOpbar();
});
app.addEventListener('focusout', e => {
  if (!isAmountInput(e.target)) return;
  hideCalcHint();
  clearTimeout(opbarHideTimer);
  opbarHideTimer = setTimeout(hideOpbar, 150);   // 留点时间给符号条上的点击
});

/* 回车 = 新增一行 */
app.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const t = e.target;
  const act = enterAction(t);
  if (act === 'none') return;
  e.preventDefault();

  /* 金额栏回车 = 只算这一格，光标留在原地，不加行、不跳走 */
  if (act === 'calc') {
    const done = commitCalc(t);
    hideCalcHint(); updateOpbar();
    if (done) flashCalc(t);
    else t.blur();                        // 不是算式就收起键盘，当作「填好了」
    return;
  }

  /* 项目名称栏回车 = 新增一行，光标落到新行的项目名称 */
  if (t.classList.contains('rn')) {
    const sid = t.closest('.row').dataset.sid;
    const ni = addRow(ymd(cur), sid);
    renderDay(); focusRow(sid, ni);
  } else {                                 // .fn：月度固定支出
    const o = monthObj(curM, true);
    o.fixed.push({ n:'', a:'' }); touchMonth(curM,'fixed'); save(); renderMonth();
    const el = document.querySelector('.fixlist .row[data-fix="'+(o.fixed.length-1)+'"] .fn');
    if (el) el.focus();
  }
});

/* 回车在哪一栏按下，该干什么 */
function enterAction(el){
  if (!el || !el.classList) return 'none';
  if (el.classList.contains('ra') || el.classList.contains('fa')) return 'calc';
  if (el.classList.contains('rn') || el.classList.contains('fn')) return 'addrow';
  return 'none';
}
/* 算完闪一下，让人看见「确实算了」 */
function flashCalc(el){
  if (!el.classList) return;
  el.classList.remove('calcdone');
  void el.offsetWidth;                     // 强制重排，动画才能重放
  el.classList.add('calcdone');
  setTimeout(() => { if (el.classList) el.classList.remove('calcdone'); }, 800);
}
function focusRow(sid, i){
  const el = document.querySelector('.row[data-sid="'+sid+'"][data-i="'+i+'"] .rn');
  if (el) { el.focus(); try { el.scrollIntoView({block:'center', behavior:'smooth'}); } catch(x){} }
}
function refreshMonthFixed(){
  const fixS = fixedSum(curM);
  const varS = monthVar(curM), incS = monthIncome(curM);
  const a = document.getElementById('fixTotal'); if (a) a.textContent = yen(fixS);
  const b = document.getElementById('mTot');    if (b) b.textContent = yen(varS + fixS);
  const c = document.getElementById('mBal');    if (c) c.textContent = yen(incS - varS - fixS);
}

/* 启动 */
migrateTax();
render();
(function initSync(){
  const chip = document.getElementById('syncChip');
  if (chip) chip.addEventListener('click', () => {
    if (!configured().length) { view = 'data'; render(); toast('先在这里开启同步'); }
    else syncNow('manual');
  });
  initOffline();
  refreshStatus();
  syncNow('init');
})();

/* 调试/测试接口 */
window.__kakeibo = { get DB(){return DB;}, set DB(v){DB=v;}, save:saveNow, render, CATS, ALLSUBS,
  monthSpend, monthIncome, monthVar, fixedSum, rangeSpend, rangeIncome, pct, weekStart, ymd,
  mergeDB, sig, emptyDB, dayScore, monScore, get SC(){return SC;},
  pendingCount, refreshStatus, configured, syncNow, LAN, GIST, pairCode, parsePair, canon,
  calcExpr, commitCalc, num, migrateTax, DEFAULT_FIXED, enterAction, isTouch,
  cloudGap, warnItems, doExport, get lastErr(){return lastErr;}, set lastErr(v){lastErr=v;},
  ALLQ, QGROUPS, yen, subLabel, renderQuery,
  budStat, spentIn, daysBetween, budList, newBudId, mergeBudRec,
  go:function(v,d){ if(d){cur=parseYmd(d);curM=d.slice(0,7);curY=+d.slice(0,4);} view=v; render(); } };

})();
