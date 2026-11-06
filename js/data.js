// ゲーム側の固定データ。新しい種族や実が増えたらここに追記する。
// 実の効果の説明は攻略サイト（アルテマ・AppMedia・AppBank）の記載をもとに要約したもの。

const DATA = {
  // 種族は入力欄の候補として使う。ここにない種族も自由に入力できる。
  races: [
    '神', 'ドラゴン', 'ロボット', '魔人', '鳥', '獣', '亜人', '魔族', '妖精', '鉱物',
    '魔王', '幻獣', 'コスモ', 'ユニバース', '聖騎士', 'サムライ', 'ユニオン', 'アクシス',
    '幻妖', '怪獣', '闘神', '神獣', '妖怪', 'ファイター', '巨人', '魔神', '人形',
    '死神', 'ホムンクルス', '怪異', 'LINE'
  ],

  hits: ['反射', '貫通'],

  // 超戦型は通常の戦型と同じ扱い（例：パワー型と超パワー型は同戦型）
  types: [
    'バランス型', '超バランス型',
    'スピード型', '超スピード型',
    'パワー型', '超パワー型',
    '砲撃型', '超砲撃型'
  ],

  // 高い順。比較に使うので順番を崩さないこと。
  // 厳選で狙うのは特級EL・特級Lだけなので、この2つに絞っている。
  grades: ['特級EL', '特級L'],

  statuses: [
    { id: 'todo', label: '未着手' },
    { id: 'doing', label: '厳選中' },
    { id: 'compromise', label: '妥協' },
    { id: 'done', label: '完了' }
  ],

  scopes: {
    race: '同族',
    hit: '同撃種',
    type: '同戦型',
    self: '自分のみ',
    quest: 'クエスト全体'
  },

  scopeHelp: {
    race: '自分を含む、同じ種族のキャラ全員に効く',
    hit: '自分を含む、同じ撃種（反射/貫通）のキャラ全員に効く',
    type: '自分を含む、同じ戦型のキャラ全員に効く',
    self: '持っているキャラ自身にだけ効く',
    quest: 'クエスト全体に効く。パーティ内で重ならず、等級の高い1つだけが効く'
  },

  fruits: []
};

// 絆系 18 種（同族・撃種・戦型 × 6 種類）を組み立てる
(() => {
  const groups = [
    { scope: 'race', prefix: '同族の絆', short: '同族' },
    { scope: 'hit', prefix: '撃種の絆', short: '撃種' },
    { scope: 'type', prefix: '戦型の絆', short: '戦型' }
  ];
  const stats = [
    { key: 'atk', name: '加撃', desc: '攻撃力アップ', attack: true },
    { key: 'atkspd', name: '加撃速', desc: '攻撃力とスピードアップ', attack: true },
    { key: 'hpatk', name: '加命撃', desc: 'HPと攻撃力アップ', attack: true },
    { key: 'hp', name: '加命', desc: 'HPアップ', attack: false },
    { key: 'spd', name: '加速', desc: 'スピードアップ', attack: false },
    { key: 'spdhp', name: '加速命', desc: 'スピードとHPアップ', attack: false }
  ];
  for (const g of groups) {
    for (const s of stats) {
      DATA.fruits.push({
        id: `${g.scope}-${s.key}`,
        name: `${g.prefix}・${s.name}`,
        short: `${g.short}${s.name}`,
        scope: g.scope,
        attack: s.attack,
        desc: s.desc
      });
    }
  }

  const others = [
    { id: 'yuugeki', name: '熱き友撃の力', short: '友撃', scope: 'self', desc: '友情コンボの威力アップ' },
    { id: 'shisshin', name: '一撃失心の力', short: '失心', scope: 'self', desc: 'ヒット時にまれに敵を気絶させる。同じ実を複数つけても効果が出る唯一の実' },
    { id: 'kegaheri', name: 'ケガ減りの力', short: 'ケガ減り', scope: 'self', desc: '敵から受けるダメージを減らす' },
    { id: 'sokuhissatsu', name: '速必殺の力', short: '速必殺', scope: 'self', desc: '開始時にストライクショットのターン数が減る' },
    { id: 'chibiiyashi', name: 'ちび癒しの力', short: 'ちび癒し', scope: 'self', desc: '1ターンごとにHPを回復する' },
    { id: 'dokugaman', name: '毒がまんの力', short: '毒がまん', scope: 'self', desc: '毒のダメージを減らす' },
    { id: 'heart', name: 'ハート強化の力', short: 'ハート強化', scope: 'self', desc: 'ハート取得時のHP回復量アップ' },
    { id: 'shoumei', name: '将命削りの力', short: '将命削り', scope: 'quest', desc: 'バトル開始前にボスのHPを削る' },
    { id: 'heimei', name: '兵命削りの力', short: '兵命削り', scope: 'quest', desc: 'バトル開始前にボス以外の敵のHPを削る' },
    { id: 'manabi', name: '学びの力', short: '学び', scope: 'quest', desc: '獲得経験値アップ' },
    { id: 'arakasegi', name: '荒稼ぎの力', short: '荒稼ぎ', scope: 'quest', desc: '獲得ゴールドアップ' },
    { id: 'supikuri', name: 'スピクリの力', short: 'スピクリ', scope: 'quest', desc: 'スピードクリアのターン数が増える' },
    { id: 'srank', name: 'Sランクの力', short: 'Sランク', scope: 'quest', desc: 'Sランクのクリアタイムが伸びる' },
    { id: 'score', name: 'スコア稼ぎの力', short: 'スコア稼ぎ', scope: 'quest', desc: 'スコア報酬の獲得ポイントが増える' }
  ];
  for (const f of others) DATA.fruits.push({ attack: false, ...f });
})();
