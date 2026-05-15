import { commonDependencyMetadata, runFixtureScenario } from '../fixture-test-helper'

describe('package yml fixture', () => {
    it('matches the fixture snapshot', async () => {
        const result = await runFixtureScenario({
            fixtureEntryPath: '/test/fixtures/package-yaml/package.yaml',
            metadata: {
                ...commonDependencyMetadata,
                react: { name: 'react', versions: ['19.1.1', '19.2.0'], distTags: { latest: '19.2.0' } },
            },
            trackedFiles: ['package.yaml'],
        })

        expect(result).toMatchSnapshot()
    })
})
