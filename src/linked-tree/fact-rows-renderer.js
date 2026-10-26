/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { select } from "d3-selection";
import { glyphForTag } from "./fact-glyphs.js";
import {
    FACT_COMPACT_PAIR_OFFSET,
    FACT_GLYPH_COLUMN_WIDTH,
    FACT_OPTIONAL_ROW_HEIGHT,
    FACT_PAIR_OFFSET,
    FACT_PLACE_OFFSET,
    factOptionalOffset,
} from "./fact-rows-layout.js";
import TextRenderer from "./text-renderer.js";

/**
 * @import { Selection } from "d3-selection"
 */

/**
 * One fact of a person as the module base serialises it.
 *
 * @typedef {object} FactView
 * @property {string} tag       The tag that was found, for example "CHR" for a birth slot
 * @property {string} label     The plain text label of the fact
 * @property {string} date      The date as plain text, empty when there is none
 * @property {string} place     The place in the configured style, empty when there is none
 * @property {string} placeFull The full place name
 * @property {string} value     The canonical value of the fact, empty when there is none
 */

/**
 * Where the rows of a person box start and how far they may reach.
 *
 * @typedef {object} FactRowGeometry
 * @property {number} startX    The edge the glyph column sits on
 * @property {number} direction 1 when the rows grow to the right, -1 when they grow to the left
 * @property {number} available The width between the start edge and the far edge of the text column
 */

/**
 * Options of the rows of one chart.
 *
 * @typedef {object} FactRowOptions
 * @property {number}  firstRowY        The y position of the first date row
 * @property {boolean} showPlaces       Whether the place rows are shown
 * @property {boolean} showOptionalRows Whether the optional rows are shown
 */

/**
 * Renders the facts of a person box: the birth and death rows with an optional place row
 * below each of them, and the optional rows of the chart below those.
 *
 * Every row starts with a glyph in a column of its own, so the glyphs of all rows sit on one
 * axis. The first two slots of the facts of a person are the birth and the death, all further
 * slots are optional facts. An empty slot draws nothing and the rows below it move up, so a
 * box has no hole in the middle.
 *
 * Where the first row starts is up to the consumer, because the name block above it is laid
 * out by the consumer. Whole-chart sizing is {@see factRowsExtent}.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class FactRowsRenderer extends TextRenderer {
    /**
     * Adds the fact rows to every person box of the given selection.
     *
     * @param {Selection<any, any, any, any>} parent  The person boxes the rows are attached to
     * @param {FactRowOptions}                options The options of the chart
     *
     * @public
     */
    appendFacts(parent, options) {
        const table = parent.append("g").attr("class", "facts");
        const renderer = this;

        table.each(function (d) {
            renderer.appendPersonFacts(select(this), d.data.data, options);
        });
    }

    /**
     * Adds the rows of one person.
     *
     * @param {Selection<any, any, any, any>} node    The group of the person box
     * @param {{facts?: (FactView|null)[], thumbnail?: string}} person The data of the person
     * @param {FactRowOptions}                 options The options of the chart
     *
     * @private
     */
    appendPersonFacts(node, person, options) {
        const slots = person.facts ?? [];
        const geometry = this.rowGeometry(person.thumbnail ?? "");

        this.appendVitalRows(node, this.populated(slots.slice(0, 2)), geometry, options);

        if (options.showOptionalRows) {
            this.appendOptionalRows(node, this.populated(slots.slice(2)), geometry, options);
        }
    }

    /**
     * Returns the facts of the slots that are not empty.
     *
     * @param {(FactView|null)[]} slots
     *
     * @return {FactView[]}
     *
     * @private
     */
    populated(slots) {
        return slots.filter((fact) => fact !== null && fact !== undefined);
    }

    /**
     * Returns where the rows of a person box start and how wide they may be.
     *
     * A vertical box lays its rows out along the edge the text starts on. A horizontal box
     * starts at the text column, behind the image when the person has one. A right-to-left
     * document mirrors both.
     *
     * @param {string} thumbnail The thumbnail of the person, empty when it has none
     *
     * @return {FactRowGeometry}
     *
     * @private
     */
    rowGeometry(thumbnail) {
        const rtl = this._orientation.isDocumentRtl;
        const direction = rtl ? -1 : 1;

        if (this._orientation.isVertical) {
            return {
                startX: direction * (-this._text.width / 2),
                direction,
                available: this._text.width,
            };
        }

        const startX = this.textX({ withImage: thumbnail !== "" });
        const columnExtent = this._text.x + this._text.width;

        return {
            startX,
            direction,
            available: rtl ? startX + columnExtent : columnExtent - startX,
        };
    }

    /**
     * Adds the birth and death rows.
     *
     * A vertical box without places has no room for the glyph column next to a single value.
     * It centres the dates instead.
     *
     * @param {Selection<any, any, any, any>} node     The group of the person box
     * @param {FactView[]}                    facts    The birth and the death, whichever exist
     * @param {FactRowGeometry}               geometry The row geometry of the person
     * @param {FactRowOptions}                options  The options of the chart
     *
     * @private
     */
    appendVitalRows(node, facts, geometry, options) {
        const step = options.showPlaces ? FACT_PAIR_OFFSET : FACT_COMPACT_PAIR_OFFSET;
        const centred = this._orientation.isVertical && !options.showPlaces;

        facts.forEach((fact, index) => {
            const y = options.firstRowY + index * step;
            const date = fact.date === "" ? "…" : fact.date;
            const tooltip = [fact.label, fact.date, fact.place].filter((p) => p !== "").join(" · ");

            if (centred) {
                this.appendCentredRow(node, "fact-date", date, tooltip, geometry, y);

                return;
            }

            this.appendGlyph(node, fact.tag, geometry, y);
            this.appendValueRow(node, "fact-date", date, tooltip, geometry, y);

            if (options.showPlaces && fact.place !== "") {
                this.appendValueRow(
                    node,
                    "fact-place",
                    fact.place,
                    fact.place,
                    geometry,
                    y + FACT_PLACE_OFFSET,
                );
            }
        });
    }

    /**
     * Adds the optional rows, one glyph and one value each.
     *
     * @param {Selection<any, any, any, any>} node     The group of the person box
     * @param {FactView[]}                    facts    The optional facts, whichever exist
     * @param {FactRowGeometry}               geometry The row geometry of the person
     * @param {FactRowOptions}                options  The options of the chart
     *
     * @private
     */
    appendOptionalRows(node, facts, geometry, options) {
        const baseY = options.firstRowY + factOptionalOffset(options.showPlaces);

        facts.forEach((fact, index) => {
            const y = baseY + index * FACT_OPTIONAL_ROW_HEIGHT;
            const value = fact.value || fact.place || fact.date;
            const tooltip = [fact.label, fact.date, fact.place, fact.value]
                .filter((p) => p !== "")
                .join(" · ");

            this.appendGlyph(node, fact.tag, geometry, y);
            this.appendValueRow(node, "fact-optional", value, tooltip, geometry, y);
        });
    }

    /**
     * Adds the glyph of a fact, centred in the glyph column.
     *
     * @param {Selection<any, any, any, any>} node     The group of the person box
     * @param {string}                        tag      The tag of the fact
     * @param {FactRowGeometry}               geometry The row geometry of the person
     * @param {number}                        y        The y position of the row
     *
     * @private
     */
    appendGlyph(node, tag, geometry, y) {
        node.append("text")
            .attr("class", "fact fact-glyph")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("x", geometry.startX + (geometry.direction * FACT_GLYPH_COLUMN_WIDTH) / 2)
            .attr("y", y)
            .text(glyphForTag(tag));
    }

    /**
     * Adds a text in the value column, shortened to the room that is left.
     *
     * @param {Selection<any, any, any, any>} node      The group of the person box
     * @param {string}                        className The class of the text
     * @param {string}                        value     The text
     * @param {string}                        tooltip   The text of the tooltip
     * @param {FactRowGeometry}               geometry  The row geometry of the person
     * @param {number}                        y         The y position of the row
     *
     * @private
     */
    appendValueRow(node, className, value, tooltip, geometry, y) {
        const text = node
            .append("text")
            .attr("class", `fact ${className}`)
            .attr("text-anchor", "start")
            .attr("dominant-baseline", "middle")
            .attr("x", geometry.startX + geometry.direction * FACT_GLYPH_COLUMN_WIDTH)
            .attr("y", y);

        text.append("title").text(tooltip);
        text.append("tspan").text(
            this.truncateValue(text, value, geometry.available - FACT_GLYPH_COLUMN_WIDTH),
        );
    }

    /**
     * Adds a text centred in the box, without a glyph.
     *
     * @param {Selection<any, any, any, any>} node      The group of the person box
     * @param {string}                        className The class of the text
     * @param {string}                        value     The text
     * @param {string}                        tooltip   The text of the tooltip
     * @param {FactRowGeometry}               geometry  The row geometry of the person
     * @param {number}                        y         The y position of the row
     *
     * @private
     */
    appendCentredRow(node, className, value, tooltip, geometry, y) {
        const text = node
            .append("text")
            .attr("class", `fact ${className}`)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("x", 0)
            .attr("y", y);

        text.append("title").text(tooltip);
        text.append("tspan").text(this.truncateValue(text, value, geometry.available));
    }

    /**
     * Shortens a text to the given width. The room for the ellipsis is reserved first, so the
     * shortened text with its ellipsis is never wider than the room.
     *
     * @param {Selection<any, any, any, any>} element        The text element, for the font metrics
     * @param {string}                        value          The text
     * @param {number}                        availableWidth The room for the text
     *
     * @return {string}
     *
     * @private
     */
    truncateValue(element, value, availableWidth) {
        const fontSize = element.style("font-size");
        const fontWeight = Number.parseInt(element.style("font-weight"), 10) || 400;

        if (this.measureText(value, fontSize, fontWeight) <= availableWidth) {
            return value;
        }

        const target = availableWidth - this.measureText("…", fontSize, fontWeight);
        let working = value;

        while (working.length > 1 && this.measureText(working, fontSize, fontWeight) > target) {
            working = working.slice(0, -1).trim();
        }

        if (working.endsWith(".")) {
            working = working.slice(0, -1).trim();
        }

        return `${working}…`;
    }
}
