/**
 * Localized headers for "distant" relatives categories (Relatives / "Родня" page).
 *
 * The backend `kinship.py::_classify()` emits parametrized `category_key`
 * values (e.g. `ancestors_6`, `cousins_2_removed_3`) for generations beyond
 * the close-family core that `CATEGORY_LABEL_MAP` in `GrampsjsRelatives.js`
 * covers. This module builds a natural-language header for those keys, for
 * Russian and English only — every other language keeps falling through to
 * the generic "Distant relatives" map entry (zero regression).
 *
 * It also **intentionally overrides** three keys that already exist in
 * `CATEGORY_LABEL_MAP` (`cousins_1_removed_1`, `cousins_1_removed_2`,
 * `cousins_2_removed_1`) with a clearer descriptive RU/EN phrasing. This is a
 * deliberate improvement approved in the design spec, not a bug — see
 * `docs/superpowers/specs/2026-07-16-relatives-distant-labels-design.md`.
 *
 * `buildDistantLabel(key, lang)` is a pure function: given a category key and
 * a language code, it returns a header string, or `null` when the key/lang
 * combination is not handled (caller should fall back to the existing map).
 */

/**
 * Russian "пра-" prefix for a given generation count.
 * Spelled out through count 3, compact `N-пра-` from count 4.
 * @param {number} count
 * @returns {string}
 */
function praRu(count) {
  if (count <= 0) return ''
  if (count === 1) return 'пра'
  if (count === 2) return 'прапра'
  if (count === 3) return 'прапрапра'
  return `${count}-пра-`
}

const NUM_RU = {
  2: 'дво',
  3: 'тро',
  4: 'четверо',
  5: 'пяти',
  6: 'шести',
  7: 'семи',
  8: 'восьми',
  9: 'девяти',
  10: 'десяти',
  11: 'одиннадцати',
  12: 'двенадцати',
  13: 'тринадцати',
  14: 'четырнадцати',
  15: 'пятнадцати',
  16: 'шестнадцати',
  17: 'семнадцати',
  18: 'восемнадцати',
  19: 'девятнадцати',
  20: 'двадцати',
}

/**
 * Russian multiplier prefix used for "N-юродные братья и сёстры" (cousins).
 * @param {number} k
 * @returns {string}
 */
function numRu(k) {
  if (NUM_RU[k]) return NUM_RU[k]
  return `${k}-`
}

const ORD_EN = {
  1: 'First',
  2: 'Second',
  3: 'Third',
  4: 'Fourth',
  5: 'Fifth',
  6: 'Sixth',
  7: 'Seventh',
  8: 'Eighth',
  9: 'Ninth',
  10: 'Tenth',
  11: 'Eleventh',
  12: 'Twelfth',
  13: 'Thirteenth',
  14: 'Fourteenth',
  15: 'Fifteenth',
  16: 'Sixteenth',
  17: 'Seventeenth',
  18: 'Eighteenth',
  19: 'Nineteenth',
  20: 'Twentieth',
}

/**
 * English ordinal word ("First".."Twentieth"), falling back to the numeric
 * form (`ordSuffix`) beyond the table.
 * @param {number} n
 * @returns {string}
 */
function ord(n) {
  if (ORD_EN[n]) return ORD_EN[n]
  return ordSuffix(n)
}

/**
 * Numeric English ordinal ("1st", "2nd", "3rd", "4th", ...).
 * @param {number} n
 * @returns {string}
 */
function ordSuffix(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}

/**
 * English "removed" suffix for cousins.
 * @param {number} m
 * @returns {string}
 */
function removedEn(m) {
  if (m === 1) return 'once removed'
  if (m === 2) return 'twice removed'
  if (m === 3) return 'three times removed'
  return `${m} times removed`
}

/**
 * Standard Russian plural selection (mod-10 / mod-100 rules).
 * @param {number} n
 * @param {string} one
 * @param {string} few
 * @param {string} many
 * @returns {string}
 */
function pluralRu(n, one, few, many) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = n % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/**
 * Uppercase the first alphabetic character of a string. If the string starts
 * with a non-letter (e.g. a digit, as in compact "4-пра-..." or "2nd..."
 * forms), it is returned unchanged.
 * @param {string} s
 * @returns {string}
 */
function capitalizeFirst(s) {
  if (!s) return s
  const first = s.charAt(0)
  if (!/[a-zA-Zа-яА-ЯёЁ]/.test(first)) return s
  return first.toUpperCase() + s.slice(1)
}

/**
 * Build the RU/EN label for the direct ancestor/descendant lines
 * (`ancestors_N` / `descendants_N`), which share the same shape.
 * @param {number} c - great-count (N - 2)
 * @param {string} lang - 'ru' | 'en'
 * @param {{ruBase1: string, ruBase2: string, enWord: string}} words
 * @returns {string}
 */
function directLineLabel(c, lang, words) {
  const {ruBase1, ruBase2, enWord} = words
  if (lang === 'ru') {
    if (c <= 3) return `${praRu(c)}${ruBase1} и ${praRu(c)}${ruBase2}`
    return `${c}-пра-${ruBase1} и ${ruBase2}`
  }
  return `${ordSuffix(c)} great-${enWord}`
}

/**
 * Build the RU/EN label for the collateral "great-uncle/aunt" and
 * "great-niece/nephew" lines, which share the same shape.
 * @param {number} c - great-count (M - 1)
 * @param {string} lang - 'ru' | 'en'
 * @param {{ruBase1: string, ruBase2: string, enPlural: string}} words
 * @returns {string}
 */
function collateralLineLabel(c, lang, words) {
  const {ruBase1, ruBase2, enPlural} = words
  if (lang === 'ru') {
    if (c <= 3) {
      return `Двоюродные ${praRu(c)}${ruBase1} и ${praRu(c)}${ruBase2}`
    }
    return `Двоюродные ${c}-пра-${ruBase1} и ${ruBase2}`
  }
  if (c === 0) return `Great-${enPlural}`
  return `${ordSuffix(c + 1)} great-${enPlural}`
}

/**
 * Build a localized header string for a "distant relatives" category_key.
 *
 * @param {string} key - stable category_key emitted by the backend
 * @param {string} lang - current UI language code (e.g. 'ru', 'en-US')
 * @returns {?string} the localized header, or null when this key/lang is not
 *   handled (caller should fall back to CATEGORY_LABEL_MAP / "Distant relatives")
 */
export function buildDistantLabel(key, lang) {
  const l = (lang || '').toLowerCase()
  let effLang = null
  if (l.startsWith('ru')) effLang = 'ru'
  else if (l.startsWith('en')) effLang = 'en'
  if (!effLang) return null

  let m = /^ancestors_(\d+)$/.exec(key)
  if (m) {
    const n = Number(m[1])
    if (n < 4) return null
    const c = n - 2
    return capitalizeFirst(
      directLineLabel(c, effLang, {
        ruBase1: 'дедушки',
        ruBase2: 'бабушки',
        enWord: 'grandparents',
      })
    )
  }

  m = /^descendants_(\d+)$/.exec(key)
  if (m) {
    const n = Number(m[1])
    if (n < 4) return null
    const c = n - 2
    return capitalizeFirst(
      directLineLabel(c, effLang, {
        ruBase1: 'внуки',
        ruBase2: 'внучки',
        enWord: 'grandchildren',
      })
    )
  }

  m = /^great_uncle_aunt_(\d+)$/.exec(key)
  if (m) {
    const mm = Number(m[1])
    if (mm < 1) return null
    const c = mm - 1
    return capitalizeFirst(
      collateralLineLabel(c, effLang, {
        ruBase1: 'дедушки',
        ruBase2: 'бабушки',
        enPlural: 'uncles and great-aunts',
      })
    )
  }

  m = /^great_niece_nephew_(\d+)$/.exec(key)
  if (m) {
    const mm = Number(m[1])
    if (mm < 1) return null
    const c = mm - 1
    return capitalizeFirst(
      collateralLineLabel(c, effLang, {
        ruBase1: 'внуки',
        ruBase2: 'внучки',
        enPlural: 'nieces and great-nephews',
      })
    )
  }

  m = /^cousins_(\d+)_removed_(\d+)$/.exec(key)
  if (m) {
    const n = Number(m[1])
    const mm = Number(m[2])
    if (n < 1 || mm < 1) return null
    if (effLang === 'ru') {
      const generations = pluralRu(mm, 'поколение', 'поколения', 'поколений')
      return capitalizeFirst(
        `${numRu(n + 1)}юродные братья и сёстры, +${mm} ${generations}`
      )
    }
    return capitalizeFirst(`${ord(n)} cousins ${removedEn(mm)}`)
  }

  m = /^cousins_(\d+)$/.exec(key)
  if (m) {
    const n = Number(m[1])
    if (n < 4) return null
    if (effLang === 'ru') {
      return capitalizeFirst(`${numRu(n + 1)}юродные братья и сёстры`)
    }
    return capitalizeFirst(`${ord(n)} cousins`)
  }

  return null
}
