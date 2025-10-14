// Color mapping and colorbar utilities for XY Model
// Exports: hsvToRgb, drawColorbar, drawQuiverToCanvas, drawQuiver

// HSV to RGB conversion helper
export function hsvToRgb(h, s, v) {
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

// Draw colorbar showing the HSV color mapping for spin angles
export function drawColorbar(canvas, ctx) {
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

// Helper function to draw quiver to any canvas context
export function drawQuiverToCanvas(context, width, height, n, spins) {
    // Save current context state
    context.save();
    
    // Clear canvas with dark background
    context.fillStyle = "#111";
    context.fillRect(0, 0, width, height);
    
    // Determine arrow spacing based on lattice size
    // For large lattices, we'll skip some sites to avoid clutter
    let skip = 1;
    if (n > 128) {
        skip = 4;
    } else if (n > 64) {
        skip = 2;
    }
    
    // Calculate grid for arrows
    const gridSize = Math.ceil(n / skip);
    const cellSize = width / gridSize;
    const arrowLength = cellSize * 0.6; // Arrow length as fraction of cell size
    const headLength = arrowLength * 0.3; // Arrow head length
    
    context.lineWidth = Math.max(1, cellSize / 20);
    context.lineCap = "round";
    context.lineJoin = "round";
    
    for (let i = 0; i < n; i += skip) {
        for (let j = 0; j < n; j += skip) {
            const idx = i * n + j;
            const theta = spins[idx];
            
            // Map angle to color using HSV (same as color mode)
            const hue = ((theta % (2 * Math.PI)) / (2 * Math.PI)) * 360;
            const rgb = hsvToRgb(hue, 1, 1);
            const color = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
            
            // Set arrow color
            context.strokeStyle = color;
            context.fillStyle = color;
            
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
            context.beginPath();
            context.moveTo(x1, y1);
            context.lineTo(x2, y2);
            context.stroke();
            
            // Draw arrow head
            const angle = theta; // Use the same angle for arrow head
            const headAngle = Math.PI / 6; // 30 degrees
            
            // Left side of arrow head
            const leftX = x2 - headLength * Math.cos(angle - headAngle);
            const leftY = y2 - headLength * Math.sin(angle - headAngle);
            
            // Right side of arrow head
            const rightX = x2 - headLength * Math.cos(angle + headAngle);
            const rightY = y2 - headLength * Math.sin(angle + headAngle);
            
            context.beginPath();
            context.moveTo(x2, y2);
            context.lineTo(leftX, leftY);
            context.moveTo(x2, y2);
            context.lineTo(rightX, rightY);
            context.stroke();
        }
    }
    
    // Restore context state
    context.restore();
}

// Draw quiver plot (arrows) showing spin directions
export function drawQuiver(ctx, canvas, n, spins) {
    drawQuiverToCanvas(ctx, canvas.width, canvas.height, n, spins);
}
