/** Os termos de uso e as políticas da GlobalFly (27/10/2026): src/termos/globalfly/*.md, como texto. */
export const ARQUIVOS_DOS_TERMOS = import.meta.glob('/src/termos/globalfly/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
