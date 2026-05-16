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

interface NpmRegistryResponse {
    'name'?: string
    'versions'?: Record<string, unknown>
    'dist-tags'?: Record<string, string | undefined>
}

const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org/'
const REGISTRY_REQUEST_TIMEOUT_MS = 2500
const REGISTRY_REQUEST_CONCURRENCY = 24
const VERSION_CACHE_DIR = join('node_modules', '.bumpkg')
const VERSION_CACHE_FILE_NAME = 'version.json'
const VERSION_CACHE_TTL_MS = 1000 * 60 * 60

function normalizeRegistryUrl(registryUrl: string): string {
    return registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`
}

function getVersionCachePath(rootDir: string): string {
    return join(rootDir, VERSION_CACHE_DIR, VERSION_CACHE_FILE_NAME)
}

function getRegistryRequestTimeoutMs(): number {
    const configured = Number.parseInt(process.env.BUMPKG_NPM_REGISTRY_TIMEOUT_MS || '', 10)
    return Number.isFinite(configured) && configured > 0 ? configured : REGISTRY_REQUEST_TIMEOUT_MS
}

function getRegistryRequestConcurrency(): number {
    const configured = Number.parseInt(process.env.BUMPKG_REGISTRY_REQUEST_CONCURRENCY || '', 10)
    return Number.isFinite(configured) && configured > 0 ? configured : REGISTRY_REQUEST_CONCURRENCY
}

function getVersionCacheTtlMs(): number {
    const configured = Number.parseInt(process.env.BUMPKG_VERSION_CACHE_TTL_MS || '', 10)
    return Number.isFinite(configured) && configured >= 0 ? configured : VERSION_CACHE_TTL_MS
}

async function mapWithConcurrency<T, R>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = Array.from({ length: items.length })
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
            packages: cache.packages,
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
        `${JSON.stringify(cache, null, 4)}\n`,
        'utf8',
    )
}

function isVersionCacheEntryFresh(entry: VersionCacheEntry): boolean {
    const fetchedAt = Date.parse(entry.fetchedAt)
    if (Number.isNaN(fetchedAt))
        return false

    return Date.now() - fetchedAt <= getVersionCacheTtlMs()
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

export async function getPackageMetadata(
    packageName: string,
    registryUrl: string = DEFAULT_REGISTRY_URL,
    rootDir?: string,
): Promise<RegistryPackageMetadata> {
    const normalizedRegistryUrl = normalizeRegistryUrl(registryUrl)
    const cache = await readVersionCache(rootDir)
    const cachedEntry = cache?.registryUrl === normalizedRegistryUrl
        ? cache.packages[packageName]
        : undefined

    if (cachedEntry && isVersionCacheEntryFresh(cachedEntry)) {
        return {
            name: cachedEntry.name,
            versions: cachedEntry.versions,
            distTags: cachedEntry.distTags,
        }
    }

    const response = await ofetch<NpmRegistryResponse>(`${normalizedRegistryUrl}${packageName.replace(/\//g, '%2f')}`, {
        headers: {
            'user-agent': `bumpkg node/${process.version}`,
            'accept': 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        },
        retry: 0,
        timeout: getRegistryRequestTimeoutMs(),
    })

    const metadata = {
        name: response.name ?? packageName,
        versions: Object.keys(response.versions ?? {}),
        distTags: response['dist-tags'] ?? {},
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
    registryUrl: string = DEFAULT_REGISTRY_URL,
    rootDir?: string,
): Promise<PackageVersionResolution[]> {
    if (queries.length === 0)
        return []

    const uniquePackageNames = Array.from(new Set(queries.map(query => query.name)))
    const normalizedRegistryUrl = normalizeRegistryUrl(registryUrl)
    const cache = await readVersionCache(rootDir)
    const cachedPackages = cache?.registryUrl === normalizedRegistryUrl ? cache.packages : {}
    const packageMetadata = new Map<string, RegistryPackageMetadata>()
    const missingPackageNames = uniquePackageNames.filter((packageName) => {
        const cachedEntry = cachedPackages?.[packageName]
        if (cachedEntry && isVersionCacheEntryFresh(cachedEntry)) {
            packageMetadata.set(packageName, {
                name: cachedEntry.name,
                versions: cachedEntry.versions,
                distTags: cachedEntry.distTags,
            })
            return false
        }

        return true
    })

    const metadataEntries = await mapWithConcurrency(
        missingPackageNames,
        getRegistryRequestConcurrency(),
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
            name: query.name,
            specifier: query.specifier,
            version: resolveVersionFromMetadata(query, metadata),
        }
    })
}
