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

    // 右房
    raEes: 0.17,      // mmHg/mL
    raAlpha: 0.08,    // mmHg
    raBeta: 0.04,     // 1/mL
    raV0: 0,          // mL

    // 左房（Reservoir EDPVR - MV閉鎖時）
    laEes: 0.2,       // mmHg/mL
    laAlpha: 0.12,    // mmHg
    laBeta: 0.05,     // 1/mL
    laV0: 0,          // mL
    laContractionEnabled: true, // 左房収縮の有無

    // 三尖弁
    rt: 0.01,         // mmHg·s/mL
    lt: 0.0001,       // mmHg·s²/mL
    tvArea: 7.0,      // cm^2（正常三尖弁面積）

    // 僧帽弁
    rm: 0.01,         // mmHg·s/mL
    lm: 0.0001,       // mmHg·s²/mL
    msEnabled: false, // MS（僧帽弁狭窄）
    msMva: 1.5,       // cm^2（弁口面積）
    mvArea: 4.0,      // cm^2（通常時の弁口面積）
    mrEnabled: false, // MR（僧帽弁逆流）
    mrEroa: 0.2,      // cm^2（逆流弁口面積）
    mrCd: 0.75,       // 逆流オリフィス係数（Cd）

    // 右室
    rvEes: 0.4,       // mmHg/mL
    rvAlpha: 0.02,    // mmHg
    rvBeta: 0.04,     // 1/mL
    rvV0: 0,          // mL

    // 左室
    lvEes: 2.5,       // mmHg/mL
    lvAlpha: 0.03,    // mmHg
    lvBeta: 0.05,     // 1/mL
    lvV0: 0,          // mL

    // 肺動脈弁
    rp: 0.01,         // mmHg·s/mL
    lp: 0.0001,       // mmHg·s²/mL

    // 大動脈弁
    ra: 0.02,         // mmHg·s/mL
    la: 0.0001,       // mmHg·s²/mL
    asEnabled: false, // AS（大動脈弁狭窄）
    asAva: 1.5,       // cm^2（弁口面積）
    arEnabled: false, // AR（大動脈弁逆流）
    arEroa: 0.3,      // cm^2（逆流弁口面積）
    arCd: 0.88,       // 逆流オリフィス係数（Cd）

    // 肺循環
    cp: 4.0,          // mL/mmHg
    pvr: 100,         // dynes·sec·cm⁻⁵（肺動脈側）
    pvrVenous: 20,    // dynes·sec·cm⁻⁵（肺静脈側）
    paArea: 5.0,      // cm^2（主肺動脈断面積: Water hammer項）
    pvAlpha: 0.25,    // mmHg（肺静脈EDPVR α）
    pvBeta: 0.02,     // 1/mL（肺静脈EDPVR β）
    pvV0: 0,          // mL（肺静脈EDPVR V0）
    paRetroGain: 0.5, // LA逆行波のPA反映ゲイン
    paRetroTau: 0.06, // LA波形のLPF時定数 (s)
    paRetroMeanTau: 0.5, // LA平均圧のLPF時定数 (s)
    paRetroBaseDelay: 0.16, // LA逆行波の基準遅延 (s)
    paRetroGateP: 6.0, // 逆行波ゲート圧 (mmHg)
    paRetroGateW: 2.0,  // ゲート幅 (mmHg)
    paWhDecayTau: 0.02,  // s（PA water hammer減衰）

    // 大動脈
    ca: 1.5,          // mL/mmHg
    svr: 1000,        // dynes·sec·cm⁻⁵
    aoArea: 8.0       // cm^2（上行大動脈断面積: Water hammer項）
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
    laRetroLPF: 8,   // mmHg（LA逆行波用LPF）
    laMeanPressure: 8, // mmHg（LA平均圧LPF）

    // 右房
    raVolume: 40,    // mL
    raPressure: 5,   // mmHg
    raElastance: 0,  // mmHg/mL

    // 左室
    lvVolume: 120,   // mL
    lvPressure: 8,   // mmHg
    lvElastance: 0,  // mmHg/mL
    lvEDP: 8,        // mmHg（拡張末期圧）
    lvESP: 8,        // mmHg（収縮末期圧）
    lvESPTime: 0,    // sec（収縮末期圧の記録時刻）

    // 右室
    rvVolume: 140,   // mL
    rvPressure: 5,   // mmHg
    rvElastance: 0,  // mmHg/mL

    // 静脈リザーバー
    vvVolume: 400,   // mL（静脈容量）
    vvPressure: 8,   // mmHg（静脈圧 = 動的に計算）

    // 肺動脈
    paPressure: 15,  // mmHg
    paReservoirPressure: 15, // mmHg
    pvVolume: 175,   // mL（肺静脈リザーバー容量: P≈8mmHgになる目安）
    pvReservoirPressure: 8, // mmHg（肺静脈リザーバー圧）

    // 大動脈
    aoPressure: 80,  // mmHg
    aoReservoirPressure: 80, // mmHg（Windkesselリザーバー圧）
    // 弁の流量
    mitralFlow: 0,   // mL/s（正負を含む合算）
    mitralForwardFlow: 0, // mL/s（順行性のみ）
    aorticFlow: 0,   // mL/s（正負を含む合算）
    aorticForwardFlow: 0, // mL/s（順行性のみ）
    paWhSmoothed: 0, // mmHg（PA water hammer平滑化）
    tricuspidFlow: 0,     // mL/s
    tricuspidForwardFlow: 0, // mL/s
    pulmonaryFlow: 0,     // mL/s
    pulmonaryForwardFlow: 0, // mL/s
    pulmonaryVenousFlow: 0,  // mL/s（肺静脈流入）
    systemicVenousFlow: 0,   // mL/s（体静脈流入）
    pvCompliance: 0          // mL/mmHg（肺静脈コンプライアンス）
};
