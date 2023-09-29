/* Arty v2 */
// requires invokeai 3.10
// LORA : add_detail // https://civitai.com/api/download/models/87153?type=Model&format=SafeTensor
// Embedding : neg-sketch-3

// First, load utilities and config
const {config,log,debugLog}=require('./utils')

// Handle signals for graceful shutdown
let signals = {'SIGHUP': 1,'SIGINT': 2,'SIGTERM': 15}
for (const signal in Object.keys(signals)){process.on(signal, () =>{log('Bye! ('+signal+' '+signals[signal]+')');process.exit(128+signals[signal])})}

// Setup database connection
//const {db}=require('./src/db')

// Setup discord, connect and handle commands
const {discord}=require('./discord/discord')

// Setup scheduler
//const {cron}=require('./src/schedule.js')

// Setup backend cluster, read available models and embeddings
const {invoke}=require('./invoke')

// Check payments
//const {hivePayments}=require('./hive/hivePayments')
//hivePayments.poll()

init=async()=>{
  discord.botInit() // Start discord listeners
}

init()
