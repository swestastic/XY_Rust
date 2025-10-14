// XY Model Monte Carlo Simulation - Main Entry Point
// This file coordinates the simulation, UI, and rendering
// Modular functionality is imported from ./modules/
//   - colors.js: HSV/RGB conversion, colorbar, quiver rendering
//   - modal.js: Modal popup handlers (currently inline due to local variable dependencies)
//   - plotting.js: Plot rendering to canvas
//   - sweeps.js: Algorithm step execution

import init, { XY } from "./pkg/xy_gui_rust.js";
import { hsvToRgb, drawColorbar, drawQuiverToCanvas, drawQuiver } from "./modules/colors.js";
import { openModal, closeModal, setupModalHandlers } from "./modules/modal.js";
import { drawPlotToCanvas } from "./modules/plotting.js";
import { performAlgorithmStep } from "./modules/sweeps.js";

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
// Modal canvas references
let canvasModal, modalCanvas, modalCtx, expandedCanvasType = null;
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
        
        // Check if Wolff is selected and h is not zero
            if ((algorithm === "wolff" || algorithm === "swendsen-wang") && h !== 0) {
                alert("This algorithm requires h = 0.\n\nResetting external field to 0.");
                h = 0;
                hValue.value = "0.00";
                hSlider.value = "0";
                xy.set_h(0);
            }
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
        
        // Check if Wolff is selected and h is not zero
            if ((algorithm === "wolff" || algorithm === "swendsen-wang") && h !== 0) {
                alert("This algorithm requires h = 0.\n\nResetting external field to 0.");
                h = 0;
                hValue.value = "0.00";
                hSlider.value = "0";
                xy.set_h(0);
            }
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
        
        // Check if Wolff is selected and J is negative
            if ((algorithm === "wolff" || algorithm === "swendsen-wang") && j < 0) {
                alert("This algorithm requires J ≥ 0.\n\nThe antiferromagnetic case is not currently implemented.\n\nResetting to J = 1.0");
                j = 1.0;
                jValue.value = "1.00";
                jSlider.value = "1.0";
                xy.set_j(1.0);
            }
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
        
        // Check if Wolff is selected and J is negative
            if ((algorithm === "wolff" || algorithm === "swendsen-wang") && j < 0) {
                alert("This algorithm requires J ≥ 0.\n\nThe antiferromagnetic case is not currently implemented.\n\nResetting to J = 1.0");
                j = 1.0;
                jValue.value = "1.00";
                jSlider.value = "1.0";
                xy.set_j(1.0);
            }
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
        
        // Validate Wolff algorithm parameters
            if (algorithm === "wolff" || algorithm === "swendsen-wang") {
                const jValue = parseFloat(document.getElementById("j-value").value);
                const hValue = parseFloat(document.getElementById("h-value").value);
            
                if (jValue < 0 || hValue !== 0) {
                    alert("This algorithm requires J ≥ 0 and h = 0.\n\nThe current implementation does not support antiferromagnetic coupling (J < 0) or external fields (h ≠ 0).\n\nResetting to J = 1.0 and h = 0.0");
                
                    // Reset J to 1.0
                    document.getElementById("j-value").value = "1.0";
                    document.getElementById("j-slider").value = "1.0";
                    xy.set_j(1.0);
                
                    // Reset h to 0.0
                    document.getElementById("h-value").value = "0.0";
                    document.getElementById("h-slider").value = "0.0";
                    xy.set_h(0.0);
                }
            }
        
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

    // Modal functionality for canvas expansion
    canvasModal = document.getElementById("canvas-modal");
    modalCanvas = document.getElementById("modal-canvas");
    modalCtx = modalCanvas.getContext("2d");
    const modalClose = canvasModal.querySelector(".modal-close");

    function openModal(canvasType) {
        expandedCanvasType = canvasType;
        canvasModal.classList.add("active");
        
        // Set modal canvas size to be larger (80% of viewport)
        const maxSize = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.8);
        
        if (canvasType === "sim") {
            // For simulation canvas, match current visualization mode
            if (vizMode === "quiver") {
                modalCanvas.width = 400;
                modalCanvas.height = 400;
                modalCanvas.style.imageRendering = "auto";
            } else {
                modalCanvas.width = n;
                modalCanvas.height = n;
                modalCanvas.style.imageRendering = "pixelated";
            }
            modalCanvas.style.width = maxSize + "px";
            modalCanvas.style.height = maxSize + "px";
            
            // Copy current visualization
            if (vizMode === "color" && imageData) {
                modalCtx.putImageData(imageData, 0, 0);
            } else if (vizMode === "quiver") {
                // Redraw quiver on modal canvas
                drawQuiverToCanvas(modalCtx, modalCanvas.width, modalCanvas.height, n, spins);
            }
        } else if (canvasType === "plot") {
            // For plot canvas, use a larger resolution
            modalCanvas.width = 800;
            modalCanvas.height = 800;
            modalCanvas.style.width = maxSize + "px";
            modalCanvas.style.height = maxSize + "px";
            modalCanvas.style.imageRendering = "auto";
            
            // Redraw the plot at higher resolution
            drawPlotToCanvas(modalCtx, modalCanvas.width, modalCanvas.height, plotType, plotHistory, maxHistory, j, h);
        }
    }

    function closeModal() {
        canvasModal.classList.remove("active");
        expandedCanvasType = null;
    }

    // Click handlers for canvases
    canvas.addEventListener("click", () => openModal("sim"));
    livePlot.addEventListener("click", () => openModal("plot"));
    
    // Close modal on click
    canvasModal.addEventListener("click", closeModal);
    modalClose.addEventListener("click", (e) => {
        e.stopPropagation();
        closeModal();
    });
    
    // Prevent closing when clicking on the canvas itself
    modalCanvas.addEventListener("click", (e) => {
        e.stopPropagation();
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


// Helper function to draw plot to any canvas context - now imported from modules/plotting.js

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
                    performAlgorithmStep(xy, algorithm);
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
                    performAlgorithmStep(xy, algorithm);
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
                    performAlgorithmStep(xy, algorithm);
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
            performAlgorithmStep(xy, algorithm);
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
            // Pack into uint32: ABGR format (little-endian)
            buf32[i] = (0xff << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0];
        }
        ctx.putImageData(imageData, 0, 0);
    } else {
        // Quiver/arrow visualization
        drawQuiver(ctx, canvas, n, spins);
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
    
    // Update modal if it's showing the plot
    if (expandedCanvasType === "plot") {
        drawPlotToCanvas(modalCtx, modalCanvas.width, modalCanvas.height, plotType, plotHistory, maxHistory, j, h);
    }
    
    // Update modal if it's showing the simulation
    if (expandedCanvasType === "sim" && spins) {
        if (vizMode === "color") {
            // Copy color visualization to modal
            const buf32 = new Uint32Array(imageData.data.buffer);
            const modalImageData = modalCtx.createImageData(n, n);
            const modalBuf32 = new Uint32Array(modalImageData.data.buffer);
            for (let i = 0; i < n * n; i++) {
                modalBuf32[i] = buf32[i];
            }
            modalCtx.putImageData(modalImageData, 0, 0);
        } else if (vizMode === "quiver") {
            // Redraw quiver visualization on modal
            drawQuiverToCanvas(modalCtx, modalCanvas.width, modalCanvas.height, n, spins);
        }
    }
    
    // Always continue animation
    animationId = requestAnimationFrame(render);
}

run();