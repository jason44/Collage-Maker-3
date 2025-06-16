
(() => {
    /*** TODO:
     * - [ ] When adding only 1 or 2 images, the images are sometimes placed in odd places. Either have them appear at the center of the canvas, or fix the behavior. (This is probably due to the fallback behavior)
     ***/

    // --- SETUP ---
    const collagesList = document.getElementById('collages-list');
    const savePrompt = document.getElementById('save-prompt');
    const overwritePrompt = document.getElementById('overwrite-prompt');
    const deletePrompt = document.getElementById('confirm-delete-prompt')

    const canvasContainer = document.getElementById('canvas-container');
    const canvas = document.getElementById('collage');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = "medium"; // might cause issues on weaker devices

    
    // --- STATE MANAGEMENT ---
    let images = []; // Stores all image objects {img, x, y, w, h, aspectRatio}
    let selectedIndex = -1; // Index of the currently selected image

    // Load and Save States
    let collageName = ''; // Title of the collage, used for saving/loading state
    
    // Panning and Zooming State
    let scale = 1;
    let originX = 0;
    let originY = 0;

    // Interaction State
    let interactionMode = 'none'; // 'pan', 'drag', 'resize'
    let dragStart = {}; // Holds data for the current interaction
    let resizeHandle = ''; // e.g., 'top-left', 'bottom-right'

    const handleSize = 16; // Size of resize handles in screen pixels
    const closeButtonSize = 16; // Size of the close button
    const imgRadius = 5; // Corner radius for drawn images
    const dpr = window.devicePixelRatio || 1;

    // --- CANVAS & DRAWING ---
    /**
     * Resizes the canvas to fill its container, accounting for device pixel ratio.
     */
    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr); // Scale context once for high-DPI displays
        draw();
    }

    /**
     * The main drawing function. Clears and redraws the entire canvas.
     */
    function draw() {
        // Clear canvas
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Apply pan and zoom transform
        ctx.save();
        ctx.translate(originX, originY);
        ctx.scale(scale, scale);

        // Draw all images
        images.forEach(imgData => {
            drawRoundedImage(imgData);
        });

        // Draw selection handles and close button on the selected image
        if (selectedIndex !== -1) {
            const selected = images[selectedIndex];
            drawSelectionUI(selected);
        }

        ctx.restore();
    }

    /**
     * Lays out all new images in a masonry grid that does not overlap any existing image.
     * Minimize the empty space inside the rectangle bounding all images.
     * Tries to ensure the rectangle bounding all images has aspect ratio in range (0.6, 1.4).
     * @param {number} startIndex - The starting offset for NEW images
     */
    function computeMasonryLayout(startIndex = 0) {
        if (images.length === 0) return;

        const gutter = 15;
        const colWidth = 180; // Fixed column width
        const minAspect = 0.6, maxAspect = 1.4;

        // Compute bounding box of all existing images (before startIndex)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < startIndex; i++) {
            const img = images[i];
            minX = Math.min(minX, img.x);
            minY = Math.min(minY, img.y);
            maxX = Math.max(maxX, img.x + img.w);
            maxY = Math.max(maxY, img.y + img.h);
        }
        if (startIndex === 0) {
            minX = minY = gutter;
            maxX = maxY = 0;
        }

        // Try different column counts to fit aspect ratio
        let bestLayout = null;
        let minEmptySpace = Infinity;

        // Reasonable range for columns
        const minCols = 1;
        const maxCols = Math.max(1, Math.ceil(Math.sqrt(images.length - startIndex)) + 3);

        for (let cols = minCols; cols <= maxCols; cols++) {
            // Try placing the grid in several candidate positions around the bounding box
            const candidates = [
                { // right
                    offsetX: maxX + gutter,
                    offsetY: minY
                },
                { // left
                    offsetX: minX - (cols * (colWidth + gutter)),
                    offsetY: minY
                },
                { // below
                    offsetX: minX,
                    offsetY: maxY + gutter
                },
                { // above
                    offsetX: minX,
                    offsetY: minY - 1000 // will be adjusted after layout
                }
            ];

            for (const candidate of candidates) {
                // Simulate layout
                let testColHeights = Array(cols).fill(gutter);
                let testImages = images.slice(0, startIndex).map(img => ({
                    x: img.x, y: img.y, w: img.w, h: img.h
                }));
                let testNewImages = [];

                images.slice(startIndex).forEach(imgData => {
                    const h = colWidth / imgData.aspectRatio;
                    const colIndex = testColHeights.indexOf(Math.min(...testColHeights));
                    const x = candidate.offsetX + colIndex * (colWidth + gutter);
                    const y = candidate.offsetY + testColHeights[colIndex];
                    testNewImages.push({ x, y, w: colWidth, h });
                    testColHeights[colIndex] += h + gutter;
                });

                // Check for overlap with existing images
                let overlap = false;
                for (const newImg of testNewImages) {
                    for (const oldImg of testImages) {
                        if (
                            newImg.x < oldImg.x + oldImg.w &&
                            newImg.x + newImg.w > oldImg.x &&
                            newImg.y < oldImg.y + oldImg.h &&
                            newImg.y + newImg.h > oldImg.y
                        ) {
                            overlap = true;
                            break;
                        }
                    }
                    if (overlap) break;
                }
                if (overlap) continue;

                // Compute bounding rectangle of all images
                const allRects = [...testImages, ...testNewImages];
                let rectMinX = Infinity, rectMinY = Infinity, rectMaxX = -Infinity, rectMaxY = -Infinity, totalArea = 0;
                for (const r of allRects) {
                    rectMinX = Math.min(rectMinX, r.x);
                    rectMinY = Math.min(rectMinY, r.y);
                    rectMaxX = Math.max(rectMaxX, r.x + r.w);
                    rectMaxY = Math.max(rectMaxY, r.y + r.h);
                    totalArea += r.w * r.h;
                }
                const boundingArea = (rectMaxX - rectMinX) * (rectMaxY - rectMinY);
                const emptySpace = boundingArea - totalArea;
                const aspect = (rectMaxX - rectMinX) / (rectMaxY - rectMinY + 1e-6);

                // Only consider layouts within aspect ratio range
                if (aspect > minAspect && aspect < maxAspect) {
                    if (emptySpace < minEmptySpace) {
                        minEmptySpace = emptySpace;
                        bestLayout = {
                            offsetX: candidate.offsetX,
                            offsetY: candidate.offsetY,
                            colHeights: testColHeights.slice(),
                            positions: testNewImages.map(img => ({ x: img.x, y: img.y, w: img.w, h: img.h }))
                        };
                    }
                }
            }
        }

        // If no layout fits aspect ratio, fall back to minimizing empty space (any aspect)
        if (!bestLayout) {
            let fallbackMinEmpty = Infinity;
            for (let cols = minCols; cols <= maxCols; cols++) {
                const candidates = [
                    { offsetX: maxX + gutter, offsetY: minY },
                    { offsetX: minX - (cols * (colWidth + gutter)), offsetY: minY },
                    { offsetX: minX, offsetY: maxY + gutter },
                    { offsetX: minX, offsetY: minY - 1000 }
                ];
                for (const candidate of candidates) {
                    let testColHeights = Array(cols).fill(gutter);
                    let testImages = images.slice(0, startIndex).map(img => ({
                        x: img.x, y: img.y, w: img.w, h: img.h
                    }));
                    let testNewImages = [];
                    images.slice(startIndex).forEach(imgData => {
                        const h = colWidth / imgData.aspectRatio;
                        const colIndex = testColHeights.indexOf(Math.min(...testColHeights));
                        const x = candidate.offsetX + colIndex * (colWidth + gutter);
                        const y = candidate.offsetY + testColHeights[colIndex];
                        testNewImages.push({ x, y, w: colWidth, h });
                        testColHeights[colIndex] += h + gutter;
                    });
                    // Check for overlap
                    let overlap = false;
                    for (const newImg of testNewImages) {
                        for (const oldImg of testImages) {
                            if (
                                newImg.x < oldImg.x + oldImg.w &&
                                newImg.x + newImg.w > oldImg.x &&
                                newImg.y < oldImg.y + oldImg.h &&
                                newImg.y + newImg.h > oldImg.y
                            ) {
                                overlap = true;
                                break;
                            }
                        }
                        if (overlap) break;
                    }
                    if (overlap) continue;
                    // Compute bounding rectangle
                    const allRects = [...testImages, ...testNewImages];
                    let rectMinX = Infinity, rectMinY = Infinity, rectMaxX = -Infinity, rectMaxY = -Infinity, totalArea = 0;
                    for (const r of allRects) {
                        rectMinX = Math.min(rectMinX, r.x);
                        rectMinY = Math.min(rectMinY, r.y);
                        rectMaxX = Math.max(rectMaxX, r.x + r.w);
                        rectMaxY = Math.max(rectMaxY, r.y + r.h);
                        totalArea += r.w * r.h;
                    }
                    const boundingArea = (rectMaxX - rectMinX) * (rectMaxY - rectMinY);
                    const emptySpace = boundingArea - totalArea;
                    if (emptySpace < fallbackMinEmpty) {
                        fallbackMinEmpty = emptySpace;
                        bestLayout = {
                            offsetX: candidate.offsetX,
                            offsetY: candidate.offsetY,
                            colHeights: testColHeights.slice(),
                            positions: testNewImages.map(img => ({ x: img.x, y: img.y, w: img.w, h: img.h }))
                        };
                    }
                }
            }
        }

        // If still no non-overlapping layout found, just stack below
        if (!bestLayout) {
            let offsetX = minX;
            let offsetY = maxY + gutter;
            let colHeights = Array(1).fill(gutter);
            images.slice(startIndex).forEach((imgData, i) => {
                const h = colWidth / imgData.aspectRatio;
                imgData.x = offsetX;
                imgData.y = offsetY + colHeights[0];
                imgData.w = colWidth;
                imgData.h = h;
                colHeights[0] += h + gutter;
            });
            return;
        }

        // Apply best layout to new images
        images.slice(startIndex).forEach((imgData, i) => {
            imgData.x = bestLayout.positions[i].x;
            imgData.y = bestLayout.positions[i].y;
            imgData.w = bestLayout.positions[i].w;
            imgData.h = bestLayout.positions[i].h;
        });
    }

     /*** Draws a single image with rounded corners.
     * @param {object} imgData - The image object {img, x, y, w, h}.
     */
    function drawRoundedImage(imgData) {
        const { img, x, y, w, h } = imgData;
        ctx.save();
        ctx.beginPath();
        // Custom path for rounded rectangle
        ctx.moveTo(x + imgRadius, y);
        ctx.arcTo(x + w, y, x + w, y + h, imgRadius);
        ctx.arcTo(x + w, y + h, x, y + h, imgRadius);
        ctx.arcTo(x, y + h, x, y, imgRadius);
        ctx.arcTo(x, y, x + w, y, imgRadius);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();
    }
    
    /**
     * Draws the selection border, resize handles, and close button for an image.
     * @param {object} imgData - The image object being decorated.
     */
    function drawSelectionUI(imgData) {
        const { x, y, w, h } = imgData;

        // Draw selection border
        ctx.strokeStyle = '#3494fa';
        ctx.lineWidth = 1 / scale;
        //ctx.strokeRect(x, y, w, h);
        ctx.beginPath();
        // Custom path for rounded rectangle
        ctx.moveTo(x + imgRadius, y);
        ctx.arcTo(x + w, y, x + w, y + h, imgRadius);
        ctx.arcTo(x + w, y + h, x, y + h, imgRadius);
        ctx.arcTo(x, y + h, x, y, imgRadius);
        ctx.arcTo(x, y, x + w, y, imgRadius);
        ctx.closePath();
        ctx.stroke();

        // Draw resize handles
        const handles = getResizeHandles(imgData);
        ctx.fillStyle = '#3494fa';
        for (const key in handles) {
            const handle = handles[key];
            //ctx.fillRect(handle.x, handle.y, handle.w, handle.h);
            ctx.beginPath();
            ctx.arc(handle.x + handle.w / 2, handle.y + handle.h / 2, handle.w / 2.0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw close button
        const closeBtn = getCloseButton(imgData);
        ctx.beginPath();
        ctx.arc(closeBtn.cx, closeBtn.cy, closeBtn.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220, 53, 69, 0.9)';
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${10/scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', closeBtn.cx, closeBtn.cy);
    }


    // --- COORDINATE & HIT DETECTION ---

    /**
     * Converts client (mouse) coordinates to canvas world coordinates.
     * @param {number} clientX - Mouse X position.
     * @param {number} clientY - Mouse Y position.
     * @returns {object} {x, y} in canvas coordinates.
     */
    function toWorldCoords(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left - originX) / scale,
            y: (clientY - rect.top - originY) / scale
        };
    }

    /**
     * Finds the index of the topmost image at a given coordinate.
     * @param {object} coords - {x, y} in canvas coordinates.
     * @returns {number} The index of the image, or -1 if none found.
     */
    function getImageAtCoords(coords) {
        for (let i = images.length - 1; i >= 0; i--) {
            const img = images[i];
            if (coords.x >= img.x && coords.x <= img.x + img.w &&
                coords.y >= img.y && coords.y <= img.y + img.h) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Gets the positions of resize handles for an image.
     * @param {object} imgData - The image object.
     * @returns {object} An object containing the geometry of each handle.
     */
    function getResizeHandles(imgData) {
        const { x, y, w, h } = imgData;
        const size = handleSize / scale;
        const halfSize = size / 2;
        return {
            'top-left':     { x: x - halfSize, y: y - halfSize, w: size, h: size },
            'top-right':    { x: x + w - halfSize, y: y - halfSize, w: size, h: size },
            'bottom-left':  { x: x - halfSize, y: y + h - halfSize, w: size, h: size },
            'bottom-right': { x: x + w - halfSize, y: y + h - halfSize, w: size, h: size },
        };
    }

    /**
     * Gets the position of the close button for an image.
     * @param {object} imgData - The image object.
     * @returns {object} Geometry of the close button.
     */
     function getCloseButton(imgData) {
        const { x, w } = imgData;
        const r = closeButtonSize / 2 / scale;
        const offset = 6 / scale; // Offset from the top-right corner
        return {
            cx: x + w - r - offset,
            cy: imgData.y +  r + offset,
            r: r,
        };
    }

    /**
     * Checks which UI element (if any) is at the given coordinates.
     * @param {object} coords - {x, y} in canvas coordinates.
     * @returns {object} { type, index, handle } describing the hit.
     * type: 'close', 'resize', 'drag', or 'pan'. Where 'drag' indicates an image was hit.
     */
    function hitTest(coords) {
        // Check for close button or resize handles on selected image first
        if (selectedIndex !== -1) {
            const selected = images[selectedIndex];
            const closeBtn = getCloseButton(selected);
            const dx = coords.x - closeBtn.cx;
            const dy = coords.y - closeBtn.cy;
            if (dx * dx + dy * dy <= closeBtn.r * closeBtn.r) {
                return { type: 'close', index: selectedIndex };
            }
            
            const handles = getResizeHandles(selected);
            for (const key in handles) {
                const handle = handles[key];
                if (coords.x >= handle.x && coords.x <= handle.x + handle.w &&
                    coords.y >= handle.y && coords.y <= handle.y + handle.h) {
                    return { type: 'resize', index: selectedIndex, handle: key };
                }
            }
        }

        // Check for image bodies
        const imageIndex = getImageAtCoords(coords);
        if (imageIndex !== -1) {
            return { type: 'drag', index: imageIndex };
        }

        // Nothing was hit, so it's a pan
        return { type: 'pan' };
    }

    function HandleImageUpload(files) {
        let loadedCount = 0;
        
        if (files.length === 0) return;

        const startIndex = images.length; // Store the index where new images start
        files.forEach(file => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                images.push({
                    img,
                    x: 0, y: 0, w: 0, h: 0, // Position will be set by layout
                    aspectRatio: img.width / img.height,
                    path: window.electronAPI.getPath(file),  // Store the original file name
                });
                URL.revokeObjectURL(url); // Clean up
                
                loadedCount++;
                if (loadedCount === files.length) {
                    computeMasonryLayout(startIndex);
                    draw();
                }
            };
            img.src = url;
        });
        console.log(images)
    }

    // --- LOAD AND SAVE STATES ---

    /*** Adds new collage to the dropdown list and sets it as the current selection
     * @param {string} name - The name of the collage to be added to the dropdown list.
     * This function does not update the state or load anything. 
    */
    function addToCollagesList(name) { 
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        collagesList.appendChild(option);

        collageName = name; // update current collage title
        collagesList.value = name; // update dropdown selection
    }

    /*** Remove a collage from the dropdown list
     * @param {string} name - The name of the collage to be removed from the dropdown list.
     */
    function removeFromCollagesList(name, clearCanvas=true) {
        const option = collagesList.querySelector(`option[value="${name}"]`);
        if (option) {
            collagesList.removeChild(option);
        }
        if (clearCanvas) {
            clearCollage()
        }

        // Make sure that the list is not empty before setting the value
        if (collagesList.children.length === 0) {
            const newCollage = document.createElement('option');
            newCollage.value = '';
            newCollage.textContent = '';
            collagesList.append(newCollage);
        } 

        // Default to the bottom most option. This behavior is desirable 
        // new collages are added to the bottom of the list see "save-btn below"
        collagesList.value = collagesList.options[collagesList.options.length-1].value; 
        collageName = collagesList.value;
    }

    /*** Save the collage state using the current title 
     * @param {string} name - The name to save the collage state under.
     * @param {boolean} addToList - Whether to add 'name' to collagesList.
    */
    function saveState(name, addToList) {
        console.log(`Saving collage state as "${name}"...`);
        const state = {
            images: images.map(image => ({
                path: image.path,
                x: image.x, y: image.y, w: image.w, h: image.h, aspectRatio: image.aspectRatio
            })),
            scale,
            originX,
            originY
        };

        console.log(state);
        window.electronAPI.saveState(name, state);

        if (addToList) {
            addToCollagesList(name);
        }
    }

    /* Load a saved state by its name */
    function loadState(name) {
        if (!name) return;
        const state = window.electronAPI.getState(name);
        if (state) {
            console.log(state);

            images = state.images.map(img => ({
                img: new Image(),
                x: img.x, y: img.y, w: img.w, h: img.h, aspectRatio: img.aspectRatio,
                path: img.path
            }));
            images.forEach((image, i) => {
                const url = window.electronAPI.createUrlFromPath(image.path);
                image.img.src = url;
            });

            console.log(images)

            scale = state.scale || 1;
            originX = state.originX || 0;
            originY = state.originY || 0;

            collageName = name; // update current collage name
            collagesList.value = name // update dropdown selection

            window.resizeBy(0, 1); // force redrawing canvas (find a better way to do this?)
        } else {
            alert(`Error: Collage "${name}" not found.`);
        }
    }

    // --- EVENT LISTENERS ---
    canvas.addEventListener('mousedown', e => {
        const worldCoords = toWorldCoords(e.clientX, e.clientY);
        const hit = hitTest(worldCoords);
        
        //  Drag only if hit image is already selected and is clicked on.
        if (hit.type === 'drag' && selectedIndex == hit.index) {
            interactionMode = 'drag';
            selectedIndex = hit.index;

            // Store the offset from the top-left corner for 1-to-1 dragging
            const selectedImg = images[selectedIndex];
            dragStart = {
                offsetX: worldCoords.x - selectedImg.x,
                offsetY: worldCoords.y - selectedImg.y
            };

            canvas.style.cursor = 'move';
            draw();
            return;
        // Pan if hit lands on non-selected image or the background.
        } else if (hit.type === 'pan' || hit.type === 'drag') {
            interactionMode = 'pan';
            dragStart = { x: e.clientX - originX, y: e.clientY - originY };
            canvas.style.cursor = 'grabbing';

            // Only deselect when clicking on non-selected image or the background.
            if (hit.type === 'pan' || hit.index != selectedIndex) { 
                selectedIndex = -1;
            }
        } else if (hit.type === 'resize') {
            interactionMode = 'resize';
            selectedIndex = hit.index;
            resizeHandle = hit.handle;
        } else if (hit.type === 'close') {
            images.splice(hit.index, 1);
            selectedIndex = -1;
            interactionMode = 'none'; // No further interaction.
        }
        draw();
    });

    canvas.addEventListener('dblclick', e => {
        // A double-click initiates a drag on an image.
        e.preventDefault();
        const worldCoords = toWorldCoords(e.clientX, e.clientY);
        const hit = hitTest(worldCoords);

        if (hit.type === 'drag') {
            interactionMode = 'drag';
            selectedIndex = hit.index;

            // Bring image to front
            const item = images.splice(hit.index, 1)[0];
            images.push(item);
            selectedIndex = images.length - 1;

            // Store the offset from the top-left corner for 1-to-1 dragging
            const selectedImg = images[selectedIndex];
            dragStart = {
                offsetX: worldCoords.x - selectedImg.x,
                offsetY: worldCoords.y - selectedImg.y
            };
            canvas.style.cursor = 'move';
            draw();
        }
    });

    canvas.addEventListener('mousemove', e => {
        if (interactionMode === 'none') {
            // Update cursor based on what is being hovered over.
            const worldCoords = toWorldCoords(e.clientX, e.clientY);
            const hit = hitTest(worldCoords);
            if (hit.type === 'resize') {
                if (hit.handle === 'top-left' || hit.handle === 'bottom-right') canvas.style.cursor = 'nwse-resize';
                else canvas.style.cursor = 'nesw-resize';
            } else if (hit.type === 'close') {
                canvas.style.cursor = 'pointer';
            } else { // Covers 'pan' and 'drag' (image hover), which both get a 'grab' cursor.
                canvas.style.cursor = 'grab';
            }
            return;
        }
        
        const worldCoords = toWorldCoords(e.clientX, e.clientY);
        if (interactionMode === 'drag') {
            const img = images[selectedIndex];
            img.x = worldCoords.x - dragStart.offsetX;
            img.y = worldCoords.y - dragStart.offsetY;
        } else if (interactionMode === 'pan') {
            originX = e.clientX - dragStart.x;
            originY = e.clientY - dragStart.y;
        } else if (interactionMode === 'resize') {
            const img = images[selectedIndex];
            
            // Get the fixed corner opposite to the handle being dragged
            let oppositeCorner = {x: 0, y: 0};
            if (resizeHandle.includes('left')) oppositeCorner.x = img.x + img.w; else oppositeCorner.x = img.x;
            if (resizeHandle.includes('top')) oppositeCorner.y = img.y + img.h; else oppositeCorner.y = img.y;

            let newW = Math.abs(worldCoords.x - oppositeCorner.x);
            let newH = Math.abs(worldCoords.y - oppositeCorner.y);

            // Maintain aspect ratio by prioritizing the dominant axis of mouse movement
            if (newW / img.aspectRatio > newH) {
                newH = newW / img.aspectRatio;
            } else {
                newW = newH * img.aspectRatio;
            }
            
            // Prevent inverted or too-small images
            if (newW < 20) { newW = 20; newH = newW / img.aspectRatio; }

            img.w = newW;
            img.h = newH;
            
            // Reposition top-left corner if needed
            if (resizeHandle.includes('left')) img.x = oppositeCorner.x - newW;
            if (resizeHandle.includes('top')) img.y = oppositeCorner.y - newH;
        }
        
        draw();
    });

    window.addEventListener('mouseup', () => {
        if (interactionMode === 'drag') {
             canvas.style.cursor = 'grab';
        }
        interactionMode = 'none';
    });
    
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoom = e.deltaY < 0 ? 1.1 : 0.9;
        const worldX = (mouseX - originX) / scale;
        const worldY = (mouseY - originY) / scale;
        
        scale *= zoom;
        
        originX = mouseX - worldX * scale;
        originY = mouseY - worldY * scale;

        draw();
    });

    // --- BUTTON CONTROLS ---
    document.getElementById('add-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    
    document.getElementById('file-input').addEventListener('change', e => {
        const files = Array.from(e.target.files);
        HandleImageUpload(files)
        e.target.value = ''; // Reset file input
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
        images = [];
        selectedIndex = -1;
        scale = 1;
        originX = 0;
        originY = 0;
        draw();
    });

    document.getElementById('save-btn').addEventListener('click', () => {
        if (!collageName) {
            savePrompt.style.display = 'flex'; // show save prompt if collage is unsaved
        } else {
           saveState(collageName, false); // collage has been previously saved, so just save it again
        }
    });

    function clearCollage() {
        images = [];
        selectedIndex = -1;
        scale = 1;
        originX = 0;
        originY = 0;
        draw();
    }

    async function launchSaveOrDiscardPrompt() {
        // Show prompt to save current collage when moving from an unsaved collage to a saved one
        document.getElementById('prompt-name-discard-btn').style.display = 'flex'
        document.getElementById('prompt-name-cancel-btn').style.display = 'none'
        document.getElementById('save-prompt-text').innerHTML = "The current collage has not been saved. Save it now as";
        savePrompt.style.display = 'flex';

        // Wait for the save prompt to close before loading state
        await new Promise(resolve => {
            const handler = () => {
                savePrompt.removeEventListener('transitionend', handler);
                savePrompt.removeEventListener('displayNone', handler);
                resolve();
            };
            // Listen for prompt being hidden (display: none)
            const observer = new MutationObserver(() => {
                if (savePrompt.style.display === 'none') {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(savePrompt, { attributes: true, attributeFilter: ['style'] });
        });

        document.getElementById('prompt-name-discard-btn').style.display = 'none'
        document.getElementById('prompt-name-cancel-btn').style.display = 'flex'
        document.getElementById('save-prompt-text').innerHTML = "Save collage as";
    }

    document.getElementById('new-collage-btn').addEventListener('click', async () => {
        if (collageName !== '') {
            saveState(collageName, false); // auto-save if moving from an existing collage
        } else {
            await launchSaveOrDiscardPrompt();
        }
        addToCollagesList(''); // move to a new unsaved collage
        clearCollage(); // clear the canvas
    });

    document.getElementById('delete-collage-btn').addEventListener('click', () => {
        deletePrompt.style.display = 'flex';
        document.getElementById('delete-name').innerHTML = collageName
    })

    // --- COLLAGES DROPDOWN LIST ---
    collagesList.addEventListener('change', async (e) => {
        const selectedName = e.target.value;
        if (collageName && collageName !== selectedName) { 
            saveState(collageName, false); // move from saved collage to a different collage
            loadState(selectedName);
        } else if (!collageName && collageName !== selectedName) {
            await launchSaveOrDiscardPrompt(); // move from unsaved collage to a different collage
            loadState(selectedName);
        } else {
            return; // No change in selection
        }
    });

    // --- SAVE, OVERWRITE, AND DELETE PROMPTS ---
    document.getElementById('prompt-name-save-btn').addEventListener('click', () => {
        const nameInput = document.getElementById('collage-name-input');
        const selectedName = nameInput.value.trim();
        if (selectedName) {
            // TODO: check to see if the name is already used, and prompt to overwrite if it is.
            savePrompt.style.display = 'none';
            nameInput.value = ''; // Reset input

            collageName = selectedName;
            saveState(selectedName, true); // append 'submittedName' to dropdown list, which also means updating 'collageName' 
            
            removeFromCollagesList("", false);
        } else {
            alert('Please enter a valid title for the collage.');
        }
    });

    document.getElementById('prompt-name-cancel-btn').addEventListener('click', () => {
        savePrompt.style.display = 'none';
    });

    document.getElementById('prompt-name-discard-btn').addEventListener('click', () => {
        savePrompt.style.display = 'none';
        removeFromCollagesList(collageName); // updates collageName
    });

    document.getElementById('prompt-overwrite-btn').addEventListener('click', () => {
        // TODO
        overwritePrompt.style.display = 'none';
    });

    document.getElementById('prompt-overwrite-cancel-btn').addEventListener('click', () => {
        overwritePrompt.style.display = 'none';
    });

    document.getElementById('prompt-delete-btn').addEventListener('click', () => {
        if (collageName) {
            const states = window.electronAPI.get('states');
            delete states[collageName];
            window.electronAPI.set('states', states);
            
            removeFromCollagesList(collageName);
            loadState(collageName);
        } else {
            clearCollage(); // just clear collage if it is unsaved.
        }
        deletePrompt.style.display = 'none';
    });

    document.getElementById('prompt-delete-cancel-btn').addEventListener('click', () => {
        deletePrompt.style.display = 'none';
    });

    // --- DRAG AND DROP SUPPORT ---
    canvasContainer.addEventListener('dragover', e => {
        e.preventDefault();
        canvasContainer.style.cursor = 'copy';
        canvasContainer.style.backgroundColor = '#dce0e3';
    });

    canvasContainer.addEventListener('dragleave', () => {
        canvasContainer.style.cursor = 'grab';
        canvasContainer.style.backgroundColor = '#e9ecef';
    });

    canvasContainer.addEventListener('drop', e => {
        e.preventDefault();
        canvasContainer.style.backgroundColor = '#e9ecef';
        const files = Array.from(e.dataTransfer.files);
        HandleImageUpload(files);
    });


    // --- INITIALIZATION ---
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // populate the collages list with all saved collages
    window.electronAPI.getStateNames().forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        collagesList.appendChild(option);
    })
})();