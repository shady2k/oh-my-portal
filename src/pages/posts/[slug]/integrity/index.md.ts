import type { APIContext } from 'astro';

import { fileHistory, twinHash } from '../../../../history.ts';
import { listPosts, type Post } from '../../../../posts.ts';

/**
 * The markdown twin of the provenance page (R10).
 *
 * It is not a courtesy: an agent checking whether the text it holds is the text
 * we published wants exactly this, and wants it without parsing HTML.
 */
export async function getStaticPaths() {
  const posts = await listPosts();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}

export function GET({ props, site }: APIContext & { props: { post: Post } }) {
  const { post } = props;
  const hash = twinHash(post, site!);
  const revisions = fileHistory(post.filePath);
  const twin = new URL(`/posts/${post.id}.md`, site);

  const lines = [
    `# Провенанс: ${post.data.title}`,
    '',
    `Хеш относится к ${twin}, а не к исходному файлу: публикуется твин, значит хеш о твине.`,
    '',
    '## sha256',
    '',
    hash,
    '',
    `Проверить: curl -s ${twin} | sha256sum`,
    '',
    '## Правки',
    '',
    ...(revisions.length > 0
      ? revisions.map(({ date, hash: commit }) => `- ${date} ${commit}`)
      : ['История недоступна: сборка идёт без git-истории файла.']),
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
