/* Arty v2 */

// First, load utilities and config
const {config,log,debugLog}=require('./utils')

// Handle signals for graceful shutdown
let signals = {'SIGHUP': 1,'SIGINT': 2,'SIGTERM': 15}
for (const signal in Object.keys(signals)){process.on(signal, () =>{log('Bye! ('+signal+' '+signals[signal]+')');process.exit(128+signals[signal])})}

// Setup discord, connect and handle commands
const {discord}=require('./discord/discord')

// Setup scheduler
const {cron}=require('./schedule')

// Setup backend cluster, read available models and embeddings
const {invoke}=require('./invoke')
const {comfyui}=require('./comfyui')

// IPFS node
const {ipfs} = require('./ipfs')


// Handle unhandled promise rejections instead of crashing app
process.on('unhandledRejection', (reason, promise) => {log(`Unhandled Rejection at: Promise ${promise ? promise.toString() : '?'} reason:`, reason)})
process.on('uncaughtException', (err) => {log('Uncaught exception:');log(err)})
global.handleSynchronousException = err => {log('Unhandled synchronous exception:');log(err)}

init = async () => {
    log('Initializing IPFS node...') // Log before initializing IPFS
    await ipfs.init() // initialize ipfs node
    log('IPFS node initialized.') // Log after IPFS initialization

    log('Starting Discord listeners...') // Log before starting Discord
    await discord.botInit() // Start discord listeners
    log('Discord listeners started.') // Log after Discord initialization

    if (config.web.enabled) { // initialize admin web interface if enabled
        log('Initializing admin web interface...') // Log before web interface initialization
        const { web } = require('./web/web')
        await web.init() // Ensure this is asynchronous if it has async operations
        log('Admin web interface initialized.') // Log after web interface initialization
    }
}

init()
