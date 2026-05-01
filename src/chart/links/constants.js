/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

// Pixels trimmed from each end of a marriage segment so the line stops
// just short of the adjacent box edges instead of touching them.
export const LINE_END_TRIM_PX = 2;

// Cross-axis stagger between successive marriage lines for the same
// real-person. Multi-marriage bundles stay distinguishable; the
// last/innermost marriage runs through the row centre.
export const MARRIAGE_STAGGER_PX = 5;
