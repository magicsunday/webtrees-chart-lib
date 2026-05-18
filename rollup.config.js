import resolve from "@rollup/plugin-node-resolve";

export default {
    input: {
        index: "src/index.js",
        "chart-core": "src/chart-core.js",
    },
    output: {
        dir: "dist",
        format: "es",
        sourcemap: true,
        entryFileNames: (chunkInfo) =>
            chunkInfo.name === "chart-core"
                ? "webtrees-chart-lib-chart-core.es.js"
                : "webtrees-chart-lib.es.js",
    },
    external: [
        "d3-selection",
        "d3-transition",
        "d3-zoom",
    ],
    plugins: [
        resolve(),
    ],
};
