// Pure helper functions for multi-parent-family and non-birth-child chart logic.
// No DOM, no D3, no imports from other chart files — just data in, data out.

/**
 * Returns all parent families for a person.
 *
 * Single source of truth for which parent families to show:
 * - Uses extended.parent_families when it is a non-empty array (full API data).
 * - Falls back to [primary_parent_family] for older data that only carries the
 *   primary family.
 * - Returns [] when neither is present.
 *
 * @param {object} person
 * @returns {object[]} Array of Family objects (may be empty).
 */
export const selectParentFamilies = person => {
  const ext = person?.extended
  if (!ext) return []
  if (Array.isArray(ext.parent_families) && ext.parent_families.length > 0) {
    return ext.parent_families
  }
  if (ext.primary_parent_family) {
    return [ext.primary_parent_family]
  }
  return []
}

/**
 * Decides whether the child→parents link for a given person in a family
 * should be drawn dashed (non-birth relationship).
 *
 * Mirrors the desktop gvrelgraph.py `add_family_link` logic:
 *   adopted = frel !== 'Birth' || mrel !== 'Birth'
 *   if frel === 'None' && mrel === 'Birth': adopted = false  (correction)
 *
 * @param {object|null|undefined} family  Family object with child_ref_list.
 * @param {string} personHandle           The child person's handle.
 * @returns {{dashed: boolean}}
 */
export const childRefStyle = (family, personHandle) => {
  if (!family || !Array.isArray(family.child_ref_list)) return {dashed: false}
  const childRef = family.child_ref_list.find(cr => cr.ref === personHandle)
  if (!childRef) return {dashed: false}
  const frel = childRef.frel ?? 'Birth'
  const mrel = childRef.mrel ?? 'Birth'
  let adopted = frel !== 'Birth' || mrel !== 'Birth'
  // Desktop correction: no-father + birth-mother is treated as solid
  if (frel === 'None' && mrel === 'Birth') adopted = false
  return {dashed: adopted}
}

/**
 * Returns child refs for descending from a specific parent into a family.
 *
 * Determines which relation key to use (frel vs mrel) based on which parent
 * the anchor handle matches, then filters/maps the child ref list accordingly.
 *
 * @param {object|null|undefined} family       Family object.
 * @param {string} parentHandle                Handle of the parent being descended from.
 * @param {{includeNonBirth: boolean}} options
 *   - includeNonBirth: true  → include all children; dashed reflects the
 *                              relevant relation type.
 *   - includeNonBirth: false → include only Birth children (reproduces current
 *                              behaviour); all returned entries have dashed:false.
 * @returns {Array<{ref: string, dashed: boolean}>}
 */
export const descendantChildRefs = (
  family,
  parentHandle,
  {includeNonBirth}
) => {
  if (!family || !Array.isArray(family.child_ref_list)) return []
  let relationKey
  if (family.father_handle === parentHandle) {
    relationKey = 'frel'
  } else if (family.mother_handle === parentHandle) {
    relationKey = 'mrel'
  } else {
    return []
  }
  const result = []
  for (const childRef of family.child_ref_list) {
    const rel = childRef[relationKey] ?? 'Birth'
    if (includeNonBirth) {
      result.push({ref: childRef.ref, dashed: rel !== 'Birth'})
    } else if (rel === 'Birth') {
      result.push({ref: childRef.ref, dashed: false})
    }
  }
  return result
}
