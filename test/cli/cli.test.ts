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
        failed: [],
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

    test('renders the default table headers for regular dependencies', () => {
        expect(renderUpdateTable([createCandidate()])).toContain('dependencyName')
        expect(renderUpdateTable([createCandidate()])).toContain('currentVersion')
        expect(renderUpdateTable([createCandidate()])).toContain('newVersion')
        expect(renderUpdateTable([createCandidate()])).not.toContain('catalogName')
        expect(renderUpdateTable([createCandidate()])).not.toContain('source')
    })

    test('renders major availability and catalog details in the table when catalog entries exist', () => {
        const table = renderUpdateTable([{
            ...createCandidate(),
            name: '@antfu/eslint-config',
            currentVersion: '^7.2.0',
            currentSpecifier: '^7.2.0',
            newVersion: '7.7.3',
            nextSpecifier: '^7.7.3',
            availableMajorVersion: '9.0.0',
            availableMajorNodeRequirement: '>=18.18.0',
            source: {
                ...createCandidate().source,
                source: 'catalogs',
                catalogName: 'lint',
                filePath: '/project/pnpm-workspace.yaml',
            },
        }])

        expect(table).toContain('^7.7.3 (9.0.0 available, requires node >=18.18.0)')
        expect(table).toContain('catalogs')
        expect(table).toContain('lint')
        expect(table).not.toContain('/project/pnpm-workspace.yaml')
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

        expect(mocks.checkSpy).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                includeMajor: true,
            }),
        )
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

    test('prints check errors even when some candidates are still available', async () => {
        const output: string[] = []
        const errors: string[] = []
        setupCliMocks({
            candidates: [createCandidate()],
            errors: [{
                name: 'react',
                currentVersion: '^18.0.0',
                reason: 'registry timeout',
                source: {
                    filePath: '/project/package.json',
                    source: 'dependencies',
                    manifestFormat: 'json',
                },
            }],
        }, output).errorSpy.mockImplementation((message: string) => errors.push(message))

        await runCliWithOptions({ c: '', cwd: process.cwd(), major: false, _: [''] })

        expect(errors).toEqual([
            'Failed to check 1 dependencies.',
            'react: registry timeout',
        ])
        expect(output).toContain('Updated 1 dependencies across 1 files.')
    })

    test('reports lockfile cleanup failures', async () => {
        const output: string[] = []
        const errors: string[] = []
        const mocks = setupCliMocks({ candidates: [createCandidate()], errors: [] }, output)
        mocks.cleanupSpy.mockResolvedValue({
            removed: [],
            missing: [],
            failed: [{
                filePath: '/project/pnpm-lock.yaml',
                reason: 'permission denied',
            }],
        })
        mocks.errorSpy.mockImplementation((message: string) => errors.push(message))

        await runCliWithOptions({ c: '', cwd: process.cwd(), major: false, _: [''] })

        expect(output).not.toContain('No supported lock files found.')
        expect(errors).toContain('Failed to remove lock file /project/pnpm-lock.yaml: permission denied')
    })
})
