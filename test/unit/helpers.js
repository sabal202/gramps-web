/**
 * Shared test helpers for inspecting Lit TemplateResult trees.
 *
 * Reused across unit test files to avoid byte-for-byte duplication.
 */

/**
 * Return true if any string literal (static template part) in the
 * TemplateResult tree satisfies the predicate.  Element names and fixed
 * attribute names live in `strings`, not in `values`.
 *
 * Handles Arrays of TemplateResults (produced by `.map()` inside a Lit
 * template) by recursing into each element.
 *
 * @param {import('lit').TemplateResult|Array|*} templateResult
 * @param {(s: string) => boolean} pred
 * @returns {boolean}
 */
export function hasString(templateResult, pred) {
  if (!templateResult || typeof templateResult !== 'object') return false
  // Handle arrays (e.g. result of .map() inside a template)
  if (Array.isArray(templateResult)) {
    return templateResult.some(item => hasString(item, pred))
  }
  const strs = templateResult.strings
  if (Array.isArray(strs) && strs.some(s => typeof s === 'string' && pred(s)))
    return true
  const vals = templateResult.values
  if (!Array.isArray(vals)) return false
  return vals.some(v => hasString(v, pred))
}

/**
 * Return true if any dynamic value in the TemplateResult tree satisfies the
 * predicate.  Interpolated expressions (attribute values, property bindings)
 * live in `values`.
 *
 * Handles Arrays of TemplateResults (produced by `.map()` inside a Lit
 * template) by recursing into each element.
 *
 * @param {import('lit').TemplateResult|Array|*} templateResult
 * @param {(v: *) => boolean} pred
 * @returns {boolean}
 */
export function hasValue(templateResult, pred) {
  if (!templateResult || typeof templateResult !== 'object') return false
  // Handle arrays (e.g. result of .map() inside a template)
  if (Array.isArray(templateResult)) {
    return templateResult.some(item => hasValue(item, pred))
  }
  const vals = templateResult.values
  if (!Array.isArray(vals)) return false
  for (const v of vals) {
    if (pred(v)) return true
    if (v && typeof v === 'object' && hasValue(v, pred)) return true
  }
  return false
}
