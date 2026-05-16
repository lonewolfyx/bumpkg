import type {
    PackageVersionQuery,
    PackageVersionResolution,
    RegistryPackageMetadata,
} from './types'
import { ofetch } from 'ofetch'
import semver from 'semver'

interface NpmRegistryResponse {
    'name'?: string
    'versions'?: Record<string, unknown>
    'dist-tags'?: Record<string, string | undefined>
}

interface FastNpmMetaResponse {
    name?: string
    version?: string | null
    versions?: string[]
    error?: string
}

const FAST_NPM_META_BASE_URL = 'https://npm.antfu.me'
const FAST_NPM_META_BATCH_SIZE = 24

function normalizeFastNpmMetaBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '')
}

function buildFastNpmMetaRequestSpecifier(query: PackageVersionQuery): string {
    return query.specifier === '*'
        ? query.name
        : `${query.name}@${query.specifier}`
}

function toQueryKey(query: PackageVersionQuery): string {
    return `${query.name}\u0000${query.specifier}`
}

function chunkQueries(queries: readonly PackageVersionQuery[]): PackageVersionQuery[][] {
    const chunks: PackageVersionQuery[][] = []

    for (let index = 0; index < queries.length; index += FAST_NPM_META_BATCH_SIZE)
        chunks.push(queries.slice(index, index + FAST_NPM_META_BATCH_SIZE))

    return chunks
}

function resolveVersionFromMetadata(
    query: PackageVersionQuery,
    metadata: RegistryPackageMetadata,
): string | null {
    const stableVersions = metadata.versions
        .filter(version => semver.valid(version) && semver.prerelease(version) === null)
        .sort(semver.compare)

    if (query.specifier === '*') {
        const latest = metadata.distTags.latest
        if (latest && semver.valid(latest) && semver.prerelease(latest) === null)
            return latest

        return stableVersions.at(-1) ?? null
    }

    return stableVersions.filter(version => semver.satisfies(version, query.specifier)).at(-1) ?? null
}

async function resolveQueriesWithRegistryMetadata(
    queries: readonly PackageVersionQuery[],
): Promise<PackageVersionResolution[]> {
    const uniquePackageNames = Array.from(new Set(queries.map(query => query.name)))
    const metadataEntries = await Promise.all(
        uniquePackageNames.map(async packageName => [packageName, await getNpmRegistryMetaData(packageName)] as const),
    )
    const metadataCache = new Map<string, RegistryPackageMetadata>(metadataEntries)

    return queries.map((query) => {
        const metadata = metadataCache.get(query.name)
        if (!metadata)
            throw new Error(`Missing package metadata for ${query.name}.`)

        return {
            name: query.name,
            specifier: query.specifier,
            version: resolveVersionFromMetadata(query, metadata),
        }
    })
}

export async function getNpmRegistryMetaData(
    packageName: string,
): Promise<RegistryPackageMetadata> {
    const npmRegistryFetch = await import('npm-registry-fetch')
    const response = await npmRegistryFetch.json(`/${packageName.replace(/\//g, '%2f')}`, {
        headers: {
            'user-agent': `bumpkg node/${process.version}`,
            'accept': 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        },
    }) as NpmRegistryResponse

    return {
        name: response.name ?? packageName,
        versions: Object.keys(response.versions ?? {}),
        distTags: response['dist-tags'] ?? {},
    }
}

export async function resolvePackageVersions(
    queries: readonly PackageVersionQuery[],
): Promise<PackageVersionResolution[]> {
    if (queries.length === 0)
        return []

    const baseUrl = normalizeFastNpmMetaBaseUrl(
        process.env.BUMPKG_FAST_NPM_META_URL || FAST_NPM_META_BASE_URL,
    )
    const resultMap = new Map<string, PackageVersionResolution>()

    for (const chunk of chunkQueries(queries)) {
        try {
            const encodedSpecs = chunk
                .map(buildFastNpmMetaRequestSpecifier)
                .map(specifier => encodeURIComponent(specifier))
                .join('+')

            const response = await ofetch<FastNpmMetaResponse | FastNpmMetaResponse[]>(
                `${baseUrl}/${encodedSpecs}`,
                {
                    query: {
                        throw: 'false',
                    },
                    retry: 0,
                },
            )
            const records = Array.isArray(response) ? response : [response]

            if (records.length !== chunk.length)
                throw new Error(`Expected ${chunk.length} version results but received ${records.length}.`)

            for (const [index, record] of records.entries()) {
                const query = chunk[index]
                if (!query)
                    continue

                if (record?.error)
                    throw new Error(record.error)

                resultMap.set(toQueryKey(query), {
                    name: query.name,
                    specifier: query.specifier,
                    version: record?.version ?? null,
                })
            }
        }
        catch {
            const fallbackResolutions = await resolveQueriesWithRegistryMetadata(chunk)

            for (const resolution of fallbackResolutions)
                resultMap.set(toQueryKey(resolution), resolution)
        }
    }

    return queries.map((query) => {
        const resolution = resultMap.get(toQueryKey(query))
        if (!resolution)
            throw new Error(`Missing resolved version for ${query.name}@${query.specifier}.`)
        return resolution
    })
}
