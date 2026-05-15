import type { RegistryPackageMetadata } from '@/types'
import { access, cp, readFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { confirm } from '@clack/prompts'
import { checkUpdateDependencies } from '@/check'
import { runCliWithOptions } from '@/cli'
import { resolveConfig } from '@/config'
import * as npmModule from '@/npm'
import { createTempDir, removeTempDir } from '../helpers'

vi.mock('@clack/prompts', () => ({
    confirm: vi.fn(),
    isCancel: vi.fn(() => false),
}))

export interface FixtureScenario {
    fixtureEntryPath: string
    args?: string[]
    metadata: Record<string, RegistryPackageMetadata>
    trackedFiles: string[]
    prepareFixture?: (fixtureRoot: string) => Promise<void>
}

export const commonDependencyMetadata: Record<string, RegistryPackageMetadata> = {
    '@types/lodash': { name: '@types/lodash', versions: ['4.14.0', '4.14.191'], distTags: { latest: '4.14.191' } },
    'lodash': { name: 'lodash', versions: ['4.13.19', '4.17.21'], distTags: { latest: '4.17.21' } },
    'multer': { name: 'multer', versions: ['0.1.8', '0.1.9'], distTags: { latest: '0.1.9' } },
    'react-bootstrap': { name: 'react-bootstrap', versions: ['0.22.6', '0.22.7'], distTags: { latest: '0.22.7' } },
    'webpack': { name: 'webpack', versions: ['1.9.10', '1.12.0', '5.101.3', '5.101.5'], distTags: { latest: '5.101.5' } },
}

export const catalogDependencyMetadata: Record<string, RegistryPackageMetadata> = {
    ...commonDependencyMetadata,
    'react': { name: 'react', versions: ['17.0.2', '18.2.0', '18.3.1'], distTags: { latest: '18.3.1' } },
    'react-dom': { name: 'react-dom', versions: ['17.0.2', '18.2.0', '18.3.1'], distTags: { latest: '18.3.1' } },
}

function renderAnnotatedStdout(candidates: Array<{
    catalogName: string | null
    currentSpecifier: string
    filePath: string
    name: string
    nextSpecifier: string
    source: string
}>): string {
    const headers = ['dependencyName', 'current_Version', 'new_Version', 'source', 'catalogName', 'filePath']
    const rows = candidates.map(candidate => [
        candidate.name,
        candidate.currentSpecifier,
        candidate.nextSpecifier,
        candidate.source,
        candidate.catalogName ?? '-',
        candidate.filePath,
    ])

    const widths = headers.map((header, columnIndex) =>
        Math.max(header.length, ...rows.map(row => row[columnIndex]?.length ?? 0)),
    )

    const formatRow = (columns: string[]): string => columns
        .map((column, columnIndex) => column.padEnd(widths[columnIndex] ?? column.length))
        .join(' | ')

    const divider = widths.map(width => '-'.repeat(width)).join('-|-')

    return [
        formatRow(headers),
        divider,
        ...rows.map(formatRow),
    ].join('\n')
}

export function createMetadataLoader(metadata: FixtureScenario['metadata']) {
    return vi.fn(async (packageName: string) => {
        const result = metadata[packageName]
        if (!result)
            throw new Error(`Missing fixture metadata for ${packageName}`)
        return result
    })
}

async function copyFixtureToTemp(fixtureEntryPath: string): Promise<{ fixtureRoot: string, tempDir: string }> {
    const relativeFixturePath = fixtureEntryPath.replace(/^\/+/, '')
    const fixtureRootRelative = dirname(relativeFixturePath)
    const fixtureName = fixtureRootRelative.split('/').at(-1) ?? 'fixture'
    const tempDir = await createTempDir(`bumpkg-fixture-${fixtureName}`)
    const fixtureRoot = join(tempDir, fixtureName)

    await cp(join(process.cwd(), fixtureRootRelative), fixtureRoot, { recursive: true })

    return {
        fixtureRoot,
        tempDir,
    }
}

async function readTrackedFiles(rootDir: string, trackedFiles: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {}

    for (const relativePath of trackedFiles)
        results[relativePath] = await readFile(join(rootDir, relativePath), 'utf8')

    return results
}

async function detectRemovedLocks(rootDir: string): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {}

    for (const fileName of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']) {
        try {
            await access(join(rootDir, fileName))
            results[fileName] = false
        }
        catch {
            results[fileName] = true
        }
    }

    return results
}

export async function runFixtureScenario(scenario: FixtureScenario) {
    const output: string[] = []
    const fetchPackageMetadata = createMetadataLoader(scenario.metadata)
    const { fixtureRoot, tempDir } = await copyFixtureToTemp(scenario.fixtureEntryPath)
    const fixtureEntryPath = join(fixtureRoot, basename(scenario.fixtureEntryPath))
    const includeMajor = scenario.args?.includes('--major') ?? false

    try {
        if (scenario.prepareFixture)
            await scenario.prepareFixture(fixtureRoot)

        const config = await resolveConfig(dirname(fixtureEntryPath))
        const checkResult = await checkUpdateDependencies(config, {
            fetchPackageMetadata,
            includeMajor,
        })
        vi.spyOn(npmModule, 'getPackageMetadata').mockImplementation(fetchPackageMetadata)
        vi.mocked(confirm).mockResolvedValue(true)
        vi.spyOn(console, 'log').mockImplementation((message: string) => output.push(message))
        vi.spyOn(console, 'error').mockImplementation(() => {})

        await runCliWithOptions({
            cwd: dirname(fixtureEntryPath),
            major: scenario.args?.includes('--major') ?? false,
        })

        const candidates = checkResult.candidates.map(candidate => ({
            catalogName: candidate.source.catalogName ?? null,
            currentSpecifier: candidate.currentSpecifier,
            filePath: relative(fixtureRoot, candidate.source.filePath),
            name: candidate.name,
            nextSpecifier: candidate.nextSpecifier,
            source: candidate.source.source,
            updateLevel: candidate.updateLevel,
        }))

        return {
            annotatedStdout: renderAnnotatedStdout(candidates),
            args: scenario.args ?? [],
            candidates,
            fixtureEntryPath: scenario.fixtureEntryPath,
            removedLocks: await detectRemovedLocks(fixtureRoot),
            stdout: output.map(line => line.replaceAll(fixtureRoot, '<fixtureRoot>')),
            trackedFiles: await readTrackedFiles(fixtureRoot, scenario.trackedFiles),
        }
    }
    finally {
        await removeTempDir(tempDir)
    }
}
