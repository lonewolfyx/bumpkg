import type { CleanupLockResult } from './types'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { LOCK_FILE_NAMES } from './constant'

export function getLockFilePaths(cwd: string): string[] {
    return LOCK_FILE_NAMES.map(fileName => join(cwd, fileName))
}

export async function cleanupLockFiles(cwd: string): Promise<CleanupLockResult> {
    const removed: string[] = []
    const missing: string[] = []
    const failed: CleanupLockResult['failed'] = []

    for (const filePath of LOCK_FILE_NAMES.map(fileName => join(cwd, fileName))) {
        try {
            await unlink(filePath)
            removed.push(filePath)
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                missing.push(filePath)
                continue
            }

            failed.push({
                filePath,
                reason: error instanceof Error ? error.message : 'Failed to remove lock file',
            })
        }
    }

    return {
        removed,
        missing,
        failed,
    }
}
