// sketch.js
// TESSERACT OF TIME — Black & White generative interactive piece
// Uses a 4D hypercube (tesseract) projection and interactive generative rules.
// Author: (yours) — adapt freely.

let verts4D = [];    // 16 vertices of hypercube in 4D
let edges = [];      // pairs of indices that form edges
let angle = { xy: 0, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 };
let pxMouse, pyMouse;
let paused = false;

let history = [];    // stores recent ghost frames (each is array of 2D points)
const HISTORY_MAX = 42;
let lastMoveTime = 0;
let lingerStart = 0;
let lastMouse = { x: 0, y: 0 };
let lastVel = 0;
let burstCooldown = 0;

function setup() {
    createCanvas(windowWidth, windowHeight);
    pixelDensity(1);
    initTesseract();
    strokeJoin(ROUND);
    strokeCap(ROUND);
    frameRate(60);

    pxMouse = mouseX;
    pyMouse = mouseY;

    // UI buttons
    const saveBtn = document.getElementById('saveBtn');
    const clearBtn = document.getElementById('clearBtn');
    const pauseBtn = document.getElementById('pauseBtn');

    saveBtn.onclick = () => {
        // freeze for a crisp export
        saveCanvas('tesseract-of-time', 'png');
    };

    clearBtn.onclick = () => {
        history = [];
        clearCanvasImmediately();
    };

    pauseBtn.onclick = () => {
        paused = !paused;
        pauseBtn.innerText = paused ? 'Resume' : 'Pause';
    };

    lastMoveTime = millis();
    lingerStart = millis();
}

function initTesseract() {
    verts4D = [];
    edges = [];
    // 16 vertices: each coordinate is -1 or +1
    for (let a = 0; a < 16; a++) {
        let v = [];
        for (let d = 0; d < 4; d++) {
            v[d] = ((a >> d) & 1) ? 1 : -1;
        }
        verts4D.push(v);
    }
    // edges: connect vertices that differ by exactly one coordinate
    for (let i = 0; i < verts4D.length; i++) {
        for (let j = i + 1; j < verts4D.length; j++) {
            let diffs = 0;
            for (let k = 0; k < 4; k++) {
                if (verts4D[i][k] !== verts4D[j][k]) diffs++;
            }
            if (diffs === 1) edges.push([i, j]);
        }
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    clearCanvasImmediately();
}

function clearCanvasImmediately() {
    // Full black background
    push();
    blendMode(BLEND);
    clear();
    background(0);
    pop();
}

function draw() {
    if (paused) {
        // still render a subtle overlay so user can interact with UI
        return;
    }

    // subtle fade (keeps echoes but decays)
    push();
    drawFade();
    pop();

    // compute input-driven parameters
    let mx = (mouseX === undefined) ? pmouseX : mouseX;
    let my = (mouseY === undefined) ? pmouseY : mouseY;
    let nx = map(mx, 0, width, -1, 1);
    let ny = map(my, 0, height, -1, 1);

    // rotation speeds influenced by mouse position
    let baseSpeed = 0.0015 + map(dist(mx, my, pmouseX, pmouseY), 0, 60, 0, 0.02);
    // small automatic rotation to keep alive
    angle.xy += baseSpeed * (0.6 + nx);
    angle.xz += baseSpeed * (0.4 + ny);
    angle.xw += baseSpeed * (0.25 + nx * -0.5);
    angle.yz += baseSpeed * (0.2 + ny * 0.5);
    angle.yw += baseSpeed * (0.15 + nx * 0.2);
    angle.zw += baseSpeed * (0.12 + ny * -0.2);

    // compute rotation matrix in 4D by combining plane rotations
    let rotated = [];
    for (let i = 0; i < verts4D.length; i++) {
        let v = verts4D[i].slice(); // copy [x,y,z,w]
        v = rotate4D(v, 'xy', angle.xy);
        v = rotate4D(v, 'xz', angle.xz);
        v = rotate4D(v, 'xw', angle.xw);
        v = rotate4D(v, 'yz', angle.yz);
        v = rotate4D(v, 'yw', angle.yw);
        v = rotate4D(v, 'zw', angle.zw);
        rotated.push(v);
    }

    // project 4D -> 3D -> 2D with simple perspective that uses 'w' as time depth
    let points2D = rotated.map(p => project4Dto2D(p));

    // compute speed / acceleration and linger time
    let velocity = dist(mx, my, lastMouse.x, lastMouse.y) / max(1, deltaTime || 16);
    let acceleration = abs(velocity - lastVel);
    lastVel = velocity;
    lastMouse.x = mx; lastMouse.y = my;

    // burst detection: sudden acceleration creates shards
    if (acceleration > 0.8 && burstCooldown <= 0) {
        createBurst(points2D, velocity);
        burstCooldown = 12; // cooldown frames
    }
    if (burstCooldown > 0) burstCooldown--;

    // store history for echoing: push a copy of current projected segments
    history.push(serializeFrame(points2D));
    if (history.length > HISTORY_MAX) history.shift();

    // Draw faded ghost layers (older frames are fainter)
    drawHistoryLines(history);

    // draw current tesseract in crisp white lines
    strokeWeight(map(velocity, 0, 8, 0.5, 2.6, true));
    stroke(255, 230); // main edges slightly luminous
    noFill();
    push();
    translate(width / 2, height / 2);
    // draw edges
    for (let e of edges) {
        let a = points2D[e[0]];
        let b = points2D[e[1]];
        if (!a || !b) continue;
        line(a.x, a.y, b.x, b.y);
    }
    // draw intense center "origin" when stillness accumulates
    let lingerTime = (millis() - lingerStart) / 1000;
    if (velocity < 0.4) {
        // increase linger
        // draw layered shimmers to show memory accumulation
        let layers = min(9, floor(lingerTime * 1.8));
        for (let i = 1; i <= layers; i++) {
            stroke(255, map(i, 1, layers, 30, 140));
            strokeWeight(0.6 + i * 0.2);
            beginShape();
            for (let v of points2D) vertex(v.x, v.y);
            endShape(CLOSE);
        }
    } else {
        lingerStart = millis(); // reset linger counter when moving
    }

    pop();
    // draw a subtle central seed point
    push();
    translate(width / 2, height / 2);
    noStroke();
    fill(255, 14);
    ellipse(0, 0, 14, 14);
    pop();

    // small UI overlay for current "time pressure" — minimal and monochrome
    drawHUD(velocity);

    // decrement subtle global overlay influences
    lastMoveTime = millis();
}

function drawFade() {
    // Draw semi-transparent black rectangle to fade previous frames
    // This keeps trails/echoes while letting new lines be crisp.
    noStroke();
    fill(0, 12); // low alpha to create long tails
    rect(0, 0, width, height);
}

function drawHUD(velocity) {
    // Draw small thin ring around center showing time pressure
    push();
    translate(width / 2, height / 2);
    noFill();
    stroke(255, 28);
    strokeWeight(1);
    ellipse(0, 0, map(velocity, 0, 8, 30, 180, true));
    pop();
}

// --- 4D rotation helper ---
function rotate4D(v, plane, t) {
    // v: [x,y,z,w]
    let x = v[0], y = v[1], z = v[2], w = v[3];
    let c = cos(t), s = sin(t);
    switch (plane) {
        case 'xy': return [x * c - y * s, x * s + y * c, z, w];
        case 'xz': return [x * c - z * s, y, x * s + z * c, w];
        case 'xw': return [x * c - w * s, y, z, x * s + w * c];
        case 'yz': return [x, y * c - z * s, y * s + z * c, w];
        case 'yw': return [x, y * c - w * s, z, y * s + w * c];
        case 'zw': return [x, y, z * c - w * s, z * s + w * c];
    }
    return v;
}

function project4Dto2D(p) {
    // p: [x,y,z,w]
    // first project 4D->3D using w as extra depth
    let wPerspective = map(p[3], -2, 2, 1.4, 0.3); // use w to change perspective (time depth)
    let scaleBase = min(width, height) * 0.16;
    let x3 = p[0] * scaleBase * wPerspective;
    let y3 = p[1] * scaleBase * wPerspective;
    let z3 = p[2] * scaleBase * wPerspective * 0.5;

    // simple 3D->2D perspective: simulate camera distance changing with mouse Y
    let camZ = map(mouseY, 0, height, 900, 2200);
    let perspective = camZ / (camZ - z3);
    let sx = x3 * perspective;
    let sy = y3 * perspective;

    return { x: sx, y: sy, depth: z3, w: p[3] };
}

// Serialize frame as segments for history drawing
function serializeFrame(points2D) {
    // we want a list of segments [ [x1,y1],[x2,y2], ... ] from edges
    let segs = [];
    for (let e of edges) {
        let a = points2D[e[0]];
        let b = points2D[e[1]];
        if (!a || !b) continue;
        segs.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
    }
    return segs;
}

function drawHistoryLines(hist) {
    // draw older frames with increasing blur and lower alpha to create echoes
    push();
    translate(width / 2, height / 2);
    for (let i = 0; i < hist.length; i++) {
        let age = hist.length - 1 - i; // 0 is newest, larger is older
        let alpha = map(age, 0, hist.length - 1, 160, 6);
        let sw = map(age, 0, hist.length - 1, 1.6, 0.2);
        stroke(255, alpha * 0.75);
        strokeWeight(sw);
        for (let s of hist[i]) {
            line(s[0].x, s[0].y, s[1].x, s[1].y);
        }
    }
    pop();
}

function createBurst(points2D, intensity) {
    // create temporary shards radiating from center based on current geometry
    // We'll draw a handful of fast-decaying lines directly to canvas (no history)
    push();
    translate(width / 2, height / 2);
    let count = floor(map(intensity, 0, 12, 10, 40, true));
    for (let i = 0; i < count; i++) {
        let e = edges[floor(random(edges.length))];
        let a = points2D[e[0]], b = points2D[e[1]];
        if (!a || !b) continue;
        let mx = (a.x + b.x) / 2;
        let my = (a.y + b.y) / 2;
        let dir = createVector(mx, my).normalize();
        let len = random(80, 380) * (0.6 + (intensity / 6));
        stroke(255, random(120, 255));
        strokeWeight(random(0.6, 2.4));
        line(mx, my, mx + dir.x * len, my + dir.y * len);
        // small split shards
        if (random() < 0.35) {
            let ang = atan2(dir.y, dir.x);
            let a1 = ang + random(-0.6, 0.6);
            line(mx, my, mx + cos(a1) * len * random(0.35, 0.75), my + sin(a1) * len * random(0.35, 0.75));
        }
    }
    pop();
}

// touch support: map touches to mouse
function touchMoved() {
    // prevent scrolling on mobile when interacting
    return false;
}

// keep a compact smoothing for deltaTime
let lastFrameTime = performance.now();
let deltaTime = 16;
function _updateDeltaTime() {
    let now = performance.now();
    deltaTime = now - lastFrameTime;
    lastFrameTime = now;
}
setInterval(_updateDeltaTime, 16);

// prevent context menu on canvas (long press)
document.addEventListener('contextmenu', event => {
    if (event.target.tagName.toLowerCase() === 'canvas') {
        event.preventDefault();
    }
});
