/** Case- and diacritic-insensitive form for search ('Chūō' matches 'chuo'). */
export const norm = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
