import type {
    PackageVersionQuery,
    PackageVersionResolution,
    RegistryPackageMetadata,
} from './types'
import { ofetch } from 'ofetch'

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

const FAST_NPM_META_BASE_URL = 'https://npm.antfu.dev'
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

export async function getPackageMetadata(packageName: string): Promise<RegistryPackageMetadata> {
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

    return queries.map((query) => {
        const resolution = resultMap.get(toQueryKey(query))
        if (!resolution)
            throw new Error(`Missing resolved version for ${query.name}@${query.specifier}.`)
        return resolution
    })
}
