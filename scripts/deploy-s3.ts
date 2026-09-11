#!/usr/bin/env node
/**
 * Publish a build to S3-compatible object storage behind a CDN.
 *
 *   node scripts/deploy-s3.ts <dist> <bucket> [--endpoint URL] [--redirects <manifest.json>] [--dry-run]
 *
 * `--redirects` takes the manifest `gen-redirects.ts --format s3` writes: the
 * old addresses, uploaded as zero-byte redirect objects.
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
 *    twins get minutes — a new article has to appear promptly. Only `_astro/`
 *    gets a month, because only there does the content decide the name.
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
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    endpoint: { type: 'string' },
    redirects: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const [dist, bucket] = positionals;
const { endpoint, redirects: manifest } = values;
const dryRun = values['dry-run'];

if (!dist || !bucket) {
  console.error('usage: deploy-s3.ts <dist> <bucket> [--endpoint URL] [--redirects <manifest.json>] [--dry-run]');
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
    /*
     * `_astro/` and nothing else. Its names are content hashes, so a month of
     * `immutable` is safe there. Content images, `og.png`, the favicon and
     * Pagefind's loader keep their names when they change: a month on them is a
     * month of a replaced picture nobody can see, and the pipeline has no purge
     * step to fix it. They stay on the first pass's SHORT.
     */
    what: 'хэшированные ассеты сборки',
    include: ['_astro/*'],
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
 * The old addresses, as objects — before the delete pass, and excluded from it.
 *
 * These keys are not in `dist`, so a `sync --delete` removes every one of them.
 * Uploading them afterwards is not enough: between the delete and the re-upload
 * every old address answers 403, on every deploy, for as long as the uploads
 * take. So the delete pass is told to leave them alone, and a redirect that has
 * left the manifest — an alias removed — is not excluded and goes, as it should.
 */
const objects: { key: string; location: string }[] = manifest
  ? JSON.parse(readFileSync(manifest, 'utf8'))
  : [];
if (objects.length) console.log(`\n→ редиректы старых адресов: ${objects.length} объектов`);
for (const { key, location } of objects) {
  aws([
    's3api', 'put-object',
    '--bucket', bucket,
    '--key', key,
    '--acl', 'public-read',
    '--website-redirect-location', location,
    '--cache-control', SHORT,
  ]);
}

/*
 * Anything the build no longer contains. After the uploads, and on its own: a
 * removal that races an upload is a 404 for a page that exists in both versions.
 *
 * The CLI's filters apply to the destination as well as the source. That was
 * once a bug here — `--delete --exclude '*'` reads as "delete the things I just
 * told you to ignore" and removed nothing at all, while stale files sat in the
 * bucket through several deploys. The same rule is what spares the keys below:
 * each `--exclude` names an object this deploy put in the bucket on purpose and
 * that `dist` does not contain.
 *
 * Everything was uploaded a moment ago, so this pass transfers nothing; it
 * exists only for the removals.
 */
/*
 * `_astro/*` is spared too. Its names are content hashes, so an old stylesheet
 * never collides with a new one and is only ever requested by old HTML — and old
 * HTML outlives every deploy in some cache: a browser for the minutes SHORT
 * allows, a CDN that ignores max-age for days. Deleting the previous build's
 * hashed files turned a cached /archive/ into an unstyled page whose CSS answered
 * 403. Keeping them costs a few kilobytes per deploy that changes a stylesheet.
 */
const keep = ['rss/index.html', '_astro/*', ...objects.map((o) => o.key)];
console.log('\n→ удаление того, чего больше нет в сборке');
aws(['s3', 'sync', dist, `s3://${bucket}`, '--delete', ...keep.flatMap((k) => ['--exclude', k])]);

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
 * The key is not in `dist`, so the delete pass above is told to spare it — without
 * that, every deploy removed the feed and put it back, and for the seconds in
 * between every subscriber's reader got a 404.
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
