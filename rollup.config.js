import resolve from "@rollup/plugin-node-resolve";

export default {
    input: "src/index.js",
    output: {
        file: "dist/webtrees-chart-lib.es.js",
        format: "es",
        sourcemap: true,
    },
    external: [
        "d3-array",
        "d3-geo",
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
