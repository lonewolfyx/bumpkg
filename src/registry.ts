import { ofetch } from 'ofetch'

const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org/'
const REGISTRY_CANDIDATE_URLS = [
    'https://registry.npmmirror.com/',
    'https://mirrors.cloud.tencent.com/npm/',
    DEFAULT_REGISTRY_URL,
] as const
const REGISTRY_PROBE_PACKAGE_NAME = 'react'
const REGISTRY_PROBE_TIMEOUT_MS = 1200

function normalizeRegistryUrl(registryUrl: string): string {
    return registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`
}

export async function resolveRegistryUrl(): Promise<string> {
    const results = await Promise.all(
        REGISTRY_CANDIDATE_URLS.map(async (registryUrl) => {
            const normalizedRegistryUrl = normalizeRegistryUrl(registryUrl)
            const startedAt = Date.now()

            try {
                await ofetch(`${normalizedRegistryUrl}${REGISTRY_PROBE_PACKAGE_NAME}/latest`, {
                    retry: 0,
                    timeout: REGISTRY_PROBE_TIMEOUT_MS,
                    headers: {
                        accept: 'application/json',
                    },
                })

                return {
                    registryUrl: normalizedRegistryUrl,
                    durationMs: Date.now() - startedAt,
                    success: true,
                }
            }
            catch {
                return {
                    registryUrl: normalizedRegistryUrl,
                    durationMs: Number.POSITIVE_INFINITY,
                    success: false,
                }
            }
        }),
    )
    const fastestResult = results
        .filter(result => result.success)
        .sort((left, right) => left.durationMs - right.durationMs)[0]

    return fastestResult?.registryUrl ?? DEFAULT_REGISTRY_URL
}
