// Match the visitor's ordered language preferences to the two available locales.
export function browserLanguage(navigator = {}) {
 const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
 for (const language of languages) {
  const code = String(language || '').toLowerCase().split(/[-_]/)[0];
  if (code === 'fr' || code === 'en') return code;
 }
 return 'en';
}
