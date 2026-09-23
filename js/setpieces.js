/* ============================================================================
   DUO RUN — setpieces.js  大演出（契約 §4.4 / §4.6）
   各ステージ終盤200mの「スクリプト化された固定区間」。

   ■ 作り方
   - 障害物は通常のチャンクと同じ形（floor/ceil/events）で書き、生成器が同じ
     Fair.validate を通す。**演出でも §4.7 の不変条件は一切ゆるめない**。
   - 見た目（崩落するタイル・粉塵・カメラ揺れ・画角・霧）は「距離の関数」として
     ここに閉じ込める。World は Setpieces.tileFall() と Setpieces.camFx() を読むだけ。
   - 中断（リトライ／タイトル）で必ず Setpieces.reset() が呼ばれ、
     カメラ・画角・霧・崩落タイルが元に戻る（機械テストあり）。

   ■ S1「高速道路の連鎖崩落」
     後方から路面と天井が次々に落ちる。崩落前線はプレイヤーの 18〜32m 後ろを
     上下しながら追ってくる（演出なので**絶対に追いつかない**）。
     危険は「崩落で落ちてきた瓦礫(ROVER)」「落下する看板(天井のROVER)」などとして
     通常の不変条件で配置する（崩落済みの穴 GAP は契約 v2 で失効＝ハードルに置き換えた）。
   ============================================================================ */
'use strict';

const Setpieces = {
  /* ---- 定義（at は演出開始からの相対 m。速度で伸縮しない実寸） ------------ */
  DEFS: {
    collapse: {
      id: 'collapse',
      lengthM: 200,
      /* 危険物の配置（§4.7 の反応窓・ジャンプ連続に余裕をもたせた固定譜面）。
         落ちた瓦礫(ROVER)だけだと「跳ぶ」に偏るので、
         倒れた支柱(PILLAR)・落ちた看板(WIDEBAR)・切れた送電線(LASER_V)で
         「横に避ける」も混ぜて §4.3 の動作比率に収める。 */
      floor: [
        { at: 26, lane: 0, type: 'ROVER' },
        { at: 80, lane: 1, type: 'PILLAR' },
        { at: 110, lane: -1, type: 'ROVER' },
        { at: 140, lane: 0, type: 'ROVER' },
        { at: 170, lane: -1, type: 'WIDEBAR' },
        { at: 190, lane: 1, type: 'LASER_V' }
      ],
      ceil: [
        { at: 53, lane: -1, type: 'ROVER' },
        { at: 140, lane: 0, type: 'WIDEBAR' }
      ],
      events: [
        { at: 0, type: 'collapse.start' },
        { at: 200, type: 'collapse.end' }
      ]
    },

    /* ====================================================================
       S2「ビル間の大ジャンプ」（契約§4.4）
       キーフレーム（演出開始からの相対 m。速度で伸縮しない実寸）:
         0    予告（HUD「JUMP!」＋発射台の点滅ライン）／路面が上り勾配になり始める
         6〜46 上り勾配（コリドーごと RAMP_H まで持ち上がる）
         46〜52 ジャンプ台の先端（蹴り上げ）
         52   **発射** → 滑空区間へ（ジャンプ／スライド入力は無効。レーン移動だけ）
         52〜192 滑空 140m ＝ 速度 23〜24 m/s で約6.0秒（契約「約6〜8秒相当」）
         192  隣のビルの屋上へ**着地**（衝撃・カメラ揺れ）
         192〜200 走り抜けてゴール
       空中の障害物は全て「跳べない／潜れない」型（§4.7 の生存経路はレーン移動で満たす）。
       ==================================================================== */
    bigjump: {
      id: 'bigjump',
      lengthM: 200,
      /* 【2026-09-21 全面改訂 / P2c】滑空はレーンも床/天井も無い**自由飛行**（§4.5）。
         レーンの障害物は1つも置かない。空中の障害物は FF（freeflight.js）が
         シード固定で組み、当たり判定は円 vs 矩形・公平性は Fair.validateAir で見る。
         旧「空中も ADPANEL/DRONE をレーンで避ける」は失効。 */
      floor: [],
      ceil: [],
      air: true,                     // 自由飛行の区間を持つ演出
      landRel: 192,                  // 着地（＝この後 GRACE_T 秒は障害物なし）
      events: [
        { at: 0,   type: 'bigjump.start' },
        { at: 52,  type: 'bigjump.launch' },
        { at: 192, type: 'bigjump.land' },
        { at: 200, type: 'bigjump.end' }
      ]
    },

    /* ====================================================================
       S3「巨岩の追跡」（契約§4.4）
       キーフレーム（演出開始からの相対 m。速度で伸縮しない実寸）:
         0     予告（HUD「BOULDER!」）＋ 背後の遺跡が砕けて巨岩が転がり出す
         6〜26 **振り返りカット1**（カメラが振り返り、迫る巨岩が画面いっぱいに映る）
               ※ この区間には障害物を置かない。カット明け後も視認距離ぶん空ける
         64〜152 瓦礫の山（SLOWBAND＝死なないが越えないと -20%）と通常の障害物
         168〜186 **振り返りカット2**（巨岩はもっと近い）
         200   通過してゴールへ
       ミスの代わりに「減速」で詰められ、詰まりきると押し潰される（= 死）。
       完璧反応／0.25秒遅延のどちらのボットも跳び越すので、演出を跨いで完走できる。
       ==================================================================== */
    rockchase: {
      id: 'rockchase',
      lengthM: 200,
      /* 譜面の置ける窓は「振り返りカットの後、視認距離ぶん空けてから」＝ 62〜168m。
         倒れた石柱（PILLAR）・火柱（LASER_V）は both 型なので1本で2体に要求が出る＝
         §4.7 の密度（S3 は 6→10回/100m）を演出区間でも落とさない。 */
      floor: [
        { at: 64,  lane: 0,  type: 'SLOWBAND' },
        { at: 90,  lane: 0,  type: 'PILLAR' },
        { at: 104, lane: -1, type: 'LASER_V' },
        { at: 118, lane: 1,  type: 'SLOWBAND' },
        { at: 144, lane: 1,  type: 'PILLAR' },
        { at: 158, lane: -1, type: 'SLOWBAND' }
      ],
      ceil: [
        { at: 64,  lane: 1,  type: 'ROVER' },
        { at: 118, lane: 0,  type: 'SLOWBAND' },
        { at: 158, lane: 0,  type: 'ROVER' }
      ],
      events: [
        { at: 0,   type: 'rock.start' },
        { at: 34,  type: 'rock.cue' },       // 予告を引っ込める（振り返りカット1のあと）
        { at: 200, type: 'rock.end' }
      ]
    },

    /* ====================================================================
       S4「神殿崩壊」（契約§4.4 / P3b）
       キーフレーム（演出開始からの相対 m。速度で伸縮しない実寸）:
         0     予告（HUD「COLLAPSE!」）＋ 地響き。両脇の柱が次々に倒れ始める
         14〜  **倒れる柱**（見た目）が 15m おきに前方で倒れる＝崩壊が画面で分かる
         30    倒れた柱が **横断する梁**（COLUMN・3レーン全幅）になる → 跳ぶ
         58〜  **落ちてくる瓦礫の間の光柱**（LASER_V・両者レーン移動。旧「落ちる天井」は契約 v2 で失効）
         108   瓦礫（PILLAR）で通路が狭まる
         176   出口が見え始める（霧が晴れて光が差す）
         190   **崩れる出口を潜り抜ける**（WALLHOLE）
         200   外へ抜けてゴール
       §4.7 は通常どおり（演出でも理不尽な死を作らない）。
       ==================================================================== */
    templefall: {
      id: 'templefall',
      lengthM: 200,
      floor: [
        { at: 30,  lane: -1, type: 'COLUMN' },     // 倒れた柱が全幅を横断（跳ぶ）
        { at: 58,  lane: 0,  type: 'LASER_V' },    // 旧 落ちる天井 → 縦レーザー（両者レーン移動）
        { at: 80,  lane: 1,  type: 'LASER_V' },
        { at: 108, lane: -1, type: 'PILLAR' },     // 崩れ落ちた柱（both＝両者レーン移動）
        { at: 128, lane: -1, type: 'COLUMN' },
        { at: 156, lane: 0,  type: 'LASER_V' },
        { at: 176, lane: -1, type: 'WIDEBAR' },    // 瓦礫の隙間を抜ける
        { at: 190, lane: 0,  type: 'WALLHOLE' }    // 崩れる出口を潜り抜ける
      ],
      ceil: [
        { at: 30,  lane: 0,  type: 'ROVER' },
        { at: 128, lane: -1, type: 'COLUMN' },
        { at: 176, lane: 1,  type: 'ROVER' }
      ],
      events: [
        { at: 0,   type: 'temple.start' },
        { at: 22,  type: 'temple.cue' },
        { at: 176, type: 'temple.exit' },
        { at: 200, type: 'temple.end' }
      ]
    },

    /* ====================================================================
       S5「巨大魚の通過」（契約§4.4 / P4a）
       キーフレーム（演出開始からの相対 m。速度で伸縮しない実寸）:
         0      予告（HUD「LEVIATHAN!」）＋ 前方の霧の中に巨体の影
         8〜44  **横断**: 横から巨大魚がコリドーを横切る。
                rel 26 付近で **画面の半分以上を魚体が占める**（契約の合格条件）。
                この区間には障害物を置かない（視認距離ぶん空けて 64m から置く）
         56〜   **並走**: 魚が左を並んで泳ぐ。ヒレ・牙・尾がコリドーへ入ってくる
         64〜170 譜面: 牙（口の中をくぐる＝両者ジャンプ）／ヒレ（レーン移動）／
                尾の振り（横スキャン＝到達時刻で判定）
         146〜176 **目玉が画面に入る**（頭が寄ってくる。カメラは奪わない）
         178〜  魚が深みへ去る
         200    ゴールへ
       §4.7 は通常どおり（演出でも理不尽な死を作らない）。
       ==================================================================== */
    megafish: {
      id: 'megafish',
      lengthM: 200,
      floor: [
        { at: 76,  lane: 0,  type: 'FISH_TOOTH' },    // 口の中をくぐる（下顎の牙）
        { at: 98,  lane: 1,  type: 'FISH_TOOTH' },
        { at: 126, lane: -1, type: 'FISH_FIN' },      // ヒレの隙間（both＝両者レーン移動）
        { at: 140, lane: 1,  type: 'FISH_FIN' },
        { at: 154, lane: 0,  type: 'FISH_TAIL',       // 尾の振り（到達時刻で判定）
          params: { scan: { from: -1, to: 1, phase: 0 } } },
        { at: 168, lane: 0,  type: 'FISH_FIN' },
        { at: 182, lane: -1, type: 'FISH_TOOTH' }
      ],
      ceil: [
        { at: 76,  lane: 1,  type: 'FISH_TOOTH' },    // 上顎の牙（＝口の中）
        { at: 98,  lane: -1, type: 'FISH_TOOTH' },
        { at: 182, lane: 0,  type: 'FISH_TOOTH' }
      ],
      events: [
        { at: 0,   type: 'fish.start' },
        { at: 46,  type: 'fish.cue' },
        { at: 146, type: 'fish.eye' },
        { at: 200, type: 'fish.end' }
      ]
    },

    /* ====================================================================
       S6「区画爆発」（契約§4.4 / P4b）
       キーフレーム（演出開始からの相対 m。速度で伸縮しない実寸）:
         0      予告（HUD「BLAST!」）＋ 隔壁の向こうで警告灯が回り始める
         6〜54  減圧警報の中を走る（崩れた支柱・落ちた防護フィールド・瓦礫）
         64〜94 **カメラカット**（隔壁側＝左へ 1秒カメラを振る）。
                その向こうで区画が爆ぜ、炎と破片が広がるのを見せる
                （契約§8 の決定ログ: 巨大演出はカメラを向けるカット方式）。
                この窓には障害物を置かない＝§4.7 の視認距離も守れる
         80     火球が最大（カットの真ん中）
         100    **爆風で吹き飛ばされる** → 合体（DUO体）→ 自由飛行（§4.5 を流用）
         100〜176 回転しながら破片（コンテナ・パネル・配管）を避ける
         176    次の区画へ**着地**（分離・2.0秒の猶予＝障害物なし）
         200    減圧警報の中を走り抜けてゴール
       §4.7 は通常どおり（演出でも理不尽な死を作らない）。
       ==================================================================== */
    blastout: {
      id: 'blastout',
      lengthM: 200,
      floor: [
        { at: 6,  lane: -1, type: 'PILLAR' },    // 崩れた支柱（both＝両者レーン移動）
        { at: 22, lane: 1,  type: 'LASER_V' },   // 落ちてきた防護フィールド（both）
        { at: 38, lane: 0,  type: 'PILLAR' },    // 通路を塞ぐ瓦礫
        { at: 54, lane: 0,  type: 'ROVER' }      // 転がったコンテナ（跳ぶ）
      ],
      ceil: [
        { at: 54, lane: 1, type: 'ROVER' }
      ],
      air: true,                     // 自由飛行の区間を持つ演出（§4.5 を流用）
      landRel: 176,                  // 着地（＝この後 GRACE_T 秒は障害物なし）
      events: [
        { at: 0,   type: 'blast.start' },
        { at: 64,  type: 'blast.cut' },
        { at: 176, type: 'blast.land' },
        { at: 200, type: 'blast.end' }
      ]
    },

    /* ====================================================================
       S7「鏡の砕け散り」（契約§4.4 / P5a）
       キーフレーム（演出開始からの相対 m。速度で伸縮しない実寸）:
         0      予告（HUD「SHATTER!」）＋ **ひびの線が走る**（音は鳴らさない）
         8〜44  ひびの広がる回廊を走る（鏡の柱・光の柱）
         44〜62 **鏡面の床と天井が砕けて鏡片が浮遊**（路面が割れて浮き上がる）
         62〜146 **飛び石**: 床側／天井側とも足場が離散的に浮かび、
                 足場のないところは GAP（割れた鏡の床 SHARDGAP）。
                 足場は左右に揺れる（到達時刻で判定＝動くレーザーの流儀）。
                 裂け目は 28m おき（＝ジャンプ連続 0.70秒の下限より広い）
         150〜  鏡片が集まりはじめ、出口の**大鏡**になる
         162〜200 **カメラが鏡へ向く1秒カット**（38 m/s で 38m ＝ 1.0秒）
         200    2体が鏡に飛び込んでゴール
       §4.7 は通常どおり（演出でも理不尽な死を作らない）。カットの窓には
       障害物を置かない＝視認距離も守れる。
       ==================================================================== */
    shatter: {
      id: 'shatter',
      lengthM: 200,
      floor: [
        { at: 8,  lane: 0,  type: 'PILLAR' },     // 鏡の柱（both＝両者レーン移動）
        { at: 26, lane: 1,  type: 'LASER_V' },    // 光の柱（both）
        { at: 44, lane: -1, type: 'PILLAR' },
        /* 飛び石（足場は左右に揺れる。到達時は from の端で溜まっている＝phase 0） */
        /* lane は必ず -1（全幅の型なので、見た目の中心が 0 に来る書き方）。
           足場のレーンは params.shard.from（＝到達した瞬間の位置）で書く。 */
        { at: 62,  lane: -1, type: 'SHARDGAP', params: { shard: { from: 0, to: 1, phase: 0 } } },
        { at: 90,  lane: -1, type: 'SHARDGAP', params: { shard: { from: -1, to: 0, phase: 0 } } },
        { at: 118, lane: -1, type: 'SHARDGAP', params: { shard: { from: 1, to: 0, phase: 0 } } },
        { at: 146, lane: -1, type: 'SHARDGAP', params: { shard: { from: 0, to: -1, phase: 0 } } }
      ],
      ceil: [
        { at: 62,  lane: -1, type: 'SHARDGAP', params: { shard: { from: 1, to: 0, phase: 0 } } },
        { at: 90,  lane: -1, type: 'SHARDGAP', params: { shard: { from: 0, to: 1, phase: 0 } } },
        { at: 118, lane: -1, type: 'SHARDGAP', params: { shard: { from: -1, to: 0, phase: 0 } } },
        { at: 146, lane: -1, type: 'SHARDGAP', params: { shard: { from: 1, to: -1, phase: 0 } } }
      ],
      events: [
        { at: 0,   type: 'shatter.start' },
        { at: 50,  type: 'shatter.break' },
        { at: 162, type: 'shatter.mirror' },
        { at: 200, type: 'shatter.end' }
      ]
    },

    /* ====================================================================
       S8「全崩壊エスケープ」（契約§4.4 / P5b）
       キーフレーム（演出開始からの相対 m。速度で伸縮しない実寸）:
         0       予告（HUD「ALL COLLAPSE!」）＋ **崩落前線**が背後に現れ、
                 走った端から床と天井が落ちていく
         2〜45   **振り返りカット1**（カメラが背後を向き、迫る崩落の壁が画面を埋める。
                 43m ＝ 42.6 m/s で 1.0秒）。この窓には障害物を置かない。
                 カット明けからは **視認距離ぶん（1.4秒 = 60m）** 空ける
         105〜178 **崩落の中を走る**: 縦レーザーの連鎖（旧 落ちる天井・契約 v2 で失効）と
                 崩れる橋（BRIDGE）。床＝レーン移動／天井＝ジャンプで別々の要求
         188     **床が丸ごと抜けて放り出される** → 合体（DUO体）→ 自由飛行
         188〜258 破片を避けて飛ぶ（§4.5 の自由飛行をそのまま流用。1.6秒）
         258     対岸の崩れかけた床へ**着地**（分離・2.0秒の猶予＝障害物なし）
         264〜307 **振り返りカット2**（崩落はもう目の前。1.0秒）
         312     **重力反転ワープ**（天地が返る）→ そのまま着地
         314〜350 出口の光が差す（**カットの外**＝前を向いたまま光へ突っ込む）
         350     ゴールへ
       ■ 既知の妥協点: 契約§4.4 は「終盤200m」だが、S8 の速度（42〜44 m/s）では
         200m ＝ 4.6秒しかなく、**カット1.0秒＋カット明けの視認距離1.4秒＋
         自由飛行1.6秒＋着地猶予2.0秒**だけで使い切ってしまう。契約の全ビート
         （崩落→大ジャンプ→崩落の中→反転→着地→出口）を、どの段階も
         §4.7 を崩さずに収めるために **350m（約8.2秒）** にしてある。
       ■ P5b 監査で直した点: 振り返りカット2 と「出口の光」が重なっていて、
         **光へ向かう絵が一度も前から見えていなかった**（カメラが背後を向いたまま
         ゴールしていた）。カット2を着地直後へ寄せ、光はカットの外に出した。
       §4.7 は通常どおり（演出でも理不尽な死を作らない）。
       ==================================================================== */
    collapseall: {
      id: 'collapseall',
      lengthM: 350,
      /* 間合い（実寸 m・速度 42.6〜44 で書く。§4.7 の下限に +6%の余裕）
           ウォール間隔          0.45秒 → 20m
           ジャンプ→ジャンプ    0.70秒 → 31m
           ジャンプ→レーン移動  0.92秒 → 41m */
      floor: [
        /* 崩落の中を走る（落ちる天井の連鎖 → 崩れる橋） */
        { at: 105, lane: 0,  type: 'LASER_V' },    // 両者レーン移動（旧 落ちる天井）
        { at: 137, lane: -1, type: 'LASER_V' },
        { at: 169, lane: 1,  type: 'BRIDGE' },     // 踏んだら 0.4秒で落ちる
        /* 着地したあと、天地が返る（契約§4.4「…→反転→着地」）。
           ゲートは当たり判定を持たない（ghost）ので着地猶予には数えない。
           戻りのゲートはゴールの先になる＝ この走行では1回だけ反転する。 */
        { at: 312, lane: 0,  type: 'GRAVWARP', params: { warp: { backT: 2.0 } } }
      ],
      ceil: [
        { at: 169, lane: 0,  type: 'ROVER' }
      ],
      air: true,                     // 自由飛行の区間を持つ演出（§4.5 を流用）
      landRel: 258,                  // 着地（＝この後 GRACE_T 秒は障害物なし）
      events: [
        { at: 0,   type: 'fall.start' },
        { at: 48,  type: 'fall.run' },
        { at: 188, type: 'fall.launch' },
        { at: 258, type: 'fall.land' },
        { at: 312, type: 'fall.flip' },
        { at: 350, type: 'fall.end' }
      ]
    },

    /* ====================================================================
       エンドレスのミニ大演出（契約§4.4「ミニ版（崩落・大ジャンプ）を1500mごとにランダム挿入」/ P6）
       既存の大演出のキーフレームを短くしたもの（各 100〜150m・設計速度 vd での実寸）。
       ・vd より速いときは **全体を speed / vd 倍に伸ばす**（Setpieces.buildMini）＝
         「動作に使える秒数」は速度によらず一定（§4.7 と同じ考え方）。
       ・状態の id は元の大演出と同じ（collapse / bigjump / rockchase）で、state.mini が立つ。
         見た目・カメラ・判定の仕組みはそのまま流用し、キーフレーム表だけ差し替える。
       ・終わったら Setpieces.reset() で必ず片付ける（ゴールが無いので演出を残さない）。
       ・カメラカット: 大ジャンプは無し、巨岩は振り返り1回だけ（契約「省略可」）。
       §4.7 は通常どおり（生成器が Fair.validate を通す）。
       ==================================================================== */
    mini_collapse: {
      id: 'mini_collapse', base: 'collapse', mini: true, vd: 24,
      lengthM: 130,
      /* 両面同時のジャンプ → 両者のレーン移動 → 床のジャンプ（44 m/s でも §4.7 を満たす間合い） */
      floor: [
        { at: 30,  lane: 0,  type: 'ROVER' },
        { at: 84,  lane: 1,  type: 'PILLAR' },
        { at: 116, lane: -1, type: 'ROVER' }
      ],
      ceil: [
        { at: 30, lane: -1, type: 'ROVER' }
      ],
      events: [
        { at: 0,   type: 'collapse.start' },
        { at: 130, type: 'collapse.end' },
        { at: 162, type: 'mini.end' }          // 崩れた路面がカメラの後ろへ抜けてから片付ける
      ]
    },
    mini_jump: {
      id: 'mini_jump', base: 'bigjump', mini: true, vd: 24,
      lengthM: 124,
      floor: [],
      ceil: [],
      air: true,
      landRel: 110,
      events: [
        { at: 0,   type: 'bigjump.start' },
        { at: 36,  type: 'bigjump.launch' },
        { at: 110, type: 'bigjump.land' },
        { at: 124, type: 'bigjump.end' }
      ]
    },
    mini_rock: {
      id: 'mini_rock', base: 'rockchase', mini: true, vd: 26,
      lengthM: 140,
      /* 振り返りカット（6〜26）の後、視認距離ぶん空けてから（64〜） */
      floor: [
        { at: 64,  lane: 0, type: 'SLOWBAND' },
        { at: 92,  lane: 0, type: 'PILLAR' },
        { at: 122, lane: 1, type: 'SLOWBAND' }
      ],
      ceil: [
        { at: 64,  lane: 1, type: 'ROVER' },
        { at: 122, lane: 0, type: 'SLOWBAND' }
      ],
      events: [
        { at: 0,   type: 'rock.start' },
        { at: 34,  type: 'rock.cue' },
        { at: 140, type: 'rock.end' }
      ]
    }
  },

  /* ミニ版のキーフレーム表（設計速度 vd での実寸。buildMini の倍率 k で伸ばして state.tbl に入れる） */
  BJM: {
    RAMP0: 4, RAMP1: 28, LIP: 36, LAND: 110, END: 124,
    RAMP_H: 2.0, KICK: 0.45, ARC: 2.6, ARC_PEAK: 0.34, SETTLE: 9, SETTLE_D: 0.5
  },
  ROCKM: { LOOKBACK: [[6, 26]], CLOSE_M: 60 },
  /* 距離のキー（倍率 k を掛けるもの） */
  _BJ_DIST: ['RAMP0', 'RAMP1', 'LIP', 'LAND', 'END', 'SETTLE'],
  miniTable(base, k) {
    if (base === 'bigjump') {
      const t = Object.assign({}, Setpieces.BJM);
      Setpieces._BJ_DIST.forEach((key) => { t[key] = Setpieces.BJM[key] * k; });
      return t;
    }
    if (base === 'rockchase') {
      return { LOOKBACK: Setpieces.ROCKM.LOOKBACK.map((w) => [w[0] * k, w[1] * k]),
               CLOSE_M: Setpieces.ROCKM.CLOSE_M * k };
    }
    return null;
  },
  /* ミニ版の生成（エンドレスの生成器から）。speedAt はステージの速度関数。 */
  buildMini(id, startM, nowDist, speedAt) {
    const d = Setpieces.DEFS[id];
    if (!d) return null;
    const sp = speedAt(startM);
    const k = Math.max(1, sp / (d.vd || 24));
    const sc = sp / CFG.REF_SPEED;
    const items = [];
    (d.floor || []).forEach((e) => expandEntry(items, e, 'floor', startM + e.at * k, nowDist, sc, null));
    (d.ceil || []).forEach((e) => expandEntry(items, e, 'ceil', startM + e.at * k, nowDist, sc, null));
    items.sort((a, b) => a.at - b.at);
    const endM = startM + d.lengthM * k;
    const events = (d.events || []).map((e) => ({
      at: startM + e.at * k, type: e.type, done: false,
      params: Object.assign({ mini: id, base: d.base, k: k, startM: startM, endM: endM }, e.params || {})
    }));
    return { id: id, items: items, events: events, lengthM: d.lengthM * k, startM: startM, k: k,
             landM: d.air ? startM + d.landRel * k : null };
  },
  /* イベントの params からミニ版の印を state へ写す */
  _markMini(st, e) {
    if (!st || !e || !e.params || !e.params.mini) return st;
    st.mini = e.params.mini;
    st.k = e.params.k || 1;
    st.endM = e.params.endM;
    st.tbl = Setpieces.miniTable(e.params.base, st.k);
    return st;
  },

  /* ---- 全崩壊エスケープのキーフレーム（距離 m。すべてここから引く） --------
     大ジャンプ（BJ）・区画爆発（BL）と同じ形の表なので、自由飛行の仕組みを
     そのまま流用できる。発射台の勾配は無い（床が抜けて落ちる）。 */
  CA: {
    RAMP0: 0, RAMP1: 0, LIP: 188, LAND: 258, END: 350,
    RAMP_H: 0,            // 勾配なし（床が抜ける）
    KICK: 0,
    ARC: 2.6,             // 放り出された弧
    ARC_PEAK: 0.30,
    SETTLE: 10,           // 着地の沈み込みが収まるまでの距離
    SETTLE_D: 0.72,
    /* 振り返りカット（契約§8 の決定ログ「カメラを向けるカット」/ 巨岩と同じ方式）。
       1.0秒 ＝ 42.4〜44 m/s で 43m。窓には障害物を置かない。 */
    BACK: [[2, 45], [264, 307]],
    CUT_BACK: 4.2,        // カット中にカメラを前へ出す量（崩落の壁を画面に収める）
    /* 崩落前線（背後の壁）。2体の後ろ GAP0 → GAP1 まで詰めてくる（追いつきはしない） */
    GAP0: 34, GAP1: 13, CLOSE_M: 250,
    SWAY: 2.4,
    WALL_W: 26, WALL_H: 22, WALL_D: 16,   // 崩落の壁（振り返りカットで映る塊）
    DEB_N: 30,            // 舞う瓦礫の数
    FLIP_AT: 312,         // 重力反転ワープ（相対 m）
    EXIT0: 314,           // 出口の光が差し始める（相対 m。**振り返りカット2の外**）
    SPIN: 2.2             // 放り出されて回る量（rad・見た目だけ）
  },

  /* ---- 鏡の砕け散りのキーフレーム（距離 m。すべてここから引く） ------------ */
  MR: {
    CRACK0: 0, CRACK1: 44,      // ひびが走る（予告）
    BREAK0: 44, BREAK1: 62,     // 床と天井が砕けて鏡片になる
    STONE0: 56, STONE1: 158,    // 飛び石の区間（路面が浮いた鏡片になる）
    GATHER0: 150, GATHER1: 190, // 鏡片が集まって大鏡になる
    CUT0: 163, CUT1: 201,       // 鏡へ向くカット（38 m/s で 38m ＝ 1.0秒）
    MIRROR_AT: 201,             // 出口の大鏡（相対 m）
    MIRROR_W: 13.0, MIRROR_H: 10.5,
    SHARD_N: 78,                // 浮遊する鏡片（演出用の粒。走行の通り道の外に舞う）
    CRACK_N: 22,                // ひびの線
    END: 200
  },

  /* ---- 巨大魚のキーフレーム（距離 m。すべてここから引く） ----------------- */
  FISH: {
    LEN: 92, H: 13, W: 9,          // 全長・高さ・幅（コリドー 3.6×4.0 よりはるかに大きい）
    /* ====================================================================
       **横向きカット**（2026-09-22 P4a-4）
       巨岩の振り返りカット（ROCK.LOOKBACK）と同じ仕組みで、カメラをその場で
       90度 左（開放区間の外＝海の側）へ振る。前進は止めない。
       その視界にはコリドーの小物を入れず（ゾーンが間引く／遠景の層も伏せる）、
       深い青のグラデと光の柱だけを背に **巨大魚が全身のシルエットで横切る**。
       窓には障害物を置かない（譜面の最初は 76m）。カット明けは前を向いて
       牙・ヒレ・尾の判定へ繋ぐ＝§4.7 の視認距離も守れる。
       ==================================================================== */
    SIDE0: 3, SIDE1: 31,           // カットの区間（演出開始からの相対 m）
    SIDE_X: -71,                   // 魚が泳ぐ横の位置（全長92mが視界の70〜90%になる距離）
    SIDE_Y: 2.2,                   // 〃 高さ（目線）
    SIDE_Z0: 52, SIDE_Z1: -52,     // 〃 奥行き（後ろから前へ追い抜いていく）
    CROSS0: 3, CROSS1: 31,         // （互換）カットの窓＝障害物を置かない区間
    EYE_Z: 0.42,                   // 目玉の位置（頭から全長の何割か）
    SWIM0: 56,                     // 並走の始まり
    EYE0: 146, EYE1: 176,          // 目玉が画面に入る区間
    END: 200,
    X_FAR: -15.0, X_NEAR: -10.5,   // 並走の横位置（寄ってくる）
    Y_FAR: 6.0, Y_NEAR: 1.4,       // 〃 高さ（天井より下まで下りて目が合う）
    EYE_R: 2.0,
    Z_FAR: -60, Z_NEAR: 30         // 〃 奥行き（目玉が2体の真横へ）
  },

  /* ---- 神殿崩壊のキーフレーム（距離 m。すべてここから引く） --------------- */
  TEMPLE: {
    EXIT0: 168,           // 出口の光が差し始める相対距離
    END: 200,
    COL_N: 10,            // 倒れる柱（見た目）の本数
    DUST_N: 64,           // 粉塵の粒（描画の塗り面積を抑えるため巨岩より少なめ）
    COL_FROM: 12,         // 1本目の相対距離
    COL_STEP: 13,         // 何 m おきに倒れるか（複数本が同時に倒れる）
    COL_X: 2.30,          // 走行空間（|x| ≤ 1.45）の外・壁パネルの内側
    COL_H: 5.0,
    COL_R: 0.55,
    COL_LEAD: 42,         // プレイヤーの何 m 手前で倒れ始めるか（＝画面の中で倒れる）
    COL_FALL: 35,         // 倒れきるまでの距離（倒れ終わるのは 7m 手前＝大きく映る）
    BEAM_N: 7,            // 天井の上を横切って落ちる梁
    BEAM_FROM: 24, BEAM_STEP: 19, BEAM_LEAD: 30, BEAM_FALL: 16
  },

  /* ---- 巨岩の追跡のキーフレーム（距離 m。すべてここから引く） ------------- */
  ROCK: {
    R: 6.4,               // 巨岩の半径（コリドー 3.6×4.0 より大きい＝遺跡ごと砕いて来る）
    GAP0: 21,             // 追跡開始時の距離
    GAP1: 11,             // 迫りきったときの距離
    CLOSE_M: 70,          // この距離をかけて GAP0 → GAP1 まで詰める
    SWAY: 1.1,            // 距離のゆらぎ（生き物らしさ）
    DEATH: 1.7,           // ここまで詰まると押し潰される（＝死）
    RECOVER: 0.55,        // 遅れの回復（m/秒）。1回の被弾（約8m）は取り返せない
    LOOKBACK: [[6, 26], [168, 186]],  // 振り返りカットの区間（障害物を置かない）
    /* 振り返りカットでカメラを前へ出す量（2体の前から振り返る＝岩の輪郭が画面に入る）。
       カット2は岩が近い（gap 11m）ので大きく引く。2026-09-22 実機評「茶色の塊に見える」 */
    CUT_BACK: [6.4, 13.5],
    /* 岩を照らす明かり（カット1は近景が飛ぶので弱く、カット2は輪郭を起こすので強く） */
    EMBER: [30, 60],
    EMBER_D: 24         // 明かりの届く距離（手前の遺跡を飛ばさない）
  },

  /* ---- 大ジャンプのキーフレーム（距離 m。すべてここから引く） ------------- */
  BJ: {
    RAMP0: 6, RAMP1: 46, LIP: 52, LAND: 192, END: 200,
    RAMP_H: 2.6,          // 発射台の高さ
    KICK: 0.55,           // 先端の蹴り上げ
    ARC: 3.4,             // 滑空の山（発射高さからさらにこれだけ上がる）
    ARC_PEAK: 0.34,       // 山の位置（滑空区間の割合）
    SETTLE: 9,            // 着地の沈み込みが収まるまでの距離
    SETTLE_D: 0.55        // 沈み込み量
  },

  /* ---- 区画爆発のキーフレーム（距離 m。すべてここから引く） ---------------
     大ジャンプ（BJ）と同じ形の表なので、自由飛行の仕組みをそのまま流用できる。
     発射台の勾配は無い（爆風で吹き飛ばされるので RAMP_H / KICK は 0）。 */
  BL: {
    RAMP0: 0, RAMP1: 0, LIP: 100, LAND: 176, END: 200,
    RAMP_H: 0,            // 勾配なし（吹き飛ばされる）
    KICK: 0,
    ARC: 2.4,             // 吹き飛ばされた弧
    ARC_PEAK: 0.30,
    SETTLE: 10,           // 着地の沈み込みが収まるまでの距離
    SETTLE_D: 0.70,
    /* 爆発のカット（契約§8 の決定ログ「カメラを向けるカット」） */
    SIDE0: 64, SIDE1: 94,
    BOOM: 80,             // 火球が最大になる相対距離（カットの真ん中）
    BLAST_X: -58,         // 隔壁の向こう（開放区間の外）で爆ぜる位置。
                          //   近すぎると画面が炎で埋まって「何が爆ぜたか」が読めない
                          //   （契約§8 の決定ログ: 背景を空けて輪郭で見せる）
    BLAST_Y: 2.0,
    R: 20,                // 火球の最大半径（コリドー 3.6×4.0 よりはるかに大きい）
    DEB_N: 34,            // 飛び散る破片の数
    SPIN: 2.6             // 吹き飛ばされて回る量（rad・見た目だけ）
  },

  /* 自由飛行を持つ大演出の「キーフレーム表」。id から引く唯一の窓口。
     ＝ 大ジャンプ（S2）と区画爆発（S6）が同じ仕組みを共有する。 */
  keys(st) {
    const s = (st === undefined) ? Setpieces.state : st;
    if (!s) return null;
    if (s.id === 'bigjump') return s.tbl || Setpieces.BJ;
    if (s.id === 'blastout') return Setpieces.BL;
    if (s.id === 'collapseall') return Setpieces.CA;
    return null;
  },
  airActive() { return !!Setpieces.keys(); },

  /* ---- 生成（createGenerator から呼ばれる） ------------------------------- */
  /* scale …「その地点の速度 / 基準速度」。演出の at は実寸だが、落ちる天井や
     同時スイッチの**時刻規則**はここを通して実寸の秒へ直す（§4.7 と同じ考え方）。 */
  build(id, startM, nowDist, scale, sink) {
    const d = Setpieces.DEFS[id];
    if (!d) return null;
    const items = [];
    const sc = (scale === undefined) ? 1 : scale;
    (d.floor || []).forEach((e) => expandEntry(items, e, 'floor', startM + e.at, nowDist, sc, sink));
    (d.ceil || []).forEach((e) => expandEntry(items, e, 'ceil', startM + e.at, nowDist, sc, sink));
    items.sort((a, b) => a.at - b.at);
    const events = (d.events || []).map((e) => ({ at: startM + e.at, type: e.type, params: e.params || null, done: false }));
    return { id: id, items: items, events: events, lengthM: d.lengthM, startM: startM };
  },

  /* ---- ランタイム状態 ----------------------------------------------------- */
  state: null,          // { id, startM, t, front }
  FALL_M: 22,           // 崩落前線からこの距離で完全に落ちきる（ゆっくり傾いて落ちる）
  /* 崩落前線とプレイヤーの距離。カメラを後ろへ引くので、この範囲なら
     「自分のすぐ後ろで路面が落ちていく」のが画面に映る（が、追いつきはしない）。 */
  GAP_MIN: 7,
  GAP_MAX: 16,
  CAM_BACK: 2.8,        // 演出中にカメラを後ろへ引く量（崩落を画面に入れるため）

  active() { return !!Setpieces.state; },
  id() { return Setpieces.state ? Setpieces.state.id : null; },

  /* 大演出の音（§3 音 / P6）: 予告の警告音、崩落・爆発の轟音、鏡が砕ける音 */
  SFX: {
    'collapse.start': ['warn', 'rumble'], 'bigjump.start': ['warn'], 'rock.start': ['warn', 'rumble'],
    'temple.start': ['warn', 'rumble'], 'fish.start': ['warn', 'rumble'], 'blast.start': ['warn'],
    'blast.cut': ['boom'], 'shatter.start': ['warn'], 'shatter.break': ['glass'],
    'fall.start': ['warn', 'rumble'], 'fall.launch': ['boom']
  },
  sfxFor(type) {
    const l = Setpieces.SFX[type];
    if (!l) return 0;
    l.forEach((n) => U.sfx(n));
    return l.length;
  },
  /* イベント（Game.onEvent から） */
  onEvent(e) {
    /* ミニ大演出（エンドレス / P6）の片付け: ゴールが無いので演出を残さない */
    if (e.params && e.params.mini &&
        (e.type === 'mini.end' || e.type === 'rock.end' || e.type === 'bigjump.end')) {
      const s0 = Setpieces.state;
      if (s0 && s0.mini) Setpieces.reset();
      return;
    }
    Setpieces.sfxFor(e.type);
    if (e.type === 'collapse.start') {
      Setpieces.state = Setpieces._markMini({ id: 'collapse', startM: e.at, t: 0, front: e.at - 40 }, e);
    } else if (e.type === 'collapse.end') {
      /* 終わってもゴールまで崩落は続く（前線は走り続ける） */
      if (Setpieces.state) Setpieces.state.ending = true;
    } else if (e.type === 'bigjump.start') {
      Setpieces.state = Setpieces._markMini({ id: 'bigjump', startM: e.at, t: 0, phase: 'ramp', land: 0,
                          speed: (typeof Game !== 'undefined' && Game.speed) ? Game.speed : CFG.SPEED_MIN,
                          course: null, split: -1 }, e);
      Setpieces.makeAir(e.at);
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('JUMP!', '手を繋いで跳ぶ', 'high');
    } else if (e.type === 'bigjump.launch') {
      /* 実際の切替は update()（距離の関数）が行う。イベントは合図だけ。 */
    } else if (e.type === 'bigjump.land') {
      /* 〃 */
    } else if (e.type === 'bigjump.end') {
      if (Setpieces.state) Setpieces.state.phase = 'done';
    } else if (e.type === 'rock.start') {
      Setpieces.state = Setpieces._markMini({ id: 'rockchase', startM: e.at, t: 0, penalty: 0,
                          gap: Setpieces.ROCK.GAP0, rockM: e.at - Setpieces.ROCK.GAP0, caught: false }, e);
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('BOULDER!', '巨岩が来る ／ 瓦礫は跳び越えろ');
    } else if (e.type === 'rock.cue') {
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'rock.end') {
      if (Setpieces.state) Setpieces.state.ending = true;
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'temple.start') {
      Setpieces.state = { id: 'templefall', startM: e.at, t: 0, exit: 0 };
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('COLLAPSE!', '神殿が崩れる ／ 出口へ走れ');
    } else if (e.type === 'temple.cue') {
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'temple.exit') {
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('EXIT', '崩れる出口を潜り抜けろ');
    } else if (e.type === 'temple.end') {
      if (Setpieces.state) Setpieces.state.ending = true;
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'blast.start') {
      Setpieces.state = { id: 'blastout', startM: e.at, t: 0, phase: 'ramp', land: 0,
                          speed: (typeof Game !== 'undefined' && Game.speed) ? Game.speed : CFG.SPEED_MIN,
                          course: null, split: -1 };
      Setpieces.makeAir(e.at);
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('BLAST!', '区画が爆ぜる ／ 吹き飛ばされる', 'high');
    } else if (e.type === 'blast.cut') {
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'blast.land') {
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('ALARM', '減圧警報の中を走り抜けろ');
    } else if (e.type === 'blast.end') {
      if (Setpieces.state) Setpieces.state.phase = 'done';
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'fall.start') {
      Setpieces.state = { id: 'collapseall', startM: e.at, t: 0, phase: 'ramp', land: 0,
                          front: e.at - Setpieces.CA.GAP0, gap: Setpieces.CA.GAP0,
                          speed: (typeof Game !== 'undefined' && Game.speed) ? Game.speed : CFG.SPEED_MIN,
                          course: null, split: -1 };
      Setpieces.makeAir(e.at);
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('ALL COLLAPSE!', '世界が背後から崩れる', 'high');
    } else if (e.type === 'fall.run') {
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('RUN!', '崩れる橋と落ちる天井を抜けろ');
    } else if (e.type === 'fall.launch') {
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'fall.land') {
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('ESCAPE', '出口の光へ');
    } else if (e.type === 'fall.flip') {
      /* 重力反転は Warp（距離の関数）が実行する。ここは合図だけ */
    } else if (e.type === 'fall.end') {
      if (Setpieces.state) { Setpieces.state.phase = 'done'; Setpieces.state.ending = true; }
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'shatter.start') {
      Setpieces.state = { id: 'shatter', startM: e.at, t: 0 };
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('SHATTER!', '鏡の世界が割れる', 'high');
    } else if (e.type === 'shatter.break') {
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('STEP', '揺れる鏡片へ跳べ');
    } else if (e.type === 'shatter.mirror') {
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('MIRROR', '出口の鏡へ飛び込め', 'high');
    } else if (e.type === 'shatter.end') {
      if (Setpieces.state) Setpieces.state.ending = true;
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'fish.start') {
      Setpieces.state = { id: 'megafish', startM: e.at, t: 0 };
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('LEVIATHAN!', '巨大魚が横切る', 'high');
    } else if (e.type === 'fish.cue') {
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('SWIM!', '口とヒレの隙間を抜けろ');
    } else if (e.type === 'fish.eye') {
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'fish.end') {
      if (Setpieces.state) Setpieces.state.ending = true;
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    }
  },

  /* ---- 巨大魚の通過（距離の関数。フレームに依存しない） ------------------- */
  fishActive() { const s = Setpieces.state; return !!(s && s.id === 'megafish'); },
  /* 魚の位置（世界座標。z は 2体から見た奥行き＝手前が +z）。
     見た目・照明・監査（画面占有の測定）がすべてこの1本から引く。 */
  fishPos(m) {
    const s = Setpieces.state, F = Setpieces.FISH;
    if (!s || s.id !== 'megafish') return { vis: false, x: 0, y: 0, z: 0, yaw: 0, phase: 'none' };
    const rel = m - s.startM;
    if (rel < F.SIDE0) {
      /* 予告: 左のずっと後ろに影（カットが始まると追い抜いていく） */
      return { vis: true, x: F.SIDE_X, y: F.SIDE_Y, z: F.SIDE_Z0 + (F.SIDE0 - rel) * 4,
               yaw: 0, phase: 'far' };
    }
    if (rel <= F.SIDE1) {
      /* 横向きカット: 2体の左を、後ろから前へ全身で追い抜く */
      const u = (rel - F.SIDE0) / (F.SIDE1 - F.SIDE0);
      return { vis: true, x: F.SIDE_X, y: F.SIDE_Y, z: U.lerp(F.SIDE_Z0, F.SIDE_Z1, u),
               yaw: 0, phase: 'side' };
    }
    if (rel < F.SWIM0) {
      /* カット明け: 前方左へ回り込んで並走に入る */
      const u = U.smooth(U.clamp((rel - F.SIDE1) / (F.SWIM0 - F.SIDE1), 0, 1));
      return { vis: true, x: U.lerp(F.SIDE_X, F.X_FAR, u), y: U.lerp(F.SIDE_Y, F.Y_FAR, u),
               z: U.lerp(F.SIDE_Z1, F.Z_FAR, u), yaw: U.lerp(0, -0.10, u), phase: 'turn' };
    }
    /* 並走: 左から寄ってきて、目線の高さまで下りる → 目が合う → 深みへ去る */
    const v = U.smooth(U.clamp((rel - F.SWIM0) / (F.EYE0 - F.SWIM0), 0, 1));
    const w = U.smooth(U.clamp((rel - F.EYE1) / (F.END - F.EYE1), 0, 1));
    const x = U.lerp(U.lerp(F.X_FAR, F.X_NEAR, v), -30, w);
    const y = U.lerp(U.lerp(F.Y_FAR, F.Y_NEAR, v), 8.0, w);
    const z = U.lerp(U.lerp(F.Z_FAR, F.Z_NEAR, v), -52, w);
    return { vis: true, x: x, y: y, z: z, yaw: -0.10 + 0.16 * w, phase: (w > 0.01) ? 'leave' : 'swim' };
  },

  /* 横向きカットの強さ 0..1（0→1→0。巨岩の lookBack と同じ流儀）。
     World.syncCamera がこれを読んでカメラを左へ振る。 */
  fishSideK(m) {
    const s = Setpieces.state, F = Setpieces.FISH;
    if (!s || s.id !== 'megafish') return 0;
    const rel = m - s.startM;
    if (rel <= F.SIDE0 - 4 || rel >= F.SIDE1 + 4) return 0;
    const a = F.SIDE0 - 4, b = F.SIDE1 + 4;
    /* 端で 0、真ん中で 1。振り始め・戻しがなめらかになるよう sin で包む */
    return Math.sin(Math.PI * U.clamp((rel - a) / (b - a), 0, 1));
  },

  /* 大演出の間はゾーンの区間パターンを **開放区間** に固定する（ゾーンが読む）。
     壁のある区間だと、コリドーの外にいる巨体が壁に隠れて画面に映らないため。
     ＝ 演出はゾーンを触らず「今は開けておいてほしい」とだけ答える（一方通行）。 */
  fishOpenSection(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'megafish') return false;
    const rel = m - s.startM;
    return rel > -24 && rel < Setpieces.FISH.END + 24;
  },

  /* 魚体の外接箱（世界座標）。契約§4.4 S5「魚の巨大さが画面で分かる」の測定窓口 */
  fishBox(m) {
    const F = Setpieces.FISH;
    const p = Setpieces.fishPos((m === undefined) ? (Setpieces.state ? Setpieces.state.dist : 0) : m);
    if (!p.vis) return null;
    /* 横断中は全長が x 方向、並走中は z 方向 */
    /* 向き（yaw）に合わせて外接箱を回す（斜めのカットでも実寸で測れる） */
    const c = Math.abs(Math.cos(p.yaw)), sn = Math.abs(Math.sin(p.yaw));
    const hx = (F.LEN / 2) * sn + (F.W / 2) * c;
    const hz = (F.LEN / 2) * c + (F.W / 2) * sn;
    return { x0: p.x - hx, x1: p.x + hx, y0: p.y - F.H / 2, y1: p.y + F.H / 2,
             z0: p.z - hz, z1: p.z + hz };
  },
  /* 目玉の外接箱（頭の手前側・プレイヤーに向いた面） */
  fishEyeBox(m) {
    const F = Setpieces.FISH;
    const p = Setpieces.fishPos((m === undefined) ? (Setpieces.state ? Setpieces.state.dist : 0) : m);
    if (!p.vis || p.phase === 'cross' || p.phase === 'far') return null;
    const r = 2.0;
    /* 目の位置は魚のローカル座標（横 W*0.50 / 前 -LEN*EYE_Z）。向き（yaw）を掛けて世界へ直す
       ＝ 監査で測る箱と、実際に描かれている目玉が必ず一致する。 */
    const lx = F.W * 0.50, lz = -F.LEN * F.EYE_Z;
    const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    const ex = p.x + lx * c + lz * sn;
    const ez = p.z - lx * sn + lz * c;
    const ey = p.y + F.H * 0.18;
    return { x0: ex - r, x1: ex + r, y0: ey - r, y1: ey + r, z0: ez - r, z1: ez + r };
  },
  /* 魚体が画面をどれだけ覆っているか 0..1（描いていないときは 0） */
  fishOnScreen(m) {
    const f = Setpieces.fish;
    if (!f || !f.group.visible) return 0;
    if (typeof World === 'undefined' || !World.ready) return 0;
    return World.projectCoverage(Setpieces.fishBox(m));
  },
  fishEyeOnScreen(m) {
    const f = Setpieces.fish;
    if (!f || !f.group.visible) return 0;
    if (typeof World === 'undefined' || !World.ready) return 0;
    const b = Setpieces.fishEyeBox(m);
    return b ? World.projectCoverage(b) : 0;
  },

  /* ---- 区画爆発（距離の関数。フレームに依存しない / 契約§4.4 S6） --------- */
  blastActive() { const s = Setpieces.state; return !!(s && s.id === 'blastout'); },
  /* 火球の大きさ 0..1。膨らんで、広がって、消える */
  blastK(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'blastout') return 0;
    const B = Setpieces.BL, rel = m - s.startM;
    const up = U.clamp((rel - (B.BOOM - 14)) / 14, 0, 1);
    const down = U.clamp(1 - (rel - (B.BOOM + 18)) / 44, 0, 1);
    return U.smooth(up) * down;
  },
  /* 火球の位置（世界座標。z は 2体から見た奥行き＝手前が +z）。
     見た目・照明・監査（画面占有の測定）がすべてこの1本から引く。 */
  blastPos(m) {
    const s = Setpieces.state, B = Setpieces.BL;
    if (!s || s.id !== 'blastout') return { vis: false, x: 0, y: 0, z: 0, r: 0 };
    const k = Setpieces.blastK(m);
    /* カットの間は（まだ爆ぜる前でも）区画そのものを見せる＝「何が爆ぜたか」が読める */
    return { vis: k > 0.001 || Setpieces.blastSideK(m) > 0.01, k: k,
             x: B.BLAST_X, y: B.BLAST_Y,
             z: -((s.startM + B.BOOM) - m), r: B.R * (0.25 + 0.75 * k) };
  },
  /* 火球の外接箱（契約§4.4 S6「爆発の巨大さが画面で分かる」の測定窓口） */
  blastBox(m) {
    const p = Setpieces.blastPos((m === undefined) ? (Setpieces.state ? Setpieces.state.dist : 0) : m);
    if (!p.vis) return null;
    return { x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r,
             z0: p.z - p.r, z1: p.z + p.r };
  },
  /* 炎と破片が画面をどれだけ覆っているか 0..1（描いていないときは 0） */
  blastOnScreen(m) {
    const b = Setpieces.blast;
    if (!b || !b.group.visible) return 0;
    if (typeof World === 'undefined' || !World.ready) return 0;
    const bx = Setpieces.blastBox(m);
    return bx ? World.projectCoverage(bx) : 0;
  },
  /* 横向きカットの強さ 0..1（0→1→0）。World.syncCamera がこれを読んで首を左へ振る。
     巨岩の lookBack・巨大魚の fishSideK と同じ仕組み・同じ約束（契約§8 の決定ログ）。 */
  blastSideK(m) {
    const s = Setpieces.state, B = Setpieces.BL;
    if (!s || s.id !== 'blastout') return 0;
    const rel = m - s.startM;
    if (rel <= B.SIDE0 - 4 || rel >= B.SIDE1 + 4) return 0;
    return Math.sin(Math.PI * U.clamp((rel - (B.SIDE0 - 4)) / ((B.SIDE1 + 4) - (B.SIDE0 - 4)), 0, 1));
  },
  /* カットのあいだ、回廊の小物を間引く割合 0..1（ゾーンが読む）。
     火球の輪郭を見せるには背景が要る。 */
  blastClearK(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'blastout') return 0;
    const B = Setpieces.BL, rel = m - s.startM;
    return 0.88 * U.smooth(U.clamp((rel - (B.SIDE0 - 10)) / 10, 0, 1)) *
                  U.smooth(U.clamp(((B.SIDE1 + 6) - rel) / 12, 0, 1));
  },
  /* 火球が回廊を照らす強さ 0..1（ゾーンが読む） */
  blastLightK(m) { return Setpieces.blastK(m); },
  /* 大演出の間はゾーンの区間パターンを **開放区間** に固定する（ゾーンが読む）。
     壁があると、隣の区画で起きる爆発が隠れて画面に映らない。 */
  blastOpenSection(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'blastout') return false;
    const rel = m - s.startM;
    return rel > -24 && rel < Setpieces.BL.END + 24;
  },
  /* 吹き飛ばされた DUO体の回転（見た目だけ・契約§4.4「回転しながら」） */
  blastSpin(m) {
    const s = Setpieces.state, B = Setpieces.BL;
    if (!s || s.id !== 'blastout') return 0;
    const rel = m - s.startM;
    if (rel < B.LIP) return 0;
    const u = U.clamp((rel - B.LIP) / (B.LAND - B.LIP), 0, 1);
    /* 飛び出しで一気に回り、着地に向けて姿勢が戻る */
    return B.SPIN * Math.sin(Math.PI * u) * (1 - u * 0.25);
  },

  /* ---- 全崩壊エスケープ（距離の関数。フレームに依存しない / 契約§4.4 S8） -- */
  fallActive() { const s = Setpieces.state; return !!(s && s.id === 'collapseall'); },
  _frel(m) {
    const s = Setpieces.state;
    return (s && s.id === 'collapseall') ? (m - s.startM) : null;
  },
  /* 振り返りカットの強さ 0..1（0→1→0）。World.syncCamera がこれを読んで背後を向く。
     巨岩の lookBack と同じ仕組み・同じ約束（契約§8 の決定ログ）。 */
  fallBackK(m) {
    const rel = Setpieces._frel(m);
    if (rel === null) return 0;
    let k = 0;
    for (let i = 0; i < Setpieces.CA.BACK.length; i++) {
      const w = Setpieces.CA.BACK[i];
      if (rel > w[0] && rel < w[1]) k = Math.max(k, Math.sin(Math.PI * (rel - w[0]) / (w[1] - w[0])));
    }
    return k;
  },
  fallBackCut(m) {
    const rel = Setpieces._frel(m);
    if (rel === null) return -1;
    for (let i = 0; i < Setpieces.CA.BACK.length; i++) {
      const w = Setpieces.CA.BACK[i];
      if (rel > w[0] && rel < w[1]) return i;
    }
    return -1;
  },
  /* 崩落前線との距離（m）。演出なので**絶対に追いつかない** */
  fallGap() { const s = Setpieces.state; return (s && s.id === 'collapseall') ? s.gap : Infinity; },
  /* 迫られている度合い 0..1（カメラ揺れ・明かり・霧に使う） */
  fallProx(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'collapseall') return 0;
    const C = Setpieces.CA;
    return U.clamp(1 - (s.gap - C.GAP1) / (C.GAP0 - C.GAP1), 0, 1);
  },
  /* 崩落の壁の外接箱（世界座標）。カットの可視性の測定窓口 */
  fallBox(m) {
    const s = Setpieces.state, C = Setpieces.CA;
    if (!s || s.id !== 'collapseall') return null;
    const z = s.gap;
    return { x0: -C.WALL_W / 2, x1: C.WALL_W / 2,
             y0: CFG.H / 2 - C.WALL_H / 2, y1: CFG.H / 2 + C.WALL_H / 2,
             z0: z - C.WALL_D / 2, z1: z + C.WALL_D / 2 };
  },
  /* 崩落の壁が画面をどれだけ覆っているか 0..1（描いていないときは 0） */
  fallOnScreen(m) {
    const f = Setpieces.fall;
    if (!f || !f.wall.visible) return 0;
    if (typeof World === 'undefined' || !World.ready) return 0;
    const b = Setpieces.fallBox(m);
    return b ? World.projectCoverage(b) : 0;
  },
  /* 大演出の間はゾーンの区間パターンを **開放区間** に固定する（ゾーンが読む）。
     壁があると、背後の崩落と出口の光が隠れて画面に映らない。 */
  fallOpenSection(m) {
    const rel = Setpieces._frel(m);
    return rel !== null && rel > -24 && rel < Setpieces.CA.END + 24;
  },
  /* 振り返りカットのあいだ、回廊の小物を間引く割合 0..1（ゾーンが読む） */
  fallClearK(m) {
    const k = Setpieces.fallBackK(m);
    return 0.85 * U.smooth(U.clamp(k * 1.4, 0, 1));
  },
  /* 崩落前線の火が回廊を照らす強さ 0..1（ゾーンが読む） */
  fallLightK(m) {
    const rel = Setpieces._frel(m);
    if (rel === null) return 0;
    return U.clamp(0.35 + 0.65 * Setpieces.fallProx(m), 0, 1);
  },
  /* 出口の光 0..1（崩落を抜けて外へ / 契約§4.4「…→着地→出口の光へ」） */
  fallExit(m) {
    const rel = Setpieces._frel(m);
    if (rel === null) return 0;
    const C = Setpieces.CA;
    return U.clamp((rel - C.EXIT0) / (C.END - C.EXIT0), 0, 1);
  },
  /* 放り出された DUO体の回転（見た目だけ・契約§4.4「回転しながら」） */
  fallSpin(m) {
    const s = Setpieces.state, C = Setpieces.CA;
    if (!s || s.id !== 'collapseall') return 0;
    const rel = m - s.startM;
    if (rel < C.LIP) return 0;
    const u = U.clamp((rel - C.LIP) / (C.LAND - C.LIP), 0, 1);
    return C.SPIN * Math.sin(Math.PI * u) * (1 - u * 0.25);
  },

  /* ---- 鏡の砕け散り（距離の関数。フレームに依存しない / 契約§4.4 S7） ----- */
  shatterActive() { const s = Setpieces.state; return !!(s && s.id === 'shatter'); },
  _mrel(m) {
    const s = Setpieces.state;
    return (s && s.id === 'shatter') ? (m - s.startM) : null;
  },
  /* ひびの強さ 0..1（世界が割れる予告。音は鳴らさない＝契約§6 P5a） */
  shatterCrackK(m) {
    const rel = Setpieces._mrel(m);
    if (rel === null) return 0;
    const R = Setpieces.MR;
    return U.clamp((rel - R.CRACK0) / (R.CRACK1 - R.CRACK0), 0, 1) *
           U.clamp(1 - (rel - R.BREAK0) / 10, 0, 1);
  },
  /* 砕けの進み具合 0..1（床と天井が鏡片になって浮く） */
  shatterBreakK(m) {
    const rel = Setpieces._mrel(m);
    if (rel === null) return 0;
    const R = Setpieces.MR;
    return U.smooth(U.clamp((rel - R.BREAK0) / (R.BREAK1 - R.BREAK0), 0, 1));
  },
  /* 鏡片が集まって大鏡になる度合い 0..1 */
  shatterGatherK(m) {
    const rel = Setpieces._mrel(m);
    if (rel === null) return 0;
    const R = Setpieces.MR;
    return U.smooth(U.clamp((rel - R.GATHER0) / (R.GATHER1 - R.GATHER0), 0, 1));
  },
  /* 出口の大鏡へカメラを向けるカットの強さ 0..1（0→1→0）。World.syncCamera が読む。
     巨岩の lookBack・巨大魚/爆発の lookSide と同じ仕組み・同じ約束（契約§8 の決定ログ）。 */
  mirrorCutK(m) {
    const rel = Setpieces._mrel(m);
    if (rel === null) return 0;
    const R = Setpieces.MR;
    if (rel <= R.CUT0 || rel >= R.CUT1) return 0;
    return Math.sin(Math.PI * U.clamp((rel - R.CUT0) / (R.CUT1 - R.CUT0), 0, 1));
  },
  /* 出口の大鏡の外接箱（世界座標）。カットの可視性の測定窓口 */
  mirrorBox(m) {
    const s = Setpieces.state, R = Setpieces.MR;
    if (!s || s.id !== 'shatter') return null;
    const k = Setpieces.shatterGatherK(m);
    if (k <= 0.02) return null;
    const z = -((s.startM + R.MIRROR_AT) - m);
    const w = R.MIRROR_W * (0.5 + 0.5 * k), h = R.MIRROR_H * (0.5 + 0.5 * k);
    return { x0: -w / 2, x1: w / 2, y0: CFG.H / 2 - h / 2, y1: CFG.H / 2 + h / 2,
             z0: z - 0.4, z1: z + 0.4 };
  },
  /* 大鏡が画面をどれだけ覆っているか 0..1（描いていないときは 0） */
  mirrorOnScreen(m) {
    const g = Setpieces.shatter;
    if (!g || !g.group.visible) return 0;
    if (typeof World === 'undefined' || !World.ready) return 0;
    const b = Setpieces.mirrorBox(m);
    return b ? World.projectCoverage(b) : 0;
  },
  /* 大演出の間はゾーンの区間パターンを **開放区間** に固定する（ゾーンが読む）。
     壁があると、砕けて浮かぶ鏡片と出口の大鏡が隠れて画面に映らない。 */
  shatterOpenSection(m) {
    const rel = Setpieces._mrel(m);
    return rel !== null && rel > -24 && rel < Setpieces.MR.END + 24;
  },
  /* 鏡へ向くカットのあいだ、回廊の小物を間引く割合 0..1（ゾーンが読む） */
  shatterClearK(m) {
    const rel = Setpieces._mrel(m);
    if (rel === null) return 0;
    const R = Setpieces.MR;
    return 0.80 * U.smooth(U.clamp((rel - (R.CUT0 - 10)) / 12, 0, 1));
  },
  /* 砕けた鏡片と大鏡が回廊を照らす強さ 0..1（ゾーンが読む） */
  shatterLightK(m) {
    const rel = Setpieces._mrel(m);
    if (rel === null) return 0;
    return Math.max(Setpieces.shatterBreakK(m) * 0.5, Setpieces.shatterGatherK(m));
  },
  /* 路面タイルを「浮いた鏡片」にする（World.syncCorridor から。見た目だけ）。
     砕けの進み具合（距離の関数）で浮き上がり・傾き・横揺れを決めるので、
     同じ距離には必ず同じ姿＝判定（SHARDGAP）とのズレは生まれない。 */
  tileShard(atM, surface, lane) {
    const s = Setpieces.state;
    if (!s || s.id !== 'shatter') return null;
    const R = Setpieces.MR, rel = atM - s.startM;
    if (rel < R.BREAK0 || rel > R.STONE1 + 14) return null;
    const k = U.smooth(U.clamp((rel - R.BREAK0) / (R.BREAK1 - R.BREAK0), 0, 1)) *
              U.clamp((R.STONE1 + 14 - rel) / 14, 0, 1);
    if (k <= 0.001) return null;
    const h = ZoneKit.hash(Math.round(atM * 3) + lane * 7 + (surface === 'ceil' ? 131 : 0), 733);
    const h2 = ZoneKit.hash(Math.round(atM * 3) + lane * 11 + (surface === 'ceil' ? 17 : 0), 739);
    /* **ずらす量は小さく**（±0.12・傾き ±0.18rad）。大きく浮かせたり回したりすると、
       割れた天井のかけらが回廊へ垂れ込んで **飛び石の道筋が読めなくなる**（P5a 監査）。
       「割れて少し浮いている」だけで、砕けた床・天井としては十分に読める。 */
    const up = (surface === 'floor') ? -1 : 1;
    return { dx: (h - 0.5) * 0.22 * k,
             dy: up * (0.02 + h2 * 0.10) * k,
             rx: (h - 0.5) * 0.18 * k, rz: (h2 - 0.5) * 0.22 * k };
  },

  /* ---- 神殿崩壊（距離の関数。フレームに依存しない） ----------------------- */
  templeActive() { const s = Setpieces.state; return !!(s && s.id === 'templefall'); },
  /* 出口の光 0..1（霧が晴れて外の光が差す） */
  templeExit(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'templefall') return 0;
    const T = Setpieces.TEMPLE;
    return U.clamp((m - s.startM - T.EXIT0) / (T.END - T.EXIT0), 0, 1);
  },
  /* 崩壊の激しさ 0..1（出口に近づくと収まる） */
  templeRage(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'templefall') return 0;
    const rel = m - s.startM;
    return U.clamp(rel / 26, 0, 1) * (1 - Setpieces.templeExit(m) * 0.85);
  },
  /* i 本目の倒れる柱（見た目）: 倒れ始める距離と、倒れ具合 0..1 */
  templeColumnAt(i) {
    const s = Setpieces.state, T = Setpieces.TEMPLE;
    return (s ? s.startM : 0) + T.COL_FROM + i * T.COL_STEP;
  },
  templeColumnK(i, dist) {
    const T = Setpieces.TEMPLE;
    const at = Setpieces.templeColumnAt(i);
    return U.clamp((dist - (at - T.COL_LEAD)) / T.COL_FALL, 0, 1);
  },
  /* 「今まさに倒れている柱」（契約§6 P3b「倒れる柱が前方で見える」の測定窓口）。
     見つからなければ null。box は世界座標（World.projectCoverage / projectRect に渡す）。 */
  templeColumns(dist) {
    const s = Setpieces.state, T = Setpieces.TEMPLE;
    const out = [];
    if (!s || s.id !== 'templefall') return out;
    for (let i = 0; i < T.COL_N; i++) {
      const k = Setpieces.templeColumnK(i, dist);
      if (k <= 0.001 || k >= 0.999) continue;
      const at = Setpieces.templeColumnAt(i);
      const z = -(at - dist);
      const side = (i % 2) ? 1 : -1;
      const ang = U.smooth(k) * 1.48;
      const hx = T.COL_R + 0.12;
      /* 根元を軸に前方（+z＝カメラ側）へ倒れる。x はほぼ固定で、y と z が振れる */
      const ty = T.COL_H * Math.cos(ang), tz = T.COL_H * Math.sin(ang);
      out.push({ i: i, k: k, at: at, side: side,
                 box: { x0: side * T.COL_X - hx, x1: side * T.COL_X + hx,
                        y0: Math.min(0, ty) - hx, y1: Math.max(0.2, ty) + hx,
                        z0: z + Math.min(0, tz) - hx, z1: z + Math.max(0, tz) + hx } });
    }
    return out;
  },
  /* 今いちばん倒れている柱（倒れ具合が最大＝いちばん近い） */
  templeColumn(dist) {
    const list = Setpieces.templeColumns(dist);
    let best = null;
    for (let i = 0; i < list.length; i++) if (!best || list[i].k > best.k) best = list[i];
    return best;
  },
  /* 倒れている柱が画面をどれだけ覆っているか（0 = 1本も映っていない）。
     契約§6 P3b「画面で崩壊が分かること」の測定窓口 */
  templeOnScreen(dist) {
    if (typeof World === 'undefined' || !World.ready) return 0;
    const m = (dist === undefined) ? (Setpieces.state ? Setpieces.state.dist : 0) : dist;
    const list = Setpieces.templeColumns(m);
    let best = 0;
    for (let i = 0; i < list.length; i++) best = Math.max(best, World.projectCoverage(list[i].box));
    return best;
  },

  /* ---- 巨岩の追跡（距離の関数。フレームに依存しない） --------------------- */
  rockActive() { const s = Setpieces.state; return !!(s && s.id === 'rockchase'); },
  /* 振り返りカットの強さ 0..1（0→1→0 で振り返って戻る）。World.syncCamera が読む */
  lookBack(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'rockchase') return 0;
    const rel = m - s.startM;
    const LB = (s.tbl && s.tbl.LOOKBACK) || Setpieces.ROCK.LOOKBACK;
    let k = 0;
    for (let i = 0; i < LB.length; i++) {
      const w = LB[i];
      if (rel > w[0] && rel < w[1]) k = Math.max(k, Math.sin(Math.PI * (rel - w[0]) / (w[1] - w[0])));
    }
    return k;
  },
  /* 今どちらの振り返りカットか（-1 = カット外）。カットごとに構図を変える */
  lookBackCut(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'rockchase') return -1;
    const rel = m - s.startM;
    const LB = (s.tbl && s.tbl.LOOKBACK) || Setpieces.ROCK.LOOKBACK;
    for (let i = 0; i < LB.length; i++) {
      const w = LB[i];
      if (rel > w[0] && rel < w[1]) return i;
    }
    return -1;
  },
  /* 巨岩との距離（m）。詰まりきると押し潰される */
  rockGap() { const s = Setpieces.state; return (s && s.id === 'rockchase') ? s.gap : Infinity; },
  /* 迫られている度合い 0..1（カメラ揺れ・影・霧に使う） */
  rockProx() {
    const s = Setpieces.state;
    if (!s || s.id !== 'rockchase') return 0;
    const R = Setpieces.ROCK;
    return U.clamp(1 - (s.gap - R.DEATH) / (R.GAP0 - R.DEATH), 0, 1);
  },

  /* ---- 大ジャンプの状態（距離の関数。フレームに依存しない） --------------- */
  /* 演出開始からの相対距離 */
  _rel(m) {
    const s = Setpieces.state;
    return (s && Setpieces.keys(s)) ? (m - s.startM) : null;
  },
  /* 滑空中か（＝レーンも床/天井も無い自由飛行の区間・契約§4.5 改訂） */
  glideActive() {
    const s = Setpieces.state;
    return !!(s && Setpieces.keys(s) && s.phase === 'glide');
  },

  /* ---- DUO体（2人が手を繋いだ1体 / 契約§4.5 2026-09-21 改訂） ------------
     0 = 別々の2体 ／ 1 = 完全に合体。発射台の手前 0.4秒で 0→1、着地後 0.3秒で 1→0。 */
  duoK(m) {
    const s = Setpieces.state;
    const B = Setpieces.keys(s);
    if (!s || !B) return 0;
    const rel = m - s.startM, sp = Math.max(4, s.speed || CFG.SPEED_MIN);
    if (rel < B.LIP) return U.clamp(1 - (B.LIP - rel) / (sp * FF.MERGE_T), 0, 1);
    if (rel < B.LAND) return 1;
    return U.clamp(1 - (rel - B.LAND) / (sp * FF.SPLIT_T), 0, 1);
  },
  /* 合体〜分離の間は通常の操作を受け付けない（演出中） */
  duoLocked() {
    return Setpieces.duoK((typeof Game !== 'undefined') ? Game.dist : 0) > 0.001;
  },

  /* ---- 自由飛行の譜面（シード固定・ゾーン非依存） ------------------------ */
  buildAir(seed, startM, speedAt) {
    const B = Setpieces.keys() || Setpieces.BJ;
    return FF.build(seed, startM + B.LIP, startM + B.LAND, speedAt);
  },
  makeAir(startM) {
    const st = (typeof Game !== 'undefined' && Game.stage) ? Game.stage : null;
    const speedAt = st ? st.speedAt : function () { return CFG.SPEED_MIN; };
    const base = (typeof Game !== 'undefined' ? (Game.seed >>> 0) : 1);
    const seed = ((base ^ Math.imul(Math.round(startM) + 1, 2654435761)) >>> 0) || 1;
    const c = Setpieces.buildAir(seed, startM, speedAt);
    if (Setpieces.state) Setpieces.state.course = c;
    return c;
  },
  /* 着地の強制分離（契約§4.5「DUO体の x に最も近いレーンへ2人が戻る」） */
  landing(game) {
    const lane = FF.landingLane();
    FF.end();
    game.runners.forEach((r) => {
      r.laneFrom = lane; r.laneTo = lane; r.laneVal = lane; r.laneT = CFG.LANE_T;
      r.act = 'run'; r.actT = 0; r.laneBuf = 0;
    });
    if (Setpieces.state) Setpieces.state.landLane = lane;
    if (typeof HUD !== 'undefined') {
      if (HUD.cueHide) HUD.cueHide();
      if (HUD.freeFlight) HUD.freeFlight(false);
    }
    return lane;
  },
  /* コリドー（路面・天井面・障害物・2体・カメラ）の持ち上がり量。見た目だけ。
     **同じ距離には必ず同じ値**なので、2体と障害物のズレは生まれない。 */
  viewLift(m) {
    const rel = Setpieces._rel(m);
    if (rel === null) return 0;
    const B = Setpieces.keys();
    if (rel <= B.RAMP0) return 0;
    if (rel <= B.RAMP1) return B.RAMP_H * U.smooth((rel - B.RAMP0) / (B.RAMP1 - B.RAMP0));
    if (rel <= B.LIP) return B.RAMP_H + B.KICK * (rel - B.RAMP1) / (B.LIP - B.RAMP1);
    if (rel <= B.LAND) {
      const u = (rel - B.LIP) / (B.LAND - B.LIP);
      const h0 = B.RAMP_H + B.KICK, top = h0 + B.ARC, p = B.ARC_PEAK;
      return (u < p) ? U.lerp(h0, top, U.smooth(u / p))
                     : top * (1 - U.smooth((u - p) / (1 - p)));
    }
    if (rel <= B.LAND + B.SETTLE) {
      const k = (rel - B.LAND) / B.SETTLE;                 // 着地の沈み込み→戻り
      return -B.SETTLE_D * Math.sin(Math.PI * k) * Math.exp(-2.2 * k);
    }
    return 0;
  },
  /* その距離に路面／天井面があるか（滑空区間はビルとビルの間＝何もない） */
  tileHidden(m) {
    const rel = Setpieces._rel(m);
    if (rel === null) return false;
    const B = Setpieces.keys();
    return rel > B.LIP && rel < B.LAND;
  },
  /* 発射台の点滅ライン（予告）の強さ 0..1。
     区画爆発（S6）には発射台が無い（爆風で飛ばされる）ので出さない。 */
  rampCue(m) {
    const rel = Setpieces._rel(m);
    if (rel === null) return 0;
    const s = Setpieces.state;
    if (s && s.id !== 'bigjump') return 0;
    const B = Setpieces.keys(s) || Setpieces.BJ;
    if (rel < -6 || rel > B.LIP) return 0;
    return U.clamp(1 - Math.abs(rel - B.RAMP1) / B.RAMP1, 0, 1);
  },

  /* 毎フレーム（Game.step の中から。dt は演出時間） */
  update(game, dt) {
    const s = Setpieces.state;
    if (!s) return;
    s.t += dt;
    s.dist = game.dist;                       // 距離基準の判定に使う（glideActive など）
    if (Setpieces.keys(s)) {
      const B = Setpieces.keys(s);
      const rel = game.dist - s.startM;
      s.speed = game.speed;
      const prev = s.phase;
      s.phase = (rel < B.LIP) ? 'ramp'
              : (rel < B.LAND) ? 'glide'
              : (rel < B.END) ? 'land' : 'done';
      if (s.phase === 'glide' && prev !== 'glide') {
        /* 発射: DUO体の自由飛行へ（入力モードもここで切り替わる） */
        if (!s.course) Setpieces.makeAir(s.startM);
        FF.begin(s.course, 0, CFG.H / 2);
        if (typeof HUD !== 'undefined') {
          if (HUD.cue) HUD.cue('FREE FLIGHT', '画面をドラッグ', 'high');
          if (HUD.freeFlight) HUD.freeFlight(true);
        }
        s.cueOff = rel + Math.max(12, game.speed * 1.6);
      }
      if (s.phase === 'glide') {
        FF.update(dt);
        if (s.cueOff && rel > s.cueOff) { s.cueOff = 0; if (typeof HUD !== 'undefined') HUD.cueHide(); }
      } else if (prev === 'glide') {
        Setpieces.landing(game);                  // 着地で強制分離（契約§4.5）
      }
      if (s.phase === 'land') s.land = rel - B.LAND;
      /* 全崩壊エスケープ（§4.4 S8）: 崩落前線は背後を追ってくる（追いつきはしない）。
         位置は走行距離の関数＋ゆらぎで、**後退はさせない**（崩れた床は戻らない）。 */
      if (s.id === 'collapseall') {
        const C = Setpieces.CA;
        const base = U.lerp(C.GAP0, C.GAP1, U.smooth(U.clamp(rel / C.CLOSE_M, 0, 1)))
                   + C.SWAY * Math.sin(s.t * 1.15);
        s.gap = Math.max(C.GAP1 * 0.8, base);
        s.front = Math.max(s.front, game.dist - s.gap);
      }
      return;
    }
    if (s.id === 'rockchase') {
      const R = Setpieces.ROCK;
      const rel = game.dist - s.startM;
      /* 基本の距離（近づいてくる）＋ゆらぎ */
      const closeM = (s.tbl && s.tbl.CLOSE_M) || R.CLOSE_M;
      const base = U.lerp(R.GAP0, R.GAP1, U.smooth(U.clamp(rel / closeM, 0, 1)))
                 + R.SWAY * Math.sin(s.t * 1.25);
      /* 減速帯で失った距離を「遅れ」として貯める（ゆっくりだけ回復する） */
      const nominal = game.stage.speedAt(game.dist);
      s.penalty += Math.max(0, nominal - game.speed) * dt;
      s.penalty = Math.max(0, s.penalty - R.RECOVER * dt);
      s.gap = Math.max(0, base - s.penalty);
      s.rockM = game.dist - s.gap;                 // 巨岩の位置（走行距離の座標系）
      if (s.gap <= R.DEATH && !s.caught) {
        s.caught = true;
        if (game.onCrush) game.onCrush();
      }
      return;
    }
    if (s.id === 'templefall') {
      s.exit = Setpieces.templeExit(game.dist);
      s.rage = Setpieces.templeRage(game.dist);
      return;
    }
    if (s.id === 'megafish') {
      /* 位置も演出量もすべて距離の関数（fishPos）なので、ここでは何も溜めない */
      return;
    }
    if (s.id === 'shatter') {
      /* 砕け散りもすべて距離の関数（shatterBreakK など）なので、ここでは何も溜めない */
      return;
    }
    /* 崩落前線はプレイヤーの後ろを上下しながら追う（演出＝絶対に追いつかない） */
    const amp = (Setpieces.GAP_MAX - Setpieces.GAP_MIN) / 2;
    const mid = (Setpieces.GAP_MAX + Setpieces.GAP_MIN) / 2;
    const want = game.dist - (mid + amp * Math.cos(s.t * 0.9));
    /* ミニ版（エンドレス）は終わったら前線を止める（走り去る＝崩落が遠のく） */
    if (s.mini && s.ending) return;
    /* 後退はさせない（崩れた路面が戻るのはおかしい） */
    s.front = Math.max(s.front, want);
  },

  /* 前方の路面の「揺れ」（崩落が迫っている感じ。落とさない＝公平性に影響しない） */
  tileShake(atM, dist) {
    const s = Setpieces.state;
    if (s && s.id === 'bigjump') {
      /* 発射台に近づくと路面が震える＋着地の瞬間に強く揺れる */
      const rel = atM - s.startM, B = Setpieces.keys(s) || Setpieces.BJ;
      if (rel > B.RAMP0 - 20 && rel < B.LIP) return 0.03 * Math.sin(s.t * 30 + atM * 1.9);
      if (s.phase === 'land' && s.land < B.SETTLE) {
        return 0.09 * (1 - s.land / B.SETTLE) * Math.sin(s.t * 42 + atM * 2.4);
      }
      return 0;
    }
    if (s && s.id === 'rockchase') {
      /* 巨岩が近いほど前方の石畳まで震える（落とさないので公平性には影響しない） */
      const p = Setpieces.rockProx();
      const ahead = atM - dist;
      if (ahead < -4 || ahead > 40) return 0;
      return (0.012 + 0.05 * p) * (1 - U.clamp(ahead / 40, 0, 1)) * Math.sin(s.t * 31 + atM * 2.1);
    }
    if (s && s.id === 'blastout') {
      /* 爆発の衝撃で回廊が震える（落とさないので公平性には影響しない） */
      const k = Setpieces.blastK(dist);
      const ahead = atM - dist;
      if (ahead < -6 || ahead > 60) return 0;
      return (0.010 + 0.075 * k) * (1 - U.clamp(ahead / 60, 0, 1)) * Math.sin(s.t * 34 + atM * 2.0);
    }
    if (s && s.id === 'megafish') {
      /* 巨大魚が追い抜くとき、押された水で床と天井が波打つ（落とさない） */
      const side = Setpieces.fishSideK(dist);
      const ahead = atM - dist;
      if (ahead < -6 || ahead > 56) return 0;
      return (0.008 + 0.05 * side) * (1 - U.clamp(ahead / 56, 0, 1)) * Math.sin(s.t * 22 + atM * 1.8);
    }
    if (s && s.id === 'collapseall') {
      /* 全崩壊: 背後の崩落が近いほど前方の床と天井まで震える（落とさない） */
      const p = Setpieces.fallProx(dist);
      const ahead = atM - dist;
      if (ahead < -6 || ahead > 54) return 0;
      return (0.014 + 0.065 * p) * (1 - U.clamp(ahead / 54, 0, 1)) * Math.sin(s.t * 32 + atM * 2.1);
    }
    if (s && s.id === 'shatter') {
      /* 鏡の砕け散り: 割れていく床と天井が震える（落とさない＝公平性に影響しない） */
      const k = Math.max(Setpieces.shatterCrackK(dist), Setpieces.shatterBreakK(dist) * 0.7);
      const ahead = atM - dist;
      if (ahead < -6 || ahead > 58) return 0;
      return (0.008 + 0.055 * k) * (1 - U.clamp(ahead / 58, 0, 1)) * Math.sin(s.t * 27 + atM * 2.2);
    }
    if (s && s.id === 'templefall') {
      /* 神殿崩壊: 前方の床と天井が地響きで震える（落とさない＝公平性に影響しない） */
      const r = Setpieces.templeRage(dist);
      const ahead = atM - dist;
      if (ahead < -6 || ahead > 52) return 0;
      return (0.010 + 0.055 * r) * (1 - U.clamp(ahead / 52, 0, 1)) * Math.sin(s.t * 29 + atM * 2.3);
    }
    if (!s || s.id !== 'collapse' || atM < s.front) return 0;
    const ahead = atM - dist;
    if (ahead < -2 || ahead > 46) return 0;
    const k = 1 - U.clamp(ahead / 46, 0, 1);
    return k * 0.035 * Math.sin(s.t * 26 + atM * 1.7);
  },

  /* 路面タイルの落下量 0..1（World.syncCorridor から。1 で消える） */
  tileFall(atM, surface, lane) {
    const s = Setpieces.state;
    /* 全崩壊エスケープ（§4.4 S8）も同じ仕組み＝崩落前線より後ろの路面が落ちる */
    if (!s || (s.id !== 'collapse' && s.id !== 'collapseall')) return 0;
    if (atM >= s.front) return 0;
    /* タイルごとに少しずつ落ち始めをずらす（一斉に落ちると板っぽい） */
    const h = Math.abs(Math.sin(atM * 12.9898 + lane * 4.1414 + (surface === 'ceil' ? 2.7 : 0))) % 1;
    const d = (s.front - atM) - h * 5;
    if (d <= 0) return 0;
    return U.clamp(d / Setpieces.FALL_M, 0, 1);
  },

  /* カメラ・霧の演出量（World から読む） */
  /* ミニ版（エンドレス / P6）は霧をそのゾーンの色に合わせ、終わり際に演出を抜いていく */
  camFx() {
    const fx = Setpieces._camFx();
    const s = Setpieces.state;
    if (!fx || !s || !s.mini) return fx;
    const base = (typeof World !== 'undefined' && World._fogBase) ? World._fogBase : null;
    if (!base) return fx;
    fx.fogColor = base.color;
    if (s.id === 'bigjump') fx.fogFar = U.lerp(base.far, Math.max(base.far, 210), fx.glide || 0);
    else if (s.id === 'rockchase') fx.fogFar = U.lerp(base.far, base.far * 0.78, fx.prox || 0);
    else fx.fogFar = base.far * 0.85;
    if (s.ending && s.endM !== undefined) {
      const m = s.dist || s.endM;
      const e = U.clamp((m - s.endM) / (26 * (s.k || 1)), 0, 1);
      fx.shake *= (1 - e); fx.fovAdd *= (1 - e); fx.camBack = (fx.camBack || 0) * (1 - e);
      fx.fogFar = U.lerp(fx.fogFar, base.far, e);
    }
    return fx;
  },
  _camFx() {
    const s = Setpieces.state;
    if (!s) return null;
    if (s.id === 'bigjump') {
      const B = Setpieces.keys(s) || Setpieces.BJ, rel = (s.dist || s.startM) - s.startM;
      const lift = Setpieces.viewLift(s.dist || s.startM);
      /* 滑空の強さ 0..1（発射で立ち上がり、着地で落とす） */
      const g = (s.phase === 'glide')
        ? U.clamp((rel - B.LIP) / 14, 0, 1) * U.clamp((B.LAND - rel) / 10, 0, 1)
        : 0;
      const impact = (s.phase === 'land') ? Math.max(0, 1 - s.land / B.SETTLE) : 0;
      return {
        shake: 0.16 * impact * (0.6 + 0.4 * Math.sin(s.t * 41)) + 0.012 * g,
        fovAdd: 8 * g + 3 * impact,                       // 契約§4.4「FOV+8°」
        camBack: 1.6 * g,
        /* 眼下に街を広げるため、カメラを少し上げて視線を下げる（俯角） */
        camUp: lift + 0.62 * g,
        lookUp: lift - 0.95 * g,
        fogFar: U.lerp(104, 210, g),                      // 遠くまで見える＝高さが出る
        fogColor: g > 0.02 ? 0x2b3a86 : 0x1e2a5e,
        glide: g
      };
    }
    if (s.id === 'blastout') {
      const B = Setpieces.BL, m = s.dist || s.startM, rel = m - s.startM;
      const lift = Setpieces.viewLift(m);
      /* 滑空の強さ（吹き飛ばされてから着地まで）と、着地の衝撃 */
      const g = (s.phase === 'glide')
        ? U.clamp((rel - B.LIP) / 14, 0, 1) * U.clamp((B.LAND - rel) / 10, 0, 1)
        : 0;
      const impact = (s.phase === 'land') ? Math.max(0, 1 - s.land / B.SETTLE) : 0;
      const k = Setpieces.blastK(m);
      const side = Setpieces.blastSideK(m);
      /* 爆発の熱で霧の色がわずかに焦げる（宇宙の闇＋炎の照り返し） */
      const col = new THREE.Color(0x03040a).lerp(new THREE.Color(0x2c1208), U.clamp(k * 0.9, 0, 1));
      return {
        shake: 0.016 + 0.125 * k * (0.6 + 0.4 * Math.sin(s.t * 33))
             + 0.17 * impact * (0.6 + 0.4 * Math.sin(s.t * 41)) + 0.012 * g,
        fovAdd: 3 + 7 * g + 4 * impact + 5 * k,
        camBack: 1.4 * g,
        camUp: lift + 0.50 * g + 0.18 * side,
        lookUp: lift - 0.70 * g,
        /* 宇宙は透明＝遠くまで開ける（カット中と滑空中はさらに開く） */
        fogFar: U.lerp(96, 210, Math.max(g, side * 0.8)),
        fogColor: col.getHex(),
        glide: g,
        /* 横向きカット（§4.4 S6）: World.syncCamera がこれを読んで首を左へ振る */
        lookSide: side,
        blast: k
      };
    }
    if (s.id === 'rockchase') {
      const p = Setpieces.rockProx();
      const lb = Setpieces.lookBack(s.dist || s.startM);
      return {
        shake: 0.018 + 0.075 * p * (0.7 + 0.3 * Math.sin(s.t * 27)),
        fovAdd: 3 + 5 * p,
        camBack: 0,
        /* 前寄り・やや俯角（遺跡の奥行きを見せつつ、振り返りで巨岩を正面に入れる） */
        camUp: 0.35 + 0.25 * p,
        lookUp: -0.25 - 0.2 * p,
        fogFar: U.lerp(92, 70, p),
        fogColor: 0x6a4a22,                               // 舞い上がる土煙
        glide: 0,
        lookBack: lb,
        lookBackCut: Setpieces.lookBackCut(s.dist || s.startM),
        prox: p
      };
    }
    if (s.id === 'templefall') {
      const m = s.dist || s.startM;
      const q = Setpieces.templeExit(m), r = Setpieces.templeRage(m);
      /* 外へ抜けるほど霧が晴れて明るくなる（黄土色 → 外光の白） */
      const c = new THREE.Color(0x4a3418).lerp(new THREE.Color(0xffd9a0), q);
      return {
        shake: 0.016 + 0.062 * r * (0.7 + 0.3 * Math.sin(s.t * 26)),
        fovAdd: 3 + 4 * r + 7 * q,
        camBack: 0,
        camUp: 0.30 + 0.22 * r,
        lookUp: -0.22 - 0.16 * r + 0.5 * q,
        /* 外へ抜けるほど霧が晴れる。遠景まで開けすぎない（神殿の中なので視線は出口の光へ集める。
           霧の far は「どこまで障害物を描くか」にも効くので、ドローコールの天井とも釣り合わせる） */
        fogFar: U.lerp(72, 104, q),
        fogColor: c.getHex(),
        glide: 0,
        rage: r, exit: q
      };
    }
    if (s.id === 'collapseall') {
      const C = Setpieces.CA, m = s.dist || s.startM, rel = m - s.startM;
      const lift = Setpieces.viewLift(m);
      const g = (s.phase === 'glide')
        ? U.clamp((rel - C.LIP) / 14, 0, 1) * U.clamp((C.LAND - rel) / 10, 0, 1)
        : 0;
      const impact = (s.phase === 'land') ? Math.max(0, 1 - s.land / C.SETTLE) : 0;
      const p = Setpieces.fallProx(m);
      const back = Setpieces.fallBackK(m);
      const ex = Setpieces.fallExit(m);
      /* 崩落の熱で霧が赤く焦げ、出口に近づくと白い外光へ抜ける */
      const col = new THREE.Color(0x44242e).lerp(new THREE.Color(0x6e1c10), U.clamp(p * 0.8, 0, 1))
                                           .lerp(new THREE.Color(0xffd8b0), U.clamp(ex * 0.55, 0, 1));
      return {
        shake: 0.018 + 0.085 * p * (0.7 + 0.3 * Math.sin(s.t * 31))
             + 0.18 * impact * (0.6 + 0.4 * Math.sin(s.t * 41)) + 0.012 * g,
        fovAdd: 3 + 7 * g + 4 * impact + 5 * p + 6 * ex,
        camBack: 1.4 * g,
        camUp: lift + 0.50 * g + 0.30 * back,
        lookUp: lift - 0.70 * g + 0.30 * ex,
        fogFar: U.lerp(88, 200, Math.max(g, Math.max(back * 0.8, ex))),
        fogColor: col.getHex(),
        glide: g,
        /* 振り返りカット（§4.4 S8）: World.syncCamera がこれを読んで背後を向く */
        lookBack: back,
        lookBackCut: Setpieces.fallBackCut(m),
        lookBackDist: C.CUT_BACK,
        prox: p, exit: ex
      };
    }
    if (s.id === 'shatter') {
      const m = s.dist || s.startM;
      const cr = Setpieces.shatterCrackK(m), br = Setpieces.shatterBreakK(m);
      const gk = Setpieces.shatterGatherK(m), cut = Setpieces.mirrorCutK(m);
      /* 割れるほど霧が銀白へ抜け、鏡へ飛び込む瞬間に白く満ちる */
      /* 白く満ちるのは「飛び込む瞬間」だけ。強くしすぎると画面が飛んで
         暗部が消える（契約§3 の輝度規範）ので、抜けきらない程度に抑える。 */
      const c = new THREE.Color(0x1d2433).lerp(new THREE.Color(0xc9d6ee), U.clamp(cut * 0.34 + gk * 0.12, 0, 1));
      return {
        shake: 0.012 + 0.055 * cr * (0.7 + 0.3 * Math.sin(s.t * 28))
             + 0.085 * br * (1 - gk) * (0.6 + 0.4 * Math.sin(s.t * 34)),
        /* 鏡へのカットでは画角を **絞る**（寄りのズーム / P5c）。旧: +8°（広げていた）で、
           横持ち 812×375 では大鏡が画面の 11% にしかならなかった（§4.4 S7「鏡が主役」）。
           −13° で 横持ち・縦持ち・iPad とも 20% 以上（横持ちは −10° だと 19%）。 */
        fovAdd: 3 + 5 * br - 13 * cut,
        camBack: 0,
        camUp: 0.28 + 0.22 * br,
        lookUp: -0.18 - 0.12 * br + 0.30 * cut,
        fogFar: U.lerp(84, 168, Math.max(br * 0.5, cut)),
        fogColor: c.getHex(),
        glide: 0,
        /* 鏡へ向く1秒カット（§4.4 S7）: World.syncCamera がこれを読んで鏡を正面に据える */
        lookMirror: cut,
        shatter: br
      };
    }
    if (s.id === 'megafish') {
      const m = s.dist || s.startM;
      const rel = m - s.startM;
      const p = Setpieces.fishPos(m);
      const side = Setpieces.fishSideK(m);
      const near = (p.phase === 'swim') ? U.clamp(1 - Math.abs(p.x) / 26, 0, 1) : 0;
      const F2 = Setpieces.FISH;
      /* 遠景まで開ける（濃い霧のままだと 75m 先の巨体が沈む）。前後は滑らかに戻す */
      const rev = U.clamp((rel + 6) / 10, 0, 1) * U.clamp((F2.SWIM0 + 30 - rel) / 26, 0, 1);
      return {
        /* 巨体が通り過ぎる水圧で揺れる。横向きカットの真ん中がいちばん強い */
        shake: 0.012 + 0.085 * side * (0.7 + 0.3 * Math.sin(s.t * 24)) + 0.02 * near,
        fovAdd: 3 + 5 * side + 3 * near,
        camBack: 0,
        camUp: 0.30 + 0.20 * side,
        lookUp: 0.30 + 0.35 * near,
        fogFar: U.lerp(76, 185, Math.max(rev, Math.max(side, near) * 0.5)),
        fogColor: 0x1a6478,
        glide: 0,
        /* 横向きカット（§4.4 S5）: World.syncCamera がこれを読んで首を左へ振る */
        lookSide: side,
        near: near
      };
    }
    const ramp = U.clamp(s.t / 1.2, 0, 1);              // 立ち上がり
    return {
      shake: 0.055 * ramp * (0.7 + 0.3 * Math.sin(s.t * 23.3)),
      fovAdd: 6 * ramp,
      camBack: Setpieces.CAM_BACK * ramp,
      fogFar: U.lerp(104, 76, ramp),
      fogColor: 0x2a1c3e,
      glide: 0
    };
  },

  /* ---- 粉塵（崩落前線から飛んでくる破片）／後方の火柱の照り返し ---------- */
  initView(scene) {
    FF.initView(scene);
    if (Setpieces.dust) return;
    /* 崩落前線の明かり: カメラの後ろに置き、前方の壁や小物を赤く照らす */
    Setpieces.emberLight = new THREE.PointLight(0xff5a2a, 0, 42, 2);
    Setpieces.emberLight.position.set(0, CFG.H / 2, 14);
    scene.add(Setpieces.emberLight);
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9b86c8, transparent: true, opacity: 0.0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true
    });
    const N = 120;
    const im = new THREE.InstancedMesh(geo, mat, N);
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.renderOrder = 6;
    scene.add(im);
    Setpieces.dust = { mesh: im, mat: mat, count: N, dummy: new THREE.Object3D(),
                       base: new THREE.Color(0x9b86c8) };
    Setpieces._buildRock(scene);
    Setpieces._buildTemple(scene);
    Setpieces._buildFish(scene);
    Setpieces._buildBlast(scene);
    Setpieces._buildShatter(scene);
    Setpieces._buildFall(scene);
  },

  /* ---- 全崩壊エスケープ（S8）の造形 --------------------------------------
     ・**崩落前線＝背後から迫る「世界の断面」**。振り返りカットのときだけ描く
       （前向きのカメラより手前に来るので、ふだん描くと画面を塞ぐ／
        契約§8 の決定ログ: 巨大演出はカメラを向けるカット方式）。
     ・ふだんは「飛んでくる瓦礫・赤い照り返し・地響き・落ちていく路面」で迫りを見せる。
     ・形: 砕けた岩の壁＋そこから噴き出す火＋千切れた構造材（他ゾーンの断片が混ざる）。 */
  _buildFall(scene) {
    const C = Setpieces.CA;
    const g = new THREE.Group();
    g.visible = false;
    scene.add(g);

    /* 崩落の壁（カットで正面に見える塊）。岩・火・千切れた梁の3材質 */
    const wall = new THREE.Group();
    g.add(wall);
    const rock = [];
    for (let i = 0; i < 90; i++) {
      const h1 = ZoneKit.hash(i, 911), h2 = ZoneKit.hash(i, 919), h3 = ZoneKit.hash(i, 929);
      const sx = 1.4 + h1 * 5.2, sy = 1.4 + h2 * 5.0, sz = 1.2 + h3 * 4.4;
      rock.push({ g: ZoneKit.box(sx, sy, sz),
                  p: [(h1 - 0.5) * C.WALL_W, (h2 - 0.5) * C.WALL_H, (h3 - 0.5) * C.WALL_D],
                  r: [h1 * 3, h2 * 3, h3 * 3] });
    }
    wall.add(new THREE.Mesh(ZoneKit.merge(rock),
                            new THREE.MeshLambertMaterial({ color: 0x3a2228, flatShading: true })));
    /* 割れ目から噴き出す火（明部。輪郭が「燃えながら崩れている」と読める） */
    const fire = [];
    for (let i = 0; i < 26; i++) {
      const h1 = ZoneKit.hash(i, 937), h2 = ZoneKit.hash(i, 941), h3 = ZoneKit.hash(i, 947);
      fire.push({ g: ZoneKit.box(0.7 + h1 * 2.0, 0.7 + h2 * 2.2, 0.6 + h3 * 1.6),
                  p: [(h1 - 0.5) * C.WALL_W * 0.92, (h2 - 0.5) * C.WALL_H * 0.92,
                      (h3 - 0.5) * C.WALL_D * 0.5 - 1.5],
                  r: [h2 * 3, h1 * 3, h3 * 3] });
    }
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff6a2a, fog: true });
    wall.add(new THREE.Mesh(ZoneKit.merge(fire), fireMat));
    Setpieces._fallFireMat = fireMat;
    /* 千切れた構造材（他ゾーンの断片が巻き込まれている＝コアの世界観） */
    const beams = [];
    for (let i = 0; i < 20; i++) {
      const h1 = ZoneKit.hash(i, 953), h2 = ZoneKit.hash(i, 967), h3 = ZoneKit.hash(i, 971);
      beams.push({ g: ZoneKit.box(0.35 + h1 * 0.4, 0.35 + h2 * 0.4, 3 + h3 * 7),
                   p: [(h1 - 0.5) * C.WALL_W, (h2 - 0.5) * C.WALL_H, (h3 - 0.5) * C.WALL_D - 2],
                   r: [h3 * 3, h1 * 3, h2 * 3] });
    }
    wall.add(new THREE.Mesh(ZoneKit.merge(beams),
                            new THREE.MeshLambertMaterial({ color: 0x9aa4b8, flatShading: true })));

    /* 前へ飛んでくる瓦礫（ふだんはこれが「迫っている」を見せる） */
    const deb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.45, 0.45),
                                        new THREE.MeshLambertMaterial({ color: 0x6a4a44, flatShading: true }),
                                        C.DEB_N);
    deb.frustumCulled = false;
    deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(deb);

    /* 出口の光（前方の白い膜。崩落を抜けた先＝ゴール） */
    const exit = new THREE.Mesh(new THREE.PlaneGeometry(CFG.HALF_W * 2 + 2.4, CFG.H + 2.4),
                                new THREE.MeshBasicMaterial({ color: 0xffe6c0, transparent: true,
                                                              opacity: 0, depthWrite: false, fog: false }));
    exit.position.set(0, CFG.H / 2, 0);
    exit.renderOrder = 5;
    exit.visible = false;
    scene.add(exit);

    Setpieces.fall = { group: g, wall: wall, deb: deb, exit: exit,
                       dummy: new THREE.Object3D(), n: C.DEB_N };
  },

  _hideFall() {
    const f = Setpieces.fall;
    if (!f) return;
    if (f.group.visible) f.group.visible = false;
    if (f.exit.visible) { f.exit.visible = false; f.exit.material.opacity = 0; }
  },
  /* 崩落前線・瓦礫・出口の光の更新（距離の関数。フレームに依存しない） */
  _syncFall(dist, t) {
    const s = Setpieces.state, f = Setpieces.fall, d = Setpieces.dust;
    if (!f || !s) return;
    const C = Setpieces.CA;
    const p = Setpieces.fallProx(dist);
    f.group.visible = true;
    /* 壁を描くのは **振り返りカットの間だけ**（前向きのカメラには映らないため） */
    f.wall.visible = (Setpieces.fallBackK(dist) > 0.02);
    f.group.position.set(0, CFG.H / 2 - 0.3, s.gap);
    f.wall.rotation.z = Math.sin(t * 0.7) * 0.04;
    if (Setpieces._fallFireMat) {
      Setpieces._fallFireMat.color.setHex(0xff6a2a).multiplyScalar(0.7 + 0.3 * Math.abs(Math.sin(t * 9.3)));
    }
    /* 前へ飛んでくる瓦礫（群の原点＝崩落前線から見た位置） */
    const o = f.dummy;
    /* 出口へ近づくほど瓦礫は減る（崩落を抜けた＝もう降ってこない）。
       P5b 監査: 出口のカットで瓦礫が2体を完全に隠していたので、
       **前へ出る量を 2m までに抑え、ex で細らせる**。 */
    const ex = Setpieces.fallExit(dist);
    const debK = 1 - 0.92 * U.smooth(U.clamp(ex * 1.25, 0, 1));
    for (let i = 0; i < f.n; i++) {
      const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
      const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
      const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
      const u = (h1 + t * 0.42 + i * 0.017) % 1;
      o.position.set((h2 - 0.5) * 6.6, (h3 < 0.5 ? 0.4 : CFG.H - 0.4) + (h3 - 0.5) * 2.4,
                     -C.WALL_D * 0.4 - u * (s.gap + 2));
      o.rotation.set(t * (1.3 + h1) + i, t * 0.9 + i, t * (0.7 + h2));
      /* 群の原点は 2体の**後ろ**（z = gap）なので、u が進むと瓦礫はカメラの前を
         横切る。近いほど画面を塞ぐので、**通り過ぎる前に消す**
         （P5b 監査: 出口のカットで2体が瓦礫に完全に隠れていた）。 */
      o.scale.setScalar((0.4 + h3 * 1.0) * U.clamp((1 - u) * 1.8, 0, 1) * debK);
      o.updateMatrix();
      f.deb.setMatrixAt(i, o.matrix);
    }
    f.deb.instanceMatrix.needsUpdate = true;
    /* 出口の光（崩落を抜けた先。ゴールの手前に立つ白い膜） */
    f.exit.visible = ex > 0.01;
    if (f.exit.visible) {
      f.exit.material.opacity = 0.10 + 0.55 * ex;
      /* **カメラに被せない**（P5b 監査: 膜が目の前に来て画面を塗り潰した）。
         12m より手前へは来ない＝2体が光を背に走る絵になる。 */
      f.exit.position.z = -Math.max(12, (s.startM + C.END) - dist);
    }
    /* 粉塵を赤黒く染めて使い回す */
    if (d) {
      d.mat.color.setHex(0xd07a4a);
      d.mat.opacity = (0.16 + 0.24 * p) * debK;
      const o2 = d.dummy;
      for (let i = 0; i < d.count; i++) {
        const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
        const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
        const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
        const u = (h1 + (t * 0.3 + i * 0.013)) % 1;
        const zM = s.gap - u * (s.gap + 34);
        o2.position.set((h2 - 0.5) * 6.8, (h3 < 0.5 ? 0.3 : CFG.H - 0.3) + (h3 - 0.5) * 2.8, zM);
        o2.rotation.set(t * (0.6 + h1) + i, t * 0.4 + i, t * (0.3 + h2));
        o2.scale.setScalar((0.4 + h3 * 1.4) * (1 - u * 0.3));
        o2.updateMatrix();
        d.mesh.setMatrixAt(i, o2.matrix);
      }
      d.mesh.instanceMatrix.needsUpdate = true;
    }
    /* 崩落前線の明かり（後ろから赤く照らす） */
    if (Setpieces.emberLight) {
      Setpieces.emberLight.color.setHex(0xff6a34);
      Setpieces.emberLight.intensity = (18 + 26 * p) * (0.85 + 0.15 * Math.sin(s.t * 8.7));
      Setpieces.emberLight.distance = 48;
      Setpieces.emberLight.position.set(0, CFG.H / 2, Math.max(4, s.gap - 6));
    }
  },

  /* ---- 巨大魚（S5「巨大魚の通過」）の造形 --------------------------------
     ・全長 92m の巨体（クジラ／リュウグウノツカイ級）。コリドーより大きい。
     ・頭（顎と牙）・胴・背ビレ・胸ビレ・尾ビレ・発光する側線・大きな目玉。
     ・テクスチャ画像は使わない（契約§3）。形はプリミティブの合成だけで彫る。
     ・ローカル座標は「鼻先が -z、尾が +z」＝ 2体と同じ向き（yaw 0 で並走）。 */
  _buildFish(scene) {
    const F = Setpieces.FISH;
    const L = F.LEN, H = F.H, W = F.W;
    const g = new THREE.Group();
    g.visible = false;
    const lam = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, o || {}));
    const bas = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c, fog: true }, o || {}));
    const M = {
      back:  lam(0x081326),                 // 背＝ほぼ黒に近い群青（青緑の水から必ず分離する）
      side:  lam(0x11223d),                 // 側面（暗い群青）
      scale: lam(0x1a3053),                 // 鱗の列（側面より少し明るい縞）
      belly: lam(0x2c4a72),                 // 腹（少し明るい群青）＝2トーン
      dark:  lam(0x03060e),                 // 口の中・エラの溝
      bone:  lam(0xf4efdd),                 // 牙（暗い体から浮く唯一の明部）
      fin:   lam(0x16294a, { transparent: true, opacity: 0.80, side: THREE.DoubleSide }),
      finBone: lam(0x5a86c0),
      /* 発光器は **霧をかけない**（fog:false）＝ 80〜100m 先でも輪郭の光が沈まない。
         遠景では「光の点線でできた魚の形」として読め、至近では体の発光器として読める。 */
      glow:  bas(0x8ff0ff, { fog: false, transparent: true, opacity: 1 }),
      edge:  bas(0x7fe6ff, { fog: false, transparent: true, opacity: 0.92 }),
      /* 横向きカット専用の「影絵」。**霧をかけない** ので 75m 先でも色が沈まず、
         明るい青緑の水を背に **真っ黒な魚の形** が抜ける（契約 P4a-4）。
         並走〜至近では opacity を 0 にして、陰影のある本来の体を見せる。 */
      sil:   bas(0x050c1a, { fog: false, transparent: true, opacity: 0, depthWrite: false }),
      eyeW:  bas(0xf7f1dd),
      iris:  bas(0xffc24a),
      pupil: bas(0x06121a)
    };
    const add = (parts, mat) => { const m = new THREE.Mesh(ZoneKit.merge(parts), mat); g.add(m); return m; };
    const box = ZoneKit.box;

    /* ---- 胴（流線形）------------------------------------------------------
       前後で細くなる塊を連ね、**背（暗）／側面／腹（淡）** の3トーンに割る。
       遠くではシルエットが流線形に読め、近くでは面の明暗で丸みが出る。 */
    const seg = 9, segL = L / seg;
    const prof = (u) => Math.sin(Math.PI * Math.pow(U.clamp(0.10 + 0.86 * u, 0, 1), 0.85));
    const backP = [], sideP = [], bellyP = [], scaleP = [];
    for (let i = 0; i < seg; i++) {
      const u = i / (seg - 1);
      const k = prof(u);
      const hh = H * (0.22 + 0.78 * k), ww = W * (0.22 + 0.78 * k);
      const z = -L / 2 + (i + 0.5) * segL;
      sideP.push({ g: box(ww, hh * 0.60, segL + 0.5), p: [0, hh * 0.04, z] });
      backP.push({ g: box(ww * 0.94, hh * 0.30, segL + 0.4), p: [0, hh * 0.36, z] });
      bellyP.push({ g: box(ww * 0.86, hh * 0.24, segL + 0.4), p: [0, -hh * 0.36, z] });
      /* 鱗の列: 側面に浅い段を3段（明暗の縞として読める） */
      for (let r = 0; r < 3; r++) {
        const y = hh * (0.22 - r * 0.20);
        [-1, 1].forEach((sx) => {
          scaleP.push({ g: box(0.5, hh * 0.13, segL * 0.86), p: [sx * ww * 0.50, y, z], r: [0, 0, sx * 0.05] });
        });
      }
    }
    add(sideP, M.side);
    add(backP, M.back);
    add(bellyP, M.belly);
    add(scaleP, M.scale);

    /* ---- 頭（口は上下の顎に分ける＝開閉できる） --------------------------- */
    const headZ = -L / 2;                     // 胴の先端
    const jawZ = headZ - 1.5;                 // 口の付け根（顎のピボット）
    add([
      { g: box(W * 0.82, H * 0.74, 7), p: [0, 0.4, headZ - 2.4] },          // 頭
      { g: box(W * 0.66, H * 0.52, 4), p: [0, 0.9, headZ - 5.6] },          // 鼻先へすぼまる
      { g: box(W * 0.30, H * 0.22, 3.4), p: [0, H * 0.40, headZ - 5.0] }    // 頭頂の隆起
    ], M.back);
    add([
      { g: box(W * 0.30, H * 0.16, 5.0), p: [0, H * 0.46, headZ - 3.0], r: [0.10, 0, 0] },
      { g: box(W * 0.16, H * 0.12, 3.0), p: [0, H * 0.54, headZ - 1.0], r: [0.16, 0, 0] }
    ], M.scale);
    /* エラの溝（3本×左右）＝「生き物」の合図 */
    const gillP = [];
    [-1, 1].forEach((sx) => {
      for (let i = 0; i < 3; i++) {
        gillP.push({ g: box(0.7, H * 0.46, 0.9), p: [sx * W * 0.44, -0.2, headZ + 2.4 + i * 2.2], r: [0, 0, sx * 0.16] });
      }
    });
    const gills = add(gillP, M.dark);
    /* 口の中（暗い空洞）。顎が開くと見える */
    add([{ g: box(W * 0.56, H * 0.30, 6), p: [0, -0.3, jawZ - 3.0] }], M.dark);

    /* 上顎・下顎（それぞれ別の群＝ピボットで回す） */
    const mkJaw = (up) => {
      const j = new THREE.Group();
      j.position.set(0, up ? 0.5 : -0.9, jawZ);
      const sgn = up ? 1 : -1;
      const plate = new THREE.Mesh(ZoneKit.merge([
        { g: box(W * 0.70, H * 0.17, 7.0), p: [0, sgn * H * 0.07, -3.4] },
        { g: box(W * 0.50, H * 0.13, 3.2), p: [0, sgn * H * 0.08, -7.6] }
      ]), up ? M.back : M.belly);
      j.add(plate);
      /* 牙（判定の牙 FISH_TOOTH と同じ「口」の合図） */
      const tp = [];
      for (let i = 0; i < 7; i++) {
        const x = (i / 6 - 0.5) * W * 0.58;
        const h2 = 2.6 - Math.abs(i / 6 - 0.5) * 2.0;
        tp.push({ g: new THREE.ConeGeometry(0.42, h2, 4), p: [x, -sgn * h2 / 2, -3.0 - Math.abs(i / 6 - 0.5) * 2.0],
                  r: [0, 0, up ? Math.PI : 0] });
      }
      j.add(new THREE.Mesh(ZoneKit.merge(tp), M.bone));
      g.add(j);
      return j;
    };
    const jawTop = mkJaw(true), jawBot = mkJaw(false);

    /* ---- 目（白目＋虹彩＋瞳の3層）---------------------------------------- */
    const eyes = [];
    [-1, 1].forEach((sx) => {
      const ez = -L * F.EYE_Z, ey = H * 0.18;
      /* 3層（白目・虹彩・瞳）。**胴の輪郭より外**に出す（埋まると黄色い楕円にしか見えない） */
      const e = new THREE.Mesh(new THREE.SphereGeometry(2.0, 10, 8), M.eyeW);
      e.position.set(sx * W * 0.50, ey, ez);
      g.add(e);
      const ir = new THREE.Mesh(new THREE.SphereGeometry(1.30, 10, 8), M.iris);
      ir.position.set(sx * W * 0.60, ey, ez);
      g.add(ir);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.60, 8, 6), M.pupil);
      pu.position.set(sx * W * 0.66, ey, ez);
      g.add(pu);
      eyes.push({ iris: ir, pupil: pu });
      /* 目の縁（まぶたの隆起）＝楕円に見せない */
      g.add(new THREE.Mesh(ZoneKit.merge([
        { g: box(0.6, 0.7, 5.4), p: [sx * W * 0.50, ey + 2.1, ez] },
        { g: box(0.6, 0.6, 5.0), p: [sx * W * 0.50, ey - 2.1, ez] }
      ]), M.back));
    });

    /* ---- ヒレ（半透明＋放射状の骨）---------------------------------------- */
    const finP = [], boneP = [];
    const fin = (w2, h2, x, y, z, rot, bones) => {
      finP.push({ g: box(w2, h2, 0.5), p: [x, y, z], r: rot });
      for (let i = 0; i < bones; i++) {
        const a = (i / (bones - 1) - 0.5);
        boneP.push({ g: box(w2 * 0.9, 0.35, 0.35), p: [x, y + a * h2 * 0.82, z], r: [rot[0], rot[1], rot[2] + a * 0.30] });
      }
    };
    /* 背ビレ（上に立つ三角）: 板を段々に重ねて三角形の輪郭を作る */
    for (let i = 0; i < 5; i++) {
      const u = i / 4;
      finP.push({ g: box(0.9, H * (0.70 - u * 0.52), 14 - u * 8), p: [0, H * (0.60 + 0.34 * (1 - u) * 0.5), -10 + u * 16] });
    }
    /* 胸ビレ（左右・後ろへ広がる）と腹ビレ */
    [-1, 1].forEach((sx) => {
      fin(W * 1.15, 5.0, sx * W * 0.62, -H * 0.16, -L * 0.20, [0, 0, sx * 0.34], 4);
      fin(W * 0.80, 3.4, sx * W * 0.50, -H * 0.30, L * 0.10, [0, 0, sx * 0.26], 3);
    });
    add(finP, M.fin);
    add(boneP, M.finBone);

    /* ---- 尾（左右に振る＝別の群）------------------------------------------ */
    const tail = new THREE.Group();
    tail.position.set(0, 0, L * 0.34);
    const tp2 = [], tb = [];
    tp2.push({ g: box(W * 0.30, H * 0.34, L * 0.16), p: [0, 0, L * 0.08] });       // 尾柄
    /* 三日月の尾ビレ（上下に広がる2枚） */
    [1, -1].forEach((sy) => {
      for (let i = 0; i < 4; i++) {
        const u = i / 3;
        tp2.push({ g: box(0.8, H * (0.50 + u * 0.55), 7 - u * 4),
                   p: [0, sy * H * (0.34 + u * 0.46), L * 0.18 + u * 5.5] });
        tb.push({ g: box(0.5, H * (0.44 + u * 0.50), 0.5), p: [0.5, sy * H * (0.34 + u * 0.46), L * 0.18 + u * 5.5] });
      }
    });
    tail.add(new THREE.Mesh(ZoneKit.merge(tp2), M.fin));
    tail.add(new THREE.Mesh(ZoneKit.merge(tb), M.finBone));
    g.add(tail);

    /* ---- 側線（1本の発光ライン）と発光器 ---------------------------------- */
    const dots = [];
    [-1, 1].forEach((sx) => {
      dots.push({ g: box(0.45, 0.55, L * 0.80), p: [sx * W * 0.52, H * 0.04, 0] });
    });
    for (let i = 0; i < 12; i++) {
      const z = -L / 2 + 8 + i * (L - 16) / 11;
      [-1, 1].forEach((sx) => {
        dots.push({ g: box(0.8, 1.3, 1.3), p: [sx * W * 0.46, -H * 0.24, z] });
      });
    }
    const glowMesh = add(dots, M.glow);
    glowMesh.renderOrder = 4;
    /* ---- 輪郭の発光（遠景で「魚の形」が読めるようにする / 契約 P4a-r1）------
       背びれの稜線・腹の縁・尾びれの縁・頭の稜を、光の点線でなぞる。
       霧をかけない材質なので、80〜100m 先のシルエットカットでも形が残る。 */
    const edgeP = [];
    for (let i = 0; i < 16; i++) {
      const u = i / 15;
      const z = -L / 2 - 4 + u * (L + 12);
      const k = prof(U.clamp((z + L / 2) / L, 0, 1));
      const top = H * (0.22 + 0.78 * k) * 0.52 + (z > -10 && z < 6 ? H * 0.30 : 0);
      edgeP.push({ g: box(0.7, 0.7, 2.0), p: [0, top + 0.5, z] });                 // 背の稜線
      if (i % 2 === 0) edgeP.push({ g: box(0.7, 0.7, 1.8), p: [0, -top - 0.4, z] }); // 腹の縁
    }
    [1, -1].forEach((sy) => {
      for (let i = 0; i < 4; i++) {
        const u = i / 3;
        edgeP.push({ g: box(0.7, 0.7, 1.4), p: [0, sy * H * (0.62 + u * 0.50), L * 0.52 + u * 5.2] });
      }
    });
    [-1, 1].forEach((sx) => {
      edgeP.push({ g: box(0.8, 0.8, 0.8), p: [sx * W * 0.50, H * 0.42, headZ - 4.0] });  // 頭の角
      edgeP.push({ g: box(0.8, 0.8, 0.8), p: [sx * W * 0.62, -H * 0.18, -L * 0.20] });   // 胸びれの先
    });
    const edgeMesh = add(edgeP, M.edge);
    edgeMesh.renderOrder = 5;
    /* 影絵（遠景カット用）。胴・頭・背びれ・尾を1つに融合して少しだけ外側に置く */
    const silP = [];
    /* 胴は **実際の高さ**（側面の帯の 1/0.60）に戻す。太らせると背びれ・尾びれの
       輪郭が埋もれて「ただの板」に見えるため（契約 P4a-r1 の差し戻し理由）。 */
    sideP.forEach((q) => silP.push({ g: ZoneKit.box(q.g.parameters.width * 1.02,
                                                    q.g.parameters.height * 1.60,
                                                    q.g.parameters.depth), p: q.p }));
    silP.push({ g: box(W * 0.86, H * 0.78, 7), p: [0, 0.4, headZ - 2.4] });
    silP.push({ g: box(W * 0.70, H * 0.56, 5), p: [0, 0.9, headZ - 6.0] });
    for (let i = 0; i < 5; i++) {
      const u = i / 4;
      silP.push({ g: box(1.0, H * (0.70 - u * 0.52), 14 - u * 8),
                  p: [0, H * (0.60 + 0.34 * (1 - u) * 0.5), -10 + u * 16] });
    }
    [1, -1].forEach((sy) => {
      for (let i = 0; i < 4; i++) {
        const u = i / 3;
        silP.push({ g: box(1.0, H * (0.50 + u * 0.55), 7 - u * 4),
                    p: [0, sy * H * (0.34 + u * 0.46), L * 0.52 + u * 5.5] });
      }
    });
    [-1, 1].forEach((sx) => {
      silP.push({ g: box(W * 1.15, 5.0, 0.6), p: [sx * W * 0.62, -H * 0.16, -L * 0.20], r: [0, 0, sx * 0.34] });
    });
    const sil = add(silP, M.sil);
    /* 影絵は **発光器と輪郭の光より先に** 描く（後だと目や口を塗り潰して
       ただの白い塊に見える / 契約 P4a-r1 の差し戻し理由）。 */
    sil.renderOrder = -1;
    scene.add(g);

    /* ---- 魚に追い立てられて逃げる小魚の群れ（スケール感の主役）------------ */
    const escortMat = new THREE.MeshBasicMaterial({ color: 0xcfeef5, fog: true, transparent: true,
                                                    opacity: 0.85, side: THREE.DoubleSide });
    const escort = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.16), escortMat, 54);
    escort.frustumCulled = false;
    escort.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    escort.visible = false;
    scene.add(escort);

    /* ---- 魚の影（丸影の大型版。床と天井に落ちる）-------------------------- */
    const shadows = [];
    [[0.035, -Math.PI / 2], [CFG.H - 0.035, Math.PI / 2]].forEach((c) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20),
                               new THREE.MeshBasicMaterial({ color: 0x03141c, transparent: true,
                                                             opacity: 0, depthWrite: false, fog: true }));
      m.rotation.x = c[1];
      m.position.set(0, c[0], 0);
      m.renderOrder = 2;
      m.visible = false;
      scene.add(m);
      shadows.push(m);
    });
    Setpieces.fish = { group: g, shadows: shadows, glowMat: M.glow, mats: M, sil: sil,
                       jawTop: jawTop, jawBot: jawBot, tail: tail, gills: gills,
                       eyes: eyes, escort: escort, escortMat: escortMat,
                       dummy: new THREE.Object3D() };
  },

  /* 口の開き 0..1（契約 P4a-r1）。基本は 0.5秒周期で開閉し、
     **判定の牙（FISH_TOOTH）に近づくと大きく開く**＝見た目と判定が同じ合図になる。 */
  fishJaw(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'megafish') return 0;
    const sp = (typeof Game !== 'undefined' && Game.speed) ? Game.speed : CFG.SPEED_MIN;
    const rel = m - s.startM;
    const base = 0.30 + 0.30 * (0.5 - 0.5 * Math.cos(2 * Math.PI * rel / (sp * 0.5)));
    let bite = 0;
    const def = Setpieces.DEFS.megafish;
    const teeth = Setpieces._fishTeeth || (Setpieces._fishTeeth =
      (def.floor || []).concat(def.ceil || []).filter((e) => e.type === 'FISH_TOOTH').map((e) => e.at));
    for (let i = 0; i < teeth.length; i++) {
      const d = teeth[i] - rel;
      if (d > -8 && d < 44) bite = Math.max(bite, U.clamp(1 - Math.abs(d - 14) / 26, 0, 1));
    }
    /* 横向きカットの真ん中で大きく開ける（口の中・牙が読める見せ場） */
    const F = Setpieces.FISH;
    const mid = (F.SIDE0 + F.SIDE1) / 2;
    bite = Math.max(bite, U.clamp(1 - Math.abs(rel - mid) / 14, 0, 1));
    return U.clamp(Math.max(base, bite), 0, 1);
  },
  /* 尾の振り -1..1。**判定の尾（FISH_TAIL の横スキャン）と同じ周期・位相** */
  fishTailK(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'megafish') return 0;
    const sp = (typeof Game !== 'undefined' && Game.speed) ? Game.speed : CFG.SPEED_MIN;
    const period = CFG.LASER.SCAN_PERIOD * (sp / CFG.REF_SPEED);
    const def = Setpieces.DEFS.megafish;
    const tailAt = Setpieces._fishTailAt || (Setpieces._fishTailAt =
      ((def.floor || []).filter((e) => e.type === 'FISH_TAIL')[0] || { at: 154 }).at);
    const at = s.startM + tailAt;
    return -Math.cos(2 * Math.PI * (m - at) / period);
  },
  /* 遠景カットのあいだ、海底の小物を間引く割合 0..1（ゾーンが読む）。
     巨体の輪郭を見せるには背景が要る。海藻や梁が視界を埋めていると
     「シルエット全体が読める」を満たせないので、カットの前後で滑らかに間引く。
     ＝「巨体の影が差して魚たちが逃げ、水が空く」という読み方にもなる。 */
  fishClearK(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'megafish') return 0;
    const F = Setpieces.FISH, rel = m - s.startM;
    /* ① 横向きカット（全身のシルエットを見せる） ② 目が合うカット（頭が寄る）の2回 */
    const win = (a, b2, amt) => amt * U.smooth(U.clamp((rel - a) / 8, 0, 1)) *
                                     U.smooth(U.clamp((b2 - rel) / 10, 0, 1));
    return Math.max(win(F.SIDE0 - 8, F.SIDE1 + 5, 0.92),
                    win(F.EYE0 - 24, F.EYE1 + 8, 0.72));
  },
  /* 魚を照らす明かりの強さ 0..1（ゾーンが読む。遠景のシルエットでは弱く、至近で強く） */
  fishLightK(m) {
    const p = Setpieces.fishPos(m);
    if (!p.vis) return 0;
    /* 横向きカットは **暗いシルエット** で見せる（明かりを当てない）。
       並走〜至近では面を起こして、鱗・ヒレ・目を読ませる。 */
    if (p.phase === 'side' || p.phase === 'far') return 0.10;
    if (p.phase === 'turn') return 0.35;
    return U.clamp(1 - Math.abs(p.z + 6) / 70, 0.3, 1);
  },
  /* 魚のシルエットが画面幅の何割を占めるか（契約 P4a-r1 の数値ゲート）。
     カメラの後ろに回り込んだ角は数えない（投影が裏返るため）。 */
  fishWidthShare(m) {
    const f = Setpieces.fish;
    if (!f || !f.group.visible) return 0;
    if (typeof World === 'undefined' || !World.ready) return 0;
    const b = Setpieces.fishBox(m);
    if (!b) return 0;
    const cam = World.camera;
    cam.updateMatrixWorld();
    const v = Setpieces._pv || (Setpieces._pv = new THREE.Vector3());
    let x0 = 1e9, x1 = -1e9, n = 0;
    for (let i = 0; i < 8; i++) {
      v.set((i & 1) ? b.x1 : b.x0, (i & 2) ? b.y1 : b.y0, (i & 4) ? b.z1 : b.z0);
      v.applyMatrix4(cam.matrixWorldInverse);
      if (v.z > -cam.near) continue;                 // カメラの後ろの角は数えない（投影が裏返る）
      v.applyMatrix4(cam.projectionMatrix);
      const px = v.x * 0.5 + 0.5;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      n++;
    }
    if (!n) return 0;
    return U.clamp(Math.min(1, x1) - Math.max(0, x0), 0, 1);
  },

  _hideFish() {
    const f = Setpieces.fish;
    if (!f || !f.group.visible) return;
    f.group.visible = false;
    f.escort.visible = false;
    f.shadows.forEach((m) => { m.visible = false; m.material.opacity = 0; });
  },
  /* 巨大魚の更新（すべて距離の関数。フレームに依存しない） */
  _syncFish(dist, t) {
    const f = Setpieces.fish, d = Setpieces.dust, F = Setpieces.FISH;
    if (!f) return;
    const p = Setpieces.fishPos(dist);
    f.group.visible = p.vis;
    f.escort.visible = p.vis;
    if (p.vis) {
      /* 泳ぐうねり（体を左右に振る）。距離の関数なので巻き戻しても同じ */
      const sway = Math.sin(dist * 0.05) * 0.06;
      f.group.position.set(p.x, p.y + Math.sin(dist * 0.035) * 0.5, p.z);
      f.group.rotation.set(0, p.yaw + sway, Math.sin(dist * 0.04) * 0.04);
      /* 口の開閉（判定の牙と同期）。上顎は上へ、下顎は下へ開く */
      const jaw = Setpieces.fishJaw(dist);
      f.jawTop.rotation.x = -0.34 * jaw;
      f.jawBot.rotation.x = 0.46 * jaw;
      /* 尾の振り（判定の尾のスキャンと同じ周期） */
      const tk = Setpieces.fishTailK(dist);
      f.tail.rotation.y = 0.42 * tk;
      f.tail.position.x = -1.6 * tk;
      /* エラの開閉（呼吸） */
      f.gills.scale.z = 1 + 0.18 * Math.sin(dist * 0.18);
      /* 瞳がこちらを見る（至近では 2体のほうへ寄る） */
      const look = U.clamp(1 - Math.abs(p.z) / 60, 0, 1);
      f.eyes.forEach((e) => { e.pupil.position.z = -F.LEN * F.EYE_Z + 1.6 * look; });
      f.glowMat.color.setHex(0x8ff0ff).multiplyScalar(0.72 + 0.28 * Math.sin(t * 2.4));
      /* 影絵: 遠いほど濃く（輪郭だけで読ませる）、至近では消して陰影の体を見せる */
      /* 影絵（霧をかけない暗い膜）: 横向きカットでは常に最大＝背景から必ず分離する。
         並走〜至近では消して、陰影のある本来の体を見せる。 */
      const farK = (p.phase === 'side' || p.phase === 'far') ? 1
                 : U.clamp((Math.abs(p.z) - 38) / 26, 0, 1);
      f.mats.sil.opacity = 0.88 * farK;
      f.sil.visible = farK > 0.02;
      /* 逃げる小魚の群れ（魚体に沿って前へ抜ける）＝巨体の大きさが比較で分かる */
      const o = f.dummy;
      for (let i = 0; i < f.escort.count; i++) {
        const h1 = ZoneKit.hash(i, 911), h2 = ZoneKit.hash(i, 919), h3 = ZoneKit.hash(i, 929);
        const u = (h1 + (dist * 0.010 + t * 0.10)) % 1;
        const side = (i % 2) ? 1 : -1;
        const along = F.LEN * (0.55 - u * 1.25);
        const out = (1.0 + h2 * 1.6) * (0.4 + u * 1.9);
        const lx = side * (F.W * 0.6 * out);
        const ly = (h3 - 0.5) * F.H * 1.1 - u * 2.0;
        /* 魚のローカル座標 → 世界（yaw だけ効く） */
        const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
        o.position.set(p.x + lx * c + along * sn, p.y + ly, p.z - lx * sn + along * c);
        o.rotation.set(0, p.yaw + side * 0.4 + Math.sin(t * 6 + i) * 0.3, Math.sin(t * 5 + i) * 0.25);
        o.scale.setScalar(0.8 + h2 * 1.4);
        o.updateMatrix();
        f.escort.setMatrixAt(i, o.matrix);
      }
      f.escort.instanceMatrix.needsUpdate = true;
      f.escortMat.opacity = 0.55 + 0.3 * U.clamp(1 - Math.abs(p.z) / 90, 0, 1);
    }
    /* 影（丸影の大型版）: 魚の真下・真上に落ちる。近いほど濃く大きい */
    const near = p.vis && (p.phase === 'side' || p.phase === 'swim' || p.phase === 'turn');
    const k = near ? U.clamp(1 - Math.abs(p.x) / 30, 0, 1) * U.clamp(1 - Math.abs(p.z) / 70, 0, 1) : 0;
    f.shadows.forEach((m) => {
      m.visible = k > 0.02;
      m.material.opacity = 0.50 * k;
      const r = 6 + 16 * k;
      m.scale.set(r * 2.2, r, 1);
      m.position.x = U.clamp(p.x, -CFG.HALF_W - 1, CFG.HALF_W + 1);
      m.position.z = U.clamp(p.z, -70, 2);
    });
    /* 巻き上がる砂と泡（既存の粒子を水色に染めて使い回す） */
    if (d) {
      d.mat.color.setHex(0xbfe8f2);
      d.mat.opacity = 0.10 + 0.22 * k;
      const o2 = d.dummy;
      for (let i = 0; i < d.count; i++) {
        const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
        const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
        const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
        const u = (h1 + (t * 0.22 + i * 0.013)) % 1;
        o2.position.set((h2 - 0.5) * 7.0, (h3 < 0.5 ? 0.3 : CFG.H - 0.3) + (h3 - 0.5) * 3.0, -6 - u * 56);
        o2.rotation.set(t * (0.5 + h1) + i, t * 0.3 + i, t * (0.2 + h2));
        o2.scale.setScalar((0.4 + h3 * 1.3) * (1 - u * 0.3));
        o2.updateMatrix();
        d.mesh.setMatrixAt(i, o2.matrix);
      }
      d.mesh.instanceMatrix.needsUpdate = true;
    }
  },

  /* ---- 区画爆発（S6「区画爆発」）の造形 ----------------------------------
     ・隣の区画（回廊の外・左）で起きる爆発。火球はコリドーよりはるかに大きい。
     ・**普段は描かない**。カメラを向けるカット（blastSideK）の間だけ画面に入る
       （契約§8 の決定ログ: 巨大演出はカメラを向けるカット方式）。
     ・テクスチャ画像は使わない（契約§3）。加算合成の球と輪、飛ぶ破片で作る。 */
  _buildBlast(scene) {
    const B = Setpieces.BL;
    const g = new THREE.Group();
    g.visible = false;
    const add = (color, op) => new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: op, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false
    });
    /* 火球（内側の白熱 → 橙 → 外側の煙）。3層の球で「奥行きのある塊」にする */
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), add(0xfff2c8, 0.95));
    const mid = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), add(0xff8a1e, 0.60));
    const out = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), add(0xff3a10, 0.32));
    const smoke = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1),
                                 new THREE.MeshBasicMaterial({ color: 0x241612, transparent: true,
                                                               opacity: 0.55, depthWrite: false, fog: false }));
    smoke.renderOrder = -1;
    g.add(smoke, out, mid, core);
    /* 衝撃波の輪（平たいトーラスが広がる） */
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.055, 6, 28), add(0xffd9a0, 0.85));
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 24), add(0x9fd8ff, 0.6));
    ring2.rotation.y = Math.PI / 2;
    g.add(ring2);
    /* 吹き飛ぶ破片（隔壁・パネル・配管の欠片）。爆心から放射状に飛ぶ */
    const deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
                                        new THREE.MeshLambertMaterial({ color: 0x9aa3b2, flatShading: true }),
                                        B.DEB_N);
    deb.frustumCulled = false;
    deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(deb);
    /* **爆ぜる区画そのもの**（隣のモジュール）。火球の向こうに見える暗い構造体で、
       「station の1区画が吹き飛んだ」と読めるようにする（契約§8 の決定ログ）。 */
    const mod = new THREE.Group();
    const hull = new THREE.MeshLambertMaterial({ color: 0x6d7687, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b3038, flatShading: true });
    mod.add(new THREE.Mesh(ZoneKit.merge([
      { g: new THREE.CylinderGeometry(9, 9, 26, 12), p: [0, 0, -22], r: [Math.PI / 2, 0, 0] },
      { g: new THREE.CylinderGeometry(11, 11, 3, 12), p: [0, 0, -34], r: [Math.PI / 2, 0, 0] },
      { g: ZoneKit.box(3, 3, 22), p: [9, 5, -22] },
      { g: ZoneKit.box(26, 2, 2), p: [0, 11, -16] }
    ]), hull));
    /* 反対側は千切れて骨組みだけ（爆心の側） */
    mod.add(new THREE.Mesh(ZoneKit.merge([
      { g: ZoneKit.box(2, 2, 16), p: [6, 6, 16] },
      { g: ZoneKit.box(2, 2, 14), p: [-7, 4, 14], r: [0.2, 0, 0.3] },
      { g: ZoneKit.box(2, 2, 12), p: [3, -7, 13], r: [-0.3, 0, 0] },
      { g: new THREE.CylinderGeometry(9.4, 9.4, 1.6, 12), p: [0, 0, 8], r: [Math.PI / 2, 0, 0] },
      { g: ZoneKit.box(12, 0.6, 9), p: [4, 8, 20], r: [0.5, 0.2, 0] },
      { g: ZoneKit.box(9, 0.6, 8), p: [-6, -8, 22], r: [-0.4, 0.3, 0.2] }
    ]), dark));
    g.add(mod);
    /* 火の粉（小さな加算の板） */
    const sparks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.5), add(0xffc06a, 0.9), 40);
    sparks.frustumCulled = false;
    sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sparks.renderOrder = 6;
    g.add(sparks);
    scene.add(g);
    /* 回廊の中を横切る閃光（爆発の瞬間、画面全体が白く飛ぶ） */
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe6b4, transparent: true, opacity: 0,
                                                   depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(CFG.HALF_W * 2 + 3.4, CFG.H + 3.4), flashMat);
    flash.renderOrder = 8;
    flash.visible = false;
    scene.add(flash);
    Setpieces.blast = { group: g, core: core, mid: mid, out: out, smoke: smoke, mod: mod,
                        ring: ring, ring2: ring2, deb: deb, sparks: sparks,
                        flash: flash, flashMat: flashMat, n: B.DEB_N,
                        dummy: new THREE.Object3D() };
  },

  _hideBlast() {
    const b = Setpieces.blast;
    if (!b) return;
    if (b.group.visible) b.group.visible = false;
    if (b.flash.visible) { b.flash.visible = false; b.flashMat.opacity = 0; }
  },

  /* 火球・衝撃波・破片・閃光の更新（すべて距離の関数） */
  _syncBlast(dist, t) {
    const s = Setpieces.state, b = Setpieces.blast, B = Setpieces.BL, d = Setpieces.dust;
    if (!b) return;
    const k = Setpieces.blastK(dist);
    const p = Setpieces.blastPos(dist);
    b.group.visible = p.vis;
    if (p.vis) {
      b.group.position.set(p.x, p.y, p.z);
      /* 爆ぜる区画は少し前から見えている（カットが始まった時点で「何が」が分かる） */
      b.mod.rotation.set(Math.sin(t * 0.3) * 0.02, 0.2, Math.sin(t * 0.25) * 0.03);
      const r = p.r;
      const puff = 1 + 0.05 * Math.sin(t * 9.3);
      b.core.scale.setScalar(r * 0.42 * puff);
      b.mid.scale.setScalar(r * 0.72 * puff);
      b.out.scale.setScalar(r * 1.00);
      b.smoke.scale.setScalar(r * 1.24);
      b.core.rotation.set(t * 0.5, t * 0.35, 0);
      b.mid.rotation.set(-t * 0.3, t * 0.5, 0);
      b.smoke.rotation.set(t * 0.12, -t * 0.2, 0);
      b.core.material.opacity = 0.95 * k;
      b.mid.material.opacity = 0.60 * k;
      b.out.material.opacity = 0.32 * k;
      b.smoke.material.opacity = 0.55 * Math.min(1, k * 1.4);
      /* 衝撃波は爆心から広がって薄くなる */
      const rel = dist - s.startM;
      const w = U.clamp((rel - (B.BOOM - 12)) / 46, 0, 1);
      b.ring.scale.setScalar(2 + w * B.R * 2.4);
      b.ring2.scale.setScalar(2 + w * B.R * 3.1);
      b.ring.material.opacity = 0.85 * (1 - w) * Math.min(1, k * 2);
      b.ring2.material.opacity = 0.60 * (1 - w) * Math.min(1, k * 2);
      /* 破片: 爆心から放射状に飛び、回廊の方（+x / 手前）へも流れてくる */
      const o = b.dummy;
      for (let i = 0; i < b.n; i++) {
        const h1 = ZoneKit.hash(i, 301), h2 = ZoneKit.hash(i, 307), h3 = ZoneKit.hash(i, 311);
        const u = U.clamp((rel - (B.BOOM - 10)) / 70 + h1 * 0.2, 0, 1.4);
        const sp = (6 + h2 * 26) * u;
        const a1 = h1 * Math.PI * 2, a2 = (h3 - 0.5) * 2.2;
        o.position.set(Math.cos(a1) * Math.cos(a2) * sp * 1.3,
                       Math.sin(a2) * sp * 0.7,
                       Math.sin(a1) * Math.cos(a2) * sp);
        o.rotation.set(t * (0.8 + h1 * 2) + i, t * (0.6 + h2 * 2), t * (0.4 + h3 * 2));
        const sz = (0.5 + h2 * 1.9) * (1 - u * 0.25);
        o.scale.set(sz, sz * (0.4 + h3 * 0.9), sz * (0.5 + h1 * 0.8));
        o.updateMatrix();
        b.deb.setMatrixAt(i, o.matrix);
      }
      b.deb.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 40; i++) {
        const h1 = ZoneKit.hash(i, 401), h2 = ZoneKit.hash(i, 409), h3 = ZoneKit.hash(i, 419);
        const u = ((h1 + t * 0.3) % 1);
        const sp = (4 + h2 * 30) * u;
        const a1 = h1 * 6.283, a2 = (h3 - 0.5) * 2.4;
        o.position.set(Math.cos(a1) * Math.cos(a2) * sp * 1.2, Math.sin(a2) * sp * 0.8,
                       Math.sin(a1) * Math.cos(a2) * sp);
        o.rotation.set(0, 0, t * 2 + i);
        o.scale.setScalar((0.5 + h2 * 1.4) * (1 - u) * (0.4 + k));
        o.updateMatrix();
        b.sparks.setMatrixAt(i, o.matrix);
      }
      b.sparks.instanceMatrix.needsUpdate = true;
    }
    /* 閃光（爆発の瞬間だけ・カットの真ん中で最大） */
    const fl = Math.max(0, k - 0.55) * 1.6;
    b.flash.visible = fl > 0.01;
    if (b.flash.visible) {
      b.flashMat.opacity = 0.34 * fl;
      b.flash.position.set(0, CFG.H / 2, -8);
    }
    /* 吹き飛ばされた DUO体は回転する（契約§4.4「回転しながら次の区画へ」） */
    if (FF.view && FF.view.duo) FF.view.duo.rotation.z = Setpieces.blastSpin(dist);
    /* 煙と塵（既存の粒子を焦げ色で使い回す） */
    if (d) {
      d.mat.color.setHex(0xd8a074);
      d.mat.opacity = 0.10 + 0.26 * k;
      const o2 = d.dummy;
      for (let i = 0; i < d.count; i++) {
        const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
        const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
        const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
        const u = (h1 + (t * 0.30 + i * 0.013)) % 1;
        o2.position.set((h2 - 0.5) * 7.0, (h3 < 0.5 ? 0.3 : CFG.H - 0.3) + (h3 - 0.5) * 3.0, -6 - u * 60);
        o2.rotation.set(t * (0.7 + h1) + i, t * 0.5 + i, t * (0.3 + h2));
        o2.scale.setScalar((0.4 + h3 * 1.4) * (1 - u * 0.3));
        o2.updateMatrix();
        d.mesh.setMatrixAt(i, o2.matrix);
      }
      d.mesh.instanceMatrix.needsUpdate = true;
    }
  },

  /* ---- 鏡の砕け散り（S7）の造形 ------------------------------------------
     ・**ひびの線**: 床と天井を走る細い明るい線（予告。音は鳴らさない）。
     ・**浮遊する鏡片**: 割れた床・天井の破片。砕けたあとゆっくり回りながら漂い、
       終盤は出口へ向かって集まる（＝大鏡になる）。
     ・**出口の大鏡**: 銀の枠と、こちらを映す面。カメラを向ける1秒カットで見せる
       （契約§8 の決定ログ: 巨大演出はカメラを向けるカット方式）。
     ・テクスチャ画像は使わない（契約§3）。 */
  _buildShatter(scene) {
    const R = Setpieces.MR;
    const g = new THREE.Group();
    g.visible = false;
    scene.add(g);
    /* 浮遊する鏡片（1メッシュ＝1ドローコール） */
    const shardMat = new THREE.MeshLambertMaterial({ color: 0xb9c6dc, flatShading: true });
    const shards = new THREE.InstancedMesh(
      ZoneKit.merge([{ g: ZoneKit.box(1, 0.045, 0.72), p: [0, 0, 0] },
                     { g: ZoneKit.box(0.5, 0.045, 0.9), p: [0.3, 0, 0.1], r: [0, 0.5, 0] }]),
      shardMat, R.SHARD_N);
    shards.frustumCulled = false;
    shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(shards);
    /* 鏡片の虹の縁光 */
    const rimMat = new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.8,
                                                 depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    const rims = new THREE.InstancedMesh(
      ZoneKit.merge([{ g: ZoneKit.box(1.04, 0.05, 0.05), p: [0, 0.03, 0.36] },
                     { g: ZoneKit.box(1.04, 0.05, 0.05), p: [0, 0.03, -0.36] }]),
      rimMat, R.SHARD_N);
    rims.frustumCulled = false;
    rims.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rims.renderOrder = 4;
    g.add(rims);
    /* ひびの線（床・天井を走る）。長さ1で作り、_syncShatter が伸ばす */
    const crackMat = new THREE.MeshBasicMaterial({ color: 0xeaf4ff, transparent: true, opacity: 0.9,
                                                   depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    const cracks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.02, 1), crackMat, R.CRACK_N * 2);
    cracks.frustumCulled = false;
    cracks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cracks.renderOrder = 5;
    g.add(cracks);
    /* 出口の大鏡（銀の枠＋鏡の面＋縁の光） */
    const mirror = new THREE.Group();
    const frame = new THREE.Mesh(ZoneKit.merge([
      { g: ZoneKit.box(R.MIRROR_W + 0.9, 0.55, 0.5), p: [0, (R.MIRROR_H + 0.55) / 2, 0] },
      { g: ZoneKit.box(R.MIRROR_W + 0.9, 0.55, 0.5), p: [0, -(R.MIRROR_H + 0.55) / 2, 0] },
      { g: ZoneKit.box(0.55, R.MIRROR_H + 1.6, 0.5), p: [-(R.MIRROR_W + 0.55) / 2, 0, 0] },
      { g: ZoneKit.box(0.55, R.MIRROR_H + 1.6, 0.5), p: [(R.MIRROR_W + 0.55) / 2, 0, 0] }
    ]), new THREE.MeshLambertMaterial({ color: 0xd6dfef, flatShading: true }));
    mirror.add(frame);
    const paneMat = new THREE.MeshBasicMaterial({ color: 0x9fc0e8, transparent: true, opacity: 0.62,
                                                  depthWrite: false, fog: true, side: THREE.DoubleSide });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(R.MIRROR_W, R.MIRROR_H), paneMat);
    pane.renderOrder = 2;
    mirror.add(pane);
    /* 鏡の奥へ吸い込まれる光（飛び込む先が「別の世界」だと分かる） */
    const wellMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5,
                                                  depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const well = [];
    for (let i = 0; i < 7; i++) {
      well.push({ g: new THREE.TorusGeometry(0.7 + i * 0.62, 0.05, 4, 22), p: [0, 0, -0.5 - i * 0.9] });
    }
    const wellMesh = new THREE.Mesh(ZoneKit.merge(well), wellMat);
    well.forEach((q) => q.g.dispose());
    wellMesh.renderOrder = 3;
    mirror.add(wellMesh);
    g.add(mirror);
    /* 大鏡の明かり（飛び込む瞬間に白く満ちる） */
    const light = new THREE.PointLight(0xdfe8ff, 0, 46, 2);
    scene.add(light);
    Setpieces.shatter = { group: g, shards: shards, rims: rims, cracks: cracks,
                          mirror: mirror, pane: pane, paneMat: paneMat, well: wellMesh, wellMat: wellMat,
                          light: light, n: R.SHARD_N, dummy: new THREE.Object3D() };
  },

  _hideShatter() {
    const b = Setpieces.shatter;
    if (!b) return;
    if (b.group.visible) b.group.visible = false;
    if (b.light.intensity !== 0) b.light.intensity = 0;
  },

  /* 鏡片・ひび・大鏡の更新（すべて距離の関数） */
  _syncShatter(dist, t) {
    const s = Setpieces.state, b = Setpieces.shatter, R = Setpieces.MR, d = Setpieces.dust;
    if (!b || !s) return;
    const rel = dist - s.startM;
    const cr = Setpieces.shatterCrackK(dist), br = Setpieces.shatterBreakK(dist);
    const gk = Setpieces.shatterGatherK(dist);
    b.group.visible = (rel > -20 && rel < R.END + 30);
    if (!b.group.visible) { b.light.intensity = 0; return; }
    b.group.position.set(0, 0, 0);
    const o = b.dummy;
    /* 鏡片: 割れた床・天井から浮き上がり、終盤は大鏡（前方）へ吸い寄せられる */
    const mz = -((s.startM + R.MIRROR_AT) - dist);
    for (let i = 0; i < b.n; i++) {
      const h1 = ZoneKit.hash(i, 911), h2 = ZoneKit.hash(i, 919), h3 = ZoneKit.hash(i, 929);
      const zSpread = -6 - h1 * 78;
      const side = (h2 < 0.5) ? 1 : -1;
      /* **走行の通り道には浮かべない**（|x| ≥ 2.3）。床と天井そのものが砕けて
         浮いている（World の路面タイル＝ tileShard）ので、ここは「まわりに舞う鏡片」。
         中央に浮かべると飛び石の道筋が読めなくなる。 */
      const fx = side * (2.3 + h1 * 3.4);
      const fy = (h3 < 0.5 ? 0.1 : CFG.H - 0.1) + side * (0.3 + h1 * 2.6) * br;
      /* 集まる: 大鏡の位置へ寄る */
      const gx = U.lerp(fx, (h2 - 0.5) * R.MIRROR_W * 0.8, gk);
      const gy = U.lerp(fy, CFG.H / 2 + (h3 - 0.5) * R.MIRROR_H * 0.8, gk);
      const gz = U.lerp(zSpread, mz + 1.2, gk);
      const sc = (0.5 + h3 * 1.3) * (0.25 + 0.75 * br);
      o.position.set(gx, gy, gz);
      o.rotation.set(t * (0.3 + h1 * 0.5) + i, t * (0.25 + h2 * 0.4), t * (0.2 + h3 * 0.4));
      o.scale.set(sc, 1, sc);
      o.updateMatrix();
      b.shards.setMatrixAt(i, o.matrix);
      b.rims.setMatrixAt(i, o.matrix);
    }
    b.shards.instanceMatrix.needsUpdate = true;
    b.rims.instanceMatrix.needsUpdate = true;
    b.shards.visible = br > 0.01;
    b.rims.visible = br > 0.01;
    b.rims.material.opacity = 0.8 * (0.6 + 0.4 * Math.sin(t * 3.1));
    /* ひびの線（砕ける前の予告）。前方の床と天井を走る */
    b.cracks.visible = cr > 0.01;
    if (b.cracks.visible) {
      b.cracks.material.opacity = 0.9 * cr;
      for (let i = 0; i < R.CRACK_N; i++) {
        const h1 = ZoneKit.hash(i, 941), h2 = ZoneKit.hash(i, 947), h3 = ZoneKit.hash(i, 953);
        const zz = -(h1 * 62) - 2;
        const len = 1.6 + h2 * 4.4;
        [0, 1].forEach((k) => {
          o.position.set((h2 - 0.5) * 3.2, k ? (CFG.H - 0.03) : 0.03, zz + k * 3.1);
          o.rotation.set(0, (h3 - 0.5) * 1.1, 0);
          o.scale.set(0.6 + h3 * 1.4, 1, len * (0.5 + 0.5 * cr));
          o.updateMatrix();
          b.cracks.setMatrixAt(i * 2 + k, o.matrix);
        });
      }
      b.cracks.instanceMatrix.needsUpdate = true;
    }
    /* 出口の大鏡（鏡片が集まってできる） */
    b.mirror.visible = gk > 0.02;
    if (b.mirror.visible) {
      b.mirror.position.set(0, CFG.H / 2, mz);
      const k = 0.5 + 0.5 * gk;
      b.mirror.scale.set(k, k, 1);
      b.paneMat.opacity = 0.30 + 0.45 * gk;
      b.wellMat.opacity = 0.25 + 0.45 * gk;
      b.well.rotation.z = t * 0.5;
      b.light.position.set(0, CFG.H / 2, mz + 4);
      b.light.intensity = 46 * gk * (0.85 + 0.15 * Math.sin(t * 6));
    } else {
      b.light.intensity = 0;
    }
    /* 舞う鏡の粉（既存の粉塵を銀色で使い回す） */
    if (d) {
      d.mat.color.setHex(0xcfe0f4);
      d.mat.opacity = 0.08 + 0.26 * br;
      const o2 = d.dummy;
      for (let i = 0; i < d.count; i++) {
        const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
        const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
        const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
        const u = (h1 + (t * 0.26 + i * 0.013)) % 1;
        o2.position.set((h2 - 0.5) * 7.0, (h3 < 0.5 ? 0.3 : CFG.H - 0.3) + (h3 - 0.5) * 3.0, -4 - u * 58);
        o2.rotation.set(t * (0.7 + h1) + i, t * 0.5 + i, t * (0.3 + h2));
        o2.scale.setScalar((0.35 + h3 * 1.2) * (1 - u * 0.3));
        o2.updateMatrix();
        d.mesh.setMatrixAt(i, o2.matrix);
      }
      d.mesh.instanceMatrix.needsUpdate = true;
    }
  },

  /* ---- 神殿崩壊（S4）の造形 ----------------------------------------------
     ・**倒れる柱**: 走行空間（|x| ≤ 1.45）の外・壁パネルの内側（|x| = 2.42）に立ち、
       根元を軸に前方へ倒れる。当たり判定は持たない見た目だが、判定を持つ
       「横断する梁（COLUMN）」と縦レーザーが同じ場面で来るので、
       画面の崩壊と手の忙しさが一致する。
     ・**天井の上を横切る梁**: y > H（天井の外）を落ちて渡る。走行空間には入らない。
     ・出口の光: 演出の終わりに前方が白く抜ける。 */
  _buildTemple(scene) {
    const T = Setpieces.TEMPLE;
    const col = ZoneKit.merge([
      { g: new THREE.CylinderGeometry(T.COL_R, T.COL_R * 1.12, T.COL_H, 7), p: [0, T.COL_H / 2, 0] },
      { g: ZoneKit.box(T.COL_R * 2.5, 0.26, T.COL_R * 2.5), p: [0, 0.13, 0] },
      { g: ZoneKit.box(T.COL_R * 2.6, 0.30, T.COL_R * 2.6), p: [0, T.COL_H - 0.15, 0] },
      { g: ZoneKit.box(T.COL_R * 2.1, 0.16, T.COL_R * 2.1), p: [0, T.COL_H - 0.40, 0] }
    ]);
    const cm = new THREE.InstancedMesh(col, new THREE.MeshLambertMaterial({ color: 0x9b845a, flatShading: true }), T.COL_N);
    cm.frustumCulled = false;
    cm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cm.visible = false;
    scene.add(cm);
    const beam = ZoneKit.merge([
      { g: ZoneKit.box(7.4, 0.42, 0.62), p: [0, 0, 0] },
      { g: ZoneKit.box(0.7, 0.5, 0.7), p: [-3.3, -0.1, 0] },
      { g: ZoneKit.box(0.7, 0.5, 0.7), p: [3.3, -0.1, 0] }
    ]);
    const bm = new THREE.InstancedMesh(beam, new THREE.MeshLambertMaterial({ color: 0x7d6a45, flatShading: true }), T.BEAM_N);
    bm.frustumCulled = false;
    bm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bm.visible = false;
    scene.add(bm);
    /* 出口の光（外へ抜ける瞬間） */
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe9c2, transparent: true, opacity: 0,
                                                  depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(CFG.HALF_W * 2 + 2.6, CFG.H + 2.6), glowMat);
    glow.renderOrder = 7;
    glow.visible = false;
    scene.add(glow);
    /* 崩壊を照らす明かり（倒れる柱の面を起こす） */
    Setpieces.templeLight = new THREE.PointLight(0xffc184, 0, 34, 2);
    Setpieces.templeLight.position.set(0, CFG.H / 2, -12);
    scene.add(Setpieces.templeLight);
    Setpieces.temple = { cols: cm, beams: bm, glow: glow, glowMat: glowMat, dummy: new THREE.Object3D() };
  },

  _hideTemple() {
    const tp = Setpieces.temple;
    if (!tp) return;
    if (tp.cols.visible || tp.beams.visible || tp.glow.visible) {
      tp.cols.visible = false; tp.beams.visible = false;
      tp.glow.visible = false; tp.glowMat.opacity = 0;
    }
    if (Setpieces.templeLight) Setpieces.templeLight.intensity = 0;
  },

  /* 倒れる柱・落ちる梁・出口の光の更新（すべて距離の関数） */
  _syncTemple(dist, t) {
    const s = Setpieces.state, tp = Setpieces.temple, T = Setpieces.TEMPLE, d = Setpieces.dust;
    if (!tp) return;
    tp.cols.visible = true;
    tp.beams.visible = true;
    const o = tp.dummy;
    for (let i = 0; i < T.COL_N; i++) {
      const at = Setpieces.templeColumnAt(i);
      const k = Setpieces.templeColumnK(i, dist);
      const side = (i % 2) ? 1 : -1;
      const ang = U.smooth(k) * 1.48 + (k >= 1 ? 0.02 * Math.sin(t * 3 + i) : 0);
      o.position.set(side * T.COL_X, 0, -(at - dist));
      o.rotation.set(ang, 0, 0);                       // 根元を軸に前方（+z）へ倒れる
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      tp.cols.setMatrixAt(i, o.matrix);
    }
    tp.cols.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < T.BEAM_N; i++) {
      const at = (s ? s.startM : 0) + T.BEAM_FROM + i * T.BEAM_STEP;
      const k = U.clamp((dist - (at - T.BEAM_LEAD)) / T.BEAM_FALL, 0, 1);
      const e = k * k;
      o.position.set((i % 2 ? 0.8 : -0.8), CFG.H + 3.4 - e * 3.1, -(at - dist));
      o.rotation.set(0, (i % 2 ? 0.12 : -0.12) * k, (i % 2 ? 1 : -1) * 0.55 * e);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      tp.beams.setMatrixAt(i, o.matrix);
    }
    tp.beams.instanceMatrix.needsUpdate = true;
    /* 出口の光 */
    const q = Setpieces.templeExit(dist);
    tp.glow.visible = q > 0.01;
    if (tp.glow.visible) {
      tp.glowMat.opacity = 0.46 * q * q;
      tp.glow.position.set(0, CFG.H / 2, -Math.max(2, (s.startM + T.END) - dist));
      tp.glow.scale.setScalar(1 + q * 0.45);
    }
    const rage = Setpieces.templeRage(dist);
    if (Setpieces.templeLight) {
      Setpieces.templeLight.intensity = 16 * (0.7 + 0.3 * Math.sin(t * 8.1)) * (0.4 + 0.6 * rage);
      Setpieces.templeLight.position.z = -14;
    }
    /* 粉塵（既存の粒子を砂色で使い回す） */
    if (d) {
      d.mat.color.setHex(0xd9c49a);
      d.mat.opacity = 0.14 + 0.24 * rage;
      const o2 = d.dummy;
      /* 粒は DUST_N 個だけ使う（残りは畳む）＝塗り面積を抑えて1フレームの予算を守る */
      const use = Math.min(d.count, T.DUST_N);
      for (let i = 0; i < d.count; i++) {
        if (i >= use) {
          o2.position.set(0, -9999, 0);
          o2.rotation.set(0, 0, 0);
          o2.scale.set(0.0001, 0.0001, 0.0001);
        } else {
          const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
          const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
          const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
          const u = (h1 + (t * 0.26 + i * 0.013)) % 1;
          o2.position.set((h2 - 0.5) * 6.4, (h3 < 0.5 ? 0.25 : CFG.H - 0.25) + (h3 - 0.5) * 3.0, -6 - u * 58);
          o2.rotation.set(t * (0.6 + h1) + i, t * 0.4 + i, t * (0.3 + h2));
          o2.scale.setScalar((0.4 + h3 * 1.5) * (1 - u * 0.3));
        }
        o2.updateMatrix();
        d.mesh.setMatrixAt(i, o2.matrix);
      }
      d.mesh.instanceMatrix.needsUpdate = true;
    }
  },

  /* ---- 巨岩（S3「巨岩の追跡」）の造形 ------------------------------------
     ・コリドーより大きい石球。遺跡ごと砕きながら転がって来る。
     ・普段は画面の後ろにいるので描画コストはほぼ0（視錐台の外）。
       **振り返りカット**のあいだだけ画面に入る（契約§4.4 の合格条件）。
     ・前方の床と天井には「巨岩の影」が落ちる＝振り返らなくても迫っているのが分かる。 */
  _buildRock(scene) {
    const R = Setpieces.ROCK.R;
    const g = new THREE.Group();
    g.visible = false;
    /* 岩肌: 正20面体を細かく割り、**頂点を乱して凹凸を彫る**（テクスチャ画像は使わない / 契約§3）。
       ・大きなうねり（塊感）＋ 細かいざらつき（岩肌）
       ・**帯状の溝**を3本（軸違い）彫る＝球の緯線に見えるので、転がりが目で追える
       2026-09-22 実機評「茶色の塊に見えて球と読めない」への対応。 */
    const geo = new THREE.IcosahedronGeometry(R, 4);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    /* 溝の軸（この軸まわりの緯線を凹ませる） */
    const axes = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0.35, 0).normalize(),
                  new THREE.Vector3(0.2, -0.4, 1).normalize()];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      const big = Math.sin(n.x * 2.1 + n.y * 1.7) * Math.cos(n.z * 2.4 - n.y * 1.1);   // うねり
      const fine = Math.abs(Math.sin(n.x * 11.3 + n.y * 17.1 + n.z * 13.7)) % 1;       // ざらつき
      let k = 0.90 + big * 0.055 + fine * 0.045;   // 最大 1.0（判定の半径を超えない）
      /* 帯状の溝: 軸からの角度が帯に近いところを深く削る */
      for (let a = 0; a < axes.length; a++) {
        const c = n.dot(axes[a]);
        const band = Math.exp(-Math.pow((Math.abs(c) - 0.42) / 0.10, 2));
        k -= 0.105 * band;
      }
      v.copy(n).multiplyScalar(R * k);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    /* 転がるのは岩体だけ（破片は別の群にしておく） */
    const spin = new THREE.Group();
    g.add(spin);
    const body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x6b5734, flatShading: true }));
    spin.add(body);
    /* 溝に沿って走る色の違う帯（転がりが一目で分かる） */
    axes.forEach((ax, i) => {
      const band = new THREE.Mesh(new THREE.TorusGeometry(R * 0.90, R * 0.085, 5, 24),
                                  new THREE.MeshLambertMaterial({ color: i ? 0xa78d58 : 0x3a2d1b, flatShading: true }));
      /* トーラスは xy 平面にできるので、その法線(z)を溝の軸に向ける */
      band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ax);
      spin.add(band);
    });
    /* 抉れた面（色違いの岩塊）と、えぐれたクレーター（暗い凹み） */
    [[0.6, 0.5, 0.4], [-0.5, -0.4, 0.6], [0.2, -0.7, -0.5]].forEach((q, i) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(R * 0.6, R * 0.5, R * 0.55),
                               new THREE.MeshLambertMaterial({ color: i ? 0xa38c5e : 0x76613c, flatShading: true }));
      c.position.set(q[0] * R * 0.8, q[1] * R * 0.8, q[2] * R * 0.8);
      c.rotation.set(q[0] * 2, q[1] * 2, q[2] * 2);
      spin.add(c);
    });
    [[0.9, 0.2, 0.35], [-0.3, 0.85, -0.4], [0.35, -0.6, 0.72], [-0.8, -0.2, -0.55]].forEach((q, i) => {
      const n2 = new THREE.Vector3(q[0], q[1], q[2]).normalize();
      const cr = new THREE.Mesh(new THREE.SphereGeometry(R * (0.20 + 0.06 * (i % 2)), 10, 8),
                                new THREE.MeshLambertMaterial({ color: 0x3f3220, flatShading: true }));
      cr.position.copy(n2).multiplyScalar(R * 0.90);
      cr.scale.set(1, 1, 0.55);
      cr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n2);
      spin.add(cr);
    });
    /* 砕けた石が周りに舞う（巨岩と一緒に転がってくる破片） */
    const deb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5),
                                        new THREE.MeshLambertMaterial({ color: 0x6d5a3a, flatShading: true }), 26);
    deb.frustumCulled = false;
    deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(deb);
    scene.add(g);
    /* 巨岩の影（前方の床と天井を覆う暗い帯。近づくほど濃く・手前まで伸びる） */
    const shadows = [];
    [['floor', 0.03, -Math.PI / 2], ['ceil', CFG.H - 0.03, Math.PI / 2]].forEach((c) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(CFG.HALF_W * 2 + 1.2, 30),
                               new THREE.MeshBasicMaterial({ color: 0x120c04, transparent: true,
                                                             opacity: 0, depthWrite: false, fog: true }));
      m.rotation.x = c[2];
      m.position.set(0, c[1], 0);
      m.renderOrder = 2;
      m.visible = false;
      scene.add(m);
      shadows.push(m);
    });
    Setpieces.rock = { group: g, spin: spin, body: body, deb: deb, dummy: new THREE.Object3D(),
                       shadows: shadows, n: 26 };
  },

  /* 巨岩が画面をどれだけ覆っているか 0..1（描いていないときは 0）。
     契約§4.4 S3「巨岩が迫っている恐怖が画面で分かる」の合格条件を測る窓口。 */
  rockOnScreen() {
    const r = Setpieces.rock;
    if (!r || !r.spin.visible) return 0;
    if (typeof World === 'undefined' || !World.ready) return 0;
    return World.projectCoverage(Setpieces.rockBox());
  },

  /* 巨岩の判定用ボックス（監査: 画面内に映っているかを測る） */
  rockBox() {
    const s = Setpieces.state;
    if (!s || s.id !== 'rockchase') return null;
    const R = Setpieces.ROCK.R, z = s.gap;
    return { x0: -R, x1: R, y0: CFG.H / 2 - R, y1: CFG.H / 2 + R, z0: z - R, z1: z + R };
  },

  /* 粉塵と「落ちていく瓦礫板」の更新（World.render から） */
  syncView(dist, t) {
    const d = Setpieces.dust;
    if (!d) return;
    const s = Setpieces.state;
    /* 滑空: 眼下の街と雲の層を出す（ゾーン側が持つ演出）＋ 自由飛行の空中障害物と DUO体 */
    {
      const fx = Setpieces.camFx();
      Zones.setGlide(fx && fx.glide ? fx.glide : 0);
      FF.syncView(dist, t, Setpieces.viewLift(dist), Setpieces.duoK(dist));
    }
    if (s && s.id === 'collapseall') {
      Setpieces._hideRock(); Setpieces._hideTemple(); Setpieces._hideFish();
      Setpieces._hideBlast(); Setpieces._hideShatter();
      Setpieces._syncFall(dist, t);
      return;
    }
    Setpieces._hideFall();
    if (s && s.id === 'shatter') {
      Setpieces._hideRock(); Setpieces._hideTemple(); Setpieces._hideFish(); Setpieces._hideBlast();
      Setpieces._syncShatter(dist, t);
      return;
    }
    Setpieces._hideShatter();
    if (s && s.id === 'blastout') {
      Setpieces._hideRock(); Setpieces._hideTemple(); Setpieces._hideFish();
      Setpieces._syncBlast(dist, t);
      return;
    }
    Setpieces._hideBlast();
    if (s && s.id === 'megafish') { Setpieces._hideRock(); Setpieces._hideTemple(); Setpieces._syncFish(dist, t); return; }
    Setpieces._hideFish();
    if (s && s.id === 'templefall') { Setpieces._hideRock(); Setpieces._syncTemple(dist, t); return; }
    Setpieces._hideTemple();
    if (s && s.id === 'rockchase') { Setpieces._syncRock(dist, t); return; }
    Setpieces._hideRock();
    if (s && s.id === 'bigjump') {
      if (d.mat.opacity !== 0) d.mat.opacity = 0;
      if (Setpieces.emberLight) Setpieces.emberLight.intensity = 0;
      return;
    }
    if (!s) {
      if (d.mat.opacity !== 0) { d.mat.opacity = 0; }
      if (Setpieces.emberLight) Setpieces.emberLight.intensity = 0;
      return;
    }
    d.mat.color.copy(d.base);
    if (Setpieces.emberLight) {
      Setpieces.emberLight.intensity = 26 * (0.75 + 0.25 * Math.sin(s.t * 7.3));
      Setpieces.emberLight.distance = 42;
      Setpieces.emberLight.position.z = 10;
    }
    d.mat.opacity = 0.34;
    const o = d.dummy;
    for (let i = 0; i < d.count; i++) {
      const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
      const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
      const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
      /* 崩落前線から前方へ流れて、プレイヤーを追い越していく瓦礫と粉塵。
         （カメラは前を向いているので、前線そのものではなく「飛んでくる破片」で見せる） */
      const span = (dist + 26) - s.front;
      const u = (h1 + (t * 0.18 + i * 0.013)) % 1;
      const zM = s.front + u * Math.max(span, 1);
      const age = U.clamp(u * 1.25, 0, 1);
      const x = (h2 - 0.5) * 6.2;
      const y = (h3 < 0.5 ? 0.25 : CFG.H - 0.25) + (h3 - 0.5) * 2.6 + Math.sin(t * 2 + i) * 0.5 * age;
      o.position.set(x, y, -(zM - dist));
      o.rotation.set(t * (0.6 + h1) + i, t * 0.4 + i, t * (0.3 + h2));
      o.scale.setScalar((0.45 + h3 * 1.5) * (1 - age * 0.35));
      o.updateMatrix();
      d.mesh.setMatrixAt(i, o.matrix);
    }
    d.mesh.instanceMatrix.needsUpdate = true;
  },

  _hideRock() {
    const r = Setpieces.rock;
    if (!r || !r.group.visible) return;
    r.group.visible = false;
    r.shadows.forEach((m) => { m.visible = false; m.material.opacity = 0; });
  },
  /* 巨岩・その影・舞う破片の更新（距離の関数。フレームに依存しない） */
  _syncRock(dist, t) {
    const s = Setpieces.state, r = Setpieces.rock, d = Setpieces.dust;
    if (!r) return;
    const R = Setpieces.ROCK;
    const p = Setpieces.rockProx();
    /* 巨岩は 2体の **後ろ** gap m。転がりは走行距離に比例（フレームに依存しない）。
       ■ 岩体を描くのは「振り返りカットの間」と「押し潰される瞬間」だけ。
         前向きのカメラ（z=+8）より手前に岩の前面が来るので、ふだん描くと
         画面を岩で塞いでしまう（後ろにいるものは前向きのカメラには映らない）。
         ふだんは **影・地響き・飛んでくる破片・土煙** で迫っているのを見せる。 */
    r.group.visible = true;
    r.spin.visible = (Setpieces.lookBack(dist) > 0.02) || !!s.caught;
    r.group.position.set(0, CFG.H / 2 - 0.35, s.gap);
    r.spin.rotation.x = -(s.rockM || 0) / R.R;      // 走行距離に比例して転がる
    /* 周りに舞う破片 */
    const o = r.dummy;
    for (let i = 0; i < r.n; i++) {
      const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
      const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
      const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
      const u = (h1 + t * 0.4 + i * 0.017) % 1;
      /* 破片は巨岩から前へ飛び出して2体を追い越す（ローカル座標＝群の原点から見た位置） */
      const zz = -R.R * 0.6 - u * (s.gap + 6);
      o.position.set((h2 - 0.5) * 6.4, (h3 < 0.5 ? 0.4 : CFG.H - 0.4) + (h3 - 0.5) * 2.2, zz);
      o.rotation.set(t * (1.2 + h1) + i, t * 0.8 + i, t * (0.6 + h2));
      o.scale.setScalar((0.5 + h3 * 1.5) * (1 - u * 0.5));
      o.updateMatrix();
      r.deb.setMatrixAt(i, o.matrix);
    }
    r.deb.instanceMatrix.needsUpdate = true;
    /* 影: 巨岩の手前から前方へ伸びる。近いほど濃く、遠くまで届く */
    r.shadows.forEach((m) => {
      m.visible = true;
      m.material.opacity = 0.10 + 0.42 * p;
      m.position.z = s.gap - 15 - 14 * (1 - p);
    });
    /* 土煙（既存の粉塵を茶色に染めて使い回す） */
    if (d) {
      d.mat.color.setHex(0xc9a878);
      d.mat.opacity = 0.16 + 0.22 * p;
      const o2 = d.dummy;
      for (let i = 0; i < d.count; i++) {
        const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
        const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
        const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
        const u = (h1 + (t * 0.3 + i * 0.013)) % 1;
        const zM = s.gap - u * (s.gap + 30);
        o2.position.set((h2 - 0.5) * 6.6, (h3 < 0.5 ? 0.3 : CFG.H - 0.3) + (h3 - 0.5) * 2.8, zM);
        o2.rotation.set(t * (0.6 + h1) + i, t * 0.4 + i, t * (0.3 + h2));
        o2.scale.setScalar((0.4 + h3 * 1.4) * (1 - u * 0.3));
        o2.updateMatrix();
        d.mesh.setMatrixAt(i, o2.matrix);
      }
      d.mesh.instanceMatrix.needsUpdate = true;
    }
    /* 巨岩を照らす明かり（岩の手前に置いて面を起こす＝振り返ったときに形が読める） */
    if (Setpieces.emberLight) {
      /* カット1は手前の遺跡が飛ぶので弱く、カット2は岩の輪郭を起こすので強く（2026-09-22） */
      const cut = Setpieces.lookBackCut(dist);
      const base = Setpieces.ROCK.EMBER[cut < 0 ? 0 : cut];
      Setpieces.emberLight.color.setHex(0xffb066);
      Setpieces.emberLight.intensity = base * (0.85 + 0.15 * Math.sin(s.t * 9.1));
      /* 岩のすぐ手前に置き、届く距離を絞る＝岩の面だけを起こし、手前の遺跡は飛ばさない */
      Setpieces.emberLight.distance = Setpieces.ROCK.EMBER_D;
      Setpieces.emberLight.position.set(0, CFG.H / 2, s.gap - Setpieces.ROCK.R - 1.4);
    }
  },

  /* ---- 後始末（リトライ・タイトル・テストの復帰で必ず呼ぶ） -------------- */
  reset() {
    Setpieces.state = null;
    FF.reset();
    if (typeof HUD !== 'undefined' && HUD.freeFlight) HUD.freeFlight(false);
    Setpieces._hideRock();
    Setpieces._hideTemple();
    Setpieces._hideFish();
    Setpieces._hideBlast();
    Setpieces._hideShatter();
    Setpieces._hideFall();
    if (Setpieces.dust) { Setpieces.dust.mat.opacity = 0; Setpieces.dust.mat.color.copy(Setpieces.dust.base); }
    if (Setpieces.emberLight) {
      Setpieces.emberLight.intensity = 0;
      Setpieces.emberLight.color.setHex(0xff5a2a);
      Setpieces.emberLight.distance = 42;
      Setpieces.emberLight.position.set(0, CFG.H / 2, 14);
    }
    Zones.setGlide(0);
    if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    if (typeof World !== 'undefined' && World.ready) World.clearSetpieceFx();
  }
};
