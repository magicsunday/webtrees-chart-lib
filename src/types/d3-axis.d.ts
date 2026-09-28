/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

// Minimal ambient declaration for `d3-axis`. The project installs @types for
// most d3 modules but not this one, and tsconfig.json does not type-check
// JavaScript inside node_modules (maxNodeModuleJsDepth 0), so this ambient
// module is what the checker sees for the import — it gives the chainable
// signatures `.tickSize(...).tickPadding(...)` needs (rollup still resolves the
// real package at build time). Loose by design.
declare module "d3-axis" {
    interface Axis {
        (context: unknown): void;
        scale(scale?: unknown): Axis;
        ticks(...args: unknown[]): Axis;
        tickArguments(args?: unknown[]): Axis;
        tickValues(values?: unknown[] | null): Axis;
        tickFormat(format?: ((value: unknown, index: number) => string) | null): Axis;
        tickSize(size?: number): Axis;
        tickSizeInner(size?: number): Axis;
        tickSizeOuter(size?: number): Axis;
        tickPadding(padding?: number): Axis;
        offset(offset?: number): Axis;
    }

    export function axisTop(scale: unknown): Axis;
    export function axisRight(scale: unknown): Axis;
    export function axisBottom(scale: unknown): Axis;
    export function axisLeft(scale: unknown): Axis;
}
