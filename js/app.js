'use strict';

/* =========================================================
   わくわく厳選メモ
   データはブラウザの localStorage に保存し、JSON で書き出し・読み込みできる。
   ========================================================= */

const STORE_KEY = 'wakuwaku-memo:v1';
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
  return { version: 1, settings: { slotCount: 3 }, characters: [], customFruits: [], parties: [] };
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

// 読み込んだデータの欠けを補い、壊れた値を取り除く
function normalize(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return s;
  const slotCount = Number(raw.settings?.slotCount);
  s.settings.slotCount = slotCount === 4 ? 4 : 3;

  s.characters = (Array.isArray(raw.characters) ? raw.characters : [])
    .filter((c) => c && typeof c === 'object' && c.id)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name ?? '').slice(0, 40) || '名前なし',
      race: String(c.race ?? '').slice(0, 20),
      hit: DATA.hits.includes(c.hit) ? c.hit : DATA.hits[0],
      type: DATA.types.includes(c.type) ? c.type : DATA.types[0],
      memo: String(c.memo ?? '').slice(0, 300)
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
  const statusIds = DATA.statuses.map((x) => x.id);
  const gradeOk = (g) => (DATA.grades.includes(g) ? g : '');

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
        const plans = (Array.isArray(m.plans) ? m.plans : []).slice(0, 4).map((pl) => ({
          fruitId: String(pl?.fruitId ?? ''),
          target: gradeOk(pl?.target),
          current: gradeOk(pl?.current),
          status: statusIds.includes(pl?.status) ? pl.status : 'todo'
        }));
        return { charId: charIds.has(m.charId) ? m.charId : null, plans };
      });
      return party;
    });
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
const statusLabel = (id) => DATA.statuses.find((s) => s.id === id)?.label || id;

function attrOf(c, scope) {
  if (!c) return '';
  if (scope === 'race') return c.race;
  if (scope === 'hit') return c.hit;
  if (scope === 'type') return normType(c.type);
  return '';
}

function plansOf(member) {
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

/* ---------- 表示部品 ---------- */

function chips(c) {
  if (!c) return '';
  const hitCls = c.hit === '反射' ? 'chip-hit-ref' : 'chip-hit-pen';
  return `<span class="chip chip-race">${esc(c.race || '種族未設定')}</span>`
    + `<span class="chip ${hitCls}">${esc(c.hit)}</span>`
    + `<span class="chip chip-type">${esc(c.type)}</span>`;
}

function options(list, selected, placeholder) {
  const head = placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '';
  return head + list.map((o) => {
    const value = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

function fruitOptions(selected) {
  const groupsDef = [
    ['同族の絆', (f) => f.scope === 'race' && !f.custom],
    ['撃種の絆', (f) => f.scope === 'hit' && !f.custom],
    ['戦型の絆', (f) => f.scope === 'type' && !f.custom],
    ['自分のみに効く実', (f) => f.scope === 'self' && !f.custom],
    ['クエスト全体に効く実', (f) => f.scope === 'quest' && !f.custom],
    ['自分で追加した実', (f) => f.custom]
  ];
  const fruits = allFruits();
  let html = `<option value="">— 狙う実を選ぶ —</option>`;
  for (const [label, test] of groupsDef) {
    const list = fruits.filter(test);
    if (!list.length) continue;
    html += `<optgroup label="${esc(label)}">`
      + list.map((f) => `<option value="${esc(f.id)}"${f.id === selected ? ' selected' : ''}>${esc(f.short)}</option>`).join('')
      + '</optgroup>';
  }
  return html;
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
    .map((c) => ({ value: c.id, label: `${c.name}（${c.race}/${c.hit}/${normType(c.type)}）` }));

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
      const fk = `plan-${i}-${k}`;
      return `
        <div class="plan status-${esc(p.status)}${f ? '' : ' is-empty'}">
          <div class="plan-top">
            <span class="plan-no">${k + 1}</span>
            <select class="plan-fruit" data-plan="fruitId" data-slot="${i}" data-k="${k}" data-fk="${fk}-fruit" aria-label="${i + 1}体目 ${k + 1}つ目の実">${fruitOptions(p.fruitId)}</select>
            ${badge}
          </div>
          ${f ? `
          <div class="plan-grid">
            <label><span>目標</span><select data-plan="target" data-slot="${i}" data-k="${k}" data-fk="${fk}-target">${options(DATA.grades, p.target, '未設定')}</select></label>
            <label><span>今</span><select data-plan="current" data-slot="${i}" data-k="${k}" data-fk="${fk}-current">${options(DATA.grades, p.current, 'なし')}</select></label>
            <label><span>状態</span><select data-plan="status" data-slot="${i}" data-k="${k}" data-fk="${fk}-status">${options(DATA.statuses.map((s) => ({ value: s.id, label: s.label })), p.status)}</select></label>
          </div>` : ''}
          ${notes}
        </div>`;
    }).join('');

    return `
      <article class="card slot">
        <div class="slot-head">
          <span class="slot-no">${i + 1}</span>
          <select class="slot-char" data-slot-char="${i}" data-fk="slot-${i}" aria-label="${i + 1}体目のキャラ">
            ${options(charOptions, m.charId || '', '— キャラを選ぶ —')}
            <option value="__new">＋ 新しいキャラを登録</option>
          </select>
          ${c ? `<button class="icon-btn" data-action="edit-char" data-id="${esc(c.id)}" aria-label="${esc(c.name)}を編集">✎</button>` : ''}
        </div>
        ${c ? `<div class="chips">${chips(c)}</div>${c.memo ? `<p class="char-memo">${esc(c.memo)}</p>` : ''}` : ''}
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
  for (const party of state.parties) {
    party.members.forEach((m, i) => {
      const c = charById(m.charId);
      if (!c) return;
      plansOf(m).forEach((p, k) => {
        if (!p.fruitId) return;
        if (todoFilter === 'open' && p.status === 'done') return;
        const f = fruitById(p.fruitId);
        if (!f) return;
        if (!byChar.has(c.id)) byChar.set(c.id, { c, rows: [] });
        byChar.get(c.id).rows.push({ party, i, k, p, f });
      });
    });
  }

  const order = { doing: 0, todo: 1, compromise: 2, done: 3 };
  const groups = [...byChar.values()].sort((x, y) => {
    const dx = x.rows.some((r) => r.p.status === 'doing') ? 0 : 1;
    const dy = y.rows.some((r) => r.p.status === 'doing') ? 0 : 1;
    return dx - dy || x.c.name.localeCompare(y.c.name, 'ja');
  });

  const body = groups.map(({ c, rows }) => {
    rows.sort((x, y) => order[x.p.status] - order[y.p.status]);
    return `
      <article class="card todo-card">
        <div class="todo-head">
          <h3>${esc(c.name)}</h3>
          <div class="chips">${chips(c)}</div>
        </div>
        <ul class="todo-list">
          ${rows.map((r) => `
            <li class="todo-row status-${esc(r.p.status)}">
              <div class="todo-main">
                <b>${esc(r.f.short)}</b>
                <span class="grade">${esc(r.p.current || 'なし')} → ${esc(r.p.target || '未設定')}</span>
              </div>
              <div class="todo-sub">
                <a href="#/party/${esc(r.party.id)}">${esc(r.party.name)}</a>
                <select data-todo="${esc(r.party.id)}" data-slot="${r.i}" data-k="${r.k}" aria-label="状態">
                  ${options(DATA.statuses.map((s) => ({ value: s.id, label: s.label })), r.p.status)}
                </select>
              </div>
            </li>`).join('')}
        </ul>
      </article>`;
  }).join('');

  return `
    <section>
      <div class="section-head">
        <h2>やること</h2>
        <div class="seg" role="group" aria-label="表示する範囲">
          <button class="${todoFilter === 'open' ? 'on' : ''}" data-action="todo-filter" data-value="open">未完了</button>
          <button class="${todoFilter === 'all' ? 'on' : ''}" data-action="todo-filter" data-value="all">すべて</button>
        </div>
      </div>
      <p class="muted lead">英雄の神殿でリーダーにするキャラごとに、狙っている実をまとめています。</p>
      ${groups.length ? `<div class="stack">${body}</div>` : emptyBox(
        todoFilter === 'open' ? '未完了の厳選はありません。' : 'まだ狙う実が登録されていません。',
        '<a class="btn" href="#/parties">パーティを開く</a>'
      )}
    </section>`;
}

/* ---------- 画面：キャラ ---------- */

function viewChars() {
  const usage = (id) => state.parties.filter((p) => p.members.some((m) => m.charId === id)).length;
  const list = [...state.characters].sort((x, y) => x.name.localeCompare(y.name, 'ja'));
  const items = list.map((c) => `
    <article class="card char-card">
      <div class="char-card-head">
        <h3>${esc(c.name)}</h3>
        <div class="char-actions">
          <button class="icon-btn" data-action="edit-char" data-id="${esc(c.id)}" aria-label="${esc(c.name)}を編集">✎</button>
          <button class="icon-btn danger" data-action="delete-char" data-id="${esc(c.id)}" aria-label="${esc(c.name)}を削除">×</button>
        </div>
      </div>
      <div class="chips">${chips(c)}</div>
      ${c.memo ? `<p class="char-memo">${esc(c.memo)}</p>` : ''}
      <p class="party-meta">${usage(c.id)} 個のパーティで使用中</p>
    </article>`).join('');

  return `
    <section>
      <div class="section-head">
        <h2>キャラ</h2>
        <button class="btn primary" data-action="new-char">＋ 登録</button>
      </div>
      ${list.length ? `<div class="grid">${items}</div>` : emptyBox(
        'キャラ名と種族・撃種・戦型を登録すると、どのパーティでも使い回せます。',
        '<button class="btn primary" data-action="new-char">キャラを登録する</button>'
      )}
    </section>`;
}

/* ---------- 画面：実の一覧 ---------- */

function viewFruits() {
  const section = (scope) => {
    const list = DATA.fruits.filter((f) => f.scope === scope);
    return `
      <div class="card">
        <h3 class="card-title">${DATA.scopes[scope]}<small>${esc(DATA.scopeHelp[scope])}</small></h3>
        <ul class="fruit-list">
          ${list.map((f) => `<li><b>${esc(f.name)}</b><span>${esc(f.desc)}</span></li>`).join('')}
        </ul>
      </div>`;
  };
  const custom = state.customFruits.map((f) => `
    <li>
      <b>${esc(f.name)}</b>
      <span>${esc(DATA.scopes[f.scope])}${f.desc ? `・${esc(f.desc)}` : ''}</span>
      <span class="fruit-actions">
        <button class="icon-btn" data-action="edit-fruit" data-id="${esc(f.id)}" aria-label="${esc(f.name)}を編集">✎</button>
        <button class="icon-btn danger" data-action="delete-fruit" data-id="${esc(f.id)}" aria-label="${esc(f.name)}を削除">×</button>
      </span>
    </li>`).join('');

  return `
    <section>
      <h2>実の一覧</h2>
      <div class="card rules">
        <h3 class="card-title">重なり方のルール</h3>
        <p>加撃・加撃速・加命撃のように<strong>名前が違う実は効果が重なります</strong>。同族加撃・撃種加撃・戦型加撃を別々のキャラに分けてつければ、条件のそろった味方には全部乗ります。</p>
        <p>同じ名前の絆の実を、同じ種族（撃種・戦型）どうしで持っても1つ分しか効きません。クエスト全体に効く実も、パーティで1つ分です。同じキャラに同じ実を2つつけた場合も1つ分で、一撃失心の力だけが例外です。</p>
        <p class="muted">超戦型は通常の戦型と同じ扱いです（例：パワー型と超パワー型は同戦型）。</p>
      </div>
      ${section('race')}
      ${section('hit')}
      ${section('type')}
      ${section('self')}
      ${section('quest')}
      <div class="card">
        <div class="section-head tight">
          <h3 class="card-title">自分で追加した実</h3>
          <button class="btn" data-action="new-fruit">＋ 追加</button>
        </div>
        ${custom ? `<ul class="fruit-list">${custom}</ul>` : '<p class="muted">新しい実が実装されたときは、ここに追加すると選択肢に出ます。</p>'}
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
        <h3 class="card-title">実の枠の数</h3>
        <div class="seg" role="group" aria-label="実の枠の数">
          <button class="${state.settings.slotCount === 3 ? 'on' : ''}" data-action="slot-count" data-value="3">3つ</button>
          <button class="${state.settings.slotCount === 4 ? 'on' : ''}" data-action="slot-count" data-value="4">4つ</button>
        </div>
        <p class="muted">4つ目の枠を使うキャラがいる場合は「4つ」にします。3つに戻しても4つ目のメモは消えません。</p>
      </div>
      <div class="card">
        <h3 class="card-title">書き出し・読み込み</h3>
        <p>メモはこの端末のブラウザに自動で保存されています。機種変更やバックアップのときは、ファイルに書き出してから別の端末で読み込んでください。</p>
        <div class="row-actions">
          <button class="btn primary" data-action="export">ファイルに書き出す</button>
          <button class="btn" data-action="import">ファイルから読み込む</button>
        </div>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
        <p class="muted">キャラ ${state.characters.length} 体・パーティ ${state.parties.length} 個・使用量 約 ${Math.ceil(used / 1024)} KB</p>
      </div>
      <div class="card">
        <h3 class="card-title">全部消す</h3>
        <p>この端末に保存したキャラ・パーティ・追加した実をすべて消します。元に戻せないので、先に書き出しておくと安心です。</p>
        <button class="btn danger" data-action="reset">すべてのデータを消す</button>
      </div>
      <p class="muted small">ブラウザのサイトデータを消すとメモも消えます。ホーム画面に追加すると、電波がなくても開けます。</p>
    </section>`;
}

/* ---------- ルーティング ---------- */

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, id] = hash.split('/');
  return { name: name || 'parties', id: id ? decodeURIComponent(id) : '' };
}

function render() {
  const { name, id } = currentRoute();
  const active = document.activeElement?.dataset?.fk;
  const views = {
    parties: viewParties,
    party: () => viewParty(id),
    todo: viewTodo,
    chars: viewChars,
    fruits: viewFruits,
    data: viewData
  };
  const app = $('#app');
  app.innerHTML = (views[name] || viewParties)();

  const tab = name === 'party' ? 'parties' : name;
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

let charSaved = null;

function openCharDialog(c, onSaved) {
  const dlg = $('#charDialog');
  const form = $('#charForm');
  form.reset();
  $('#charDialogTitle').textContent = c ? 'キャラを編集' : 'キャラを登録';
  form.elements.id.value = c?.id || '';
  form.elements.name.value = c?.name || '';
  form.elements.race.value = c?.race || '';
  form.elements.hit.value = c?.hit || DATA.hits[0];
  form.elements.type.value = c?.type || DATA.types[0];
  form.elements.memo.value = c?.memo || '';
  charSaved = onSaved || null;
  dlg.showModal();
  setTimeout(() => form.elements.name.focus(), 50);
}

$('#charForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const data = {
    name: f.name.value.trim(),
    race: f.race.value.trim(),
    hit: f.hit.value,
    type: f.type.value,
    memo: f.memo.value.trim()
  };
  if (!data.name || !data.race) return;
  let c = charById(f.id.value);
  if (c) {
    Object.assign(c, data);
  } else {
    c = { id: uid(), ...data };
    state.characters.push(c);
  }
  save();
  $('#charDialog').close();
  if (charSaved) charSaved(c);
  charSaved = null;
  render();
  toast(`${c.name}を保存しました`);
});

function openFruitDialog(fr) {
  const form = $('#fruitForm');
  form.reset();
  $('#fruitDialogTitle').textContent = fr ? '実を編集' : '実を追加';
  form.elements.id.value = fr?.id || '';
  form.elements.name.value = fr?.name || '';
  form.elements.scope.value = fr?.scope || 'self';
  form.elements.attack.checked = !!fr?.attack;
  form.elements.desc.value = fr?.desc || '';
  $('#fruitDialog').showModal();
  setTimeout(() => form.elements.name.focus(), 50);
}

$('#fruitForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const name = f.name.value.trim();
  if (!name) return;
  const data = { name, short: name, scope: f.scope.value, attack: f.attack.checked, desc: f.desc.value.trim(), custom: true };
  const existing = state.customFruits.find((x) => x.id === f.id.value);
  if (existing) Object.assign(existing, data);
  else state.customFruits.push({ id: `custom-${uid()}`, ...data });
  save();
  $('#fruitDialog').close();
  render();
});

/* ---------- 操作 ---------- */

function setPlan(party, i, k, key, value) {
  const member = party.members[i];
  plansOf(member);
  const p = member.plans[k];
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
  touch(party);
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
  'new-char'() {
    openCharDialog(null);
  },
  'edit-char'(el) {
    openCharDialog(charById(el.dataset.id));
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
    render();
  },
  'new-fruit'() {
    openFruitDialog(null);
  },
  'edit-fruit'(el) {
    openFruitDialog(state.customFruits.find((f) => f.id === el.dataset.id));
  },
  'delete-fruit'(el) {
    const fr = state.customFruits.find((f) => f.id === el.dataset.id);
    if (!fr || !confirm(`「${fr.name}」を削除しますか？\nこの実を狙っているメモも空欄に戻ります。`)) return;
    state.customFruits = state.customFruits.filter((f) => f !== fr);
    for (const p of state.parties) {
      for (const m of p.members) {
        m.plans = m.plans.map((pl) => (pl.fruitId === fr.id ? emptyPlan() : pl));
      }
    }
    save();
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
    el.closest('dialog')?.close();
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
      openCharDialog(null, (c) => {
        party.members[i].charId = c.id;
        touch(party);
      });
      return;
    }
    // キャラを入れ替えても実のメモは引き継ぐ。枠を空にしたときだけ消す
    party.members[i].charId = el.value || null;
    if (!el.value) party.members[i].plans = [];
    touch(party);
    render();
    return;
  }

  if (el.dataset.plan && name === 'party') {
    const party = partyById(id);
    if (!party) return;
    setPlan(party, Number(el.dataset.slot), Number(el.dataset.k), el.dataset.plan, el.value);
    render();
    return;
  }

  if (el.dataset.todo) {
    const party = partyById(el.dataset.todo);
    if (!party) return;
    setPlan(party, Number(el.dataset.slot), Number(el.dataset.k), 'status', el.value);
    render();
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset.partyField) return;
  const party = partyById(currentRoute().id);
  if (!party) return;
  party[el.dataset.partyField] = el.value;
  touch(party);
});

// ダイアログの外側（背景）をタップしたら閉じる
$$('dialog').forEach((dlg) => {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
});

/* ---------- トースト・オフライン表示 ---------- */

let toastTimer = null;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function updateOnline() {
  $('#offlineBadge').hidden = navigator.onLine;
}
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);

/* ---------- 初期化 ---------- */

function init() {
  const form = $('#charForm');
  form.elements.hit.innerHTML = options(DATA.hits, DATA.hits[0]);
  form.elements.type.innerHTML = options(DATA.types, DATA.types[0]);
  $('#raceList').innerHTML = DATA.races.map((r) => `<option value="${esc(r)}"></option>`).join('');
  $('#fruitForm').elements.scope.innerHTML = options(
    Object.entries(DATA.scopes).map(([value, label]) => ({ value, label })), 'self'
  );
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
