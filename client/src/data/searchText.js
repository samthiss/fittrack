/**
 * Comparable form of a name for searching: lowercase, ligatures spelled out, accents dropped.
 *
 * Without it a search only ever matches what the user can reproduce exactly — typing "oeuf"
 * found nothing at all, because the catalogue writes "Œuf", and neither did "epinard" or "pates".
 * On a phone keyboard, the accented form is the one people don't type.
 */
export function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    // NFD splits accents off their letter but leaves ligatures whole, so those are spelled out first.
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Whether `haystack` contains `needle`, both compared accent- and ligature-insensitively. */
export function matchesSearch(haystack, needle) {
  return normalizeSearch(haystack).includes(normalizeSearch(needle));
}
