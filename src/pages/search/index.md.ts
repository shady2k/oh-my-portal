import type { APIContext } from 'astro';

/**
 * `/search/index.md` — the markdown half of the search page.
 *
 * There is nothing to search from here: the index is read in a browser. The
 * honest answer for a client that negotiated markdown is to name the two
 * endpoints that do the same job in one request, which is faster than a search
 * box would have been anyway.
 */
export function GET({ site }: APIContext) {
  const at = (path: string) => new URL(path, site!).href;
  const body = `# Поиск

Поиск по сайту работает на индексе, который читается в браузере, поэтому здесь
его нет.

Для программного доступа есть более прямые пути:

- ${at('/index.json')} — весь каталог одним запросом, фильтруйте локально
- ${at('/llms.txt')} — карта сайта со ссылками на markdown каждой записи
- ${at('/llms-full.txt')} — все записи целиком
`;
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
