import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const endpoint = 'https://equora-kappa.vercel.app/api/maintenance/media-cleanup'
const maxBatches = 4
const maxCompletedPerBatch = 50

export async function runMediaCleanup(value, request = fetch, report = console.log) {
  const bearer = value?.trim()
  if (!bearer || /[\x00-\x1f\x7f]/.test(bearer)) {
    throw new Error('Missing or invalid media maintenance credential.')
  }

  for (let batch = 1; batch <= maxBatches; batch++) {
    let response
    try {
      response = await request(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}` },
        redirect: 'error',
        signal: AbortSignal.timeout(55_000),
      })
    } catch {
      throw new Error('Media cleanup request did not finish. The outcome is unknown.')
    }

    if (response.status !== 200) {
      throw new Error(`Media cleanup returned HTTP ${response.status}.`)
    }

    let result
    try {
      result = await response.json()
    } catch {
      throw new Error('Media cleanup did not return valid JSON.')
    }
    const { ok, completed, pending } = result ?? {}
    if (
      !Number.isSafeInteger(completed) || completed < 0 || completed > maxCompletedPerBatch
      || !Number.isSafeInteger(pending) || pending < 0 || ok !== (pending === 0)
    ) throw new Error('Media cleanup returned invalid counters.')

    report(`Batch ${batch}: completed=${completed}, pending=${pending}`)
    if (pending === 0) return
    if (completed === 0 || batch === maxBatches) {
      report('::warning::Media jobs remain queued for a later run.')
      return
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runMediaCleanup(process.env.EQUORA_MEDIA_MAINTENANCE_BEARER)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
