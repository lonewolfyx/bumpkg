import type { INpmPackageRegistryMetaData } from '@/types.ts'

export const getNpmRegistryMetaData = async (packageName: string) => {
    const npmRegistryFetch = await import('npm-registry-fetch')

    return await npmRegistryFetch.json(
        `/${packageName.replace(/\//g, '%2f')}`,
        {
            headers: {
                'user-agent': `bumpkg@npm node/${process.version}`,
                'accept': 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
            },
            ndefined: undefined,
        },
    ) as unknown as INpmPackageRegistryMetaData
}
