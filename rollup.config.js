import resolve from "@rollup/plugin-node-resolve";

export default {
    input: {
        "chart-core": "src/chart-core.js",
        infra: "src/infra.js",
        widgets: "src/widgets.js",
    },
    output: {
        dir: "dist",
        format: "es",
        sourcemap: true,
        entryFileNames: "webtrees-chart-lib-[name].es.js",
    },
    // Every d3 module the library imports is a declared peer dependency and
    // must stay external so the consumer supplies it once, instead of each
    // bundle re-embedding its own copy. Keep this list in sync with the
    // d3-* imports across src/.
    external: [
        "d3-array",
        "d3-axis",
        "d3-brush",
        "d3-chord",
        "d3-ease",
        "d3-geo",
        "d3-hierarchy",
        "d3-interpolate",
        "d3-path",
        "d3-sankey",
        "d3-scale",
        "d3-scale-chromatic",
        "d3-selection",
        "d3-shape",
        "d3-transition",
        "d3-zoom",
    ],
    plugins: [
        resolve(),
    ],
};
