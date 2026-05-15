import { runFixtureScenario } from '../fixture-test-helper'

describe('pnpm fixture', () => {
    it('matches the fixture snapshot', async () => {
        const result = await runFixtureScenario({
            fixtureEntryPath: '/test/fixtures/pkgmode/package.json',
            args: ['--major'],
            metadata: {
                'express': { name: 'express', versions: ['4.1.0', '5.1.0'], distTags: { latest: '5.1.0' } },
                'typescript': { name: 'typescript', versions: ['0.22.6', '5.9.3'], distTags: { latest: '5.9.3' } },
                'vite': { name: 'vite', versions: ['2.1.0', '7.1.9'], distTags: { latest: '7.1.9' } },
                'vue': { name: 'vue', versions: ['3.4.0', '3.5.13'], distTags: { latest: '3.5.13' } },
                'vue-router': { name: 'vue-router', versions: ['4.0.2', '4.5.1'], distTags: { latest: '4.5.1' } },
            },
            trackedFiles: ['package.json'],
        })

        expect(result).toMatchSnapshot()
    })
})
