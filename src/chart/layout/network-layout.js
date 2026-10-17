/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

// The deterministic layout engine of the network graph: a seeded static force
// solver plus the geometry passes that fit the result to the card and place the
// name labels. Pure geometry, no DOM and no d3 import, so it can be tested and
// reused without a rendered widget.

/**
 * Fixed seed for the layout PRNG. Identical input therefore always lays out to
 * identical coordinates, which keeps the static render stable across redraws
 * and lets a consumer cache / snapshot the result.
 */
const LAYOUT_SEED = 20240607;

/** Number of relaxation iterations the static force solver runs. */
const ITERS = 360;

/** Ideal edge length (spring rest length) in layout units. */
const IDEAL = 52;

/** Repulsion constant between every node pair (Coulomb-like). */
const REP = 3200;

/** Padding (layout units) added around the laid-out bounding box. */
const PAD = 34;

/**
 * Upper bound on the anisotropic layout stretch {@see fitToAspect} applies. The
 * force solver relaxes to a roughly round cloud, so a wide card would letterbox
 * it under `preserveAspectRatio="meet"`; stretching the positions to the card's
 * aspect fills the width. The cap stops a near-collinear excerpt (content aspect
 * far from the target) from being blown into a thin, distorted band.
 */
const MAX_STRETCH = 3;

/** Node radii by role. */
const R_HUB = 11;
const R_HIGHLIGHT = 7.5;
const R_PLAIN = 5.5;

/** Vertical gap (px) between a node edge and its name label baseline. */
const LABEL_GAP_ABOVE = 7;

/** Vertical gap (px) between a node edge and the hub label, placed below. */
const LABEL_GAP_BELOW = 14;

/** Approximate label font-size (layout units) used for width estimation; matches the consumer CSS. */
const LABEL_FONT_SIZE = 16;

/**
 * Average glyph width as a fraction of the font size. Lets the collision pass
 * estimate a label's width WITHOUT measuring the DOM (`getBBox` reads 0 while
 * the host tab is hidden), so label placement stays deterministic and testable.
 */
const LABEL_CHAR_WIDTH_RATIO = 0.58;

/** Label extent above the text baseline (layout units) — the glyph ascent plus a halo margin. */
const LABEL_ASCENT = 16;

/** Label extent below the text baseline (layout units) — the glyph descent plus a halo margin. */
const LABEL_DESCENT = 6;

/** Vertical step (layout units) when relocating a collided label; larger than the full box so one step clears. */
const LABEL_LINE_HEIGHT = 22;

/**
 * A deterministic 32-bit PRNG (mulberry32). Returns a function producing a new
 * float in [0, 1) on each call. Seeding it with a constant makes the whole
 * layout reproducible.
 *
 * @param {number} seed Initial 32-bit seed.
 *
 * @returns {() => number} A zero-argument generator returning floats in [0, 1).
 */
function mulberry32(seed) {
    let state = seed | 0;

    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * @typedef {object} NetworkNode
 * @property {string}  id
 * @property {string}  label
 * @property {string}  title        Rich hover text (empty string → fall back to label).
 * @property {string}  group
 * @property {boolean} emphasis
 * @property {string}  href
 * @property {boolean} isHub        Whether this node is the hub.
 * @property {boolean} onHighlight  Whether this node is on the highlight path.
 * @property {boolean} showLabel    Whether this node carries a visible name label.
 */

/**
 * @typedef {object} NetworkLink
 * @property {string}  source
 * @property {string}  target
 * @property {boolean} isHighlighted
 */

/**
 * @typedef {object} NetworkModel
 * @property {Array<NetworkNode>} nodes
 * @property {Array<NetworkLink>} links
 * @property {number}             totalCount
 * @property {number}             shownCount
 */

/**
 * @typedef {object} Layout
 * @property {Object<string, {x: number, y: number}>}                 byId      Node id → resolved coordinates.
 * @property {Object<string, {x: number, y: number}>} labelById Labelled node id → resolved label anchor.
 * @property {string}                                                 viewBox   The fitted svg viewBox string.
 */

/**
 * The rendered radius for a node: the hub is largest, an emphasised or
 * highlight-path node mid-sized, everything else the plain radius.
 *
 * @param {NetworkNode} node
 *
 * @returns {number}
 */
export function nodeRadius(node) {
    if (node.isHub) {
        return R_HUB;
    }

    if (node.emphasis || node.onHighlight) {
        return R_HIGHLIGHT;
    }

    return R_PLAIN;
}

/**
 * Run the deterministic static force solver and fit a viewBox around the
 * result. Ports the prototype's spring/repulsion/centering relaxation: nodes
 * seed on a ring (with seeded jitter), repel pairwise (Coulomb), springs pull
 * linked pairs toward `IDEAL`, a weak centering force keeps the graph framed,
 * and a per-iteration cooling factor anneals the motion. Because the PRNG is
 * seeded with a constant and the iteration count is fixed, identical input
 * yields identical coordinates.
 *
 * @param {NetworkModel} model
 * @param {number}       width
 * @param {number}       height
 *
 * @returns {Layout}
 */
export function computeLayout(model, width, height) {
    const count = model.nodes.length;
    /** @type {Record<string, number>} */
    const index = {};
    model.nodes.forEach((node, i) => {
        index[node.id] = i;
    });

    const rng = mulberry32(LAYOUT_SEED);
    const ring = Math.min(width, height) * 0.32;

    /** @typedef {{x: number, y: number, vx: number, vy: number}} LayoutPoint */
    /** @type {LayoutPoint[]} */
    const points = model.nodes.map((_, i) => {
        const angle = (i / count) * Math.PI * 2;

        return {
            x: width / 2 + Math.cos(angle) * ring + (rng() - 0.5) * 24,
            y: height / 2 + Math.sin(angle) * ring + (rng() - 0.5) * 24,
            vx: 0,
            vy: 0,
        };
    });

    for (let iteration = 0; iteration < ITERS; iteration++) {
        const cool = 1 - iteration / ITERS;

        // Every index below is in range: `points` holds one entry per node,
        // and `index` maps every link endpoint (validated against the node
        // set) to its point.
        for (let i = 0; i < count; i++) {
            const pi = /** @type {LayoutPoint} */ (points[i]);
            for (let j = i + 1; j < count; j++) {
                const pj = /** @type {LayoutPoint} */ (points[j]);
                const dx = pi.x - pj.x;
                const dy = pi.y - pj.y;
                const d2 = dx * dx + dy * dy || 0.01;
                const d = Math.sqrt(d2);
                const f = REP / d2;
                const fx = (f * dx) / d;
                const fy = (f * dy) / d;
                pi.vx += fx;
                pi.vy += fy;
                pj.vx -= fx;
                pj.vy -= fy;
            }
        }

        for (const link of model.links) {
            const a = /** @type {LayoutPoint} */ (
                points[/** @type {number} */ (index[link.source])]
            );
            const b = /** @type {LayoutPoint} */ (
                points[/** @type {number} */ (index[link.target])]
            );
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
            const f = (d - IDEAL) * 0.09;
            const fx = (f * dx) / d;
            const fy = (f * dy) / d;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
        }

        for (let i = 0; i < count; i++) {
            const point = /** @type {LayoutPoint} */ (points[i]);
            point.vx += (width / 2 - point.x) * 0.004;
            point.vy += (height / 2 - point.y) * 0.004;
            point.x += Math.max(-14, Math.min(14, point.vx)) * cool * 0.55;
            point.y += Math.max(-14, Math.min(14, point.vy)) * cool * 0.55;
            point.vx *= 0.86;
            point.vy *= 0.86;
        }
    }

    // Stretch the solved positions to the card's aspect ratio so the isotropic
    // force cloud fills the full width instead of being letterboxed by
    // `preserveAspectRatio="meet"`. Only positions move — node radii are applied
    // later at render, so the dots stay perfect circles; only the (metric-free)
    // edge lengths stretch. Runs BEFORE label placement so the de-collision and
    // the fitted viewBox both see the final geometry.
    fitToAspect(points, width / height);

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    /** @type {Object<string, {x: number, y: number}>} */
    const byId = {};

    model.nodes.forEach((node, i) => {
        const point = /** @type {LayoutPoint} */ (points[i]);
        byId[node.id] = { x: point.x, y: point.y };
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    });

    // Place the visible labels (highlight-path endpoints + hub) and resolve any
    // overlap between them, then frame the viewBox around BOTH the nodes and the
    // resolved label boxes so a long name never collides with its neighbour nor
    // clips at the frame edge.
    const labelled = model.nodes
        .filter((node) => node.showLabel)
        .map((node) => ({
            id: node.id,
            x: /** @type {{x: number, y: number}} */ (byId[node.id]).x,
            y: /** @type {{x: number, y: number}} */ (byId[node.id]).y,
            r: nodeRadius(node),
            isHub: node.isHub,
            label: node.label,
        }));

    const placement = placeLabels(labelled);

    let extMinX = minX;
    let extMinY = minY;
    let extMaxX = maxX;
    let extMaxY = maxY;

    for (const box of placement.boxes) {
        extMinX = Math.min(extMinX, box.left);
        extMinY = Math.min(extMinY, box.top);
        extMaxX = Math.max(extMaxX, box.right);
        extMaxY = Math.max(extMaxY, box.bottom);
    }

    const viewBox = `${extMinX - PAD} ${extMinY - PAD} ${extMaxX - extMinX + PAD * 2} ${extMaxY - extMinY + PAD * 2}`;

    return { byId, viewBox, labelById: placement.byId };
}

/**
 * Stretch a solved point cloud (in place) toward a target aspect ratio so it
 * fills a non-square card instead of being letterboxed. Only the axis that is
 * UNDER-used grows, scaled around the cloud's centre, so the layout keeps its
 * centre of mass; the other axis is left untouched. The scale is bounded by
 * {@see MAX_STRETCH} so a near-collinear cloud (content aspect far from the
 * target) cannot blow into a thin distorted band, and a degenerate cloud with no
 * extent on an axis is left unchanged (no division by zero). Point radii are not
 * touched here — they are applied at render — so the rendered nodes stay circles.
 *
 * @param {Array<{x: number, y: number}>} points       The solved positions, mutated in place
 * @param {number}                        targetAspect The card's width / height ratio
 *
 * @returns {void}
 */
export function fitToAspect(points, targetAspect) {
    if (points.length === 0 || !(targetAspect > 0)) {
        return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;

    // A cloud with no extent on either axis cannot define an aspect ratio.
    if (spanX < 1 || spanY < 1) {
        return;
    }

    const contentAspect = spanX / spanY;

    if (contentAspect < targetAspect) {
        const scale = Math.min(targetAspect / contentAspect, MAX_STRETCH);
        const centerX = (minX + maxX) / 2;

        for (const point of points) {
            point.x = centerX + (point.x - centerX) * scale;
        }

        return;
    }

    if (contentAspect > targetAspect) {
        const scale = Math.min(contentAspect / targetAspect, MAX_STRETCH);
        const centerY = (minY + maxY) / 2;

        for (const point of points) {
            point.y = centerY + (point.y - centerY) * scale;
        }
    }
}

/**
 * Estimate a label's rendered width in layout units without touching the DOM
 * (`getBBox` reads 0 while the host tab is hidden), so the collision pass stays
 * deterministic and unit-testable.
 *
 * @param {string} label
 *
 * @returns {number}
 */
function estimateLabelWidth(label) {
    return label.length * LABEL_FONT_SIZE * LABEL_CHAR_WIDTH_RATIO;
}

/**
 * Axis-aligned box overlap test.
 *
 * @param {{left: number, right: number, top: number, bottom: number}} a
 * @param {{left: number, right: number, top: number, bottom: number}} b
 *
 * @returns {boolean}
 */
function overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Resolve the (few) visible labels' positions: an endpoint label sits above its
 * node, the hub label below. When a later label's box would overlap one already
 * placed, it is pushed further in its own direction (endpoints up, the hub down)
 * by whole line-heights until it clears every placed label — so two long names
 * never collide. The first label of each kind keeps the exact default offset.
 *
 * Returns both the resolved anchor per node id and the occupied boxes so the
 * caller can fit the viewBox around the labels too.
 *
 * @param {Array<{id: string, x: number, y: number, r: number, isHub: boolean, label: string}>} labelled
 *
 * @returns {{byId: Object<string, {x: number, y: number}>, boxes: Array<{left: number, right: number, top: number, bottom: number}>}}
 */
export function placeLabels(labelled) {
    /** @type {Object<string, {x: number, y: number}>} */
    const byId = {};

    /** @type {Array<{left: number, right: number, top: number, bottom: number}>} */
    const boxes = [];

    for (const node of labelled) {
        const halfWidth = Math.max(estimateLabelWidth(node.label), node.r * 2) / 2;

        // The anchor is the SVG text origin: a hub label's top edge (it carries
        // `dominant-baseline: text-before-edge`, growing down), an endpoint
        // label's baseline (growing up, with a descent reaching below it). The
        // box spans the real inked extent so a descender can't graze the label
        // below it.
        /** @param {number} anchorY */
        const boxFor = (anchorY) =>
            node.isHub
                ? {
                      left: node.x - halfWidth,
                      right: node.x + halfWidth,
                      top: anchorY,
                      bottom: anchorY + LABEL_ASCENT + LABEL_DESCENT,
                  }
                : {
                      left: node.x - halfWidth,
                      right: node.x + halfWidth,
                      top: anchorY - LABEL_ASCENT,
                      bottom: anchorY + LABEL_DESCENT,
                  };

        /** @param {{left: number, right: number, top: number, bottom: number}} candidate */
        const isClear = (candidate) => !boxes.some((placed) => overlaps(placed, candidate));

        const defaultY = node.isHub
            ? node.y + node.r + LABEL_GAP_BELOW
            : node.y - node.r - LABEL_GAP_ABOVE;

        let anchorY = defaultY;
        let box = boxFor(anchorY);

        // When the default position collides, scan OUTWARD for the nearest clear
        // slot — trying the label's natural side first (endpoints up, the hub
        // down), then the opposite — so even three mutually overlapping labels
        // each land in free space instead of a fixed-direction push trapping
        // them against one another.
        if (!isClear(box)) {
            const naturalDir = node.isHub ? 1 : -1;

            for (let step = 1; step <= 40; ++step) {
                const natural = boxFor(defaultY + naturalDir * step * LABEL_LINE_HEIGHT);

                if (isClear(natural)) {
                    anchorY = defaultY + naturalDir * step * LABEL_LINE_HEIGHT;
                    box = natural;
                    break;
                }

                const opposite = boxFor(defaultY - naturalDir * step * LABEL_LINE_HEIGHT);

                if (isClear(opposite)) {
                    anchorY = defaultY - naturalDir * step * LABEL_LINE_HEIGHT;
                    box = opposite;
                    break;
                }
            }
        }

        boxes.push(box);
        byId[node.id] = { x: node.x, y: anchorY };
    }

    return { byId, boxes };
}
