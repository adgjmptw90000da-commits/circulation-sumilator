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

        this.initUI();
        this.bindEvents();
        this.updateControls();

        // 初回描画
        this.chartManager.update(this.simulator, this.getScaleSettings());
        this.updateStatus();
    }

    initUI() {
        // 既存のパラメータ値をUIに反映
        this.syncParamsToUI();
        this.syncSpeedFromUI();
    }

    bindEvents() {
        // コントロールボタン
        document.getElementById('startBtn').addEventListener('click', () => this.toggleRun());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());

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

        // パラメータ入力
        this.bindParamInputs();

        // リサイズ対応
        window.addEventListener('resize', () => {
            this.chartManager.resize();
            this.chartManager.update(this.simulator, this.getScaleSettings());
        });
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
                    }
                });
            }
        }

        const mrSelect = document.getElementById('param-mr');
        if (mrSelect) {
            mrSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                this.simulator.updateParams({ mrEnabled: enabled });
            });
        }

        const msSelect = document.getElementById('param-ms');
        if (msSelect) {
            msSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                this.simulator.updateParams({ msEnabled: enabled });
            });
        }

        const arSelect = document.getElementById('param-ar');
        if (arSelect) {
            arSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                this.simulator.updateParams({ arEnabled: enabled });
            });
        }

        const asSelect = document.getElementById('param-as');
        if (asSelect) {
            asSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                this.simulator.updateParams({ asEnabled: enabled });
            });
        }

        const laContractionSelect = document.getElementById('param-la-contraction');
        if (laContractionSelect) {
            laContractionSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                this.simulator.updateParams({ laContractionEnabled: enabled });
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
            elastanceMax: getVal('scale-elastance-max', 3)
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
        this.chartManager.update(this.simulator, this.getScaleSettings(), metrics);
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
            'scale-elastance-max'
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
        const esp = Math.max(...lvP);
        const ea = sv > 0 ? esp / sv : 0;

        // Ees (mmHg/mL) - パラメータから取得
        const ees = this.simulator.params.lvEes;

        return {
            sv: Math.round(sv),
            ef: ef.toFixed(1),
            ea: ea.toFixed(1),
            ees: ees.toFixed(1),
            edv: Math.round(edv),
            esv: Math.round(esv)
        };
    }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
