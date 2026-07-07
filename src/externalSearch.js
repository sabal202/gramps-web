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

// A string is "Latin" if it has a Latin letter and no Cyrillic letter.
export const isLatinScript = str =>
  /[A-Za-z]/.test(str || '') && !/[А-Яа-яЁёІіЇїЄєҐґЎўЂђЈј]/.test(str || '')

// From the primary name plus any alternate names, return the first Name whose
// family surname (or given name) is written in Latin script, or null.
export const pickLatinName = person => {
  const names = [
    person?.primary_name,
    ...(person?.alternate_names ?? []),
  ].filter(Boolean)
  return (
    names.find(n => {
      const {familySurname, given} = getNameParts(n)
      return isLatinScript(familySurname) || isLatinScript(given)
    }) || null
  )
}

const extractYear = dateStr => {
  const m = String(dateStr || '').match(/\d{4}/)
  return m ? m[0] : ''
}

// Build the full substitution dict from a person object (`this.data` in
// GrampsjsPerson: has `primary_name`, `alternate_names` and a `profile`).
export const buildExternalSearchData = data => {
  const primary = getNameParts(data?.primary_name)
  const latinName = pickLatinName(data)
  const latin = latinName
    ? getNameParts(latinName)
    : {given: '', familySurname: '', patronymic: ''}
  const profile = data?.profile ?? {}
  const given = profile.name_given || primary.given
  return {
    // primary spelling (as entered — Cyrillic for this tree)
    name_given: given,
    name_surname: profile.name_surname || primary.familySurname,
    name_family_surname: primary.familySurname,
    name_patronymic: primary.patronymic,
    name_middle: given.split(' ')[1] || '',
    // Latin variants from an alternate name ('' when none is recorded)
    name_given_latin: latin.given,
    name_family_surname_latin: latin.familySurname,
    name_patronymic_latin: latin.patronymic,
    // shared
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
