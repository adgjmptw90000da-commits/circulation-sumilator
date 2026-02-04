/**
 * 循環シミュレーター - 定数・デフォルトパラメータ
 */

const DEFAULT_PARAMS = {
    // 心拍
    hr: 75,           // bpm
    prInterval: 0.15, // sec

    // 静脈リザーバー
    pv: 8,            // mmHg（平衡静脈圧）
    rv: 0.05,         // mmHg·s/mL（静脈抵抗：流入過多抑制のため0.05に増加）
    cv: 20,           // mL/mmHg（静脈コンプライアンス：50→20へ変更して圧変動を強調）
    vv0: 400,         // mL（静脈平衡容量）

    // 左房（Reservoir EDPVR - MV閉鎖時）
    laEes: 0.25,      // mmHg/mL
    laAlpha: 0.12,    // mmHg
    laBeta: 0.05,     // 1/mL
    laV0: 4,          // mL
    laContractionEnabled: true, // 左房収縮の有無

    // 僧帽弁
    rm: 0.01,         // mmHg·s/mL
    lm: 0.0001,       // mmHg·s²/mL
    msEnabled: false, // MS（僧帽弁狭窄）
    msMva: 1.5,       // cm^2（弁口面積）
    mvArea: 4.0,      // cm^2（通常時の弁口面積）
    mrEnabled: false, // MR（僧帽弁逆流）
    mrEroa: 0.2,      // cm^2（逆流弁口面積）
    mrCd: 0.75,       // 逆流オリフィス係数（Cd）

    // 左室
    lvEes: 2.3,       // mmHg/mL
    lvAlpha: 0.03,    // mmHg
    lvBeta: 0.05,     // 1/mL
    lvV0: 0,          // mL

    // 大動脈弁
    ra: 0.02,         // mmHg·s/mL
    la: 0.0001,       // mmHg·s²/mL
    asEnabled: false, // AS（大動脈弁狭窄）
    asAva: 1.5,       // cm^2（弁口面積）
    arEnabled: false, // AR（大動脈弁逆流）
    arEroa: 0.3,      // cm^2（逆流弁口面積）
    arCd: 0.88,       // 逆流オリフィス係数（Cd）

    // 大動脈
    ca: 1.5,          // mL/mmHg
    svr: 1200,        // dynes·sec·cm⁻⁵
    aoArea: 4.0       // cm^2（上行大動脈断面積: Water hammer項）
};

// シミュレーション設定
const SIM_CONFIG = {
    dt: 0.001,            // タイムステップ（秒）
    displayDuration: 10.0,  // グラフ表示時間（秒）= スイープ時間と同じ
    maxSpeed: 10          // 最大再生速度
};

// 初期状態
const INITIAL_STATE = {
    time: 0,
    cycleCount: 0,
    cyclePhase: 0,  // 0-1 の心周期位相

    // 左房
    laVolume: 40,    // mL
    laPressure: 8,   // mmHg
    laElastance: 0,  // mmHg/mL

    // 左室
    lvVolume: 120,   // mL
    lvPressure: 8,   // mmHg
    lvElastance: 0,  // mmHg/mL
    lvEDP: 8,        // mmHg（拡張末期圧）

    // 静脈リザーバー
    vvVolume: 400,   // mL（静脈容量）
    vvPressure: 8,   // mmHg（静脈圧 = 動的に計算）

    // 大動脈
    aoPressure: 80,  // mmHg
    aoReservoirPressure: 80, // mmHg（Windkesselリザーバー圧）
    radialPressure: 80,  // mmHg（橈骨動脈圧）

    // 弁の流量
    mitralFlow: 0,   // mL/s（正負を含む合算）
    mitralForwardFlow: 0, // mL/s（順行性のみ）
    aorticFlow: 0,   // mL/s（正負を含む合算）
    aorticForwardFlow: 0  // mL/s（順行性のみ）
};
