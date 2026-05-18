import type { RegistryPackageMetadata } from '@/types'
import { access, cp, readFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { confirm } from '@clack/prompts'
import semver from 'semver'
import { checkUpdateDependencies } from '@/check'
import { formatCandidateNextVersion, runCliWithOptions } from '@/cli-runner'
import { resolveConfig } from '@/config'
import * as npmModule from '@/npm'
import { getDependencyTypes } from '@/utils'
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

function createArgs(cwd: string) {
    return {
        c: '',
        cwd,
        major: false,
        _: [''],
    }
}

export const commonDependencyMetadata: Record<string, RegistryPackageMetadata> = {
    '@types/lodash': { name: '@types/lodash', versions: ['4.14.0', '4.14.191'], distTags: { latest: '4.14.191' } },
    'lodash': { name: 'lodash', versions: ['4.13.19', '4.17.21'], distTags: { latest: '4.17.21' } },
    'multer': { name: 'multer', versions: ['0.1.8', '0.1.9'], distTags: { latest: '0.1.9' } },
    'react-dom': { name: 'react-dom', versions: ['18.2.0', '18.3.1'], distTags: { latest: '18.3.1' } },
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
    dependencyTypes: string[]
    filePath: string
    name: string
    nextSpecifier: string
    availableMajorNodeRequirement?: string
    availableMajorVersion?: string
    source: string
    targetNodeRequirement?: string
}>): string {
    const showCatalogColumns = candidates.some(candidate => candidate.source === 'catalog' || candidate.source === 'catalogs')
    const headers = showCatalogColumns
        ? ['dependencyName', 'currentVersion', 'newVersion', 'dependencyType', 'source', 'catalogName', 'filePath']
        : ['dependencyName', 'currentVersion', 'newVersion', 'dependencyType', 'filePath']
    const rows = candidates.map((candidate) => {
        const baseColumns = [
            candidate.name,
            candidate.currentSpecifier,
            formatCandidateNextVersion(candidate),
            candidate.dependencyTypes.join(', ') || '-',
        ]

        if (!showCatalogColumns)
            return [...baseColumns, candidate.filePath]

        const isCatalogCandidate = candidate.source === 'catalog' || candidate.source === 'catalogs'

        return [
            ...baseColumns,
            isCatalogCandidate ? candidate.source : '-',
            isCatalogCandidate ? (candidate.catalogName ?? '-') : '-',
            candidate.filePath,
        ]
    })

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

export function createVersionResolutionLoader(metadata: FixtureScenario['metadata']) {
    return vi.fn(async (queries: readonly { name: string, specifier: string }[]) => {
        return queries.map(({ name, specifier }) => {
            const result = metadata[name]
            if (!result)
                throw new Error(`Missing fixture metadata for ${name}`)

            const stableVersions = result.versions
                .filter(version => semver.valid(version) && semver.prerelease(version) === null)
                .sort(semver.compare)
            const normalizedSpecifier = specifier.replace(/(?<=\d)(?=[<>])/g, ' ')
            const version = specifier === '*'
                ? result.distTags.latest ?? stableVersions.at(-1) ?? null
                : stableVersions.filter(version => semver.satisfies(version, normalizedSpecifier)).at(-1) ?? null

            return {
                metadata: result,
                name,
                specifier,
                version,
            }
        })
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

    for (const fileName of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
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
    const resolvePackageVersions = createVersionResolutionLoader(scenario.metadata)
    const { fixtureRoot, tempDir } = await copyFixtureToTemp(scenario.fixtureEntryPath)
    const fixtureEntryPath = join(fixtureRoot, basename(scenario.fixtureEntryPath))
    const includeMajor = scenario.args?.includes('--major') ?? false

    try {
        if (scenario.prepareFixture)
            await scenario.prepareFixture(fixtureRoot)

        const config = await resolveConfig(createArgs(dirname(fixtureEntryPath)))
        const checkResult = await checkUpdateDependencies(config, {
            fetchPackageMetadata,
            resolvePackageVersions,
            includeMajor,
        })
        vi.mocked(confirm).mockResolvedValue(true)
        vi.spyOn(console, 'log').mockImplementation((message: string) => output.push(message))
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(npmModule, 'getNpmRegistryMetadata').mockImplementation(fetchPackageMetadata)
        vi.spyOn(npmModule, 'resolvePackageVersions').mockImplementation(resolvePackageVersions)

        await runCliWithOptions({
            c: '',
            cwd: dirname(fixtureEntryPath),
            major: scenario.args?.includes('--major') ?? false,
            _: [''],
        })

        const candidates = checkResult.candidates.map(candidate => ({
            catalogName: candidate.source.catalogName ?? null,
            currentSpecifier: candidate.currentSpecifier,
            dependencyTypes: getDependencyTypes(candidate.source),
            filePath: relative(fixtureRoot, candidate.source.filePath),
            name: candidate.name,
            nextSpecifier: candidate.nextSpecifier,
            source: candidate.source.source,
            updateLevel: candidate.updateLevel,
            ...(candidate.availableMajorNodeRequirement ? { availableMajorNodeRequirement: candidate.availableMajorNodeRequirement } : {}),
            ...(candidate.availableMajorVersion ? { availableMajorVersion: candidate.availableMajorVersion } : {}),
            ...(candidate.targetNodeRequirement ? { targetNodeRequirement: candidate.targetNodeRequirement } : {}),
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
