import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export async function createTempDir(prefix: string): Promise<string> {
    return await mkdtemp(join(tmpdir(), `${prefix}-`))
}

export async function removeTempDir(directory: string): Promise<void> {
    await rm(directory, { recursive: true, force: true })
}

export async function writeText(filePath: string, content: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf8')
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
    await writeText(filePath, `${JSON.stringify(value, null, 4)}\n`)
}

export async function readJson<T>(filePath: string): Promise<T> {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
}
