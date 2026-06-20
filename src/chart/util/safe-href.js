/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Consumer-supplied `href` sanitiser shared by the link-bearing chart widgets.
 * A widget writes the caller's `href` straight onto an anchor, so a hostile
 * value (`javascript:`, `data:`, `vbscript:` ...) would execute on click. This
 * helper allows only navigable, non-script targets and returns an empty string
 * for everything else, letting the widget simply omit the attribute (an inert,
 * non-navigable anchor) rather than emit a live exploit.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */

/**
 * The schemes a hostile href could use to run script (or smuggle an inline
 * document) when navigated. Tested case-insensitively after normalisation.
 */
const BLOCKED_SCHEMES = ["javascript:", "data:", "vbscript:"];

/**
 * Matches an RFC-3986 scheme prefix (letter, then letters/digits/`+`/`-`/`.`)
 * up to the first colon. Used to detect any explicit scheme so a
 * non-allow-listed one can be rejected.
 */
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Drop the characters a browser discards from an href before it parses the
 * scheme: every C0 control character plus space (code point <= 0x20) and DEL
 * (0x7F). Implemented as a code-point filter, not a regex, so the helper
 * carries no literal control character. Removing them means a split scheme such
 * as `java\tscript:` or `java\nscript:` normalises back to `javascript:` and
 * cannot slip past the scheme test.
 *
 * @param {string} value The raw href.
 *
 * @returns {string} The href with control characters removed.
 */
function stripControlChars(value) {
    let out = "";
    for (const char of value) {
        const code = char.codePointAt(0);
        if (code !== undefined && code > 0x20 && code !== 0x7f) {
            out += char;
        }
    }
    return out;
}

/**
 * Return `value` when it is a safe, navigable href, otherwise an empty string
 * (the caller then omits the `href` attribute, yielding an inert anchor).
 *
 * Allowed: relative paths, same-document fragments (`#...`), `http:` / `https:`,
 * and protocol-relative URLs (`//host/...`) -- webtrees person links are
 * internal routes. Blocked: `javascript:`, `data:`, `vbscript:`, and any other
 * explicit scheme. The check is robust to leading/trailing whitespace, mixed
 * case, and embedded control characters (tabs, newlines, NUL) that a browser
 * would strip before resolving the scheme.
 *
 * @param {unknown} value The candidate href.
 *
 * @returns {string} The original href when safe, or "" when unsafe or unusable.
 */
export function safeHref(value) {
    if (typeof value !== "string") {
        return "";
    }

    const normalized = stripControlChars(value).trim().toLowerCase();
    if (normalized === "") {
        return "";
    }

    for (const scheme of BLOCKED_SCHEMES) {
        if (normalized.startsWith(scheme)) {
            return "";
        }
    }

    // Any explicit `scheme:` prefix that is not http(s) is blocked (mailto:,
    // ftp:, tel:, custom:, ...). Relative paths, fragments and protocol-relative
    // `//host` carry no scheme prefix and pass through untouched.
    const schemeMatch = SCHEME_PREFIX.exec(normalized);
    if (schemeMatch !== null) {
        const scheme = schemeMatch[0].slice(0, -1);
        if (scheme !== "http" && scheme !== "https") {
            return "";
        }
    }

    return value;
}
