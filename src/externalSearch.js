/*
Pure helpers that build the substitution data used by External Search
(GrampsjsFormExternalSearch) from a person object.

A Gramps Name object has `first_name` and a `surname_list`, where each entry is
`{surname, origintype, prefix, connector}`. A surname whose `origintype` is
`'Patronymic'` is the отчество (patronymic); the rest form the family surname.

For CIS/Slavic research the patronymic and a clean family surname (without the
patronymic mixed in) matter, and Latin-script sites (e.g. Polish Geneteka) need
the Latin spelling of a surname — which is an orthographic form (Соболевский →
Sobolewski), not a transliteration. Rather than guess it, we read it from an
alternate name recorded in Latin script on the person.
*/

const joinSurnames = (surnameList, patronymic) =>
  (surnameList || [])
    .filter(s =>
      patronymic ? s.origintype === 'Patronymic' : s.origintype !== 'Patronymic'
    )
    .map(s => s.surname)
    .filter(Boolean)
    .join(' ')

// Split a Name object into given / family surname / patronymic.
export const getNameParts = name => {
  const surnameList = name?.surname_list ?? []
  return {
    given: name?.first_name || '',
    familySurname: joinSurnames(surnameList, false),
    patronymic: joinSurnames(surnameList, true),
  }
}

// A string is "Latin" if it has a Latin-script letter (incl. Polish/Baltic
// diacritics like ł ż ą ś) and no Cyrillic letter.
export const isLatinScript = str =>
  /[A-Za-zÀ-ɏ]/.test(str || '') && !/[А-Яа-яЁёІіЇїЄєҐґЎўЂђЈј]/.test(str || '')

// All of a person's names, primary first, in stored order.
export const getPersonNames = person =>
  [person?.primary_name, ...(person?.alternate_names ?? [])].filter(Boolean)

const isLatinName = name => {
  const {familySurname, given} = getNameParts(name)
  return isLatinScript(familySurname) || isLatinScript(given)
}

// From the primary name plus any alternate names, return the first Name whose
// family surname (or given name) is written in Latin script, or null.
export const pickLatinName = person =>
  getPersonNames(person).find(isLatinName) || null

const extractYear = dateStr => {
  const m = String(dateStr || '').match(/\d{4}/)
  return m ? m[0] : ''
}

// Build the substitution dict for a specific name of the person. Name fields
// come from `name` (so an alternate/maiden name can be searched, not just the
// active one); years and place come from the person `profile` (name-independent).
// Latin variants use `name` itself if it is Latin-script, else any Latin
// alternate name on the person.
export const buildExternalSearchDataForName = (name, data) => {
  const parts = getNameParts(name)
  const allSurnames = (name?.surname_list ?? [])
    .map(s => s.surname)
    .filter(Boolean)
    .join(' ')
  const latinName = isLatinName(name) ? name : pickLatinName(data)
  const latin = latinName
    ? getNameParts(latinName)
    : {given: '', familySurname: '', patronymic: ''}
  const profile = data?.profile ?? {}
  return {
    // spelling as entered on the chosen name (Cyrillic for this tree)
    name_given: parts.given,
    name_surname: allSurnames,
    name_family_surname: parts.familySurname,
    name_patronymic: parts.patronymic,
    name_middle: parts.given.split(' ')[1] || '',
    // Latin variants ('' when the person has no Latin-script name)
    name_given_latin: latin.given,
    name_family_surname_latin: latin.familySurname,
    name_patronymic_latin: latin.patronymic,
    // shared, name-independent
    place_name:
      profile?.birth?.place_name ||
      profile?.birth?.place ||
      profile?.death?.place_name ||
      profile?.death?.place ||
      '',
    birth_year: extractYear(profile?.birth?.date),
    death_year: extractYear(profile?.death?.date),
  }
}

// Build the substitution dict from a person object using the active (primary)
// name — the default when no specific name is chosen.
export const buildExternalSearchData = data =>
  buildExternalSearchDataForName(data?.primary_name, data)

// Produce the variable dict to interpolate for one site. Latin-script sites get
// the Latin name variants mapped onto the plain template variables, so a site
// template can just use {{name_family_surname}} regardless of script.
export const resolveSiteData = (searchData, script) => {
  if (script !== 'latin') return searchData
  return {
    ...searchData,
    name_given: searchData.name_given_latin,
    name_surname: searchData.name_family_surname_latin,
    name_family_surname: searchData.name_family_surname_latin,
    name_patronymic: searchData.name_patronymic_latin,
  }
}
