export function normalizeQuizAnswer(value, locale = 'vi') {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/g, (letter) => (letter === 'Đ' ? 'D' : 'd'))
    .toLocaleLowerCase(locale)
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
