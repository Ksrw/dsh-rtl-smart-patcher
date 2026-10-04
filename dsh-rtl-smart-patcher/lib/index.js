/**
 * Host half of `dsh-rtl-smart-patcher`.
 *
 * The user-visible work happens entirely in the browser: the Client module
 * registers a small overlay control and injects the RTL stylesheet, so there is
 * no model-facing capability, no configuration surface, and no resource to
 * dispose here. This half exists so the Loader row activates — which is what
 * puts the package's `dsh.client` declaration into the page's boot graph — and
 * it deliberately imports nothing, so it cannot fail on a missing dependency.
 *
 * @module dsh-rtl-smart-patcher
 */

/**
 * Activate the host half.
 *
 * @param _ctx - Host plugin context (unused: the Client half owns all behavior).
 */
export function apply(_ctx) {}
