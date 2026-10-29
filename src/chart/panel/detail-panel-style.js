/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { ensureStyle } from "../util/ensure-style.js";

/**
 * Marks the style element that carries the shared rules of the detail panel.
 *
 * @type {string}
 */
export const DETAIL_PANEL_STYLE_ATTRIBUTE = "data-webtrees-detail-panel-style";

/**
 * The shared rules of the detail panel, scoped to the class that its markup carries. A chart
 * module keeps only the rules that are specific to it.
 *
 * @type {string}
 */
export const DETAIL_PANEL_CSS = `/*
 * A round image of fixed size with a ring around it. The whole photo stays visible, so a portrait
 * photo keeps the chin, and the neutral ground fills what the photo does not cover.
 */
.webtrees-detail-panel .detail-image {
    display: block;
    width: 9rem;
    height: 9rem;
    margin: 0 auto 1rem;
    border: 3px solid var(--bs-border-color, #dee2e6);
    border-radius: 50%;
    background-color: var(--bs-secondary-bg, #e9ecef);
    object-fit: contain;
}

.webtrees-detail-panel .detail-image[hidden] {
    display: none;
}

.webtrees-detail-panel .detail-facts dt {
    font-weight: 600;
    margin-top: 0.75rem;
}

.webtrees-detail-panel .detail-facts dd {
    margin-bottom: 0;
}

.webtrees-detail-panel .detail-place {
    font-style: italic;
}

.webtrees-detail-panel .offcanvas-title:focus {
    outline: none;
}

/*
 * The panel is an offcanvas that opens on a click on a person. It has no backdrop, so the chart
 * stays usable, and the shadow to the chart makes it look as if it lies above the page.
 */
.webtrees-detail-panel.offcanvas-end {
    box-shadow: -0.75rem 0 1.5rem rgba(0, 0, 0, 0.25);
}

/* In a right-to-left page the panel sits at the left edge, so the shadow falls to the right */
[dir="rtl"] .webtrees-detail-panel.offcanvas-end {
    box-shadow: 0.75rem 0 1.5rem rgba(0, 0, 0, 0.25);
}
`;

/**
 * Adds the shared rules of the detail panel to the head of the document as one style element.
 * Every further call finds the element and adds nothing, and a document without a head is
 * left alone.
 *
 * @returns {void}
 */
export function ensureDetailPanelStyle() {
    ensureStyle(DETAIL_PANEL_STYLE_ATTRIBUTE, DETAIL_PANEL_CSS);
}
