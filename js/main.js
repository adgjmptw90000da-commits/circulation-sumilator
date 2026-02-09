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
        this.balanceCurves = [];
        this.balanceCurveToken = 0;
        this.balanceWorker = null;
        this.balanceWorkerFailed = false;
        this.balanceCurveRequests = new Map();
        this.balanceCurveColors = ['#ff6b6b', '#5c7cfa', '#51cf66', '#ffd43b', '#ff922b'];
        this.isBalanceComputing = false;
        this.savedDrawings = [];
        this.savedDrawingColors = ['#ff6b6b', '#5c7cfa', '#51cf66', '#ffd43b', '#ff922b'];
        this.activeParamsTab = 'simple';
        this.isSaveNameComposing = false;
        this.resizeRaf = 0;
        this.resizeObserver = null;
        this.presets = [];
        this.activePresetId = '';
        this.adminToken = '';

        this.initUI();
        this.bindEvents();
        this.setupResizeObserver();
        this.updateControls();
        // 初回描画
        this.chartManager.update(
            this.simulator,
            this.getScaleSettings(),
            null,
            this.getWaveformVisibility(),
            this.getBalanceCurvesForChart(),
            this.savedDrawings
        );
        this.updateStatus();
        this.loadPresets();
    }

    initUI() {
        // 既存のパラメータ値をUIに反映
        this.syncParamsToUI();
        this.syncSpeedFromUI();
        this.applyPressureVitalVisibility();
        this.updateParamGroupVisibility();
        this.updateSimpleGroupVisibility();
        this.setupNumberSteppers();
        this.applyParamLabelSizing();
        this.setParamsTab(this.activeParamsTab);
        this.renderSavedDrawings();
        this.setAdminLoggedIn(false);
        this.restoreAdminSession();
    }

    applyParamLabelSizing() {
        const baseLabel = 'RA Ees (mmHg/mL)';
        const limit = baseLabel.length;
        document.querySelectorAll('.param-row label').forEach((label) => {
            if (label.classList.contains('label-small')) return;
            const text = (label.textContent || '').trim();
            if (text.length > limit) {
                label.classList.add('label-small');
            }
        });
    }

    bindEvents() {
        // コントロールボタン
        document.getElementById('startBtn').addEventListener('click', () => this.toggleRun());
        const toggleBtn = document.getElementById('toggleParamsBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleParamsPanel());
        }
        const openSettingsBtn = document.getElementById('openSettingsBtn');
        if (openSettingsBtn) {
            openSettingsBtn.addEventListener('click', () => {
                this.showParamsPanel();
                this.setParamsTab('settings');
            });
        }
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        const modelToggleBtn = document.getElementById('modelToggleBtn');
        if (modelToggleBtn) {
            modelToggleBtn.addEventListener('click', () => {
                window.location.href = 'legacy/index.html';
            });
        }

        const paramGroupSelect = document.getElementById('paramGroupSelect');
        if (paramGroupSelect) {
            paramGroupSelect.addEventListener('change', () => this.updateParamGroupVisibility());
        }
        const simpleGroupSelect = document.getElementById('simpleGroupSelect');
        if (simpleGroupSelect) {
            simpleGroupSelect.addEventListener('change', () => this.updateSimpleGroupVisibility());
        }
        document.querySelectorAll('.params-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                if (target) this.setParamsTab(target);
            });
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
        this.bindSimpleInputs();

        // リサイズ対応
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        const addCurveBtn = document.getElementById('addBalanceCurveBtn');
        if (addCurveBtn) {
            addCurveBtn.addEventListener('click', () => this.addBalanceCurve());
        }
        const drawCurveBtn = document.getElementById('drawBalanceCurveBtn');
        if (drawCurveBtn) {
            drawCurveBtn.addEventListener('click', () => this.drawCurrentBalanceCurve());
        }
        const clearCurveBtn = document.getElementById('clearBalanceCurvesBtn');
        if (clearCurveBtn) {
            clearCurveBtn.addEventListener('click', () => this.clearBalanceCurves());
        }
        const nameInput = document.getElementById('balanceNameInput');
        if (nameInput) {
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addBalanceCurve();
                }
            });
        }

        const saveBtn = document.getElementById('saveDrawingBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveDrawing());
        }
        const cancelSaveBtn = document.getElementById('cancelSaveDrawingBtn');
        if (cancelSaveBtn) {
            cancelSaveBtn.addEventListener('click', () => this.closeSaveDrawingForm());
        }
        const saveNameInput = document.getElementById('saveDrawingName');
        if (saveNameInput) {
            saveNameInput.addEventListener('compositionstart', () => {
                this.isSaveNameComposing = true;
            });
            saveNameInput.addEventListener('compositionend', () => {
                this.isSaveNameComposing = false;
            });
            saveNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (e.isComposing || this.isSaveNameComposing || e.keyCode === 229) {
                        return;
                    }
                    e.preventDefault();
                    this.saveDrawing();
                }
            });
        }

        const presetSelect = document.getElementById('presetSelect');
        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => {
                const id = e.target.value;
                this.activePresetId = id;
                const preset = this.presets.find((item) => item.id === id);
                this.fillPresetForm(preset);
                this.updatePresetApplyState();
            });
        }
        const presetApplyBtn = document.getElementById('presetApplyBtn');
        if (presetApplyBtn) {
            presetApplyBtn.addEventListener('click', () => this.applySelectedPreset());
        }

        const adminLoginOpenBtn = document.getElementById('adminLoginOpenBtn');
        if (adminLoginOpenBtn) {
            adminLoginOpenBtn.addEventListener('click', () => this.handleAdminButton());
        }
        const adminLoginCloseBtn = document.getElementById('adminLoginCloseBtn');
        if (adminLoginCloseBtn) {
            adminLoginCloseBtn.addEventListener('click', () => this.closeAdminModal());
        }
        const adminLoginCancelBtn = document.getElementById('adminLoginCancelBtn');
        if (adminLoginCancelBtn) {
            adminLoginCancelBtn.addEventListener('click', () => this.closeAdminModal());
        }
        const adminLoginSubmitBtn = document.getElementById('adminLoginSubmitBtn');
        if (adminLoginSubmitBtn) {
            adminLoginSubmitBtn.addEventListener('click', () => this.loginAdmin());
        }
        const presetSaveBtn = document.getElementById('presetSaveBtn');
        if (presetSaveBtn) {
            presetSaveBtn.addEventListener('click', () => this.savePreset());
        }
        const presetUpdateBtn = document.getElementById('presetUpdateBtn');
        if (presetUpdateBtn) {
            presetUpdateBtn.addEventListener('click', () => this.updatePreset());
        }
        const presetDeleteBtn = document.getElementById('presetDeleteBtn');
        if (presetDeleteBtn) {
            presetDeleteBtn.addEventListener('click', () => this.deletePreset());
        }
    }

    setupNumberSteppers() {
        const inputs = document.querySelectorAll('input[type="number"]');
        inputs.forEach((input) => {
            if (input.dataset.stepperReady === 'true') return;
            if (input.closest('.number-stepper')) return;

            const stepper = document.createElement('div');
            stepper.className = 'number-stepper';
            const decBtn = document.createElement('button');
            decBtn.type = 'button';
            decBtn.className = 'number-stepper-btn';
            decBtn.textContent = '−';
            const incBtn = document.createElement('button');
            incBtn.type = 'button';
            incBtn.className = 'number-stepper-btn';
            incBtn.textContent = '＋';

            const parent = input.parentNode;
            if (!parent) return;
            parent.insertBefore(stepper, input);
            stepper.appendChild(decBtn);
            stepper.appendChild(input);
            stepper.appendChild(incBtn);
            input.dataset.stepperReady = 'true';

            const getStep = () => {
                const stepAttr = input.getAttribute('step');
                if (!stepAttr || stepAttr === 'any') return 1;
                const parsed = parseFloat(stepAttr);
                return isNaN(parsed) ? 1 : parsed;
            };

            const getDecimals = (step) => {
                const stepStr = step.toString();
                const idx = stepStr.indexOf('.');
                return idx >= 0 ? stepStr.length - idx - 1 : 0;
            };

            const clamp = (value) => {
                const minAttr = input.getAttribute('min');
                const maxAttr = input.getAttribute('max');
                let next = value;
                if (minAttr !== null && minAttr !== '') {
                    const min = parseFloat(minAttr);
                    if (!isNaN(min)) next = Math.max(min, next);
                }
                if (maxAttr !== null && maxAttr !== '') {
                    const max = parseFloat(maxAttr);
                    if (!isNaN(max)) next = Math.min(max, next);
                }
                return next;
            };

            const applyDelta = (direction) => {
                const step = getStep();
                const decimals = getDecimals(step);
                const currentRaw = parseFloat(input.value);
                const base = isNaN(currentRaw) ? 0 : currentRaw;
                const invert = input.dataset.invertStep === 'true';
                const signedDirection = invert ? -direction : direction;
                let next = base + step * signedDirection;
                next = clamp(next);
                input.value = decimals > 0 ? next.toFixed(decimals) : next.toString();
                input.dispatchEvent(new Event('change', { bubbles: true }));
            };

            decBtn.addEventListener('click', () => applyDelta(-1));
            incBtn.addEventListener('click', () => applyDelta(1));
        });
    }

    toggleParamsPanel() {
        const panel = document.getElementById('paramsPanel');
        const section = document.querySelector('.monitor-section');
        const button = document.getElementById('toggleParamsBtn');
        if (!panel || !section || !button) return;
        this.setParamsPanelVisible(panel.classList.contains('is-hidden'));
    }

    setParamsPanelVisible(visible) {
        const panel = document.getElementById('paramsPanel');
        const section = document.querySelector('.monitor-section');
        const button = document.getElementById('toggleParamsBtn');
        if (!panel || !section || !button) return;
        panel.classList.toggle('is-hidden', !visible);
        section.classList.toggle('params-hidden', !visible);
        button.textContent = visible ? '📋 パラメータ' : '📋 パラメータ表示';
        this.chartManager.resize();
        this.chartManager.update(
            this.simulator,
            this.getScaleSettings(),
            this.calculateMetrics(),
            this.getWaveformVisibility(),
            this.getBalanceCurvesForChart(),
            this.savedDrawings
        );
    }

    showParamsPanel() {
        this.setParamsPanelVisible(true);
    }

    setParamsTab(tab) {
        this.activeParamsTab = tab;
        document.querySelectorAll('.params-tab').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.tab === tab);
        });
        document.querySelectorAll('.params-tab-content').forEach((content) => {
            content.classList.toggle('is-active', content.dataset.tabContent === tab);
        });
        if (tab === 'params') {
            this.updateParamGroupVisibility();
        }
        if (tab === 'simple') {
            this.updateSimpleGroupVisibility();
        }
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

    updateSimpleGroupVisibility() {
        const select = document.getElementById('simpleGroupSelect');
        const groups = document.querySelectorAll('.simple-group');
        if (!select || groups.length === 0) return;
        const value = select.value;
        groups.forEach((group) => {
            group.classList.toggle('is-active', group.dataset.simpleGroup === value);
        });
    }

    async loadPresets() {
        const select = document.getElementById('presetSelect');
        if (!select) return;
        select.innerHTML = '<option value="">読み込み中...</option>';
        try {
            const res = await fetch('/api/presets');
            if (!res.ok) throw new Error('failed to load presets');
            const data = await res.json();
            this.presets = Array.isArray(data) ? data : [];
        } catch (err) {
            this.presets = [];
        }
        this.renderPresetOptions();
    }

    renderPresetOptions() {
        const select = document.getElementById('presetSelect');
        if (!select) return;
        select.innerHTML = '<option value="">なし</option>';
        this.presets.forEach((preset) => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.name || '無名プリセット';
            select.appendChild(option);
        });
        if (this.activePresetId) {
            select.value = this.activePresetId;
        }
        this.updatePresetApplyState();
    }

    updatePresetApplyState() {
        const btn = document.getElementById('presetApplyBtn');
        if (!btn) return;
        btn.disabled = !this.activePresetId;
    }

    applySelectedPreset() {
        if (!this.activePresetId) return;
        const preset = this.presets.find((item) => item.id === this.activePresetId);
        if (!preset || !preset.params) return;
        this.simulator.updateParams({ ...preset.params });
        if (preset.display) {
            this.applyDisplaySettings(preset.display);
        }
        this.syncParamsToUI();
        this.redrawNow();
    }

    fillPresetForm(preset) {
        const nameInput = document.getElementById('presetName');
        const descInput = document.getElementById('presetDescription');
        if (nameInput) nameInput.value = preset?.name || '';
        if (descInput) descInput.value = preset?.description || '';
    }

    handleAdminButton() {
        if (this.adminToken) {
            if (confirm('管理者ログアウトしますか？')) {
                this.logoutAdmin();
            }
            return;
        }
        this.openAdminModal();
    }

    openAdminModal() {
        const modal = document.getElementById('adminLoginModal');
        if (modal) modal.hidden = false;
        const input = document.getElementById('adminLoginInput');
        if (input) {
            input.value = '';
            input.focus();
        }
    }

    closeAdminModal() {
        const modal = document.getElementById('adminLoginModal');
        if (modal) modal.hidden = true;
    }

    setAdminLoggedIn(isLoggedIn) {
        const panel = document.getElementById('presetAdminPanel');
        if (panel) panel.hidden = !isLoggedIn;
        const btn = document.getElementById('adminLoginOpenBtn');
        if (btn) btn.textContent = isLoggedIn ? '👤 管理者' : '👤 一般';
    }

    async loginAdmin() {
        const input = document.getElementById('adminLoginInput');
        const token = input ? input.value.trim() : '';
        if (!token) {
            alert('管理者パスワードを入力してください。');
            return;
        }
        try {
            const res = await fetch('/api/presets/check', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': token
                }
            });
            if (!res.ok) throw new Error('auth failed');
            this.adminToken = token;
            this.setAdminLoggedIn(true);
            this.closeAdminModal();
            sessionStorage.setItem('adminToken', token);
        } catch (err) {
            alert('パスワードが違います。');
        }
    }

    logoutAdmin() {
        this.adminToken = '';
        this.setAdminLoggedIn(false);
        sessionStorage.removeItem('adminToken');
    }

    async restoreAdminSession() {
        const storedToken = sessionStorage.getItem('adminToken');
        if (!storedToken) return;
        try {
            const res = await fetch('/api/presets/check', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': storedToken
                }
            });
            if (!res.ok) throw new Error('auth failed');
            this.adminToken = storedToken;
            this.setAdminLoggedIn(true);
        } catch (err) {
            sessionStorage.removeItem('adminToken');
        }
    }

    async presetAdminRequest(method, body) {
        const res = await fetch('/api/presets', {
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': this.adminToken
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            throw new Error(`request failed: ${res.status}`);
        }
        return res.json();
    }

    async savePreset() {
        if (!this.adminToken) {
            alert('管理者モードでログインしてください。');
            return;
        }
        const nameInput = document.getElementById('presetName');
        const descInput = document.getElementById('presetDescription');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) {
            alert('プリセット名を入力してください。');
            return;
        }
        const description = descInput ? descInput.value.trim() : '';
        try {
            await this.presetAdminRequest('POST', {
                name,
                description,
                params: { ...this.simulator.params },
                display: this.getDisplaySettings()
            });
            await this.loadPresets();
        } catch (err) {
            alert('保存に失敗しました。');
        }
    }

    async updatePreset() {
        if (!this.adminToken) {
            alert('管理者モードでログインしてください。');
            return;
        }
        if (!this.activePresetId) {
            alert('更新するプリセットを選択してください。');
            return;
        }
        const nameInput = document.getElementById('presetName');
        const descInput = document.getElementById('presetDescription');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) {
            alert('プリセット名を入力してください。');
            return;
        }
        const description = descInput ? descInput.value.trim() : '';
        try {
            await this.presetAdminRequest('PUT', {
                id: this.activePresetId,
                name,
                description,
                params: { ...this.simulator.params },
                display: this.getDisplaySettings()
            });
            await this.loadPresets();
            this.activePresetId = '';
            const select = document.getElementById('presetSelect');
            if (select) select.value = '';
            this.updatePresetApplyState();
        } catch (err) {
            alert('更新に失敗しました。');
        }
    }

    async deletePreset() {
        if (!this.adminToken) {
            alert('管理者モードでログインしてください。');
            return;
        }
        if (!this.activePresetId) {
            alert('削除するプリセットを選択してください。');
            return;
        }
        if (!confirm('選択したプリセットを削除しますか？')) return;
        try {
            await this.presetAdminRequest('DELETE', { id: this.activePresetId });
            this.activePresetId = '';
            await this.loadPresets();
            const select = document.getElementById('presetSelect');
            if (select) select.value = '';
            this.fillPresetForm({ name: '', description: '' });
            this.updatePresetApplyState();
        } catch (err) {
            alert('削除に失敗しました。');
        }
    }

    handleResize() {
        if (this.resizeRaf) {
            cancelAnimationFrame(this.resizeRaf);
        }
        this.resizeRaf = requestAnimationFrame(() => {
            this.resizeRaf = 0;
            this.chartManager.resize();
            this.chartManager.update(
                this.simulator,
                this.getScaleSettings(),
                this.calculateMetrics(),
                this.getWaveformVisibility(),
                this.getBalanceCurvesForChart(),
                this.savedDrawings
            );
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

    computeBalanceCurve(paramsSnapshot, xMax) {
        const points = 25;
        const steadyBeats = 20;
        const sampleBeats = 3;
        if (this.balanceWorkerFailed || typeof Worker === 'undefined') {
            return this.computeBalanceCurveAsync(paramsSnapshot, xMax, points, steadyBeats, sampleBeats);
        }

        if (!this.balanceWorker) {
            this.balanceWorker = new Worker('js/balance-worker.js');
            this.balanceWorker.addEventListener('error', () => {
                this.balanceWorkerFailed = true;
                this.balanceWorker = null;
            });
            this.balanceWorker.addEventListener('message', (e) => {
                if (!e.data || !Array.isArray(e.data.results)) return;
                const token = e.data.token;
                const req = this.balanceCurveRequests.get(token);
                if (!req) return;
                clearTimeout(req.timeout);
                this.balanceCurveRequests.delete(token);
                req.resolve(e.data.results);
            });
        }

        return new Promise((resolve) => {
            const token = ++this.balanceCurveToken;
            const timeout = setTimeout(() => {
                if (!this.balanceCurveRequests.has(token)) return;
                this.balanceCurveRequests.delete(token);
                this.balanceWorkerFailed = true;
                this.computeBalanceCurveAsync(paramsSnapshot, xMax, points, steadyBeats, sampleBeats)
                    .then(resolve);
            }, 1200);
            this.balanceCurveRequests.set(token, { resolve, timeout });
            this.balanceWorker.postMessage({
                token,
                params: paramsSnapshot,
                xMax,
                points,
                beats: steadyBeats,
                sampleBeats
            });
        });
    }

    computeBalanceCurveAsync(paramsSnapshot, xMax, points = 25, beats = 20, sampleBeats = 3) {
        const totalPoints = Math.max(2, points);
        const results = new Array(totalPoints);
        let index = 0;

        return new Promise((resolve) => {
            const runNext = () => {
                if (index >= totalPoints) {
                    resolve(results);
                    return;
                }
                const pvTarget = (xMax * index) / (totalPoints - 1);
                this.computeBalancePointAsync(paramsSnapshot, pvTarget, beats, sampleBeats)
                    .then((y) => {
                        results[index] = { x: pvTarget, y };
                        index += 1;
                        setTimeout(runNext, 0);
                    });
            };
            runNext();
        });
    }

    computeBalancePointAsync(paramsSnapshot, pvTarget, beats, sampleBeats) {
        return new Promise((resolve) => {
            const sim = new CirculationSimulator();
            sim.updateParams({ ...paramsSnapshot, pv: pvTarget });
            const hr = sim.params.hr || 75;
            const stepsPerBeat = Math.max(1, Math.floor((60 / hr) / SIM_CONFIG.dt));
            const totalSteps = stepsPerBeat * Math.max(1, beats);
            const chunk = 250;
            let step = 0;

            const runChunk = () => {
                const end = Math.min(step + chunk, totalSteps);
                for (; step < end; step++) {
                    sim.step();
                }
                if (step < totalSteps) {
                    setTimeout(runChunk, 0);
                    return;
                }
                const history = sim.getHistory();
                const sampleSteps = stepsPerBeat * Math.max(1, sampleBeats);
                const startIndex = Math.max(0, history.time.length - sampleSteps);
                const recentAoFlow = history.aorticFlow.slice(startIndex);
                const meanAo = recentAoFlow.length
                    ? recentAoFlow.reduce((a, b) => a + b, 0) / recentAoFlow.length
                    : 0;
                resolve(meanAo * 60 / 1000);
            };

            runChunk();
        });
    }

    computeBalanceCurveSync(paramsSnapshot, xMax, points = 25, beats = 20, sampleBeats = 3) {
        const results = [];
        for (let i = 0; i < points; i++) {
            const pvTarget = (xMax * i) / (points - 1);
            const sim = new CirculationSimulator();
            sim.updateParams({ ...paramsSnapshot, pv: pvTarget });
            const hr = sim.params.hr || 75;
            const stepsPerBeat = Math.max(1, Math.floor((60 / hr) / SIM_CONFIG.dt));
            const totalSteps = stepsPerBeat * Math.max(1, beats);
            for (let step = 0; step < totalSteps; step++) {
                sim.step();
            }
            const history = sim.getHistory();
            const sampleSteps = stepsPerBeat * Math.max(1, sampleBeats);
            const startIndex = Math.max(0, history.time.length - sampleSteps);
            const recentAoFlow = history.aorticFlow.slice(startIndex);
            const meanAo = recentAoFlow.length
                ? recentAoFlow.reduce((a, b) => a + b, 0) / recentAoFlow.length
                : 0;
            results.push({ x: pvTarget, y: meanAo * 60 / 1000 });
        }
        return results;
    }

    bindParamInputs() {
        const applyParamUpdate = (paramKey, value) => {
            this.simulator.updateParams({ [paramKey]: value });
            this.syncParamsToUI();
            this.redrawNow();
        };
        const paramMapping = {
            'param-hr': 'hr',
            'param-pr': 'prInterval',
            'param-pv': 'pv',
            'param-rv': 'rv',
            'param-ra-ees': 'raEes',
            'param-ra-alpha': 'raAlpha',
            'param-ra-beta': 'raBeta',
            'param-ra-v0': 'raV0',
            'param-rt': 'rt',
            'param-lt': 'lt',
            'param-tv-area': 'tvArea',
            'param-rv-ees': 'rvEes',
            'param-rv-alpha': 'rvAlpha',
            'param-rv-beta': 'rvBeta',
            'param-rv-v0': 'rvV0',
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
            'param-rp': 'rp',
            'param-lp': 'lp',
            'param-ra': 'ra',
            'param-la-inert': 'la',
            'param-as-ava': 'asAva',
            'param-ar-eroa': 'arEroa',
            'param-ar-cd': 'arCd',
            'param-cp': 'cp',
            'param-pvr': 'pvr',
            'param-pvr-venous': 'pvrVenous',
            'param-pa-area': 'paArea',
            'param-pv-alpha': 'pvAlpha',
            'param-pv-beta': 'pvBeta',
            'param-pv-v0': 'pvV0',
            'param-peri-v0': 'periV0',
            'param-peri-k': 'periK',
            'param-peri-vscale': 'periVScale',
            'param-peri-vknee': 'periVknee',
            'param-peri-k2': 'periK2',
            'param-peri-vscale2': 'periVScale2',
            'param-peri-fluid': 'periFluid',
            'param-ca': 'ca',
            'param-ao-area': 'aoArea',
            'param-svr': 'svr',
            'param-ecmo-flow': 'ecmoFlowLpm'
        };

        for (const [inputId, paramKey] of Object.entries(paramMapping)) {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('change', (e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value)) {
                        applyParamUpdate(paramKey, value);
                    }
                });
            }
        }

        const mrSelect = document.getElementById('param-mr');
        if (mrSelect) {
            mrSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                applyParamUpdate('mrEnabled', enabled);
            });
        }

        const msSelect = document.getElementById('param-ms');
        if (msSelect) {
            msSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                applyParamUpdate('msEnabled', enabled);
            });
        }

        const arSelect = document.getElementById('param-ar');
        if (arSelect) {
            arSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                applyParamUpdate('arEnabled', enabled);
            });
        }

        const asSelect = document.getElementById('param-as');
        if (asSelect) {
            asSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                applyParamUpdate('asEnabled', enabled);
            });
        }

        const laContractionSelect = document.getElementById('param-la-contraction');
        if (laContractionSelect) {
            laContractionSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                applyParamUpdate('laContractionEnabled', enabled);
            });
        }

        const ecmoSelect = document.getElementById('param-ecmo');
        if (ecmoSelect) {
            ecmoSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'on';
                applyParamUpdate('ecmoEnabled', enabled);
            });
        }
    }

    bindSimpleInputs() {
        const applyParamUpdate = (paramKey, value) => {
            this.simulator.updateParams({ [paramKey]: value });
            this.syncParamsToUI();
            this.redrawNow();
        };

        const simpleMapping = {
            'simple-hr': 'hr',
            'simple-pv': 'pv',
            'simple-rv-ees': 'rvEes',
            'simple-pvr': 'pvr',
            'simple-lv-ees': 'lvEes',
            'simple-lv-alpha': 'lvAlpha',
            'simple-svr': 'svr',
            'simple-ca': 'ca'
        };

        for (const [inputId, paramKey] of Object.entries(simpleMapping)) {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('change', (e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value)) {
                        applyParamUpdate(paramKey, value);
                    }
                });
            }
        }

        const rhythmSelect = document.getElementById('simple-rhythm');
        if (rhythmSelect) {
            rhythmSelect.addEventListener('change', (e) => {
                const enabled = e.target.value === 'sinus';
                applyParamUpdate('laContractionEnabled', enabled);
            });
        }

        const valveConfig = {
            as: { enabledKey: 'asEnabled', valueKey: 'asAva', levels: { mild: 1.7, moderate: 1.2, severe: 0.7 } },
            ar: { enabledKey: 'arEnabled', valueKey: 'arEroa', levels: { mild: 0.3, moderate: 0.5, severe: 0.8 } },
            ms: { enabledKey: 'msEnabled', valueKey: 'msMva', levels: { mild: 1.7, moderate: 1.2, severe: 0.7 } },
            mr: { enabledKey: 'mrEnabled', valueKey: 'mrEroa', levels: { mild: 0.1, moderate: 0.3, severe: 0.5 } },
            tr: { enabledKey: 'trEnabled', valueKey: 'trEroa', levels: { mild: 0.1, moderate: 0.3, severe: 0.5 } }
        };

        Object.entries(valveConfig).forEach(([key, config]) => {
            const select = document.getElementById(`simple-${key}`);
            if (!select) return;
            select.addEventListener('change', (e) => {
                const value = e.target.value;
                if (value === 'none') {
                    this.simulator.updateParams({ [config.enabledKey]: false });
                } else {
                    const area = config.levels[value];
                    this.simulator.updateParams({
                        [config.enabledKey]: true,
                        [config.valueKey]: area
                    });
                }
                this.syncParamsToUI();
                this.redrawNow();
            });
        });
    }

    syncParamsToUI() {
        const params = this.simulator.params;
        const setInput = (id, value) => {
            const el = document.getElementById(id);
            if (!el || value == null || Number.isNaN(value)) return;
            el.value = value;
        };
        const setSelect = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        };
        const pickSeverity = (value, levels) => {
            let bestKey = 'mild';
            let bestDiff = Infinity;
            Object.entries(levels).forEach(([key, level]) => {
                const diff = Math.abs(value - level);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestKey = key;
                }
            });
            return bestKey;
        };

        setInput('param-hr', params.hr);
        setInput('param-pr', params.prInterval);
        setInput('param-pv', params.pv);
        setInput('param-rv', params.rv);
        setInput('param-ra-ees', params.raEes);
        setInput('param-ra-alpha', params.raAlpha);
        setInput('param-ra-beta', params.raBeta);
        setInput('param-ra-v0', params.raV0);
        setInput('param-rt', params.rt);
        setInput('param-lt', params.lt);
        setInput('param-tv-area', params.tvArea);
        setInput('param-rv-ees', params.rvEes);
        setInput('param-rv-alpha', params.rvAlpha);
        setInput('param-rv-beta', params.rvBeta);
        setInput('param-rv-v0', params.rvV0);
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
        setInput('param-rp', params.rp);
        setInput('param-lp', params.lp);
        setInput('param-ra', params.ra);
        setInput('param-la-inert', params.la);
        setInput('param-cp', params.cp);
        setInput('param-pvr', params.pvr);
        setInput('param-pvr-venous', params.pvrVenous);
        setInput('param-pa-area', params.paArea);
        setInput('param-pv-alpha', params.pvAlpha);
        setInput('param-pv-beta', params.pvBeta);
        setInput('param-pv-v0', params.pvV0);
        setInput('param-peri-v0', params.periV0);
        setInput('param-peri-k', params.periK);
        setInput('param-peri-vscale', params.periVScale);
        setInput('param-peri-vknee', params.periVknee);
        setInput('param-peri-k2', params.periK2);
        setInput('param-peri-vscale2', params.periVScale2);
        setInput('param-peri-fluid', params.periFluid);
        setInput('param-ca', params.ca);
        setInput('param-ao-area', params.aoArea);
        setInput('param-svr', params.svr);
        setInput('param-ecmo-flow', params.ecmoFlowLpm);
        const ecmoSelect = document.getElementById('param-ecmo');
        if (ecmoSelect) {
            ecmoSelect.value = params.ecmoEnabled ? 'on' : 'off';
        }

        setInput('simple-hr', params.hr);
        setInput('simple-pv', params.pv);
        setInput('simple-rv-ees', params.rvEes);
        setInput('simple-pvr', params.pvr);
        setInput('simple-lv-ees', params.lvEes);
        setInput('simple-lv-alpha', params.lvAlpha);
        setInput('simple-svr', params.svr);
        setInput('simple-ca', params.ca);
        setSelect('simple-rhythm', params.laContractionEnabled ? 'sinus' : 'junctional');

        const asValue = params.asEnabled ? pickSeverity(params.asAva, { mild: 1.7, moderate: 1.2, severe: 0.7 }) : 'none';
        const arValue = params.arEnabled ? pickSeverity(params.arEroa, { mild: 0.3, moderate: 0.5, severe: 0.8 }) : 'none';
        const msValue = params.msEnabled ? pickSeverity(params.msMva, { mild: 1.7, moderate: 1.2, severe: 0.7 }) : 'none';
        const mrValue = params.mrEnabled ? pickSeverity(params.mrEroa, { mild: 0.1, moderate: 0.3, severe: 0.5 }) : 'none';
        const trValue = params.trEnabled ? pickSeverity(params.trEroa, { mild: 0.1, moderate: 0.3, severe: 0.5 }) : 'none';
        setSelect('simple-as', asValue);
        setSelect('simple-ar', arValue);
        setSelect('simple-ms', msValue);
        setSelect('simple-mr', mrValue);
        setSelect('simple-tr', trValue);
    }

    getScaleSettings() {
        const getVal = (id, def) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) || def : def;
        };
        return {
            // PVループ & モニター個別スケール
            laVMax: getVal('la-pv-vmax', 120),
            laPMax: getVal('la-pv-pmax', 30),      // 30
            lvVMax: getVal('lv-pv-vmax', 160),
            lvPMax: getVal('lv-pv-pmax', 200),     // 200
            raVMax: getVal('ra-pv-vmax', 160),
            raPMax: getVal('ra-pv-pmax', 30),
            rvVMax: getVal('rv-pv-vmax', 200),
            rvPMax: getVal('rv-pv-pmax', 60),
            aoPMax: getVal('ao-pv-pmax', 200),     // 200
            periVMax: getVal('peri-vmax', 700),
            periPMax: getVal('peri-pmax', 20),
            // モニター波形（PVループとは独立）
            monitorPressureLvAoMax: getVal('monitor-pressure-lv-ao-max', 200),
            monitorPressureLaMax: getVal('monitor-pressure-la-max', 60),
            monitorPressureRvPaMax: getVal('monitor-pressure-rv-pa-max', 60),
            flowMax: getVal('scale-flow-max', 1200),
            flowMin: getVal('scale-flow-min', -600),
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
        this.chartManager.update(
            this.simulator,
            this.getScaleSettings(),
            metrics,
            this.getWaveformVisibility(),
            this.getBalanceCurvesForChart(),
            this.savedDrawings
        );
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
            lvp: visibility.lvp,
            rap: visibility.rap,
            pap: visibility.pap,
            rvp: visibility.rvp
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
            rap: read('rap'),
            rvp: read('rvp'),
            pap: read('pap'),
            avFlow: read('avFlow'),
            mvFlow: read('mvFlow'),
            tvFlow: read('tvFlow'),
            pvFlow: read('pvFlow'),
            svFlow: read('svFlow'),
            pvnFlow: read('pvnFlow'),
            // elastance表示は廃止
        };
    }

    getDisplaySettings() {
        const scales = this.getScaleSettings();
        return {
            pv: {
                raVMax: scales.raVMax,
                raPMax: scales.raPMax,
                laVMax: scales.laVMax,
                laPMax: scales.laPMax,
                rvVMax: scales.rvVMax,
                rvPMax: scales.rvPMax,
                lvVMax: scales.lvVMax,
                lvPMax: scales.lvPMax
            }
        };
    }

    applyDisplaySettings(displaySettings = {}) {
        const pv = displaySettings.pv || displaySettings.scales;
        if (!pv) return;
        const scaleMap = {
            'ra-pv-vmax': pv.raVMax,
            'ra-pv-pmax': pv.raPMax,
            'la-pv-vmax': pv.laVMax,
            'la-pv-pmax': pv.laPMax,
            'rv-pv-vmax': pv.rvVMax,
            'rv-pv-pmax': pv.rvPMax,
            'lv-pv-vmax': pv.lvVMax,
            'lv-pv-pmax': pv.lvPMax
        };
        Object.entries(scaleMap).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (!input || value === undefined || value === null || Number.isNaN(value)) return;
            input.value = value;
        });
    }

    redrawNow() {
        const metrics = this.calculateMetrics();
        this.chartManager.update(
            this.simulator,
            this.getScaleSettings(),
            metrics,
            this.getWaveformVisibility(),
            this.getBalanceCurvesForChart(),
            this.savedDrawings
        );
    }

    getNextBalanceColor() {
        const used = new Set(this.balanceCurves.map((curve) => curve.color));
        const available = this.balanceCurveColors.find((color) => !used.has(color));
        return available || this.balanceCurveColors[this.balanceCurves.length % this.balanceCurveColors.length];
    }

    getBalanceCurvesForChart() {
        const saved = this.savedDrawings
            .filter((drawing) => Array.isArray(drawing.coCurve) && drawing.coCurve.length > 0)
            .map((drawing) => ({ points: drawing.coCurve, color: drawing.color }));
        return [...this.balanceCurves, ...saved];
    }

    getNextSavedColor() {
        const used = new Set(this.savedDrawings.map((drawing) => drawing.color));
        const available = this.savedDrawingColors.find((color) => !used.has(color));
        return available || this.savedDrawingColors[this.savedDrawings.length % this.savedDrawingColors.length];
    }

    setBalanceComputeState(isComputing) {
        this.isBalanceComputing = isComputing;
        const addBtn = document.getElementById('addBalanceCurveBtn');
        if (addBtn) {
            addBtn.disabled = isComputing;
            addBtn.textContent = isComputing ? '計算中…' : '＋ 曲線追加';
        }
        const drawBtn = document.getElementById('drawBalanceCurveBtn');
        if (drawBtn) {
            drawBtn.disabled = isComputing;
            drawBtn.textContent = isComputing ? '計算中…' : '曲線を表示';
        }
        const saveBtn = document.getElementById('saveDrawingBtn');
        if (saveBtn) {
            saveBtn.disabled = isComputing;
            saveBtn.textContent = isComputing ? '保存中…' : '保存';
        }
    }

    addBalanceCurve() {
        if (this.isBalanceComputing) return;
        if (this.balanceCurves.length >= 5) {
            alert('CO曲線は5つまでです。削除してから追加してください。');
            return;
        }
        const input = document.getElementById('balanceNameInput');
        const rawName = input ? input.value.trim() : '';
        if (input) input.blur();
        const name = rawName || `条件 ${this.balanceCurves.length + 1}`;
        const paramsSnapshot = { ...this.simulator.params };
        const xMax = this.getScaleSettings().balanceXMax;
        this.setBalanceComputeState(true);
        this.computeBalanceCurve(paramsSnapshot, xMax)
            .then((points) => {
                if (!points || points.length === 0) return;
                const color = this.getNextBalanceColor();
                this.balanceCurves.push({ name, points, color });
                if (input) input.value = '';
                this.renderBalanceLegend();
                this.chartManager.update(
                    this.simulator,
                    this.getScaleSettings(),
                    this.calculateMetrics(),
                    this.getWaveformVisibility(),
                    this.getBalanceCurvesForChart(),
                    this.savedDrawings
                );
            })
            .finally(() => {
                this.setBalanceComputeState(false);
            });
    }

    drawCurrentBalanceCurve() {
        if (this.isBalanceComputing) return;
        const paramsSnapshot = { ...this.simulator.params };
        const xMax = this.getScaleSettings().balanceXMax;
        this.setBalanceComputeState(true);
        this.computeBalanceCurve(paramsSnapshot, xMax)
            .then((points) => {
                if (!points || points.length === 0) return;
                const existing = this.balanceCurves.find((curve) => curve.name === '現在');
                const color = existing?.color || this.balanceCurveColors[0];
                this.balanceCurves = [{ name: '現在', points, color }];
                this.chartManager.update(
                    this.simulator,
                    this.getScaleSettings(),
                    this.calculateMetrics(),
                    this.getWaveformVisibility(),
                    this.getBalanceCurvesForChart(),
                    this.savedDrawings
                );
            })
            .finally(() => {
                this.setBalanceComputeState(false);
            });
    }

    clearBalanceCurves() {
        this.balanceCurves = [];
        this.renderBalanceLegend();
        this.chartManager.update(
            this.simulator,
            this.getScaleSettings(),
            this.calculateMetrics(),
            this.getWaveformVisibility(),
            this.getBalanceCurvesForChart(),
            this.savedDrawings
        );
    }

    renderBalanceLegend() {
        const container = document.getElementById('balanceLegend');
        if (!container) return;
        container.innerHTML = '';
        this.balanceCurves.forEach((curve, index) => {
            const item = document.createElement('div');
            item.className = 'balance-legend-item';
            const swatch = document.createElement('span');
            swatch.className = 'balance-legend-swatch';
            swatch.style.background = curve.color || this.balanceCurveColors[index % this.balanceCurveColors.length];
            const label = document.createElement('span');
            label.className = 'balance-legend-label';
            label.textContent = curve.name;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'balance-legend-remove';
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                this.balanceCurves.splice(index, 1);
                this.renderBalanceLegend();
                this.chartManager.update(
                    this.simulator,
                    this.getScaleSettings(),
                    this.calculateMetrics(),
                    this.getWaveformVisibility(),
                    this.getBalanceCurvesForChart(),
                    this.savedDrawings
                );
            });
            item.appendChild(swatch);
            item.appendChild(label);
            item.appendChild(remove);
            container.appendChild(item);
        });
    }

    closeSaveDrawingForm() {
        const input = document.getElementById('saveDrawingName');
        if (input) {
            input.value = '';
            input.blur();
        }
    }

    getCurrentPvSnapshot() {
        const history = this.simulator.getHistory();
        const hr = this.simulator.params.hr || 75;
        const samplesPerCycle = Math.max(1, Math.floor((60 / hr) / SIM_CONFIG.dt));
        const startIndex = Math.max(0, history.time.length - samplesPerCycle);
        return {
            raVolume: history.raVolume.slice(startIndex),
            raPressure: history.raPressure.slice(startIndex),
            rvVolume: history.rvVolume.slice(startIndex),
            rvPressure: history.rvPressure.slice(startIndex),
            laVolume: history.laVolume.slice(startIndex),
            laPressure: history.laPressure.slice(startIndex),
            lvVolume: history.lvVolume.slice(startIndex),
            lvPressure: history.lvPressure.slice(startIndex)
        };
    }

    saveDrawing() {
        if (this.isBalanceComputing) return;
        if (this.savedDrawings.length >= 5) {
            alert('保存は5つまでです。削除してから追加してください。');
            return;
        }
        const input = document.getElementById('saveDrawingName');
        const rawName = input ? input.value.trim() : '';
        if (input) input.blur();
        const name = rawName || `保存 ${this.savedDrawings.length + 1}`;
        const paramsSnapshot = { ...this.simulator.params };
        const pvSnapshot = this.getCurrentPvSnapshot();
        const color = this.getNextSavedColor();
        const xMax = this.getScaleSettings().balanceXMax;
        const id = `drawing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const drawing = {
            id,
            name,
            color,
            coCurve: null,
            ra: {
                volume: pvSnapshot.raVolume,
                pressure: pvSnapshot.raPressure,
                ees: paramsSnapshot.raEes,
                v0: paramsSnapshot.raV0,
                alpha: paramsSnapshot.raAlpha,
                beta: paramsSnapshot.raBeta
            },
            rv: {
                volume: pvSnapshot.rvVolume,
                pressure: pvSnapshot.rvPressure,
                ees: paramsSnapshot.rvEes,
                v0: paramsSnapshot.rvV0,
                alpha: paramsSnapshot.rvAlpha,
                beta: paramsSnapshot.rvBeta
            },
            la: {
                volume: pvSnapshot.laVolume,
                pressure: pvSnapshot.laPressure,
                ees: paramsSnapshot.laEes,
                v0: paramsSnapshot.laV0,
                alpha: paramsSnapshot.laAlpha,
                beta: paramsSnapshot.laBeta
            },
            lv: {
                volume: pvSnapshot.lvVolume,
                pressure: pvSnapshot.lvPressure,
                ees: paramsSnapshot.lvEes,
                v0: paramsSnapshot.lvV0,
                alpha: paramsSnapshot.lvAlpha,
                beta: paramsSnapshot.lvBeta
            }
        };
        this.savedDrawings.push(drawing);
        this.renderSavedDrawings();
        this.closeSaveDrawingForm();
        this.chartManager.update(
            this.simulator,
            this.getScaleSettings(),
            this.calculateMetrics(),
            this.getWaveformVisibility(),
            this.getBalanceCurvesForChart(),
            this.savedDrawings
        );
        this.setBalanceComputeState(true);
        this.computeBalanceCurve(paramsSnapshot, xMax)
            .then((points) => {
                if (!points || points.length === 0) return;
                const target = this.savedDrawings.find((item) => item.id === id);
                if (target) {
                    target.coCurve = points;
                }
                this.chartManager.update(
                    this.simulator,
                    this.getScaleSettings(),
                    this.calculateMetrics(),
                    this.getWaveformVisibility(),
                    this.getBalanceCurvesForChart(),
                    this.savedDrawings
                );
            })
            .finally(() => {
                this.setBalanceComputeState(false);
            });
    }

    renderSavedDrawings() {
        const container = document.getElementById('savedDrawingList');
        if (!container) return;
        container.innerHTML = '';
        this.savedDrawings.forEach((drawing, index) => {
            const item = document.createElement('div');
            item.className = 'saved-drawing-item';
            const swatch = document.createElement('span');
            swatch.className = 'saved-drawing-swatch';
            swatch.style.background = drawing.color || this.savedDrawingColors[index % this.savedDrawingColors.length];
            const label = document.createElement('span');
            label.className = 'saved-drawing-label';
            label.textContent = drawing.name;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'saved-drawing-remove';
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                this.savedDrawings.splice(index, 1);
                this.renderSavedDrawings();
                this.chartManager.update(
                    this.simulator,
                    this.getScaleSettings(),
                    this.calculateMetrics(),
                    this.getWaveformVisibility(),
                    this.getBalanceCurvesForChart(),
                    this.savedDrawings
                );
            });
            item.appendChild(swatch);
            item.appendChild(label);
            item.appendChild(remove);
            container.appendChild(item);
        });
    }

    resetScaleInputs() {
        const scaleIds = [
            'la-pv-vmax',
            'la-pv-pmax',
            'lv-pv-vmax',
            'lv-pv-pmax',
            'ra-pv-vmax',
            'ra-pv-pmax',
            'rv-pv-vmax',
            'rv-pv-pmax',
            'monitor-pressure-lv-ao-max',
            'monitor-pressure-la-max',
            'monitor-pressure-rv-pa-max',
            'scale-flow-max',
            'scale-flow-min',
            'peri-vmax',
            'peri-pmax',
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
        const simState = this.simulator.getState();
        const history = this.simulator.getHistory();
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        // モニター数値更新
        setText('vital-hr', this.simulator.params.hr);

        // 直近1心周期分のデータを取得
        if (history.aoPressure.length > 10) {
            const cycleDuration = 60 / this.simulator.params.hr;
            const samplesPerCycle = Math.floor(cycleDuration / SIM_CONFIG.dt);

            // 大動脈圧
            const recentAoP = history.aoPressure.slice(-samplesPerCycle);
            const aoSys = Math.max(...recentAoP);
            const aoDia = Math.min(...recentAoP);
            const aoMap = aoDia + (aoSys - aoDia) / 3;
            setText('vital-sys', Math.round(aoSys));
            setText('vital-dia', Math.round(aoDia));
            setText('vital-map', Math.round(aoMap));

            // 肺動脈圧
            const recentPaP = history.paPressure.slice(-samplesPerCycle);
            const paSys = Math.max(...recentPaP);
            const paDia = Math.min(...recentPaP);
            const paMean = paDia + (paSys - paDia) / 3;
            setText('vital-pap-sys', Math.round(paSys));
            setText('vital-pap-dia', Math.round(paDia));
            setText('vital-pap-mean', Math.round(paMean));

            // 右房圧
            const recentRAP = history.raPressure.slice(-samplesPerCycle);
            const rapMax = Math.max(...recentRAP);
            const rapMin = Math.min(...recentRAP);
            const rapMean = recentRAP.reduce((a, b) => a + b, 0) / recentRAP.length;
            setText('vital-rap-max', Math.round(rapMax));
            setText('vital-rap-min', Math.round(rapMin));
            setText('vital-rap-mean', Math.round(rapMean));

            // 右室圧
            const recentRVP = history.rvPressure.slice(-samplesPerCycle);
            const rvpMax = Math.max(...recentRVP);
            const rvpMin = Math.min(...recentRVP);
            const rvpMean = recentRVP.reduce((a, b) => a + b, 0) / recentRVP.length;
            setText('vital-rvp-max', Math.round(rvpMax));
            setText('vital-rvp-min', Math.round(rvpMin));
            setText('vital-rvp-mean', Math.round(rvpMean));

            // 左房圧
            const recentLAP = history.laPressure.slice(-samplesPerCycle);
            const lapMax = Math.max(...recentLAP);
            const lapMin = Math.min(...recentLAP);
            const lapMean = recentLAP.reduce((a, b) => a + b, 0) / recentLAP.length;
            setText('vital-lap-max', Math.round(lapMax));
            setText('vital-lap-min', Math.round(lapMin));
            setText('vital-lap-mean', Math.round(lapMean));

            // 左室圧
            const recentLVP = history.lvPressure.slice(-samplesPerCycle);
            const lvpMax = Math.max(...recentLVP);
            const lvpMin = Math.min(...recentLVP);
            const lvpMean = recentLVP.reduce((a, b) => a + b, 0) / recentLVP.length;
            setText('vital-lvp-max', Math.round(lvpMax));
            setText('vital-lvp-min', Math.round(lvpMin));
            setText('vital-lvp-mean', Math.round(lvpMean));

            // SV（1回拍出量）= LV容量の変化
            const recentLVV = history.lvVolume.slice(-samplesPerCycle);
            const edv = Math.max(...recentLVV);  // 拡張末期容量
            const esv = Math.min(...recentLVV);  // 収縮末期容量
            const sv = edv - esv;
            setText('vital-sv', Math.round(sv));

            // CO（心拍出量）= SV × HR / 1000 (L/min)
            const co = sv * this.simulator.params.hr / 1000;
            setText('vital-co', co.toFixed(1));

            // SVR（全身血管抵抗）: 既にdynes·sec·cm⁻⁵で格納
            setText('vital-svr', Math.round(this.simulator.params.svr));

            // LVEDP（左室拡張末期圧）: 僧帽弁閉鎖時の値を使用
            const lvedp = simState.lvEDP != null ? simState.lvEDP : (recentLVP[recentLVV.indexOf(edv)] || lvpMin);
            setText('vital-lvedp', Math.round(lvedp));
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
        const simState = this.simulator.getState();
        const cycleDuration = 60 / this.simulator.params.hr;
        const samplesPerCycle = Math.floor(cycleDuration / SIM_CONFIG.dt);

        // 直近1心周期分のデータを抽出
        const sliceRecent = (arr) => (arr && arr.length > 0
            ? arr.slice(-Math.min(samplesPerCycle, arr.length))
            : []);
        const lvV = sliceRecent(history.lvVolume);
        const lvP = sliceRecent(history.lvPressure);

        if (lvV.length === 0) return null;

        // SV, EDV, ESV
        const edv = Math.max(...lvV);
        const esv = Math.min(...lvV);
        const sv = edv - esv;

        // EF (%)
        const ef = edv > 0 ? (sv / edv) * 100 : 0;

        // Ea (mmHg/mL) = ESP / SV
        // ESPは簡易的に最大左室圧を使用
        const espFromState = simState.lvESPTime != null
            && simState.lvESP != null
            && (simState.time - simState.lvESPTime) <= cycleDuration * 1.2;
        const esp = espFromState ? simState.lvESP : Math.max(...lvP);
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
