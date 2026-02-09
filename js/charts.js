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
            ra: '#7bdff2',    // 水色（右房）
            rv: '#4da3ff',    // 青（右室）
            ao: '#ff4444',    // 赤
            pa: '#ffd84d',    // 黄（肺動脈）
            vein: '#00ffff',  // 水色（静脈）
            pulmonaryVein: '#ffd166', // 黄（肺静脈）
            mitral: '#ff8c00',// オレンジ（僧帽弁フロー）
            aortic: '#ff4444',// 赤（大動脈弁フロー）
            tricuspid: '#4da3ff', // 青（三尖弁フロー）
            pulmonary: '#2ecc71', // 緑（肺動脈弁フロー）
            coCurve: '#ff6b6b', // CO曲線
            vrCurve: '#5c7cfa', // 静脈還流曲線
            eqPoint: '#ffd43b', // 平衡点
            pericardium: '#adb5ff', // 心膜曲線
            grid: '#333333',
            text: '#888888',
            cursor: 'rgba(255, 255, 255, 0.5)',
            edpvr: '#00ffff', // シアン（EDPVR）
            espvr: '#ff00ff'  // マゼンタ（ESPVR）
        };
        this.sweepDuration = SIM_CONFIG.displayDuration || 5.7;  // スイープ表示の時間幅（秒）
        this.monitorMinWidth = 720;
        this.monitorBaseWidth = null;
        this.initCharts();
    }

    initCharts() {
        // 各キャンバスを初期化
        this.charts.ecg = this.setupCanvas('chart-ecg');
        this.charts.pressure = this.setupCanvas('chart-pressure');
        this.charts.flowRight = this.setupCanvas('chart-flow-right');
        this.charts.flowLeft = this.setupCanvas('chart-flow-left');
        this.charts.raPV = this.setupCanvas('chart-ra-pv');
        this.charts.rvPV = this.setupCanvas('chart-rv-pv');
        this.charts.laPV = this.setupCanvas('chart-la-pv');
        this.charts.lvPV = this.setupCanvas('chart-lv-pv');
        this.charts.balance = this.setupCanvas('chart-balance');
        this.charts.pericardium = this.setupCanvas('chart-pericardium');
    }

    setupCanvas(id) {
        const canvas = document.getElementById(id);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');

        // 高DPI対応
        const rect = canvas.getBoundingClientRect();
        const isMonitor = !!canvas.closest('.monitor-waveforms');
        const displayRect = isMonitor && canvas.parentElement
            ? canvas.parentElement.getBoundingClientRect()
            : rect;
        if (isMonitor) {
            if (this.monitorBaseWidth == null) {
                this.monitorBaseWidth = Math.max(displayRect.width, this.monitorMinWidth);
            } else if (displayRect.width > this.monitorBaseWidth) {
                this.monitorBaseWidth = displayRect.width;
            }
        }
        const baseWidth = isMonitor ? (this.monitorBaseWidth || displayRect.width) : displayRect.width;
        const targetWidth = isMonitor ? Math.max(displayRect.width, baseWidth) : displayRect.width;
        let targetHeight = rect.height;
        if (!isMonitor) {
            const aspect = 3 / 4; // height / width (4:3)
            targetHeight = Math.max(1, targetWidth * aspect);
            canvas.style.height = `${targetHeight}px`;
        }
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, targetWidth * dpr);
        canvas.height = Math.max(1, targetHeight * dpr);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        canvas.style.width = targetWidth + 'px';
        if (isMonitor) {
            canvas.style.height = rect.height + 'px';
        }

        return {
            canvas,
            ctx,
            width: displayRect.width,
            height: targetHeight,
            displayWidth: displayRect.width,
            isMonitor
        };
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
        const { ctx, height } = chart;
        const { width } = this.getSweepConfig(chart);

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
        const { ctx, height } = chart;
        const { width, duration } = this.getSweepConfig(chart);
        const startTime = currentTime - duration;

        // 現在位置（0-1の範囲）
        const sweepPhase = (currentTime % duration) / duration;

        // ベースライン(0)のY座標
        const baselineY = height - ((0 - yMin) / (yMax - yMin)) * height;

        if (filled) {
            // 塗りつぶしモード
            ctx.fillStyle = color + '80';  // 半透明
            ctx.beginPath();
            let started = false;
            let lastX = 0;
            let lastPhase = null;

            for (let i = 0; i < timeData.length; i++) {
                const t = timeData[i];
                if (t < startTime) continue;
                const phase = (t % duration) / duration;
                const x = phase * width;
                const y = height - ((yData[i] - yMin) / (yMax - yMin)) * height;

                if (!started) {
                    ctx.moveTo(x, baselineY);
                    ctx.lineTo(x, y);
                    started = true;
                } else {
                    if (lastPhase != null && Math.abs(phase - lastPhase) > 0.5) {
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
                lastPhase = phase;
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
        let lastPhase = null;

        for (let i = 0; i < timeData.length; i++) {
            const t = timeData[i];
            if (t < startTime) continue;
            const phase = (t % duration) / duration;
            const x = phase * width;
            const y = height - ((yData[i] - yMin) / (yMax - yMin)) * height;

            const distFromCursor = Math.abs(phase - sweepPhase);


            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                if (lastPhase != null && Math.abs(phase - lastPhase) > 0.5) {
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            lastPhase = phase;
        }
        ctx.stroke();
    }

    /**
     * スイープカーソル（消去線）を描画
     */
    drawSweepCursor(chart, currentTime) {
        if (!chart) return;
        const { ctx, height } = chart;
        const { width, duration } = this.getSweepConfig(chart);

        const sweepPhase = (currentTime % duration) / duration;
        const cursorX = sweepPhase * width;

        // 黒い空白（ギャップ）として描画
        ctx.fillStyle = '#000000';
        ctx.fillRect(cursorX, 0, 6, height);
    }

    /**
     * グリッドを描画（PVループ用）
     */
    drawGrid(chart, xMin, xMax, yMin, yMax, xLabel = '', yLabel = '', showLabels = true) {
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

        if (showLabels) {
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
    }

    drawGridLabels(chart, xMin, xMax, yMin, yMax) {
        if (!chart) return;
        const { ctx, width, height } = chart;
        ctx.fillStyle = '#9aa0a6';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(yMax.toFixed(0), 2, 12);
        ctx.fillText(yMin.toFixed(0), 2, height - 4);
        for (let i = 0; i <= 4; i++) {
            const x = width * i / 4;
            const value = xMin + (xMax - xMin) * i / 4;
            if (i === 4) {
                ctx.textAlign = 'right';
                ctx.fillText(value.toFixed(0), x - 2, height - 4);
                ctx.textAlign = 'left';
            } else {
                ctx.fillText(value.toFixed(0), x + 2, height - 4);
            }
        }
    }

    getSweepConfig(chart) {
        const width = chart?.displayWidth ?? chart?.width ?? 0;
        if (!chart || !chart.isMonitor || !this.monitorBaseWidth || width <= 0) {
            return { width: chart?.width ?? width, duration: this.sweepDuration };
        }
        const ratio = Math.max(0.1, width / this.monitorBaseWidth);
        return { width, duration: this.sweepDuration * ratio };
    }

    drawEDPVRLine(ctx, vMax, pMax, alpha, beta, v0, color) {
        const width = ctx.canvas.clientWidth || ctx.canvas.width;
        const height = ctx.canvas.clientHeight || ctx.canvas.height;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        for (let v = v0; v <= vMax; v += 2) {
            const p = alpha * (Math.exp(beta * (v - v0)) - 1);
            const x = (v / vMax) * width;
            const y = height - (p / pMax) * height;
            if (v === v0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawLVESPVRLine(ctx, vMax, pMax, ees, v0, color) {
        if (ees <= 0) return;
        const width = ctx.canvas.clientWidth || ctx.canvas.width;
        const height = ctx.canvas.clientHeight || ctx.canvas.height;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        const v1 = v0;
        const v2 = vMax;
        const p1 = 0;
        const p2 = ees * (v2 - v0);
        ctx.moveTo((v1 / vMax) * width, height - (p1 / pMax) * height);
        ctx.lineTo((v2 / vMax) * width, height - (p2 / pMax) * height);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawLAESPVRLine(ctx, vMax, pMax, ees, v0, color) {
        const width = ctx.canvas.clientWidth || ctx.canvas.width;
        const height = ctx.canvas.clientHeight || ctx.canvas.height;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        const espvrX0 = (v0 / vMax) * width;
        ctx.moveTo(espvrX0, height);
        ctx.lineTo(width, height - (ees * (vMax - v0) / pMax) * height);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawPVPath(ctx, vData, pData, vMax, pMax, color, lineWidth = 2, drawMarker = false) {
        if (!vData || vData.length < 2) return;
        const width = ctx.canvas.clientWidth || ctx.canvas.width;
        const height = ctx.canvas.clientHeight || ctx.canvas.height;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        for (let i = 0; i < vData.length; i++) {
            const x = (vData[i] / vMax) * width;
            const y = height - (pData[i] / pMax) * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (drawMarker) {
            const lastV = vData[vData.length - 1];
            const lastP = pData[pData.length - 1];
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc((lastV / vMax) * width, height - (lastP / pMax) * height, 4, 0, Math.PI * 2);
            ctx.fill();
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
        this.drawGrid(chart, 0, vMax, 0, pMax, '', '', false);

        // EDPVR曲線
        this.drawEDPVRLine(ctx, vMax, pMax, edpvrAlpha, edpvrBeta, edpvrV0, this.colors.edpvr);
        this.drawLVESPVRLine(ctx, vMax, pMax, espvrEes, espvrV0, this.colors.espvr);
        this.drawPVPath(ctx, vData, pData, vMax, pMax, color, 2, true);

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
        this.drawGrid(chart, 0, vMax, 0, pMax, '', '', false);

        // Reservoir EDPVR曲線（MV閉鎖時）
        this.drawEDPVRLine(ctx, vMax, pMax, edpvrAlpha, edpvrBeta, edpvrV0, this.colors.edpvr);
        this.drawLAESPVRLine(ctx, vMax, pMax, espvrEes, espvrV0, this.colors.espvr);
        this.drawPVPath(ctx, vData, pData, vMax, pMax, color, 2, true);

    }


    drawSavedLAPVLoops(chart, savedDrawings, vMax, pMax) {
        if (!chart || !Array.isArray(savedDrawings) || savedDrawings.length === 0) return;
        const { ctx } = chart;
        savedDrawings.forEach((drawing) => {
            if (!drawing.la) return;
            const color = drawing.color || this.colors.la;
            ctx.save();
            ctx.globalAlpha = 0.7;
            this.drawEDPVRLine(ctx, vMax, pMax, drawing.la.alpha, drawing.la.beta, drawing.la.v0, color);
            this.drawLAESPVRLine(ctx, vMax, pMax, drawing.la.ees, drawing.la.v0, color);
            this.drawPVPath(ctx, drawing.la.volume, drawing.la.pressure, vMax, pMax, color, 1.6, false);
            ctx.restore();
        });
    }

    drawSavedRAPVLoops(chart, savedDrawings, vMax, pMax) {
        if (!chart || !Array.isArray(savedDrawings) || savedDrawings.length === 0) return;
        const { ctx } = chart;
        savedDrawings.forEach((drawing) => {
            if (!drawing.ra) return;
            const color = drawing.color || this.colors.ra;
            ctx.save();
            ctx.globalAlpha = 0.7;
            this.drawEDPVRLine(ctx, vMax, pMax, drawing.ra.alpha, drawing.ra.beta, drawing.ra.v0, color);
            this.drawLVESPVRLine(ctx, vMax, pMax, drawing.ra.ees, drawing.ra.v0, color);
            this.drawPVPath(ctx, drawing.ra.volume, drawing.ra.pressure, vMax, pMax, color, 1.6, false);
            ctx.restore();
        });
    }

    drawSavedRVPVLoops(chart, savedDrawings, vMax, pMax) {
        if (!chart || !Array.isArray(savedDrawings) || savedDrawings.length === 0) return;
        const { ctx } = chart;
        savedDrawings.forEach((drawing) => {
            if (!drawing.rv) return;
            const color = drawing.color || this.colors.rv;
            ctx.save();
            ctx.globalAlpha = 0.7;
            this.drawEDPVRLine(ctx, vMax, pMax, drawing.rv.alpha, drawing.rv.beta, drawing.rv.v0, color);
            this.drawLVESPVRLine(ctx, vMax, pMax, drawing.rv.ees, drawing.rv.v0, color);
            this.drawPVPath(ctx, drawing.rv.volume, drawing.rv.pressure, vMax, pMax, color, 1.6, false);
            ctx.restore();
        });
    }

    drawSavedLVPVLoops(chart, savedDrawings, vMax, pMax) {
        if (!chart || !Array.isArray(savedDrawings) || savedDrawings.length === 0) return;
        const { ctx } = chart;
        savedDrawings.forEach((drawing) => {
            if (!drawing.lv) return;
            const color = drawing.color || this.colors.lv;
            ctx.save();
            ctx.globalAlpha = 0.7;
            this.drawEDPVRLine(ctx, vMax, pMax, drawing.lv.alpha, drawing.lv.beta, drawing.lv.v0, color);
            this.drawLVESPVRLine(ctx, vMax, pMax, drawing.lv.ees, drawing.lv.v0, color);
            this.drawPVPath(ctx, drawing.lv.volume, drawing.lv.pressure, vMax, pMax, color, 1.6, false);
            ctx.restore();
        });
    }

    /**
     * 循環平衡（CO/VR）曲線を描画
     */
    drawBalanceChart(chart, simulator, scaleSettings = {}, balanceCurve = null) {
        if (!chart) return;
        const { ctx, width, height } = chart;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        const xMin = 0;
        const xMax = Math.max(5, scaleSettings.balanceXMax || 20);

        let yMax = Math.max(4, scaleSettings.balanceYMax || 12);
        const curves = [];

        if (Array.isArray(balanceCurve) && balanceCurve.length > 0) {
            const first = balanceCurve[0];
            if (first && Array.isArray(first.points)) {
                balanceCurve.forEach((curve) => {
                    if (!curve || !Array.isArray(curve.points)) return;
                    const points = curve.points.filter((pt) => pt.x >= xMin && pt.x <= xMax);
                    if (points.length === 0) return;
                    curves.push({ points, color: curve.color });
                });
            } else if (first && typeof first.x === 'number') {
                const points = balanceCurve.filter((pt) => pt.x >= xMin && pt.x <= xMax);
                if (points.length > 0) {
                    curves.push({ points, color: this.colors.coCurve });
                }
            }
        }

        this.drawGrid(chart, xMin, xMax, 0, yMax);

        if (curves.length > 0) {
            curves.forEach((curve) => {
                ctx.strokeStyle = curve.color || this.colors.coCurve;
                ctx.lineWidth = 2;
                ctx.beginPath();
                curve.points.forEach((pt, idx) => {
                    const x = (pt.x - xMin) / (xMax - xMin) * width;
                    const y = height - (pt.y / yMax) * height;
                    if (idx === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.stroke();
            });
        } else {
            ctx.fillStyle = this.colors.text;
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('＋ 曲線追加で描画', width / 2, height / 2);
        }

        ctx.fillStyle = this.colors.text;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Pmsf / Pv (mmHg)', 4, height - 4);
        ctx.save();
        ctx.translate(8, 12);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('CO (L/min)', 0, 0);
        ctx.restore();

        ctx.textAlign = 'right';
        ctx.fillStyle = this.colors.coCurve;
        ctx.fillText('CO', width - 6, 12);
    }

    drawPericardiumChart(chart, simulator, scaleSettings = {}) {
        if (!chart || !simulator) return;
        const { ctx, width, height } = chart;
        const params = simulator.params || {};
        const v0 = params.periV0 ?? 0;
        const vScale = params.periVScale ?? 1;
        const k = params.periK ?? 0;
        const fluid = params.periFluid ?? 0;
        const state = simulator.getState();
        const heartVolume = (state.raVolume || 0) + (state.rvVolume || 0) + (state.laVolume || 0) + (state.lvVolume || 0);
        const totalVolume = heartVolume + fluid;

        const vMin = 0;
        const vMaxDisplay = Math.max(vMin + 10, scaleSettings.periVMax || (v0 + vScale * 8));
        const curveVMax = Math.max(
            v0 + vScale * 8,
            (params.periVknee ?? v0) + (params.periVScale2 ?? vScale) * 8,
            totalVolume + 20,
            vMaxDisplay
        );
        const curveKey = [
            v0, vScale, k,
            params.periVknee ?? '',
            params.periK2 ?? '',
            params.periVScale2 ?? ''
        ].join('|');
        if (!this.periCurveCache) this.periCurveCache = { key: '', max: 0, points: [] };
        if (this.periCurveCache.key !== curveKey || this.periCurveCache.max !== curveVMax) {
            const step = Math.max(1, curveVMax / 200);
            const points = [];
            for (let v = vMin; v <= curveVMax + 1e-6; v += step) {
                const p = typeof simulator.calcPericardialPressure === 'function'
                    ? simulator.calcPericardialPressure(v)
                    : 0;
                points.push({ v, p });
            }
            this.periCurveCache = { key: curveKey, max: curveVMax, points };
        }
        const curve = this.periCurveCache.points;
        let displayCurve = curve.filter((point) => point.v >= vMin && point.v <= vMaxDisplay);
        if (displayCurve.length < 2) {
            const points = 60;
            displayCurve = [];
            for (let i = 0; i <= points; i++) {
                const v = vMin + (vMaxDisplay - vMin) * (i / points);
                const p = typeof simulator.calcPericardialPressure === 'function'
                    ? simulator.calcPericardialPressure(v)
                    : 0;
                displayCurve.push({ v, p });
            }
        }
        let yMax = Math.max(5, scaleSettings.periPMax || 0);
        if (!(scaleSettings.periPMax > 0)) {
            displayCurve.forEach((point) => {
                if (point.p > yMax) yMax = point.p;
            });
            yMax = Math.max(5, yMax * 1.1);
        }

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        this.drawGrid(chart, vMin, vMaxDisplay, 0, yMax, '', '', false);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.clip();
        ctx.strokeStyle = this.colors.pericardium;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        for (const point of displayCurve) {
            const x = ((point.v - vMin) / (vMaxDisplay - vMin)) * width;
            const rawY = height - (point.p / yMax) * height;
            if (rawY < 0) {
                const y = 0;
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
                break;
            }
            const y = rawY > height - 1 ? height - 1 : rawY;
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.restore();

        const currentP = typeof simulator.calcPericardialPressure === 'function'
            ? simulator.calcPericardialPressure(totalVolume)
            : 0;
        const clampedV = Math.max(vMin, Math.min(vMaxDisplay, totalVolume));
        const dotX = ((clampedV - vMin) / (vMaxDisplay - vMin)) * width;
        const rawDotY = height - (currentP / yMax) * height;
        const dotY = Math.min(height - 1, Math.max(1, rawDotY));
        ctx.fillStyle = this.colors.pericardium;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fill();

        this.drawGridLabels(chart, vMin, vMaxDisplay, 0, yMax);
    }

    /**
     * すべてのチャートを更新
     */
    update(simulator, scaleSettings, metrics = null, waveformVisibility = {}, balanceCurve = null, savedDrawings = []) {
        const history = simulator.getHistory();
        const state = simulator.getState();
        const params = simulator.params;
        const visibility = {
            art: waveformVisibility.art !== false,
            lvp: waveformVisibility.lvp !== false,
            lap: waveformVisibility.lap !== false,
            rap: waveformVisibility.rap !== false,
            rvp: waveformVisibility.rvp !== false,
            pap: waveformVisibility.pap !== false,
            avFlow: waveformVisibility.avFlow !== false,
            mvFlow: waveformVisibility.mvFlow !== false,
            tvFlow: waveformVisibility.tvFlow !== false,
            pvFlow: waveformVisibility.pvFlow !== false,
            svFlow: waveformVisibility.svFlow !== false,
            pvnFlow: waveformVisibility.pvnFlow !== false,
            // elastance表示は廃止
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

        // === エラスタンス表示は廃止 ===

        // === 圧波形（スイープ表示） ===
        // 各波形の個別スケール設定
        // scaleSettingsに入っていれば使うが、なければデフォルト値を設定
        // LAは小さいため大きく表示するためにスケールを下げる（0-40など）
        const lvAoMax = scaleSettings.monitorPressureLvAoMax || 140;
        const laMax = scaleSettings.monitorPressureLaMax || 40;  // 低圧系
        const rvPaMax = scaleSettings.monitorPressureRvPaMax || 60;
        const raMax = scaleSettings.monitorPressureRaMax || laMax;
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
            if (visibility.rap) pressureScales.push({ min: 0, max: raMax, color: this.colors.ra });
            if (visibility.rvp) pressureScales.push({ min: 0, max: rvPaMax, color: this.colors.rv });
            if (visibility.pap) pressureScales.push({ min: 0, max: rvPaMax, color: this.colors.pa });
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
            // 右房圧 (個別スケール raMax)
            if (visibility.rap) {
                this.drawSweepLine(chart, history.time, history.raPressure, currentTime, 0, raMax, this.colors.ra);
            }
            // 左室圧 (個別スケール lvMax)
            if (visibility.lvp) {
                this.drawSweepLine(chart, history.time, history.lvPressure, currentTime, 0, lvMax, this.colors.lv);
            }
            // 右室圧 (個別スケール rvPaMax)
            if (visibility.rvp) {
                this.drawSweepLine(chart, history.time, history.rvPressure, currentTime, 0, rvPaMax, this.colors.rv);
            }
            // 大動脈圧 (個別スケール aoMax)
            if (visibility.art) {
                this.drawSweepLine(chart, history.time, history.aoPressure, currentTime, 0, aoMax, this.colors.ao);
            }
            // 肺動脈圧 (個別スケール rvPaMax)
            if (visibility.pap) {
                this.drawSweepLine(chart, history.time, history.paPressure, currentTime, 0, rvPaMax, this.colors.pa);
            }
            // 静脈圧 (スケールはLAと同じにするか、独自にするか。今回はLAに合わせるか表示しない) -- 以前削除したので描画しない

            this.drawSweepCursor(chart, currentTime);
            this.drawSweepCursor(chart, currentTime);

            // 凡例
            const legends = [];
            if (visibility.lap) legends.push({ label: 'LA', color: this.colors.la });
            if (visibility.rap) legends.push({ label: 'RA', color: this.colors.ra });
            if (visibility.lvp) legends.push({ label: 'LV', color: this.colors.lv });
            if (visibility.rvp) legends.push({ label: 'RV', color: this.colors.rv });
            if (visibility.art) legends.push({ label: 'AO', color: this.colors.ao });
            if (visibility.pap) legends.push({ label: 'PA', color: this.colors.pa });
            chart.ctx.font = '10px sans-serif';
            chart.ctx.textAlign = 'right';
            let legendX = chart.width - 10;
            legends.slice().reverse().forEach((item) => {
                chart.ctx.fillStyle = item.color;
                chart.ctx.fillText(item.label, legendX, 12);
                legendX -= 36;
            });
        }

        // === 弁Flow（スイープ表示） ===
        const flowMin = scaleSettings.flowMin || -200;
        const flowMax = scaleSettings.flowMax || 1200;
        if (this.charts.flowRight) {
            const chart = this.charts.flowRight;
            chart.ctx.fillStyle = '#000000';
            chart.ctx.fillRect(0, 0, chart.width, chart.height);
            this.drawSweepGrid(chart, flowMin, flowMax);
            if (visibility.svFlow) {
                this.drawSweepLine(chart, history.time, history.systemicVenousFlow, currentTime, flowMin, flowMax, this.colors.vein, 1.5, true);
            }
            if (visibility.tvFlow) {
                this.drawSweepLine(chart, history.time, history.tricuspidFlow, currentTime, flowMin, flowMax, this.colors.tricuspid, 1.5, true);
            }
            if (visibility.pvFlow) {
                this.drawSweepLine(chart, history.time, history.pulmonaryFlow, currentTime, flowMin, flowMax, this.colors.pulmonary, 1.5, true);
            }
            this.drawSweepCursor(chart, currentTime);
        }

        if (this.charts.flowLeft) {
            const chart = this.charts.flowLeft;
            chart.ctx.fillStyle = '#000000';
            chart.ctx.fillRect(0, 0, chart.width, chart.height);
            this.drawSweepGrid(chart, flowMin, flowMax);
            if (visibility.pvnFlow) {
                this.drawSweepLine(chart, history.time, history.venousFlow, currentTime, flowMin, flowMax, this.colors.pulmonaryVein, 1.5, true);
            }
            if (visibility.mvFlow) {
                this.drawSweepLine(chart, history.time, history.mitralFlow, currentTime, flowMin, flowMax, this.colors.mitral, 1.5, true);
            }
            if (visibility.avFlow) {
                this.drawSweepLine(chart, history.time, history.aorticFlow, currentTime, flowMin, flowMax, this.colors.aortic, 1.5, true);
            }
            this.drawSweepCursor(chart, currentTime);
        }

        // === PVループ用の直近3心拍分のみ抽出 ===
        const beatDuration = 60 / (params.hr || 60);
        const keepDuration = beatDuration * 3;
        const lastHistoryTime = history.time[history.time.length - 1];
        let startIndex = 0;
        if (history.time.length > 0) {
            const thresholdTime = lastHistoryTime - keepDuration;
            startIndex = history.time.findIndex(t => t >= thresholdTime);
            if (startIndex < 0) startIndex = 0;
        }

        // === 右房PVループ ===
        const raVMax = scaleSettings.raVMax || 80;
        const raPMax = scaleSettings.raPMax || 20;
        this.drawPVLoop(
            this.charts.raPV,
            history.raVolume.slice(startIndex),
            history.raPressure.slice(startIndex),
            raVMax, raPMax,
            params.raEes, params.raV0,
            params.raAlpha, params.raBeta, params.raV0,
            this.colors.ra
        );
        this.drawSavedRAPVLoops(this.charts.raPV, savedDrawings, raVMax, raPMax);
        this.drawGridLabels(this.charts.raPV, 0, raVMax, 0, raPMax);

        // === 右室PVループ ===
        const rvVMax = scaleSettings.rvVMax || 160;
        const rvPMax = scaleSettings.rvPMax || 60;
        this.drawPVLoop(
            this.charts.rvPV,
            history.rvVolume.slice(startIndex),
            history.rvPressure.slice(startIndex),
            rvVMax, rvPMax,
            params.rvEes, params.rvV0,
            params.rvAlpha, params.rvBeta, params.rvV0,
            this.colors.rv
        );
        this.drawSavedRVPVLoops(this.charts.rvPV, savedDrawings, rvVMax, rvPMax);
        this.drawGridLabels(this.charts.rvPV, 0, rvVMax, 0, rvPMax);

        // === 左房PVループ ===

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
        this.drawSavedLAPVLoops(this.charts.laPV, savedDrawings, laVMax, laPMax);
        this.drawGridLabels(this.charts.laPV, 0, laVMax, 0, laPMax);

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
        this.drawSavedLVPVLoops(this.charts.lvPV, savedDrawings, lvVMax, lvPMax);
        this.drawGridLabels(this.charts.lvPV, 0, lvVMax, 0, lvPMax);

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

            const line1 = `EF:${metrics.ef}%  SV:${metrics.sv}ml  Ees:${metrics.ees}  Ea:${metrics.ea}`;
            const line2 = `SW:${metrics.ew}  PE:${metrics.pw}  Eff:${metrics.efficiency}%`;
            chart.ctx.fillText(line1, textX, textY);
            chart.ctx.fillText(line2, textX, textY + 14);
        }

        // === 循環平衡（CO/VR） ===
        if (this.charts.balance) {
            this.drawBalanceChart(this.charts.balance, simulator, scaleSettings, balanceCurve);
        }

        // === 心膜 PV関係 ===
        if (this.charts.pericardium) {
            this.drawPericardiumChart(this.charts.pericardium, simulator, scaleSettings);
        }
    }
}
