import type { PackageManagement } from '../types'
import { dirname } from 'node:path'
import { findUp } from 'find-up'

const LOCK_FILE_BY_MANAGER: ReadonlyArray<{
    fileName: string
    packageManagement: PackageManagement
}> = [
    { fileName: 'package-lock.json', packageManagement: 'npm' },
    { fileName: 'pnpm-lock.yaml', packageManagement: 'pnpm' },
    { fileName: 'bun.lock', packageManagement: 'bun' },
    { fileName: 'bun.lockb', packageManagement: 'bun' },
    { fileName: 'yarn.lock', packageManagement: 'yarn' },
]

function countPathSegments(filePath: string): number {
    return dirname(filePath).split('/').filter(Boolean).length
}

export async function getPackageManagement(cwd: string): Promise<PackageManagement> {
    const matches = await Promise.all(
        LOCK_FILE_BY_MANAGER.map(async ({ fileName, packageManagement }) => ({
            filePath: await findUp(fileName, {
                cwd,
                type: 'file',
            }),
            packageManagement,
        })),
    )

    const resolved = matches
        .filter(match => Boolean(match.filePath))
        .sort((left, right) => countPathSegments(right.filePath!) - countPathSegments(left.filePath!))

    return resolved[0]?.packageManagement ?? 'unknown'
}
