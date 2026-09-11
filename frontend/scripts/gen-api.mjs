/**
 * Regenerate the typed API client from the backend's OpenAPI schema.
 *
 *   npm run gen:api                              reads a running server on :8000
 *   OPENAPI_SOURCE=path/to/openapi.json npm run gen:api    reads a file instead
 *
 * CI does neither: it imports `app.main` in Python and writes `openapi.json`
 * directly, so the drift check needs no server and no database. Whichever source
 * is used, `src/api/schema.d.ts` must come out byte-identical -- that identity is
 * the whole point of the check.
 */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = process.env.OPENAPI_SOURCE ?? 'http://localhost:8000/openapi.json'
const SCHEMA_JSON = resolve(ROOT, 'openapi.json')
const SCHEMA_TYPES = resolve(ROOT, 'src/api/schema.d.ts')

async function readSchema() {
  if (!/^https?:\/\//.test(SOURCE)) {
    return JSON.parse(await readFile(resolve(ROOT, SOURCE), 'utf8'))
  }
  try {
    const response = await fetch(SOURCE)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return await response.json()
  } catch (cause) {
    throw new Error(
      `Could not read the schema from ${SOURCE}.\n` +
        `Start the backend first:\n` +
        `  cd backend && uvicorn app.main:app --reload\n` +
        `or point at a file with OPENAPI_SOURCE=...\n` +
        `(${cause instanceof Error ? cause.message : String(cause)})`,
    )
  }
}

const schema = await readSchema()
const pathCount = Object.keys(schema.paths ?? {}).length
const schemaCount = Object.keys(schema.components?.schemas ?? {}).length
if (pathCount === 0) throw new Error('The schema has no paths. Refusing to generate from it.')

await writeFile(SCHEMA_JSON, `${JSON.stringify(schema, null, 2)}\n`, 'utf8')
// Run the CLI's JS entry point with this same Node binary. `npx` with
// `shell: true` warns about unescaped arguments, and Windows cannot execFile a
// `.cmd` shim without a shell -- calling the script directly sidesteps both.
const cli = resolve(ROOT, 'node_modules/openapi-typescript/bin/cli.js')
execFileSync(process.execPath, [cli, SCHEMA_JSON, '-o', SCHEMA_TYPES], { stdio: 'inherit' })

console.log(`\nGenerated src/api/schema.d.ts from ${pathCount} paths, ${schemaCount} schemas.`)
