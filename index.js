// Setup, loading libraries and initial config
const config = require('dotenv').config().parsed
if (!config||!config.apiUrl||!config.basePath||!config.channelID||!config.adminID||!config.discordBotKey||!config.pixelLimit||!config.fileWatcher||!config.samplers) { throw('Please re-read the setup instructions at https://github.com/ausbitbank/stable-diffusion-discord-bot , you are missing the required .env configuration file or options') }
const Eris = require("eris")
const Constants = Eris.Constants
const Collection = Eris.Collection
const fs = require('fs')
const path = require('path') // still needed?
const axios = require('axios')
var parseArgs = require('minimist')
const chokidar = require('chokidar')
const moment = require('moment')
const { ImgurClient } = require('imgur')
const imgur = new ImgurClient({ clientId: config.imgurClientID})
const imgbb = require("imgbb-uploader")
const DIG = require("discord-image-generation")
const log = console.log.bind(console)
function debugLog(m){if(config.showDebug){log(m)}}
const dJSON = require('dirty-json')
var colors = require('colors')
const debounce = require('debounce')
var jimp = require('jimp')
const FormData = require('form-data')
const io = require("socket.io-client")
const socket = io(config.apiUrl,{reconnect: true})
var paused=false
var queue = []
var users = []
var payments = []
dbRead()
// Setup scheduler, start repeating checks
var schedule = []
var dbScheduleFile='./dbSchedule.json' // flat file db for schedule
dbScheduleRead()
var cron = require('node-cron')
// hive payment checks. On startup, every 30 minutes and on a !recharge call
const hive = require('@hiveio/hive-js')
const { exit } = require('process')
if(config.creditsDisabled==='true'){var creditsDisabled=true}else{var creditsDisabled=false}
if(config.showFilename==='true'){var showFilename=true}else{var showFilename=false}
if(config.hivePaymentAddress.length>0 && !creditsDisabled){
  hive.config.set('alternative_api_endpoints',['https://rpc.ausbit.dev','https://api.deathwing.me','https://api.c0ff33a.uk','https://hived.emre.sh']) 
  var hiveUsd = 0.4
  getPrices()
  cron.schedule('0,15,30,45 * * * *', () => { log('Checking account history every 15 minutes'.grey); checkNewPayments() })
  cron.schedule('0,30 * * * *', () => { log('Updating hive price every 30 minutes'.grey); getPrices() })
  cron.schedule('0 */12 * * *', () => { log('Recharging users with no credit every 12 hrs'.bgCyan.bold); freeRecharge() }) // Comment this out if you don't want free regular topups of low balance users
}
const bot = new Eris.CommandClient(config.discordBotKey, {
  intents: ["guilds", "guildMessages", "messageContent", "guildMembers", "directMessages", "guildMessageReactions"],
  description: "Just a slave to the art, maaan",
  owner: "ausbitbank",
  prefix: "!",
  reconnect: 'auto',
  compress: true,
  getAllUsers: false, //drastically affects startup time if true, only used for richlist function atm
})
const defaultSize = parseInt(config.defaultSize)||512
const defaultSteps = parseInt(config.defaultSteps)||50
const defaultScale = parseInt(config.defaultScale)||7.5
const defaultMaxDiscordFileSize=parseInt(config.defaultMaxDiscordFileSize)||8000000  // TODO detect server boost status and increase this if boosted
const basePath = config.basePath
var rembg=config.rembg||'http://127.0.0.1:5000?url='
var defaultModel=config.defaultModel||'stable-diffusion-1.5'
var currentModel='notInitializedYet'
var models=null
// load samplers from config
var samplers=config.samplers.split(',')
var samplersSlash=[]
samplers.forEach((s)=>{samplersSlash.push({name: s, value: s})})
var defaultSampler=samplers[0]
debugLog('Enabled samplers:')
debugLog(samplers)
debugLog('Default sampler:'+defaultSampler)
var rendering = false
var dialogs = {queue: null} // Track and replace our own messages to reduce spam
// load text files from txt directory, usable as {filename} in prompts, will return a random line from file
var randoms=[]
try{
  fs.readdir('txt',(err,files)=>{
    if(err){log('Unable to read txt file directory'.bgRed);log(err)}
    files.forEach((file)=>{if (file.includes('.txt')){log('Adding text file: '.dim+file.replace('.txt',''));randoms.push(file.replace('.txt',''))}})
  })
}catch(err){log('Unable to read txt file directory'.bgRed);log(err)}
if(randoms.includes('prompt')){randoms.splice(randoms.indexOf('prompt'),1);randoms.splice(0,0,'prompt')} // Prompt should be interpreted first

// slash command setup - beware discord global limitations on the size/amount of slash command options
var slashCommands = [
  {
    name: 'dream',
    description: 'Create a new image from your prompt',
    options: [
      {type: 3, name: 'prompt', description: 'what would you like to see ?', required: true, min_length: 1, max_length:750 },
      {type: 4, name: 'width', description: 'width of the image in pixels (250-~1024)', required: false, min_value: 256, max_value: 1024 },
      {type: 4, name: 'height', description: 'height of the image in pixels (250-~1024)', required: false, min_value: 256, max_value: 1024 },
      {type: 4, name: 'steps', description: 'how many steps to render for (10-250)', required: false, min_value: 5, max_value: 250 },
      {type: 4, name: 'seed', description: 'seed (initial noise pattern)', required: false},
      {type: 10, name: 'strength', description: 'how much noise to add to your template image (0.1-0.9)', required: false, min_value:0.01, max_value:0.99},
      {type: 10, name: 'scale', description: 'how important is the prompt (1-30)', required: false, min_value:1, max_value:30},
      {type: 4, name: 'number', description: 'how many would you like (1-10)', required: false, min_value: 1, max_value: 10},
      {type: 5, name: 'seamless', description: 'Seamlessly tiling textures', required: false},
      {type: 3, name: 'sampler', description: 'which sampler to use (default is '+defaultSampler+')', required: false, choices: samplersSlash},
      {type: 11, name: 'attachment', description: 'use template image', required: false},
      {type: 10, name: 'gfpgan_strength', description: 'GFPGan strength (0-1)(low= more face correction, high= more accuracy)', required: false, min_value: 0, max_value: 1},
      {type: 10, name: 'codeformer_strength', description: 'Codeformer strength (0-1)(low= more face correction, high= more accuracy)', required: false, min_value: 0, max_value: 1},
      {type: 3, name: 'upscale_level', description: 'upscale amount', required: false, choices: [{name: 'none', value: '0'},{name: '2x', value: '2'},{name: '4x', value: '4'}]},
      {type: 10, name: 'upscale_strength', description: 'upscale strength (0-1)(smoothing/detail loss)', required: false, min_value: 0, max_value: 1},
      {type: 10, name: 'variation_amount', description: 'how much variation from the original image (0-1)(need seed+not k_euler_a sampler)', required: false, min_value:0.01, max_value:1},
      {type: 3, name: 'with_variations', description: 'Advanced variant control, provide seed(s)+weight eg "seed:weight,seed:weight"', required: false, min_length:4,max_length:100},
      {type: 10, name: 'threshold', description: 'Advanced threshold control (0-10)', required: false, min_value:0, max_value:40},
      {type: 10, name: 'perlin', description: 'Add perlin noise to your image (0-1)', required: false, min_value:0, max_value:1},
      {type: 5, name: 'hires_fix', description: 'High resolution fix (re-renders twice using template)', required: false},
      {type: 3, name: 'model', description: 'Change the model/checkpoint - see !models for more info', required: false,   min_length: 3, max_length:40}
    ],
    cooldown: 500,
    execute: (i) => {
      // get attachments
      if (i.data.resolved && i.data.resolved.attachments && i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))){
        var attachmentOrig=i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))
        var attachment=[{width:attachmentOrig.width,height:attachmentOrig.height,size:attachmentOrig.size,proxy_url:attachmentOrig.proxyUrl,content_type:attachmentOrig.contentType,filename:attachmentOrig.filename,id:attachmentOrig.id}]
      } else {
        var attachment=[]
      }
      // below allows for the different data structure in public interactions vs direct messages
      if (i.member) {
        request({cmd: getCmd(prepSlashCmd(i.data.options)), userid: i.member.id, username: i.member.user.username, discriminator: i.member.user.discriminator, bot: i.member.user.bot, channelid: i.channel.id, attachments: attachment})
      } else if (i.user){
        request({cmd: getCmd(prepSlashCmd(i.data.options)), userid: i.user.id, username: i.user.username, discriminator: i.user.discriminator, bot: i.user.bot, channelid: i.channel.id, attachments: attachment})
      }
    }
  },
  {
    name: 'random',
    description: 'Show me a random prompt from the library',
    options: [ {type: 3, name: 'prompt', description: 'Add these keywords to a random prompt', required: false} ],
    cooldown: 500,
    execute: (i) => {
      var prompt = ''
      if (i.data.options) { prompt+= i.data.options[0].value + ' ' }
      prompt += getRandom('prompt')
      // below allows for the different data structure in public interactions vs direct messages
      if (i.member){ // pubchan
        request({cmd: prompt, userid: i.member.id, username: i.member.username, discriminator: i.member.discriminator, bot: i.member.bot, channelid: i.channel.id, attachments: []})
      } else if (i.user) { // direct message
        request({cmd: prompt, userid: i.user.id, username: i.user.username, discriminator: i.user.discriminator, bot: i.user.bot, channelid: i.channel.id, attachments: []})
      }
    }
  },
  {
    name: 'lexica',
    description: 'Search lexica.art with keywords or an image url',
    options: [ {type: 3, name: 'query', description: 'What are you looking for', required: true} ],
    cooldown: 500,
    execute: (i) => {
      var query = ''
      if (i.data.options) {
        query+= i.data.options[0].value
        if (i.member){var who=i.member}else if(i.user){var who=i.user}
        log('lexica search from '+who.username)
        lexicaSearch(query,i.channel.id)
      }
    }
  },
  {
    name: 'recharge',
    description: 'Recharge your render credits with Hive, HBD or Bitcoin over lightning network',
    cooldown: 500,
    execute: (i) => {if (i.member) {rechargePrompt(i.member.id,i.channel.id)} else if (i.user){rechargePrompt(i.user.id,i.channel.id)}}
  }
]

// Functions

function request(request){
  // request = { cmd: string, userid: int, username: string, discriminator: int, bot: false, channelid: int, attachments: {}, }
  if (request.cmd.includes('{')) { request.cmd = replaceRandoms(request.cmd) } // swap randomizers
  var args = parseArgs(request.cmd.split(' '),{string: ['template','init_img','sampler','text_mask'],boolean: ['seamless','hires_fix']}) // parse arguments //
  // messy code below contains defaults values, check numbers are actually numbers and within acceptable ranges etc
  // let sanitize all the numbers first
  debugLog(args)
  for (n in [args.width,args.height,args.steps,args.seed,args.strength,args.scale,args.number,args.threshold,args.perlin]){
    n=n.replace(/[^０-９\.]/g, '') // not affecting the actual args
  }
  if (!args.width||!Number.isInteger(args.width)||args.width<256){args.width=defaultSize}
  if (!args.height||!Number.isInteger(args.height)||args.height<256){args.height=defaultSize}
  if ((args.width*args.height)>config.pixelLimit) { // too big, try to compromise, find aspect ratio and use max resolution of same ratio
    if (args.width===args.height){
      args.width=closestRes(Math.sqrt(config.pixelLimit)); args.height=closestRes(Math.sqrt(config.pixelLimit))
    } else if (args.width>args.height){
      var ratio = args.height/args.width
      args.width=closestRes(Math.sqrt(config.pixelLimit))
      args.height=closestRes(args.width*ratio)
    } else {
      var ratio = args.width/args.height
      args.height=closestRes(Math.sqrt(config.pixelLimit))
      args.width=closestRes(args.height*ratio)
    }
    args.width=parseInt(args.width);args.height=parseInt(args.height)
    log('compromised resolution to '+args.width+'x'+args.height)
  }
  if (!args.steps||!Number.isInteger(args.steps)||args.steps>250){args.steps=defaultSteps} // max 250 steps, default 50
  if (!args.seed||!Number.isInteger(args.seed)||args.seed<1||args.seed>4294967295){args.seed=getRandomSeed()}
  if (!args.strength||args.strength>=1||args.strength<=0){args.strength=0.75}
  if (!args.scale||args.scale>200||args.scale<1){args.scale=defaultScale}
  if (!args.sampler){args.sampler=defaultSampler}
  if (args.n){args.number=args.n}
  if (!args.number||!Number.isInteger(args.number)||args.number>10||args.number<1){args.number=1}
  if (!args.renderer||['localApi'].includes(args.renderer)){args.renderer='localApi'}
  if (!args.gfpgan_strength){args.gfpgan_strength=0}
  if (!args.codeformer_strength){args.codeformer_strength=0}
  if (!args.upscale_level){args.upscale_level=''}
  if (!args.upscale_strength){args.upscale_strength=0.75}
  if (!args.variation_amount||args.variation_amount>1||args.variation_amount<0){args.variation_amount=0}
  if (!args.with_variations){args.with_variations=[]}else{log(args.with_variations)}//; args.with_variations=args.with_variations.toString()
  if (!args.threshold){args.threshold=0}
  if (!args.perlin||args.perlin>1||args.perlin<0){args.perlin=0}
  if (!args.model||args.model===undefined||!Object.keys(models).includes(args.model)){args.model=defaultModel}else{args.model=args.model.toLowerCase()}
  args.timestamp=moment()
  args.prompt=sanitize(args._.join(' '))
  if (args.prompt.length===0){args.prompt=getRandom('prompt');log('empty prompt found, adding random')} 
  var newJob={
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
    threshold: args.threshold,
    perlin: args.perlin,
    gfpgan_strength: args.gfpgan_strength,
    codeformer_strength: args.codeformer_strength,
    upscale_level: args.upscale_level,
    upscale_strength: args.upscale_strength,
    variation_amount: args.variation_amount,
    with_variations: args.with_variations,
    results: [],
    model: args.model
  }
  if(args.text_mask){newJob.text_mask=args.text_mask}
  if(args.mask){newJob.text_mask=args.mask}
  if(args.mask_strength){newJob.mask_strength=args.mask_strength}
  if(args.invert_mask===true||args.invert_mask==='True'){newJob.invert_mask=true}else{newJob.invert_mask=false}
  if(args.seamless===true||args.seamless==='True'){newJob.seamless=true}else{newJob.seamless=false}
  if(args.hires_fix===true||args.hires_fix==='True'){newJob.hires_fix=true}else{newJob.hires_fix=false}
  if(newJob.channel==='webhook'&&request.webhook){newJob.webhook=request.webhook}
  if(creditsDisabled){newJob.cost=0}else{newJob.cost=costCalculator(newJob)}
  queue.push(newJob)
  dbWrite() // Push db write after each new addition
  processQueue()
  // acknowledge received job with ethereal message here?
}
function queueStatus() {
  if(dialogs.queue!==null){dialogs.queue.delete().catch((err)=>{debugLog(err)})}
  var done=queue.filter((j)=>j.status==='done')
  var doneGps=tidyNumber((getPixelStepsTotal(done)/1000000).toFixed(0))
  var wait=queue.filter((j)=>j.status==='new')
  var waitGps=tidyNumber((getPixelStepsTotal(wait)/1000000).toFixed(0))
  var renderq=queue.filter((j)=>j.status==='rendering')
  var renderGps=tidyNumber((getPixelStepsTotal(renderq)/1000000).toFixed(0))
  var totalWaitLength=parseInt(wait.length)+parseInt(renderq.length)
  var totalWaitGps=parseInt(waitGps)+parseInt(renderGps)
  var statusMsg=':busts_in_silhouette: `'+queue.map(x=>x.userid).filter(unique).length+'`/`'+users.length+'` :european_castle:`'+bot.guilds.size+'` :fire: `'+doneGps+'`'
  if(totalWaitLength>0){statusMsg=':ticket:`'+totalWaitLength+'`(`'+totalWaitGps+'`) '+statusMsg} else {statusMsg=':ticket:`'+totalWaitLength+'`'+statusMsg}
  if(renderq.length>0){
    var next = renderq[0]
    statusMsg+='\n:track_next:'
    statusMsg+='`'+next.prompt + '`'
    if(next.number!==1){statusMsg+='x'+next.number}
    if(next.upscale_level!==''){statusMsg+=':mag:'}
    if(next.gfpgan_strength!==0){statusMsg+=':lipstick:'}
    if(next.codeformer_strength!==0){statusMsg+=':lipstick:'}
    if(next.variation_amount!==0){statusMsg+=':microbe:'}
    if(next.steps>defaultSteps){statusMsg+=':recycle:'}
    if(next.seamless===true){statusMsg+=':knot:'}
    if(next.hires_fix===true){statusMsg+=':telescope:'}
    if(next.init_img && next.init_img!==''){statusMsg+=':paperclip:'}
    if((next.width!==next.height)||(next.width>defaultSize)){statusMsg+=':straight_ruler:'}
    statusMsg+=' :brain: **'+next.username+'**#'+next.discriminator+' :coin:`'+costCalculator(next)+'` :fire:`'+renderGps+'`'
  }
  if(next&&next.channel!=='webhook'){var chan=next.channel} else {var chan=config.channelID}
  bot.createMessage(chan,statusMsg).then(x=>{dialogs.queue=x}).catch((err)=>console.error(err))
}
queueStatus=debounce(queueStatus,2000,true)
function closestRes(n){ // diffusion needs a resolution as a multiple of 64 pixels, find the closest
    var q, n1, n2; var m=64
    q=n/m
    n1=m*q
    if((n*m)>0){n2=m*(q+1)}else{n2=m*(q-1)}
    if(Math.abs(n-n1)<Math.abs(n-n2)){return n1.toFixed(0)}
    return n2.toFixed(0)
}
function prepSlashCmd(options) { // Turn partial options into full command for slash commands, hate the redundant code here
  var job={}
  var defaults=[{ name: 'prompt', value: ''},{name: 'width', value: defaultSize},{name:'height',value:defaultSize},{name:'steps',value:defaultSteps},{name:'scale',value:defaultScale},{name:'sampler',value:defaultSampler},{name:'seed', value: getRandomSeed()},{name:'strength',value:0.75},{name:'number',value:1},{name:'gfpgan_strength',value:0},{name:'codeformer_strength',value:0},{name:'upscale_strength',value:0.75},{name:'upscale_level',value:''},{name:'seamless',value:false},{name:'variation_amount',value:0},{name:'with_variations',value:[]},{name:'threshold',value:0},{name:'perlin',value:0},{name:'hires_fix',value:false},{name:'model',value:defaultModel}]
  defaults.forEach(d=>{if(options.find(o=>{if(o.name===d.name){return true}else{return false}})){job[d.name]=options.find(o=>{if(o.name===d.name){return true}else{return false}}).value}else{job[d.name]=d.value}})
  return job
}
function getCmd(newJob){ return newJob.prompt+' --width ' + newJob.width + ' --height ' + newJob.height + ' --seed ' + newJob.seed + ' --scale ' + newJob.scale + ' --sampler ' + newJob.sampler + ' --steps ' + newJob.steps + ' --strength ' + newJob.strength + ' --n ' + newJob.number + ' --gfpgan_strength ' + newJob.gfpgan_strength + ' --codeformer_strength ' + newJob.codeformer_strength + ' --upscale_level ' + newJob.upscale_level + ' --upscale_strength ' + newJob.upscale_strength + ' --threshold ' + newJob.threshold + ' --perlin ' + newJob.perlin + ' --seamless ' + newJob.seamless + ' --hires_fix ' + newJob.hires_fix + ' --variation_amount ' + newJob.variation_amount + ' --with_variations ' + newJob.with_variations + ' --model ' + newJob.model}
function getRandomSeed(){return Math.floor(Math.random()*4294967295)}
function chat(msg){if(msg!==null&&msg!==''){try{bot.createMessage(config.channelID, msg)}catch(err){log(err)}}}
function chatChan(channel,msg){if(msg!==null&&msg!==''){try{bot.createMessage(channel, msg)}catch(err){log('Failed to send with error:'.bgRed);log(err)}}}
function sanitize(prompt){
  if(config.bannedWords.length>0){config.bannedWords.split(',').forEach((bannedWord,index)=>{prompt=prompt.replace(bannedWord,'')})}
  return prompt.replace(/[^一-龠ぁ-ゔァ-ヴーa-zA-Z0-9_ａ-ｚＡ-Ｚ０-９々〆〤ヶ+()=!\"\&\*\[\]<>\\\/\- ,.\:]/g, '').replace('`','') // (/[^一-龠ぁ-ゔァ-ヴーa-zA-Z0-9_ａ-ｚＡ-Ｚ０-９々〆〤ヶ()\*\[\] ,.\:]/g, '')
}
function base64Encode(file){var body=fs.readFileSync(file);return body.toString('base64')}
function authorised(who,channel,guild) {
  if (userid===config.adminID){return true} // always allow admin
  var bannedUsers=[];var allowedGuilds=[];var allowedChannels=[];var ignoredChannels=[];var userid=null;var username=null
  if (who.user && who.user.id && who.user.username){userid = who.user.id;username = who.user.username} else {userid=who.author.id;username=who.author.username}
  if (config.bannedUsers.length>0){bannedUsers=config.bannedUsers.split(',')}
  if (config.allowedGuilds.length>0){allowedGuilds=config.allowedGuilds.split(',')}
  if (config.allowedChannels.length>0){allowedChannels=config.allowedChannels.split(',')}
  if (config.ignoredChannels.length>0){ignoredChannels=config.ignoredChannels.split(',')}
  if (bannedUsers.includes(userid)){
    log('auth fail, user is banned:'+username);return false
  } else if(guild && allowedGuilds.length>0 && !allowedGuilds.includes(guild)){
    log('auth fail, guild not allowed:'+guild);return false
  } else if(channel && allowedChannels.length>0 && !allowedChannels.includes(channel)){
    log('auth fail, channel not allowed:'+channel);return false
  } else if (channel && ignoredChannels.length>0 && ignoredChannels.includes(channel)){
    log('auth fail, channel is ignored:'+channel);return false
  } else { return true }
}
function createNewUser(id){
  log('createnewuser called with id',id)
  if(id.id){id=id.id}
  users.push({id:id, credits:100}) // 100 creds for new users
  dbWrite() // Sync after new user
  log('created new user with id '.bgBlue.black.bold + id)
}
function userCreditCheck(userID,amount) { // Check if a user can afford a specific amount of credits, create if not existing yet
  var user=users.find(x=>x.id===String(userID))
  if(!user){createNewUser(userID);user=users.find(x=>x.id===String(userID))}
  if(parseFloat(user.credits)>=parseFloat(amount)||creditsDisabled){return true}else{return false}
}
function costCalculator(job) {                 // Pass in a render, get a cost in credits
  var cost=1                                   // a normal render base cost, 512x512 50 steps
  var pixelBase=262144                         // 512x512 reference pixel size
  var pixels=job.width*job.height              // How many pixels does this render use?
  cost=(pixels/pixelBase)*cost                 // premium or discount for resolution relative to default
  cost=(job.steps/50)*cost                     // premium or discount for step count relative to default
  if (job.gfpgan_strength!==0){cost=cost*1.05} // 5% charge for gfpgan face fixing (minor increased processing time)
  if (job.codeformer_strength!==0){cost=cost*1.05} // 5% charge for gfpgan face fixing (minor increased processing time)
  if (job.upscale_level===2){cost=cost*1.5}    // 1.5x charge for upscale 2x (increased processing+storage+bandwidth)
  if (job.upscale_level===4){cost=cost*2}      // 2x charge for upscale 4x 
  if (job.hires_fix===true){cost=cost*1.5}     // 1.5x charge for hires_fix (renders once at half resolution, then again at full)
  if (job.channel!==config.channelID){cost=cost*1.1}// 10% charge for renders outside of home channel
  cost=cost*job.number                         // Multiply by image count
  if(creditsDisabled){return 0} else {return cost.toFixed(2)} // Return cost to 2 decimal places if credits enabled
}
function creditsRemaining(userID){return users.find(x=>x.id===userID).credits}
function chargeCredits(userID,amount){
  if(!creditsDisabled){
    var user=users.find(x=>x.id===userID)
    user.credits=(user.credits-amount).toFixed(2)
    dbWrite()
    var z='charged id '+userID+' - '+amount+'/'
    if(user.credits>90){z+=user.credits.bgBrightGreen.white}else if(user.credits>50){z+=user.credits.bgGreen.black}else if(user.credits>10){z+=user.credits.bgBlack.white}else{z+=user.credits.bgRed.white}
    log(z.dim.bold)
  }
}
function creditRecharge(credits,txid,userid,amount,from){
  var user=users.find(x=>x.id===userid)
  if(!user){createNewUser(userid)}
  if(user&&user.credits){user.credits=(parseFloat(user.credits)+parseFloat(credits)).toFixed(2)}
  if(txid!=='manual'){
    payments.push({credits:credits,txid:txid,userid:userid,amount:amount})
    var paymentMessage = ':tada: <@'+userid+'> added :coin:`'+credits+'`, balance is now :coin:`'+user.credits+'`\n:heart_on_fire: Thanks `'+from+'` for the `'+amount+'` donation to the GPU fund.\n Type !recharge to get your own topup info'
    chat(paymentMessage)
  }
  dbWrite()
}
function freeRecharge(){
  // allow for regular topups of empty accounts
  // new users get 100 credits on first appearance, then freeRechargeAmount more every 12 hours IF their balance is less then freeRechargeMinBalance
  var freeRechargeMinBalance=parseInt(config.freeRechargeMinBalance)||10
  var freeRechargeAmount=parseInt(config.freeRechargeAmount)||10
  var freeRechargeUsers=users.filter(u=>u.credits<freeRechargeMinBalance)
  if(freeRechargeUsers.length>0){
    log(freeRechargeUsers.length+' users with balances below '+freeRechargeMinBalance+' getting a free '+freeRechargeAmount+' credit topup')
    freeRechargeUsers.forEach(u=>{
      u.credits = parseFloat(u.credits)+freeRechargeAmount // Incentivizes drain down to 9 for max free charge leaving balance at 19
      // u.credits = 10 // Incentivizes completely emptying balance for max free charge leaving balance at 10
      directMessageUser(u.id,':fireworks: You received a free '+freeRechargeAmount+' :coin: topup!\n:information_source:Everyone with a balance below '+freeRechargeMinBalance+' will get this once every 12 hours')
    })
    chat(':fireworks:'+freeRechargeUsers.length+' users with a balance below `'+freeRechargeMinBalance+'`:coin: just received their free credit recharge')
    dbWrite()
  }else{
    log('No users eligible for free credit recharge')
  }
}
function dbWrite(){
  try{
    fs.writeFileSync('dbQueue.json',JSON.stringify({queue:queue}))
    fs.writeFileSync('dbUsers.json',JSON.stringify({users:users}))
    fs.writeFileSync('dbPayments.json',JSON.stringify({payments:payments}))
  }catch(err){log('Failed to write db files'.bgRed);log(err)}}
function dbRead() {
  try{
    queue=JSON.parse(fs.readFileSync('dbQueue.json')).queue
    users=JSON.parse(fs.readFileSync('dbUsers.json')).users
    payments=JSON.parse(fs.readFileSync('dbPayments.json')).payments
  } catch (err){log('Failed to read db files'.bgRed);log(err)}
}
function dbScheduleRead(){
  log('read schedule db'.grey.dim)
  try{
    fs.readFile(dbScheduleFile,function(err,data){
      if(err){console.error(err)}
      var j=JSON.parse(data)
      schedule=j.schedule
      scheduleInit()
    })
  }
  catch(err){console.error('failed to read schedule db');console.error(err)}
}
function scheduleInit(){
  // cycle through the active schedule jobs, set up render jobs with cron
  log('init schedule'.grey)
  schedule.filter(s=>s.enabled==='True').forEach(s=>{
    log('Scheduling job: '.grey+s.name)
    cron.schedule(s.cron,()=>{
      log('Running scheduled job: '.grey+s.name)
      var randomPrompt=s.prompts[Math.floor(Math.random()*s.prompts.length)].prompt
      var newRequest={cmd: randomPrompt, userid: s.admins[0].id, username: s.admins[0].username, discriminator: s.admins[0].discriminator, bot: 'False', channelid: s.channel, attachments: []}
      if(s.onlyOnIdle==="True"){if(queue.filter((q)=>q.status==='new').length>0){log('Ignoring scheduled job due to renders')}else{request(newRequest)}}else{request(newRequest)}
    })
  })
}
function getUser(id){var user=bot.users.get(id);if(user){return user}else{return null}}
function getUsername(id){var user=getUser(id);log(user);if(user!==null&&user.username){return user.username}else{return null}}
function getRichList(){
  var u=users.filter(u=>u.credits>11).sort((a,b)=>b.credits-a.credits)
  var richlistMsg='Rich List\n'
  u.forEach(u=>{richlistMsg+=getUsername(u.id)+':coin:`'+u.credits+'`\n'})
  log(richlistMsg)
}
function getPrices () { // TODO fallback to getting costs from hive internal market
  var url='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=hive&order=market_cap_asc&per_page=1&page=1&sparkline=false'
  axios.get(url)
    .then((response)=>{hiveUsd=response.data[0].current_price;log('HIVE: $'+hiveUsd)})
    .catch(()=>{log('Failed to load data from coingecko api'.red.bold);hiveUsd=0.5})
}
function getLightningInvoiceQr(memo){
  var appname=config.hivePaymentAddress+'_discord' // TODO should this be an .env variable?
  return 'https://api.v4v.app/v1/new_invoice_hive?hive_accname='+config.hivePaymentAddress+'&amount=1&currency=HBD&usd_hbd=false&app_name='+appname+'&expiry=300&message='+memo+'&qr_code=png'
}
function getPixelSteps(job){ // raw (width * height) * (steps * number). Does not account for postprocessing
  var p=parseInt(job.width)*parseInt(job.height)
  var s= parseInt(job.steps)*parseInt(job.number)
  var ps=p*s
  return ps
}
function getPixelStepsTotal(jobArray){
  var ps=0
  jobArray.forEach((j)=>{ps=ps+getPixelSteps(j)})
  return ps
}
function rechargePrompt(userid,channel){
  userCreditCheck(userid,1) // make sure the account exists first
  checkNewPayments()
  var paymentMemo=config.hivePaymentPrefix+userid
  var paymentLinkHbd='https://hivesigner.com/sign/transfer?to='+config.hivePaymentAddress+'&amount=1.000%20HBD&memo='+paymentMemo
  var paymentLinkHive='https://hivesigner.com/sign/transfer?to='+config.hivePaymentAddress+'&amount=1.000%20HIVE&memo='+paymentMemo
  var lightningInvoiceQr=getLightningInvoiceQr(paymentMemo)
  var paymentMsg='<@'+userid+'> has :coin:`'+creditsRemaining(userid)+'` left\n\n*Recharging costs `1` usd per :coin:`100` *\nSend HBD or HIVE to `'+config.hivePaymentAddress+'` with the memo `'+paymentMemo+'`\n**Pay $1 with Hbd:** '+paymentLinkHbd+'\n**Pay $1 with Hive:** '+paymentLinkHive
  var freeRechargeMsg='..Or just wait for your free recharge of 10 credits twice a day'
  var paymentMsgObject={content: paymentMsg,embeds:[{description:'Pay $1 via btc lightning network', image:{url:lightningInvoiceQr}}]}
  if (creditsRemaining(userid)<10){paymentMsgObject.embeds.push({footer:{text:freeRechargeMsg}})}
  directMessageUser(userid,paymentMsgObject,channel).catch((err)=>log(err))
  log('ID '+userid+' asked for recharge link')
}
function checkNewPayments(){
  var bitmask=['4','524288'] // transfers and fill_recurrent_transfer only
  var accHistoryLength=config.accHistoryLength||100
  log('Checking recent payments for '.grey+config.hivePaymentAddress.grey)
  // TODO there has to be a more efficient method, revisit below
  hive.api.getAccountHistory(config.hivePaymentAddress, -1, accHistoryLength, ...bitmask, function(err, result) {
    if(err){log(err)}
    if(Array.isArray(result)) {
      result.forEach(r=>{
        var tx=r[1]
        var txType=tx.op[0]
        var op=tx.op[1]
        if(txType==='transfer'&&op.to===config.hivePaymentAddress&&op.memo.startsWith(config.hivePaymentPrefix)){
          var amountCredit=0
          var accountId=op.memo.replace(config.hivePaymentPrefix,'')
          var pastPayment=payments.find(x=>x.txid===tx.trx_id)
          if(pastPayment===undefined){
            coin=op.amount.split(' ')[1]
            amount=parseFloat(op.amount.split(' ')[0])
            if(coin==='HBD'){amountCredit=amount*100}else if(coin==='HIVE'){amountCredit=(amount*hiveUsd)*100}
            log('New Payment: amount credit:'.bgBrightGreen.red+amountCredit+' , amount:'+op.amount)
            creditRecharge(amountCredit,tx.trx_id,accountId,op.amount,op.from)
          }
        }
      })
    } else {log('error fetching account history'.bgRed)}
  })
}
checkNewPayments=debounce(checkNewPayments,30000,true) // at least 30 seconds between checks
function sendWebhook(job){ // TODO eris has its own internal webhook method, investigate and maybe replace this
  let embeds=[{color:getRandomColorDec(),footer:{text:job.prompt},image:{url:job.webhook.imgurl}}]
  axios({method:"POST",url:job.webhook.url,headers:{ "Content-Type": "application/json" },data:JSON.stringify({embeds})})
    .then((response) => {log("Webhook delivered successfully")})
    .catch((error) => {console.error(error)})
}
function postprocessingResult(data){ // TODO unfinished, untested, awaiting new invokeai api release
  log(data)
  var url=data.url
  url=config.basePath+data.url.split('/')[data.url.split('/').length-1]
  var postRenderObject={filename: url, seed: data.metadata.image.seed, width:data.metadata.image.width,height:data.metadata.image.height}
  log(postRenderObject)
  //postRender(postRenderObject)
}
function requestModelChange(newmodel){log('Requesting model change to '+newmodel);if(newmodel===undefined||newmodel==='undefined'){newmodel=defaultModel}socket.emit('requestModelChange',newmodel,()=>{log('requestModelChange loaded')})}
function cancelRenders(){log('Cancelling current render'.bgRed);socket.emit('cancel');queue[queue.findIndex((q)=>q.status==='rendering')-1].status='cancelled';rendering=false}
function generationResult(data){
  var url=data.url
  url=config.basePath+data.url.split('/')[data.url.split('/').length-1]
  var job=queue[queue.findIndex(j=>j.status==='rendering')] // TODO there has to be a better way to know if this is a job from the web interface or the discord bot // upcoming invokeai api release solves this
  // todo detect all-black image result using jimp
  /*try{
    var img=jimp.read(data.url)
    if(img){
      log('loaded image from generationResult')
      var p1=img.intToRGBA(img.getPixelColor(0,0))
      var p2=img.intToRGBA(img.getPixelColor(img.bitmap.width/2,img.bitmap.height/2))
      var p3=img.intToRGBA(img.getPixelColor(img.bitmap.width,img.bitmap.height))
      log(p1,p2,p3)
      if(p1===p2&&p2===p3){log('3 pixels match color, warn');data.warning=true}
    }
  }catch(err){log(err)}*/
  if(job){job.results.push(data);var postRenderObject={id:job.id,filename: url, seed: data.metadata.image.seed, resultNumber:job.results.length-1, width:data.metadata.image.width,height:data.metadata.image.height};postRender(postRenderObject)}else{rendering=false}
  if(job&&job.results.length>=job.number){job.status='done';rendering=false;processQueue()}
}
function initialImageUploaded(data){
  var url=data.url
  var filename=config.basePath+"/"+data.url.replace('outputs/','')
  var id=data.url.split('/')[data.url.split('/').length-1].split('.')[0]
  var job=queue[id-1]
  if(job){job.init_img=filename;emitRenderApi(job)}
}// response unparsed 42["imageUploaded",{"url":"outputs/init-images/002834.4241631408.postprocessed.40678651.png","mtime":1667534834.4564033,"width":1920,"height":1024,"category":"user","destination":"img2img"}]
function runPostProcessing(result, options){socket.emit('runPostProcessing',result,options)}//options={"type":"gfpgan","gfpgan_strength":0.8}
// capture result
// 42["postprocessingResult",{"url":"outputs/000313.3208696952.postprocessed.png","mtime":1665588046.4130075,"metadata":{"model":"stable diffusion","model_id":"stable-diffusion-1.4","model_hash":"fe4efff1e174c627256e44ec2991ba279b3816e364b49f9be2abc0b3ff3f8556","app_id":"lstein/stable-diffusion","app_version":"v1.15","image":{"prompt":[{"prompt":"insanely detailed. instagram photo, kodak portra. by wlop, ilya kuvshinov, krenz cushart, greg rutkowski, pixiv. zbrush sculpt, octane, maya, houdini, vfx. closeup anonymous by ayami kojima in gran turismo for ps 5 cinematic dramatic atmosphere, sharp focus, volumetric lighting","weight":1.0}],"steps":50,"cfg_scale":7.5,"threshold":0,"perlin":0,"width":512,"height":512,"seed":3208696952,"seamless":false,"postprocessing":[{"type":"gfpgan","strength":0.8}],"sampler":"k_lms","variations":[],"type":"txt2img"}}}]
//{type:'gfpgan',gfpgan_strength:0.8}
//{"type":"esrgan","upscale":[4,0.75]}

async function emitRenderApi(job){
  var prompt=job.prompt
  var postObject={
      "prompt": prompt,
      "iterations": job.number,
      "steps": job.steps,
      "cfg_scale": job.scale,
      "threshold": job.threshold,
      "perlin": job.perlin,
      "sampler_name": job.sampler,
      "width": job.width,
      "height": job.height,
      "seed": job.seed,
      "progress_images": false,
      "variation_amount": job.variation_amount,
      "strength": job.strength,
      "fit": true,
      "progress_latents": false,
      "generation_mode": 'txt2img'
  }
  if(job.text_mask){
    var mask_strength=0.5
    if(job.mask_strength){mask_strength=job.mask_strength}
    if(job.invert_mask&&job.invert_mask===true){postObject.invert_mask=true}
    log('adding text mask');postObject.text_mask=[job.text_mask,mask_strength]
  }
  if(job.with_variations.length>0){log('adding with variations');postObject.with_variations=job.with_variations;log(postObject.with_variations)} 
  if(job.seamless&&job.seamless===true){postObject.seamless=true}
  if(job.hires_fix&&job.hires_fix===true){postObject.hires_fix=true}
  var upscale=false
  var facefix=false
  if(job.gfpgan_strength!==0){facefix={type:'gfpgan',strength:job.gfpgan_strength}}
  if (job.codeformer_strength===undefined){job.codeformer_strength=0}
  if(job.codeformer_strength!==0){facefix={type:'codeformer',strength:job.codeformer_strength,codeformer_fidelity:1}}
  if(job.upscale_level!==''){upscale={level:job.upscale_level,strength:job.upscale_strength}}
  if(job.init_img){postObject.init_img=job.init_img}
  if(job&&job.model&&currentModel&&job.model!==currentModel){debugLog('job.model is different to currentModel, switching');requestModelChange(job.model)}
  [postObject,upscale,facefix,job].forEach((o)=>{
    var key=getObjKey(o,undefined)
    if(key!==undefined){log('Missing property for '+key);if(key==='codeformer_strength'){upscale.strength=0}} // not undefined in this context means there is a key that IS undefined, confusing
  })
  socket.emit('generateImage',postObject,upscale,facefix)
  debugLog('sent request',postObject,upscale,facefix)
}
function getObjKey(obj, value){return Object.keys(obj).find(key=>obj[key]===value)}
async function addRenderApi(id){
  var job=queue[queue.findIndex(x=>x.id===id)] 
  var initimg=null
  job.status='rendering'
  queueStatus()
  if(job.attachments[0]&&job.attachments[0].content_type&&job.attachments[0].content_type.startsWith('image')){
    log('fetching attachment from '.bgRed + job.attachments[0].proxy_url)
    await axios.get(job.attachments[0].proxy_url,{responseType: 'arraybuffer'})
      .then(res=>{initimg = Buffer.from(res.data);debugLog('got attachment')})
      .catch(err=>{ console.error('unable to fetch url: ' + job.attachments[0].proxy_url); console.error(err) })
  }
  if (initimg!==null){
    debugLog('uploadInitialImage')
    let writer=await fs.createWriteStream('attach.png').write(initimg)
    let reader=fs.readFileSync('attach.png')
    initimg=reader
    let form = new FormData()
    form.append("file",initimg,job.id+'.png')
    form.append("data",JSON.stringify({kind:'init'}))
    axios.post(config.apiUrl+'/upload',form,{headers:{...form.getHeaders()}})
      .then((response)=>{
        var filename=config.basePath+"/"+response.data.url.replace('outputs/','')
        job.init_img=filename
        job.initimg=null
        emitRenderApi(job)
      })
    .catch((error) => console.error(error))
  }else{
    emitRenderApi(job)
  }
}
async function postRender(render){
  try{fs.readFile(render.filename, null, function(err, data){
    if(err){console.error(err)}else{
      filename=render.filename.split('\\')[render.filename.split('\\').length-1].replace(".png","")
      var job=queue[queue.findIndex(x=>x.id===render.id)]
      var msg=':brain:<@'+job.userid+'>'
      msg+=':straight_ruler:`'+render.width+'x'+render.height+'`'
      if(job.upscale_level!==''){msg+=':mag:**`Upscaledx'+job.upscale_level+' to '+(parseFloat(job.width)*parseFloat(job.upscale_level))+'x'+(parseFloat(job.height)*parseFloat(job.upscale_level))+' ('+job.upscale_strength+')`**'}
      if(job.gfpgan_strength!==0){msg+=':magic_wand:`gfpgan face fix('+job.gfpgan_strength+')`'}
      if(job.codeformer_strength!==0){msg+=':magic_wand:`codeformer face fix(' + job.codeformer_strength + ')`'}
      if(job.seamless===true){msg+=':knot:**`Seamless Tiling`**'}
      if(job.hires_fix===true){msg+=':telescope:**`High Resolution Fix`**'}
      if(job.perlin!==0){msg+=':oyster:**`Perlin '+job.perlin+'`**'}
      if(job.threshold!==0){msg+=':door:**`Threshold '+job.threshold+'`**'}
      if(job.attachments.length>0){msg+=':paperclip:` attached template`:muscle:`'+job.strength+'`'}
      if(job.text_mask){msg+=':mask:`'+job.text_mask+'`'}
      if(job.variation_amount!==0){msg+=':microbe:**`Variation '+job.variation_amount+'`**'}
      //var jobResult = job.renders[render.resultNumber]
      if(render.variations){msg+=':linked_paperclips:with variants `'+render.variations+'`'}
      msg+=':seedling:`'+render.seed+'`:scales:`'+job.scale+'`:recycle:`'+job.steps+'`'
      msg+=':stopwatch:`'+timeDiff(job.timestampRequested, moment())+'s`'
      if(showFilename){msg+=':file_cabinet:`'+filename+'`'}
      msg+=':eye:`'+job.sampler+'`'
      msg+=':floppy_disk:`'+job.model+'`'
      if(job.webhook){msg+='\n:calendar:Scheduled render sent to `'+job.webhook.destination+'` discord'}
      if(job.cost&&!creditsDisabled){
        chargeCredits(job.userid,(costCalculator(job))/job.number) // only charge successful renders, if enabled
        msg+=':coin:`'+(job.cost/job.number).toFixed(2).replace(/[.,]00$/, "")+'/'+ creditsRemaining(job.userid) +'`'
      }
      var newMessage = { content: msg, embeds: [{description: job.prompt, color: getRandomColorDec()}], components: [ { type: Constants.ComponentTypes.ACTION_ROW, components: [ ] } ] }
      if(job.prompt.replace(' ','').length===0){newMessage.embeds=[]}
      newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "ReDream", custom_id: "refresh-" + job.id, emoji: { name: '🎲', id: null}, disabled: false })
      newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Edit Prompt", custom_id: "edit-"+job.id, emoji: { name: '✏️', id: null}, disabled: false })
      newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Tweak", custom_id: "tweak-"+job.id+'-'+render.resultNumber, emoji: { name: '🧪', id: null}, disabled: false })
      if(newMessage.components[0].components.length<5){newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Random", custom_id: "editRandom-"+job.id, emoji: { name: '🔀', id: null}, disabled: false })}
      if(newMessage.components[0].components.length===0){delete newMessage.components} // If no components are used there will be a discord api error so remove it
      var filesize=fs.statSync(render.filename).size
      if(filesize<defaultMaxDiscordFileSize){ // Within discord 8mb filesize limit
        try{bot.createMessage(job.channel, newMessage, {file: data, name: filename + '.png'}).then(m=>{}).catch((err)=>{log('caught error posting to discord in channel '.bgRed+job.channel);log(err)})}
        catch(err){console.error(err)}
      }else{
        if(imgurEnabled()&&filesize<10000000){
          bot.createMessage(job.channel,'<@'+job.userid + '> your image was too big for discord, uploading to imgur now..')
          try { imgurupload(render.filename).then(upload => { bot.createMessage(job.channel,{ content: msg, embeds: [{image: {url: upload.link}, description:job.prompt}]}) }) }
          catch (err) { console.error(err); bot.createMessage(job.channel,'Sorry <@' + job.userid + '> imgur uploading failed, contact an admin for your image `' + filename + '.png`') }
        // disabled imgbb as it was unreliable
        /*} else if (imgbbEnabled() && filesize < 32000000) {
          chat('<@' + job.userid + '> your file was too big for discord, uploading to imgbb now..')
          try { imgbbupload(render.filename).then(upload => { log(upload); bot.createMessage(job.channel,{ content: msg, embeds: [{image: {url: upload.url}, description:job.prompt}]}) }) }
          catch (err) { console.error(err); bot.createMessage(job.channel,'Sorry <@' + job.userid + '> imgbb uploading failed, contact an admin for your image `' + filename + '.png`') }*/
        } else {
          try {
            bot.createMessage(job.channel,'<@' + job.userid + '> your image was too big for discord and imgur, uploading to oshi.at now..')
            log('uploading via oshi.at api')
            log(render.filename)
            let form = new FormData()
            const fileStream = fs.createReadStream(render.filename)
            form.append("file", fileStream)
            axios({method:'post',url:'https://oshi.at/',data:form,'maxContentLength': Infinity,'maxBodyLength': Infinity,headers:{...form.getHeaders()}})
            .then((response)=>{
              var oshiimg=response.data.split('DL: ')[1]
              bot.createMessage(job.channel,{ content: msg+'\n '+(filesize/1000000).toFixed(2)+'MB image uploaded to oshi.at : '+oshiimg, embeds: [{description:job.prompt, color: getRandomColorDec()}]})
            })
            .catch((error) => console.error(error))
          }catch (err){console.error(err);bot.createMessage(job.channel,'Sorry <@' + job.userid + '> but your image was too big for all available image hosts, contact an admin for your image `' + filename + '.png`')}
        }
      }
    }
    })
  }
  catch(err) {console.error(err)}
}
function processQueue(){
  // WIP attempt to make a harder to dominate queue
  // TODO make a queueing system that prioritizes the users that have recharged the most
  var queueNew=queue.filter((q)=>q.status==='new') // first alias to simplify
  if(queueNew.length>0){
    var queueUnique=queueNew.filter((value,index,self)=>{return self.findIndex(v=>v.userid===value.userid)===index}) // reduce to 1 entry in queue per username
    var nextJobId=queueUnique[Math.floor(Math.random()*queueUnique.length)].id // random select
    var nextJob=queue[queue.findIndex(x=>x.id===nextJobId)]
  }else{var nextJob=queue[queue.findIndex(x=>x.status==='new')]}
  if(nextJob&&!rendering){
    if(userCreditCheck(nextJob.userid,costCalculator(nextJob))){
      bot.editStatus('online')
      rendering=true
      log(nextJob.username.bgWhite.red+':'+nextJob.cmd.replace('\r','').replace('\n').bgWhite.black)
      //pedoScan(nextJob.id) // Scan for pedo prompts,reject,alert OR render it
      addRenderApi(nextJob.id) // Comment out line if enabling pedoscan above
    }else{
      log(nextJob.username+' cant afford this render, denying')
      log('cost: '+costCalculator(nextJob))
      log('credits remaining: '+creditsRemaining(nextJob.userid))
      nextJob.status='failed';dbWrite()
      if(config.hivePaymentAddress.length>0){rechargePrompt(nextJob.userid,nextJob.channel)}else{chat('An admin can manually top up your credit with\n`!credit 1 <@'+ nextJob.userid +'>')}
      processQueue()
    }
  }else if(nextJob&&rendering){
  }else if(!nextJob&&!rendering){ // no jobs, not rendering
    renderJobErrors=queue.filter((q)=>q.status==='rendering')
    if(renderJobErrors.length>0){
      log('These job statuses are set to rendering, but rendering=false - this shouldnt happen'.bgRed)
      log(renderJobErrors)
      renderJobErrors.forEach((j)=>{if(j.status==='rendering'){log('setting status to failed for id '+j.id);j.status='failed'}})
    }
    debugLog('Finished queue, setting idle status'.dim)
    bot.editStatus('idle')
  }
}
function lexicaSearch(query,channel){
  // Quick and dirty lexica search api, needs docs to make it more efficient (query limit etc)
  var api = 'https://lexica.art/api/v1/search?q='+query
  var link = 'https://lexica.art/?q='+require('querystring').escape(query)
  var reply = {content:'Query: `'+query+'`\nTop 10 results from lexica.art api:\n**More:** '+link, embeds:[], components:[]}
  axios.get(api)
    .then((r)=>{
      var filteredResults = r.data.images.filter(i=>i.model==='stable-diffusion')// we only care about SD results
      filteredResults = filteredResults.filter((value, index, self) => {return self.findIndex(v => v.promptid === value.promptid) === index})// want only unique prompt ids
      log('Lexica search for :`'+query+'` gave '+r.data.images.length+' results, '+filteredResults.length+' after filtering')
      shuffle(filteredResults)
      filteredResults=filteredResults.slice(0,10)// shuffle and trim to 10 results // todo make this an option once lexica writes api docs
      filteredResults.forEach(i=>{reply.embeds.push({color: getRandomColorDec(),description: ':seedling:`'+i.seed+'` :straight_ruler:`'+i.width+'x'+i.height+'`',image:{url:i.srcSmall},footer:{text:i.prompt}})})
      bot.createMessage(channel, reply)
    })
    .catch((error) => console.error(error))
}
lexicaSearch=debounce(lexicaSearch,1000,true)

function pedoScan(jobid){
  debugLog('start pedoscan')
  // Call in between processQueue and render emit
  // Detect likely p*do prompts, set job status to failed, reply with chris hansen behind spoiler, alert admin with user info, prompt with matching terms and discord ID to manually ban via .env
  var chrisHansen='||https://media.discordapp.net/attachments/1024766656347652186/1036541751147638854/unknown.png *Why don\'t you take a seat right over here*...\n(**Prompt rejected**)||'
  // Fuck discord id miami#7199 986810579991818261 ..
  var job=queue[jobid-1]
  if (job){
    debugLog('pedoScan job found')
    var prompt=job.prompt
    var ageKeywords=['baby','toddler','infant','prepubescent','child','kid','young','TESTAGEKEYWORD'] // suss when combined with pornKeywords
    var ageNumbers=['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','TESTAGENUMBER'] // suss when combined with ageYearTerms AND pornKeywords
    var ageYearTerms=['yr','year','yo','TESTAGEYEARTERM']
    var pornKeywords=['nude','naked','sex','porn','fucking','fuck','gape','gangbang','cumshot','cum','lolita','rape','TESTPORNKEYWORD']
    var promptMatches=[]
    var possibleCombos=[]
    if (['f111'].includes(job.model)){
      if (ageKeywords.some(k=>prompt.includes(k))){ // no young keywords + porn models
        promptMatches.push(job.model)
        promptMatches.push(k) // BUGGED k is not defined)
      }
    }
    if(pornKeywords.some(p=>prompt.includes(p))){// Matched a porn keyword in the prompt
      if (ageKeywords.some(k=>prompt.includes(k))){// AND matched a child keyword
        // BUGGED k is not defined
        promptMatches.push(k);promptMatches.push(p)
      }
      if (ageNumbers.some(a=>prompt.includes(a))){ // Matching porn AND ageNumber
        ageYearTerms.forEach((y)=>{ // Make sure ageNumber is neighbouring the ageYearTerm
          // BUGGED a is not defined
          possibleCombos.push(a+y);possibleCombos.push(a+' '+y)
          if(possibleCombos.some(pc=>prompt.includes(pc))){promptMatches.push(pc);promptMatches.push(p)}
          possibleCombos=[]
        })
      }
    }
    if(promptMatches.length>0){//any matches is too many, reject/alert
      log('failed pedoScan')
      job.status='rejected'
      sayChan(job.channel,'<'+job.userid+'>'+chrisHansen)
      var alertMsg='Flagged prompts by '+job.username+'#'+job.discriminator+' userid '+job.userid+' channelid '+job.channel+'\nMatching terms:'+promptMatches.join(',')+'\nFull prompt:'+job.prompt
      log(alertMsg)
      directMessageUser(config.adminID,alertMsg,config.channelID)
      rendering=false;processQueue()
    } else {
      debugLog('passed pedoScan')
      addRenderApi(jobid)
    }
  } else {
    log('pedoScan job not found')
  }
}
async function meme(prompt,urls,userid,channel){
  params = prompt.split(' ')
  cmd = prompt.split(' ')[0]
  param = undefined
  switch(cmd){
    case 'blur': var img = await new DIG.Blur(params[1]).getImage(urls[0]);break
    case 'gay': var img = await new DIG.Gay().getImage(urls[0]);break
    case 'greyscale': var img = await new DIG.Greyscale().getImage(urls[0]);break
    case 'invert': var img = await new DIG.Invert().getImage(urls[0]);break
    case 'sepia': var img = await new DIG.Sepia().getImage(urls[0]);break
    case 'animate':
    case 'blink': {if (urls.length>1){var img = await new DIG.Blink().getImage(...urls)};break} // Can take up to 10 images (discord limit) and make animations
    case 'triggered': var img = await new DIG.Triggered().getImage(urls[0]);break
    case 'ad': var img = await new DIG.Ad().getImage(urls[0]);break
    case 'affect': var img = await new DIG.Affect().getImage(urls[0]);break
    case 'batslap': {if (urls.length==2){var img = await new DIG.Batslap().getImage(urls[0],urls[1])};break} // Take 2 images
    case 'beautiful': var img = await new DIG.Beautiful().getImage(urls[0]);break
    case 'bed': {if (urls.length==2){var img = await new DIG.Bed().getImage(urls[0],urls[1])};break} // takes 2 images
    case 'bobross': var img = await new DIG.Bobross().getImage(urls[0]);break
    case 'confusedstonk': var img = await new DIG.ConfusedStonk().getImage(urls[0]);break
    case 'delete': var img = await new DIG.Delete().getImage(urls[0]);break
    case 'discordblack': var img = await new DIG.DiscordBlack().getImage(urls[0]);break
    case 'discordblue': var img = await new DIG.DiscordBlue().getImage(urls[0]);break
    case 'doublestonk': {if (urls.length==2){var img = await new DIG.DoubleStonk().getImage(urls[0],urls[1])};break} // takes 2 images
    case 'facepalm': var img = await new DIG.Facepalm().getImage(urls[0]);break
    case 'hitler': var img = await new DIG.Hitler().getImage(urls[0]);break
    case 'jail': var img = await new DIG.Jail().getImage(urls[0]);break
    case 'karaba': var img = await new DIG.Karaba().getImage(urls[0]);break
    case 'kiss': {if (urls.length==2){var img = await new DIG.Kiss().getImage(urls[0],urls[1])};break} // takes 2 images
    case 'lisapresentation': var img = await new DIG.LisaPresentation().getImage(prompt.replace('lisapresentation ',''));break // takes text
    case 'mms': var img = await new DIG.Mms().getImage(urls[0]);break
    case 'notstonk': var img = await new DIG.NotStonk().getImage(urls[0]);break
    case 'podium': {if (urls.length==3&&params[1]&&params[2]&&params[3]){var img = await new DIG.Podium().getImage(urls[0],urls[1],urls[2],params[1],params[2],params[3])};break} // new DIG.Podium().getImage(`<Avatar1>, <Avatar2>, <Avatar2>, <Name1>, <Name2>, <Name3>`)
    case 'poutine': var img = await new DIG.Poutine().getImage(urls[0]);break
    case 'rip': var img = await new DIG.Rip().getImage(urls[0]);break
    case 'spank': {if (urls.length==2){var img = await new DIG.Spank().getImage(urls[0],urls[1])};break} // takes 2 urls
    case 'stonk': var img = await new DIG.Stonk().getImage(urls[0]);break
    case 'tatoo': var img = await new DIG.Tatoo().getImage(urls[0]);break
    case 'thomas': var img = await new DIG.Thomas().getImage(urls[0]);break
    case 'trash': var img = await new DIG.Trash().getImage(urls[0]);break
    case 'wanted': {if (urls.length==1){var img = await new DIG.Wanted().getImage(urls[0], '$')};break} // takes image + currency sign, hardcoding $
    case 'circle': var img = await new DIG.Circle().getImage(urls[0]);break
    case 'color': var img = await new DIG.Color().getImage(params[1]);break // take hex color code
  }
  if (img&&cmd){
    var msg = '<@'+userid+'> used `!meme '+prompt+'`'
    if (!creditsDisabled){
      chargeCredits(userid,0.05)
      msg+=', it cost :coin:`0.05`/`'+creditsRemaining(userid)+'`'
    }
    var extension = ['blink','triggered','animate'].includes(cmd) ? '.gif' : '.png'
    bot.createMessage(channel, msg, {file: img, name: cmd+'-'+getRandomSeed()+extension})
  }
}
meme=debounce(meme,1000,true)
function shuffle(array) {for (let i = array.length - 1; i > 0; i--) {let j = Math.floor(Math.random() * (i + 1));[array[i], array[j]] = [array[j], array[i]]}} // fisher-yates shuffle
const unique = (value, index, self) => { return self.indexOf(value) === index }
function getRandomColorDec(){return Math.floor(Math.random()*16777215)}
function timeDiff(date1,date2) { return date2.diff(date1, 'seconds') }
function getRandom(what){if(randoms.includes(what)){try{var lines=fs.readFileSync('txt/'+what+'.txt','utf-8').split(/r?\n/);return lines[Math.floor(Math.random()*lines.length)]}catch(err){console.error(err)}}else{return what}}
function replaceRandoms(input){
  var output=input
  randoms.forEach(x=>{
    var wordToReplace='{'+x+'}'
    var before='';var after='';var replacement=''
    var wordToReplaceLength=wordToReplace.length
    var howManyReplacements=output.split(wordToReplace).length-1 // todo can we improve this?
    for (let i=0;i<howManyReplacements;i++){ // to support multiple {x} of the same type in the same prompt
      var wordToReplacePosition=output.indexOf(wordToReplace) // where the first {x} starts (does this need +1?)
      if (wordToReplacePosition!==-1){ // only continue if a match was found
        var wordToReplacePositionEnd=wordToReplacePosition+wordToReplaceLength
        before=output.substr(0,wordToReplacePosition)
        replacement=getRandom(x)
        after=output.substr(wordToReplacePositionEnd)
        output=before+replacement+after
      }
    }
  })
  return output
}
function imgurEnabled(){if(config.imgurClientID.length>0){return true}else{return false}}
async function imgurupload(file) {
  log('uploading via imgur api')
  const response = await imgur.upload({ image: fs.createReadStream(file), type: 'stream'})
  debugLog(response.data)
  return response.data
}
function imgbbEnabled(){if(config.imgbbClientID.length>0){return true}else{return false}}
async function imgbbupload(file) {
  log('uploading via imgbb api')
  imgbb(config.imgbbClientID, file)
    .then((response)=>{debugLog(response);return response})
    .catch((error)=>console.error(error))
}
function process (file){// Monitor new files entering watchFolder, post image with filename.
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
function tidyNumber (x) {if (x) {var parts = x.toString().split('.');parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');return parts.join('.')}else{return null}}

// Initial discord bot setup and listeners
bot.on("ready", async () => {
  log("Connected to discord".bgGreen)
  log("Guilds:".bgGreen+' '+bot.guilds.size)
  processQueue()
  bot.getCommands().then(cmds=>{ // check current commands setup, update if needed
    bot.commands = new Collection()
    for (const c of slashCommands) {
      if(cmds.filter(cmd=>cmd.name===c.name).length>0) {
        bot.commands.set(c.name, c)
      } else {
        bot.commands.set(c.name, c)
        bot.createCommand({name: c.name,description: c.description,options: c.options ?? [],type: Constants.ApplicationCommandTypes.CHAT_INPUT})
      }
    }
  })
  if (config.hivePaymentAddress.length>0){checkNewPayments()}
})

bot.on("interactionCreate", async (interaction) => {
  if(interaction instanceof Eris.CommandInteraction && authorised(interaction,interaction.channel.id,interaction.guildID)) {//&& interaction.channel.id === config.channelID
    if (!bot.commands.has(interaction.data.name)) return interaction.createMessage({content:'Command does not exist', flags:64}).catch((e) => {log('command does not exist'.bgRed);log(e)})
    try {
      bot.commands.get(interaction.data.name).execute(interaction)
      interaction.acknowledge().then(x=> {interaction.deleteMessage('@original').then((t) => {}).catch((e) => {log('error after delete interaction'.bgRed);console.error(e)}) }).catch((e)=>{console.error(e)})
    }
    catch (error) { console.error(error); await interaction.createMessage({content:'There was an error while executing this command!', flags: 64}).catch((e) => {log(e)}) }
  }
  if((interaction instanceof Eris.ComponentInteraction||interaction instanceof Eris.ModalSubmitInteraction)&&authorised(interaction,interaction.channel.id,interaction.guildID)) {
    if(!interaction.member){log(interaction.user.username+' slid into artys DMs');interaction.member={user:{id: interaction.user.id,username:interaction.user.username,discriminator:interaction.user.discriminator,bot:interaction.user.bot}}}
    log(interaction.data.custom_id.bgCyan.black+' request from '+interaction.member.user.username.bgCyan.black)
    if(interaction.data.custom_id.startsWith('random')){
      request({cmd: getRandom('prompt'), userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: []})
      return interaction.editParent({}).catch((e)=>{log(e)})
    }else if(interaction.data.custom_id.startsWith('refresh')){
      var id=interaction.data.custom_id.split('-')[1]
      if(queue.length>=(id-1)){var newJob=JSON.parse(JSON.stringify(queue[id-1]))} // parse/stringify to deep copy and make sure we dont edit the original}
      if(newJob) {
        newJob.number=1
        if (newJob.webhook){delete newJob.webhook}
        if (interaction.data.custom_id.startsWith('refreshVariants')&&newJob.sampler!=='k_euler_a') { // variants do not work with k_euler_a sampler
          newJob.variation_amount=0.1
          newJob.seed = interaction.data.custom_id.split('-')[2]
          var variantseed = interaction.data.custom_id.split('-')[3]
          if (variantseed){ // variant of a variant
            newJob.with_variations = [[parseInt(variantseed),0.1]]
            log(newJob.with_variations)
          }
        } else if (interaction.data.custom_id.startsWith('refreshUpscale-')) {
          newJob.upscale_level = 2
          newJob.seed = interaction.data.custom_id.split('-')[2]
          newJob.variation_amount=0
        } else { // Only a normal refresh should change the seed
          newJob.variation_amount=0
          newJob.seed=getRandomSeed()
        }
        if (interaction.data.custom_id.startsWith('refreshEdit-')){newJob.prompt=interaction.data.components[0].components[0].value}
        request({cmd: getCmd(newJob), userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: newJob.attachments})
        if (interaction.data.custom_id.startsWith('refreshEdit-')){return interaction.editParent({}).catch((e)=>{console.error(e)})}else{return interaction.editParent({}).catch((e)=>{console.error(e)})}
      } else {
        log('unable to refresh render'.bgRed)
        return interaction.editParent({components:[]}).catch((e) => {console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('editRandom-')) {
      id=interaction.data.custom_id.split('-')[1]
      if (queue[id-1]){var newJob=JSON.parse(JSON.stringify(queue[id-1]))} // parse/stringify to deep copy and make sure we dont edit the original
      if (newJob) {
        newJob.number = 1
        if (newJob.webhook){delete newJob.webhook}
        return interaction.createModal({custom_id:'refreshEdit-'+newJob.id,title:'Edit the random prompt?',components:[{type:1,components:[{type:4,custom_id:'prompt',label:'Prompt',style:2,value:getRandom('prompt'),required:true}]}]}).then((r)=>{}).catch((e)=>{console.error(e)})
      } else {
        log('edit request failed'.bgRed)
        return interaction.editParent({components:[]}).catch((e) => {console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('edit-')) {
      id=interaction.data.custom_id.split('-')[1]
      if(queue[id-1]){var newJob=JSON.parse(JSON.stringify(queue[id-1]))} // parse/stringify to deep copy and make sure we dont edit the original
      if(newJob){
        newJob.number=1
        if(newJob.webhook){delete newJob.webhook}
        return interaction.createModal({custom_id:'refreshEdit-'+newJob.id,title:'Edit the prompt',components:[{type:1,components:[{type:4,custom_id:'prompt',label:'Prompt',style:2,value:newJob.prompt,required:true}]}]}).then((r)=>{}).catch((e)=>{console.error(e)})
      }else{
        log('edit request failed'.bgRed)
        return interaction.editParent({components:[]}).catch((e) => {console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('tweak-')) {
      id=interaction.data.custom_id.split('-')[1]
      rn=interaction.data.custom_id.split('-')[2]
      if(queue[id-1]){var newJob=JSON.parse(JSON.stringify(queue[id-1]))} // parse/stringify to deep copy and make sure we dont edit the original
      if (newJob) {
        newJob.number = 1
        if (newJob.webhook){delete newJob.webhook}
        var tweakResponse=          {
            content:':test_tube: **Tweak Menu**',
            flags:64,
            components:[
              {type:Constants.ComponentTypes.ACTION_ROW,components:[
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.PRIMARY, label: "Portrait", custom_id: "twkaspectPortrait-"+id+'-'+rn, emoji: { name: '↕️', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.PRIMARY, label: "Square", custom_id: "twkaspectSquare-"+id+'-'+rn, emoji: { name: '🔳', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.PRIMARY, label: "Landscape", custom_id: "twkaspectLandscape-"+id+'-'+rn, emoji: { name: '↔️', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Model", custom_id: "chooseModel-"+id+'-'+rn, emoji: { name: '💾', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Sampler", custom_id: "chooseSampler-"+id+'-'+rn, emoji: { name: '👁️', id: null}, disabled: false }
              ]},
              {type:Constants.ComponentTypes.ACTION_ROW,components:[
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Scale - 1", custom_id: "twkscaleMinus-"+id+'-'+rn, emoji: { name: '⚖️', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Scale + 1", custom_id: "twkscalePlus-"+id+'-'+rn, emoji: { name: '⚖️', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Steps - 5", custom_id: "twkstepsMinus-"+id+'-'+rn, emoji: { name: '♻️', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Steps + 5", custom_id: "twkstepsPlus-"+id+'-'+rn, emoji: { name: '♻️', id: null}, disabled: false }
              ]},
              {type:Constants.ComponentTypes.ACTION_ROW,components:[
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.DANGER, label: "Upscale 2x", custom_id: "twkupscale2-"+id+'-'+rn, emoji: { name: '🔍', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.DANGER, label: "Upscale 4x", custom_id: "twkupscale4-"+id+'-'+rn, emoji: { name: '🔎', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.DANGER, label: "Face Fix GfpGAN", custom_id: "twkgfpgan-"+id+'-'+rn, emoji: { name: '💄', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.DANGER, label: "Face Fix CodeFormer", custom_id: "twkcodeformer-"+id+'-'+rn, emoji: { name: '💄', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.DANGER, label: "High Resolution Fix", custom_id: "twkhiresfix-"+id+'-'+rn, emoji: { name: '🔭', id: null}, disabled: false }
              ]},
              {type:Constants.ComponentTypes.ACTION_ROW,components:[
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "1% variant", custom_id: "twkvariant1-"+id+'-'+rn, emoji: { name: '🧬', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "5% variant", custom_id: "twkvariant5-"+id+'-'+rn, emoji: { name: '🧬', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "10% variant", custom_id: "twkvariant10-"+id+'-'+rn, emoji: { name: '🧬', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "25% variant", custom_id: "twkvariant25-"+id+'-'+rn, emoji: { name: '🧬', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "50% variant", custom_id: "twkvariant50-"+id+'-'+rn, emoji: { name: '🧬', id: null}, disabled: false }
              ]},
              {type:Constants.ComponentTypes.ACTION_ROW,components:[
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Default settings", custom_id: "twkdefault-"+id+'-'+rn, emoji: { name: '☢️', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Fast settings", custom_id: "twkfast-"+id+'-'+rn, emoji: { name: '⏩', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Slow settings", custom_id: "twkslow-"+id+'-'+rn, emoji: { name: '⏳', id: null}, disabled: false },
                {type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Batch of 5", custom_id: "twkbatch5-"+id+'-'+rn, emoji: { name: '🖐️', id: null}, disabled: false }
              ]}
            ]
          }
          // Disable buttons depending on the current parameters
          if (newJob.width===512&&newJob.height===704){tweakResponse.components[0].components[0].disabled=true}
          if (newJob.width===newJob.height){tweakResponse.components[0].components[1].disabled=true}
          if (newJob.width===704&&newJob.height===512){tweakResponse.components[0].components[2].disabled=true}
          if (newJob.scale<=1){tweakResponse.components[1].components[0].disabled=true}
          if (newJob.scale>=30){tweakResponse.components[1].components[1].disabled=true}
          if (newJob.steps<=5){tweakResponse.components[1].components[2].disabled=true}
          if (newJob.steps>=145){tweakResponse.components[1].components[3].disabled=true}
          if (newJob.upscale_level!==0&&newJob.upscale_level!==''){tweakResponse.components[2].components[0].disabled=true;tweakResponse.components[2].components[1].disabled=true}
          if (newJob.gfpgan_strength!==0){tweakResponse.components[2].components[2].disabled=true}
          if (newJob.codeformer_strength!==0){tweakResponse.components[2].components[3].disabled=true}
          if (newJob.hires_fix===true||(newJob.width*newJob.height)<300000){tweakResponse.components[2].components[4].disabled=true}
          if (newJob.sampler==='k_euler_a'){tweakResponse.components[3].components[0].disabled=true}
          if (newJob.sampler==='k_euler_a'){tweakResponse.components[3].components[1].disabled=true}
          if (newJob.sampler==='k_euler_a'){tweakResponse.components[3].components[2].disabled=true}
          if (newJob.sampler==='k_euler_a'){tweakResponse.components[3].components[3].disabled=true}
          if (newJob.sampler==='k_euler_a'){tweakResponse.components[3].components[4].disabled=true}
        return interaction.createMessage(tweakResponse).then((r)=>{}).catch((e)=>{console.error(e)})
      } else {
        console.error('Edit request failed')
        return interaction.editParent({components:[]}).catch((e) => {console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('twk')) {
      var jobId=interaction.data.custom_id.split('-')[1]
      var newJob=JSON.parse(JSON.stringify(queue[jobId-1])) //copy job
      var resultNumber=interaction.data.custom_id.split('-')[2]
      var result=newJob.results[resultNumber] // The full settings output from api for previous result, ready for postprocessing
      if(result&&result.metadata.image&&result.metadata.image.seed){debugLog('setting seed from batch result:'+result.metadata.image.seed);newJob.seed=result.metadata.image.seed}
      newJob.results=[] // wipe results from old job
      newJob.number=1 // Reset to single images
      var newCmd=''
      var postProcess=false
      switch(interaction.data.custom_id.split('-')[0].replace('twk','')){
        case 'scalePlus': newJob.scale=newJob.scale+1;break
        case 'scaleMinus': newJob.scale=newJob.scale-1;break
        case 'stepsPlus': newJob.steps=newJob.steps+5;break
        case 'stepsMinus': newJob.steps=newJob.steps-5;break
        case 'aspectPortrait': newJob.height=704;newJob.width=512;break
        case 'aspectLandscape': newJob.width=704;newJob.height=512;break
        case 'aspectSquare': newJob.width=defaultSize;newJob.height=defaultSize;break
        case 'aspect4k': newJob.width=960;newJob.height=512;newJob.upscale_level=4;newJob.hires_fix=true;break
        case 'upscale2': newJob.upscale_level=2;break // currently resubmitting jobs, update to use postprocess once working
        case 'upscale4': newJob.upscale_level=4;break
        case 'variant1': newJob.variation_amount=0.01;break
        case 'variant5': newJob.variation_amount=0.05;break
        case 'variant10': newJob.variation_amount=0.1;break
        case 'variant25': newJob.variation_amount=0.25;break
        case 'variant50': newJob.variation_amount=0.50;break
        case 'hiresfix': newJob.hires_fix=true;break
        case 'upscale2': newJob.upscale_level=2;break // All of these should be migrated to the postProcess function once working, faster/cheaper
        case 'upscale4': newJob.upscale_level=4;break //
        case 'gfpgan': newJob.gfpgan_strength=0.8;newJob.codeformer_strength=0;break //
        case 'codeformer': newJob.codeformer_strength=0.8;newJob.gfpgan_strength=0;break //
        case 'default': newCmd=newJob.prompt;break
        case 'fast': newJob.sampler='k_euler_a';newJob.steps=25;break
        case 'slow': newJob.sampler='k_euler_a';newJob.steps=100;break
        case 'batch5': newJob.seed=getRandomSeed();newJob.number=5;break
      }
      if (postProcess){ // submit as postProcess request
        //todo
      } else { // submit as new job with changes
      if(newCmd===''){newCmd=getCmd(newJob)}
      if (interaction.member) {
        request({cmd: newCmd, userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: newJob.attachments})
      } else if (interaction.user){
        request({cmd: newCmd, userid: interaction.user.id, username: interaction.user.username, discriminator: interaction.user.discriminator, bot: interaction.user.bot, channelid: interaction.channel.id, attachments: newJob.attachments})
      }
      }
      return interaction.editParent({content:':test_tube: **'+interaction.data.custom_id.split('-')[0].replace('twk','')+'** selected',components:[]}).catch((e) => {console.error(e)})
    } else if (interaction.data.custom_id.startsWith('chooseModel')) {
      id=interaction.data.custom_id.split('-')[1]
      rn=interaction.data.custom_id.split('-')[2]
      var newJob=JSON.parse(JSON.stringify(queue[id-1])) // parse/stringify to deep copy and make sure we dont edit the original
      if(newJob&&models){
        var changeModelResponse={content:':floppy_disk: **Model Menu**\nUse this menu to change the model/checkpoint being used, to give your image a specific style',flags:64,components:[]}
        var allModelKeys=Object.keys(models)
        var maxModelAmount=25 // maximum of 25 options in a discord dropdown menu
        for(let i=0;i<allModelKeys.length;i+=maxModelAmount) {
          var modelBatch=allModelKeys.slice(i,i+maxModelAmount)
          changeModelResponse.components.push({type:Constants.ComponentTypes.ACTION_ROW,components:[{type: 3,custom_id:'changeModel'+i+'-'+id+'-'+rn,placeholder:'Choose a model/checkpoint',min_values:1,max_values:1,options:[]}]})
          modelBatch.forEach((m)=>{changeModelResponse.components[changeModelResponse.components.length-1].components[0].options.push({label: m,value: m,description: models[m].description})})
        }
        return interaction.editParent(changeModelResponse).then((r)=>{}).catch((e)=>{console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('changeModel')) {
      id=interaction.data.custom_id.split('-')[1]
      rn=interaction.data.custom_id.split('-')[2]
      var newJob=JSON.parse(JSON.stringify(queue[id-1])) // parse/stringify to deep copy and make sure we dont edit the original
      var result=newJob.results[rn]
      if(result){debugLog('setting seed from batch result:'+result.metadata.image.seed);newJob.seed=result.metadata.image.seed}
      var newModel=interaction.data.values[0]
      if (models[newModel]){
        var newModelDescription=models[newModel].description
        var newModelKeywords=newModelDescription.split('##')[1]
        var oldModel=newJob.model
        var oldModelDescription=models[oldModel].description
        var oldModelKeywords=oldModelDescription.split('##')[1]
      }
      if(newJob&&newModel&&models[newModel]){
        newJob.model=newModel // set the new model
        if(newModelKeywords&&!newJob.prompt.includes(newModelKeywords)){ //new model needs keywords not currently in the prompt
          if(newJob.prompt.includes(oldModelKeywords)){ // old model needed keywords that are still in the prompt
            newJob.prompt=newJob.prompt.replace(oldModelKeywords,newModelKeywords) // swap new for old
          }else{newJob.prompt=newModelKeywords+','+newJob.prompt}// otherwise, just add new keywords
        }
        if (newJob.prompt.includes(oldModelKeywords)&&!newModelKeywords){newJob.prompt=newJob.prompt.replace(oldModelKeywords+',','')}//Remove old keywords, even if we dont have new ones to replace
        var attach=[]
        if (newJob.attachments.length>0){attach=newJob.attachments}
        newJob.number=1
        if(interaction.member){
          request({cmd: getCmd(newJob), userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: attach})
        } else if (interaction.user){
          request({cmd: getCmd(newJob), userid: interaction.user.id, username: interaction.user.username, discriminator: interaction.user.discriminator, bot: interaction.user.bot, channelid: interaction.channel.id, attachments: attach})
        }
        return interaction.editParent({content:':floppy_disk: ** Model '+interaction.data.values[0]+'** selected',components:[]}).catch((e) => {console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('chooseSampler')) {
      id=interaction.data.custom_id.split('-')[1]
      rn=interaction.data.custom_id.split('-')[2]
      var newJob=JSON.parse(JSON.stringify(queue[id-1])) // parse/stringify to deep copy and make sure we dont edit the original
      if(newJob&&models){
        var changeSamplerResponse={content:':eye: **Sampler Menu**\nUse this menu to change the sampler being used',flags:64,components:[{type:Constants.ComponentTypes.ACTION_ROW,components:[{type: 3,custom_id:'changeSampler-'+id+'-'+rn,placeholder:'Choose a sampler',min_values:1,max_values:1,options:[]}]}]}
        samplers.forEach((s)=>{changeSamplerResponse.components[0].components[0].options.push({label: s,value: s})})
        return interaction.editParent(changeSamplerResponse).then((r)=>{}).catch((e)=>{console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('changeSampler')) {
      id=interaction.data.custom_id.split('-')[1]
      rn=interaction.data.custom_id.split('-')[2]
      var newJob=JSON.parse(JSON.stringify(queue[id-1])) // parse/stringify to deep copy and make sure we dont edit the original
      var result=newJob.results[rn]
      if(result){debugLog('setting seed from batch result:'+result.metadata.image.seed);newJob.seed=result.metadata.image.seed}
      var newSampler=interaction.data.values[0]
      if(newJob&&newSampler){
        newJob.sampler=newSampler // set the new model
        if(interaction.member){
          request({cmd: getCmd(newJob), userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: newJob.attachments})
        } else if (interaction.user){
          request({cmd: getCmd(newJob), userid: interaction.user.id, username: interaction.user.username, discriminator: interaction.user.discriminator, bot: interaction.user.bot, channelid: interaction.channel.id, attachments: newJob.attachments})
        }
        return interaction.editParent({content:':eye: ** Sampler '+interaction.data.values[0]+'** selected',components:[]}).catch((e) => {console.error(e)})
      }
    }
  }
  if (!authorised(interaction,interaction.channel.id,interaction.guildID)) {
    log('unauthorised usage attempt from'.bgRed)
    log(interaction.member)
    return interaction.createMessage({content:':warning: You dont currently have permission to use this feature', flags:64}).catch((e) => {console.error(e)})
  }
})
async function directMessageUser(id,msg,channel){ // try, fallback to channel
  d = await bot.getDMChannel(id).catch(() => {
    log('failed to get dm channel, sending public message instead')
    if (channel&&channel.length>0){bot.createMessage(channel,msg).then(()=>{log('DM sent to '.dim+id)}).catch(() => log('failed to both dm a user or message in channel'.bgRed.white))}
  })
  d.createMessage(msg).catch(() => {
    if (channel&&channel.length>0){bot.createMessage(channel,msg).then(()=>{log('DM sent to '.dim+id)}).catch(() => log('failed to both dm a user or message in channel'.bgRed.white))}
  })
}

bot.on("messageReactionAdd", (msg,emoji,reactor) => {
  var embeds=false
  if (msg.embeds){embeds=dJSON.parse(JSON.stringify(msg.embeds))}
  if (embeds&&msg.attachments&&msg.attachments.length>0) {embeds.unshift({image:{url:msg.attachments[0].url}})}
  //if (!reactor.user){log('DEBUG reactor.user.id not found, find its replacement here'.bgRed); log(reactor)}
  //if (!msg.author){log('DEBUG msg.author.id not found, find its replacement here'.bgRed); log(msg)}
  if (msg.author&&msg.author.id===bot.application.id){
    switch(emoji.name){
      case '😂':
      case '👍':
      case '⭐':
      case '❤️': log('Positive emojis'.green+emoji.name); break
      case '✉️': log('sending image to dm'.dim);directMessageUser(reactor.user.id,{content: msg.content, embeds: embeds});break // todo debug occasional error about reactor.user.id undefined here
      case '👎':
      case '⚠️':
      case '🙈':
      case '❌':
      case '💩': {
        log('Negative emojis'.red+emoji.name.red)
        if(msg.content.includes(reactor.user.id)){msg.delete().catch(() => {})}
        break
      }
    }
  } 
})

//bot.on("messageReactionRemoved", (msg,emoji,userid) => {log('message reaction removed');log(msg,emoji,userid)})
//bot.on("warn", (msg,id) => {if (msg!=={Error: 'Unknown guild text channel type: 15'}){log('warn'.bgRed);log(msg,id)}})
//bot.on("debug", (msg,id) => {log(msg,id)})
bot.on("disconnect", () => {log('disconnected'.bgRed)})
bot.on("error", (err,id) => {log('error'.bgRed); log(err,id)})
//bot.on("channelCreate", (channel) => {log(channel)})
//bot.on("channelDelete", (channel) => {log(channel)})
bot.on("guildCreate", (guild) => {var m='joined new guild: '+guild.name;log(m.bgRed);directMessageUser(config.adminID,m)}) // todo send invite to admin
bot.on("guildDelete", (guild) => {var m='left guild: '+guild.name;log(m.bgRed);directMessageUser(config.adminID,m)})
bot.on("guildAvailable", (guild) => {var m='guild available: '+guild.name;log(m.bgRed)})
bot.on("channelCreate", (channel) => {var m='channel created: '+channel.name+' in '+channel.guild.name;log(m.bgRed)})
bot.on("channelDelete", (channel) => {var m='channel deleted: '+channel.name+' in '+channel.guild.name;log(m.bgRed)})
bot.on("channelUpdate", (channel,oldChannel) => {var m='channel updated: '+channel.name+' in '+channel.guild.name;log(m.bgRed);if(channel.topic!==oldChannel.topic){log('new topic:'+channel.topic)}})
bot.on("guildMemberAdd", (guild,member) => {var m='User '+member.username+'#'+member.discriminator+' joined guild '+guild.name;log(m.bgMagenta)})
bot.on("guildMemberRemove", (guild,member) => {var m='User '+member.username+'#'+member.discriminator+' left guild '+guild.name;log(m.bgMagenta)})
//bot.on("guildMemberUpdate", (guild,member,oldMember,communicationDisabledUntil) => {log('user updated'.bgRed); log(member)}) // todo fires on user edits, want to reward users that start boosting HQ server, oldMember.premiumSince=Timestamp since boosting guild
//bot.on("channelRecipientAdd", (channel,user) => {log(channel,user)})
//bot.on("channelRecipientRemove", (channel,user) => {log(channel,user)})
var lastMsgChan=null
bot.on("messageCreate", (msg) => {
  // an irc like view of non bot messages in allowed channels. Creepy but convenient
  if (config.showChat&&!msg.author.bot){
    if(lastMsgChan!==msg.channel.id&&msg.channel.name&&msg.channel.guild){
      log('#'.bgBlue+msg.channel.name.bgBlue+'-'+msg.channel.id.bgWhite.black+'-'+msg.channel.guild.name.bgBlue+'')
      lastMsgChan=msg.channel.id // Track last channel so messages can be grouped with channel headers
    }
    log(msg.author.username.bgBlue.red.bold+':'+msg.content.bgBlack)
    msg.attachments.map((u)=>{return u.proxy_url}).forEach((a)=>{log(a)})
    msg.embeds.map((e)=>{return e}).forEach((e)=>{log(e)})
    msg.components.map((c)=>{return c}).forEach((c)=>{log(c)})
  }
  // end irc view
  if(msg.mentions.length>0){
    msg.mentions.forEach((m)=>{
      if (m.id===bot.application.id){
        if (msg.referencedMessage===null){ // not a reply
          log('arty mention replaced with !dream')
          msg.content = msg.content.replace('<@'+m.id+'>','').replace('!dream','')
          msg.content='!dream '+msg.content
        } else if (msg.referencedMessage.author.id===bot.application.id) { // just a response to a message from arty, confirm before render
          if(msg.referencedMessage.components&&msg.referencedMessage.components[0]&&msg.referencedMessage.components[0].components[0]&&msg.referencedMessage.components[0].components[0].custom_id.startsWith('refresh-')){// only works with normal renders
            var jobid = msg.referencedMessage.components[0].components[0].custom_id.split('-')[1]
            var newJob=JSON.parse(JSON.stringify(queue[jobid-1]))
            msg.content=msg.content.replace('<@'+m.id+'>','').replace('!dream','')
            if (msg.content.startsWith('+')){
              msg.content='!dream '+msg.content.substring(1,msg.content.length)+' '+newJob.prompt
              //msg.attachments=msg.referencedMessage.attachments
            } else if (msg.content.startsWith('..')){
              msg.content='!dream '+newJob.prompt+' '+msg.content.substring(2,msg.content.length)
              //msg.attachments=msg.referencedMessage.attachments
            } else if (msg.content.startsWith('*')){
              var newnum = parseInt(msg.content.substring(1,2))
              msg.content='!dream '+newJob.prompt+' --number ' +newnum
            } else if (msg.content.startsWith('-')){
              newJob.prompt.replace(msg.content.substring(1,msg.content.length),'')
              msg.content='!dream '+newJob.prompt
            }
          }
          if (msg.content.startsWith('template')&&msg.referencedMessage.attachments){
            msg.attachments=msg.referencedMessage.attachments
            msg.content='!dream '+msg.content.substring(9)
          } else if (msg.content.startsWith('background')||msg.content.startsWith('!background')){
            msg.content='!background'
            msg.attachments=msg.referencedMessage.attachments
          } else if (msg.content.startsWith('crop')||msg.content.startsWith('!crop')){
            msg.content='!crop'
            msg.attachments=msg.referencedMessage.attachments
          } else if (msg.content.startsWith('expand')||msg.content.startsWith('!expand')){
            msg.content=msg.content.split(' ')[0]
            if (msg.content[0]!=='!'){msg.content='!'+msg.content}
            msg.attachments=msg.referencedMessage.attachments
          } else if (msg.content.startsWith('fade')||msg.content.startsWith('!fade')){
            msg.content=msg.content.split(' ')[0]
            if (msg.content[0]!=='!'){msg.content='!'+msg.content}
            msg.attachments=msg.referencedMessage.attachments
          } else if (msg.content.startsWith('text')||msg.content.startsWith('!text')){
            msg.attachments=msg.referencedMessage.attachments
          }
        }
      }
    })
  }
  var c=msg.content.split(' ')[0]
  if (msg.author.id!==bot.id&&authorised(msg,msg.channel.id,msg.guildID,)){ // Work anywhere its authorized // (msg.channel.id===config.channelID||!msg.guildID) // interaction.member,interaction.channel.id,interaction.guildID
    switch(c){
      case '!dream':{request({cmd: msg.content.substr(7, msg.content.length), userid: msg.author.id, username: msg.author.username, discriminator: msg.author.discriminator, bot: msg.author.bot, channelid: msg.channel.id, attachments: msg.attachments});break}
      case '!prompt':
      case '!random':{request({cmd: msg.content.substr(8,msg.content.length)+getRandom('prompt'), userid: msg.author.id, username: msg.author.username, discriminator: msg.author.discriminator, bot: msg.author.bot, channelid: msg.channel.id, attachments: msg.attachments});break}
      case '!recharge':rechargePrompt(msg.author.id,msg.channel.id);break
      case '!lexica':lexicaSearch(msg.content.substr(8, msg.content.length),msg.channel.id);break
      case '!meme':{if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){meme(msg.content.substr(6, msg.content.length),msg.attachments.map((u)=>{return u.proxy_url}),msg.author.id,msg.channel.id)} else if (msg.content.startsWith('!meme lisapresentation')){meme(msg.content.substr(6, msg.content.length),urls,msg.author.id,msg.channel.id)};break}
      case '!avatar':{var avatars='';msg.mentions.forEach((m)=>{avatars+=m.avatarURL.replace('size=128','size=512')+'\n'});bot.createMessage(msg.channel.id,avatars);break}
      case '!background':{ // requires docker run -p 127.0.0.1:5000:5000 danielgatis/rembg s
        if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          attachmentsUrls.forEach((url)=>{
            log('Removing background from '+url)
            axios.get(rembg+encodeURIComponent(url),{responseType: 'arraybuffer'})//axios.get('http://127.0.0.1:5000?url='+encodeURIComponent(msg.attachments.map((u)=>{return u.proxy_url})),{responseType: 'arraybuffer'})
              .then((response)=>{
                var newMsg='<@'+msg.author.id+'> used `!background`'
                if (!creditsDisabled){
                  chargeCredits(msg.author.id,0.05)
                  newMsg+=', it cost :coin:`0.05`/`'+creditsRemaining(msg.author.id)+'`'
                }
                bot.createMessage(msg.channel.id, newMsg, {file: Buffer.from(response.data), name: 'bgremoved.png'})
              })
              .catch((err) => {var newMsg='unable to connect to rembg server\n`docker run -p 127.0.0.1:5000:5000 danielgatis/rembg s`';directMessageUser(config.adminID,newMsg);log(err,newMsg)})
            })
        }
        break
      }
      case '!crop':{
        if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          attachmentsUrls.forEach((url)=>{
            log('cropping '+url)
            jimp.read(url,(err,img)=>{
              if(err){log('Error during cropping'.bgRed);log(err)}
              img.autocrop()
              var newMsg='<@'+msg.author.id+'> used `!crop`'
              if(!creditsDisabled){
                chargeCredits(msg.author.id,0.05)
                newMsg+=', it cost :coin:`0.05`/`'+creditsRemaining(msg.author.id)+'`'
              }
              img.getBuffer(jimp.MIME_PNG, (err,buffer)=>{
                if(err){log(err)}
                bot.createMessage(msg.channel.id, newMsg, {file: buffer, name: 'cropped.png'})
              })
            })
          })
        }
        break
      }
      case '!expandup':
      case '!expanddown':
      case '!expandleft':
      case '!expandright':
      case '!expandsides':
      case '!expand':{
        if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          attachmentsUrls.forEach((url)=>{
            log('expanding '+url)
            jimp.read(url,(err,img)=>{
              if(err){log('Error during expansion'.bgRed);log(err)}
              img.background(0x0)
              var expandHeight=256;var expandWidth=256;var x=0;var y=0
              switch(c){
                case '!expand':{expandHeight=256;expandWidth=256;x=128;y=128;break}
                case '!expandup':{expandHeight=256;expandWidth=0;x=0;y=256;break}
                case '!expanddown':{expandHeight=256;expandWidth=0;x=0;y=0;break}
                case '!expandleft':{expandHeight=0;expandWidth=256;x=256;y=0;break}
                case '!expandright':{expandHeight=0;expandWidth=256;x=0;y=0;break}
                case '!expandsides':{expandHeight=0;expandWidth=256;x=128;y=0;break}
              }
              var newImg=new jimp(img.bitmap.width+expandWidth,img.bitmap.height+expandHeight,0x0, function (err,image) {
                newImg.background(0x0).blit(img,x,y).getBuffer(jimp.MIME_PNG, (err,buffer)=>{
                  if(err){log(err)}
                  var newMsg = '<@'+msg.author.id+'> used `'+c+'`\nNew image size: '+newImg.bitmap.width+' x '+newImg.bitmap.height
                  if (!creditsDisabled){
                    chargeCredits(msg.author.id,0.05)
                    newMsg+='\nIt cost :coin:`0.05`/`'+creditsRemaining(msg.author.id)+'`'
                  }
                  bot.createMessage(msg.channel.id, newMsg, {file: buffer, name: 'expand.png'})
                })
              })
            })
          })
        }
        break
      }
      case '!fadeup':
      case '!fadedown':
      case '!fadeleft':
      case '!faderight':{
        if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          attachmentsUrls.forEach((url)=>{
            log('fading '+url)
            jimp.read(url,(err,img)=>{
              if(err){log('Error during fading'.bgRed);log(err)}
              var startx=0;var starty=0;var endx=0;var endy=0;var a=0;var newa=0;var fadeWidth=128
              switch(msg.content.split('fade')[1]){
                case('up'):{startx=0;starty=0;endx=img.bitmap.width;endy=fadeWidth;break}
                case('down'):{startx=0;starty=img.bitmap.height-fadeWidth;endx=img.bitmap.width;endy=fadeWidth;break}
                case('left'):{startx=0;starty=0;endx=fadeWidth;endy=img.bitmap.height;break}
                case('right'):{startx=img.bitmap.width-fadeWidth;starty=0;endx=fadeWidth;endy=img.bitmap.height;break}
              }
              img.scan(startx,starty,endx,endy, ((x,y,idx)=>{
                  //a=img.bitmap.data[idx+3]
                  switch(msg.content.split('fade')[1]){
                      case('up'):{newa=(y*4)+3;break}
                      case('down'):{newa=255-((y-starty)*2);break}
                      case('left'):{newa=(x*4);break}
                      case('right'):{newa=255-((x-startx)*2);break}
                  }
                  if(newa>255){newa=255};if(newa<0){newa=0}
                  img.bitmap.data[idx+3]=newa
              }))
              img.getBuffer(jimp.MIME_PNG, (err,buffer)=>{
                if(err){log(err)}
                  var newMsg='<@'+msg.author.id+'> used `'+c+'`'
                  if(!creditsDisabled){
                    chargeCredits(msg.author.id,0.05)
                    newMsg+=', it cost :coin:`0.05`/`'+creditsRemaining(msg.author.id)
                  }
                  bot.createMessage(msg.channel.id, newMsg, {file: buffer, name: 'faded.png'})
              })
            })
          })
        }
        break
      }
      case '!textTop':
      case '!textBottom':
      case '!textCenter':
      case '!text':{
        if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){
          var attachmentsUrls = msg.attachments.map((u)=>{return u.proxy_url})
          attachmentsUrls.forEach((url)=>{
            var newTxt=msg.content.substr(c.length+1)
            log('adding text: '+newTxt)
            jimp.read(url,(err,img)=>{
              if(err){log('Error during text addition'.bgRed);log(err)}
              var newMsg='<@'+msg.author.id+'> used `!text`'
              if (!creditsDisabled){
                chargeCredits(msg.author.id,0.05)
                newMsg+=', it cost :coin:`0.05`/`'+creditsRemaining(msg.author.id)+'`'
              }
              jimp.loadFont(jimp.FONT_SANS_32_BLACK).then(font => {
                //var newTxtWidth=jimp.measureText(jimp.FONT_SANS_32_BLACK, newTxt)
                //var newTxtHeight=jimp.measureTextHeight(jimp.FONT_SANS_32_BLACK, newTxt, 100)
                var txtObj={text:newTxt,alignmentX:jimp.HORIZONTAL_ALIGN_CENTER,alignmentY:jimp.VERTICAL_ALIGN_TOP,background:0xffffff}
                switch(c){
                  case '!text':
                  case '!textCenter':{txtObj.alignmentY=jimp.VERTICAL_ALIGN_MIDDLE;break}
                  case '!textTop':{txtObj.alignmentY=jimp.VERTICAL_ALIGN_TOP;break}
                  case '!textBottom':{txtObj.alignmentY=jimp.VERTICAL_ALIGN_BOTTOM;break}
                }
                img.print(font, 0, 0, txtObj, img.bitmap.width, img.bitmap.height)
                img.getBuffer(jimp.MIME_PNG, (err,buffer)=>{
                  if(err){log(err)}
                  try{bot.createMessage(msg.channel.id, newMsg, {file: buffer, name: 'text.png'})}catch(err){log(err)}
                })
              })
            })
          })
        }
        break
      }
      case '!models':{
        if(!models){socket.emit('requestSystemConfig')}
        var newMsg=''
        if(models){
          //debugLog(models)
          newMsg='**'+Object.keys(models).length+' models available**\n:green_circle: =loaded in VRAM :orange_circle: =cached in RAM :red_circle: = unloaded\n'
          Object.keys(models).forEach((m)=>{
            switch(models[m].status){
              case 'not loaded':{newMsg+=':red_circle:';break}
              case 'cached':{newMsg+=':orange_circle:';break}
              case 'active':{newMsg+=':green_circle:';break}
            }
            newMsg+='`'+m+'`'
            newMsg+=models[m].description+'\n'
            if(newMsg.length>=1500){try{chatChan(msg.channel.id,newMsg);newMsg=''}catch(err){log(err)}}
          })
          if(newMsg!==''){try{chatChan(msg.channel.id,newMsg)}catch(err){log(err)}}
        }
        break
      }
    }
  }
  if (msg.author.id===config.adminID) { // admins only
    if (c.startsWith('!')){log('admin command: '.bgRed+c)}
    switch(c){
      case '!dothething':{log(bot.users.get(msg.author.id).username);break}
      case '!wipequeue':{rendering=false;queue=[];dbWrite();log('admin wiped queue');break}
      case '!queue':{queueStatus();break}
      case '!cancel':{cancelRenders();break}
      case '!pause':{chat(':pause_button: Bot is paused, requests will still be accepted and queued for when I return');paused=true;rendering=true;break}
      case '!resume':{socket.emit('requestSystemConfig');paused=false;rendering=false;chat(':play_pause: Bot is back online');processQueue();break}
      case '!richlist':{getRichList();break}
      case '!checkpayments':{checkNewPayments();break}
      case '!restart':{log('Admin restarted bot'.bgRed.white);exit(0)}
      case '!creditdisabled':{log('Credits have been disabled'.bgRed.white);creditsDisabled=true;bot.createMessage(msg.channel.id,'Credits have been disabled');break}
      case '!creditenabled':{log('Credits have been enabled'.bgRed.white);creditsDisabled=false;bot.createMessage(msg.channel.id,'Credits have been enabled');break}
      case '!credit':{
        if (msg.mentions.length>0){
          var creditsToAdd=parseFloat(msg.content.split(' ')[1])
          if (Number.isInteger(creditsToAdd)){
            msg.mentions.forEach((m)=>{creditRecharge(creditsToAdd,'manual',m.id)})
            bot.createMessage(msg.channel.id,(msg.mentions.length)+' users received a manual `'+creditsToAdd+'` :coin: topup')
          } else {debugLog('creditsToAdd failed int test');debugLog(creditsToAdd)}
        }
        break
      }
      case '!say':{
        var sayChan=msg.content.split(' ')[1]
        var sayMsg=msg.content.substr((Math.ceil(Math.log10(sayChan+1)))+(msg.content.indexOf(msg.content.split(' ')[1])))
        if(Number.isInteger(parseInt(sayChan))&&sayMsg.length>0){
          log('sending message as arty to '+sayChan+':'+sayMsg)
          try{chatChan(sayChan,sayMsg)}
          catch(err){log('failed to !say with error:'.bgRed);log(err)}
        }
        break
      }
      case '!guilds':{bot.guilds.forEach((g)=>{log({id: g.id, name: g.name, ownerID: g.ownerID, description: g.description, memberCount: g.memberCount})});log('channelGuildMap');log(bot.channelGuildMap);log('threadguiltmap');log(bot.threadGuildMap);log('privateChannelMap');log(bot.privateChannelMap);break}
      case '!leaveguild':{bot.leaveGuild(msg.content.split(' ')[1]);break}
      case '!getmessages':{var cid=msg.content.split(' ')[1];if(cid){bot.getMessages(cid).then(x=>{x.reverse();x.forEach((y)=>{log(y.author.username.bgBlue+': '+y.content);y.attachments.map((u)=>{return u.proxy_url}).forEach((a)=>{log(a)})})})};break}
      case '!updateslashcommands':{bot.getCommands().then(cmds=>{bot.commands = new Collection();for (const c of slashCommands) {bot.commands.set(c.name, c);bot.createCommand({name: c.name,description: c.description,options: c.options ?? [],type: Constants.ApplicationCommandTypes.CHAT_INPUT})}});break}
      case '!deleteslashcommands':{bot.bulkEditCommands([]);bot.getCommands().then(cmds=>{bot.commands = new Collection();for (const c of slashCommands) {bot.commands.set(c.name, c);bot.createCommand({name: c.name,description: c.description,options: c.options ?? [],type: Constants.ApplicationCommandTypes.CHAT_INPUT})}});break}
      case '!randomisers':{
        var newMsg='**Currently loaded randomisers**\n'
        for (r in randoms){newMsg+='`{'+randoms[r]+'}`='+getRandom(randoms[r])+'\n'}
        if(newMsg.length<=2000){newMsg.length=1999} //max discord msg length of 2k
        try{chatChan(msg.channel.id,newMsg)}catch(err){log(err)}
        break
      }
    }
  }
})

// Socket listeners for invokeai backend api
//socket.on("connect", (socket) => {log(socket)})
socket.on("generationResult", (data) => {generationResult(data)})
socket.on("postprocessingResult", (data) => {postprocessingResult(data)})
socket.on("initialImageUploaded", (data) => {debugLog('got init image uploaded');initialImageUploaded(data)})
socket.on("imageUploaded", (data) => {debugLog('got image uploaded');initialImageUploaded(data)})
socket.on("systemConfig", (data) => {debugLog('systemConfig received');currentModel=data.model_weights;models=data.model_list})
socket.on("modelChanged", (data) => {currentModel=data.model_name;models=data.model_list;debugLog('modelChanged to '+currentModel)})
//socket.on("progressUpdate", (data) => {})
socket.on('error', (error) => {
  log('Api socket error'.bgRed);log(error)
  var nowJob=queue[queue.findIndex((j)=>j.status==="rendering")]
  if(nowJob){
    log('Failing status for:');nowJob.status='failed';log(nowJob)
    chatChan(nowJob.channel,':warning: <@'+nowJob.userid+'>, there was an error in your request with prompt: `'+nowJob.prompt+'`\n**Error:** `'+error.message+'`\n')
  }
  rendering=false
})

// Actual start of execution flow
bot.connect()
if(!models){socket.emit('requestSystemConfig')}
