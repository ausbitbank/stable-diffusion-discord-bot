const config = require('dotenv').config().parsed
const Eris = require("eris")
const Constants = Eris.Constants
const Collection = Eris.Collection
const fs = require('fs')
const axios = require('axios')
var queue = []
var users = []
var payments = []
var dbFile='./db.json' // flat file db
dbRead()
// hive payment checks. On startup, every 30 minutes and on a !recharge call
var hiveUsd = null
getPrices()
const hive = require('@hiveio/hive-js')
hive.config.set('alternative_api_endpoints',['https://api.hive.blog','https://rpc.ausbit.dev','https://api.openhive.network'])
if (config.hivePaymentAddress.length>0){
  var cron = require('node-cron')
  cron.schedule('*/10 * * * *', () => {
    console.log('checking account history every 10 minutes')
    checkNewPayments()
  })
  cron.schedule('*/55 * * * *', () => {
    console.log('Updating hive price every 55 minutes')
    getPrices()
  })
}
var parseArgs = require('minimist')
const chokidar = require('chokidar')
const moment = require('moment')
const { ImgurClient } = require('imgur')
const imgur = new ImgurClient({ clientId: config.imgurClientID})
const imgbb = require("imgbb-uploader")
const bot = new Eris.CommandClient(config.discordBotKey, {
  intents: ["guildMessages", "messageContent", "guildMembers"],
  description: "Just a slave to the art, maaan",
  owner: "ausbitbank",
  prefix: "!",
  reconnect: 'auto',
  compress: true,
  getAllUsers: true,
})
const defaultSize = 512
const basePath = config.basePath
if (!config||!config.apiUrl||!config.basePath||!config.channelID||!config.adminID||!config.discordBotKey||!config.pixelLimit||!config.fileWatcher||!config.roleID) { throw('Please re-read the setup instructions at https://github.com/ausbitbank/stable-diffusion-discord-bot , you are missing the required .env configuration file') }
var apiUrl = config.apiUrl
var rendering = false
var dialogs = {queue: null} // Track and replace our own messages to reduce spam
var slashCommands = [
  {
    name: 'dream',
    description: 'Create a new image from your prompt',
    options: [
      {type: '3', name: 'prompt', description: 'what would you like to see ?', required: true, min_length: 1, max_length:75 },
      {type: '4', name: 'width', description: 'width of the image in pixels', required: false, min_value: 256, max_value: 1024 },
      {type: '4', name: 'height', description: 'height of the image in pixels', required: false, min_value: 256, max_value: 1024 },
      {type: '4', name: 'steps', description: 'how many steps to render for', required: false, min_value: 5, max_value: 250 },
      {type: '4', name: 'seed', description: 'seed (initial noise pattern)', required: false},
      {type: '10', name: 'strength', description: 'how much noise to add to your template image (0.1-0.9)', required: false, min_value:0.1, max_value:1},
      {type: '10', name: 'scale', description: 'how important is the prompt', required: false, min_value:1, max_value:30},
      {type: '4', name: 'number', description: 'how many would you like', required: false, min_value: 1, max_value: 4},
      {type: '5', name: 'seamless', description: 'Seamlessly tiling textures', required: false},
      {type: '3', name: 'sampler', description: 'which sampler to use (default is k_lms)', required: false, choices: [{name: 'ddim', value: 'ddim'},{name: 'plms', value: 'plms'},{name: 'k_lms', value: 'k_lms'},{name: 'k_dpm_2', value: 'k_dpm_2'},{name: 'k_dpm_2_a', value: 'k_dpm_2_a'},{name: 'k_euler', value: 'k_euler'},{name: 'k_euler_a', value: 'k_euler_a'},{name: 'k_heun', value: 'k_heun'}]},
      {type: '11', name: 'attachment', description: 'use template image', required: false},
      {type: '10', name: 'gfpgan_strength', description: 'GFPGan strength (low= more face correction, high= more accuracy)', required: false, min_value: 0, max_value: 1},
      {type: '3', name: 'upscale_level', description: 'upscale amount', required: false, choices: [{name: 'none', value: '0'},{name: '2x', value: '2'},{name: '4x', value: '4'}]},
      {type: '10', name: 'upscale_strength', description: 'upscale strength (smoothing/detail loss)', required: false, min_value: 0, max_value: 1},
      {type: '10', name: 'variation_amount', description: 'how much variation from the original image (need seed+not k_euler_a sampler)', required: false, min_value:0.01, max_value:1},
      {type: '3', name: 'with_variations', description: 'advanced variant control, provide seed(s)+weight eg "seed:weight,seed:weight"', required: false, min_length:4,max_length:100}
      //{type: '3', name: 'template', description: 'use a previous render as a template (use the text next to :file_cabinet:)', required: true, min_length: 5, max_length:40 }
    ],
    cooldown: 500,
    execute: (i) => {
      if (i.data.options.find(x=>x.name==='attachment')){ var attachment=[i.data.resolved.attachments[i.data.options.find(x=>x.name==='attachment').value]] } else { var attachment=[]}
      request({cmd: getCmd(prepSlashCmd(i.data.options)), userid: i.member.id, username: i.member.user.username, discriminator: i.member.user.discriminator, bot: i.member.user.bot, channelid: i.channel.id, attachments: attachment}) }
  },
  {
    name: 'prompt',
    description: 'Show me a random prompt from the library',
    options: [ {type: '3', name: 'prompt', description: 'Add these keywords to a random prompt', required: false} ],
    cooldown: 500,
    execute: (i) => {
      var prompt = ''
      if (i.data.options) { prompt+= i.data.options[0].value + ' ' }
      prompt += getRandom('prompt')
      request({cmd: prompt, userid: i.member.id, username: i.member.user.username, discriminator: i.member.user.discriminator, bot: i.member.user.bot, channelid: i.channel.id, attachments: []})
    }
  }
]

bot.on("ready", async () => {
  console.log("Connected to discord")
  processQueue()
  // chat(':warning: reconnected')
  bot.getCommands().then(cmds=>{
    bot.commands = new Collection()
    for (const c of slashCommands) {
      if(cmds.filter(cmd=>cmd.name===c.name).length>0) {
        console.log('command '+c.name+' already loaded')
        bot.commands.set(c.name, c)
      } else {
        console.log('command '+c.name+' not found, loading')
        bot.commands.set(c.name, c)
        bot.createCommand({
          name: c.name,
          description: c.description,
          options: c.options ?? [],
          type: Constants.ApplicationCommandTypes.CHAT_INPUT
        })
      }
    }
  })
  checkNewPayments()
})

bot.on("interactionCreate", async (interaction) => {
  if(interaction instanceof Eris.CommandInteraction && interaction.channel.id === config.channelID && authorised(interaction.member)) {
    if (!bot.commands.has(interaction.data.name)) return interaction.createMessage({content:'Command does not exist', flags:64}).catch((e) => {console.log(e)})
    try {
      bot.commands.get(interaction.data.name).execute(interaction)
      interaction.acknowledge()
        .then(x=> {
          interaction.deleteMessage('@original')
          .then((t) => {console.log(t)})
          .catch((e) => {console.error(e)}) })
        .catch((e)=>{console.error(e)})
    }
    catch (error) { console.error(error); await interaction.createMessage({content:'There was an error while executing this command!', flags: 64}).catch((e) => {console.log(e)}) }
  }
  if(interaction instanceof Eris.ComponentInteraction && interaction.channel.id === config.channelID&&authorised(interaction.member)) {
    console.log(interaction.data.custom_id+' request from ' + interaction.member.user.username)
    if (interaction.data.custom_id.startsWith('refresh')) {
      var id = interaction.data.custom_id.split('-')[1]
      var newJob = queue[id-1]
      if (newJob) {
        newJob.number = 1
        if (interaction.data.custom_id.startsWith('refreshVariants')&&newJob.sampler!=='k_euler_a') { // variants do not work with k_euler_a sampler
          newJob.variation_amount=0.1
          newJob.seed = interaction.data.custom_id.split('-')[2]
        } else {
          newJob.variation_amount=0
          newJob.seed=getRandomSeed()
        }
        var cmd = getCmd(newJob)
        if (!interaction.data.custom_id.startsWith('refreshNoTemplate')) { if (newJob.template){ cmd+= ' --template ' + newJob.template } } else { console.log('refreshNoTemplate') }
        request({cmd: cmd, userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: []})
        return interaction.editParent({}).catch((e)=>{console.log(e)})
      } else {
        console.error('unable to refresh render')
        return interaction.editParent({components:[]}).catch((e) => {console.log(e)})
      }
    } else if (interaction.data.custom_id.startsWith('template')) {
      id=interaction.data.custom_id.split('-')[1]
      var newJob = queue[id-1]
      if (newJob) {
        newJob.number = 1
        var cmd = getCmd(newJob)
        cmd+= ' --template ' + interaction.data.custom_id.split('-')[2]
        request({cmd: cmd, userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: []})
        return interaction.editParent({}).catch((e)=>{console.log(e)})
      } else {
        console.error('template request failed')
        return interaction.editParent({components:[]}).catch((e) => {console.log(e)})
      }
    }
  }
  if (!authorised(interaction.member)) {
    console.error('unauthorised usage attempt from ')
    console.info(interaction.member)
    return interaction.createMessage({content:':warning: You dont currently have permission to use this feature', flags:64}).catch((e) => {console.log(e)})
  }
})

bot.on("messageCreate", (msg) => {
  //console.log(msg)
  if((msg.content.startsWith("!prompt")) && msg.channel.id === config.channelID) {
    chat('`!prompt` is no longer supported, use `/prompt` instead')
    //request({cmd: msg.content.replace('!prompt','').trim() + '' + getRandom('prompt'), userid: msg.author.id, username: msg.author.username, discriminator: msg.author.discriminator, bot: msg.author.bot, channelid: msg.channel.id, attachments: msg.attachments})
    msg.delete().catch(() => {})
  } else if(msg.content.startsWith("!dothething") && msg.channel.id === config.channelID && msg.author.id === config.adminID) {
    rendering = false
    queue = []; //users= []; payments=[];
    dbWrite()
    console.log('admin wiped queue');
    msg.delete().catch(() => {})
  } else if(msg.content.startsWith("!dream") && msg.channel.id === config.channelID) {
    chat('`!dream` is no longer supported, use `/dream` instead')
    //request({cmd: msg.content.substr(7, msg.content.length), userid: msg.author.id, username: msg.author.username, discriminator: msg.author.discriminator, bot: msg.author.bot, channelid: msg.channel.id, attachments: msg.attachments})
  } else if(msg.content.startsWith("!recharge") && msg.channel.id === config.channelID) {
    console.log('recharge')
    rechargePrompt(msg.author.id)
  } else if(msg.content === '!queue') {
    queueStatus()
    msg.delete().catch(() => {})
  } else if(msg.content.startsWith('!credit') && msg.channel.id === config.channelID && msg.author.id === config.adminID){
    var who = msg.content.split(' ')[1]
    var howmuch = msg.content.split(' ')[2]
    console.log('!credit called')
    console.log(who,howmuch)
    creditRecharge(howmuch,'manual',who)
  }
})

bot.on("guildCreate", (guild) => { // When the client joins a new guild
    console.log(`New guild: ${guild.name}`)
})

bot.on("guildMemberAdd", (guild, member)=>{
  console.log("guildMemberAdd")
  console.log(guild)
  console.log(member)
})

bot.on("guildMemberRemove", (guild, member)=>{
  console.log("guildMemberRemove")
  console.log(guild)
  console.log(member)
})

bot.connect()

function request(request){
  // request = { cmd: string, userid: int, username: string, discriminator: int, bot: false, channelid: int, attachments: {}, }
  // console.log('request'); console.log(request)//tmp logging
  if (request.cmd.includes('{')) { request.cmd = replaceRandoms(request.cmd) } // swap randomizers
  var args = parseArgs(request.cmd.split(' '),{string: ['template','init_img','sampler']}) // parse arguments
  // messy code below contains defaults values, check numbers are actually numbers and within acceptable ranges etc
  if (!args.width || !Number.isInteger(args.width) || (defaultSize*args.width>config.pixelLimit)) { args.width = defaultSize }
  if (!args.height || !Number.isInteger(args.height) || (defaultSize*args.height>config.pixelLimit)) { args.height = defaultSize }
  if (!args.steps || !Number.isInteger(args.steps) || args.steps > 250) { args.steps = 50 } // max 250 steps, default 50
  if (!args.seed || !Number.isInteger(args.seed) || args.seed < 1 || args.seed > 4294967295 ) { args.seed = getRandomSeed() }
  if (!args.strength || args.strength > 1 || args.strength < 0 ) { args.strength = 0.75 }
  if (!args.scale || args.scale > 30 || args.scale < 0 ) { args.scale = 7.5 }
  if (!args.sampler) { args.sampler = 'k_lms' }
  if (args.n) {args.number = args.n}
  if (!args.number || !Number.isInteger(args.number) || args.number > 5 || args.number < 1) { args.number = 1 }
  if (!args.seamless) {args.seamless = 'off'} else {
    if (args.seamless === 'true') { args.seamless = 'on'}
    if (args.seamless === 'false') { args.seamless = 'off'}
  }
  if (!args.renderer || ['localApi'].includes(args.renderer)) { args.renderer = 'localApi'}
  // Should really check if template exists at this point, dont pass on invalid template
  if (args.template) { args.template = sanitize(args.template) } else { args.template = undefined }
  if (!args.gfpgan_strength) { args.gfpgan_strength = 0 }
  if (!args.upscale_level) { args.upscale_level = '' }
  if (!args.upscale_strength) { args.upscale_strength = 0.75 }
  if (!args.variation_amount) { args.variation_amount = 0 }
  if (!args.with_variations) { args.with_variations = '' }
  args.timestamp = moment()
  args.prompt = sanitize(args._.join(' '))
  var newJob = {
    id: queue.length+1,
    status: 'new',
    cmd: request.cmd,
    userid: request.userid,
    username: request.username,
    discriminator: request.discriminator,
    timestampRequested: args.timestamp,
    channel: request.channelid,
    attachments: request.attachments,
    seed: args.seed,
    number: args.number,
    width: args.width,
    height: args.height,
    steps: args.steps,
    prompt: args.prompt,
    scale: args.scale,
    sampler: args.sampler,
    renderer: args.renderer,
    strength: args.strength,
    template: args.template,
    gfpgan_strength: args.gfpgan_strength,
    upscale_level: args.upscale_level,
    upscale_strength: args.upscale_strength,
    seamless: args.seamless,
    variation_amount: args.variation_amount,
    with_variations: args.with_variations,
    results: []
  }
  newJob.cost = costCalculator(newJob)
  queue.push(newJob)
  dbWrite() // Push db write after each new addition
  processQueue()
}

function queueStatus() {
  if(dialogs.queue!==null){dialogs.queue.delete().catch((err)=>{console.error(err)})}
  var statusMsg=':information_source: New: `'+queue.filter(x=>x.status==='new').length+'`, Rendering: `'+queue.filter(x=>x.status==='rendering').length+'`, Done: `'+queue.filter(x=>x.status==='done').length + '`, Total: `'+queue.length+'`, Users: `'+queue.map(x=>x.userid).filter(unique).length+'`'
  if (queue.filter(x=>x.status==='rendering').length>0) {
    statusMsg+='\n:track_next:`'+queue.filter(x=>x.status==='rendering')[0].prompt + '`'
    if (queue.filter(x=>x.status==='rendering')[0].number !== 1) {statusMsg+='x'+queue.filter(x=>x.status==='rendering')[0].number}
    statusMsg+=' for ' + queue.filter(x=>x.status==='rendering')[0].username
  }
  bot.createMessage(config.channelID,statusMsg).then(x=>{dialogs.queue=x})
}
function prepSlashCmd(options) { // Turn partial options into full command for slash commands, hate the redundant code here
  var job = {}
  var defaults = [{ name: 'prompt', value: ''},{name: 'width', value: defaultSize},{name:'height',value:defaultSize},{name:'steps',value:50},{name:'scale',value:7.5},{name:'sampler',value:'k_lms'},{name:'seed', value: getRandomSeed()},{name:'strength',value:0.75},{name:'number',value:1},{name:'gfpgan_strength',value:0},{name:'upscale_strength',value:0.75},{name:'upscale_level',value:''},{name:'seamless',value:'off'},{name:'variation_amount',value:0},{name:'with_variations',value:''}]
  defaults.forEach(d=>{ if (options.find(o=>{ if (o.name===d.name) { return true } else { return false } })) { job[d.name] = options.find(o=>{ if (o.name===d.name) { return true } else { return false } }).value } else { job[d.name] = d.value } })
  return job
}
function getCmd(newJob){ return newJob.prompt+' --width ' + newJob.width + ' --height ' + newJob.height + ' --seed ' + newJob.seed + ' --scale ' + newJob.scale + ' --sampler ' + newJob.sampler + ' --steps ' + newJob.steps + ' --strength ' + newJob.strength + ' --n ' + newJob.number + ' --gfpgan_strength ' + newJob.gfpgan_strength + ' --upscale_level ' + newJob.upscale_level + ' --upscale_strength ' + newJob.upscale_strength + ' --seamless ' + newJob.seamless + ' --variation_amount ' + newJob.variation_amount + ' --with_variations ' + newJob.with_variations}
function getRandomSeed() {return Math.floor(Math.random() * 4294967295)}
function chat(msg) { if (msg !== null && msg !== '') { bot.createMessage(config.channelID, msg) } }
// function chatPrivate(msg) { if (msg !== null && msg !== '') { bot.createMessage(config.channelID, { content: msg, flags:64 }) } }
function sanitize (prompt) {
  if (config.bannedWords.length>0) { config.bannedWords.split(',').forEach((bannedWord, index) => { prompt = prompt.replace(bannedWord,'') }) }
  return prompt.replace(/[^一-龠ぁ-ゔァ-ヴーa-zA-Z0-9_ａ-ｚＡ-Ｚ０-９々〆〤ヶ()\*\[\] ,.\:]/g, '') // (/[^一-龠ぁ-ゔァ-ヴーa-zA-Z0-9_ａ-ｚＡ-Ｚ０-９々〆〤ヶ()\*\[\] ,.\:]/g, '')
}
function base64Encode(file) { var body = fs.readFileSync(file); return body.toString('base64') }
function authorised(member) { // Basic request auth-just role based for now
  if (member.roles.includes(config.roleID)) {
    return true
  } else {
    return false
  }
}
function createNewUser(id){
  users.push({id:id,credits:100}) // 100 creds for new users
  dbWrite() // Sync after new user
  console.log('created new user with id ' + id)
}
function userCreditCheck(userID,amount) { // Check if a user can afford a specific amount of credits, create if not existing yet
  var user = users.find(x=>x.id===userID)
  if (!user){
    createNewUser(userID)  
    user = users.find(x=>x.id===userID)
  }
  console.log('id '+user.id+' has '+user.credits+' credits, cost is '+amount)
  if (parseFloat(user.credits)>=parseFloat(amount)){ return true } else { return false }
}
function costCalculator(job) { // Pass in a render, get a cost in credits
  var cost=1 // a normal render base cost, 512x512 50 steps
  var pixelBase=262144 // 512x512 reference
  var pixels=job.width*job.height
  cost=(pixels/pixelBase)*cost
  cost=(job.steps/50)*cost
  if (job.gfpgan_strength!==0){cost=cost*1.05} // 5% charge for gfpgan
  if (job.upscale_level===2){cost=cost*2}   // 2x charge for upscale 2x
  if (job.upscale_level===4){cost=cost*4}   // 4x charge for upscale 4x 
  cost=cost*job.number // Multiply by image count
  return cost.toFixed(2)
}
function creditsRemaining(userID){
  return users.find(x=>x.id===userID).credits
}
function chargeCredits(userID,amount){
  var user=users.find(x=>x.id===userID)
  user.credits=(user.credits-amount).toFixed(2)
  dbWrite()
  console.log('charged id '+userID+' for '+amount+' credits, '+user.credits+' remaining')
}
function creditRecharge(credits,txid,userid){
  var user=users.find(x=>x.id===userid)
  if(!user){createNewUser(userid)}
  user.credits=(parseFloat(user.credits)+parseFloat(credits)).toFixed(2)
  payments.push({credits:credits,txid:txid,userid:userid})
  dbWrite()
  chat(':tada: <@'+userid+'> added :coin:`'+credits+'`, balance is now :coin:`'+user.credits+'`')
}
function dbWrite() {
  // console.log('write db')
  try { fs.writeFileSync(dbFile, JSON.stringify({ queue: queue, users: users, payments: payments })) } catch(err) {console.error(err)}
}
function dbRead() {
  console.log('read db')
  fs.readFile(dbFile,function(err,data){
    if(err){console.error(err)}
    var j = JSON.parse(data)
    queue = j.queue
    users = j.users
    payments = j.payments
  })
}
function getPrices () {
  axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=hive&order=market_cap_asc&per_page=1&page=1&sparkline=false')
    .then((response) => { hiveUsd = response.data[0].current_price; console.log('HIVE is worth $' + hiveUsd) })
    .catch(() => { console.log('Failed to load data from coingecko api') })
}
function rechargePrompt(userid){
  //if(!users.find(x=>x.id===userID)){console.log('user not found');createNewUser(userid)}
  userCreditCheck(userid,1) // make sure the account exists first
  checkNewPayments()
  var paymentAddress = 'ausbit.dev'
  var paymentMemo = config.hivePaymentPrefix+userid
  var paymentLink = ('https://hivesigner.com/sign/transfer?to='+ paymentAddress +'&amount=1.000%20HBD&memo='+paymentMemo)
  var paymentMsg = '<@'+ userid +'> has :coin:`'+ creditsRemaining(userid) +'`\n*Recharging costs HBD`1.000` per :coin:`100` *\nSend HBD to `'+ paymentAddress +'` with the memo `'+ paymentMemo +'`\n*Buy :coin:`100` via HiveSigner*:\n'+paymentLink
  chat(paymentMsg)
  console.log('ID '+userid+' asked for recharge link')
}
function checkNewPayments(){
  var bitmask = ['4',null] // transfers only
  console.log('get account history')
  hive.api.getAccountHistory(config.hivePaymentAddress, -1, 1000, ...bitmask, function(err, result) {
    if(err){console.error(err)}
    if(Array.isArray(result)) {
      result.forEach(r=>{
        var tx = r[1]
        var txType = tx.op[0]
        var op=tx.op[1]
        if (txType==='transfer'&&op.to===config.hivePaymentAddress&&op.memo.startsWith(config.hivePaymentPrefix)){
          var amountCredit=0
          var accountId=op.memo.replace(config.hivePaymentPrefix,'')
          var pastPayment = payments.find(x=>x.txid===tx.trx_id)
          if (pastPayment!==undefined){
          } else {
            coin=op.amount.split(' ')[1]
            amount=parseFloat(op.amount.split(' ')[0])
            if (coin==='HBD'){
              amountCredit = amount*100 // 1000 = 1 HBD, /10 = credit amount
            } else if (coin==='HIVE'){
              console.log('hive payment')
              amountCredit = (amount*hiveUsd)*100 // need hive/hbd price to calculate credits per hive, hardcode $0.50 hive for now
            }
            console.log('processing new payment')
            console.log('amount credit:'+amountCredit+' , amount:'+op.amount)
            creditRecharge(amountCredit,tx.trx_id,accountId)
          }
        }
      })
    } else {
      console.error('error fetching account history (results not array)')
    }
  })
}
async function addRenderApi (id) {
  var job = queue[queue.findIndex(x => x.id === id)] 
  var initimg = null
  job.status = 'rendering'
  queueStatus()
  //console.log(job)
  if (job.template !== undefined) {
    try { initimg = 'data:image/png;base64,' + base64Encode(basePath + job.template + '.png') }
    catch (err) { console.error(err); initimg = null; job.template = '' }
  }
  if (job.attachments.length > 0 && job.attachments[0].content_type === 'image/png') { // && job.msg.attachments.width === '512' && job.msg.attachments.height === '512'
    console.log('fetching attachment from ' + job.attachments[0].proxy_url)
    await axios.get(job.attachments[0].proxy_url, {responseType: 'arraybuffer'})
      .then(res => { initimg = 'data:image/png;base64,' + Buffer.from(res.data).toString('base64'); job.initimg = initimg; console.log('got attachment') })
      .catch(err => { console.error('unable to fetch url: ' + job.attachments[0].proxy_url); console.error(err) })
  }
  var prompt = job.prompt
  var postObject = {
      "prompt": prompt,
      "iterations": job.number,
      "steps": job.steps,
      "cfg_scale": job.scale,
      "sampler_name": job.sampler,
      "width": job.width,
      "height": job.height,
      "seed": job.seed,
      "variation_amount": job.variation_amount,
      "with_variations": job.with_variations,
      "initimg": initimg,
      "strength": job.strength,
      "fit": "on",
      "gfpgan_strength": job.gfpgan_strength,
      "upscale_level": job.upscale_level, // 2 or 4 or ''
      "upscale_strength": job.upscale_strength,
      "initimg_name": '',
    }
  if (job.seamless==='on') { postObject.seamless = 'on' }

  axios.post(apiUrl, postObject)
    .then(res => {
      var data = res.data.split("\n")
      data.pop() // Remove blank line from the end of api output
      job.status = 'failed'
      data.forEach(line => {
        line = JSON.parse(line)
        if (line.event !== 'result'){ return } else {
          job.results.push({filename: line.url, seed: line.seed}) // keep each generated images filename and seed
          line.config.id = job.id
          job.status = 'done'
          postRender(line) }
      })
      rendering = false
      processQueue()
    })
    .catch(error => { console.log('error'); console.error(error) })
}

async function postRender (render) {
  try { fs.readFile(render.url, null, function(err, data) {
    if (err) { console.error(err) } else {
      filename = render.url.split('\\')[render.url.split('\\').length-1].replace(".png","")
      var job = queue[queue.findIndex(x => x.id === render.config.id)]
      var msg = ':brain:<@' + job.userid + '>'
      if (render.config.width !== defaultSize || render.config.height !== defaultSize) { msg+= ':straight_ruler:`' + render.config.width + 'x' + render.config.height + '`' }
      if (job.upscale_level !== '') { msg+= ':mag:**`Upscaled x ' + job.upscale_level + '(' + job.upscale_strength + ')`**'}
      if (job.gfpgan_strength !== 0) { msg+= ':magic_wand:`gfpgan face fix (' + job.gfpgan_strength + ')`'}
      if (job.seamless === 'on') { msg+= ':knot:**`Seamless Tiling`**'}
      if (job.template) { msg+= ':frame_photo:`' + job.template + '` :muscle: `' + render.config.strength + '`'}
      if (job.initimg) { msg+= ':paperclip:` attached template` :muscle: `' + render.config.strength + '`'}
      if (job.variation_amount !== 0) { msg+= ':microbe:**`Variation ' + job.variation_amount + '`**'}
      if (job.with_variations !== '') { msg+= ':linked_paperclips:**variants `' + job.with_variations + '`**'}
      msg+= ':seedling: `' + render.seed + '`:scales:`' + render.config.cfg_scale + '`:recycle:`' + render.config.steps + '`'
      msg+= ':stopwatch:`' + timeDiff(job.timestampRequested, moment()) + 's`'
      msg+= ':file_cabinet: `' + filename + '` :eye: `' + render.config.sampler_name + '`'
      chargeCredits(job.userid,(costCalculator(job))/job.number) // only charge successful renders
      if (job.cost){msg+=':coin:`'+(job.cost/job.number).toFixed(2)+'/'+ creditsRemaining(job.userid) +'`'}
      var newMessage = { content: msg, embeds: [{description: render.config.prompt}], components: [ { type: Constants.ComponentTypes.ACTION_ROW, components: [ ] } ] }
      if (job.upscale_level==='') {
        newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Refresh", custom_id: "refresh-" + job.id, emoji: { name: '🎲', id: null}, disabled: false })
        if (!job.initimg){ newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "10% Variant", custom_id: "refreshVariants-" + job.id + '-' + render.seed, emoji: { name: '🧬', id: null}, disabled: false }) }
        newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Template", custom_id: "template-" + job.id + '-' + filename, emoji: { name: '📷', id: null}, disabled: false })
        // newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Upscale", custom_id: "upscale-" + job.id + '-' + seed, emoji: { name: '🔍', id: null}, disabled: false })
        if (job.template){ newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.DANGER, label: "Remove template", custom_id: "refreshNoTemplate-" + job.id, emoji: { name: '🎲', id: null}, disabled: false })}
      }
      if (newMessage.components[0].components.length===0){delete newMessage.components} // If no components are used there will be a discord api error so remove it
      var filesize = fs.statSync(render.url).size
      if (filesize < 8000000) { // Within discord 8mb filesize limit
        try { bot.createMessage(job.channel, newMessage, {file: data, name: filename + '.png' }) }
        catch (err) {console.error(err)}
      } else {
        if (imgurEnabled() && filesize < 10000000) {
          chat('<@' + job.userid + '> your file was too big for discord, uploading to imgur now..')
          try { imgurupload(render.url).then(upload => { chat({ content: msg, embeds: [{image: {url: upload.link}, description:render.config.prompt}]}) }) }
          catch (err) { console.error(err); chat('Sorry <@' + job.userid + '> imgur uploading failed, contact an admin for your image `' + filename + '.png`') }
        } else if (imgbbEnabled() && filesize < 32000000) {
          chat('<@' + job.userid + '> your file was too big for discord, uploading to imgbb now..')
          try { imgbbupload(render.url).then(upload => { console.log(upload); chat({ content: msg, embeds: [{image: {url: upload.url}, description:render.config.prompt}]}) }) }
          catch (err) { console.error(err); chat('Sorry <@' + job.userid + '> imgbb uploading failed, contact an admin for your image `' + filename + '.png`') }
        } else {
          chat('Sorry <@' + job.userid + '> but your file was too big for discord, contact an admin for your image `' + filename + '.png`')
        }
      }
    }
    })
  }
  catch(err) {console.error(err)}
}

function processQueue () {
  var nextJob = queue[queue.findIndex(x => x.status === 'new')]
  if (nextJob!==undefined&&rendering===false) {
    if (userCreditCheck(nextJob.userid,costCalculator(nextJob))) {
      rendering=true
      console.info(nextJob.username+':'+nextJob.cmd)
      addRenderApi(nextJob.id)
    } else {
      console.log(nextJob.username+' cant afford this render, denying')
      console.log('cost: '+costCalculator(nextJob))
      console.log('credits remaining: '+creditsRemaining(nextJob.userid))
      nextJob.status='failed'
      chat('sorry <@'+nextJob.userid+'> you don\'t have enough credits for that render (cost'+ costCalculator(nextJob) +').')
      if(config.hivePaymentAddress.length>0){
        rechargePrompt(nextJob.userid)
      } else {
        chat('An admin can manually top up your credit with\n`!credit '+ nextJob.userid +' 1`')
      }
      processQueue()
    }
  }
}

const unique = (value, index, self) => { return self.indexOf(value) === index }
function timeDiff (date1,date2) { return date2.diff(date1, 'seconds') }
var randoms = ['prompt','artist','city','genre','medium','emoji','subject','madeof','style','animal','bodypart','gerund','verb','adverb','adjective','star']
function getRandom(what) { if (randoms.includes(what)) { try { var lines = fs.readFileSync('txt\\' + what + '.txt', 'utf-8').split(/r?\n/); return lines[Math.floor(Math.random()*lines.length)] } catch (err) { console.error(err)} } else { return what } }
function replaceRandoms (input) {
  var output=input
  randoms.forEach(x=>{
    var wordToReplace = '{'+x+'}'
    var wordToReplaceLength = wordToReplace.length
    for (let i=0;i<input.split(wordToReplace).length-1;i++){
      var wordToReplacePosition = output.indexOf(wordToReplace)
      output = output.substr(0,wordToReplacePosition)+getRandom(x)+output.substr(wordToReplacePosition+wordToReplaceLength)
    }
  })
  return output
}

function imgurEnabled() { if (config.imgurClientID.length > 0) { return true } else { return false } }
async function imgurupload(file) {
  console.log('uploading via imgur api')
  const response = await imgur.upload({ image: fs.createReadStream(file), type: 'stream'})
  console.log(response.data)
  return response.data
}
function imgbbEnabled() { if (config.imgbbClientID.length > 0) { return true } else { return false } }
async function imgbbupload(file) {
  console.log('uploading via imgbb api')
  console.log(file)
  imgbb(config.imgbbClientID, file)
    .then((response) => {console.log(response); return response})
    .catch((error) => console.error(error))
}

const log = console.log.bind(console)

// Monitor new files entering watchFolder, post image with filename.
function process (file) {
  try {
    if (file.endsWith('.png')||file.endsWith('jpg')){
      fs.readFile(file, null, function(err, data) {
        if(err){console.error(err)}else{
          filename=file.replace(basePath, "").replace(".png","").replace(".jpg","")
          msg=':file_cabinet:'+filename
          bot.createMessage(config.channelID, msg, {file: data, name: filename })
        }
      })
    }
  }catch(err){console.error(err)}
}
if(config.filewatcher==="true") {
  const renders=chokidar.watch(config.watchFolder, {persistent: true,ignoreInitial: true,usePolling: false,awaitWriteFinish:{stabilityThreshold: 500,pollInterval: 500}})
  renders.on('add',file=>{process(file)})
}
