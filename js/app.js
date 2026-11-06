'use strict';

/* =========================================================
   わくわく厳選メモ
   データはブラウザの localStorage に保存し、JSON で書き出し・読み込みできる。
   ========================================================= */

const STORE_KEY = 'wakuwaku-memo:v1';
const THEME_KEY = 'wakuwaku-memo:theme';
const PARTY_SIZE = 4;
const BOND_SCOPES = ['race', 'hit', 'type'];

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- 状態 ---------- */

function defaultState() {
  return { version: 1, settings: { slotCount: 3 }, characters: [], customFruits: [], parties: [], bank: [], accounts: [] };
}

function emptyPlan() {
  return { fruitId: '', target: '', current: '', status: 'todo' };
}

function newParty(name) {
  return {
    id: uid(),
    name: name || '新しいパーティ',
    quest: '',
    memo: '',
    members: Array.from({ length: PARTY_SIZE }, () => ({ charId: null, plans: [] })),
    updatedAt: Date.now()
  };
}

const gradeOk = (g) => (DATA.grades.includes(g) ? g : '');

function cleanPlan(pl) {
  return {
    fruitId: String(pl?.fruitId ?? ''),
    target: gradeOk(pl?.target),
    current: gradeOk(pl?.current),
    status: DATA.statuses.some((x) => x.id === pl?.status) ? pl.status : 'todo'
  };
}

// 読み込んだデータの欠けを補い、壊れた値を取り除く
function normalize(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return s;
  const slotCount = Number(raw.settings?.slotCount);
  s.settings.slotCount = slotCount === 4 ? 4 : 3;

  // メイン以外のアカウント（サブ垢など）。キャラやバンクの実が accountId で参照する（空はメイン）
  s.accounts = (Array.isArray(raw.accounts) ? raw.accounts : [])
    .filter((a) => a && typeof a === 'object' && a.id)
    .map((a) => ({
      id: String(a.id),
      name: String(a.name ?? '').slice(0, 20) || '名前なし',
      memo: String(a.memo ?? '').slice(0, 500)
    }));
  const accountIds = new Set(s.accounts.map((a) => a.id));
  const accountOk = (id) => (accountIds.has(id) ? id : '');

  s.characters = (Array.isArray(raw.characters) ? raw.characters : [])
    .filter((c) => c && typeof c === 'object' && c.id)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name ?? '').slice(0, 40) || '名前なし',
      race: String(c.race ?? '').slice(0, 20),
      // 種族・撃種・戦型はパーティの相性判定にだけ使うので、空欄でもよい
      hit: DATA.hits.includes(c.hit) ? c.hit : '',
      type: DATA.types.includes(c.type) ? c.type : '',
      memo: String(c.memo ?? '').slice(0, 300),
      accountId: accountOk(c.accountId),
      priority: !!c.priority,
      // パーティに入れずに、キャラ単体で狙う実
      plans: (Array.isArray(c.plans) ? c.plans : []).slice(0, 4).map(cleanPlan)
    }));

  s.customFruits = (Array.isArray(raw.customFruits) ? raw.customFruits : [])
    .filter((f) => f && typeof f === 'object' && f.id)
    .map((f) => ({
      id: String(f.id),
      name: String(f.name ?? '').slice(0, 30) || '名前なしの実',
      short: String(f.short ?? f.name ?? '').slice(0, 30) || '名前なしの実',
      scope: DATA.scopes[f.scope] ? f.scope : 'self',
      attack: !!f.attack,
      desc: String(f.desc ?? '').slice(0, 80),
      custom: true
    }));

  const charIds = new Set(s.characters.map((c) => c.id));

  s.parties = (Array.isArray(raw.parties) ? raw.parties : [])
    .filter((p) => p && typeof p === 'object' && p.id)
    .map((p) => {
      const party = newParty();
      party.id = String(p.id);
      party.name = String(p.name ?? '').slice(0, 40) || '名前なしのパーティ';
      party.quest = String(p.quest ?? '').slice(0, 60);
      party.memo = String(p.memo ?? '').slice(0, 1000);
      party.updatedAt = Number(p.updatedAt) || Date.now();
      const members = Array.isArray(p.members) ? p.members : [];
      party.members = Array.from({ length: PARTY_SIZE }, (_, i) => {
        const m = members[i] || {};
        const plans = (Array.isArray(m.plans) ? m.plans : []).slice(0, 4).map(cleanPlan);
        return { charId: charIds.has(m.charId) ? m.charId : null, plans };
      });
      return party;
    });

  // わくわくバンクに入れている実
  s.bank = (Array.isArray(raw.bank) ? raw.bank : [])
    .filter((b) => b && typeof b === 'object' && b.fruitId && gradeOk(b.grade))
    .map((b) => ({
      id: String(b.id || uid()),
      fruitId: String(b.fruitId),
      grade: b.grade,
      count: Math.min(99, Math.max(1, Math.floor(Number(b.count)) || 1)),
      memo: String(b.memo ?? '').slice(0, 60),
      accountId: accountOk(b.accountId)
    }));
  return s;
}

function loadState() {
  try {
    const text = localStorage.getItem(STORE_KEY);
    return text ? normalize(JSON.parse(text)) : defaultState();
  } catch (e) {
    return defaultState();
  }
}

let state = loadState();
let saveTimer = null;

function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('保存できませんでした。「データ」からファイルに書き出してください');
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 150);
}

// 画面を閉じる・アプリを切り替える直前に、保存待ちの分を書き込む
window.addEventListener('pagehide', () => { if (saveTimer) writeNow(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) writeNow();
});

/* ---------- 参照ヘルパー ---------- */

const allFruits = () => DATA.fruits.concat(state.customFruits);
const fruitById = (id) => allFruits().find((f) => f.id === id) || null;
const charById = (id) => (id ? state.characters.find((c) => c.id === id) || null : null);
const partyById = (id) => state.parties.find((p) => p.id === id) || null;
const normType = (t) => String(t || '').replace(/^超/, '');
const gradeRank = (g) => {
  const i = DATA.grades.indexOf(g);
  return i < 0 ? 999 : i;
};
const accountById = (id) => (id ? state.accounts.find((a) => a.id === id) || null : null);
const accountName = (id) => accountById(id)?.name || 'メイン';
const accountChoices = () => [{ value: '', label: 'メイン' }]
  .concat(state.accounts.map((a) => ({ value: a.id, label: a.name })));
const MAX_CHAR_PLANS = 4;
const statusLabel = (id) => DATA.statuses.find((s) => s.id === id)?.label || id;

function attrOf(c, scope) {
  if (!c) return '';
  if (scope === 'race') return c.race;
  if (scope === 'hit') return c.hit;
  if (scope === 'type') return normType(c.type);
  return '';
}

// パーティの枠・キャラ単体のどちらにも使う（どちらも .plans を持つ）
function plansOf(member) {
  if (!Array.isArray(member.plans)) member.plans = [];
  const n = state.settings.slotCount;
  while (member.plans.length < n) member.plans.push(emptyPlan());
  return member.plans.slice(0, n);
}

function touch(party) {
  party.updatedAt = Date.now();
  save();
}

/* ---------- 相性の判定 ---------- */

function analyze(party) {
  const chars = party.members.map((m) => charById(m.charId));
  const groups = { race: {}, hit: {}, type: {} };
  chars.forEach((c, i) => {
    if (!c) return;
    for (const s of BOND_SCOPES) {
      const v = attrOf(c, s);
      if (!v) continue;
      (groups[s][v] ||= []).push(i);
    }
  });

  const reach = (i, scope) => {
    const c = chars[i];
    if (!c) return 0;
    return (groups[scope][attrOf(c, scope)] || []).length;
  };

  const notes = {};
  const addNote = (i, k, level, text) => {
    (notes[`${i}-${k}`] ||= []).push({ level, text });
  };
  const who = (it, self) => (it.i === self.i ? 'このキャラの別の枠' : (it.c?.name || `${it.i + 1}体目`));

  const items = [];
  party.members.forEach((m, i) => {
    plansOf(m).forEach((p, k) => {
      const f = p.fruitId ? fruitById(p.fruitId) : null;
      if (f) items.push({ i, k, p, f, c: chars[i] });
    });
  });

  // 絆系：同じ名前の実を、同じ種族/撃種/戦型どうしで持つと重ならない
  const bondMap = {};
  for (const it of items) {
    if (!BOND_SCOPES.includes(it.f.scope) || !it.c) continue;
    const key = `${it.f.id}|${attrOf(it.c, it.f.scope)}`;
    (bondMap[key] ||= []).push(it);
  }
  for (const list of Object.values(bondMap)) {
    if (list.length < 2) continue;
    for (const it of list) {
      const others = list.filter((o) => o !== it).map((o) => who(o, it)).join('、');
      addNote(it.i, it.k, 'warn',
        `${others}も「${it.f.short}」。${attrOf(it.c, it.f.scope)}どうしでは重ならず、等級の高い1つ分しか効きません`);
    }
  }

  // クエスト全体の実：パーティ内で重ならない
  const questMap = {};
  for (const it of items) {
    if (it.f.scope === 'quest') (questMap[it.f.id] ||= []).push(it);
  }
  for (const list of Object.values(questMap)) {
    if (list.length < 2) continue;
    for (const it of list) {
      const others = list.filter((o) => o !== it).map((o) => who(o, it)).join('、');
      addNote(it.i, it.k, 'warn', `${others}も「${it.f.short}」。クエスト全体の実は重ならず、1つ分しか効きません`);
    }
  }

  // 自分のみの実：同じキャラに同じ実を2つつけても1つ分（一撃失心だけは例外）
  const selfMap = {};
  for (const it of items) {
    if (it.f.scope !== 'self' || it.f.id === 'shisshin') continue;
    (selfMap[`${it.i}|${it.f.id}`] ||= []).push(it);
  }
  for (const list of Object.values(selfMap)) {
    if (list.length < 2) continue;
    for (const it of list) addNote(it.i, it.k, 'warn', `同じキャラに「${it.f.short}」が2つ。効くのは等級の高い1つだけです`);
  }

  // 絆系が自分にしか届かない場合の補足
  const memberCount = chars.filter(Boolean).length;
  for (const it of items) {
    if (!BOND_SCOPES.includes(it.f.scope) || !it.c) continue;
    if (memberCount >= 2 && reach(it.i, it.f.scope) === 1) {
      addNote(it.i, it.k, 'info', `この編成では${DATA.scopes[it.f.scope]}が他にいないので、自分にだけ効きます`);
    }
  }

  return { chars, groups, reach, notes, items, memberCount };
}

// 編成全体のヒント
function partyHints(party, a) {
  const hints = [];
  if (a.memberCount === 0) return hints;

  for (const scope of BOND_SCOPES) {
    const entries = Object.entries(a.groups[scope]).filter(([, idx]) => idx.length >= 2)
      .sort((x, y) => y[1].length - x[1].length);
    for (const [value, idx] of entries) {
      const attackers = a.items.filter((it) => it.f.scope === scope && it.f.attack && idx.includes(it.i));
      const label = `${value} ${idx.length}体`;
      if (attackers.length === 0) {
        hints.push({
          level: 'tip',
          text: `${label}：${DATA.scopes[scope]}の加撃系がまだありません。誰か1体につけると${idx.length}体の攻撃力が上がります`
        });
      } else {
        const names = attackers.map((it) => `${it.c.name}（${it.f.short}）`).join('、');
        const dup = new Set(attackers.map((it) => it.f.id)).size < attackers.length;
        hints.push(dup
          ? { level: 'tip', text: `${label}：${names}。同じ名前の実が重なっているので、片方を別の加撃系に変えると無駄がありません` }
          : { level: 'ok', text: `${label}：${names}` });
      }
    }
  }

  const sharedAny = BOND_SCOPES.some((s) => Object.values(a.groups[s]).some((idx) => idx.length >= 2));
  if (a.memberCount >= 2 && !sharedAny) {
    hints.push({
      level: 'tip',
      text: '種族・撃種・戦型がそろっていないため、絆系の実はそれぞれ自分にだけ効きます。単体で伸ばすなら上昇値の大きい同族系が向いています'
    });
  }
  return hints;
}

/* ---------- わくわくバンク：移せば厳選完了になるものを探す ---------- */

// 実はキャラにつくので、同じキャラ×同じ実は複数のパーティにまたがっていても1つの狙いにまとめる。
// gradeRank は高い等級ほど小さい（未設定は 999）。
// 狙っている実を、パーティの枠とキャラ単体のメモの両方から集める。
// ref は { party, i, k }（パーティの枠）か { char, k }（キャラ単体）。
function forEachPlan(fn) {
  for (const party of state.parties) {
    party.members.forEach((m, i) => {
      const c = charById(m.charId);
      if (c) plansOf(m).forEach((p, k) => fn(c, p, { party, i, k }));
    });
  }
  for (const c of state.characters) c.plans.forEach((p, k) => fn(c, p, { char: c, k }));
}

const planOf = (ref) => (ref.party ? ref.party.members[ref.i].plans[ref.k] : ref.char.plans[ref.k]);
const sourceLink = (ref) => (ref.party
  ? `<a href="#/party/${esc(ref.party.id)}">${esc(ref.party.name)}</a>`
  : `<a href="#/char/${esc(ref.char.id)}">キャラのメモ</a>`);

function collectTargets() {
  const map = new Map();
  forEachPlan((c, p, ref) => {
    if (!p.fruitId || !fruitById(p.fruitId)) return;
    const key = `${c.id}|${p.fruitId}`;
    if (!map.has(key)) map.set(key, { key, c, fruitId: p.fruitId, target: 999, current: 999, refs: [] });
    const t = map.get(key);
    if (p.target) t.target = Math.min(t.target, gradeRank(p.target));
    if (p.current) t.current = Math.min(t.current, gradeRank(p.current));
    if (p.status !== 'done') t.refs.push(ref);
  });
  return [...map.values()].filter((t) => t.refs.length && !(t.target < 999 && t.current <= t.target));
}

function bankMatches() {
  const targets = collectTargets();
  const complete = [];
  const upgrade = [];
  const done = new Set();
  for (const entry of state.bank) {
    const r = gradeRank(entry.grade);
    const same = targets.filter((t) => t.fruitId === entry.fruitId && t.target < 999 && t.c.accountId === entry.accountId);
    const ok = same.filter((t) => r <= t.target);
    if (ok.length) {
      complete.push({ entry, targets: ok });
      ok.forEach((t) => done.add(t.key));
    }
  }
  for (const entry of state.bank) {
    const r = gradeRank(entry.grade);
    const up = targets.filter((t) => t.fruitId === entry.fruitId && t.target < 999 && t.c.accountId === entry.accountId
      && r > t.target && r < t.current && !done.has(t.key));
    if (up.length) upgrade.push({ entry, targets: up });
  }
  const noTarget = targets.filter((t) => t.target === 999
    && state.bank.some((b) => b.fruitId === t.fruitId && b.accountId === t.c.accountId));
  return { complete, upgrade, noTarget, completeCount: done.size };
}

// バンクの実が、目標に届く等級で入っているか
const bankCovers = (c, fruitId, target) => !!target && state.bank.some((b) =>
  b.fruitId === fruitId && b.accountId === c.accountId && gradeRank(b.grade) <= gradeRank(target));

function moveFromBank(entryId, key) {
  const entry = state.bank.find((b) => b.id === entryId);
  const t = collectTargets().find((x) => x.key === key);
  if (!entry || !t) return;
  const before = JSON.stringify(state);
  for (const ref of t.refs) applyPlan(planOf(ref), 'current', entry.grade);
  for (const ref of t.refs) if (ref.party) ref.party.updatedAt = Date.now();
  entry.count -= 1;
  if (entry.count <= 0) state.bank = state.bank.filter((b) => b !== entry);
  save();
  render();
  const f = fruitById(entry.fruitId);
  toast(`${t.c.name}に${f ? f.short : '実'}（${entry.grade}）を移しました`, () => {
    state = normalize(JSON.parse(before));
    save();
    render();
  });
}

/* ---------- 表示部品 ---------- */

function chips(c) {
  if (!c) return '';
  const hitCls = c.hit === '反射' ? 'chip-hit-ref' : 'chip-hit-pen';
  return (c.race ? `<span class="chip chip-race">${esc(c.race)}</span>` : '')
    + (c.hit ? `<span class="chip ${hitCls}">${esc(c.hit)}</span>` : '')
    + (c.type ? `<span class="chip chip-type">${esc(c.type)}</span>` : '')
    + (c.accountId ? `<span class="chip chip-account">${esc(accountName(c.accountId))}</span>` : '');
}

function options(list, selected, placeholder) {
  const head = placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '';
  return head + list.map((o) => {
    const value = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

function fruitOptions(selected, placeholder = '— 狙う実を選ぶ —') {
  const groupsDef = [
    ['同族の絆', (f) => f.scope === 'race' && !f.custom],
    ['撃種の絆', (f) => f.scope === 'hit' && !f.custom],
    ['戦型の絆', (f) => f.scope === 'type' && !f.custom],
    ['自分のみに効く実', (f) => f.scope === 'self' && !f.custom],
    ['クエスト全体に効く実', (f) => f.scope === 'quest' && !f.custom],
    ['自分で追加した実', (f) => f.custom]
  ];
  const fruits = allFruits();
  let html = `<option value="">${esc(placeholder)}</option>`;
  for (const [label, test] of groupsDef) {
    const list = fruits.filter(test);
    if (!list.length) continue;
    html += `<optgroup label="${esc(label)}">`
      + list.map((f) => `<option value="${esc(f.id)}"${f.id === selected ? ' selected' : ''}>${esc(f.short)}</option>`).join('')
      + '</optgroup>';
  }
  return html;
}

// 狙う実1つ分の入力欄。bind は select に付ける data 属性（どの枠かを表す）
function planRow(p, k, bind, fk, badge = '', notes = '', extra = '') {
  const f = p.fruitId ? fruitById(p.fruitId) : null;
  return `
    <div class="plan status-${esc(p.status)}${f ? '' : ' is-empty'}">
      <div class="plan-top">
        <span class="plan-no">${k + 1}</span>
        <select class="plan-fruit" data-plan="fruitId" ${bind} data-fk="${fk}-fruit" aria-label="${k + 1}つ目の実">${fruitOptions(p.fruitId)}</select>
        ${badge}
        ${extra}
      </div>
      ${f ? `
      <div class="plan-grid">
        <label><span>目標</span><select data-plan="target" ${bind} data-fk="${fk}-target">${options(DATA.grades, p.target, '未設定')}</select></label>
        <label><span>今</span><select data-plan="current" ${bind} data-fk="${fk}-current">${options(DATA.grades, p.current, 'なし')}</select></label>
        <label><span>状態</span><select data-plan="status" ${bind} data-fk="${fk}-status">${options(DATA.statuses.map((s) => ({ value: s.id, label: s.label })), p.status)}</select></label>
      </div>` : ''}
      ${notes}
    </div>`;
}

function scopeBadge(f) {
  if (!f) return '';
  if (f.scope === 'quest') return '<span class="badge quest">クエスト全体</span>';
  if (BOND_SCOPES.includes(f.scope)) return `<span class="badge bond">${DATA.scopes[f.scope]}</span>`;
  return '<span class="badge self">自分のみ</span>';
}

function progressOf(party) {
  let total = 0;
  let done = 0;
  let doing = 0;
  for (const m of party.members) {
    for (const p of plansOf(m)) {
      if (!p.fruitId) continue;
      total++;
      if (p.status === 'done') done++;
      if (p.status === 'doing') doing++;
    }
  }
  return { total, done, doing };
}

function emptyBox(text, actionHtml = '') {
  return `<div class="empty"><p>${text}</p>${actionHtml}</div>`;
}

/* ---------- 画面：パーティ一覧 ---------- */

function viewParties() {
  const list = [...state.parties].sort((a, b) => b.updatedAt - a.updatedAt);
  const cards = list.map((p) => {
    const pr = progressOf(p);
    const names = p.members.map((m) => charById(m.charId)?.name).filter(Boolean);
    const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
    return `
      <a class="card party-card" href="#/party/${esc(p.id)}">
        <div class="party-card-head">
          <h3>${esc(p.name)}</h3>
          ${p.quest ? `<span class="quest">${esc(p.quest)}</span>` : ''}
        </div>
        <p class="party-members">${names.length ? names.map(esc).join(' / ') : 'まだキャラがいません'}</p>
        <div class="progress" aria-label="完了 ${pr.done} / ${pr.total}">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
        <p class="party-meta">完了 ${pr.done} / ${pr.total}${pr.doing ? `・厳選中 ${pr.doing}` : ''}</p>
      </a>`;
  }).join('');

  return `
    <section>
      <div class="section-head">
        <h2>パーティ</h2>
        <button class="btn primary" data-action="new-party">＋ パーティを作る</button>
      </div>
      ${list.length ? `<div class="stack">${cards}</div>` : emptyBox(
        'クエストごとにパーティを作り、4体それぞれに狙う実をメモしていきます。',
        '<button class="btn primary" data-action="new-party">最初のパーティを作る</button>'
      )}
    </section>`;
}

/* ---------- 画面：パーティ詳細 ---------- */

function viewParty(id) {
  const party = partyById(id);
  if (!party) {
    return emptyBox('このパーティは見つかりませんでした。', '<a class="btn" href="#/parties">パーティ一覧へ</a>');
  }
  const a = analyze(party);
  const hints = partyHints(party, a);

  const groupRow = (scope, label) => {
    const entries = Object.entries(a.groups[scope]).sort((x, y) => y[1].length - x[1].length);
    if (!entries.length) return '';
    return `<div class="synergy-row"><span class="synergy-label">${label}</span><div class="synergy-chips">`
      + entries.map(([v, idx]) => `<span class="count-chip${idx.length >= 2 ? ' shared' : ''}">${esc(v)}<b>×${idx.length}</b></span>`).join('')
      + '</div></div>';
  };

  const synergy = a.memberCount ? `
      <div class="synergy">
        ${groupRow('race', '種族')}
        ${groupRow('hit', '撃種')}
        ${groupRow('type', '戦型')}
      </div>
      ${hints.length ? `<ul class="hints">${hints.map((h) => `<li class="hint-${h.level}">${esc(h.text)}</li>`).join('')}</ul>` : ''}`
    : '<p class="muted">下の枠にキャラを入れると、種族・撃種・戦型の重なりがここに出ます。</p>';

  const charOptions = [...state.characters].sort((x, y) => x.name.localeCompare(y.name, 'ja'))
    .map((c) => {
      const attrs = [c.race, c.hit, normType(c.type)].filter(Boolean).join('/');
      return { value: c.id, label: `${c.name}${attrs ? `（${attrs}）` : ''}${c.accountId ? `・${accountName(c.accountId)}` : ''}` };
    });

  const slots = party.members.map((m, i) => {
    const c = a.chars[i];
    const plans = plansOf(m);
    const reachRow = c ? `
      <div class="reach">
        <span>絆の実が届く人数</span>
        <span class="reach-item">同族<b>${a.reach(i, 'race')}</b></span>
        <span class="reach-item">撃種<b>${a.reach(i, 'hit')}</b></span>
        <span class="reach-item">戦型<b>${a.reach(i, 'type')}</b></span>
      </div>` : '';

    const rows = plans.map((p, k) => {
      const f = p.fruitId ? fruitById(p.fruitId) : null;
      let badge = '';
      if (f && BOND_SCOPES.includes(f.scope)) {
        badge = c ? `<span class="badge bond">${DATA.scopes[f.scope]} ×${a.reach(i, f.scope)}体</span>` : '';
      } else if (f && f.scope === 'quest') {
        badge = '<span class="badge quest">クエスト全体</span>';
      } else if (f) {
        badge = '<span class="badge self">自分のみ</span>';
      }
      const notes = (a.notes[`${i}-${k}`] || [])
        .map((n) => `<p class="note note-${n.level}">${esc(n.text)}</p>`).join('');
      return planRow(p, k, `data-slot="${i}" data-k="${k}"`, `plan-${i}-${k}`, badge, notes);
    }).join('');

    return `
      <article class="card slot">
        <div class="slot-head">
          <span class="slot-no">${i + 1}</span>
          <select class="slot-char" data-slot-char="${i}" data-fk="slot-${i}" aria-label="${i + 1}体目のキャラ">
            ${options(charOptions, m.charId || '', '— キャラを選ぶ —')}
            <option value="__new">＋ 新しいキャラを登録</option>
          </select>
          ${c ? `<a class="icon-btn" href="#/char/${esc(c.id)}" aria-label="${esc(c.name)}を開く">✎</a>` : ''}
        </div>
        ${c ? `<div class="chips">${chips(c)}</div>${c.race && c.hit && c.type ? '' : `<p class="muted small">種族・撃種・戦型を<a href="#/char/${esc(c.id)}">キャラの画面</a>で入れると、相性を判定できます。</p>`}${c.memo ? `<p class="char-memo">${esc(c.memo)}</p>` : ''}` : ''}
        ${reachRow}
        ${c ? `<div class="plans">${rows}</div>` : ''}
      </article>`;
  }).join('');

  const pr = progressOf(party);
  return `
    <section>
      <a class="back" href="#/parties">‹ パーティ一覧</a>
      <div class="card party-info">
        <label class="field">
          <span>パーティ名</span>
          <input data-party-field="name" value="${esc(party.name)}" maxlength="40" autocomplete="off">
        </label>
        <label class="field">
          <span>使うクエスト（任意）</span>
          <input data-party-field="quest" value="${esc(party.quest)}" maxlength="60" autocomplete="off" placeholder="例：禁忌の獄 深淵">
        </label>
        <p class="party-meta">完了 ${pr.done} / ${pr.total}${pr.doing ? `・厳選中 ${pr.doing}` : ''}</p>
      </div>

      <div class="card">
        <h3 class="card-title">編成の相性</h3>
        ${synergy}
      </div>

      <div class="stack">${slots}</div>

      <div class="card">
        <label class="field">
          <span>パーティのメモ</span>
          <textarea data-party-field="memo" rows="4" maxlength="1000" placeholder="立ち回りや、実の付け替え候補など">${esc(party.memo)}</textarea>
        </label>
      </div>

      <div class="row-actions">
        <button class="btn" data-action="dup-party" data-id="${esc(party.id)}">複製する</button>
        <button class="btn danger" data-action="delete-party" data-id="${esc(party.id)}">削除する</button>
      </div>
    </section>`;
}

/* ---------- 画面：やること（キャラ別の厳選リスト） ---------- */

let todoFilter = 'open';

function viewTodo() {
  const byChar = new Map();
  forEachPlan((c, p, ref) => {
    if (!p.fruitId) return;
    if (todoFilter === 'open' && p.status === 'done') return;
    const f = fruitById(p.fruitId);
    if (!f) return;
    if (!byChar.has(c.id)) byChar.set(c.id, { c, rows: [] });
    byChar.get(c.id).rows.push({ ref, p, f });
  });

  const order = { doing: 0, todo: 1, compromise: 2, done: 3 };
  const groups = [...byChar.values()].sort((x, y) => {
    const dx = x.rows.some((r) => r.p.status === 'doing') ? 0 : 1;
    const dy = y.rows.some((r) => r.p.status === 'doing') ? 0 : 1;
    return dx - dy || x.c.name.localeCompare(y.c.name, 'ja');
  });
  const prioritized = groups.filter((g) => g.c.priority);
  const others = groups.filter((g) => !g.c.priority);

  const card = ({ c, rows }) => {
    rows.sort((x, y) => order[x.p.status] - order[y.p.status]);
    return `
      <article class="card todo-card${c.priority ? ' is-priority' : ''}">
        <div class="todo-head">
          ${starButton(c)}
          <h3><a class="plain" href="#/char/${esc(c.id)}">${esc(c.name)}</a></h3>
          <div class="chips">${chips(c)}</div>
        </div>
        <ul class="todo-list">
          ${rows.map((r) => `
            <li class="todo-row status-${esc(r.p.status)}">
              <div class="todo-main">
                <b>${esc(r.f.short)}</b>
                <span class="grade">${esc(r.p.current || 'なし')} → ${esc(r.p.target || '未設定')}</span>
                ${r.p.status !== 'done' && bankCovers(c, r.p.fruitId, r.p.target) ? '<a class="badge in-bank" href="#/bank">バンクにあり</a>' : ''}
              </div>
              <div class="todo-sub">
                ${sourceLink(r.ref)}
                <select ${r.ref.party
                  ? `data-todo="${esc(r.ref.party.id)}" data-slot="${r.ref.i}"`
                  : `data-todo-char="${esc(r.ref.char.id)}"`} data-k="${r.ref.k}" aria-label="状態">
                  ${options(DATA.statuses.map((s) => ({ value: s.id, label: s.label })), r.p.status)}
                </select>
              </div>
            </li>`).join('')}
        </ul>
      </article>`;
  };

  // 優先にしたのに、未完了の実が無いキャラ
  const idle = state.characters.filter((c) => c.priority && !byChar.has(c.id));

  return `
    <section>
      <div class="section-head">
        <h2>やること</h2>
        <div class="seg" role="group" aria-label="表示する範囲">
          <button class="${todoFilter === 'open' ? 'on' : ''}" data-action="todo-filter" data-value="open">未完了</button>
          <button class="${todoFilter === 'all' ? 'on' : ''}" data-action="todo-filter" data-value="all">すべて</button>
        </div>
      </div>
      <p class="muted lead">英雄の神殿でリーダーにするキャラごとに、狙っている実をまとめています。☆を押したキャラは「優先」として上にまとまります。</p>
      ${groups.length || idle.length ? `
        <h3 class="group-title">★ 優先して厳選する</h3>
        ${prioritized.length ? `<div class="stack">${prioritized.map(card).join('')}</div>`
          : '<p class="muted">まだありません。下のキャラの☆を押すと、ここに移ります。</p>'}
        ${idle.length ? `<p class="muted small">優先にしているが、${todoFilter === 'open' ? '未完了の' : ''}実が無いキャラ：${idle.map((c) => `<a href="#/char/${esc(c.id)}">${esc(c.name)}</a>`).join('、')}</p>` : ''}
        ${others.length ? `<h3 class="group-title">そのほか</h3><div class="stack">${others.map(card).join('')}</div>` : ''}`
      : emptyBox(
        todoFilter === 'open' ? '未完了の厳選はありません。' : 'まだ狙う実が登録されていません。',
        '<a class="btn primary" href="#/chars">キャラに狙う実をメモする</a>'
      )}
    </section>`;
}

/* ---------- 画面：わくわくバンク ---------- */

function viewBank() {
  const { complete, upgrade, noTarget, completeCount } = bankMatches();
  const total = state.bank.reduce((n, b) => n + b.count, 0);
  const upgradeCount = new Set(upgrade.flatMap((x) => x.targets.map((t) => t.key))).size;
  const gradeText = (rank) => (rank < 999 ? DATA.grades[rank] : 'なし');

  const entryCard = ({ entry, targets }, isComplete) => {
    const f = fruitById(entry.fruitId);
    return `
      <article class="card bank-hit${isComplete ? ' is-complete' : ''}">
        <div class="bank-hit-head">
          <b>${esc(f ? f.short : '（消した実）')}</b>
          <span class="badge grade-badge">${esc(entry.grade)}</span>
          <span class="badge self">×${entry.count}</span>
          ${state.accounts.length ? `<span class="badge account">${esc(accountName(entry.accountId))}</span>` : ''}
          ${targets.length > entry.count ? `<span class="badge bond">候補${targets.length}体に${entry.count}個</span>` : ''}
        </div>
        <ul class="bank-targets">
          ${targets.map((t) => `
            <li>
              <div class="bank-target-main">
                <b>${esc(t.c.name)}</b>
                <span class="grade">今 ${esc(gradeText(t.current))} → 目標 ${esc(gradeText(t.target))}</span>
                <span class="party-meta">${t.refs.map(sourceLink).filter((x, n, arr) => arr.indexOf(x) === n).join('、')}</span>
              </div>
              <button class="btn${isComplete ? ' primary' : ''}" data-action="bank-move" data-id="${esc(entry.id)}" data-key="${esc(t.key)}">移した</button>
            </li>`).join('')}
        </ul>
      </article>`;
  };

  const list = state.bank.map((b) => {
    const f = fruitById(b.fruitId);
    return `
      <li>
        <b>${esc(f ? f.short : '（消した実）')}</b>
        <span>${state.accounts.length ? `${esc(accountName(b.accountId))}・` : ''}${esc(b.grade)}・${b.count}個${b.memo ? `・${esc(b.memo)}` : ''}</span>
        <span class="fruit-actions">
          <button class="icon-btn" data-action="edit-bank" data-id="${esc(b.id)}" aria-label="編集">✎</button>
          <button class="icon-btn danger" data-action="delete-bank" data-id="${esc(b.id)}" aria-label="削除">×</button>
        </span>
      </li>`;
  }).join('');

  return `
    <section>
      <div class="section-head">
        <h2>わくわくバンク</h2>
        <button class="btn primary" data-action="new-bank">＋ 実を登録</button>
      </div>
      <p class="muted lead">バンクに入れている実を登録すると、パーティやキャラで狙っている実と照らし合わせて、移せば厳選が終わるキャラを探します。</p>
      <div class="stats">
        <div class="stat"><span>バンクの実</span><b>${total}</b></div>
        <div class="stat ok"><span>移せば完了</span><b>${completeCount}</b></div>
        <div class="stat"><span>等級が上がる</span><b>${upgradeCount}</b></div>
      </div>

      <h3 class="group-title">移せば厳選完了</h3>
      ${complete.length ? `<div class="stack">${complete.map((x) => entryCard(x, true)).join('')}</div>`
        : `<p class="muted">${state.bank.length ? '今のバンクの中に、移せば目標の等級に届く実はありません。' : 'バンクの実を登録すると、ここに候補が出ます。'}</p>`}

      ${upgrade.length ? `<h3 class="group-title">目標には届かないが、今より等級が上がる</h3>
        <div class="stack">${upgrade.map((x) => entryCard(x, false)).join('')}</div>` : ''}

      ${noTarget.length ? `<p class="muted small">目標の等級が未設定なので判定していない枠：${noTarget.map((t) => `${esc(t.c.name)}の${esc(fruitById(t.fruitId).short)}`).join('、')}</p>` : ''}

      <div class="card">
        <h3 class="card-title">バンクに入っている実</h3>
        ${list ? `<ul class="fruit-list">${list}</ul>` : '<p class="muted">まだ登録されていません。</p>'}
      </div>
    </section>`;
}

/* ---------- 画面：キャラ（メイン：キャラ名と狙う実のメモ） ---------- */

let charFilter = 'all';

function starButton(c) {
  return `<button class="star${c.priority ? ' on' : ''}" data-action="toggle-priority" data-id="${esc(c.id)}"
    aria-pressed="${c.priority}" aria-label="${esc(c.name)}を優先にする" title="優先して厳選する">${c.priority ? '★' : '☆'}</button>`;
}

// キャラ単体で狙う実の入力欄（一覧と詳細の両方で使う）
function charPlans(c) {
  const rows = c.plans.map((p, k) => planRow(p, k, `data-char="${esc(c.id)}" data-k="${k}"`, `cplan-${c.id}-${k}`,
    scopeBadge(p.fruitId ? fruitById(p.fruitId) : null), '',
    `<button class="icon-btn" data-action="remove-cplan" data-id="${esc(c.id)}" data-k="${k}" aria-label="${k + 1}つ目の実を消す">×</button>`)).join('');
  return `
    ${rows ? `<div class="plans">${rows}</div>` : ''}
    ${c.plans.length < MAX_CHAR_PLANS
      ? `<button class="btn add-plan" data-action="add-cplan" data-id="${esc(c.id)}">＋ 狙う実を追加</button>` : ''}`;
}

function viewChars() {
  if (charFilter !== 'all' && charFilter !== '' && !accountById(charFilter)) charFilter = 'all';
  const list = [...state.characters]
    .filter((c) => charFilter === 'all' || c.accountId === charFilter)
    .sort((x, y) => (y.priority - x.priority) || x.name.localeCompare(y.name, 'ja'));

  const items = list.map((c) => `
    <article class="card char-card${c.priority ? ' is-priority' : ''}">
      <div class="char-card-head">
        ${starButton(c)}
        <h3><a class="plain" href="#/char/${esc(c.id)}">${esc(c.name)}</a></h3>
        ${c.accountId ? `<span class="chip chip-account">${esc(accountName(c.accountId))}</span>` : ''}
        <a class="icon-btn" href="#/char/${esc(c.id)}" aria-label="${esc(c.name)}の詳細">›</a>
      </div>
      ${c.memo ? `<p class="char-memo">${esc(c.memo)}</p>` : ''}
      ${charPlans(c)}
    </article>`).join('');

  return `
    <section>
      <h2>キャラ</h2>
      <form class="add-char card" data-form="add-char" autocomplete="off">
        <input name="name" maxlength="40" placeholder="キャラ名を入れて追加" aria-label="キャラ名" required>
        <button class="btn primary" type="submit">追加</button>
      </form>
      ${state.accounts.length ? `
      <div class="seg wrap" role="group" aria-label="アカウントで絞り込む">
        ${[{ value: 'all', label: 'すべて' }].concat(accountChoices()).map((o) =>
          `<button class="${charFilter === o.value ? 'on' : ''}" data-action="char-filter" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}
      </div>` : ''}
      ${list.length ? `<div class="stack">${items}</div>` : state.characters.length
        ? '<p class="muted">このアカウントのキャラはまだいません。</p>'
        : emptyBox('キャラ名を入れて追加し、厳選したい実を選んでいきます。種族などの情報は要りません。')}

      <div class="card accounts-card">
        <div class="section-head tight">
          <h3 class="card-title">アカウント<small>サブ垢などを登録すると、キャラやバンクの実をアカウントごとに分けてメモできます（任意）。</small></h3>
          <button class="btn" data-action="new-account">＋ 追加</button>
        </div>
        ${state.accounts.length ? `<ul class="fruit-list">
          ${state.accounts.map((a) => {
            const n = state.characters.filter((c) => c.accountId === a.id).length;
            return `
            <li>
              <b>${esc(a.name)}</b>
              <span>キャラ ${n} 体</span>
              <span class="fruit-actions">
                <button class="icon-btn" data-action="edit-account" data-id="${esc(a.id)}" aria-label="${esc(a.name)}を編集">✎</button>
                <button class="icon-btn danger" data-action="delete-account" data-id="${esc(a.id)}" aria-label="${esc(a.name)}を削除">×</button>
              </span>
              ${a.memo ? `<p class="char-memo account-memo">${esc(a.memo)}</p>` : ''}
            </li>`;
          }).join('')}
        </ul>` : '<p class="muted">登録していないキャラやバンクの実は、すべて「メイン」として扱います。</p>'}
      </div>
    </section>`;
}

/* ---------- 画面：キャラ詳細 ---------- */

function viewChar(id) {
  const c = charById(id);
  if (!c) return emptyBox('このキャラは見つかりませんでした。', '<a class="btn" href="#/chars">キャラ一覧へ</a>');

  // パーティの枠で狙っている実（読むだけ。編集はパーティの画面で）
  const inParties = [];
  for (const party of state.parties) {
    party.members.forEach((m) => {
      if (m.charId !== c.id) return;
      plansOf(m).forEach((p) => {
        const f = p.fruitId ? fruitById(p.fruitId) : null;
        if (f) inParties.push({ party, p, f });
      });
    });
  }
  const hasAttrs = c.race || c.hit || c.type;

  return `
    <section>
      <a class="back" href="#/chars">‹ キャラ一覧</a>
      <div class="card">
        <div class="char-card-head">
          ${starButton(c)}
          <input class="name-input" data-char-field="name" data-id="${esc(c.id)}" value="${esc(c.name)}" maxlength="40" aria-label="キャラ名">
        </div>
        <label class="field">
          <span>メモ（任意）</span>
          <textarea data-char-field="memo" data-id="${esc(c.id)}" rows="2" maxlength="300" placeholder="例：運極、今ついている実 など">${esc(c.memo)}</textarea>
        </label>
        ${state.accounts.length ? `
        <label class="field">
          <span>アカウント</span>
          <select data-char-field="accountId" data-id="${esc(c.id)}">${options(accountChoices(), c.accountId)}</select>
        </label>` : ''}
      </div>

      <div class="card">
        <h3 class="card-title">狙う実</h3>
        ${charPlans(c)}
      </div>

      <details class="card attrs"${hasAttrs ? ' open' : ''}>
        <summary>種族・撃種・戦型（パーティで使うときだけ）</summary>
        <p class="muted">パーティに入れたとき、絆の実が何体に届くかの判定に使います。厳選のメモだけなら空欄のままで大丈夫です。</p>
        <label class="field">
          <span>種族</span>
          <input data-char-field="race" data-id="${esc(c.id)}" value="${esc(c.race)}" maxlength="20" list="raceList" autocomplete="off" placeholder="候補から選ぶか入力">
        </label>
        <div class="field-row">
          <label class="field"><span>撃種</span>
            <select data-char-field="hit" data-id="${esc(c.id)}">${options(DATA.hits, c.hit, '未設定')}</select></label>
          <label class="field"><span>戦型</span>
            <select data-char-field="type" data-id="${esc(c.id)}">${options(DATA.types, c.type, '未設定')}</select></label>
        </div>
      </details>

      ${inParties.length ? `
      <div class="card">
        <h3 class="card-title">パーティで狙っている実</h3>
        <ul class="fruit-list">
          ${inParties.map(({ party, p, f }) => `
            <li><b>${esc(f.short)}</b><span>${esc(p.current || 'なし')} → ${esc(p.target || '未設定')}・${esc(statusLabel(p.status))}</span>
              <a class="fruit-actions" href="#/party/${esc(party.id)}">${esc(party.name)}</a></li>`).join('')}
        </ul>
      </div>` : ''}

      <div class="row-actions">
        <button class="btn danger" data-action="delete-char" data-id="${esc(c.id)}">このキャラを削除する</button>
      </div>
    </section>`;
}

/* ---------- 画面：データ ---------- */

function viewData() {
  const used = (() => {
    try {
      return new Blob([localStorage.getItem(STORE_KEY) || '']).size;
    } catch (e) {
      return 0;
    }
  })();
  return `
    <section>
      <h2>データ</h2>
      <div class="card">
        <h3 class="card-title">表示</h3>
        <div class="seg" role="group" aria-label="テーマ">
          ${[['', '端末に合わせる'], ['light', 'ライト'], ['dark', 'ダーク']].map(([v, l]) =>
            `<button class="${themeSetting() === v ? 'on' : ''}" data-action="theme" data-value="${v}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">パーティの実の枠の数</h3>
        <div class="seg" role="group" aria-label="実の枠の数">
          <button class="${state.settings.slotCount === 3 ? 'on' : ''}" data-action="slot-count" data-value="3">3つ</button>
          <button class="${state.settings.slotCount === 4 ? 'on' : ''}" data-action="slot-count" data-value="4">4つ</button>
        </div>
        <p class="muted">パーティの画面で、4つ目の枠を使うキャラがいる場合は「4つ」にします。3つに戻しても4つ目のメモは消えません。キャラの画面では4つまで自由に追加できます。</p>
      </div>
      <div class="card">
        <h3 class="card-title">書き出し・読み込み</h3>
        <p>メモはこの端末のブラウザに自動で保存されています。機種変更やバックアップのときは、ファイルに書き出してから別の端末で読み込んでください。</p>
        <div class="row-actions">
          <button class="btn primary" data-action="export">ファイルに書き出す</button>
          <button class="btn" data-action="import">ファイルから読み込む</button>
        </div>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
        <p class="muted">キャラ ${state.characters.length} 体・パーティ ${state.parties.length} 個・バンクの実 ${state.bank.length} 種類${state.accounts.length ? `・アカウント ${state.accounts.length} 個` : ''}・使用量 約 ${Math.ceil(used / 1024)} KB</p>
      </div>
      <div class="card">
        <h3 class="card-title">全部消す</h3>
        <p>この端末に保存したキャラ・バンク・アカウント・パーティをすべて消します。元に戻せないので、先に書き出しておくと安心です。</p>
        <button class="btn danger" data-action="reset">すべてのデータを消す</button>
      </div>
      <p class="muted small">ブラウザのサイトデータを消すとメモも消えます。ホーム画面に追加すると、電波がなくても開けます。</p>
    </section>`;
}

/* ---------- ルーティング ---------- */

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, id] = hash.split('/');
  return { name: name || 'chars', id: id ? decodeURIComponent(id) : '' };
}

function render() {
  const { name, id } = currentRoute();
  const active = document.activeElement?.dataset?.fk;
  const views = {
    parties: viewParties,
    party: () => viewParty(id),
    char: () => viewChar(id),
    todo: viewTodo,
    bank: viewBank,
    chars: viewChars,
    data: viewData
  };
  const app = $('#app');
  app.innerHTML = (views[name] || viewChars)();

  const tab = name === 'party' ? 'parties' : name === 'char' ? 'chars' : name;
  $$('.tabbar a').forEach((a) => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (active) {
    const el = app.querySelector(`[data-fk="${CSS.escape(active)}"]`);
    if (el) el.focus({ preventScroll: true });
  }
}

let lastRoute = '';
window.addEventListener('hashchange', () => {
  const r = location.hash;
  render();
  if (r !== lastRoute) window.scrollTo(0, 0);
  lastRoute = r;
});

/* ---------- ダイアログ ---------- */

// 開くときと同じ経路（下へスライド）で閉じてから、dialog を閉じる
function closeSheet(dlg) {
  if (!dlg?.open || dlg.classList.contains('closing')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    dlg.close();
    return;
  }
  dlg.classList.add('closing');
  const done = (e) => {
    if (e.target !== dlg) return;
    dlg.removeEventListener('animationend', done);
    dlg.classList.remove('closing');
    dlg.close();
  };
  dlg.addEventListener('animationend', done);
}

function openBankDialog(b) {
  const form = $('#bankForm');
  form.reset();
  $('#bankDialogTitle').textContent = b ? 'バンクの実を編集' : 'バンクに実を登録';
  form.elements.id.value = b?.id || '';
  form.elements.fruit.innerHTML = fruitOptions(b?.fruitId || '', '— 実を選ぶ —');
  form.elements.grade.innerHTML = options(DATA.grades, b?.grade || DATA.grades[0]);
  form.elements.count.value = b?.count || 1;
  form.elements.memo.value = b?.memo || '';
  form.elements.account.innerHTML = options(accountChoices(), b?.accountId ?? defaultAccount());
  form.elements.account.closest('.field').hidden = !state.accounts.length;
  $('#bankDialog').showModal();
}

$('#bankForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const data = {
    fruitId: f.fruit.value,
    grade: f.grade.value,
    count: Math.min(99, Math.max(1, Math.floor(Number(f.count.value)) || 1)),
    memo: f.memo.value.trim(),
    accountId: accountById(f.account.value) ? f.account.value : ''
  };
  if (!data.fruitId || !DATA.grades.includes(data.grade)) return;
  const existing = state.bank.find((x) => x.id === f.id.value);
  if (existing) {
    Object.assign(existing, data);
  } else {
    const same = state.bank.find((x) => x.fruitId === data.fruitId && x.grade === data.grade
      && x.memo === data.memo && x.accountId === data.accountId);
    if (same) same.count = Math.min(99, same.count + data.count);
    else state.bank.push({ id: uid(), ...data });
  }
  save();
  closeSheet($('#bankDialog'));
  render();
  const n = bankMatches().complete
    .filter((x) => x.entry.fruitId === data.fruitId && x.entry.grade === data.grade)
    .reduce((sum, x) => sum + x.targets.length, 0);
  toast(n ? `移せば完了になるキャラが${n}体見つかりました` : 'バンクに登録しました');
});

// キャラ一覧をアカウントで絞り込んでいるときは、新しく登録するものもそのアカウントにする
const defaultAccount = () => (charFilter !== 'all' && accountById(charFilter) ? charFilter : '');

function openAccountDialog(a) {
  const form = $('#accountForm');
  form.reset();
  $('#accountDialogTitle').textContent = a ? 'アカウントを編集' : 'アカウントを追加';
  form.elements.id.value = a?.id || '';
  form.elements.name.value = a?.name || '';
  form.elements.memo.value = a?.memo || '';
  $('#accountDialog').showModal();
}

$('#accountForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const data = { name: f.name.value.trim(), memo: f.memo.value.trim() };
  if (!data.name) return;
  const existing = accountById(f.id.value);
  if (existing) Object.assign(existing, data);
  else state.accounts.push({ id: uid(), ...data });
  save();
  closeSheet($('#accountDialog'));
  render();
  toast(`${data.name}を保存しました`);
});

function themeSetting() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : '';
  } catch (e) {
    return '';
  }
}

/* ---------- 操作 ---------- */

function setPlan(party, i, k, key, value) {
  const member = party.members[i];
  plansOf(member);
  applyPlan(member.plans[k], key, value);
  touch(party);
}

function setCharPlan(c, k, key, value) {
  if (!c.plans[k]) return;
  applyPlan(c.plans[k], key, value);
  save();
}

function addChar(name) {
  const c = {
    id: uid(), name: name.slice(0, 40), race: '', hit: '', type: '', memo: '',
    accountId: defaultAccount(), priority: false, plans: [emptyPlan()]
  };
  state.characters.push(c);
  save();
  return c;
}

function applyPlan(p, key, value) {
  if (key === 'fruitId') {
    p.fruitId = value;
    if (value && !p.target) p.target = '特級L';
    if (!value) Object.assign(p, emptyPlan());
  } else if (key === 'current') {
    p.current = value;
    // 目標に届いたら完了、届いていなければ厳選中にする
    if (value && p.target && gradeRank(value) <= gradeRank(p.target)) p.status = 'done';
    else if (value && p.status === 'todo') p.status = 'doing';
  } else {
    p[key] = value;
  }
}

const actions = {
  'new-party'() {
    const p = newParty(`パーティ${state.parties.length + 1}`);
    state.parties.push(p);
    save();
    location.hash = `#/party/${p.id}`;
  },
  'dup-party'(el) {
    const src = partyById(el.dataset.id);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    copy.name = `${src.name}（コピー）`;
    copy.updatedAt = Date.now();
    state.parties.push(copy);
    save();
    location.hash = `#/party/${copy.id}`;
    toast('パーティを複製しました');
  },
  'delete-party'(el) {
    const p = partyById(el.dataset.id);
    if (!p || !confirm(`「${p.name}」を削除しますか？`)) return;
    state.parties = state.parties.filter((x) => x !== p);
    save();
    location.hash = '#/parties';
    toast('パーティを削除しました');
  },
  'delete-char'(el) {
    const c = charById(el.dataset.id);
    if (!c) return;
    const used = state.parties.filter((p) => p.members.some((m) => m.charId === c.id));
    const msg = used.length
      ? `「${c.name}」を削除しますか？\n${used.length}個のパーティから外れ、その枠の実のメモも消えます。`
      : `「${c.name}」を削除しますか？`;
    if (!confirm(msg)) return;
    for (const p of used) {
      for (const m of p.members) {
        if (m.charId === c.id) {
          m.charId = null;
          m.plans = [];
        }
      }
    }
    state.characters = state.characters.filter((x) => x !== c);
    save();
    if (currentRoute().name === 'char') location.hash = '#/chars';
    else render();
    toast(`${c.name}を削除しました`);
  },
  'toggle-priority'(el) {
    const c = charById(el.dataset.id);
    if (!c) return;
    c.priority = !c.priority;
    save();
    render();
  },
  'add-cplan'(el) {
    const c = charById(el.dataset.id);
    if (!c || c.plans.length >= MAX_CHAR_PLANS) return;
    c.plans.push(emptyPlan());
    save();
    render();
    $(`[data-fk="cplan-${CSS.escape(c.id)}-${c.plans.length - 1}-fruit"]`)?.focus();
  },
  'remove-cplan'(el) {
    const c = charById(el.dataset.id);
    const k = Number(el.dataset.k);
    if (!c || !c.plans[k]) return;
    const before = JSON.stringify(state);
    const removed = c.plans.splice(k, 1)[0];
    save();
    render();
    if (removed.fruitId) {
      toast('狙う実を消しました', () => {
        state = normalize(JSON.parse(before));
        save();
        render();
      });
    }
  },
  'new-bank'() {
    openBankDialog(null);
  },
  'edit-bank'(el) {
    openBankDialog(state.bank.find((b) => b.id === el.dataset.id));
  },
  'delete-bank'(el) {
    const b = state.bank.find((x) => x.id === el.dataset.id);
    if (!b) return;
    const before = JSON.stringify(state);
    state.bank = state.bank.filter((x) => x !== b);
    save();
    render();
    toast('バンクの実を消しました', () => {
      state = normalize(JSON.parse(before));
      save();
      render();
    });
  },
  'bank-move'(el) {
    moveFromBank(el.dataset.id, el.dataset.key);
  },
  theme(el) {
    const v = el.dataset.value;
    try {
      if (v) localStorage.setItem(THEME_KEY, v);
      else localStorage.removeItem(THEME_KEY);
    } catch (e) { /* 保存できなくても、この表示中だけは切り替える */ }
    if (v) document.documentElement.setAttribute('data-theme', v);
    else document.documentElement.removeAttribute('data-theme');
    render();
  },
  'new-account'() {
    openAccountDialog(null);
  },
  'edit-account'(el) {
    openAccountDialog(accountById(el.dataset.id));
  },
  'delete-account'(el) {
    const a = accountById(el.dataset.id);
    if (!a || !confirm(`「${a.name}」を削除しますか？\nこのアカウントのキャラとバンクの実は「メイン」に移ります。`)) return;
    state.accounts = state.accounts.filter((x) => x !== a);
    for (const c of state.characters) if (c.accountId === a.id) c.accountId = '';
    for (const b of state.bank) if (b.accountId === a.id) b.accountId = '';
    if (charFilter === a.id) charFilter = 'all';
    save();
    render();
  },
  'char-filter'(el) {
    charFilter = el.dataset.value;
    render();
  },
  'todo-filter'(el) {
    todoFilter = el.dataset.value;
    render();
  },
  'slot-count'(el) {
    state.settings.slotCount = Number(el.dataset.value) === 4 ? 4 : 3;
    save();
    render();
  },
  export() {
    const json = JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = `wakuwaku-memo-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`${name} を書き出しました`);
  },
  import() {
    $('#importFile')?.click();
  },
  reset() {
    if (!confirm('すべてのデータを消します。元に戻せません。よろしいですか？')) return;
    state = defaultState();
    save();
    render();
    toast('データを消しました');
  },
  'close-dialog'(el) {
    closeSheet(el.closest('dialog'));
  }
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;

  if (el.id === 'importFile') {
    const file = el.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        if (!Array.isArray(raw.characters) || !Array.isArray(raw.parties)) throw new Error('format');
        const next = normalize(raw);
        if (!confirm(`キャラ ${next.characters.length} 体・パーティ ${next.parties.length} 個を読み込みます。\n今のデータは置き換わります。よろしいですか？`)) return;
        state = next;
        save();
        render();
        toast('読み込みました');
      } catch (err) {
        toast('このファイルは読み込めませんでした');
      }
    };
    reader.readAsText(file);
    el.value = '';
    return;
  }

  const { name, id } = currentRoute();

  if (el.dataset.slotChar !== undefined && name === 'party') {
    const party = partyById(id);
    const i = Number(el.dataset.slotChar);
    if (!party) return;
    if (el.value === '__new') {
      el.value = party.members[i].charId || '';
      const nm = (prompt('キャラ名') || '').trim();
      if (!nm) return;
      const c = addChar(nm);
      c.plans = [];
      party.members[i].charId = c.id;
      touch(party);
      render();
      return;
    }
    // キャラを入れ替えても実のメモは引き継ぐ。枠を空にしたときだけ消す
    party.members[i].charId = el.value || null;
    if (!el.value) party.members[i].plans = [];
    touch(party);
    render();
    return;
  }

  if (el.dataset.plan && name === 'party' && !el.dataset.char) {
    const party = partyById(id);
    if (!party) return;
    setPlan(party, Number(el.dataset.slot), Number(el.dataset.k), el.dataset.plan, el.value);
    render();
    return;
  }

  if (el.dataset.plan && el.dataset.char) {
    const c = charById(el.dataset.char);
    if (!c) return;
    setCharPlan(c, Number(el.dataset.k), el.dataset.plan, el.value);
    render();
    return;
  }

  if (el.dataset.charField && el.tagName === 'SELECT') {
    const c = charById(el.dataset.id);
    if (!c) return;
    c[el.dataset.charField] = el.value;
    save();
    render();
    return;
  }

  if (el.dataset.todo) {
    const party = partyById(el.dataset.todo);
    if (!party) return;
    setPlan(party, Number(el.dataset.slot), Number(el.dataset.k), 'status', el.value);
    render();
    return;
  }

  if (el.dataset.todoChar) {
    const c = charById(el.dataset.todoChar);
    if (!c) return;
    setCharPlan(c, Number(el.dataset.k), 'status', el.value);
    render();
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.charField && el.tagName !== 'SELECT') {
    const c = charById(el.dataset.id);
    if (!c) return;
    const v = el.dataset.charField === 'name' ? el.value.trim() : el.value;
    if (el.dataset.charField === 'name' && !v) return; // 名前は空にしない
    c[el.dataset.charField] = v;
    save();
    return;
  }
  if (!el.dataset.partyField) return;
  const party = partyById(currentRoute().id);
  if (!party) return;
  party[el.dataset.partyField] = el.value;
  touch(party);
});

// キャラを名前だけで追加する
document.addEventListener('submit', (e) => {
  if (e.target.dataset.form !== 'add-char') return;
  e.preventDefault();
  const name = e.target.elements.name.value.trim();
  if (!name) return;
  const c = addChar(name);
  render();
  $(`[data-fk="cplan-${CSS.escape(c.id)}-0-fruit"]`)?.focus();
  toast(`${c.name}を追加しました`);
});

// ダイアログの外側（背景）をタップしたら閉じる
$$('dialog').forEach((dlg) => {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeSheet(dlg);
  });
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeSheet(dlg);
  });
});

/* ---------- トースト・オフライン表示 ---------- */

let toastTimer = null;
function toast(text, undo) {
  const t = $('#toast');
  t.textContent = text;
  if (undo) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '元に戻す';
    b.addEventListener('click', () => {
      undo();
      t.classList.remove('show');
    });
    t.append(b);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 5000 : 2400);
}

function updateOnline() {
  $('#offlineBadge').hidden = navigator.onLine;
}
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);

/* ---------- 初期化 ---------- */

function init() {
  $('#raceList').innerHTML = DATA.races.map((r) => `<option value="${esc(r)}"></option>`).join('');
  updateOnline();
  lastRoute = location.hash;
  render();

  // 別タブで変更されたら読み直す
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY) {
      state = loadState();
      render();
    }
  });
}

init();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
