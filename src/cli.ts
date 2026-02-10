import { createMain, defineCommand } from 'citty'
import { description, name, version } from '../package.json'

const command = defineCommand({
    meta: {
        name,
        version,
        description,
    },
    setup() {
        console.log('Setup')
    },
    cleanup() {
        console.log('Cleanup')
    },
    run({ args }) {
        console.log(args)
    },
})

createMain(command)({})
