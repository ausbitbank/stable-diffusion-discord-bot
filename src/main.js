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

init=async()=>{
  await ipfs.init() // initialize ipfs node
  discord.botInit() // Start discord listeners
  if(config.web.enabled){ // initialize admin web interface if enabled
    const {web}=require('./web/web')
    web.init()
  }
}

init()