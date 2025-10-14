// Plotting utilities for XY Model
// Exports: drawPlotToCanvas

export function drawPlotToCanvas(ctx, width, height, plotType, plotHistory, maxHistory, j, h) {
    if (plotType === "no_plot" || plotHistory.length === 0) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Calculate margins based on canvas size
    const leftMargin = width * 0.1;
    const rightMargin = width * 0.025;
    const topMargin = height * 0.05;
    const bottomMargin = height * 0.05;
    
    // Axes
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Y axis
    ctx.moveTo(leftMargin, topMargin);
    ctx.lineTo(leftMargin, height - bottomMargin);
    // X axis
    ctx.moveTo(leftMargin, height - bottomMargin);
    ctx.lineTo(width - rightMargin, height - bottomMargin);
    ctx.stroke();
    
    // Y labels
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.floor(height * 0.02)}px Arial`;
    ctx.textAlign = "right";
    let yMin, yMax;
    if (plotType === "energy") {
        yMin = -2 * Math.abs(j) - Math.abs(h);
        yMax = 2 * Math.abs(j) + Math.abs(h);
        ctx.fillText(yMin.toFixed(2), leftMargin - 5, height - bottomMargin);
        ctx.fillText("0", leftMargin - 5, height / 2);
        ctx.fillText(yMax.toFixed(2), leftMargin - 5, topMargin);
    } else {
        yMin = -1;
        yMax = 1;
        ctx.fillText("-1", leftMargin - 5, height - bottomMargin);
        ctx.fillText("0", leftMargin - 5, height / 2);
        ctx.fillText("1", leftMargin - 5, topMargin);
    }
    
    // X label
    ctx.textAlign = "center";
    ctx.font = `${Math.floor(height * 0.025)}px Arial`;
    ctx.fillText("Frame", width / 2, height - 5);
    
    // Y axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.font = `${Math.floor(height * 0.025)}px Arial`;
    if (plotType === "acceptance_ratio") {
        ctx.fillText("Acceptance Ratio", 0, 0);
    } else if (plotType === "magnetization") {
        ctx.fillText("Magnetization", 0, 0);
    } else if (plotType === "abs_magnetization") {
        ctx.fillText("Absolute Magnetization", 0, 0);
    } else if (plotType === "energy") {
        ctx.fillText("Energy", 0, 0);
    }
    ctx.restore();
    ctx.restore();
    
    // Plot line
    ctx.beginPath();
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 3;
    const plotLeft = leftMargin;
    const plotRight = width - rightMargin;
    const plotTop = topMargin;
    const plotBottom = height - bottomMargin;
    
    for (let i = 0; i < plotHistory.length; i++) {
        const x = plotLeft + ((plotRight - plotLeft) * i) / maxHistory;
        let y = plotBottom - ((plotHistory[i] - yMin) / (yMax - yMin)) * (plotBottom - plotTop);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}
