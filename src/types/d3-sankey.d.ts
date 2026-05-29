/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

// Minimal ambient declaration for `d3-sankey`. The package ships a UMD bundle
// with no type definitions, so without this `tsc --checkJs` falls back to
// type-checking the vendored `.js` and reports spurious `module`/`define`/`d3`
// errors from the UMD wrapper. A `paths` mapping in jsconfig points the import
// at this file so the type checker uses these signatures instead of reading the
// bundle (rollup still resolves the real package at build time). Loose by
// design — only the fields the SankeyFlow widget touches are declared.
declare module "d3-sankey" {
    interface SankeyNode {
        x0: number;
        x1: number;
        y0: number;
        y1: number;
        name: string;
        [key: string]: unknown;
    }

    interface SankeyLink {
        source: SankeyNode;
        target: SankeyNode;
        value: number;
        width: number;
        samples?: Array<{ name?: string }>;
        [key: string]: unknown;
    }

    interface SankeyGraph {
        nodes: SankeyNode[];
        links: SankeyLink[];
    }

    interface SankeyLayout {
        (graph: { nodes: unknown[]; links: unknown[] }): SankeyGraph;
        nodeId(id: (node: unknown) => string | number): SankeyLayout;
        nodeWidth(width: number): SankeyLayout;
        nodePadding(padding: number): SankeyLayout;
        nodeAlign(align: unknown): SankeyLayout;
        extent(extent: [[number, number], [number, number]]): SankeyLayout;
        size(size: [number, number]): SankeyLayout;
    }

    export function sankey(): SankeyLayout;
    export function sankeyLinkHorizontal(): (link: SankeyLink) => string | null;
    export const sankeyLeft: unknown;
    export const sankeyRight: unknown;
    export const sankeyCenter: unknown;
    export const sankeyJustify: unknown;
}
