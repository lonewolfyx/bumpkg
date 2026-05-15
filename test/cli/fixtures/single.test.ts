import { commonDependencyMetadata, runFixtureScenario } from '../fixture-test-helper'

describe('single fixture', () => {
    it('matches the fixture snapshot', async () => {
        const result = await runFixtureScenario({
            fixtureEntryPath: '/test/fixtures/single/package.json',
            metadata: commonDependencyMetadata,
            trackedFiles: ['package.json'],
        })

        expect(result).toMatchSnapshot()
    })
})
