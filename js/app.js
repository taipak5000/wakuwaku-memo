// わくわく厳選メモ — 画面の表示と保存
(() => {
  'use strict';

  const D = window.WAKU_DATA;
  const STORE_KEY = 'wakuwaku_memo_v1';
  const THEME_KEY = 'wakuwaku_theme';
  const app = document.getElementById('app');

  // ───────── 保存 ─────────
  const emptyState = () => ({ version: 1, chars: [], parties: [], customFruits: [], bank: [] });

  function normalize(raw) {
    const s = Object.assign(emptyState(), raw && typeof raw === 'object' ? raw : {});
    ['chars', 'parties', 'customFruits', 'bank'].forEach((k) => { if (!Array.isArray(s[k])) s[k] = []; });
    s.parties.forEach((p) => {
      if (!Array.isArray(p.members)) p.members = [];
      while (p.members.length < D.partySize) p.members.push({ charId: '', slots: [] });
      p.members = p.members.slice(0, D.partySize).map((m) => ({
        charId: (m && m.charId) || '',
        slots: Array.isArray(m && m.slots) ? m.slots.slice(0, D.slotsPerChar).map((x) => ({
          fruit: x.fruit || '', target: x.target || '', current: x.current || '', status: D.statuses.includes(x.status) ? x.status : '未着手'
        })) : []
      }));
    });
    s.bank = s.bank.filter((b) => b && b.fruit).map((b) => ({
      id: b.id || uid(), fruit: String(b.fruit), grade: b.grade || D.grades[0],
      count: Math.max(1, Math.min(99, parseInt(b.count, 10) || 1)), memo: b.memo || ''
    }));
    return s;
  }

  function load() {
    try { return normalize(JSON.parse(localStorage.getItem(STORE_KEY))); }
    catch (e) { return emptyState(); }
  }
  let state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('保存できませんでした（ブラウザの保存領域を確認してください）'); }
  }

  // ───────── 小物 ─────────
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rank = (g) => D.grades.indexOf(g); // 未設定は -1
  const normType = (t) => String(t || '').replace(/^超/, '');
  const charById = (id) => state.chars.find((c) => c.id === id);
  const charName = (id) => (charById(id) || {}).name || '（未登録のキャラ）';

  // ───────── 実の一覧 ─────────
  function builtinFruits() {
    const list = [];
    D.bonds.forEach((b) => D.bondKinds.forEach((k) => list.push({
      name: `${b.prefix}・${k.suffix}`, scope: b.scope, attack: k.attack, desc: k.desc, group: b.prefix
    })));
    D.others.forEach((o) => list.push(Object.assign({ group: 'その他' }, o)));
    return list;
  }
  function allFruits() {
    return builtinFruits().concat(state.customFruits.map((f) => Object.assign({ group: '自分で追加', custom: true }, f)));
  }
  const fruitByName = (name) => allFruits().find((f) => f.name === name);

  function fruitOptions(selected, withBlank) {
    const groups = {};
    allFruits().forEach((f) => { (groups[f.group] = groups[f.group] || []).push(f); });
    let html = withBlank ? `<option value="">実を選ぶ</option>` : '';
    Object.keys(groups).forEach((g) => {
      html += `<optgroup label="${esc(g)}">` + groups[g].map((f) =>
        `<option value="${esc(f.name)}"${f.name === selected ? ' selected' : ''}>${esc(f.name)}</option>`).join('') + '</optgroup>';
    });
    if (selected && !fruitByName(selected)) html += `<option value="${esc(selected)}" selected>${esc(selected)}（一覧に無い実）</option>`;
    return html;
  }
  const gradeOptions = (selected, blankLabel) =>
    (blankLabel ? `<option value="">${esc(blankLabel)}</option>` : '') +
    D.grades.map((g) => `<option${g === selected ? ' selected' : ''}>${esc(g)}</option>`).join('');
  const statusOptions = (selected) => D.statuses.map((s) => `<option${s === selected ? ' selected' : ''}>${s}</option>`).join('');

  // ───────── 判定：パーティ内の実の重なり ─────────
  const attrOf = (c, scope) => scope === 'race' ? c.race : scope === 'hit' ? c.hit : scope === 'type' ? normType(c.type) : null;
  const scopeWord = { race: '種族', hit: '撃種', type: '戦型' };

  function analyze(party) {
    const notes = [];
    const members = party.members.map((m, i) => ({ m, i, c: charById(m.charId) })).filter((x) => x.c);
    const bondHolders = {}; // 実の名前 → [{c, attr}]
    const partyOnly = {};

    members.forEach(({ m, c }) => {
      const seen = {};
      m.slots.forEach((s) => {
        if (!s.fruit) return;
        const f = fruitByName(s.fruit);
        if (seen[s.fruit] && !(f && f.stackable)) {
          notes.push({ level: 'danger', html: `<b>${esc(c.name)}</b> に <b>${esc(s.fruit)}</b> が2つあります。同じ実は同じキャラに重ねても効きません。` });
        }
        seen[s.fruit] = true;
        if (!f) return;
        if (f.scope === 'race' || f.scope === 'hit' || f.scope === 'type') {
          const a = attrOf(c, f.scope);
          const reach = members.filter((x) => attrOf(x.c, f.scope) === a);
          (bondHolders[s.fruit] = bondHolders[s.fruit] || []).push({ c, attr: a });
          const names = reach.map((x) => esc(x.c.name)).join('・');
          notes.push({
            level: reach.length <= 1 ? 'warn' : 'info',
            html: `<b>${esc(c.name)}</b> の ${esc(s.fruit)} → ${scopeWord[f.scope]}「${esc(a)}」の <b>${reach.length}体</b>に届く（${names}）` +
              (reach.length <= 1 ? '。同じ' + scopeWord[f.scope] + 'の仲間がいないので、自分にしか効きません。' : '')
          });
        }
        if (f.scope === 'party') (partyOnly[s.fruit] = partyOnly[s.fruit] || []).push(c);
      });
    });

    Object.keys(bondHolders).forEach((name) => {
      const byAttr = {};
      bondHolders[name].forEach((h) => { (byAttr[h.attr] = byAttr[h.attr] || []).push(h.c); });
      Object.keys(byAttr).forEach((a) => {
        if (byAttr[a].length > 1) notes.push({ level: 'danger', html: `${esc(name)} が ${byAttr[a].map((c) => '<b>' + esc(c.name) + '</b>').join('・')} で重なっています。同じ名前の絆の実は1つ分しか効きません。` });
      });
    });
    Object.keys(partyOnly).forEach((name) => {
      if (partyOnly[name].length > 1) notes.push({ level: 'danger', html: `${esc(name)} が ${partyOnly[name].length}体についています。パーティ内で重ならないので、1体分しか効きません。` });
    });
    return notes;
  }

  // ───────── 判定：わくわくバンクから移せば完了になるもの ─────────
  // 実はキャラについているので、同じキャラ×同じ実は複数パーティにまたがっていても1つの「狙い」にまとめる。
  function collectTargets() {
    const map = new Map();
    state.parties.forEach((p) => p.members.forEach((m, mi) => {
      if (!m.charId || !charById(m.charId)) return;
      m.slots.forEach((s, si) => {
        if (!s.fruit) return;
        const key = m.charId + '|' + s.fruit;
        let t = map.get(key);
        if (!t) { t = { key, charId: m.charId, fruit: s.fruit, target: -1, current: -1, parties: [], refs: [], allDone: true }; map.set(key, t); }
        t.target = Math.max(t.target, rank(s.target));
        t.current = Math.max(t.current, rank(s.current));
        if (!t.parties.includes(p.name)) t.parties.push(p.name);
        t.refs.push({ p, mi, si });
        if (s.status !== '完了') t.allDone = false;
      });
    }));
    return [...map.values()].map((t) => Object.assign(t, {
      done: t.allDone || (t.target >= 0 && t.current >= t.target),
      noTarget: t.target < 0
    }));
  }

  function bankMatches() {
    const targets = collectTargets().filter((t) => !t.done);
    const complete = []; // { entry, targets: [...] }
    const upgrade = [];
    state.bank.forEach((entry) => {
      const r = rank(entry.grade);
      const same = targets.filter((t) => t.fruit === entry.fruit);
      const ok = same.filter((t) => !t.noTarget && r >= t.target);
      const up = same.filter((t) => !t.noTarget && r < t.target && r > t.current);
      if (ok.length) complete.push({ entry, targets: ok });
      if (up.length) upgrade.push({ entry, targets: up });
    });
    const noTarget = targets.filter((t) => t.noTarget && state.bank.some((b) => b.fruit === t.fruit));
    return { complete, upgrade, noTarget };
  }

  function moveFromBank(entryId, key) {
    const entry = state.bank.find((b) => b.id === entryId);
    const t = collectTargets().find((x) => x.key === key);
    if (!entry || !t) return;
    const before = JSON.stringify(state);
    const r = rank(entry.grade);
    t.refs.forEach(({ p, mi, si }) => {
      const s = p.members[mi].slots[si];
      s.current = entry.grade;
      s.status = (rank(s.target) >= 0 && r >= rank(s.target)) ? '完了' : '厳選中';
    });
    entry.count -= 1;
    if (entry.count <= 0) state.bank = state.bank.filter((b) => b !== entry);
    save();
    render();
    toast(`${charName(t.charId)} に ${entry.fruit}（${entry.grade}）を移しました`, () => {
      state = normalize(JSON.parse(before)); save(); render();
    });
  }

  // ───────── 画面 ─────────
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [name, id] = h.split('/');
    return { name: name || 'parties', id };
  }

  function render() {
    const r = route();
    const y = window.scrollY;
    const views = { parties: viewParties, party: viewParty, todo: viewTodo, bank: viewBank, chars: viewChars, fruits: viewFruits, data: viewData };
    app.innerHTML = (views[r.name] || viewParties)(r.id);
    const tab = r.name === 'party' ? 'parties' : r.name;
    document.querySelectorAll('.tabbar a').forEach((a) => {
      const on = a.dataset.tab === tab;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (render.lastRoute === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
    render.lastRoute = location.hash;
  }

  function partyProgress(p) {
    let total = 0, done = 0;
    p.members.forEach((m) => m.slots.forEach((s) => { if (s.fruit) { total++; if (s.status === '完了') done++; } }));
    return { total, done };
  }

  function viewParties() {
    const cards = state.parties.map((p) => {
      const { total, done } = partyProgress(p);
      const names = p.members.filter((m) => m.charId).map((m) => esc(charName(m.charId)));
      const warns = analyze(p).filter((n) => n.level === 'danger').length;
      return `<a class="card tap" href="#/party/${esc(p.id)}">
        <div class="card-head"><h3 class="card-title">${esc(p.name)}</h3>
          <div class="chips">${warns ? `<span class="chip danger">重なり ${warns}</span>` : ''}<span class="chip ${total && done === total ? 'ok' : 'accent'}">${done}/${total}</span></div></div>
        <div class="card-sub">${names.length ? names.join('・') : 'キャラ未設定'}</div>
        <div class="progress"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div>
      </a>`;
    }).join('');
    return `<div class="page-head"><h2 class="page-title">パーティ</h2>
        <button class="btn primary" data-action="add-party">＋ パーティ</button></div>
      ${state.chars.length ? '' : `<div class="card"><p class="card-sub" style="margin:0 0 10px">まずは「キャラ」でパーティに入れるキャラを登録してください。</p><a class="btn small" href="#/chars">キャラを登録する</a></div>`}
      ${cards || '<p class="empty">パーティはまだありません。<br>クエストごとに4体の組み合わせを作り、狙う実をメモできます。</p>'}`;
  }

  function viewParty(id) {
    const p = state.parties.find((x) => x.id === id);
    if (!p) return `<a class="back" href="#/parties">‹ パーティ</a><p class="empty">このパーティは見つかりません。</p>`;
    const notes = analyze(p);
    const charOpts = (sel) => `<option value="">キャラを選ぶ</option>` + state.chars.map((c) =>
      `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}（${esc(c.race)}・${esc(c.hit)}・${esc(c.type)}）</option>`).join('');
    const members = p.members.map((m, mi) => {
      const slots = m.slots.map((s, si) => {
        const at = `data-p="${esc(p.id)}" data-m="${mi}" data-s="${si}"`;
        const done = s.status === '完了';
        return `<div class="slot${done ? ' done' : ''}">
          <div class="slot-fruit"><select ${at} data-k="fruit" aria-label="狙う実">${fruitOptions(s.fruit, true)}</select>
            <button class="icon-btn danger" data-action="del-slot" ${at} aria-label="この実を外す">✕</button></div>
          <label><span class="slot-label">目標</span><select ${at} data-k="target">${gradeOptions(s.target, '—')}</select></label>
          <label><span class="slot-label">今</span><select ${at} data-k="current">${gradeOptions(s.current, 'なし')}</select></label>
          <label class="slot-status" style="grid-column: span 2"><span class="slot-label">状態</span><select ${at} data-k="status">${statusOptions(s.status)}</select></label>
        </div>`;
      }).join('');
      return `<div class="card member">
        <div class="member-head"><span class="member-no">${mi + 1}</span>
          <select data-action="set-member" data-p="${esc(p.id)}" data-m="${mi}" aria-label="${mi + 1}体目のキャラ">${charOpts(m.charId)}</select></div>
        ${slots}
        ${m.slots.length < D.slotsPerChar ? `<button class="btn small add-slot" data-action="add-slot" data-p="${esc(p.id)}" data-m="${mi}">＋ 狙う実を追加</button>` : ''}
      </div>`;
    }).join('');
    return `<a class="back" href="#/parties">‹ パーティ</a>
      <div class="page-head" style="flex-wrap:nowrap"><input class="inline-input" data-action="rename-party" data-p="${esc(p.id)}" value="${esc(p.name)}" maxlength="40" aria-label="パーティ名">
        <button class="icon-btn danger" data-action="del-party" data-p="${esc(p.id)}" aria-label="パーティを削除">🗑</button></div>
      ${notes.length ? `<div class="card"><ul class="notes">${notes.map((n) => `<li class="note ${n.level}">${n.html}</li>`).join('')}</ul></div>` : ''}
      ${state.chars.length ? '' : '<p class="lead">キャラが未登録です。「キャラ」タブで先に登録してください。</p>'}
      ${members}`;
  }

  function viewTodo() {
    const targets = collectTargets().filter((t) => !t.done);
    const inBank = (t) => state.bank.some((b) => b.fruit === t.fruit && rank(b.grade) >= t.target && t.target >= 0);
    const byChar = {};
    targets.forEach((t) => { (byChar[t.charId] = byChar[t.charId] || []).push(t); });
    const cards = Object.keys(byChar).map((cid) => {
      const c = charById(cid);
      const rows = byChar[cid].map((t) => `<div class="list-row" style="padding:10px 0">
          <div class="grow"><div class="name">${esc(t.fruit)}</div>
          <div class="meta">今 ${t.current >= 0 ? esc(D.grades[t.current]) : 'なし'} → 目標 ${t.target >= 0 ? esc(D.grades[t.target]) : '未設定'}・${t.parties.map(esc).join('、')}</div></div>
          ${inBank(t) ? '<a class="chip ok" href="#/bank">バンクにあり</a>' : ''}
        </div>`).join('');
      return `<div class="card"><div class="card-head"><h3 class="card-title">${esc(c.name)}</h3><span class="chip accent">${byChar[cid].length}件</span></div>
        <div class="card-sub">${esc(c.race)}・${esc(c.hit)}・${esc(c.type)}</div>${rows}</div>`;
    }).join('');
    return `<div class="page-head"><h2 class="page-title">やること</h2></div>
      <p class="lead">英雄の神殿でリーダーにするキャラごとに、まだ終わっていない実をまとめています。</p>
      ${cards || '<p class="empty">終わっていない実はありません。</p>'}`;
  }

  function viewBank() {
    const { complete, upgrade, noTarget } = bankMatches();
    const total = state.bank.reduce((a, b) => a + b.count, 0);
    const completeKeys = new Set(complete.flatMap((x) => x.targets.map((t) => t.key)));

    const targetRow = (entry, t, isComplete) => {
      const c = charById(t.charId);
      return `<div class="hit-target"><div class="grow">
          <div class="name">${esc(c.name)}</div>
          <div class="meta">今 ${t.current >= 0 ? esc(D.grades[t.current]) : 'なし'} → 目標 ${esc(D.grades[t.target])}・${t.parties.map(esc).join('、')}</div></div>
          <button class="btn small ${isComplete ? 'ok' : ''}" data-action="move" data-b="${esc(entry.id)}" data-key="${esc(t.key)}">移した</button>
        </div>`;
    };
    const entryCard = ({ entry, targets }, isComplete) => `<div class="card hit-card${isComplete ? ' complete' : ''}">
        <div class="hit-main"><span class="name" style="font-weight:800">${esc(entry.fruit)}</span>
          <span class="chip accent">${esc(entry.grade)}</span><span class="chip">×${entry.count}</span>
          ${targets.length > entry.count ? `<span class="chip warn">候補${targets.length}体に対して${entry.count}個</span>` : ''}</div>
        ${targets.map((t) => targetRow(entry, t, isComplete)).join('')}
      </div>`;

    const upgradeOnly = upgrade.map((x) => ({ entry: x.entry, targets: x.targets.filter((t) => !completeKeys.has(t.key)) })).filter((x) => x.targets.length);

    const list = state.bank.map((b) => `<div class="list-row">
        <div class="grow"><div class="name">${esc(b.fruit)}</div>
          <div class="meta">${esc(b.grade)}・${b.count}個${b.memo ? '・' + esc(b.memo) : ''}</div></div>
        <button class="icon-btn" data-action="edit-bank" data-b="${esc(b.id)}" aria-label="編集">✎</button>
        <button class="icon-btn danger" data-action="del-bank" data-b="${esc(b.id)}" aria-label="削除">✕</button>
      </div>`).join('');

    return `<div class="page-head"><h2 class="page-title">わくわくバンク</h2>
        <button class="btn primary" data-action="add-bank">＋ 実を登録</button></div>
      <p class="lead">バンクに入れている実を登録すると、パーティの狙いと照らし合わせて「移せば厳選が終わるキャラ」を探します。</p>
      <div class="stat-row">
        <div class="stat"><div class="label">バンクの実</div><div class="big-num">${total}</div></div>
        <div class="stat"><div class="label">移せば完了</div><div class="big-num" style="color:var(--ok)">${completeKeys.size}</div></div>
        <div class="stat"><div class="label">等級アップ</div><div class="big-num">${upgradeOnly.reduce((a, x) => a + x.targets.length, 0)}</div></div>
      </div>

      <h3 class="section-title">移せば厳選完了</h3>
      ${complete.length ? complete.map((x) => entryCard(x, true)).join('') : `<p class="empty">${state.bank.length ? '今のバンクの中に、移せば目標に届く実はありません。' : 'バンクの実を登録すると、ここに候補が出ます。'}</p>`}

      ${upgradeOnly.length ? `<h3 class="section-title">目標には届かないが、今より等級が上がる</h3>${upgradeOnly.map((x) => entryCard(x, false)).join('')}` : ''}

      ${noTarget.length ? `<p class="lead" style="margin-top:12px">目標の等級が未設定のため判定できない枠：${noTarget.map((t) => esc(charName(t.charId)) + 'の' + esc(t.fruit)).join('、')}</p>` : ''}

      <h3 class="section-title">バンクに入っている実</h3>
      ${list ? `<div class="list">${list}</div>` : '<p class="empty">まだ登録されていません。</p>'}`;
  }

  function viewChars() {
    const rows = state.chars.map((c) => {
      const used = state.parties.filter((p) => p.members.some((m) => m.charId === c.id)).length;
      return `<div class="list-row"><div class="grow">
          <div class="name">${esc(c.name)}</div>
          <div class="meta">${esc(c.race)}・${esc(c.hit)}・${esc(c.type)}${used ? `・${used}パーティ` : ''}${c.memo ? '<br>' + esc(c.memo) : ''}</div></div>
        <button class="icon-btn" data-action="edit-char" data-c="${esc(c.id)}" aria-label="編集">✎</button>
        <button class="icon-btn danger" data-action="del-char" data-c="${esc(c.id)}" aria-label="削除">✕</button></div>`;
    }).join('');
    return `<div class="page-head"><h2 class="page-title">キャラ</h2>
        <button class="btn primary" data-action="add-char">＋ キャラ</button></div>
      ${rows ? `<div class="list">${rows}</div>` : '<p class="empty">キャラはまだ登録されていません。<br>一度登録すれば、どのパーティでも使い回せます。</p>'}`;
  }

  function viewFruits() {
    const groups = {};
    builtinFruits().forEach((f) => { (groups[f.group] = groups[f.group] || []).push(f); });
    const scopeShort = { self: '自身', race: '同族', hit: '撃種', type: '戦型', party: 'パーティで1つ' };
    const row = (f, custom) => `<div class="list-row"><div class="grow">
        <div class="name">${esc(f.name)}</div>
        <div class="meta">${esc(f.desc || '')}</div></div>
        <div class="chips"><span class="chip">${scopeShort[f.scope] || ''}</span>${f.attack ? '<span class="chip accent">加撃系</span>' : ''}</div>
        ${custom ? `<button class="icon-btn" data-action="edit-fruit" data-f="${esc(f.id)}" aria-label="編集">✎</button>
          <button class="icon-btn danger" data-action="del-fruit" data-f="${esc(f.id)}" aria-label="削除">✕</button>` : ''}</div>`;
    return `<div class="page-head"><h2 class="page-title">実の一覧</h2>
        <button class="btn primary" data-action="add-fruit">＋ 実を追加</button></div>
      <h3 class="section-title">自分で追加した実</h3>
      ${state.customFruits.length ? `<div class="list">${state.customFruits.map((f) => row(f, true)).join('')}</div>` : '<p class="empty" style="padding:12px">新しい実がゲームに増えたら、ここから追加できます。</p>'}
      ${Object.keys(groups).map((g) => `<h3 class="section-title">${esc(g)}</h3><div class="list">${groups[g].map((f) => row(f)).join('')}</div>`).join('')}`;
  }

  function viewData() {
    let theme = '';
    try { theme = localStorage.getItem(THEME_KEY) || ''; } catch (e) { /* noop */ }
    const seg = [['', '端末に合わせる'], ['light', 'ライト'], ['dark', 'ダーク']].map(([v, l]) =>
      `<button data-action="theme" data-v="${v}" class="${theme === v ? 'active' : ''}">${l}</button>`).join('');
    return `<div class="page-head"><h2 class="page-title">データ</h2></div>
      <h3 class="section-title">表示</h3>
      <div class="seg" role="group" aria-label="テーマ">${seg}</div>
      <h3 class="section-title">バックアップ</h3>
      <div class="card">
        <p class="card-sub" style="margin:0 0 12px">メモはこの端末のブラウザにだけ保存されています。機種変更の前に書き出しておくと、新しい端末で読み込めます。</p>
        <div class="btn-row">
          <button class="btn primary" data-action="export">JSONを書き出す</button>
          <label class="btn">JSONを読み込む<input type="file" accept="application/json,.json" data-action="import" hidden></label>
        </div>
      </div>
      <div class="card">
        <p class="card-sub" style="margin:0 0 12px">キャラ ${state.chars.length}体・パーティ ${state.parties.length}個・バンクの実 ${state.bank.length}種類・自分で追加した実 ${state.customFruits.length}個</p>
        <button class="btn danger" data-action="reset">すべて消す</button>
      </div>`;
  }

  // ───────── ボトムシート ─────────
  function openSheet(dlg) { dlg.classList.remove('closing'); dlg.showModal(); }
  function closeSheet(dlg) {
    if (!dlg.open || dlg.classList.contains('closing')) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { dlg.close(); return; }
    dlg.classList.add('closing');
    dlg.addEventListener('animationend', function done(e) {
      if (e.target !== dlg) return;
      dlg.removeEventListener('animationend', done);
      dlg.classList.remove('closing');
      dlg.close();
    });
  }
  document.querySelectorAll('dialog.sheet').forEach((dlg) => {
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(dlg); });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) closeSheet(dlg); // 背景（::backdrop）のタップで閉じる
      if (e.target.closest('[data-action="close-dialog"]')) closeSheet(dlg);
    });
  });

  // キャラ
  const charDialog = document.getElementById('charDialog');
  const charForm = document.getElementById('charForm');
  charForm.hit.innerHTML = D.hits.map((h) => `<option>${h}</option>`).join('');
  charForm.type.innerHTML = D.types.map((t) => `<option>${t}</option>`).join('');
  function refreshRaceList() {
    const races = [...new Set(D.races.concat(state.chars.map((c) => c.race)))];
    document.getElementById('raceList').innerHTML = races.map((r) => `<option value="${esc(r)}">`).join('');
  }
  function openChar(c) {
    refreshRaceList();
    document.getElementById('charDialogTitle').textContent = c ? 'キャラを編集' : 'キャラを登録';
    charForm.reset();
    charForm.id.value = c ? c.id : '';
    if (c) { charForm.name.value = c.name; charForm.race.value = c.race; charForm.hit.value = c.hit; charForm.type.value = c.type; charForm.memo.value = c.memo || ''; }
    openSheet(charDialog);
  }
  charForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = { name: charForm.name.value.trim(), race: charForm.race.value.trim(), hit: charForm.hit.value, type: charForm.type.value, memo: charForm.memo.value.trim() };
    if (!v.name || !v.race) return;
    const c = state.chars.find((x) => x.id === charForm.id.value);
    if (c) Object.assign(c, v); else state.chars.push(Object.assign({ id: uid() }, v));
    save(); render(); closeSheet(charDialog);
  });

  // 自分で追加する実
  const fruitDialog = document.getElementById('fruitDialog');
  const fruitForm = document.getElementById('fruitForm');
  fruitForm.scope.innerHTML = Object.entries(D.scopes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  function openFruit(f) {
    document.getElementById('fruitDialogTitle').textContent = f ? '実を編集' : '実を追加';
    fruitForm.reset();
    fruitForm.id.value = f ? f.id : '';
    if (f) { fruitForm.name.value = f.name; fruitForm.scope.value = f.scope; fruitForm.attack.checked = !!f.attack; fruitForm.desc.value = f.desc || ''; }
    openSheet(fruitDialog);
  }
  fruitForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = { name: fruitForm.name.value.trim(), scope: fruitForm.scope.value, attack: fruitForm.attack.checked, desc: fruitForm.desc.value.trim() };
    if (!v.name) return;
    const f = state.customFruits.find((x) => x.id === fruitForm.id.value);
    const clash = allFruits().find((x) => x.name === v.name && (!f || x.id !== f.id));
    if (clash) { toast('同じ名前の実がすでにあります'); return; }
    if (f) renameFruitEverywhere(f.name, v.name);
    if (f) Object.assign(f, v); else state.customFruits.push(Object.assign({ id: uid() }, v));
    save(); render(); closeSheet(fruitDialog);
  });
  function renameFruitEverywhere(from, to) {
    if (from === to) return;
    state.parties.forEach((p) => p.members.forEach((m) => m.slots.forEach((s) => { if (s.fruit === from) s.fruit = to; })));
    state.bank.forEach((b) => { if (b.fruit === from) b.fruit = to; });
  }

  // バンク
  const bankDialog = document.getElementById('bankDialog');
  const bankForm = document.getElementById('bankForm');
  function openBank(b) {
    document.getElementById('bankDialogTitle').textContent = b ? 'バンクの実を編集' : 'バンクに実を登録';
    bankForm.reset();
    bankForm.fruit.innerHTML = fruitOptions(b ? b.fruit : '', false);
    bankForm.grade.innerHTML = gradeOptions(b ? b.grade : D.grades[3]);
    bankForm.id.value = b ? b.id : '';
    bankForm.count.value = b ? b.count : 1;
    bankForm.memo.value = b ? b.memo : '';
    openSheet(bankDialog);
  }
  bankForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = {
      fruit: bankForm.fruit.value, grade: bankForm.grade.value,
      count: Math.max(1, Math.min(99, parseInt(bankForm.count.value, 10) || 1)), memo: bankForm.memo.value.trim()
    };
    if (!v.fruit) return;
    const b = state.bank.find((x) => x.id === bankForm.id.value);
    if (b) Object.assign(b, v);
    else {
      const same = state.bank.find((x) => x.fruit === v.fruit && x.grade === v.grade && x.memo === v.memo);
      if (same) same.count = Math.min(99, same.count + v.count); else state.bank.push(Object.assign({ id: uid() }, v));
    }
    save(); render(); closeSheet(bankDialog);
    const n = bankMatches().complete.filter((x) => x.entry.fruit === v.fruit && x.entry.grade === v.grade).reduce((a, x) => a + x.targets.length, 0);
    if (n) toast(`移せば完了になるキャラが ${n}体 見つかりました`);
  });

  // ───────── 操作 ─────────
  const findParty = (id) => state.parties.find((p) => p.id === id);

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const a = el.dataset.action;
    const p = el.dataset.p ? findParty(el.dataset.p) : null;
    switch (a) {
      case 'add-party': {
        const np = { id: uid(), name: `パーティ${state.parties.length + 1}`, members: [] };
        state.parties.push(np); state = normalize(state); save();
        location.hash = '#/party/' + np.id;
        break;
      }
      case 'del-party':
        if (p && confirm(`「${p.name}」を削除しますか？`)) {
          state.parties = state.parties.filter((x) => x !== p); save(); location.hash = '#/parties';
        }
        break;
      case 'add-slot':
        if (p) { const m = p.members[+el.dataset.m]; if (m.slots.length < D.slotsPerChar) m.slots.push({ fruit: '', target: '', current: '', status: '未着手' }); save(); render(); }
        break;
      case 'del-slot':
        if (p) { p.members[+el.dataset.m].slots.splice(+el.dataset.s, 1); save(); render(); }
        break;
      case 'add-char': openChar(null); break;
      case 'edit-char': openChar(charById(el.dataset.c)); break;
      case 'del-char': {
        const c = charById(el.dataset.c);
        if (c && confirm(`「${c.name}」を削除しますか？\nパーティのこのキャラの枠も空になります。`)) {
          state.chars = state.chars.filter((x) => x !== c);
          state.parties.forEach((pp) => pp.members.forEach((m) => { if (m.charId === c.id) { m.charId = ''; m.slots = []; } }));
          save(); render();
        }
        break;
      }
      case 'add-fruit': openFruit(null); break;
      case 'edit-fruit': openFruit(state.customFruits.find((f) => f.id === el.dataset.f)); break;
      case 'del-fruit': {
        const f = state.customFruits.find((x) => x.id === el.dataset.f);
        if (f && confirm(`「${f.name}」を一覧から消しますか？\nパーティやバンクのメモは残ります。`)) { state.customFruits = state.customFruits.filter((x) => x !== f); save(); render(); }
        break;
      }
      case 'add-bank': openBank(null); break;
      case 'edit-bank': openBank(state.bank.find((b) => b.id === el.dataset.b)); break;
      case 'del-bank': {
        const b = state.bank.find((x) => x.id === el.dataset.b);
        if (b) {
          const before = JSON.stringify(state);
          state.bank = state.bank.filter((x) => x !== b); save(); render();
          toast(`${b.fruit}（${b.grade}）を消しました`, () => { state = normalize(JSON.parse(before)); save(); render(); });
        }
        break;
      }
      case 'move': moveFromBank(el.dataset.b, el.dataset.key); break;
      case 'theme': {
        const v = el.dataset.v;
        try { if (v) localStorage.setItem(THEME_KEY, v); else localStorage.removeItem(THEME_KEY); } catch (err) { /* noop */ }
        if (v) document.documentElement.setAttribute('data-theme', v); else document.documentElement.removeAttribute('data-theme');
        render();
        break;
      }
      case 'export': exportJSON(); break;
      case 'reset':
        if (confirm('キャラ・パーティ・バンクなど、すべてのメモを消します。元に戻せません。よろしいですか？')) { state = emptyState(); save(); render(); toast('すべて消しました'); }
        break;
    }
  });

  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.action === 'import') { importJSON(el.files[0]); el.value = ''; return; }
    const p = el.dataset.p ? findParty(el.dataset.p) : null;
    if (!p) return;
    if (el.dataset.action === 'rename-party') { p.name = el.value.trim() || p.name; save(); return; }
    if (el.dataset.action === 'set-member') {
      const m = p.members[+el.dataset.m];
      m.charId = el.value;
      if (m.charId && !m.slots.length) m.slots.push({ fruit: '', target: '', current: '', status: '未着手' });
      save(); render(); return;
    }
    if (el.dataset.k) {
      const s = p.members[+el.dataset.m].slots[+el.dataset.s];
      s[el.dataset.k] = el.value;
      // 今の等級が目標に届いたら自動で完了にする
      if ((el.dataset.k === 'current' || el.dataset.k === 'target') && rank(s.target) >= 0 && rank(s.current) >= rank(s.target)) s.status = '完了';
      else if (el.dataset.k === 'current' && s.status === '未着手' && s.current) s.status = '厳選中';
      save(); render();
    }
  });

  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `wakuwaku-memo-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || !Array.isArray(data.chars)) throw new Error('format');
        if (!confirm('今のメモを、読み込んだファイルの内容で置き換えます。よろしいですか？')) return;
        state = normalize(data); save(); render(); toast('読み込みました');
      } catch (err) { toast('このファイルは読み込めませんでした'); }
    };
    reader.readAsText(file);
  }

  // ───────── トースト ─────────
  const toastEl = document.getElementById('toast');
  let toastTimer;
  function toast(msg, undo) {
    toastEl.innerHTML = esc(msg) + (undo ? '<button type="button">元に戻す</button>' : '');
    if (undo) toastEl.querySelector('button').onclick = () => { undo(); hideToast(); };
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 5000 : 2600);
  }
  function hideToast() { toastEl.classList.remove('show'); }

  // ───────── 起動 ─────────
  const badge = document.getElementById('offlineBadge');
  const updateOnline = () => { badge.hidden = navigator.onLine; };
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();

  window.addEventListener('hashchange', render);
  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) { state = load(); render(); } });
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
