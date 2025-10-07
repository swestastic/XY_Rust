import init, { XY } from "./pkg/xy_gui_rust.js";

let wasm;
let xy;
let n = 64; // default lattice size
let temp = 2.27;
let j = 1.0;
let h = 0.0;
let canvas, ctx, imageData;
let spins = null;
let animationId;
let algorithm = "metropolis";
let sweepsPerFrame = 1;
let plotLabel, plotTypeDropdown, energyValue, magnetizationValue, acceptanceRatioValue, sweepsPerSecValue, livePlot, livePlotCtx;
let plotHistory = [];
const maxHistory = 400;
let plotType = "energy";
// Top-level references for temperature controls
let tempSlider = null;
let runSweepBtn = null;
let sweepNWarmup = null;
let sweepNDecor = null;
let tempValue = null;
let downloadCsvBtn = null;
// Sweep state

let sweepState = null;
let sweepRunning = false;

// Visualization mode: "color" or "quiver"
let vizMode = "color";
let colorbarContainer = null;

async function run() {
    downloadCsvBtn = document.getElementById("download-csv-btn");
    downloadCsvBtn.disabled = true;
    downloadCsvBtn.style.background = "#444";
    downloadCsvBtn.style.color = "#ccc";
    downloadCsvBtn.style.cursor = "not-allowed";

    downloadCsvBtn.addEventListener("click", () => {
        if (!sweepState || !sweepState.results || sweepState.results.length === 0) return;
        let csv = "T,Energy,Energy_SEM,Magnetization,Magnetization_SEM,Acceptance,Acceptance_SEM,Energy2,Energy2_SEM,Magnetization2,Magnetization2_SEM,SpecificHeat,MagneticSusceptibility\n";
        for (const row of sweepState.results) {
            csv += `${row.temp},${row.energy},${row.energy_sem},${row.magnetization},${row.magnetization_sem},${row.acceptance},${row.acceptance_sem},${row.energy2},${row.energy2_sem},${row.magnetization2},${row.magnetization2_sem},${row.specific_heat},${row.susceptibility}\n`;
        }
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        let algoName = algorithm;
        if (algoName === "heat-bath") algoName = "heatbath";
        a.href = url;
        a.download = `xy_${algoName}_results.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    });
    // Sweep controls
    const sweepTInit = document.getElementById("sweep-t-init");
    const sweepTFinal = document.getElementById("sweep-t-final");
    const sweepTStep = document.getElementById("sweep-t-step");
    const sweepNSweeps = document.getElementById("sweep-n-sweeps");
    runSweepBtn = document.getElementById("run-sweep-btn");
    sweepNDecor = document.getElementById("sweep-n-decor");
    sweepNWarmup = document.getElementById("sweep-n-warmup");

    runSweepBtn.addEventListener("click", () => {
        if (sweepRunning) {
            // Stop sweep
            sweepRunning = false;
            if (sweepState) sweepState.active = false;
            runSweepBtn.textContent = "Run T Sweep";
            runSweepBtn.disabled = false;
            return;
        }
        let tInit = parseFloat(sweepTInit.value);
        let tFinal = parseFloat(sweepTFinal.value);
        let tStep = parseFloat(sweepTStep.value);
        let nSweeps = parseInt(sweepNSweeps.value);
        let nDecor = parseInt(sweepNDecor.value);
        let nWarmup = parseInt(sweepNWarmup.value);
        if (isNaN(tInit) || isNaN(tFinal) || isNaN(tStep) || isNaN(nSweeps) || nSweeps < 1) {
            alert("Invalid sweep parameters.");
            return;
        }
        let tVals = [];
        if (tStep === 0) return;
        if ((tStep > 0 && tInit > tFinal) || (tStep < 0 && tInit < tFinal)) {
            alert("Step direction does not match range.");
            return;
        }
        let t = tInit;
        if (tStep > 0) {
            while (t <= tFinal) {
                tVals.push(Number(t.toFixed(6)));
                t += tStep;
            }
            if (tVals[tVals.length - 1] < tFinal) {
                tVals.push(Number(tFinal.toFixed(6)));
            }
        } else {
            while (t >= tFinal) {
                tVals.push(Number(t.toFixed(6)));
                t += tStep;
            }
            if (tVals[tVals.length - 1] > tFinal) {
                tVals.push(Number(tFinal.toFixed(6)));
            }
        }
        sweepState = {
            active: true,
            tVals,
            tIndex: 0,
            nSweeps,
            nDecor,
            nWarmup,
            sweepCount: 0,
            decorCount: 0,
            warmupCount: 0,
            batchSize: sweepsPerFrame, // sweeps per frame from slider
            results: [],
            phase: "warmup", // "warmup", "decor", "meas"
            // Store all measurement values for binning
            binData: tVals.map(() => ({ energy: [], magnetization: [], acceptance: [], energy2: [], magnetization2: [] }))
        };
        sweepRunning = true;
        runSweepBtn.textContent = "Stop T Sweep";
        runSweepBtn.disabled = false;
    });
    // Slider for external field h
    const hSlider = document.getElementById("h-slider");
    const hValue = document.getElementById("h-value");
    hSlider.addEventListener("input", () => {
        h = parseFloat(hSlider.value);
        hValue.value = h.toFixed(2);
        xy.set_h(h);
    });
    hValue.addEventListener("change", () => {
        let val = parseFloat(hValue.value);
        if (isNaN(val) || val < -2.0 || val > 2.0) {
            hValue.value = h.toFixed(2);
            return;
        }
        h = val;
        hSlider.value = h;
        xy.set_h(h);
    });
    wasm = await init();

    canvas = document.getElementById("canvas");
    ctx = canvas.getContext("2d");

    // Colorbar setup
    const colorbar = document.getElementById("colorbar");
    const colorbarCtx = colorbar.getContext("2d");
    drawColorbar(colorbar, colorbarCtx);

    // Energy plot setup
    plotLabel = document.getElementById("plot-label");
    plotTypeDropdown = document.getElementById("plot-type");
    energyValue = document.getElementById("energy-value");
    magnetizationValue = document.getElementById("magnetization-value");
    acceptanceRatioValue = document.getElementById("acceptance-ratio");
    sweepsPerSecValue = document.getElementById("sweeps-per-sec");
    plotTypeDropdown.addEventListener("change", () => {
        plotType = plotTypeDropdown.value;
        plotHistory = [];
    });
    livePlot = document.getElementById("live-plot");
    livePlotCtx = livePlot.getContext("2d");

    setupXY(n);

    // Slider for temperature
    tempSlider = document.getElementById("temp-slider");
    tempValue = document.getElementById("temp-value");
    tempSlider.addEventListener("input", () => {
        temp = parseFloat(tempSlider.value);
        tempValue.value = temp.toFixed(2);
        xy.set_temp(temp);
    });

    tempValue.addEventListener("change", () => {
        let val = parseFloat(tempValue.value);
        if (isNaN(val) || val < 0.1 || val > 5.0) {
            tempValue.value = temp.toFixed(2);
            return;
        }
        temp = val;
        tempSlider.value = temp;
        xy.set_temp(temp);
    });

    // Slider for coupling constant J
    const jSlider = document.getElementById("j-slider");
    const jValue = document.getElementById("j-value");
    jSlider.addEventListener("input", () => {
        j = parseFloat(jSlider.value);
        jValue.value = j.toFixed(2);
        xy.set_j(j);
    });

    jValue.addEventListener("change", () => {
        let val = parseFloat(jValue.value);
        if (isNaN(val) || val < -2.0 || val > 2.0) {
            jValue.value = j.toFixed(2);
            return;
        }
        j = val;
        jSlider.value = j;
        xy.set_j(j);
    });

    // Dropdown for lattice size
    const latticeDropdown = document.getElementById("lattice-size");
    latticeDropdown.addEventListener("change", () => {
        n = parseInt(latticeDropdown.value);
        setupXY(n);
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        render();
    });

    // Algorithm dropdown
    const algorithmDropdown = document.getElementById("algorithm");
    algorithmDropdown.addEventListener("change", () => {
        algorithm = algorithmDropdown.value;
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        render();
    });

    // Sweeps per frame slider
    const skipSlider = document.getElementById("skip-slider");
    const skipInput = document.getElementById("skip-input");
    skipSlider.addEventListener("input", () => {
        sweepsPerFrame = parseInt(skipSlider.value);
        skipInput.value = sweepsPerFrame;
        if (sweepState && sweepState.active) {
            sweepState.batchSize = sweepsPerFrame;
        }
    });
    skipInput.addEventListener("change", () => {
        let val = parseInt(skipInput.value);
        if (isNaN(val) || val < parseInt(skipSlider.min) || val > parseInt(skipSlider.max)) {
            skipInput.value = sweepsPerFrame;
            return;
        }
        sweepsPerFrame = val;
        skipSlider.value = val;
        if (sweepState && sweepState.active) {
            sweepState.batchSize = sweepsPerFrame;
        }
    });
    skipInput.value = sweepsPerFrame;

    // Reset button logic
    const resetBtn = document.getElementById("reset-btn");
    resetBtn.addEventListener("click", () => {
        setupXY(n);
        plotHistory = [];
        lastTime = performance.now();
        lastSweepCount = 0;
        render.sweepCount = 0;
        sweepsHistory = [];
        timeHistory = [];
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        render();
    });

    const resetDataBtn = document.getElementById("reset-data-btn");
    resetDataBtn.addEventListener("click", () => {
        xy.reset_data();
        plotHistory = [];
        lastTime = performance.now();
        lastSweepCount = 0;
        render.sweepCount = 0;
        sweepsHistory = [];
        timeHistory = [];
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        render();
    });

    // Toggle visualization mode button
    colorbarContainer = document.getElementById("colorbar-container");
    const toggleVizBtn = document.getElementById("toggle-viz-btn");
    toggleVizBtn.addEventListener("click", () => {
        if (vizMode === "color") {
            vizMode = "quiver";
            toggleVizBtn.textContent = "Switch to Color View";
            // Increase canvas resolution for crisp arrows
            canvas.width = 400;
            canvas.height = 400;
            canvas.style.imageRendering = "auto";
        } else {
            vizMode = "color";
            toggleVizBtn.textContent = "Switch to Quiver View";
            // Restore original canvas resolution
            canvas.width = n;
            canvas.height = n;
            canvas.style.imageRendering = "pixelated";
            imageData = ctx.createImageData(n, n);
        }
    });

    render();
}

function setupXY(size) {
    xy = new XY(size, temp, j, h);
    
    // Set canvas size based on current visualization mode
    if (vizMode === "quiver") {
        canvas.width = 400;
        canvas.height = 400;
    } else {
        canvas.width = size;
        canvas.height = size;
    }
    
    // Keep the canvas display size constant
    canvas.style.width = "400px";
    canvas.style.height = "400px";
    ctx = canvas.getContext("2d");
    
    // Only create imageData for color mode
    if (vizMode === "color") {
        imageData = ctx.createImageData(size, size);
    }
    
    // Create/reuse spins typed array (Float64Array for XY model)
    const ptr = xy.spins_ptr;
    spins = new Float64Array(wasm.memory.buffer, ptr, size * size);
}

let lastTime = performance.now();
let lastSweepCount = 0;
let sweepsHistory = [];
let timeHistory = [];

function render() {
    // No scaling needed for square aspect ratio, use default transform
    livePlotCtx.setTransform(1, 0, 0, 1, 0, 0);
    // Track actual sweeps performed this frame
    let sweepsThisFrame = 0;
    // If a sweep is active, run it in sync with animation frames
    if (sweepState && sweepState.active) {
        // If finished with all temps, end sweep
        if (sweepState.tIndex >= sweepState.tVals.length) {
            sweepState.active = false;
            sweepRunning = false;
            runSweepBtn.textContent = "Run T Sweep";
            runSweepBtn.disabled = false;
            // Enable CSV download button
            downloadCsvBtn.disabled = false;
            downloadCsvBtn.style.background = "#2a7";
            downloadCsvBtn.style.color = "#fff";
            downloadCsvBtn.style.cursor = "pointer";
            console.log("Sweep results:", sweepState.results);
            alert("Sweep complete! See console for results.");
        } else {
            // Set temp for this step
            let t = sweepState.tVals[sweepState.tIndex];
            xy.set_temp(t);
            temp = t;
            tempSlider.value = t;
            tempValue.value = t.toFixed(2);
            if (sweepState.phase === "warmup") {
                // Run warmup sweeps
                let batch = Math.min(sweepState.batchSize, sweepState.nWarmup - sweepState.warmupCount);
                for (let s = 0; s < batch; s++) {
                    if (algorithm === "metropolis") {
                        xy.metropolis_step();
                    } else if (algorithm === "wolff") {
                        xy.wolff_step();
                    } else if (algorithm === "swendsen-wang") {
                        xy.swendsen_wang_step();
                    } else if (algorithm === "heat-bath") {
                        xy.heatbath_step();
                    } else if (algorithm === "glauber") {
                        xy.glauber_step();
                    } else if (algorithm === "kawasaki") {
                        xy.kawasaki_step();
                    } else if (algorithm === "overrelaxation") {
                        xy.overrelaxation_step();
                    } else if (algorithm === "metropolis-reflection") {
                        xy.metropolis_reflection_step();
                    }
                }
                sweepsThisFrame += batch;
                sweepState.warmupCount += batch;
                if (sweepState.warmupCount >= sweepState.nWarmup) {
                    sweepState.phase = "decor";
                    sweepState.warmupCount = 0;
                }
            } else if (sweepState.phase === "decor") {
                // Run decorrelation sweeps
                let batch = Math.min(sweepState.batchSize, sweepState.nDecor - sweepState.decorCount);
                for (let s = 0; s < batch; s++) {
                    if (algorithm === "metropolis") {
                        xy.metropolis_step();
                    } else if (algorithm === "wolff") {
                        xy.wolff_step();
                    } else if (algorithm === "swendsen-wang") {
                        xy.swendsen_wang_step();
                    } else if (algorithm === "heat-bath") {
                        xy.heatbath_step();
                    } else if (algorithm === "glauber") {
                        xy.glauber_step();
                    } else if (algorithm === "kawasaki") {
                        xy.kawasaki_step();
                    } else if (algorithm === "overrelaxation") {
                        xy.overrelaxation_step();
                    } else if (algorithm === "metropolis-reflection") {
                        xy.metropolis_reflection_step();
                    }
                }
                sweepsThisFrame += batch;
                sweepState.decorCount += batch;
                if (sweepState.decorCount >= sweepState.nDecor) {
                    sweepState.phase = "meas";
                    sweepState.decorCount = 0;
                }
            } else {
                // Run measurement sweeps
                let batch = Math.min(sweepState.batchSize, sweepState.nSweeps - sweepState.sweepCount);
                for (let s = 0; s < batch; s++) {
                    if (algorithm === "metropolis") {
                        xy.metropolis_step();
                    } else if (algorithm === "wolff") {
                        xy.wolff_step();
                    } else if (algorithm === "swendsen-wang") {
                        xy.swendsen_wang_step();
                    } else if (algorithm === "heat-bath") {
                        xy.heatbath_step();
                    } else if (algorithm === "glauber") {
                        xy.glauber_step();
                    } else if (algorithm === "kawasaki") {
                        xy.kawasaki_step();
                    } else if (algorithm === "overrelaxation") {
                        xy.overrelaxation_step();
                    } else if (algorithm === "metropolis-reflection") {
                        xy.metropolis_reflection_step();
                    }
                    // Store measurement values for binning
                    const idx = sweepState.tIndex;
                    sweepState.binData[idx].energy.push(xy.energy);
                    sweepState.binData[idx].magnetization.push(xy.magnetization);
                    sweepState.binData[idx].acceptance.push(xy.accepted / xy.attempted);
                    sweepState.binData[idx].energy2.push(xy.energy * xy.energy);
                    sweepState.binData[idx].magnetization2.push(xy.magnetization * xy.magnetization);
                }
                sweepsThisFrame += batch;
                sweepState.sweepCount += batch;
                // If finished sweeps for this temp, record and move to next
                if (sweepState.sweepCount >= sweepState.nSweeps) {
                    // Calculate mean and SEM using bin averages
                    function binStats(arr, nBins = 10) {
                        const binSize = Math.max(1, Math.floor(arr.length / nBins));
                        const bins = [];
                        for (let i = 0; i < arr.length; i += binSize) {
                            const bin = arr.slice(i, i + binSize);
                            if (bin.length > 0) {
                                const mean = bin.reduce((a, b) => a + b, 0) / bin.length;
                                bins.push(mean);
                            }
                        }
                        const mean = bins.reduce((a, b) => a + b, 0) / bins.length;
                        const variance = bins.reduce((a, b) => a + (b - mean) ** 2, 0) / bins.length;
                        const sem = Math.sqrt(variance / bins.length);
                        return { mean, sem };
                    }
                    const idx = sweepState.tIndex;
                    const eStats = binStats(sweepState.binData[idx].energy);
                    const mStats = binStats(sweepState.binData[idx].magnetization);
                    const aStats = binStats(sweepState.binData[idx].acceptance);
                    const e2Stats = binStats(sweepState.binData[idx].energy2);
                    const m2Stats = binStats(sweepState.binData[idx].magnetization2);
                    // Specific heat per site: C = (⟨E²⟩ - ⟨E⟩²) / (T²)
                    const tempVal = t;
                    const specificHeat = (e2Stats.mean - eStats.mean * eStats.mean) / (tempVal * tempVal);
                    // Magnetic susceptibility per site: χ = (⟨M²⟩ - ⟨M⟩²) / T
                    const susceptibility = (m2Stats.mean - mStats.mean * mStats.mean) / tempVal;
                    sweepState.results.push({
                        temp: t,
                        energy: eStats.mean,
                        energy_sem: eStats.sem,
                        magnetization: mStats.mean,
                        magnetization_sem: mStats.sem,
                        acceptance: aStats.mean,
                        acceptance_sem: aStats.sem,
                        energy2: e2Stats.mean,
                        energy2_sem: e2Stats.sem,
                        magnetization2: m2Stats.mean,
                        magnetization2_sem: m2Stats.sem,
                        specific_heat: specificHeat,
                        susceptibility: susceptibility
                    });
                    sweepState.tIndex++;
                    sweepState.sweepCount = 0;
                    sweepState.phase = "warmup";
                }
            }
        }
    } else {
        for (let sweep = 0; sweep < sweepsPerFrame; sweep++) {
            if (algorithm === "metropolis") {
                xy.metropolis_step();
            } else if (algorithm === "wolff") {
                xy.wolff_step();
            } else if (algorithm === "swendsen-wang") {
                xy.swendsen_wang_step();
            } else if (algorithm === "heat-bath") {
                xy.heatbath_step();
            } else if (algorithm === "glauber") {
                xy.glauber_step();
            } else if (algorithm === "kawasaki") {
                xy.kawasaki_step();
            } else if (algorithm === "overrelaxation") {
                xy.overrelaxation_step();
            } else if (algorithm === "metropolis-reflection") {
                        xy.metropolis_reflection_step();
            }
        }
        sweepsThisFrame += sweepsPerFrame;
    }

    // Calculate sweeps per second
    const now = performance.now();
    if (!render.sweepCount) render.sweepCount = 0;
    render.sweepCount += sweepsThisFrame;
    sweepsHistory.push(render.sweepCount);
    timeHistory.push(now);
    // Keep only last 30 seconds of history
    while (timeHistory.length > 0 && now - timeHistory[0] > 30000) {
        timeHistory.shift();
        sweepsHistory.shift();
    }
    if (timeHistory.length > 1) {
        const dt = (timeHistory[timeHistory.length - 1] - timeHistory[0]) / 1000;
        const dsweeps = sweepsHistory[sweepsHistory.length - 1] - sweepsHistory[0];
        const sweepsPerSecAvg = dsweeps / dt;
        sweepsPerSecValue.textContent = sweepsPerSecAvg.toFixed(1);
    }
    // If the buffer address or size changes (e.g., after lattice size change), recreate spins array
    const ptr = xy.spins_ptr;
    if (!spins || spins.buffer !== wasm.memory.buffer || spins.byteOffset !== ptr || spins.length !== n * n) {
        spins = new Float64Array(wasm.memory.buffer, ptr, n * n);
    }

    if (vizMode === "color") {
        // Original color visualization
        const buf32 = new Uint32Array(imageData.data.buffer);
        // Map each spin angle to a color on the HSV wheel
        for (let i = 0; i < spins.length; i++) {
            // Angle in radians [0, 2pi]
            const theta = spins[i];
            // Map angle to hue [0, 360)
            const hue = ((theta % (2 * Math.PI)) / (2 * Math.PI)) * 360;
            // Full saturation and value
            const rgb = hsvToRgb(hue, 1, 1);
            // Pack into uint32: 0xffRRGGBB
            buf32[i] = (0xff << 24) | (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
        }
        ctx.putImageData(imageData, 0, 0);
    } else {
        // Quiver/arrow visualization
        drawQuiver();
    }

    // HSV to RGB conversion helper
    function hsvToRgb(h, s, v) {
        let c = v * s;
        let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        let m = v - c;
        let r, g, b;
        if (h < 60) {
            r = c; g = x; b = 0;
        } else if (h < 120) {
            r = x; g = c; b = 0;
        } else if (h < 180) {
            r = 0; g = c; b = x;
        } else if (h < 240) {
            r = 0; g = x; b = c;
        } else if (h < 300) {
            r = x; g = 0; b = c;
        } else {
            r = c; g = 0; b = x;
        }
        return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    }

    // Update plot value and history
    // Always calculate both <E> and <M>
    const energy = xy.energy;
    const magnetization = xy.magnetization;
    energyValue.textContent = energy.toFixed(4);
    magnetizationValue.textContent = (magnetization >= 0 ? "+" : "") + magnetization.toFixed(4);
    acceptanceRatioValue.textContent = (xy.accepted / xy.attempted).toFixed(4);
    let value;
    if (plotType === "energy") {
        value = energy;
    } else if (plotType === "magnetization") {
        value = magnetization;
    } else if (plotType === "acceptance_ratio") {
        value = (xy.accepted / xy.attempted);
    } else {
        value = 0;
    }
    if (plotType !== "no_plot") {
        // Plot selected value
        plotHistory.push(value);
        if (plotHistory.length > maxHistory) plotHistory.shift();

        // Draw plot with axes and labels
        livePlotCtx.clearRect(0, 0, livePlot.width, livePlot.height);
        // Axes
        livePlotCtx.strokeStyle = "#aaa";
        livePlotCtx.lineWidth = 1;
        livePlotCtx.beginPath();
        // Y axis
        livePlotCtx.moveTo(40, 10);
        livePlotCtx.lineTo(40, livePlot.height - 20);
        // X axis
        livePlotCtx.moveTo(40, livePlot.height - 20);
        livePlotCtx.lineTo(livePlot.width - 10, livePlot.height - 20);
        livePlotCtx.stroke();

        // Y labels
        livePlotCtx.save();
        livePlotCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset any transforms
        livePlotCtx.fillStyle = "#fff";
        livePlotCtx.font = "12px Arial";
        livePlotCtx.textAlign = "right";
        if (plotType === "energy") {
            const ymin = -2 * Math.abs(j) - Math.abs(h);
            const ymax = 2 * Math.abs(j) + Math.abs(h);
            livePlotCtx.fillText(ymin.toFixed(2), 35, livePlot.height - 20);
            livePlotCtx.fillText("0", 35, livePlot.height / 2 + 5);
            livePlotCtx.fillText(ymax.toFixed(2), 35, 20);
        } else {
            livePlotCtx.fillText("-1", 35, livePlot.height - 20);
            livePlotCtx.fillText("0", 35, livePlot.height / 2 + 5);
            livePlotCtx.fillText("1", 35, 20);
        }
        // X label
        livePlotCtx.textAlign = "center";
        livePlotCtx.font = "14px Arial";
        livePlotCtx.fillText("Frame", livePlot.width / 2, livePlot.height - 2);
        // Y axis label
        livePlotCtx.save();
        livePlotCtx.translate(10, livePlot.height / 2);
        livePlotCtx.rotate(-Math.PI / 2);
        livePlotCtx.textAlign = "center";
        livePlotCtx.font = "14px Arial";
        if (plotType === "acceptance_ratio") {
            livePlotCtx.fillText("Acceptance Ratio", 0, 0);
        } else if (plotType === "magnetization") {
            livePlotCtx.fillText("Magnetization", 0, 0);
        } else if (plotType === "energy") {
            livePlotCtx.fillText("Energy", 0, 0);
        }
        livePlotCtx.restore();

        // Plot line
        livePlotCtx.beginPath();
        livePlotCtx.strokeStyle = "#00ff00";
        livePlotCtx.lineWidth = 2;
        let yMin, yMax;
        if (plotType === "energy") {
            yMin = -2 * Math.abs(j) - Math.abs(h);
            yMax = 2 * Math.abs(j) + Math.abs(h);
        } else {
            yMin = -1;
            yMax = 1;
        }
        // Map y values so that yMin maps to (livePlot.height - 20) and yMax maps to 20
        const plotTop = 20;
        const plotBottom = livePlot.height - 20;
        for (let i = 0; i < plotHistory.length; i++) {
            const x = 40 + ((livePlot.width - 50) * i) / maxHistory;
            let y = plotBottom - ((plotHistory[i] - yMin) / (yMax - yMin)) * (plotBottom - plotTop);
            if (i === 0) {
                livePlotCtx.moveTo(x, y);
            } else {
                livePlotCtx.lineTo(x, y);
            }
        }
        livePlotCtx.stroke();
    }
    // Always continue animation
    animationId = requestAnimationFrame(render);
}

// Draw quiver plot (arrows) showing spin directions
function drawQuiver() {
    // Save current context state
    ctx.save();
    
    // Clear canvas with dark background
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Determine arrow spacing based on lattice size
    // For large lattices, we'll skip some sites to avoid clutter
    let skip = 1;
    if (n > 128) {
        skip = 4;
    } else if (n > 64) {
        skip = 2;
    }
    
    // Calculate grid for arrows (canvas is now 400x400 regardless of lattice size)
    const gridSize = Math.ceil(n / skip);
    const cellSize = 400 / gridSize;
    const arrowLength = cellSize * 0.6; // Arrow length as fraction of cell size
    const headLength = arrowLength * 0.3; // Arrow head length
    
    ctx.lineWidth = Math.max(1, cellSize / 20);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    for (let i = 0; i < n; i += skip) {
        for (let j = 0; j < n; j += skip) {
            const idx = i * n + j;
            const theta = spins[idx];
            
            // Map angle to color using HSV (same as color mode)
            const hue = ((theta % (2 * Math.PI)) / (2 * Math.PI)) * 360;
            const rgb = hsvToRgb(hue, 1, 1);
            const color = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
            
            // Set arrow color
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            
            // Center position of arrow in canvas coordinates
            const cx = (j / skip + 0.5) * cellSize;
            const cy = (i / skip + 0.5) * cellSize;
            
            // Arrow direction components
            const dx = Math.cos(theta);
            const dy = Math.sin(theta);
            
            // Start and end points of arrow shaft
            const x1 = cx - (dx * arrowLength) / 2;
            const y1 = cy - (dy * arrowLength) / 2;
            const x2 = cx + (dx * arrowLength) / 2;
            const y2 = cy + (dy * arrowLength) / 2;
            
            // Draw arrow shaft
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            
            // Draw arrow head
            const angle = theta; // theta is already the angle
            const headAngle = Math.PI / 6; // 30 degrees
            
            // Left side of arrow head
            const leftX = x2 - headLength * Math.cos(angle - headAngle);
            const leftY = y2 - headLength * Math.sin(angle - headAngle);
            
            // Right side of arrow head
            const rightX = x2 - headLength * Math.cos(angle + headAngle);
            const rightY = y2 - headLength * Math.sin(angle + headAngle);
            
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(leftX, leftY);
            ctx.moveTo(x2, y2);
            ctx.lineTo(rightX, rightY);
            ctx.stroke();
        }
    }
    
    // Restore context state
    ctx.restore();
}

// Draw colorbar showing the HSV color mapping for spin angles
function drawColorbar(canvas, ctx) {
    canvas.width = 360;
    canvas.height = 20;
    
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const buf32 = new Uint32Array(imageData.data.buffer);
    
    for (let x = 0; x < canvas.width; x++) {
        // Map x position to angle [0, 2π]
        const theta = (x / canvas.width) * 2 * Math.PI;
        // Map angle to hue [0, 360)
        const hue = (theta / (2 * Math.PI)) * 360;
        // Full saturation and value
        const rgb = hsvToRgb(hue, 1, 1);
        // Pack into uint32: 0xffRRGGBB
        const color = (0xff << 24) | (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
        
        // Fill the entire height for this x position
        for (let y = 0; y < canvas.height; y++) {
            buf32[y * canvas.width + x] = color;
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
}

// HSV to RGB conversion helper (needed for colorbar)
function hsvToRgb(h, s, v) {
    let c = v * s;
    let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    let m = v - c;
    let r, g, b;
    if (h < 60) {
        r = c; g = x; b = 0;
    } else if (h < 120) {
        r = x; g = c; b = 0;
    } else if (h < 180) {
        r = 0; g = c; b = x;
    } else if (h < 240) {
        r = 0; g = x; b = c;
    } else if (h < 300) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

run();