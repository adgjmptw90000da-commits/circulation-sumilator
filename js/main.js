/**
 * 循環シミュレーター - メインエントリポイント
 */

class App {
    constructor() {
        this.simulator = new CirculationSimulator();
        this.chartManager = new ChartManager();
        this.isRunning = false;
        this.speed = 1;
        this.animationId = null;
        this.lastFrameTime = 0;
        this.balanceCurve = null;
        this.balanceCurveKey = '';
        this.balanceCurveTimer = null;
        this.balanceCurveToken = 0;
        this.balanceWorker = null;
        this.balanceCurvePendingKey = '';
        this.resizeRaf = 0;
        this.resizeObserver = null;

        this.initUI();
        this.bindEvents();
        this.setupResizeObserver();
        this.updateControls();
        this.scheduleBalanceCurve();

        // 初回描画
        this.chartManager.update(this.simulator, this.getScaleSettings(), null, this.getWaveformVisibility(), this.balanceCurve);
        this.updateStatus();
    }

    initUI() {
        // 既存のパラメータ値をUIに反映
        this.syncParamsToUI();
        this.syncSpeedFromUI();
        this.applyPressureVitalVisibility();
        this.updateParamGroupVisibility();
    }

    bindEvents() {
        // コントロールボタン
        document.getElementById('startBtn').addEventListener('click', () => this.toggleRun());
        document.getElementById('toggleParamsBtn').addEventListener('click', () => this.toggleParamsPanel());
        document.getElementById('openSettingsBtn').addEventListener('click', () => this.openSettingsModal());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('closeSettingsBtn').addEventListener('click', () => this.closeSettingsModal());
        const paramGroupSelect = document.getElementById('paramGroupSelect');
        if (paramGroupSelect) {
            paramGroupSelect.addEventListener('change', () => this.updateParamGroupVisibility());
        }

        const settingsModal = document.getElementById('settingsModal');
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                this.closeSettingsModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeSettingsModal();
        });

        // 速度スライダー
        const speedSlider = document.getElementById('speedSlider');
        speedSlider.addEventListener('input', (e) => {
            const raw = parseFloat(e.target.value);
            this.speed = this.speedFromSlider(raw);
            const snapped = this.sliderFromSpeed(this.speed);
            if (!isNaN(snapped)) {
                e.target.value = snapped.toString();
            }
            this.updateSpeedDisplay();
        });

        document.querySelectorAll('.waveform-toggle').forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                this.applyPressureVitalVisibility();
                this.redrawNow();
            });
        });

        document.querySelectorAll('.scale-input').forEach((input) => {
            const redraw = () => this.redrawNow();
            input.addEventListener('change', redraw);
            input.addEventListener('input', redraw);
        });

        // パラメータ入力
        this.bindParamInputs();

        // リサイズ対応
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    toggleParamsPanel() {
        const panel = document.getElementById('paramsPanel');
        const section = document.querySelector('.monitor-section');
        const button = document.getElementById('toggleParamsBtn');
        if (!panel || !section || !button) return;

        const hidden = panel.classList.toggle('is-hidden');
        section.classList.toggle('params-hidden', hidden);
        button.textContent = hidden ? '📋 パラメータ表示' : '📋 パラメータ';
        this.chartManager.resize();
        this.chartManager.update(this.simulator, this.getScaleSettings(), this.calculateMetrics(), this.getWaveformVisibility(), this.balanceCurve);
    }

    updateParamGroupVisibility() {
        const select = document.getElementById('paramGroupSelect');
        const groups = document.querySelectorAll('.param-group');
        if (!select || groups.length === 0) return;
        const value = select.value;
        groups.forEach((group) => {
            group.classList.toggle('is-active', group.dataset.group === value);
        });
    }

    handleResize() {
        if (this.resizeRaf) {
            cancelAnimationFrame(this.resizeRaf);
        }
        this.resizeRaf = requestAnimationFrame(() => {
            this.resizeRaf = 0;
            this.chartManager.resize();
            this.chartManager.update(this.simulator, this.getScaleSettings(), this.calculateMetrics(), this.getWaveformVisibility(), this.balanceCurve);
        });
    }

    setupResizeObserver() {
        if (!('ResizeObserver' in window)) return;
        const targets = [
            document.querySelector('.monitor-section'),
            document.querySelector('.charts-grid')
        ].filter(Boolean);
        if (targets.length === 0) return;
        this.resizeObserver = new ResizeObserver(() => {
            this.handleResize();
        });
        targets.forEach((target) => this.resizeObserver.observe(target));
    }

    scheduleBalanceCurve() {
        const scale = this.getScaleSettings();
        const key = JSON.stringify({
            params: this.simulator.params,
            balanceXMax: scale.balanceXMax
        });
        if (this.balanceCurve && this.balanceCurveKey === key) return;
        if (this.balanceCurveTimer) clearTimeout(this.balanceCurveTimer);
        const token = ++this.balanceCurveToken;
        this.balanceCurveTimer = setTimeout(() => {
            if (!this.balanceWorker) {
                this.balanceWorker = new Worker('js/balance-worker.js');
                this.balanceWorker.addEventListener('message', (e) => {
                    if (!e.data || !Array.isArray(e.data.results)) return;
                    if (e.data.token !== this.balanceCurveToken) return;
                    this.balanceCurve = e.data.results;
                    this.balanceCurveKey = this.balanceCurvePendingKey;
                    this.chartManager.update(this.simulator, this.getScaleSettings(), this.calculateMetrics(), this.getWaveformVisibility(), this.balanceCurve);
                });
            }
            this.balanceCurvePendingKey = key;
            this.balanceWorker.postMessage({
                token,
                params: this.simulator.params,
                xMax: scale.balanceXMax,
                points: 25,
                beats: 6
            });
        }, 150);
    }

    bindParamInputs() {
        const paramMapping = {
            'param-hr': 'hr',
            'param-pr': 'prInterval',
            'param-pv': 'pv',
            'param-rv': 'rv',
            'param-la-ees': 'laEes',
            'param-la-alpha': 'laAlpha',
            'param-la-beta': 'laBeta',
            'param-la-v0': 'laV0',
            'param-rm': 'rm',
            'param-lm': 'lm',
            'param-ms-mva': 'msMva',
            'param-mv-area': 'mvArea',
            'param-mr-eroa': 'mrEroa',
            'param-mr-cd': 'mrCd',
            'param-lv-ees': 'lvEes',
            'param-lv-alpha': 'lvAlpha',
            'param-lv-beta': 'lvBeta',
            'param-lv-v0': 'lvV0',
            'param-ra': 'ra',
            'param-la-inert': 'la',
            'param-as-ava': 'asAva',
            'param-ar-eroa': 'arEroa',
            'param-ar-cd': 'arCd',
            'param-ca': 'ca',
            'param-ao-area': 'aoArea',
            'param-svr': 'svr'
        };

        for (const [inputId, paramKey] of Object.entries(paramMapping)) {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('change', (e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value)) {
                        this.simulator.updateParams({ [paramKey]: value });
                        this.redrawNow();
                    }
                });
            }
        }

        const mrSelect = document.getElementById('param-mr');
        if (mrSelect) {
            mrSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                this.simulator.updateParams({ mrEnabled: enabled });
                this.redrawNow();
            });
        }

        const msSelect = document.getElementById('param-ms');
        if (msSelect) {
            msSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                this.simulator.updateParams({ msEnabled: enabled });
                this.redrawNow();
            });
        }

        const arSelect = document.getElementById('param-ar');
        if (arSelect) {
            arSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                this.simulator.updateParams({ arEnabled: enabled });
                this.redrawNow();
            });
        }

        const asSelect = document.getElementById('param-as');
        if (asSelect) {
            asSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                this.simulator.updateParams({ asEnabled: enabled });
                this.redrawNow();
            });
        }

        const laContractionSelect = document.getElementById('param-la-contraction');
        if (laContractionSelect) {
            laContractionSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                this.simulator.updateParams({ laContractionEnabled: enabled });
                this.redrawNow();
            });
        }
    }

    syncParamsToUI() {
        const params = this.simulator.params;
        const setInput = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        };

        setInput('param-hr', params.hr);
        setInput('param-pr', params.prInterval);
        setInput('param-pv', params.pv);
        setInput('param-rv', params.rv);
        setInput('param-la-ees', params.laEes);
        setInput('param-la-alpha', params.laAlpha);
        setInput('param-la-beta', params.laBeta);
        setInput('param-la-v0', params.laV0);
        setInput('param-ms-mva', params.msMva);
        setInput('param-mv-area', params.mvArea);
        const msSelect = document.getElementById('param-ms');
        if (msSelect) {
            msSelect.value = params.msEnabled ? 'on' : 'off';
        }
        setInput('param-mr-eroa', params.mrEroa);
        setInput('param-mr-cd', params.mrCd);
        const mrSelect = document.getElementById('param-mr');
        if (mrSelect) {
            mrSelect.value = params.mrEnabled ? 'on' : 'off';
        }
        setInput('param-as-ava', params.asAva);
        const asSelect = document.getElementById('param-as');
        if (asSelect) {
            asSelect.value = params.asEnabled ? 'on' : 'off';
        }
        setInput('param-ar-eroa', params.arEroa);
        setInput('param-ar-cd', params.arCd);
        const arSelect = document.getElementById('param-ar');
        if (arSelect) {
            arSelect.value = params.arEnabled ? 'on' : 'off';
        }
        const laContractionSelect = document.getElementById('param-la-contraction');
        if (laContractionSelect) {
            laContractionSelect.value = params.laContractionEnabled ? 'on' : 'off';
        }
        setInput('param-rm', params.rm);
        setInput('param-lm', params.lm);
        setInput('param-lv-ees', params.lvEes);
        setInput('param-lv-alpha', params.lvAlpha);
        setInput('param-lv-beta', params.lvBeta);
        setInput('param-lv-v0', params.lvV0);
        setInput('param-ra', params.ra);
        setInput('param-la-inert', params.la);
        setInput('param-ca', params.ca);
        setInput('param-ao-area', params.aoArea);
        setInput('param-svr', params.svr);
    }

    getScaleSettings() {
        const getVal = (id, def) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) || def : def;
        };
        return {
            // PVループ & モニター個別スケール
            laVMax: getVal('la-pv-vmax', 120),
            laPMax: getVal('la-pv-pmax', 40),      // 40
            lvVMax: getVal('lv-pv-vmax', 150),
            lvPMax: getVal('lv-pv-pmax', 200),     // 200
            aoPMax: getVal('ao-pv-pmax', 200),     // 200
            // モニター波形（PVループとは独立）
            monitorPressureLvAoMax: getVal('monitor-pressure-lv-ao-max', 150),
            monitorPressureLaMax: getVal('monitor-pressure-la-max', 40),
            flowMax: getVal('scale-flow-max', 1200),
            flowMin: getVal('scale-flow-min', -200),
            elastanceMax: getVal('scale-elastance-max', 3),
            balanceXMax: getVal('balance-x-max', 20),
            balanceYMax: getVal('balance-y-max', 12)
        };
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.updateControls();

        this.lastFrameTime = performance.now();
        this.animate();
    }

    stop() {
        this.isRunning = false;
        this.updateControls();

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    reset() {
        window.location.reload();
    }

    openSettingsModal() {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.removeAttribute('hidden');
    }

    closeSettingsModal() {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.setAttribute('hidden', '');
    }

    animate() {
        if (!this.isRunning) return;

        const now = performance.now();
        const elapsed = (now - this.lastFrameTime) / 1000; // 秒
        this.lastFrameTime = now;

        // 再生速度に応じてシミュレーションを進める
        const simulationTime = elapsed * this.speed;
        const steps = Math.floor(simulationTime / SIM_CONFIG.dt);

        for (let i = 0; i < steps; i++) {
            this.simulator.step();
        }

        // 描画（60fps程度に抑制）
        const metrics = this.calculateMetrics();
        this.chartManager.update(this.simulator, this.getScaleSettings(), metrics, this.getWaveformVisibility(), this.balanceCurve);
        this.updateStatus();

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    toggleRun() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    }

    updateControls() {
        const startBtn = document.getElementById('startBtn');
        if (!startBtn) return;

        if (this.isRunning) {
            startBtn.textContent = '⏸ 一時停止';
        } else {
            startBtn.textContent = '▶ スタート';
        }
    }

    applyPressureVitalVisibility() {
        const visibility = this.getWaveformVisibility();
        const mapping = {
            art: visibility.art,
            lap: visibility.lap,
            lvp: visibility.lvp
        };
        for (const [key, show] of Object.entries(mapping)) {
            const item = document.querySelector(`[data-vital-item="${key}"]`);
            if (item) item.style.display = show ? '' : 'none';
        }
    }

    getWaveformVisibility() {
        const read = (key) => {
            const el = document.querySelector(`.waveform-toggle[value="${key}"]`);
            return el ? el.checked : true;
        };
        return {
            art: read('art'),
            lvp: read('lvp'),
            lap: read('lap'),
            avFlow: read('avFlow'),
            mvFlow: read('mvFlow'),
            pvFlow: read('pvFlow'),
            laElastance: read('laElastance'),
            lvElastance: read('lvElastance')
        };
    }

    redrawNow() {
        this.scheduleBalanceCurve();
        const metrics = this.calculateMetrics();
        this.chartManager.update(this.simulator, this.getScaleSettings(), metrics, this.getWaveformVisibility(), this.balanceCurve);
    }

    resetScaleInputs() {
        const scaleIds = [
            'la-pv-vmax',
            'la-pv-pmax',
            'lv-pv-vmax',
            'lv-pv-pmax',
            'monitor-pressure-lv-ao-max',
            'monitor-pressure-la-max',
            'scale-flow-max',
            'scale-flow-min',
            'scale-elastance-max',
            'balance-x-max',
            'balance-y-max'
        ];

        scaleIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el && el.defaultValue !== undefined) {
                el.value = el.defaultValue;
            }
        });
    }

    resetSpeed() {
        this.speed = 1;
        const speedSlider = document.getElementById('speedSlider');
        if (speedSlider) speedSlider.value = this.sliderFromSpeed(this.speed).toString();
        this.updateSpeedDisplay();
    }

    syncSpeedFromUI() {
        const speedSlider = document.getElementById('speedSlider');
        if (!speedSlider) return;
        const value = parseFloat(speedSlider.value);
        this.speed = this.speedFromSlider(value);
        speedSlider.value = this.sliderFromSpeed(this.speed).toString();
        this.updateSpeedDisplay();
    }

    updateSpeedDisplay() {
        const speedValue = document.getElementById('speedValue');
        if (speedValue) {
            const label = this.speed < 1 ? this.speed.toFixed(1) : this.speed.toFixed(0);
            speedValue.textContent = label;
        }
    }

    speedFromSlider(value) {
        if (isNaN(value)) return 1;
        const clamped = Math.max(0, Math.min(100, value));
        if (clamped <= 50) {
            const idx = Math.round((clamped / 50) * 9);
            return (idx + 1) / 10;
        }
        const idx = Math.round(((clamped - 50) / 50) * 9);
        return 1 + idx;
    }

    sliderFromSpeed(speed) {
        if (isNaN(speed)) return 50;
        const clamped = Math.max(0.1, Math.min(10, speed));
        if (clamped <= 1) {
            const idx = Math.round(clamped * 10 - 1);
            return Math.round((idx / 9) * 50);
        }
        const idx = Math.round(clamped - 1);
        return Math.round(50 + (idx / 9) * 50);
    }

    updateStatus() {
        const state = this.simulator.getState();
        const history = this.simulator.getHistory();

        // モニター数値更新
        document.getElementById('vital-hr').textContent = this.simulator.params.hr;

        // 直近1心周期分のデータを取得
        if (history.aoPressure.length > 10) {
            const cycleDuration = 60 / this.simulator.params.hr;
            const samplesPerCycle = Math.floor(cycleDuration / SIM_CONFIG.dt);

            // 大動脈圧
            const recentAoP = history.aoPressure.slice(-samplesPerCycle);
            const aoSys = Math.max(...recentAoP);
            const aoDia = Math.min(...recentAoP);
            const aoMap = aoDia + (aoSys - aoDia) / 3;
            document.getElementById('vital-sys').textContent = Math.round(aoSys);
            document.getElementById('vital-dia').textContent = Math.round(aoDia);
            document.getElementById('vital-map').textContent = Math.round(aoMap);

            // 左房圧
            const recentLAP = history.laPressure.slice(-samplesPerCycle);
            const lapMax = Math.max(...recentLAP);
            const lapMin = Math.min(...recentLAP);
            const lapMean = recentLAP.reduce((a, b) => a + b, 0) / recentLAP.length;
            document.getElementById('vital-lap-max').textContent = Math.round(lapMax);
            document.getElementById('vital-lap-min').textContent = Math.round(lapMin);
            document.getElementById('vital-lap-mean').textContent = Math.round(lapMean);

            // 左室圧
            const recentLVP = history.lvPressure.slice(-samplesPerCycle);
            const lvpMax = Math.max(...recentLVP);
            const lvpMin = Math.min(...recentLVP);
            const lvpMean = recentLVP.reduce((a, b) => a + b, 0) / recentLVP.length;
            document.getElementById('vital-lvp-max').textContent = Math.round(lvpMax);
            document.getElementById('vital-lvp-min').textContent = Math.round(lvpMin);
            document.getElementById('vital-lvp-mean').textContent = Math.round(lvpMean);

            // SV（1回拍出量）= LV容量の変化
            const recentLVV = history.lvVolume.slice(-samplesPerCycle);
            const edv = Math.max(...recentLVV);  // 拡張末期容量
            const esv = Math.min(...recentLVV);  // 収縮末期容量
            const sv = edv - esv;
            document.getElementById('vital-sv').textContent = Math.round(sv);

            // CO（心拍出量）= SV × HR / 1000 (L/min)
            const co = sv * this.simulator.params.hr / 1000;
            document.getElementById('vital-co').textContent = co.toFixed(1);

            // SVR（全身血管抵抗）: 既にdynes·sec·cm⁻⁵で格納
            document.getElementById('vital-svr').textContent = Math.round(this.simulator.params.svr);

            // LVEDP（左室拡張末期圧）: 僧帽弁閉鎖時の値を使用
            const state = this.simulator.getState();
            const lvedp = state.lvEDP != null ? state.lvEDP : (recentLVP[recentLVV.indexOf(edv)] || lvpMin);
            document.getElementById('vital-lvedp').textContent = Math.round(lvedp);
        }
    }

    /**
     * PVループ描画用の指標計算
     */
    calculateMetrics() {
        // 直近の履歴を取得
        const history = this.simulator.getHistory();
        if (history.lvVolume.length < 10) return null;

        const params = this.simulator.params;
        const cycleDuration = 60 / this.simulator.params.hr;
        const samplesPerCycle = Math.floor(cycleDuration / SIM_CONFIG.dt);

        // 直近1心周期分のデータを抽出
        const lvV = history.lvVolume.slice(-samplesPerCycle);
        const lvP = history.lvPressure.slice(-samplesPerCycle);

        if (lvV.length === 0) return null;

        // SV, EDV, ESV
        const edv = Math.max(...lvV);
        const esv = Math.min(...lvV);
        const sv = edv - esv;

        // EF (%)
        const ef = edv > 0 ? (sv / edv) * 100 : 0;

        // Ea (mmHg/mL) = ESP / SV
        // ESPは簡易的に最大左室圧を使用
        const state = this.simulator.getState();
        const espFromState = state.lvESPTime != null
            && state.lvESP != null
            && (state.time - state.lvESPTime) <= cycleDuration * 1.2;
        const esp = espFromState ? state.lvESP : Math.max(...lvP);
        const ea = sv > 0 ? esp / sv : 0;

        // Ees (mmHg/mL) - パラメータから取得
        const ees = params.lvEes;

        // === EW / PW / 仕事効率 ===
        const calcLoopArea = (vData, pData) => {
            let area = 0;
            for (let i = 0; i < vData.length - 1; i++) {
                area += 0.5 * (pData[i] + pData[i + 1]) * (vData[i + 1] - vData[i]);
            }
            return Math.abs(area);
        };

        const calcSystolicSegment = () => {
            const edvIndex = lvV.indexOf(edv);
            const esvIndex = lvV.indexOf(esv);
            const segV = [];
            const segP = [];
            let idx = edvIndex;
            for (let count = 0; count < lvV.length; count++) {
                segV.push(lvV[idx]);
                segP.push(lvP[idx]);
                if (idx === esvIndex) break;
                idx = (idx + 1) % lvV.length;
            }
            return { segV, segP };
        };

        const calcPVA = () => {
            if (edv <= 0) return 0;
            const v0 = Math.min(params.lvV0, esv);
            const espvrSteps = 20;
            const edpvrSteps = 20;
            const points = [];

            // ESPVR: V0 → ESV
            const v0ToEsv = Math.max(1, esv - v0);
            for (let i = 0; i <= espvrSteps; i++) {
                const v = v0 + (v0ToEsv * i) / espvrSteps;
                const p = Math.max(0, ees * (v - v0));
                points.push([v, p]);
            }

            // 収縮期PV（ESV → EDV）を逆順で追加
            const { segV, segP } = calcSystolicSegment();
            for (let i = segV.length - 1; i >= 0; i--) {
                points.push([segV[i], segP[i]]);
            }

            // EDPVR: EDV → V0
            const edvToV0 = Math.max(1, edv - v0);
            for (let i = 0; i <= edpvrSteps; i++) {
                const v = edv - (edvToV0 * i) / edpvrSteps;
                const p = params.lvAlpha * (Math.exp(params.lvBeta * (v - v0)) - 1);
                points.push([v, Math.max(0, p)]);
            }

            // Shoelace formula
            let area = 0;
            for (let i = 0; i < points.length; i++) {
                const [x1, y1] = points[i];
                const [x2, y2] = points[(i + 1) % points.length];
                area += x1 * y2 - x2 * y1;
            }
            return Math.abs(area) / 2;
        };

        const ew = calcLoopArea(lvV, lvP);
        const pva = calcPVA();
        const pw = Math.max(0, pva - ew);
        const efficiency = pva > 0 ? (ew / pva) * 100 : 0;

        return {
            sv: Math.round(sv),
            ef: ef.toFixed(1),
            ea: ea.toFixed(1),
            ees: ees.toFixed(1),
            edv: Math.round(edv),
            esv: Math.round(esv),
            ew: Math.round(ew),
            pw: Math.round(pw),
            efficiency: efficiency.toFixed(1)
        };
    }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
