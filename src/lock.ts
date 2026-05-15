import type { CleanupLockResult } from './types'
import { access, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { LOCK_FILE_NAMES } from './constant'

export function getLockFilePaths(cwd: string): string[] {
    return LOCK_FILE_NAMES.map(fileName => join(cwd, fileName))
}

export async function cleanupLockFiles(cwd: string): Promise<CleanupLockResult> {
    const removed: string[] = []
    const missing: string[] = []

    for (const filePath of getLockFilePaths(cwd)) {
        try {
            await access(filePath)
            await unlink(filePath)
            removed.push(filePath)
        }
        catch {
            missing.push(filePath)
        }
    }

    return {
        removed,
        missing,
    }
}
