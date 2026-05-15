import { createMain, defineCommand } from 'citty'
import { resolveConfig } from '@/config.ts'
import { getNpmSemVerCalculator } from '@/version.ts'
import { description, name, version } from '../package.json'

const command = defineCommand({
    meta: {
        name,
        version,
        description,
    },
    args: {
        cwd: {
            type: 'string',
            description: 'working directory',
            default: process.cwd(),
            alias: 'c',
        },
    },
    async run({ args }) {
        console.log('📦 Resolving project configuration...')
        const config = await resolveConfig()

        console.log(config)
        // const npmRegistryFetch = await import('npm-registry-fetch')
        //
        // console.log(process.version)
        // console.log(JSON.stringify(
        //     await npmRegistryFetch.json('rmcache', {
        //         headers: {
        //             'user-agent': `bumpkg@npm node/${process.version}`,
        //             'accept': 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        //         },
        //         ndefined: undefined,
        //     }),
        //     null,
        //     2,
        // ),
        // )

        const packageName = 'vue'
        const version = '^2 <2.2 || > 2.3'
        // const packageName = '@clack/prompts'
        // const version = '^0.11.0'
        console.log(await getNpmSemVerCalculator(packageName, version))

        // console.log(compareCaretDiff('3.2.3', '3.2.3'))
    },
})

createMain(command)({})
