// Modal popup logic for XY Model
// Exports: openModal, closeModal, setupModalHandlers

export function openModal(canvasType, state) {
    const { canvasModal, modalCanvas, modalCtx, vizMode, n, imageData, drawQuiverToCanvas, drawPlotToCanvas } = state;
    
    state.expandedCanvasType = canvasType;
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
            drawQuiverToCanvas(modalCtx, modalCanvas.width, modalCanvas.height);
        }
    } else if (canvasType === "plot") {
        // For plot canvas, use a larger resolution
        modalCanvas.width = 800;
        modalCanvas.height = 800;
        modalCanvas.style.width = maxSize + "px";
        modalCanvas.style.height = maxSize + "px";
        modalCanvas.style.imageRendering = "auto";
        
        // Redraw the plot at higher resolution
        drawPlotToCanvas(modalCtx, modalCanvas.width, modalCanvas.height);
    }
}

export function closeModal(canvasModal, state) {
    canvasModal.classList.remove("active");
    state.expandedCanvasType = null;
}

export function setupModalHandlers(canvas, livePlot, canvasModal, modalCanvas, modalClose, state) {
    // Click handlers for canvases
    canvas.addEventListener("click", () => openModal("sim", state));
    livePlot.addEventListener("click", () => openModal("plot", state));
    
    // Close modal on click
    canvasModal.addEventListener("click", () => closeModal(canvasModal, state));
    modalClose.addEventListener("click", (e) => {
        e.stopPropagation();
        closeModal(canvasModal, state);
    });
    
    // Prevent closing when clicking on the canvas itself
    modalCanvas.addEventListener("click", (e) => {
        e.stopPropagation();
    });
}
