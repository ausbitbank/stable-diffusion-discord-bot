/* Arty v2 */
// requires invokeai 3.02post1
// LORA : add_detail
// Embedding : neg-sketch-3
// controlnet : ioclab/control_v1p_sd15_brightness (for qrcode)

// First, load utilities and config
const {config,log,debugLog}=require('./utils')

// Handle signals for graceful shutdown
let signals = {'SIGHUP': 1,'SIGINT': 2,'SIGTERM': 15}
for (const signal in Object.keys(signals)){process.on(signal, () =>{log('Bye! ('+signal+' '+signals[signal]+')');process.exit(128+signals[signal])})}


// Setup database connection
//const {db:db}=require('./src/db.js')

// Setup discord, connect and handle commands
const {discord}=require('./discord/discord')

// Setup scheduler
//const {cron}=require('./src/schedule.js')

// Setup backend cluster, read available models and embeddings
const {invoke}=require('./invoke')

init=async()=>{
  discord.botInit() // Start discord listeners
}

init()