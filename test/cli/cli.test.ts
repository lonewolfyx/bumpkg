import type { CheckUpdateResult, ProjectConfig, UpdateCandidate } from '@/types'
import { confirm } from '@clack/prompts'
import * as checkModule from '@/check'
import { renderUpdateTable, runCliWithOptions } from '@/cli-runner'
import * as configModule from '@/config'
import * as lockModule from '@/lock'
import * as updateModule from '@/update'

vi.mock('@clack/prompts', () => ({
    confirm: vi.fn(),
    isCancel: vi.fn(() => false),
}))

function createProjectConfig(): ProjectConfig {
    return {
        cwd: '/project',
        rootDir: '/project',
        rootPackagePath: '/project/package.json',
        monorepo: false,
        packages: ['/project/package.json'],
        dependencies: [],
        devDependencies: [],
        optionalDependencies: [],
        catalogDependencies: [],
        allDependencies: [],
    }
}

function createCandidate(): UpdateCandidate {
    return {
        name: 'lodash',
        currentVersion: '^4.17.0',
        currentSpecifier: '^4.17.0',
        newVersion: '4.17.21',
        nextSpecifier: '^4.17.21',
        updateLevel: 'minor',
        source: {
            filePath: '/project/package.json',
            source: 'dependencies',
            manifestFormat: 'json',
        },
    }
}

function setupCliMocks(result: CheckUpdateResult, output: string[] = []) {
    const logSpy = vi.spyOn(console, 'log').mockImplementation((message: string) => output.push(message))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const checkSpy = vi.spyOn(checkModule, 'checkUpdateDependencies').mockResolvedValue(result)
    const updateSpy = vi.spyOn(updateModule, 'applyDependencyUpdates').mockResolvedValue({
        updatedFiles: [{ filePath: '/project/package.json', updatedDependencies: ['lodash'] }],
        updatedCount: 1,
    })
    const cleanupSpy = vi.spyOn(lockModule, 'cleanupLockFiles').mockResolvedValue({
        removed: ['/project/pnpm-lock.yaml'],
        missing: [],
    })
    const resolveSpy = vi.spyOn(configModule, 'resolveConfig').mockResolvedValue(createProjectConfig())
    vi.mocked(confirm).mockResolvedValue(true)

    return {
        checkSpy,
        cleanupSpy,
        errorSpy,
        logSpy,
        resolveSpy,
        updateSpy,
    }
}

describe('cli helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    test('passes --cwd through to config resolution', async () => {
        const output: string[] = []
        const mocks = setupCliMocks({ candidates: [], errors: [] }, output)

        await runCliWithOptions({ c: '', cwd: '/tmp/demo', major: false, _: [''] })

        expect(mocks.resolveSpy).toHaveBeenCalledWith('/tmp/demo')
    })

    test('renders the fixed table headers', () => {
        expect(renderUpdateTable([createCandidate()])).toContain('dependencyName')
        expect(renderUpdateTable([createCandidate()])).toContain('current_Version')
        expect(renderUpdateTable([createCandidate()])).toContain('new_Version')
    })

    test('prints a clear message when there are no updates', async () => {
        const output: string[] = []
        setupCliMocks({ candidates: [], errors: [] }, output)

        await runCliWithOptions({ c: '', cwd: process.cwd(), major: true, _: [''] })

        expect(output).toEqual(['No updatable dependencies found.'])
    })

    test('prints check errors instead of pretending there are no updates', async () => {
        const output: string[] = []
        const errors: string[] = []
        const mocks = setupCliMocks({
            candidates: [],
            errors: [{
                name: 'lodash',
                currentVersion: '^1.0.0',
                reason: 'registry timeout',
                source: {
                    filePath: '/project/package.json',
                    source: 'dependencies',
                    manifestFormat: 'json',
                },
            }],
        }, output)
        mocks.errorSpy.mockImplementation((message: string) => errors.push(message))

        await runCliWithOptions({ c: '', cwd: process.cwd(), major: true, _: [''] })

        expect(output).toEqual([])
        expect(errors).toEqual([
            'Failed to check 1 dependencies.',
            'lodash: registry timeout',
        ])
    })

    test('passes the major flag into dependency checks', async () => {
        const output: string[] = []
        const mocks = setupCliMocks({ candidates: [], errors: [] }, output)

        await runCliWithOptions({ c: '', cwd: process.cwd(), major: true, _: [''] })

        expect(mocks.checkSpy).toHaveBeenCalledWith(expect.anything(), {
            includeMajor: true,
            fetchPackageMetadata: expect.any(Function),
            resolvePackageVersions: expect.any(Function),
        })
    })

    test('stops when the user cancels', async () => {
        const output: string[] = []
        const mocks = setupCliMocks({ candidates: [createCandidate()], errors: [] }, output)
        vi.mocked(confirm).mockResolvedValue(false)

        await runCliWithOptions({ c: '', cwd: process.cwd(), major: false, _: [''] })

        expect(output.at(-1)).toBe('Update cancelled.')
        expect(mocks.updateSpy).not.toHaveBeenCalled()
    })

    test('runs the update flow after confirmation', async () => {
        const output: string[] = []
        const mocks = setupCliMocks({ candidates: [createCandidate()], errors: [] }, output)

        await runCliWithOptions({ c: '', cwd: process.cwd(), major: false, _: [''] })

        expect(mocks.updateSpy).toHaveBeenCalled()
        expect(mocks.cleanupSpy).toHaveBeenCalledWith('/project')
        expect(output.at(-1)).toContain('Removed lock files:')
    })
})
