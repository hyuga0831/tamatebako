import type { FormatId, Subject } from './types';
import { SHISOKU_PATTERNS } from '../gen/shisoku';
import { ZUHYO_PATTERNS } from '../gen/zuhyo';
import { KUURAN_PATTERNS } from '../gen/kuuran';

export interface Tip {
  title: string;
  body: string[];
}

export interface FormatSpec {
  id: FormatId;
  subject: Subject;
  name: string;
  alias: string;
  /** 本番の問題数と制限時間（秒）。複数パターンある形式は、時間の厳しいほう */
  total: number;
  timeSec: number;
  /** もう 1 つの出題パターン */
  alt?: { total: number; timeSec: number };
  /**
   * アプリ内の制限時間を本番の何倍にするか。
   * 言語の長文は本番（400〜600字）より短い約 280字なので、読む時間が減る分だけ制限時間を縮めて、同じ忙しさにする。
   */
  timeScale: number;
  /** 勘で選んだときに当たる確率 */
  guess: number;
  /** 1 画面の設問数（言語は 1 長文に 4 問） */
  perScreen: number;
  /** 得点の予測に使う、直近の解答数 */
  window: number;
  drill: number;
  mini: number;
  calc: boolean;
  patterns: Record<string, string>;
  lead: string;
  tips: Tip[];
}

export const FORMAT_ORDER: FormatId[] = ['shisoku', 'zuhyo', 'kuuran', 'ronri', 'shushi'];

export const SUBJECT_NAME: Record<Subject, string> = { keisu: '計数', gengo: '言語' };

export const FORMATS: Record<FormatId, FormatSpec> = {
  shisoku: {
    id: 'shisoku',
    subject: 'keisu',
    name: '四則逆算',
    alias: '計数',
    total: 50,
    timeSec: 540,
    timeScale: 1,
    guess: 1 / 5,
    perScreen: 1,
    window: 40,
    drill: 10,
    mini: 10,
    calc: true,
    patterns: SHISOKU_PATTERNS,
    lead: '式の □ に入る数を 5 択から選ぶ。50問を9分、1問あたり約11秒。',
    tips: [
      {
        title: '全部解かなくていい',
        body: [
          '1問15秒のペースなら 9分で 36問。その8割が合えば 29問。',
          '残り 14問は、最後の 20秒で同じ選択肢を選び続ける。5択なので 3問ほど当たる。',
          '合わせて 32問（64%）。足切りにはこれで足りる。',
        ],
      },
      {
        title: '移項は 2 種類だけ',
        body: [
          '□ ＋ a ＝ c → c − a　／　□ × a ＝ c → c ÷ a　（反対の計算にして右へ）',
          '□ が後ろにあるときだけ注意： a − □ ＝ c → a − c　／　a ÷ □ ＝ c → a ÷ c',
          '□ がない側は、先に計算して 1 つの数にしておく。',
        ],
      },
      {
        title: '％・小数・分数の読み替え',
        body: [
          '％は小数にする： 15% → 0.15。「a の b%」は a × 0.b。',
          '0.5 ＝ 1/2、0.25 ＝ 1/4、0.2 ＝ 1/5、0.75 ＝ 3/4、0.125 ＝ 1/8。',
          '分数で割るときは、ひっくり返してかける： ÷ 3/4 → × 4/3。',
        ],
      },
      {
        title: '選択肢を先に見る',
        body: [
          '小数点の位置だけが違う → 桁の見当だけつける。',
          '一の位がすべて違う → 一の位だけ計算する。',
          '2桁どうしのかけ算・割り算は、迷わず電卓。',
        ],
      },
      {
        title: '3秒で式が浮かばなければ捨てる',
        body: ['分数が 3 つ以上ある式などは、勘で選んで次へ。前の問題には戻れず、間違えても減点はない。'],
      },
    ],
  },
  zuhyo: {
    id: 'zuhyo',
    subject: 'keisu',
    name: '図表の読み取り',
    alias: '計数',
    total: 29,
    timeSec: 900,
    alt: { total: 40, timeSec: 2100 },
    timeScale: 1,
    guess: 1 / 5,
    perScreen: 1,
    window: 20,
    drill: 5,
    mini: 6,
    calc: true,
    patterns: ZUHYO_PATTERNS,
    lead: '表やグラフから数値を拾って計算する。29問を15分（1問 約31秒）、または 40問を35分。',
    tips: [
      {
        title: '先に設問を読む',
        body: ['図表をながめてから設問を読むと時間が足りない。', '設問から「どの行・どの列・単位」を決めて、その数値だけを拾う。'],
      },
      {
        title: '公式は 3 つ',
        body: [
          '増減率 ＝ (あと − まえ) ÷ まえ　　※分母は必ず「まえ」',
          '割合 ＝ 部分 ÷ 全体',
          'A は B の何倍か ＝ A ÷ B　　※「の」のほうで割る',
        ],
      },
      {
        title: '構成比（%）は実数に直す',
        body: [
          '年度や会社が違えば、全体の大きさが違う。%どうしを比べない。',
          '実数 ＝ 総額 × 構成比。直してから、差や増減率を出す。',
          '同じ全体の中の「何倍か」だけは、%どうしで割ってよい。',
        ],
      },
      {
        title: '単位と注を見る',
        body: ['千円・百万円・10億円、人と千人。設問と表で単位が違うことがある。', '「対前年増減率」の表は、足し算ではなく倍率にしてかける（＋30%→×1.3、−20%→×0.8）。'],
      },
      {
        title: '概算と電卓の使い分け',
        body: [
          '選択肢が離れていれば、上 2 桁の概算で選べる。',
          '選択肢が近ければ電卓。「最大はどれか」は候補を 2 つにしぼってから計算する。',
          '1分かかりそうな問題は、勘で選んで次へ。',
        ],
      },
    ],
  },
  kuuran: {
    id: 'kuuran',
    subject: 'keisu',
    name: '表の空欄推測',
    alias: '計数',
    total: 20,
    timeSec: 1200,
    alt: { total: 35, timeSec: 2100 },
    timeScale: 1,
    guess: 1 / 5,
    perScreen: 1,
    window: 16,
    drill: 4,
    mini: 4,
    calc: true,
    patterns: KUURAN_PATTERNS,
    lead: '表の規則を見つけて、空欄（？）の値を選ぶ。20問を20分、または 35問を35分（どちらも 1問 約60秒）。',
    tips: [
      {
        title: '試す順番を決めておく',
        body: [
          '① 割り算：下の行 ÷ 上の行 が、どの列でも同じ → 比例',
          '② 引き算：上が増えた分と下が増えた分の比が同じ → 基本料金＋従量',
          '③ 足し算：縦に足すと一定、または「合計」の行になっている',
          '④ かけ算：2 つの行をかけると 3 つめの行になる',
          '⑤ どれでもない → 大小関係ではさんで、選択肢をしぼる',
        ],
      },
      {
        title: '関係のない行が混ざっている',
        body: ['気温、勤続年数、日数など。規則が見つからない行は無視してよい。'],
      },
      {
        title: '1 か所だけ違う列を比べる',
        body: ['数量が 1 品目だけ違う 2 列を引き算すると、その品目の単価が出る。', '「合計 − わかっている分」を出すと、表にない単価が見えることがある。'],
      },
      {
        title: '30秒で見切る',
        body: ['規則が見えないときは、選択肢の真ん中あたりを選んで次へ。', '時間があれば、選択肢の値を空欄に入れて、ほかの列と同じ関係になるかを確かめる。'],
      },
    ],
  },
  ronri: {
    id: 'ronri',
    subject: 'gengo',
    name: '論理的読解',
    alias: '言語・GAB形式',
    total: 32,
    timeSec: 900,
    alt: { total: 52, timeSec: 1500 },
    timeScale: 0.72,
    guess: 1 / 3,
    perScreen: 4,
    window: 24,
    drill: 8,
    mini: 8,
    calc: false,
    patterns: { A: '正解が A（正しい）', B: '正解が B（間違い）', C: '正解が C（判断できない）' },
    lead: '長文を読み、設問文が A 正しい／B 間違い／C 判断できない のどれかを選ぶ。8長文 32問を15分（1長文 約1分50秒）。',
    tips: [
      {
        title: '基準は「本文に書いてあるか」だけ',
        body: [
          'A：本文の言い換え。または、本文の 2 つの文をつなぐと必ずそうなる。',
          'B：本文とはっきり食い違う（逆、数字が違う、「すべて」に対して例外がある）。',
          'C：本文に材料がない（比べていない、原因と言っていない、先のことを言っていない）。',
        ],
      },
      {
        title: 'いちばん多い失点は「常識で A」',
        body: [
          '世の中では正しいことでも、本文になければ C。',
          '「根拠の文を指でさせるか」で決める。させなければ C。',
          '「〜したところ〜になった」は順番を言っているだけ。原因とまでは言っていない。',
        ],
      },
      {
        title: 'B と C の分かれ目',
        body: ['本文に「反対のこと」が書いてあれば B。何も書いていなければ C。', '設問文に「すべて」「必ず」「だけ」「最も」があれば、本文の例外や順位を確かめる。'],
      },
      {
        title: '設問を先に読む',
        body: ['A・B・C の説明は毎回同じなので読まない。', '4 つの設問のキーワードを頭に入れてから、本文で探す。', '迷ったら 10秒で決めて次へ。前の長文には戻れない。'],
      },
    ],
  },
  shushi: {
    id: 'shushi',
    subject: 'gengo',
    name: '趣旨判定',
    alias: '言語・IMAGES形式',
    total: 32,
    timeSec: 600,
    timeScale: 0.7,
    guess: 1 / 3,
    perScreen: 4,
    window: 24,
    drill: 8,
    mini: 8,
    calc: false,
    patterns: { A: '正解が A（趣旨）', B: '正解が B（本文にあるが趣旨でない）', C: '正解が C（関係ない）' },
    lead: '長文を読み、設問文が A 趣旨／B 本文にあるが趣旨ではない／C 関係ない のどれかを選ぶ。8長文 32問を10分（1長文 1分15秒）。',
    tips: [
      {
        title: '3 ステップで仕分ける',
        body: ['① 本文に出てこない話 → C', '② 残りのうち、筆者の結論を言い換えたもの → A（1 つだけ）', '③ それ以外 → B'],
      },
      {
        title: '趣旨は最後の段落にある',
        body: [
          '「〜が大切だ」「〜べきだ」「〜してほしい」「〜なのである」の文を探す。',
          '「しかし」「けれども」「だが」の後ろが本音。その前は前置きで、B になりやすい。',
          '体験談、具体例、冒頭の話題の紹介は B。',
        ],
      },
      {
        title: '一般論にだまされない',
        body: ['「結論から話すのがよい」のように、よく言われることでも、本文になければ C。', '本文と逆のことを言っている設問も C。'],
      },
      {
        title: '時間は 1 長文 75秒',
        body: ['最後の段落 → 設問 4 つ → 必要なら本文に戻る、の順で読む。', '4 問の中に A と C は必ず 1 つ以上ある。A が 2 つになったら、より「まとめ」に近いほうを A にする。'],
      },
    ],
  },
};

/** すべての形式に共通する、本番の決まりごと */
export const COMMON_RULES: string[] = [
  '前の問題には戻れない。',
  '間違えても減点されない。空欄がいちばん損なので、必ず何か選ぶ。',
  '残り 30秒になったら、残りの問題を同じ選択肢で埋める。',
  '自宅で受ける玉手箱は電卓とメモが使える。本番は実物の電卓を用意する。',
];
