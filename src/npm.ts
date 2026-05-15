import type { RegistryPackageMetadata } from './types'

interface NpmRegistryResponse {
    'name'?: string
    'versions'?: Record<string, unknown>
    'dist-tags'?: Record<string, string | undefined>
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
