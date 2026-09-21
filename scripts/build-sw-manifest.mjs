import { createHash } from 'node:crypto'
import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

async function collectStaticUrls(subdir) {
  const root = path.join('.next/static', subdir)
  const urls = []

  async function walk(relativeDir) {
    let entries
    try {
      entries = await readdir(path.join(root, relativeDir), {
        withFileTypes: true,
      })
    } catch {
      return
    }

    for (const entry of entries) {
      const rel = relativeDir ? path.join(relativeDir, entry.name) : entry.name
      if (entry.isDirectory()) {
        await walk(rel)
      } else {
        urls.push(`/_next/static/${subdir}/${rel.split(path.sep).join('/')}`)
      }
    }
  }

  await walk('')
  return urls.sort()
}

const [chunks, css] = await Promise.all([
  collectStaticUrls('chunks'),
  collectStaticUrls('css'),
])

const urls = [...chunks, ...css]
const hash = createHash('sha256')
  .update(urls.join('\n'))
  .digest('hex')
  .slice(0, 8)
const manifest = {
  cacheName: `hshb-portal-${hash}`,
  urls,
}

await writeFile(
  'public/sw-manifest.json',
  `${JSON.stringify(manifest, null, 2)}\n`,
)

console.log(
  `Wrote public/sw-manifest.json (${urls.length} assets, cache ${manifest.cacheName})`,
)
