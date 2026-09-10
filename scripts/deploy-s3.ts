#!/usr/bin/env node
/**
 * Publish a build to S3-compatible object storage behind a CDN.
 *
 *   node scripts/deploy-s3.ts <dist> <bucket> [--endpoint URL] [--dry-run]
 *
 * Credentials come from the environment the AWS CLI already reads
 * (`AWS_PROFILE`, or the access key pair). Nothing site-specific is written
 * here: the bucket is an argument, the endpoint is an argument, and purging the
 * CDN afterwards is the caller's step because the CDN is not part of the
 * storage API.
 *
 * Four things this does that a bare `aws s3 sync` does not, each of which has
 * already gone wrong once in this project:
 *
 * 1. **`Cache-Control` per kind of file.** The CDN is configured to respect the
 *    origin's header, so whatever is set here IS the cache policy. HTML and the
 *    twins get minutes — a new article has to appear promptly. Images, fonts
 *    and stylesheets get a month, because their content decides their name or
 *    they never change.
 * 2. **`Content-Type` for `.md`.** No standard mime table has it, so the CLI
 *    would ship the markdown twins as `application/octet-stream` and every
 *    Cyrillic twin would arrive as mojibake. That failure is invisible in a
 *    browser and total for an agent.
 * 3. **Delete last.** Uploads first, removals afterwards. `--delete` in the
 *    same pass opens a window where a visitor gets a 404 for a page that both
 *    versions of the site contain.
 * 4. **No streaming checksum.** The CLI's default upload framing leaves
 *    `Content-Encoding: aws-chunked` on every object here, and a CDN will not
 *    compress a response that already declares an encoding — so the whole site
 *    shipped uncompressed and nothing said so. See `CHECKSUM_ENV` below.
 *
 * Every object is written `public-read`. The bucket policy grants `GetObject`
 * for the site to work at all, and the object ACL is additionally required for
 * the front page: measured, not assumed — see `br` issue vk-hosting-findings.
 */
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const endpointAt = argv.indexOf('--endpoint');
const endpoint = endpointAt === -1 ? undefined : argv[endpointAt + 1];
const [dist, bucket] = argv.filter((a, i) => !a.startsWith('--') && i !== endpointAt + 1);

if (!dist || !bucket) {
  console.error('usage: deploy-s3.ts <dist> <bucket> [--endpoint URL] [--dry-run]');
  process.exit(2);
}

/** Minutes, not days: this is how fast a new article reaches a reader. */
const SHORT = 'public, max-age=300, must-revalidate';
/** A month. These change name when they change content, or never change. */
const LONG = 'public, max-age=2592000, immutable';

type Pass = {
  what: string;
  include: string[];
  /**
   * Keys a later pass must not touch.
   *
   * Passes overwrite each other: a generic `*.xml` pass running after the feeds
   * pass re-uploads the same objects and the CLI guesses `text/xml` again,
   * undoing the type that was just set. That happened, it was invisible in the
   * upload log, and it made the ordering of this list load-bearing. Stating the
   * exclusions removes the dependency on order.
   */
  exclude?: string[];
  cacheControl: string;
  contentType?: string;
};

/*
 * The first pass takes EVERYTHING, and that is the important one.
 *
 * This list used to be an allowlist of extensions, and an allowlist silently
 * drops whatever nobody thought of: the Pagefind index ships as `.pf_index`,
 * `.pf_fragment`, `.pf_meta` and `.wasm`, none of which were named, so search
 * was simply missing from the deployed site while every upload log looked
 * healthy. A build artefact that is not uploaded produces no error anywhere —
 * the page just quietly does less than it should.
 *
 * So: copy the whole tree under a safe default, then let the later passes
 * correct the metadata of the kinds that need something else. Later passes win,
 * because they run later.
 */
const passes: Pass[] = [
  {
    what: 'всё, что собралось',
    include: ['*'],
    cacheControl: SHORT,
  },
  {
    what: 'картинки, шрифты, стили и скрипты',
    include: ['*.webp', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.svg', '*.avif', '*.woff2', '*.woff', '*.css', '*.js'],
    cacheControl: LONG,
  },
  {
    what: 'markdown-твины',
    include: ['*.md'],
    cacheControl: SHORT,
    contentType: 'text/markdown; charset=utf-8',
  },
  {
    what: 'ленты',
    include: ['rss/index.xml', 'feeds/*.xml'],
    cacheControl: SHORT,
    contentType: 'application/rss+xml; charset=utf-8',
  },
  {
    what: 'страницы, карта сайта и индексы',
    include: ['*.html', '*.json', '*.xml', '*.txt'],
    exclude: ['rss/index.xml', 'feeds/*.xml'],
    cacheControl: SHORT,
  },
];

/**
 * Why the checksum default is turned off, and it is not a micro-optimisation.
 *
 * From v2.23 the CLI calculates a checksum on every upload by default
 * (`request_checksum_calculation = when_supported`) and streams it, which means
 * sending `Content-Encoding: aws-chunked` on the request. AWS consumes that
 * header. This storage keeps it, as object metadata, and then returns it on
 * every GET — and a CDN will not compress a response that already declares an
 * encoding.
 *
 * The result was a site where **nothing was compressed at all**, invisibly: the
 * page rendered correctly and merely weighed three times what it should. It
 * took `curl -I -H 'Accept-Encoding: gzip'` to see it, because a browser gives
 * no sign. Measured on a 7129-byte text object: 7129 bytes over the wire with
 * the default, 2346 with this variable set.
 *
 * `when_required` is the pre-2.23 behaviour: checksums where the protocol needs
 * them, no streaming wrapper on an ordinary upload.
 *
 * Enabling gzip on the CDN is the other half and neither half works alone.
 */
const CHECKSUM_ENV = { AWS_REQUEST_CHECKSUM_CALCULATION: 'when_required' };

const aws = (args: string[]) => {
  const full = endpoint ? ['--endpoint-url', endpoint, ...args] : args;
  if (dryRun) return console.log(`  aws ${full.join(' ')}`);
  execFileSync('aws', full, { stdio: 'inherit', env: { ...process.env, ...CHECKSUM_ENV } });
};

/*
 * `cp --recursive`, not `sync`, and this is not a preference.
 *
 * `sync` decides what to upload by comparing size and modification time. A
 * change to `Content-Type` or `Cache-Control` alters neither, so a policy
 * change silently fails to reach every object already in the bucket — which is
 * exactly how the feeds stayed `text/xml` after this script was taught to send
 * `application/rss+xml`. The metadata IS the cache policy here, since the CDN
 * was configured to respect the origin's headers; a policy that applies only to
 * files that happened to change is not a policy.
 *
 * The site is under two megabytes. Re-uploading it costs a second and removes
 * a whole class of failure that is invisible until someone measures it.
 */
for (const pass of passes) {
  console.log(`\n→ ${pass.what}`);
  aws([
    's3', 'cp', dist, `s3://${bucket}`, '--recursive',
    '--acl', 'public-read',
    '--cache-control', pass.cacheControl,
    ...(pass.contentType ? ['--content-type', pass.contentType] : []),
    '--exclude', '*',
    ...pass.include.flatMap((glob) => ['--include', glob]),
    ...(pass.exclude ?? []).flatMap((glob) => ['--exclude', glob]),
  ]);
}

/*
 * Anything the build no longer contains. Last, and on its own: a removal that
 * races an upload is a 404 for a page that exists in both versions.
 */
/*
 * No `--exclude` here, and that was a bug worth writing down: the CLI's filters
 * apply to the destination as well as the source, so `--delete --exclude '*'`
 * reads as "delete the things I just told you to ignore" and removes nothing at
 * all. Stale hashed stylesheets and files from an earlier experiment sat in the
 * bucket through several deploys while this line looked like it was cleaning up.
 *
 * Everything was uploaded a moment ago, so this pass transfers nothing; it
 * exists only for the removals.
 */
console.log('\n→ удаление того, чего больше нет в сборке');
aws(['s3', 'sync', dist, `s3://${bucket}`, '--delete']);

/*
 * R2: `/rss/` serves the feed at the address it has always had, and NOT through
 * a redirect — subscribers' readers hold that URL and a 301 is a different
 * thing to a feed reader than to a browser.
 *
 * Object storage resolves a directory address by appending the site's single
 * index document name, which is `index.html`. Astro writes `rss/index.xml`, so
 * `/rss/` finds nothing. A routing rule could redirect it, which R2 forbids.
 *
 * So the feed is written a second time under the name the index resolver looks
 * for. The name is a lie and the `Content-Type` is the truth — storage serves
 * what the metadata says, not what the extension suggests, and this is the one
 * place in the deploy where those two disagree on purpose.
 *
 * After the delete pass, deliberately: this key is not in `dist`, so a sync
 * with `--delete` running afterwards would remove it every single time.
 */
console.log('\n→ /rss/ под именем, которое ищет резолвер индекса');
aws([
  's3', 'cp', `${dist}/rss/index.xml`, `s3://${bucket}/rss/index.html`,
  '--acl', 'public-read',
  '--cache-control', SHORT,
  '--content-type', 'application/rss+xml; charset=utf-8',
]);

console.log(`\nЗалито. CDN всё ещё отдаёт прежнее — очистка кэша это отдельный шаг,
и делать её надо ПОСЛЕ заливки: край перекэширует то, что видит в момент чистки.`);
