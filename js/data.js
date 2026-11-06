// ゲーム側のデータ（種族・撃種・戦型・等級・わくわくの実）。
// 新しい種族や実がゲームに追加されたら、ここに追記する。
// 画面の「実の一覧 → 自分で追加した実」からも追加できる（そちらは端末ごとの保存）。

window.WAKU_DATA = {
  // 種族（キャラ登録時の候補。ここに無い種族も自由に入力できる）
  races: [
    '神', '魔族', '亜人', 'ドラゴン', '獣', '鉱物', 'ロボット', '妖精',
    '魔人', '幻妖', 'サムライ', 'ユニバース', '英雄', '聖騎士', '天使', '魔王', '怪物'
  ],

  hits: ['反射', '貫通'],

  // 超戦型は通常の戦型と同じ扱い（判定時に「超」を外して比べる）
  types: [
    'パワー型', 'スピード型', 'バランス型', '砲撃型',
    '超パワー型', '超スピード型', '超バランス型', '超砲撃型'
  ],

  // 等級（低い順）。rank が大きいほど上の等級。
  grades: ['特級L', 'EL'],

  // 効く範囲
  scopes: {
    self: '自身',
    race: '同族（同じ種族のキャラ全員）',
    hit: '撃種（同じ撃種のキャラ全員）',
    type: '戦型（同じ戦型のキャラ全員）',
    party: 'パーティで1つだけ有効'
  },

  // 絆系（同族・撃種・戦型 × 加撃／加命／加撃速／加命撃）
  bonds: [
    { scope: 'race', prefix: '同族の絆' },
    { scope: 'hit', prefix: '撃種の絆' },
    { scope: 'type', prefix: '戦型の絆' }
  ],
  bondKinds: [
    { suffix: '加撃', attack: true, desc: '攻撃力アップ' },
    { suffix: '加命', attack: false, desc: 'HPアップ' },
    { suffix: '加撃速', attack: true, desc: '攻撃力・スピードアップ' },
    { suffix: '加命撃', attack: true, desc: 'HP・攻撃力アップ' }
  ],

  // 絆系以外
  others: [
    { name: '加撃', scope: 'self', attack: true, desc: '自身の攻撃力アップ' },
    { name: '加速', scope: 'self', attack: false, desc: '自身のスピードアップ' },
    { name: '加命', scope: 'self', attack: false, desc: '自身のHPアップ' },
    { name: '加撃速', scope: 'self', attack: true, desc: '自身の攻撃力・スピードアップ' },
    { name: '加命撃', scope: 'self', attack: true, desc: '自身のHP・攻撃力アップ' },
    { name: '将命削りの力', scope: 'party', attack: false, desc: 'ボスのHPを削った状態で開始' },
    { name: '兵命削りの力', scope: 'self', attack: false, desc: '雑魚のHPを削った状態で開始' },
    { name: '熱き友撃の力', scope: 'self', attack: false, desc: '友情コンボの威力アップ' },
    { name: '速必殺の力', scope: 'self', attack: false, desc: 'ストライクショットのターン短縮' },
    { name: '一撃失心の力', scope: 'self', attack: false, desc: '一定確率で敵を失心させる（同じキャラに重ねても効く）', stackable: true },
    { name: 'ケガ減りの力', scope: 'self', attack: false, desc: '受けるダメージを軽減' },
    { name: '学びの力', scope: 'self', attack: false, desc: '獲得経験値アップ' },
    { name: '荒稼ぎの力', scope: 'self', attack: false, desc: '獲得ゴールドアップ' }
  ],

  // パーティの人数と、1体につけられる実の数
  partySize: 4,
  slotsPerChar: 4,

  statuses: ['未着手', '厳選中', '完了']
};
