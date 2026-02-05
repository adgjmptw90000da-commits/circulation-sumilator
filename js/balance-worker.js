/* balance-worker: compute CO curve using the main simulator */

importScripts('constants.js', 'simulation.js');

const mean = (arr, fallback = 0) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : fallback);

const simulatePoint = (baseParams, pvTarget, beats) => {
    const sim = new CirculationSimulator();
    sim.updateParams({ ...baseParams, pv: pvTarget });

    const hr = sim.params.hr || 75;
    const cycleDuration = 60 / hr;
    const stepsPerBeat = Math.max(1, Math.floor(cycleDuration / SIM_CONFIG.dt));
    const totalSteps = stepsPerBeat * (beats || 6);

    for (let step = 0; step < totalSteps; step++) {
        sim.step();
    }

    const history = sim.getHistory();
    const state = sim.getState();
    const startIndex = Math.max(0, history.time.length - stepsPerBeat);
    const recentLAP = history.laPressure.slice(startIndex);
    const recentAoFlow = history.aorticFlow.slice(startIndex);

    return {
        x: mean(recentLAP, state.laPressure),
        y: mean(recentAoFlow, 0) * 60 / 1000
    };
};

self.onmessage = (event) => {
    const { params, xMax, points, beats, token } = event.data || {};
    if (!params || !xMax) return;

    const totalPoints = points || 25;
    const results = [];

    for (let i = 0; i < totalPoints; i++) {
        const pvTarget = (xMax * i) / (totalPoints - 1);
        results.push(simulatePoint(params, pvTarget, beats));
    }

    self.postMessage({ results, token });
};
