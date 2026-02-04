/**
 * 循環シミュレーター - グラフ描画
 * スイープ表示（生体モニター風）対応
 */

class ChartManager {
    constructor() {
        this.charts = {};
        this.colors = {
            ecg: '#00ff00',   // 緑
            la: '#ffff00',    // 黄（左房）
            lv: '#ff8c00',    // オレンジ
            ao: '#ff4444',    // 赤
            vein: '#00ffff',  // 水色（静脈）
            mitral: '#ff8c00',// オレンジ（僧帽弁フロー）
            aortic: '#ff4444',// 赤（大動脈弁フロー）
            grid: '#333333',
            text: '#888888',
            cursor: 'rgba(255, 255, 255, 0.5)',
            edpvr: '#00ffff', // シアン（EDPVR）
            espvr: '#ff00ff'  // マゼンタ（ESPVR）
        };
        this.sweepDuration = SIM_CONFIG.displayDuration || 5.7;  // スイープ表示の時間幅（秒）
        this.initCharts();
    }

    initCharts() {
        // 各キャンバスを初期化
        this.charts.ecg = this.setupCanvas('chart-ecg');
        this.charts.elastance = this.setupCanvas('chart-elastance');
        this.charts.pressure = this.setupCanvas('chart-pressure');
        this.charts.flow = this.setupCanvas('chart-flow');
        this.charts.laPV = this.setupCanvas('chart-la-pv');
        this.charts.lvPV = this.setupCanvas('chart-lv-pv');
    }

    setupCanvas(id) {
        const canvas = document.getElementById(id);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');

        // 高DPI対応
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';

        return { canvas, ctx, width: rect.width, height: rect.height };
    }

    /**
     * リサイズ時に再初期化
     */
    resize() {
        this.initCharts();
    }

    /**
     * グリッドを描画（スイープ用）
     */
    drawSweepGrid(chart, yMin, yMax) {
        if (!chart) return;
        const { ctx, width, height } = chart;

        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 0.5;

        // 横線（5本）
        for (let i = 0; i <= 4; i++) {
            const y = height * i / 4;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // 縦線（5本）
        for (let i = 0; i <= 4; i++) {
            const x = width * i / 4;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Y軸ラベル（縦軸）
        ctx.fillStyle = '#666';
        ctx.font = '10px sans-serif';
        ctx.fillText(yMax.toFixed(0), 2, 12);
        const yMid = (yMax + yMin) / 2;
        ctx.fillText(yMid.toFixed(0), 2, height / 2 + 4);
        ctx.fillText(yMin.toFixed(0), 2, height - 2);

        // X軸ラベル削除
    }

    /**
     * マルチスケールのY軸目盛りを描画
     * 各スケールのMax/Min値を色付きで上端・下端に表示する
     */
    drawMultiScaleYAxis(chart, scales) {
        if (!chart) return;
        const { ctx, width, height } = chart;

        // グリッド線（等間隔）
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = height * i / 4;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        for (let i = 0; i <= 4; i++) {
            const x = width * i / 4;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // X軸ラベル削除

        // スケール数値描画
        let xOffset = 30; // さらに右へ
        scales.forEach(scale => {
            ctx.fillStyle = scale.color;
            ctx.font = 'bold 11px sans-serif'; // 少し強調

            // 上端 (Max)
            const maxText = scale.max.toFixed(0);
            ctx.fillText(maxText, xOffset, 12);

            // 下端 (Min)
            const minText = scale.min.toFixed(0);
            // 下端はベースライン近くに下げる
            ctx.fillText(minText, xOffset, height - 3);

            // 次の数値のために横幅分ずらす
            const textWidth = ctx.measureText(maxText).width;
            xOffset += Math.max(textWidth + 8, 25);
        });
    }

    /**
     * スイープ方式でラインを描画
     * @param currentTime - 現在のシミュレーション時間
     * @param filled - trueの場合、ベースライン(0)から塗りつぶす
     */
    drawSweepLine(chart, timeData, yData, currentTime, yMin, yMax, color, lineWidth = 1.5, filled = false) {
        if (!chart || timeData.length < 2) return;
        const { ctx, width, height } = chart;

        // 現在位置（0-1の範囲）
        const sweepPhase = (currentTime % this.sweepDuration) / this.sweepDuration;

        // ベースライン(0)のY座標
        const baselineY = height - ((0 - yMin) / (yMax - yMin)) * height;

        if (filled) {
            // 塗りつぶしモード
            ctx.fillStyle = color + '80';  // 半透明
            ctx.beginPath();
            let started = false;
            let lastX = 0;

            for (let i = 0; i < timeData.length; i++) {
                const t = timeData[i];
                const phase = (t % this.sweepDuration) / this.sweepDuration;
                const x = phase * width;
                const y = height - ((yData[i] - yMin) / (yMax - yMin)) * height;

                if (!started) {
                    ctx.moveTo(x, baselineY);
                    ctx.lineTo(x, y);
                    started = true;
                } else {
                    const prevPhase = (timeData[i - 1] % this.sweepDuration) / this.sweepDuration;
                    if (Math.abs(phase - prevPhase) > 0.5) {
                        ctx.lineTo(lastX, baselineY);
                        ctx.closePath();
                        ctx.fill();
                        ctx.beginPath();
                        ctx.moveTo(x, baselineY);
                        ctx.lineTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                lastX = x;
            }
            if (started) {
                ctx.lineTo(lastX, baselineY);
                ctx.closePath();
                ctx.fill();
            }
        }

        // 線描画
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        let started = false;

        for (let i = 0; i < timeData.length; i++) {
            const t = timeData[i];
            const phase = (t % this.sweepDuration) / this.sweepDuration;
            const x = phase * width;
            const y = height - ((yData[i] - yMin) / (yMax - yMin)) * height;

            const distFromCursor = Math.abs(phase - sweepPhase);


            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                const prevPhase = (timeData[i - 1] % this.sweepDuration) / this.sweepDuration;
                if (Math.abs(phase - prevPhase) > 0.5) {
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
        }
        ctx.stroke();
    }

    /**
     * スイープカーソル（消去線）を描画
     */
    drawSweepCursor(chart, currentTime) {
        if (!chart) return;
        const { ctx, width, height } = chart;

        const sweepPhase = (currentTime % this.sweepDuration) / this.sweepDuration;
        const cursorX = sweepPhase * width;

        // 黒い空白（ギャップ）として描画
        ctx.fillStyle = '#000000';
        ctx.fillRect(cursorX, 0, 6, height);
    }

    /**
     * グリッドを描画（PVループ用）
     */
    drawGrid(chart, xMin, xMax, yMin, yMax, xLabel = '', yLabel = '') {
        if (!chart) return;
        const { ctx, width, height } = chart;

        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 0.5;

        // 横線（5本）
        for (let i = 0; i <= 4; i++) {
            const y = height * i / 4;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // 縦線（5本）
        for (let i = 0; i <= 4; i++) {
            const x = width * i / 4;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Y軸ラベル（縦軸）
        ctx.fillStyle = '#666';
        ctx.font = '10px sans-serif';
        ctx.fillText(yMax.toFixed(0), 2, 12);
        ctx.fillText(yMin.toFixed(0), 2, height - 2);

        // X軸ラベル（横軸）
        for (let i = 0; i <= 4; i++) {
            const x = width * i / 4;
            const value = xMin + (xMax - xMin) * i / 4;
            ctx.fillText(value.toFixed(0), x + 2, height - 2);
        }
    }

    /**
     * PVループを描画
     */
    drawPVLoop(chart, vData, pData, vMax, pMax, espvrEes, espvrV0, edpvrAlpha, edpvrBeta, edpvrV0, color) {
        if (!chart) return;
        const { ctx, width, height } = chart;

        // クリア
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // グリッド
        this.drawGrid(chart, 0, vMax, 0, pMax);

        // EDPVR曲線
        ctx.strokeStyle = this.colors.edpvr;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        for (let v = edpvrV0; v <= vMax; v += 2) {
            const p = edpvrAlpha * (Math.exp(edpvrBeta * (v - edpvrV0)) - 1);
            const x = (v / vMax) * width;
            const y = height - (p / pMax) * height;
            if (v === edpvrV0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // ESPVR線: P = Ees × (V - V0)
        if (espvrEes > 0) {
            ctx.strokeStyle = this.colors.espvr;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 2]);
            ctx.beginPath();
            const v1 = espvrV0;
            const v2 = vMax;
            const p1 = 0;
            const p2 = espvrEes * (v2 - espvrV0);  // クリップなし
            ctx.moveTo((v1 / vMax) * width, height - (p1 / pMax) * height);
            ctx.lineTo((v2 / vMax) * width, height - (p2 / pMax) * height);  // 画面外に出てもOK
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // PVループデータ
        if (vData.length > 1) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < vData.length; i++) {
                const x = (vData[i] / vMax) * width;
                const y = height - (pData[i] / pMax) * height;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            // 現在位置のマーカー
            if (vData.length > 0) {
                const lastV = vData[vData.length - 1];
                const lastP = pData[pData.length - 1];
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(
                    (lastV / vMax) * width,
                    height - (lastP / pMax) * height,
                    4, 0, Math.PI * 2
                );
                ctx.fill();
            }
        }
    }

    /**
     * 左房PVループを描画
     * Conduit EDPVRは動的（LA+LVの結合エラスタンス）のため静的曲線は描画しない
     */
    drawLAPVLoop(chart, vData, pData, vMax, pMax, espvrEes, espvrV0, edpvrAlpha, edpvrBeta, edpvrV0, color) {
        if (!chart) return;
        const { ctx, width, height } = chart;

        // クリア
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // グリッド
        this.drawGrid(chart, 0, vMax, 0, pMax);

        // Reservoir EDPVR曲線（MV閉鎖時）
        ctx.strokeStyle = this.colors.edpvr;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        for (let v = edpvrV0; v <= vMax; v += 2) {
            const p = edpvrAlpha * (Math.exp(edpvrBeta * (v - edpvrV0)) - 1);
            const x = (v / vMax) * width;
            const y = height - (p / pMax) * height;
            if (v === edpvrV0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // ESPVR線
        ctx.strokeStyle = this.colors.espvr;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        const espvrX0 = (espvrV0 / vMax) * width;
        const espvrX1 = width;
        ctx.moveTo(espvrX0, height);
        ctx.lineTo(espvrX1, height - (espvrEes * (vMax - espvrV0) / pMax) * height);
        ctx.stroke();
        ctx.setLineDash([]);

        // PVループ
        if (vData.length > 0 && pData.length > 0) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < vData.length; i++) {
                const x = (vData[i] / vMax) * width;
                const y = height - (pData[i] / pMax) * height;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            // 現在位置のマーカー
            if (vData.length > 0) {
                const lastV = vData[vData.length - 1];
                const lastP = pData[pData.length - 1];
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(
                    (lastV / vMax) * width,
                    height - (lastP / pMax) * height,
                    4, 0, Math.PI * 2
                );
                ctx.fill();
            }
        }
    }

    /**
     * すべてのチャートを更新
     */
    update(simulator, scaleSettings, metrics = null, waveformVisibility = {}) {
        const history = simulator.getHistory();
        const state = simulator.getState();
        const params = simulator.params;
        const visibility = {
            art: waveformVisibility.art !== false,
            lvp: waveformVisibility.lvp !== false,
            lap: waveformVisibility.lap !== false,
            avFlow: waveformVisibility.avFlow !== false,
            mvFlow: waveformVisibility.mvFlow !== false,
            pvFlow: waveformVisibility.pvFlow !== false,
            laElastance: waveformVisibility.laElastance !== false,
            lvElastance: waveformVisibility.lvElastance !== false
        };

        if (history.time.length < 2) return;

        const currentTime = state.time;

        // === 心電図（スイープ表示） ===
        if (this.charts.ecg) {
            const chart = this.charts.ecg;
            chart.ctx.fillStyle = '#000000';
            chart.ctx.fillRect(0, 0, chart.width, chart.height);
            this.drawSweepGrid(chart, -0.5, 1.5);
            this.drawSweepLine(chart, history.time, history.ecg, currentTime, -0.5, 1.5, this.colors.ecg);
            this.drawSweepCursor(chart, currentTime);
        }

        // === エラスタンス（スイープ表示） ===
        const eMax = scaleSettings.elastanceMax || 3;
        if (this.charts.elastance) {
            const chart = this.charts.elastance;
            chart.ctx.fillStyle = '#000000';
            chart.ctx.fillRect(0, 0, chart.width, chart.height);
            this.drawSweepGrid(chart, 0, eMax);
            if (visibility.laElastance) {
                this.drawSweepLine(chart, history.time, history.laElastance, currentTime, 0, eMax, this.colors.la);
            }
            if (visibility.lvElastance) {
                this.drawSweepLine(chart, history.time, history.lvElastance, currentTime, 0, eMax, this.colors.lv);
            }
            this.drawSweepCursor(chart, currentTime);
        }

        // === 圧波形（スイープ表示） ===
        // 各波形の個別スケール設定
        // scaleSettingsに入っていれば使うが、なければデフォルト値を設定
        // LAは小さいため大きく表示するためにスケールを下げる（0-40など）
        const lvAoMax = scaleSettings.monitorPressureLvAoMax || 140;
        const laMax = scaleSettings.monitorPressureLaMax || 40;  // 右房/左房は低圧系なので拡大表示
        const aoMax = lvAoMax;
        const lvMax = lvAoMax;

        if (this.charts.pressure) {
            const chart = this.charts.pressure;
            chart.ctx.fillStyle = '#000000';
            chart.ctx.fillRect(0, 0, chart.width, chart.height);

            // マルチスケールグリッド描画
            const pressureScales = [];
            if (visibility.art) pressureScales.push({ min: 0, max: aoMax, color: this.colors.ao });
            if (visibility.lvp) pressureScales.push({ min: 0, max: lvMax, color: this.colors.lv });
            if (visibility.lap) pressureScales.push({ min: 0, max: laMax, color: this.colors.la });
            this.drawMultiScaleYAxis(chart, pressureScales);

            // ゼロライン（ベースライン）
            chart.ctx.strokeStyle = '#444';
            chart.ctx.lineWidth = 1;
            const zeroY = chart.height;
            chart.ctx.beginPath();
            chart.ctx.moveTo(0, zeroY);
            chart.ctx.lineTo(chart.width, zeroY);
            chart.ctx.stroke();


            // 左房圧 (個別スケール laMax)
            if (visibility.lap) {
                this.drawSweepLine(chart, history.time, history.laPressure, currentTime, 0, laMax, this.colors.la);
            }
            // 左室圧 (個別スケール lvMax)
            if (visibility.lvp) {
                this.drawSweepLine(chart, history.time, history.lvPressure, currentTime, 0, lvMax, this.colors.lv);
            }
            // 大動脈圧 (個別スケール aoMax)
            if (visibility.art) {
                this.drawSweepLine(chart, history.time, history.aoPressure, currentTime, 0, aoMax, this.colors.ao);
            }
            // 静脈圧 (スケールはLAと同じにするか、独自にするか。今回はLAに合わせるか表示しない) -- 以前削除したので描画しない

            this.drawSweepCursor(chart, currentTime);
            this.drawSweepCursor(chart, currentTime);

            // 凡例
            const legends = [];
            if (visibility.lap) legends.push({ label: 'LA', color: this.colors.la });
            if (visibility.lvp) legends.push({ label: 'LV', color: this.colors.lv });
            if (visibility.art) legends.push({ label: 'AO', color: this.colors.ao });
            chart.ctx.font = '10px sans-serif';
            chart.ctx.textAlign = 'right';
            let legendX = chart.width - 10;
            legends.slice().reverse().forEach((item) => {
                chart.ctx.fillStyle = item.color;
                chart.ctx.fillText(item.label, legendX, 12);
                legendX -= 30;
            });
        }

        // === 弁Flow（スイープ表示） ===
        const flowMin = scaleSettings.flowMin || -200;
        const flowMax = scaleSettings.flowMax || 1200;
        if (this.charts.flow) {
            const chart = this.charts.flow;
            chart.ctx.fillStyle = '#000000';
            chart.ctx.fillRect(0, 0, chart.width, chart.height);
            this.drawSweepGrid(chart, flowMin, flowMax);
            if (visibility.pvFlow) {
                this.drawSweepLine(chart, history.time, history.venousFlow, currentTime, flowMin, flowMax, this.colors.vein, 1.5, true);
            }
            if (visibility.mvFlow) {
                this.drawSweepLine(chart, history.time, history.mitralFlow, currentTime, flowMin, flowMax, this.colors.mitral, 1.5, true);
            }
            if (visibility.avFlow) {
                this.drawSweepLine(chart, history.time, history.aorticFlow, currentTime, flowMin, flowMax, this.colors.aortic, 1.5, true);
            }
            this.drawSweepCursor(chart, currentTime);
        }

        // === 左房PVループ ===
        // 直近3心拍分のみ抽出
        const beatDuration = 60 / (params.hr || 60);
        const keepDuration = beatDuration * 3;
        const lastHistoryTime = history.time[history.time.length - 1];
        let startIndex = 0;
        if (history.time.length > 0) {
            const thresholdTime = lastHistoryTime - keepDuration;
            startIndex = history.time.findIndex(t => t >= thresholdTime);
            if (startIndex < 0) startIndex = 0;
        }

        const laVMax = scaleSettings.laVMax || 60;
        const laPMax = scaleSettings.laPMax || 20;
        this.drawLAPVLoop(
            this.charts.laPV,
            history.laVolume.slice(startIndex),
            history.laPressure.slice(startIndex),
            laVMax, laPMax,
            params.laEes, params.laV0,
            params.laAlpha, params.laBeta, params.laV0,
            this.colors.la
        );

        // === 左室PVループ ===
        const lvVMax = scaleSettings.lvVMax || 150;
        const lvPMax = scaleSettings.lvPMax || 140;
        this.drawPVLoop(
            this.charts.lvPV,
            history.lvVolume.slice(startIndex),
            history.lvPressure.slice(startIndex),
            lvVMax, lvPMax,
            params.lvEes, params.lvV0,  // Phase 4: ESPVR表示あり
            params.lvAlpha, params.lvBeta, params.lvV0,
            this.colors.lv
        );

        // 指標の表示（ループ内）
        if (metrics && this.charts.lvPV) {
            const chart = this.charts.lvPV;
            chart.ctx.fillStyle = '#cccccc'; // タイトルと同じ色味に
            chart.ctx.font = '12px "Courier New"';
            chart.ctx.textAlign = 'right'; // 右揃え
            chart.ctx.textBaseline = 'top';

            // 表示位置: 右上端（マージンあり）
            const textX = chart.width - 10;
            const textY = 10; // 上端から少し下

            // 1行で表示
            const text = `EF:${metrics.ef}%  SV:${metrics.sv}ml  Ees:${metrics.ees}  Ea:${metrics.ea}`;
            chart.ctx.fillText(text, textX, textY);
        }
    }
}
