/**
 * 循環シミュレーター - シミュレーションエンジン
 * Phase 4: 左室フェーズを圧関係で判定
 */

class CirculationSimulator {
    constructor() {
        this.params = { ...DEFAULT_PARAMS };
        this.state = { ...INITIAL_STATE };
        this.history = {
            time: [],
            laPressure: [],
            laVolume: [],
            laElastance: [],
            lvPressure: [],
            lvVolume: [],
            lvElastance: [],
            aoPressure: [],
            mitralFlow: [],
            aorticFlow: [],
            venousFlow: [],
            venousPressure: [],  // 静脈圧の履歴
            ecg: []
        };
        this.maxHistoryLength = Math.ceil(SIM_CONFIG.displayDuration / SIM_CONFIG.dt);

        // 弁の状態（圧関係で決定）
        this.mitralValveOpen = true;
        this.aorticValveOpen = false;

        // 心周期フェーズ（圧関係から導出）
        this.lvPhase = 'filling';  // 'isovolContraction', 'ejection', 'isovolRelaxation', 'filling'
        this.laPhase = 'passive';  // 'passive', 'contraction', 'relaxation'

        // 収縮状態（時間で設定）
        this.lvContracting = false;  // 収縮中か（能動的収縮）
        this.lvRelaxing = false;     // 弛緩中か（能動的弛緩）
        this.laContracting = false;
        this.laRelaxing = false;

        // 収縮開始時のエラスタンスを記録（連続性のため）
        this.lvContractStartE = 0;
        this.laContractStartE = 0;

        // 僧帽弁開放時の左房エラスタンス追跡
        this.laMVOpenE = 0;           // MV開放直前のエラスタンス
        this.laMVOpenTime = 0;        // MV開放時刻
        this.laPassiveDecayK = 10.0;   // 減衰定数k
        this.prevMitralValveOpen = false;
        this.prevMitralValveOpenForLVEDP = false;
        this.pendingLVEDPUpdate = false;
        this.cycleMaxLVVolume = this.state.lvVolume;
        this.cycleMaxLVPressure = this.state.lvPressure;

        // LA EDPVR反転モデル用：アンカーポイント
        this.laEdpvrAnchor = {
            volume: 30,      // LA収縮末期容量
            pressure: 8      // その時点の圧
        };
        this.prevLaContracting = false;

        // 導管期モデル用：LA容量範囲の追跡
        this.laVolumeMin = 25;       // LA最小容量（A波後）
        this.laVolumeReservoir = 50; // Reservoir phase最大容量

        // オリフィス流量係数（ΔP: mmHg, 面積: cm^2, ρ: g/mL）
        this.orificeCoeff = Math.sqrt(2 * 1333 / 1.06);
    }

    updateParams(newParams) {
        Object.assign(this.params, newParams);
    }

    reset() {
        this.state = { ...INITIAL_STATE };
        this.mitralValveOpen = true;
        this.aorticValveOpen = false;
        this.lvPhase = 'filling';
        this.laPhase = 'passive';
        this.lvContracting = false;
        this.lvRelaxing = false;
        this.laContracting = false;
        this.laRelaxing = false;
        this.lvContractStartE = 0;
        this.laContractStartE = 0;
        this.laMVOpenE = 0;
        this.laMVOpenTime = 0;
        this.prevMitralValveOpen = false;
        this.prevMitralValveOpenForLVEDP = false;
        this.pendingLVEDPUpdate = false;
        this.cycleMaxLVVolume = this.state.lvVolume;
        this.cycleMaxLVPressure = this.state.lvPressure;
        // LA EDPVR反転モデル用：アンカーポイントをリセット
        this.laEdpvrAnchor = {
            volume: 30,
            pressure: 8
        };
        this.prevLaContracting = false;
        // 導管期モデル用：LA容量範囲をリセット
        this.laVolumeMin = 25;
        this.laVolumeReservoir = 50;
        this.clearHistory();
    }

    clearHistory() {
        for (const key in this.history) {
            this.history[key] = [];
        }
    }

    /**
     * EDPVRからエラスタンスを計算
     * EDPVR: P = α × (e^(β×(V-V0)) - 1)
     * E = P / (V - V0) となるようにして、P = E × (V - V0) で EDPVR上に乗る
     */
    calcEDPVRElastance(volume, alpha, beta, v0) {
        const vDiff = Math.max(0.1, volume - v0);  // ゼロ除算防止
        const pressure = alpha * (Math.exp(beta * vDiff) - 1);
        return pressure / vDiff;
    }

    /**
     * オリフィス式による流量（Q = Cd * A * sqrt(2ΔP/ρ)）
     * ΔP: mmHg, A: cm^2, ρ: g/mL → Q: mL/s
     */
    calcOrificeFlow(deltaP, area, cd) {
        if (deltaP <= 0 || area <= 0 || cd <= 0) return 0;
        return cd * area * this.orificeCoeff * Math.sqrt(deltaP);
    }

    /**
     * 滑らかな遷移関数（0→1）
     * シグモイドカーブ: 開始・終了が緩やか、中盤が急速（S字型）
     */
    smoothTransition(phase) {
        if (phase <= 0) return 0;
        if (phase >= 1) return 1;
        // シグモイド: 1 / (1 + e^(-k*(x-0.5)))
        const k = 10;  // 急峻さ（大きいほどS字が急）
        const sigmoid = 1 / (1 + Math.exp(-k * (phase - 0.5)));
        // 正規化（phase=0で0、phase=1で1になるように）
        const min = 1 / (1 + Math.exp(-k * (-0.5)));
        const max = 1 / (1 + Math.exp(-k * (0.5)));
        return (sigmoid - min) / (max - min);
    }

    /**
     * 心周期タイミング（収縮・弛緩のタイミングのみ）
     */
    getCycleTimings() {
        const cycleDuration = 60 / this.params.hr;

        // 左室：収縮・弛緩の時間設定
        const lvContractionDuration = 0.30;  // 収縮期間（ここでEesに到達）
        const lvRelaxationDuration = 0.15;   // 能動的弛緩期間

        // 左房：収縮・弛緩の時間設定
        const laContractionDuration = 0.10;
        const laRelaxationDuration = 0.08;
        // PR間隔 = P波開始（左房収縮開始）からQRS開始までの時間
        // QRSは時刻0なので、左房収縮は前の心周期末（cycleDuration - prInterval）に開始
        const laContractionStart = cycleDuration - this.params.prInterval;

        return {
            cycleDuration,
            // 左室（0 = QRS開始 = 収縮開始）
            lvContractionStart: 0,
            lvContractionDuration,
            lvRelaxationDuration,
            // 左房
            laContractionStart,
            laContractionDuration,
            laRelaxationDuration
        };
    }

    /**
     * 収縮・弛緩状態を更新（時間ベース）
     */
    updateContractionState(cycleTime, timings) {
        const { cycleDuration, lvContractionStart, lvContractionDuration, lvRelaxationDuration,
            laContractionStart, laContractionDuration, laRelaxationDuration } = timings;
        const t = cycleTime;

        // 左室の収縮・弛緩状態
        const prevLvContracting = this.lvContracting;
        const prevLvRelaxing = this.lvRelaxing;

        if (t < lvContractionDuration) {
            // 収縮期
            this.lvContracting = true;
            this.lvRelaxing = false;
            this.lvContractionPhase = t / lvContractionDuration;
        } else if (t < lvContractionDuration + lvRelaxationDuration) {
            // 能動的弛緩期
            this.lvContracting = false;
            this.lvRelaxing = true;
            this.lvRelaxationPhase = (t - lvContractionDuration) / lvRelaxationDuration;
        } else {
            // パッシブ期
            this.lvContracting = false;
            this.lvRelaxing = false;
        }

        // 収縮開始時のエラスタンスを記録
        if (this.lvContracting && !prevLvContracting) {
            this.lvContractStartE = this.state.lvElastance || this.calcEDPVRElastance(
                this.state.lvVolume, this.params.lvAlpha, this.params.lvBeta, this.params.lvV0
            );
        }

        // 左房の収縮・弛緩状態
        const prevLaContracting = this.laContracting;

        if (!this.params.laContractionEnabled) {
            this.laContracting = false;
            this.laRelaxing = false;
            this.laContractionPhase = 0;
            this.laRelaxationPhase = 0;
        } else {
            // 左房収縮期間の判定（心周期を跨ぐ可能性あり）
            const laContractEnd = laContractionStart + laContractionDuration;
            if (laContractEnd <= cycleDuration) {
                // 心周期内
                if (t >= laContractionStart && t < laContractEnd) {
                    this.laContracting = true;
                    this.laRelaxing = false;
                    this.laContractionPhase = (t - laContractionStart) / laContractionDuration;
                } else if (t >= laContractEnd && t < laContractEnd + laRelaxationDuration) {
                    this.laContracting = false;
                    this.laRelaxing = true;
                    this.laRelaxationPhase = (t - laContractEnd) / laRelaxationDuration;
                } else {
                    this.laContracting = false;
                    this.laRelaxing = false;
                }
            } else {
                // 心周期を跨ぐ
                const wrapEnd = laContractEnd - cycleDuration;
                if (t >= laContractionStart || t < wrapEnd) {
                    this.laContracting = true;
                    this.laRelaxing = false;
                    const elapsed = t >= laContractionStart ? (t - laContractionStart) : (t + cycleDuration - laContractionStart);
                    this.laContractionPhase = elapsed / laContractionDuration;
                } else if (t >= wrapEnd && t < wrapEnd + laRelaxationDuration) {
                    this.laContracting = false;
                    this.laRelaxing = true;
                    this.laRelaxationPhase = (t - wrapEnd) / laRelaxationDuration;
                } else {
                    this.laContracting = false;
                    this.laRelaxing = false;
                }
            }
        }

        // 左房収縮開始時のエラスタンスを記録（現在のEから連続的に上昇）
        if (this.laContracting && !prevLaContracting) {
            // 現在のエラスタンス値を使用
            this.laContractStartE = this.state.laElastance || this.calcEDPVRElastance(
                this.state.laVolume, this.params.laAlpha, this.params.laBeta, this.params.laV0
            );
        }

        // LA EDPVR反転モデル：LA収縮終了時（laContracting: true → false）にアンカーポイント更新
        if (this.prevLaContracting && !this.laContracting) {
            // LA収縮末期（= LV拡張末期）のLA容量と圧を記録
            this.laEdpvrAnchor.volume = this.state.laVolume;
            this.laEdpvrAnchor.pressure = this.state.laPressure;
        }
        this.prevLaContracting = this.laContracting;
    }

    /**
     * 左室フェーズを圧関係から判定
     */
    determineLVPhase() {
        const lvP = this.state.lvPressure;
        const laP = this.state.laPressure;
        const aoP = this.state.aoPressure;

        // 弁の状態を圧関係から判定
        const mvShouldOpen = laP > lvP;
        const avShouldOpen = lvP > aoP;

        // フェーズ判定
        if (this.lvContracting || this.lvRelaxing) {
            // 能動的収縮・弛緩中
            if (!mvShouldOpen && !avShouldOpen) {
                if (this.lvContracting) {
                    this.lvPhase = 'isovolContraction';
                } else {
                    this.lvPhase = 'isovolRelaxation';
                }
            } else if (avShouldOpen) {
                this.lvPhase = 'ejection';
            } else if (mvShouldOpen) {
                this.lvPhase = 'filling';
            }
        } else {
            // パッシブ期
            if (mvShouldOpen) {
                this.lvPhase = 'filling';
            } else {
                this.lvPhase = 'isovolRelaxation';  // 充満前の待機
            }
        }

        // 弁の状態を更新
        this.mitralValveOpen = mvShouldOpen && !this.lvContracting && (this.lvPhase === 'filling');
        this.aorticValveOpen = avShouldOpen && (this.lvPhase === 'ejection');
    }

    /**
     * 左室エラスタンスを計算
     * - 収縮中: startE → Ees（滑らかに遷移、収縮末期でEes到達）
     * - 弛緩中: Ees → eMin
     * - 充満期: E = EDPVR
     */
    calcLVElastance() {
        const eMin = this.calcEDPVRElastance(
            this.state.lvVolume,
            this.params.lvAlpha,
            this.params.lvBeta,
            this.params.lvV0
        );
        const eMax = this.params.lvEes;

        if (this.lvContracting) {
            // 収縮中: startE → Ees（phase=1でE=Ees）
            const startE = Math.min(this.lvContractStartE, eMax);
            return startE + (eMax - startE) * this.smoothTransition(this.lvContractionPhase);
        } else if (this.lvRelaxing) {
            // 弛緩中: Ees → eMin
            return eMax - (eMax - eMin) * this.smoothTransition(this.lvRelaxationPhase);
        } else {
            // 充満期: EDPVR上
            return eMin;
        }
    }

    /**
     * 指数関数的な遷移（初期に急激に変化、後半緩やか）
     * 弛緩期などに使用（圧を急速に下げるため）
     */
    exponentialTransition(phase) {
        if (phase <= 0) return 0;
        if (phase >= 1) return 1;
        // kが大きいほど初期変化が急
        const k = 5;
        return (1 - Math.exp(-k * phase)) / (1 - Math.exp(-k));
    }

    /**
     * 導管期のLA充満度に基づく重み(w)を計算
     * w = 0: LA empty → 圧はLVに従属
     * w = 1: LA充満 → 圧はEDPVRに従う
     */
    calcLAFillWeight(laVolume) {
        const vMin = this.laVolumeMin;
        const vMax = this.laVolumeReservoir;

        // 分母がゼロになるのを防ぐ
        if (vMax <= vMin) return 1.0;

        const w = (laVolume - vMin) / (vMax - vMin);
        return Math.max(0, Math.min(1, w));  // 0〜1にクランプ
    }

    /**
     * LA容量範囲を更新（動的追跡）
     * - LA収縮末期（A波後）にlaVolumeMinを更新
     * - MV閉鎖時（reservoir最大）にlaVolumeReservoirを更新
     */
    updateLAVolumeRange() {
        // LA収縮終了時（laContracting: true → false）に最小容量を記録
        if (this.prevLaContracting && !this.laContracting) {
            this.laVolumeMin = this.state.laVolume;
        }

        // MV閉鎖の瞬間（開→閉）にreservoir最大容量を記録
        if (this.prevMitralValveOpen && !this.mitralValveOpen) {
            this.laVolumeReservoir = this.state.laVolume;
        }
    }

    /**
     * 静脈流入計算（リザーバーモデル）
     */
    calcVenousInflow() {
        // Pmsf固定モード: 静脈圧をPvに固定（SVR変化でVR曲線が動かない前提）
        const vvPressure = this.params.pv;
        this.state.vvPressure = Math.max(0, vvPressure);

        const deltaP = this.state.vvPressure - this.state.laPressure;

        return deltaP / this.params.rv;
    }
    calcLAElastance(lvElastance) {
        const eMinReservoir = this.calcEDPVRElastance(
            this.state.laVolume,
            this.params.laAlpha,
            this.params.laBeta,
            this.params.laV0
        );
        const eMax = this.params.laEes;

        if (this.laContracting) {
            const startE = Math.max(this.laContractStartE, eMinReservoir);
            this.laPhase = 'contraction';
            return startE + (eMax - startE) * this.exponentialTransition(this.laContractionPhase);
        } else if (this.laRelaxing) {
            this.laPhase = 'relaxation';
            return eMax - (eMax - eMinReservoir) * this.exponentialTransition(this.laRelaxationPhase);
        } else {
            // MV開放・閉鎖に関わらず、LAは常に自身のEDPVR
            this.laPhase = 'passive';
            return eMinReservoir;
        }
    }

    /**
     * 僧帽弁開放時の左房エラスタンス追跡
     */
    updateLAPassiveElastance(dt) {
        const eMin = this.calcEDPVRElastance(
            this.state.laVolume,
            this.params.laAlpha,
            this.params.laBeta,
            this.params.laV0
        );

        // MV開放の瞬間を検出
        if (this.mitralValveOpen && !this.prevMitralValveOpen) {
            // 開放直前のエラスタンスと時刻を記録
            this.laMVOpenE = this.state.laElastance || eMin;
            this.laMVOpenTime = this.state.time;
        }

        this.prevMitralValveOpen = this.mitralValveOpen;
    }

    /**
     * ECG波形を生成
     */
    generateECG(cycleTime, timings) {
        const { cycleDuration, laContractionStart, laContractionDuration, lvContractionDuration } = timings;
        let t = cycleTime;
        let ecg = 0;

        // P波（心房脱分極）
        if (this.params.laContractionEnabled) {
            const pWaveStart = laContractionStart;
            const pWaveDuration = laContractionDuration * 0.8;
            if (t >= pWaveStart && t < pWaveStart + pWaveDuration) {
                const phase = (t - pWaveStart) / pWaveDuration;
                ecg += 0.25 * Math.sin(Math.PI * phase);
            }
        }

        // QRS波（心室脱分極）
        const qrsDuration = 0.08;
        if (t < qrsDuration) {
            const phase = t / qrsDuration;
            if (phase < 0.15) {
                ecg += -0.1 * Math.sin(Math.PI * phase / 0.15);
            } else if (phase < 0.5) {
                ecg += 1.0 * Math.sin(Math.PI * (phase - 0.15) / 0.35);
            } else if (phase < 0.7) {
                ecg += -0.2 * Math.sin(Math.PI * (phase - 0.5) / 0.2);
            }
        }

        // T波（心室再分極）
        const tWaveStart = lvContractionDuration * 0.8;
        const tWaveDuration = 0.16;
        if (t >= tWaveStart && t < tWaveStart + tWaveDuration) {
            const phase = (t - tWaveStart) / tWaveDuration;
            ecg += 0.3 * Math.sin(Math.PI * phase);
        }

        return ecg;
    }

    /**
     * 僧帽弁流量計算
     */
    calcMitralFlow(dt) {
        let forwardFlow = 0;

        // 順行性（LA → LV）: MS時はGorlin式、通常はR-Lモデル
        if (this.mitralValveOpen) {
            const deltaPForward = this.state.laPressure - this.state.lvPressure;
            if (deltaPForward > 0) {
                if (this.params.msEnabled) {
                    const area = Math.max(0, this.params.msMva);
                    forwardFlow = 37.7 * area * Math.sqrt(deltaPForward);
                } else {
                    const r = Math.max(1e-6, this.params.rm);
                    const l = this.params.lm;
                    if (l > 0) {
                        const qPrev = this.state.mitralForwardFlow || 0;
                        const dQdt = (deltaPForward - r * qPrev) / l;
                        forwardFlow = qPrev + dQdt * dt;
                    } else {
                        forwardFlow = deltaPForward / r;
                    }
                }
            }
        }

        if (forwardFlow < 0) forwardFlow = 0;
        this.state.mitralForwardFlow = forwardFlow;

        let flow = forwardFlow;

        // 逆流（LV → LA）: Gorlin式ベース
        if (this.params.mrEnabled) {
            const deltaPReg = this.state.lvPressure - this.state.laPressure;
            if (deltaPReg > 0) {
                const area = Math.max(0, this.params.mrEroa);
                const cd = Math.max(0, this.params.mrCd);
                const regFlow = this.calcOrificeFlow(deltaPReg, area, cd);
                flow -= regFlow;
            }
        }

        return flow;
    }

    /**
     * 大動脈弁流量計算
     */
    calcAorticFlow(dt) {
        let forwardFlow = 0;

        // 順行性（LV → AO）: R-Lモデル
        if (this.aorticValveOpen) {
            const deltaPForward = this.state.lvPressure - this.state.aoPressure;
            if (deltaPForward > 0) {
                if (this.params.asEnabled) {
                    const area = Math.max(0, this.params.asAva);
                    forwardFlow = 44.3 * area * Math.sqrt(deltaPForward);
                } else {
                    const r = Math.max(1e-6, this.params.ra);
                    const l = this.params.la;
                    if (l > 0) {
                        const qPrev = this.state.aorticForwardFlow || 0;
                        const dQdt = (deltaPForward - r * qPrev) / l;
                        forwardFlow = qPrev + dQdt * dt;
                    } else {
                        forwardFlow = deltaPForward / r;
                    }
                }
            }
        }

        if (forwardFlow < 0) forwardFlow = 0;
        this.state.aorticForwardFlow = forwardFlow;

        let flow = forwardFlow;

        // 逆流（AO → LV）: Gorlin式ベース
        if (this.params.arEnabled) {
            const deltaPReg = this.state.aoPressure - this.state.lvPressure;
            if (deltaPReg > 0) {
                const area = Math.max(0, this.params.arEroa);
                const cd = Math.max(0, this.params.arCd);
                const regFlow = this.calcOrificeFlow(deltaPReg, area, cd);
                flow -= regFlow;
            }
        }

        return flow;
    }



    /**
     * 1タイムステップ進める
     */
    step() {
        const dt = SIM_CONFIG.dt;
        const timings = this.getCycleTimings();

        // 心周期位相の更新
        this.state.time += dt;
        this.state.cyclePhase += dt / timings.cycleDuration;
        let cycleWrapped = false;
        if (this.state.cyclePhase >= 1) {
            this.state.cyclePhase -= 1;
            this.state.cycleCount++;
            cycleWrapped = true;
        }
        const cycleTime = this.state.cyclePhase * timings.cycleDuration;

        // === Step 1: 収縮・弛緩状態の更新（時間ベース）===
        this.updateContractionState(cycleTime, timings);

        // === Step 2: フェーズ判定（圧関係ベース）===
        this.determineLVPhase();

        // LVEDPは心周期のEDV時点で更新するため、弁閉鎖トリガーは使用しない
        this.prevMitralValveOpenForLVEDP = this.mitralValveOpen;

        // === Step 3: 流量計算（前回の圧を使用）===
        const mitralFlow = this.calcMitralFlow(dt);
        const aorticFlow = this.calcAorticFlow(dt);
        const venousFlow = this.calcVenousInflow();

        this.state.mitralFlow = mitralFlow;
        this.state.aorticFlow = aorticFlow;
        this.state.venousFlow = venousFlow;

        // === Step 4: 容量更新 ===
        this.state.laVolume += (venousFlow - mitralFlow) * dt;

        this.state.lvVolume += (mitralFlow - aorticFlow) * dt;
        this.state.lvVolume = Math.max(this.state.lvVolume, this.params.lvV0 + 0.1);


        // === Step 5: 左房パッシブエラスタンスの更新 ===
        this.updateLAPassiveElastance(dt);

        // === Step 5.5: LA容量範囲の更新（導管期モデル用）===
        this.updateLAVolumeRange();

        // === Step 6: エラスタンス計算 ===
        const lvE = this.calcLVElastance();
        const laE = this.calcLAElastance(lvE);

        this.state.laElastance = laE;
        this.state.lvElastance = lvE;

        // === Step 7: 圧力計算 ===
        // LV圧: P = E × (V - V0)
        this.state.lvPressure = Math.max(0, lvE * (this.state.lvVolume - this.params.lvV0));

        // LA圧: 導管期は充満度に応じてLV圧との補間
        const laEDPVRPressure = Math.max(0, laE * (this.state.laVolume - this.params.laV0));

        // 導管期判定: MV開放 && LA非収縮中
        const isConduitPhase = this.mitralValveOpen && !this.laContracting && !this.laRelaxing;

        if (isConduitPhase) {
            // 導管期: LA圧は充満度に応じてEDPVR圧とLV圧の間を補間
            const w = this.calcLAFillWeight(this.state.laVolume);
            let laPressure = w * laEDPVRPressure + (1 - w) * this.state.lvPressure;

            // LV急速充満によるベルヌーイ圧低下（負圧を許容）
            const qForward = Math.max(0, this.state.mitralForwardFlow || 0);
            if (qForward > 0) {
                const area = this.params.msEnabled ? this.params.msMva : this.params.mvArea;
                if (area > 0) {
                    // ΔP(mmHg) = 4 * v^2, v = (Q/A)/100 (m/s)
                    const deltaPBern = 0.0004 * Math.pow(qForward / area, 2);
                    laPressure -= deltaPBern;
                }
            }

            this.state.laPressure = laPressure;
        } else {
            // Reservoir / Booster pump phase: 通常のEDPVR圧
            this.state.laPressure = laEDPVRPressure;
        }

        if (cycleWrapped) {
            this.state.lvEDP = this.cycleMaxLVPressure;
            this.cycleMaxLVVolume = this.state.lvVolume;
            this.cycleMaxLVPressure = this.state.lvPressure;
        } else if (this.state.lvVolume > this.cycleMaxLVVolume) {
            this.cycleMaxLVVolume = this.state.lvVolume;
            this.cycleMaxLVPressure = this.state.lvPressure;
        }

        // デバッグ: E > Ees のチェック（閾値なし）
        if (lvE > this.params.lvEes) {
            console.warn(`E > Ees! lvE=${lvE.toFixed(4)}, lvEes=${this.params.lvEes}, lvPhase=${this.lvPhase}, contracting=${this.lvContracting}, relaxing=${this.lvRelaxing}, phase=${this.lvContractionPhase?.toFixed(2) || 'N/A'}`);
        }

        // デバッグ: PVループがESPVRを超えているかチェック
        const espvrP = this.params.lvEes * (this.state.lvVolume - this.params.lvV0);
        if (this.state.lvPressure > espvrP) {
            console.warn(`P > ESPVR! P=${this.state.lvPressure.toFixed(1)}, ESPVR_P=${espvrP.toFixed(1)}, V=${this.state.lvVolume.toFixed(1)}, E=${lvE.toFixed(4)}, Ees=${this.params.lvEes}`);
        }

        // === 大動脈圧（拡張期: Windkessel + 収縮期: Water hammer上乗せ）===
        // SVRはdynes·sec·cm⁻⁵で格納 → mmHg·s/mLに変換（÷1333）
        const svrMmHg = this.params.svr / 1333;
        const aoReservoirPressure = this.state.aoReservoirPressure ?? this.state.aoPressure;
        const aorticOutflow = aoReservoirPressure / svrMmHg; // 全身への流出量

        // 静脈容量更新: 流入（全身から） - 流出（左房へ）
        this.state.vvVolume += (aorticOutflow - venousFlow) * dt;

        // リザーバー圧（Windkessel）
        const nextReservoirPressure = Math.max(
            0,
            aoReservoirPressure + (aorticFlow - aorticOutflow) / this.params.ca * dt
        );
        this.state.aoReservoirPressure = nextReservoirPressure;

        // 収縮期（順行性流入あり）にWater hammer項を上乗せ
        const waterHammerPressure = this.calcWaterHammerPressure(aorticFlow);
        const reflectedPressure = this.calcAorticReflectedPressure();
        this.state.aoPressure = Math.max(0, nextReservoirPressure + waterHammerPressure + reflectedPressure);

        // ECG生成
        this.state.ecgValue = this.generateECG(cycleTime, timings);

        // 履歴に追加
        this.recordHistory();

        // 次回の計算のためにエラスタンスを保存
        this.lastLAElastance = laE;
    }

    recordHistory() {
        const h = this.history;
        h.time.push(this.state.time);
        h.laPressure.push(this.state.laPressure);
        h.laVolume.push(this.state.laVolume);
        h.laElastance.push(this.state.laElastance);
        h.lvPressure.push(this.state.lvPressure);
        h.lvVolume.push(this.state.lvVolume);
        h.lvElastance.push(this.state.lvElastance);
        h.aoPressure.push(this.state.aoPressure);
        h.mitralFlow.push(this.state.mitralFlow);
        h.aorticFlow.push(this.state.aorticFlow);
        h.venousFlow.push(this.state.venousFlow);
        h.venousPressure.push(this.state.vvPressure || params.pv); // 動的計算値、なければ固定値
        h.ecg.push(this.state.ecgValue || 0);

        if (h.time.length > this.maxHistoryLength) {
            for (const key in h) {
                h[key].shift();
            }
        }
    }

    getState() {
        return { ...this.state };
    }

    getHistory() {
        return this.history;
    }

    /**
     * Pulse Wave Velocity (PWV)を計算
     * PWV = k / sqrt(Ca) の簡易モデル
     */
    calcPWV() {
        const k = 2.5;  // 較正定数（Ca=1.5で PWV ≈ 2.0 m/s程度）
        const PWV = k / Math.sqrt(this.params.ca);
        return PWV;  // [m/s]
    }

    /**
     * Water hammer式で収縮期の圧上乗せ項を計算
     * ΔP = ρ * c * Δv から、Qと断面積で表現
     */
    calcWaterHammerPressure(aorticFlow) {
        if (aorticFlow <= 0) return 0;
        const areaCm2 = Math.max(0.1, this.params.aoArea || 4.0);
        const pwv = this.calcPWV(); // [m/s]
        const rho = 1060; // [kg/m^3]
        const flowM3s = aorticFlow * 1e-6; // [mL/s] -> [m^3/s]
        const areaM2 = areaCm2 * 1e-4;     // [cm^2] -> [m^2]
        const deltaPpa = rho * pwv * (flowM3s / areaM2); // [Pa]
        return deltaPpa / 133.322; // [mmHg]
    }

    /**
     * 中枢大動脈のaugmentation（反射波上乗せ）
     * PWVに応じて反射波の到達タイミングが変化する
     */
    calcAorticReflectedPressure() {
        const pwv = Math.max(0.1, this.calcPWV());
        // 中枢大動脈は主に下肢系の反射を受ける想定
        const reflectionDistance = 0.60; // [m] 大動脈基部から下肢主反射点まで
        const roundTripDelay = (2 * reflectionDistance) / pwv; // [s]
        const delayedFlow = this.getHistoryValueAtTime(
            this.history.aorticFlow,
            this.state.time - roundTripDelay,
            0
        );

        if (delayedFlow <= 0) return 0;

        // 中枢は弱めのaugmentationにする（SVRで強さも変化）
        const svrRatio = Math.max(0.3, this.params.svr / 1200);
        const svrStrength = Math.min(1.4, Math.max(0.7, Math.pow(svrRatio, 0.5)));
        const gammaCentralBase = Math.min(0.22, Math.max(0.05, this.calcReflectionCoefficient() * 0.25));
        const gammaCentral = Math.min(0.26, Math.max(0.04, gammaCentralBase * svrStrength));
        return gammaCentral * this.calcWaterHammerPressure(delayedFlow);
    }

    /**
     * 反射係数を計算
     * SVRが高いほど反射波が強くなる
     */
    calcReflectionCoefficient() {
        const SVR_normal = 1200;
        const Γ_base = 0.5;
        const scaling = 500;
        const delta_SVR = (this.params.svr - SVR_normal) / scaling;
        const Γ = Γ_base * (1 + Math.tanh(delta_SVR) * 0.3);
        return Math.min(0.8, Math.max(0.2, Γ));  // 0.2〜0.8に制限
    }

    /**
     * 履歴から指定時刻の大動脈圧を線形補間で取得
     */
    getPressureAtTime(targetTime) {
        return this.getHistoryValueAtTime(this.history.aoPressure, targetTime, this.state.aoPressure);
    }

    /**
     * 履歴から指定時刻の値を線形補間で取得
     */
    getHistoryValueAtTime(dataSeries, targetTime, fallbackValue) {
        const h = this.history;
        const series = dataSeries;

        // 履歴が不足している場合は現在の値を返す
        if (!series || h.time.length < 2 || series.length < 2) {
            return fallbackValue;
        }

        // 範囲外（過去すぎる）場合は最古の値
        if (targetTime <= h.time[0]) {
            return series[0];
        }

        // 範囲外（未来）場合は最新の値
        if (targetTime >= h.time[h.time.length - 1]) {
            return series[series.length - 1];
        }

        // 線形補間
        for (let i = 0; i < h.time.length - 1; i++) {
            if (h.time[i] <= targetTime && targetTime < h.time[i + 1]) {
                const alpha = (targetTime - h.time[i]) / (h.time[i + 1] - h.time[i]);
                return series[i] * (1 - alpha) + series[i + 1] * alpha;
            }
        }

        // フォールバック
        return series[series.length - 1] ?? fallbackValue;
    }

    /**
     * 大動脈圧の平均値を計算
     */
    getMeanAorticPressure() {
        const h = this.history;
        if (h.aoPressure.length < 10) {
            return this.state.aoPressure;
        }

        // 直近1拍分程度のデータから平均を計算
        const beatDuration = 60 / (this.params.hr || 75);
        const sampleCount = Math.min(
            Math.floor(beatDuration / SIM_CONFIG.dt),
            h.aoPressure.length
        );

        let sum = 0;
        for (let i = h.aoPressure.length - sampleCount; i < h.aoPressure.length; i++) {
            sum += h.aoPressure[i];
        }

        return sum / sampleCount;
    }
}
