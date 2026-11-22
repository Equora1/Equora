import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SetupExplorer } from '@/components/setups/setup-explorer'
import { setupDetails, setupLibrary, setupRows, trades } from '@/lib/data/mock-data'
import type { SetupMediaRow } from '@/lib/types/db'
import { buildDynamicSetupDetail, buildSavedSetups, buildSetupLibraryFromSources } from '@/lib/utils/setup-analytics'

describe('setup actions and example images', () => {
  const title = setupLibrary[0].title
  const own = { ...setupRows[0], id: 'personal', user_id: 'test-author', is_master: false }
  const shared = { ...own, id: 'shared', user_id: 'test-admin', is_master: true }
  const history = [{ ...trades[0], setup: title }]

  it('keeps a personal setup ID and description when the same title occurs in trades or shared templates', () => {
    const library = buildSetupLibraryFromSources(setupLibrary, [own, shared], history)
    expect(library.find((setup) => setup.title === title)).toMatchObject({
      setupId: own.id, isPersonal: true, isMaster: false, description: own.description,
    })
  })

  it('offers the image and delete shortcuts for the selected persisted personal setup', () => {
    const library = buildSetupLibraryFromSources(setupLibrary, [own, shared], history)
    const html = renderToStaticMarkup(<SetupExplorer setupLibrary={library} setupDetails={setupDetails}
      trades={history} savedSetups={buildSavedSetups([shared, own], [], [])} setupPerformanceRows={[]} />)
    expect(html).toContain('Bilder hinzufügen')
    expect(html).toContain('Setup löschen')
  })

  it('offers a copy instead of deleting a shared setup seen by a regular account', () => {
    const library = buildSetupLibraryFromSources(setupLibrary, [shared], history)
    const html = renderToStaticMarkup(<SetupExplorer setupLibrary={library} setupDetails={setupDetails}
      trades={history} savedSetups={buildSavedSetups([shared], [], [])} setupPerformanceRows={[]} />)
    expect(html).toContain('Als eigenes Setup kopieren')
    expect(html).not.toContain('Setup löschen')
  })

  it('shows the first uploaded example as the cover if no uploaded picture is marked as cover', () => {
    const media = {
      id: 'sample', public_url: '/sample.png', is_cover: false, sort_order: 0,
    } as SetupMediaRow
    const detail = buildDynamicSetupDetail(setupDetails[title], [], own, [media])
    expect(detail?.coverImage).toBe('/sample.png')
    expect(detail?.exampleImages).toEqual(['/sample.png'])
  })

  it('provides seven distinct bundled PNGs for the six templates', () => {
    const paths = setupLibrary.flatMap(({ title: name }) => {
      const detail = setupDetails[name]
      expect(detail.coverImage).toMatch(/^\/setup-images\//)
      expect(detail.exampleImages).toContain(detail.coverImage)
      return detail.exampleImages ?? []
    })
    const hashes = paths.map((path) => {
      const bytes = readFileSync(join(process.cwd(), 'public', path.slice(1)))
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1920, 1080])
      return createHash('sha256').update(bytes).digest('hex')
    })
    expect(new Set(hashes).size).toBe(7)
  })
})
