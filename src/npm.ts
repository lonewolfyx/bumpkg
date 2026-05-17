import type {
    PackageVersionQuery,
    PackageVersionResolution,
    RegistryPackageMetadata,
    VersionCacheEntry,
    VersionCacheFile,
} from './types'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ofetch } from 'ofetch'
import semver from 'semver'
import { DEFAULT_REGISTRY_URL } from './constant'
import { resolveRegistryUrl } from './registry'
import { normalizeRegistryUrl, toPrettyJson } from './utils'
import { getSortedStableVersions, resolveLatestVersion } from './version'

interface NpmRegistryResponse {
    'name'?: string
    'versions'?: Record<string, {
        engines?: {
            node?: string
        }
    }>
    'dist-tags'?: Record<string, string | undefined>
}

const REGISTRY_REQUEST_TIMEOUT_MS = 2500
const REGISTRY_REQUEST_CONCURRENCY = 24
const VERSION_CACHE_DIR = join('node_modules', '.bumpkg')
const VERSION_CACHE_FILE_NAME = 'version.json'
const VERSION_CACHE_TTL_MS = 1000 * 60 * 60

function getVersionCachePath(rootDir: string): string {
    return join(rootDir, VERSION_CACHE_DIR, VERSION_CACHE_FILE_NAME)
}

async function mapWithConcurrency<T, R>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = []
    results.length = items.length
    let nextIndex = 0

    async function runWorker(): Promise<void> {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex++
            const item = items[currentIndex]
            if (item === undefined)
                continue

            results[currentIndex] = await worker(item, currentIndex)
        }
    }

    const workerCount = Math.min(Math.max(concurrency, 1), items.length)
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
    return results
}

async function readVersionCache(rootDir?: string): Promise<VersionCacheFile | null> {
    if (!rootDir)
        return null

    try {
        const cacheContent = await readFile(getVersionCachePath(rootDir), 'utf8')
        const cache = JSON.parse(cacheContent) as Partial<VersionCacheFile>

        if (!cache.registryUrl || !cache.updatedAt || !cache.packages)
            return null

        return {
            registryUrl: normalizeRegistryUrl(cache.registryUrl),
            updatedAt: cache.updatedAt,
            packages: Object.fromEntries(
                Object.entries(cache.packages).map(([packageName, entry]) => [
                    packageName,
                    {
                        ...entry,
                        enginesByVersion: entry.enginesByVersion ?? {},
                    },
                ]),
            ),
        }
    }
    catch {
        return null
    }
}

async function writeVersionCache(rootDir: string, cache: VersionCacheFile): Promise<void> {
    const cacheDir = join(rootDir, VERSION_CACHE_DIR)
    await mkdir(cacheDir, { recursive: true })
    await writeFile(
        getVersionCachePath(rootDir),
        toPrettyJson(cache),
        'utf8',
    )
}

function isVersionCacheEntryFresh(entry: VersionCacheEntry): boolean {
    const fetchedAt = Date.parse(entry.fetchedAt)
    if (Number.isNaN(fetchedAt))
        return false

    return Date.now() - fetchedAt <= VERSION_CACHE_TTL_MS
}

function resolveVersionFromMetadata(
    query: PackageVersionQuery,
    metadata: RegistryPackageMetadata,
): string | null {
    if (query.specifier === '*')
        return resolveLatestVersion(metadata)

    const stableVersions = getSortedStableVersions(metadata.versions)
    return stableVersions.filter(version => semver.satisfies(version, query.specifier)).at(-1) ?? null
}

async function resolveRequestedRegistryUrl(registryUrl?: string): Promise<string> {
    if (registryUrl)
        return normalizeRegistryUrl(registryUrl)

    return await resolveRegistryUrl()
}

export async function getPackageMetadata(
    packageName: string,
    registryUrl?: string,
    rootDir?: string,
): Promise<RegistryPackageMetadata> {
    const cache = await readVersionCache(rootDir)
    const cachedEntry = cache?.packages[packageName]

    if (cachedEntry && isVersionCacheEntryFresh(cachedEntry) && (!registryUrl || cache?.registryUrl === normalizeRegistryUrl(registryUrl))) {
        return {
            name: cachedEntry.name,
            versions: cachedEntry.versions,
            distTags: cachedEntry.distTags,
            enginesByVersion: cachedEntry.enginesByVersion ?? {},
        }
    }

    const normalizedRegistryUrl = await resolveRequestedRegistryUrl(registryUrl)

    const response = await ofetch<NpmRegistryResponse>(`${normalizedRegistryUrl}${packageName.replace(/\//g, '%2f')}`, {
        headers: {
            'user-agent': `bumpkg node/${process.version}`,
            'accept': 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        },
        retry: 0,
        timeout: REGISTRY_REQUEST_TIMEOUT_MS,
    })

    const metadata = {
        name: response.name ?? packageName,
        versions: Object.keys(response.versions ?? {}),
        distTags: response['dist-tags'] ?? {},
        enginesByVersion: Object.fromEntries(
            Object.entries(response.versions ?? {})
                .flatMap(([version, manifest]) => manifest.engines?.node
                    ? [[version, { node: manifest.engines.node }]]
                    : []),
        ),
    }

    if (rootDir) {
        const nextCache: VersionCacheFile = {
            registryUrl: normalizedRegistryUrl,
            updatedAt: new Date().toISOString(),
            packages: {
                ...(cache?.registryUrl === normalizedRegistryUrl ? cache.packages : {}),
                [packageName]: {
                    name: metadata.name,
                    fetchedAt: new Date().toISOString(),
                    versions: metadata.versions,
                    distTags: metadata.distTags,
                    enginesByVersion: metadata.enginesByVersion,
                },
            },
        }
        await writeVersionCache(rootDir, nextCache)
    }

    return metadata
}

export async function getNpmRegistryMetaData(
    packageName: string,
    registryUrl?: string,
    rootDir?: string,
): Promise<RegistryPackageMetadata> {
    return await getPackageMetadata(packageName, registryUrl, rootDir)
}

export async function resolvePackageVersions(
    queries: readonly PackageVersionQuery[],
    registryUrl?: string,
    rootDir?: string,
): Promise<PackageVersionResolution[]> {
    if (queries.length === 0)
        return []

    const uniquePackageNames = Array.from(new Set(queries.map(query => query.name)))
    const cache = await readVersionCache(rootDir)
    const packageMetadata = new Map<string, RegistryPackageMetadata>()
    const requestedRegistryUrl = registryUrl ? normalizeRegistryUrl(registryUrl) : undefined
    const missingPackageNames = uniquePackageNames.filter((packageName) => {
        const cachedEntry = cache?.packages[packageName]
        if (cachedEntry && isVersionCacheEntryFresh(cachedEntry) && (!requestedRegistryUrl || cache?.registryUrl === requestedRegistryUrl)) {
            packageMetadata.set(packageName, {
                name: cachedEntry.name,
                versions: cachedEntry.versions,
                distTags: cachedEntry.distTags,
                enginesByVersion: cachedEntry.enginesByVersion ?? {},
            })
            return false
        }

        return true
    })

    const normalizedRegistryUrl = missingPackageNames.length > 0
        ? await resolveRequestedRegistryUrl(registryUrl)
        : requestedRegistryUrl ?? cache?.registryUrl ?? normalizeRegistryUrl(DEFAULT_REGISTRY_URL)

    const metadataEntries = await mapWithConcurrency(
        missingPackageNames,
        REGISTRY_REQUEST_CONCURRENCY,
        async packageName => [packageName, await getPackageMetadata(packageName, normalizedRegistryUrl)] as const,
    )
    const metadataCache = new Map<string, RegistryPackageMetadata>([
        ...Array.from(packageMetadata.entries()),
        ...metadataEntries,
    ])

    if (rootDir && metadataEntries.length > 0) {
        const nextPackages = {
            ...(cache?.registryUrl === normalizedRegistryUrl ? cache.packages : {}),
        } as Record<string, VersionCacheEntry>

        for (const [packageName, metadata] of metadataEntries) {
            nextPackages[packageName] = {
                name: metadata.name,
                fetchedAt: new Date().toISOString(),
                versions: metadata.versions,
                distTags: metadata.distTags,
                enginesByVersion: metadata.enginesByVersion,
            }
        }

        await writeVersionCache(rootDir, {
            registryUrl: normalizedRegistryUrl,
            updatedAt: new Date().toISOString(),
            packages: nextPackages,
        })
    }

    return queries.map((query) => {
        const metadata = metadataCache.get(query.name)
        if (!metadata)
            throw new Error(`Missing package metadata for ${query.name}.`)

        return {
            metadata,
            name: query.name,
            specifier: query.specifier,
            version: resolveVersionFromMetadata(query, metadata),
        }
    })
}
