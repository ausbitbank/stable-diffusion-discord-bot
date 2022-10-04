const config = require('dotenv').config().parsed
const Eris = require("eris")
const Constants = Eris.Constants
const Collection = Eris.Collection
const fs = require('fs')
const axios = require('axios')
var parseArgs = require('minimist')
const chokidar = require('chokidar')
const moment = require('moment')
const { ImgurClient } = require('imgur')
const imgur = new ImgurClient({ clientId: config.imgurClientID})
const imgbb = require("imgbb-uploader")
const DIG = require("discord-image-generation")
const log = console.log.bind(console)
const dJSON = require('dirty-json')
var colors = require('colors')
const debounce = require('debounce')
var queue = []
var users = []
var payments = []
dbRead()
var schedule = []
var dbScheduleFile='./dbSchedule.json' // flat file db for schedule
dbScheduleRead()
var cron = require('node-cron')
// hive payment checks. On startup, every 30 minutes and on a !recharge call
const hive = require('@hiveio/hive-js')
const { exit } = require('process')
if (config.hivePaymentAddress.length>0){
  hive.config.set('alternative_api_endpoints',['https://api.hive.blog','https://rpc.ausbit.dev','https://api.openhive.network'])
  var hiveUsd = null
  getPrices()
  cron.schedule('0,15,30,45 * * * *', () => { log('Checking account history every 15 minutes'.grey); checkNewPayments() })
  cron.schedule('0,30 * * * *', () => { log('Updating hive price every 30 minutes'.grey); getPrices() })
}
cron.schedule('0 */12 * * *', () => { log('Recharging users with no credit every 12 hrs'.bgCyan.bold); freeRecharge() }) // Comment this out if you don't want free regular topups of low balance users
const bot = new Eris.CommandClient(config.discordBotKey, {
  intents: ["guilds", "guildMessages", "messageContent", "guildMembers", "directMessages", "guildMessageReactions"],
  description: "Just a slave to the art, maaan",
  owner: "ausbitbank",
  prefix: "!",
  reconnect: 'auto',
  compress: true,
  getAllUsers: false,
})
const defaultSize = 512
const basePath = config.basePath
if (!config||!config.apiUrl||!config.basePath||!config.channelID||!config.adminID||!config.discordBotKey||!config.pixelLimit||!config.fileWatcher) { throw('Please re-read the setup instructions at https://github.com/ausbitbank/stable-diffusion-discord-bot , you are missing the required .env configuration file or options') }
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
      {type: '4', name: 'number', description: 'how many would you like', required: false, min_value: 1, max_value: 10},
      {type: '5', name: 'seamless', description: 'Seamlessly tiling textures', required: false},
      {type: '3', name: 'sampler', description: 'which sampler to use (default is k_lms)', required: false, choices: [{name: 'ddim', value: 'ddim'},{name: 'plms', value: 'plms'},{name: 'k_lms', value: 'k_lms'},{name: 'k_dpm_2', value: 'k_dpm_2'},{name: 'k_dpm_2_a', value: 'k_dpm_2_a'},{name: 'k_euler', value: 'k_euler'},{name: 'k_euler_a', value: 'k_euler_a'},{name: 'k_heun', value: 'k_heun'}]},
      {type: '11', name: 'attachment', description: 'use template image', required: false},
      {type: '10', name: 'gfpgan_strength', description: 'GFPGan strength (low= more face correction, high= more accuracy)', required: false, min_value: 0, max_value: 1},
      {type: '3', name: 'upscale_level', description: 'upscale amount', required: false, choices: [{name: 'none', value: '0'},{name: '2x', value: '2'},{name: '4x', value: '4'}]},
      {type: '10', name: 'upscale_strength', description: 'upscale strength (smoothing/detail loss)', required: false, min_value: 0, max_value: 1},
      {type: '10', name: 'variation_amount', description: 'how much variation from the original image (need seed+not k_euler_a sampler)', required: false, min_value:0.01, max_value:1},
      {type: '3', name: 'with_variations', description: 'advanced variant control, provide seed(s)+weight eg "seed:weight,seed:weight"', required: false, min_length:4,max_length:100}
    ],
    cooldown: 500,
    execute: (i) => {
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
    options: [ {type: '3', name: 'prompt', description: 'Add these keywords to a random prompt', required: false} ],
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
    options: [ {type: '3', name: 'query', description: 'What are you looking for', required: true} ],
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

bot.on("ready", async () => {
  log("Connected to discord".bgGreen)
  log("Guilds:".bgGreen+' '+bot.guilds.size)
  processQueue()
  bot.getCommands().then(cmds=>{
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
      interaction.acknowledge()
        .then(x=> {
          interaction.deleteMessage('@original')
          .then((t) => {})//log('after delete interaction');log(t)
          .catch((e) => {log('error after delete interaction'.bgRed);console.error(e)}) })
        .catch((e)=>{console.error(e)})
    }
    catch (error) { console.error(error); await interaction.createMessage({content:'There was an error while executing this command!', flags: 64}).catch((e) => {log(e)}) }
  }
  if((interaction instanceof Eris.ComponentInteraction||interaction instanceof Eris.ModalSubmitInteraction) && authorised(interaction,interaction.channel.id,interaction.guildID)) {
    if (!interaction.member){log(interaction.user.username+' slid into artys DMs'); interaction.member={user:{id: interaction.user.id, username:interaction.user.username, discriminator: interaction.user.discriminator, bot: interaction.user.bot}}}
    log(interaction.data.custom_id.bgCyan.black+' request from ' + interaction.member.user.username.bgCyan.black)
    if (interaction.data.custom_id.startsWith('random')) {
      var prompt = getRandom('prompt')
      request({cmd: prompt, userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: []})
      return interaction.editParent({}).catch((e)=>{log(e)})
    } else if (interaction.data.custom_id.startsWith('refresh')) {
      var id = interaction.data.custom_id.split('-')[1]
      var newJob=JSON.parse(JSON.stringify(queue[id-1])) // parse/stringify to deep copy and make sure we dont edit the original
      if (newJob) {
        newJob.number = 1
        if (interaction.data.custom_id.startsWith('refreshEdit-')){ newJob.prompt = interaction.data.components[0].components[0].value }
        if (newJob.webhook){delete newJob.webhook}
        if (interaction.data.custom_id.startsWith('refreshVariants')&&newJob.sampler!=='k_euler_a') { // variants do not work with k_euler_a sampler
          newJob.variation_amount=0.1
          newJob.seed = interaction.data.custom_id.split('-')[2]
          if (interaction.data.custom_id.split('-')[3]){ // variant of a variant
            newJob.with_variations=interaction.data.custom_id.split('-')[3]+':0.2' // todo find good default variant weight
          }
        } else if (interaction.data.custom_id.startsWith('refreshUpscale-')) {
          newJob.upscale_level = 2
          newJob.seed = interaction.data.custom_id.split('-')[2]
          newJob.variation_amount=0
        } else {
          newJob.variation_amount=0
          newJob.seed=getRandomSeed()
        }
        var cmd = getCmd(newJob)
        var attach = []
        if (!interaction.data.custom_id.startsWith('refreshNoTemplate')) {
          if (newJob.template){ cmd+= ' --template ' + newJob.template }
          if (newJob.attachments.length>0){attach=newJob.attachments} // transfer attachments to new jobs unless specifically asked not to
        } else {
          log('refreshNoTemplate')
        }
        var finalReq = {cmd: cmd, userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: attach}
        request(finalReq)
        return interaction.editParent({}).catch((e)=>{console.error(e)})
      } else {
        console.error('unable to refresh render'.red)
        return interaction.editParent({components:[]}).catch((e) => {console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('template')) {
      id=interaction.data.custom_id.split('-')[1]
      var newJob=JSON.parse(JSON.stringify(queue[id-1])) // parse/stringify to deep copy and make sure we dont edit the original
      if (newJob) {
        newJob.number = 1
        if (newJob.webhook){delete newJob.webhook}
        var cmd = getCmd(newJob)
        cmd+= ' --template ' + interaction.data.custom_id.split('-')[2]
        request({cmd: cmd, userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: []})
        return interaction.editParent({}).catch((e)=>{console.error(e)})
      } else {
        console.error('template request failed')
        return interaction.editParent({components:[]}).catch((e) => {console.error(e)})
      }
    } else if (interaction.data.custom_id.startsWith('edit-')) {
      id=interaction.data.custom_id.split('-')[1]
      var newJob=JSON.parse(JSON.stringify(queue[id-1])) // parse/stringify to deep copy and make sure we dont edit the original
      if (newJob) {
        newJob.number = 1
        if (newJob.webhook){delete newJob.webhook}
        return interaction.createModal({custom_id:'refreshEdit-'+newJob.id,title:'Edit the prompt',components:[{type:1,components:[{type:4,custom_id:'prompt',label:'Prompt',style:2,value:newJob.prompt,required:true}]}]}).then((r)=>{}).catch((e)=>{console.error(e)})
      } else {
        console.error('edit request failed')
        return interaction.editParent({components:[]}).catch((e) => {console.error(e)})
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
  if (!reactor.user){log('DEBUG reactor.user.id not found, find its replacement here'.bgRed); log(reactor)}
  if (msg.author.id===bot.application.id){
    switch(emoji.name){
      case '😂':
      case '👍':
      case '⭐':
      case '❤️': log('Positive emojis'.green+emoji.name.bgWhite.rainbow); break
      case '✉️': log('sending image to dm'.dim);directMessageUser(reactor.user.id,{content: msg.content, embeds: embeds});break // todo debug occasional error about reactor.user.id undefined here
      case '👎':
      case '⚠️':
      case '🙈':
      case '💩': log('Negative emojis'.red+emoji.name.red); break
    }
  } 
})

//bot.on("messageReactionRemoved", (msg,emoji,userid) => {log('message reaction removed');log(msg,emoji,userid)})
bot.on("warn", (msg,id) => {log('warn'.bgRed);log(msg,id)})
//bot.on("debug", (msg,id) => {log(msg,id)})
bot.on("disconnect", () => {log('disconnected'.bgRed)})
bot.on("error", (err,id) => {log('error'.bgRed); log(err,id)})
//bot.on("channelCreate", (channel) => {log(channel)})
//bot.on("channelDelete", (channel) => {log(channel)})
bot.on("guildCreate", (guild) => {var m='joined new guild: '+guild.name;log(m.bgRed);directMessageUser(config.adminID,m)})
bot.on("guildDelete", (guild) => {var m='left guild: '+guild.name;log(m.bgRed);directMessageUser(config.adminID,m)})
bot.on("guildAvailable", (guild) => {var m='guild available: '+guild.name;log(m.bgRed)})
bot.on("channelCreate", (channel) => {var m='channel created: '+channel.name+' in '+channel.guild.name+' for '+channel.memberCount+' users';log(m.bgRed)})
bot.on("channelDelete", (channel) => {var m='channel deleted: '+channel.name+' in '+channel.guild.name+' for '+channel.memberCount+' users';log(m.bgRed)})
bot.on("guildMemberAdd", (guild,member) => {var m='User '+member.username+'#'+member.discriminator+' joined guild '+guild.name;log(m.bgMagenta)})
bot.on("guildMemberRemove", (guild,member) => {var m='User '+member.username+'#'+member.discriminator+' left guild '+guild.name;log(m.bgMagenta)})
//bot.on("guildMemberUpdate", (guild,member,oldMember,communicationDisabledUntil) => {log('user updated'.bgRed); log(member)}) // todo fires on user edits, want to reward users that start boosting HQ server, oldMember.premiumSince=Timestamp since boosting guild
//bot.on("channelRecipientAdd", (channel,user) => {log(channel,user)})
//bot.on("channelRecipientRemove", (channel,user) => {log(channel,user)})

bot.on("messageCreate", (msg) => {
  if (!msg.author.bot){log(msg.author.username.bgBlue.red.bold+':'+msg.content.bgBlack)} // an irc like view of non bot messages in allowed channels. Creepy but convenient
  var c=msg.content.split(' ')[0]
  if (msg.author.id!==bot.id&&authorised(msg,msg.channel.id,msg.guildID,)){ // Work in anywhere its authorized // (msg.channel.id===config.channelID||!msg.guildID) // interaction.member,interaction.channel.id,interaction.guildID
    switch(c){
      case '!dream':{request({cmd: msg.content.substr(7, msg.content.length), userid: msg.author.id, username: msg.author.username, discriminator: msg.author.discriminator, bot: msg.author.bot, channelid: msg.channel.id, attachments: msg.attachments});break}
      case '!prompt':
      case '!random':{request({cmd: msg.content.substr(8,msg.content.length)+getRandom('prompt'), userid: msg.author.id, username: msg.author.username, discriminator: msg.author.discriminator, bot: msg.author.bot, channelid: msg.channel.id, attachments: msg.attachments});break}
      case '!recharge':rechargePrompt(msg.author.id,msg.channel.id);break
      case '!lexica':lexicaSearch(msg.content.substr(8, msg.content.length),msg.channel.id);break
      case '!meme':{if (msg.attachments.length>0&&msg.attachments[0].content_type.startsWith('image/')){meme(msg.content.substr(6, msg.content.length),msg.attachments.map((u)=>{return u.proxy_url}),msg.author.id,msg.channel.id)} else if (msg.content.startsWith('!meme lisapresentation')){meme(msg.content.substr(6, msg.content.length),urls,msg.author.id,msg.channel.id)};break}
      case '!avatar':{var avatars='';msg.mentions.forEach((m)=>{avatars+=m.avatarURL.replace('size=128','size=512')+'\n'});bot.createMessage(msg.channel.id,avatars);break}
    }
  }
  if (msg.author.id===config.adminID) { // admins only
    if (c.startsWith('!')){log('admin command: '.bgRed+c)}
    switch(c){
      case '!dothething':{log(bot.guilds.size);break}
      case '!wipequeue':{rendering=false;queue=[];dbWrite();log('admin wiped queue');break}
      case '!queue':{queueStatus();break}
      case '!pause':{chat(':pause_button: Bot is paused, requests will still be accepted and queued for when I return');rendering=true;break}
      case '!resume':{rendering=false;chat(':play_pause: Bot is back online');processQueue();break}
      case '!richlist':{getRichList();break}
      case '!checkpayments':{checkNewPayments();break}
      case '!restart':{log('Admin restarted bot'.bgRed.white);exit(0)}
      case '!credit':{creditRecharge(msg.content.split(' ')[1], 'manual', msg.content.split(' ')[2]);break} // creditRecharge(credits,txid,userid,amount,from)
      case '!guilds':{bot.guilds.forEach((g)=>{log({id: g.id, name: g.name, ownerID: g.ownerID, description: g.description, memberCount: g.memberCount})});break}
      case '!updateslashcommands':{bot.getCommands().then(cmds=>{bot.commands = new Collection();for (const c of slashCommands) {bot.commands.set(c.name, c);bot.createCommand({name: c.name,description: c.description,options: c.options ?? [],type: Constants.ApplicationCommandTypes.CHAT_INPUT})}});break}
    }
  }
})

bot.connect()

function request(request){
  // request = { cmd: string, userid: int, username: string, discriminator: int, bot: false, channelid: int, attachments: {}, }
  if (request.cmd.includes('{')) { request.cmd = replaceRandoms(request.cmd) } // swap randomizers
  var args = parseArgs(request.cmd.split(' '),{string: ['template','init_img','sampler']}) // parse arguments
  // messy code below contains defaults values, check numbers are actually numbers and within acceptable ranges etc
  if (!args.width||!Number.isInteger(args.width)||args.width<256){args.width=defaultSize }
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
    log('compromised resolution to '+args.width+'x'+args.height)
  }
  if (!args.steps||!Number.isInteger(args.steps)||args.steps>250){args.steps=50} // max 250 steps, default 50
  if (!args.seed||!Number.isInteger(args.seed)||args.seed<1||args.seed>4294967295){args.seed=getRandomSeed()}
  if (!args.strength||args.strength>1||args.strength<0){args.strength=0.75}
  if (!args.scale||args.scale>30||args.scale<0){args.scale=7.5}
  if (!args.sampler){args.sampler='k_lms'}
  if (args.n){args.number=args.n}
  if (!args.number||!Number.isInteger(args.number)||args.number>10||args.number<1){args.number=1}
  if (!args.seamless){args.seamless='off'}else{if (args.seamless==='true'){args.seamless='on'};if (args.seamless==='false'){args.seamless='off'}}
  if (!args.renderer||['localApi'].includes(args.renderer)){args.renderer='localApi'}
  if (args.template) {
    args.template = sanitize(args.template)
    try { if (!fs.existsSync(config.basePath+args.template+'.png')){args.template=undefined} }
    catch (err) {console.error(err);args.template=undefined}
  } else { args.template = undefined }
  if (!args.gfpgan_strength){args.gfpgan_strength=0}
  if (!args.upscale_level){args.upscale_level=''}
  if (!args.upscale_strength){args.upscale_strength=0.75}
  if (!args.variation_amount||args.variation_amount>1||args.variation_amount<0){args.variation_amount=0}
  if (!args.with_variations){args.with_variations=''}
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
    template: args.template,
    gfpgan_strength: args.gfpgan_strength,
    upscale_level: args.upscale_level,
    upscale_strength: args.upscale_strength,
    seamless: args.seamless,
    variation_amount: args.variation_amount,
    with_variations: args.with_variations,
    results: []
  }
  if(newJob.channel==='webhook'&&request.webhook){newJob.webhook=request.webhook}
  newJob.cost = costCalculator(newJob)
  queue.push(newJob)
  dbWrite() // Push db write after each new addition
  processQueue()
}
function queueStatus() { // todo report status to the relevant channel where the current render was triggered
  if(dialogs.queue!==null){dialogs.queue.delete().catch((err)=>{console.error(err)})}
  var statusMsg=':information_source: Waiting: `'+queue.filter(x=>x.status==='new').length+'`, Rendering: `'+queue.filter(x=>x.status==='rendering').length+'`, Recent Users: `'+queue.map(x=>x.userid).filter(unique).length+'`/`'+users.length+'`, Guilds:`'+bot.guilds.size+'`'
  if (queue.filter(x=>x.status==='rendering').length>0) {
    var next = queue.filter(x=>x.status==='rendering')[0]
    statusMsg+='\n:track_next:'
    /*if (next.channel!==config.channelID) { // private DM render or webhook
      statusMsg+=':face_with_open_eyes_and_hand_over_mouth:'
    } else {*/
      statusMsg+='`'+next.prompt + '`'
    //} No longer needed as we only report prompts to the channel that called them
    if (next.number!==1){statusMsg+='x'+next.number}
    statusMsg+=' for '+next.username+'#'+next.discriminator
  }
  if (next){var chan=next.channel} else {var chan=config.channelID}
  bot.createMessage(chan,statusMsg).then(x=>{dialogs.queue=x}).catch((err)=>console.error(err))
}
function closestRes(n){ // diffusion needs a resolution as a multiple of 64 pixels, find the closest
    var q, n1, n2; var m=64
    q=n/m
    n1=m*q
    if ((n*m)>0){n2=m*(q+1)}else{n2=m*(q-1)}
    if (Math.abs(n-n1)<Math.abs(n-n2)){return n1.toFixed(0)}        
    return n2.toFixed(0)
}
function prepSlashCmd(options) { // Turn partial options into full command for slash commands, hate the redundant code here
  var job = {}
  var defaults = [{ name: 'prompt', value: ''},{name: 'width', value: defaultSize},{name:'height',value:defaultSize},{name:'steps',value:50},{name:'scale',value:7.5},{name:'sampler',value:'k_lms'},{name:'seed', value: getRandomSeed()},{name:'strength',value:0.75},{name:'number',value:1},{name:'gfpgan_strength',value:0},{name:'upscale_strength',value:0.75},{name:'upscale_level',value:''},{name:'seamless',value:'off'},{name:'variation_amount',value:0},{name:'with_variations',value:''}]
  defaults.forEach(d=>{ if (options.find(o=>{ if (o.name===d.name) { return true } else { return false } })) { job[d.name] = options.find(o=>{ if (o.name===d.name) { return true } else { return false } }).value } else { job[d.name] = d.value } })
  return job
}
function getCmd(newJob){ return newJob.prompt+' --width ' + newJob.width + ' --height ' + newJob.height + ' --seed ' + newJob.seed + ' --scale ' + newJob.scale + ' --sampler ' + newJob.sampler + ' --steps ' + newJob.steps + ' --strength ' + newJob.strength + ' --n ' + newJob.number + ' --gfpgan_strength ' + newJob.gfpgan_strength + ' --upscale_level ' + newJob.upscale_level + ' --upscale_strength ' + newJob.upscale_strength + ' --seamless ' + newJob.seamless + ' --variation_amount ' + newJob.variation_amount + ' --with_variations ' + newJob.with_variations}
function getRandomSeed() {return Math.floor(Math.random() * 4294967295)}
function chat(msg) {if (msg !== null && msg !== ''){bot.createMessage(config.channelID, msg)}}
function sanitize (prompt) {
  if (config.bannedWords.length>0) { config.bannedWords.split(',').forEach((bannedWord, index) => { prompt = prompt.replace(bannedWord,'') }) }
  return prompt.replace(/[^一-龠ぁ-ゔァ-ヴーa-zA-Z0-9_ａ-ｚＡ-Ｚ０-９々〆〤ヶ()\&\*\[\] ,.\:]/g, '').replace('`','') // (/[^一-龠ぁ-ゔァ-ヴーa-zA-Z0-9_ａ-ｚＡ-Ｚ０-９々〆〤ヶ()\*\[\] ,.\:]/g, '')
}
function base64Encode(file) { var body = fs.readFileSync(file); return body.toString('base64') }
function authorised(who,channel,guild) {
  var bannedUsers=[];var allowedGuilds=[];var allowedChannels=[];var ignoredChannels=[];var userid=null;var username=null
  if (who.user && who.user.id && who.user.username){userid = who.user.id;username = who.user.username} else {userid=who.author.id;username=who.author.username}
  if (config.bannedUsers.length>0){log('banned users loaded from env');bannedUsers=config.bannedUsers.split(',')}
  if (config.allowedGuilds.length>0){log('allowed guilds loaded from env');allowedGuilds=config.allowedGuilds.split(',')}
  if (config.allowedChannels.length>0){log('allowed channels loaded from env');allowedChannels=config.allowedChannels.split(',')}
  if (config.ignoredChannels.length>0){log('ignored channels loaded from env');ignoredChannels=config.ignoredChannels.split(',')}
  if (bannedUsers.includes(userid)){
    log('fail, user is banned:'+username);return true // disabled
  } else if(guild && allowedGuilds.length>0 && !allowedGuilds.includes(guild)){
    log('fail, guild not allowed:'+guild);return true // disabled
  } else if(channel && allowedChannels.length>0 && !allowedChannels.includes(channel)){
    log('fail, channel not allowed:'+channel);return true //disabled
  } else if (channel && ignoredChannels.length>0 && ignoredChannels.includes(channel)){
    log('fail, channel is ignored:'+channel);return true //disabled
  } else {
    //log('passed auth:'+member.username)
    return true
  }
}
function createNewUser(id){
  users.push({id:id, credits:100}) // 100 creds for new users
  dbWrite() // Sync after new user
  log('created new user with id '.bgBlue.black.bold + id)
  //chat(':tada: Welcome <@'+id+'>')
}
function userCreditCheck(userID,amount) { // Check if a user can afford a specific amount of credits, create if not existing yet
  var user = users.find(x=>x.id===userID)
  if (!user){createNewUser(userID);user=users.find(x=>x.id===userID)}
  if (parseFloat(user.credits)>=parseFloat(amount)){return true}else{return false}
}
function costCalculator(job) {                 // Pass in a render, get a cost in credits
  var cost=1                                   // a normal render base cost, 512x512 50 steps
  var pixelBase=262144                         // 512x512 reference pixel size
  var pixels=job.width*job.height              // How many pixels does this render use?
  cost=(pixels/pixelBase)*cost                 // premium or discount for resolution relative to default
  cost=(job.steps/50)*cost                     // premium or discount for step count relative to default
  if (job.gfpgan_strength!==0){cost=cost*1.05} // 5% charge for gfpgan face fixing
  if (job.upscale_level===2){cost=cost*2}      // 2x charge for upscale 2x
  if (job.upscale_level===4){cost=cost*4}      // 4x charge for upscale 4x 
  if (job.channel!==config.channelID){cost=cost*1.1} // 10% charge for DM private renders or webhooks
  cost=cost*job.number                         // Multiply by image count
  return cost.toFixed(2)                       // Return cost to 2 decimal places
}
function creditsRemaining(userID){return users.find(x=>x.id===userID).credits}
function chargeCredits(userID,amount){
  var user=users.find(x=>x.id===userID)
  user.credits=(user.credits-amount).toFixed(2)
  dbWrite()
  var z = 'charged id '+userID+' for '+amount+' credits, '+user.credits.bgRed+' remaining'
  log(z.dim.bold)
}
function creditRecharge(credits,txid,userid,amount,from){
  var user=users.find(x=>x.id===userid)
  if(!user){createNewUser(userid)}
  user.credits=(parseFloat(user.credits)+parseFloat(credits)).toFixed(2)
  if (txid!=='manual'){
    payments.push({credits:credits,txid:txid,userid:userid,amount:amount})
    var paymentMessage = ':tada: <@'+userid+'> added :coin:`'+credits+'`, balance is now :coin:`'+user.credits+'`\n:heart_on_fire: Thanks `'+from+'` for the `'+amount+'` donation to the GPU fund.\n Type !recharge to get your own topup info'
    directMessageUser(userid,paymentMessage)
    chat(paymentMessage)
  }
  dbWrite()
}
function freeRecharge() {
  // allow for regular topups of empty accounts
  // new users get 100 credits on first appearance, then freeRechargeAmount more every 12 hours IF their balance is less then freeRechargeMinBalance
  // first lets find accounts with credit < freeRechargeMinBalance
  var freeRechargeMinBalance = 10
  var freeRechargeAmount = 10
  var freeRechargeUsers = users.filter(u=>u.credits<freeRechargeMinBalance)
  var freeRechargeMsg = ':fireworks: Congratulations '
  if (freeRechargeUsers.length>0){
    log(freeRechargeUsers.length+' users with balances below '+freeRechargeMinBalance+' getting a free '+freeRechargeAmount+' credit topup')
    freeRechargeUsers.forEach(u=>{
      u.credits = parseFloat(u.credits)+freeRechargeAmount // Incentivizes drain down to 9 for max free charge leaving balance at 19 
      // u.credits = 10 // Incentivizes completely emptying balance for max free charge leaving balance at 10
      freeRechargeMsg+='<@'+u.id+'>,'
    })
    freeRechargeMsg+=' you received a free '+freeRechargeAmount+' :coin: topup!\n:information_source:Everyone with a balance below '+freeRechargeMinBalance+' will get this once every 12 hours'
    chat(freeRechargeMsg)
    dbWrite()
  } else {
    log('No users eligible for free credit recharge')
  }
}
function dbWrite() {
  try {
    fs.writeFileSync('dbQueue.json', JSON.stringify({ queue: queue }))
    fs.writeFileSync('dbUsers.json', JSON.stringify({ users: users }))
    fs.writeFileSync('dbPayments.json', JSON.stringify({ payments: payments }))
  } catch(err) {log('Failed to write db files'.bgRed);log(err)}}
function dbRead() {
  try{
    fs.readFile('dbQueue.json',function(err,data){
      if(err){console.error(err)}
      queue = JSON.parse(data).queue
    })
    fs.readFile('dbUsers.json',function(err,data){
      if(err){console.error(err)}
      users = JSON.parse(data).users
    })
    fs.readFile('dbPayments.json',function(err,data){
      if(err){console.error(err)}
      payments = JSON.parse(data).payments
    })
  } catch (err){log('Failed to read db files'.bgRed)}
}
function dbScheduleRead(){
  log('read schedule db'.grey.dim)
  try{
    fs.readFile(dbScheduleFile,function(err,data){
      if(err){console.error(err)}
      var j = JSON.parse(data)
      schedule = j.schedule
      scheduleInit()
    })
  }
  catch(err){console.error('failed to read schedule db'); console.error(err)}
}
function scheduleInit(){
  // cycle through the active schedule jobs, set up render jobs with cron
  log('init schedule'.grey)
  schedule.filter(s=>s.enabled==='True').forEach(s=>{
    log('Scheduling job: '.grey+s.name)
    cron.schedule(s.cron, () => {
      log('Running scheduled job: '.grey+s.name)
      var randomPrompt = s.prompts[Math.floor(Math.random()*s.prompts.length)].prompt
      var newRequest = {cmd: randomPrompt, userid: s.admins[0].id, username: s.admins[0].username, discriminator: s.admins[0].discriminator, bot: 'False', channelid: 'webhook', attachments: [], webhook: {url: s.webhook, alias: s.alias, destination: s.name}}
      request(newRequest)
    })
  })
}
function getRichList () {
  var u = users.filter(u=>u.credits>11).sort((a,b)=>b.credits-a.credits)
  var richlistMsg = 'Rich List\n'
  u.forEach(u=>{ richlistMsg+=u.id+':coin:`'+u.credits+'`\n' })
  //chat(richlistMsg)
  log(richlistMsg)
  log(bot.guild.members())
}
function getPrices () {
  axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=hive&order=market_cap_asc&per_page=1&page=1&sparkline=false')
    .then((response) => { hiveUsd = response.data[0].current_price; log('HIVE: $'+hiveUsd) })
    .catch(() => { log('Failed to load data from coingecko api'.red.bold) })
}
function getLightningInvoiceQr(memo){
  var appname = config.hivePaymentAddress+'_discord' // TODO should this be an .env variable?
  return 'https://api.v4v.app/v1/new_invoice_hive?hive_accname='+config.hivePaymentAddress+'&amount=1&currency=HBD&usd_hbd=false&app_name='+appname+'&expiry=300&message='+memo+'&qr_code=png'
}
function rechargePrompt(userid,channel){
  // TODO add encrypted memo support by default to keep discord ids private
  userCreditCheck(userid,1) // make sure the account exists first
  checkNewPayments()
  var paymentMemo = config.hivePaymentPrefix+userid
  var paymentLinkHbd = 'https://hivesigner.com/sign/transfer?to='+config.hivePaymentAddress+'&amount=1.000%20HBD&memo='+paymentMemo
  var paymentLinkHive = 'https://hivesigner.com/sign/transfer?to='+config.hivePaymentAddress+'&amount=1.000%20HIVE&memo='+paymentMemo
  var lightningInvoiceQr = getLightningInvoiceQr(paymentMemo)
  var paymentMsg = '<@'+ userid +'> has :coin:`'+ creditsRemaining(userid) +'` left\n\n*Recharging costs `1` usd per :coin:`100` *\nSend HBD or HIVE to `'+ config.hivePaymentAddress +'` with the memo `'+ paymentMemo +'`\n**Pay $1 with Hbd:** '+paymentLinkHbd+'\n**Pay $1 with Hive:** '+paymentLinkHive
  var freeRechargeMsg = '..Or just wait for your free recharge of 10 credits twice a day'
  var paymentMsgObject = {
    content: paymentMsg,
    embeds:[{description:'Pay $1 via btc lightning network', image:{url:lightningInvoiceQr}}]}
  if (creditsRemaining(userid)<10){paymentMsgObject.embeds.push({footer:{text:freeRechargeMsg}})}
  directMessageUser(userid,paymentMsgObject,channel).catch((err)=>log(err))
  log('ID '+userid+' asked for recharge link')
}
function checkNewPayments(){
  var bitmask = ['4',null] // transfers only
  log('Checking recent payments for '.grey+config.hivePaymentAddress.grey)
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
              amountCredit = (amount*hiveUsd)*100
            }
            log('New Payment: amount credit:'.bgBrightGreen.red+amountCredit+' , amount:'+op.amount)
            creditRecharge(amountCredit,tx.trx_id,accountId,op.amount,op.from)
          }
        }
      })
    } else {console.error('error fetching account history (results not array)')}
  })
}
function sendWebhook(job){
  let embeds = [ { color: getRandomColorDec(), footer: { text: job.prompt }, image: { url: job.webhook.imgurl } } ]
  axios({method: "POST",url: job.webhook.url,headers: { "Content-Type": "application/json" },data: JSON.stringify({embeds})})
    .then((response) => {log("Webhook delivered successfully")})
    .catch((error) => {console.error(error)})
}
async function addRenderApi (id) {
  var job = queue[queue.findIndex(x=>x.id===id)] 
  var initimg = null
  job.status = 'rendering'
  queueStatus()
  if (job.template !== undefined) {
    try { initimg = 'data:image/png;base64,' + base64Encode(basePath + job.template + '.png') }
    catch (err) { console.error(err); initimg = null; job.template = '' }
  }
  if (job.attachments[0] && job.attachments[0].content_type && job.attachments[0].content_type.startsWith('image')) {
    log('fetching attachment from '.bgRed + job.attachments[0].proxy_url)
    await axios.get(job.attachments[0].proxy_url, {responseType: 'arraybuffer'})
      .then(res => { initimg = 'data:image/png;base64,' + Buffer.from(res.data).toString('base64'); log('got attachment') }) //removed //job.initimg = initimg
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
  // new stream based version
  const apiResponse = await axios.post(apiUrl, postObject, {responseType: 'stream'}).catch(error => { console.error('error connecting to api server'); console.error(error) })
    if (apiResponse){
    const apiResponseStream = apiResponse.data
    var delayPost = []
    var json = undefined
    apiResponseStream.on('data', data=>{
      try {
        json = dJSON.parse(data)
        if (json&&json.event&&json.event==='result') {
          job.results.push({filename: json.url, seed: json.seed}) // keep each generated images filename and seed
          json.config.id = job.id
          if (job.gfpgan_strength===0&&job.upscale_level===''){ postRender(json) } else { delayPost.push(json) } // Only send images after postprocessing
        } else if (json&&json.event&&json.event==='step') {
          //process.stdout.write(`${json.step},`) // count off individual steps on same line
        } else {
          //log(json)
        }
      } catch (e) {
        console.error(e)
      }
    })
    apiResponseStream.on('end', data=>{
      if (delayPost.length>0){
        //log('delayed renders after postprocessing:'); log(delayPost)
        delayPost.forEach((i)=>{postRender(i)}) // send images delayed for postprocessing
      }
      job.status='done'
      rendering = false
      processQueue()
    })
  }
}

async function postRender (render) {
  try { fs.readFile(render.url, null, function(err, data) {
    if (err) { console.error(err) } else {
      filename = render.url.split('\\')[render.url.split('\\').length-1].replace(".png","")
      var job = queue[queue.findIndex(x => x.id === render.config.id)]
      var msg = ':brain:<@' + job.userid + '>'
      msg+= ':straight_ruler:`' + render.config.width + 'x' + render.config.height + '`' //if (render.config.width !== defaultSize || render.config.height !== defaultSize) { msg+= ':straight_ruler:`' + render.config.width + 'x' + render.config.height + '`' }
      if (job.upscale_level !== '') { msg+= ':mag:**`Upscaledx' + job.upscale_level + ' to '+(parseFloat(job.width)*parseFloat(job.upscale_level))+'x'+(parseFloat(job.height)*parseFloat(job.upscale_level))+' (' + job.upscale_strength + ')`**'}
      if (job.gfpgan_strength !== 0) { msg+= ':magic_wand:`gfpgan face fix(' + job.gfpgan_strength + ')`'}
      if (job.seamless === 'on') { msg+= ':knot:**`Seamless Tiling`**'}
      if (job.template) { msg+= ':frame_photo:`' + job.template + '`:muscle:`' + render.config.strength + '`'}
      if (job.attachments.length>0) { msg+= ':paperclip:` attached template`:muscle:`' + render.config.strength + '`'}
      if (job.variation_amount !== 0) { msg+= ':microbe:**`Variation ' + job.variation_amount + '`**'}
      if (job.with_variations !== '') { msg+= ':linked_paperclips:with variants `' + job.with_variations + '`'}
      msg+= ':seedling:`' + render.seed + '`:scales:`' + render.config.cfg_scale + '`:recycle:`' + render.config.steps + '`'
      msg+= ':stopwatch:`' + timeDiff(job.timestampRequested, moment()) + 's`'
      msg+= ':file_cabinet:`' + filename + '`:eye:`' + render.config.sampler_name + '`'
      if (job.webhook){msg+='\n:calendar:Scheduled render sent to `'+job.webhook.destination+'` discord'}
      chargeCredits(job.userid,(costCalculator(job))/job.number) // only charge successful renders
      if (job.cost){msg+=':coin:`'+(job.cost/job.number).toFixed(2).replace(/[.,]00$/, "")+'/'+ creditsRemaining(job.userid) +'`'}
      var newMessage = { content: msg, embeds: [{description: render.config.prompt, color: getRandomColorDec()}], components: [ { type: Constants.ComponentTypes.ACTION_ROW, components: [ ] } ] }
      newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Refresh", custom_id: "refresh-" + job.id, emoji: { name: '🎲', id: null}, disabled: false })
      if (job.upscale_level==='') {
        if (!job.attachments.length>0&&job.sampler!=='k_euler_a'){
          if (job.variation_amount===0){ // not already a variant
            newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "10% Variant", custom_id: "refreshVariants-" + job.id + '-' + render.seed, emoji: { name: '🧬', id: null}, disabled: false })
          } else { // job is a variant, we need the original seed + variant seed
            newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "10% Variant", custom_id: "refreshVariants-" + job.id + '-' + job.seed + '-' + render.seed, emoji: { name: '🧬', id: null}, disabled: false })
          }
        }
        // newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Template", custom_id: "template-" + job.id + '-' + filename, emoji: { name: '📷', id: null}, disabled: false })
        //newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Upscale", custom_id: "refreshUpscale-" + job.id + '-' + render.seed, emoji: { name: '🔍', id: null}, disabled: false })
        if (job.template){ newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.DANGER, label: "Remove template", custom_id: "refreshNoTemplate-" + job.id, emoji: { name: '🎲', id: null}, disabled: false })}
      }
      newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Edit", custom_id: "edit-"+job.id, emoji: { name: '✏️', id: null}, disabled: false })
      if (newMessage.components[0].components.length<5){
        newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Random", custom_id: "random", emoji: { name: '🔀', id: null}, disabled: false })
      }
      if (newMessage.components[0].components.length===0){delete newMessage.components} // If no components are used there will be a discord api error so remove it
      var filesize = fs.statSync(render.url).size
      if (filesize < 8000000) { // Within discord 8mb filesize limit
        try {
          bot.createMessage(job.channel, newMessage, {file: data, name: filename + '.png'}).then(m=>{
            if (job.channel==='webhook'&&job.webhook) {
              job.webhook.imgurl=m.attachments[0].url
              sendWebhook(job)
            }
          }).catch((err)=>{log('caught error posting to discord'.bgRed);log(err)})
        }
        catch (err) {console.error(err)}
      } else {
        if (imgurEnabled() && filesize < 10000000) {
          bot.createMessage(job.channel,'<@' + job.userid + '> your file was too big for discord, uploading to imgur now..')
          try { imgurupload(render.url).then(upload => { bot.createMessage(job.channel,{ content: msg, embeds: [{image: {url: upload.link}, description:render.config.prompt}]}) }) }
          catch (err) { console.error(err); bot.createMessage(job.channel,'Sorry <@' + job.userid + '> imgur uploading failed, contact an admin for your image `' + filename + '.png`') }
        } else if (imgbbEnabled() && filesize < 32000000) {
          chat('<@' + job.userid + '> your file was too big for discord, uploading to imgbb now..')
          try { imgbbupload(render.url).then(upload => { log(upload); bot.createMessage(job.channel,{ content: msg, embeds: [{image: {url: upload.url}, description:render.config.prompt}]}) }) }
          catch (err) { console.error(err); bot.createMessage(job.channel,'Sorry <@' + job.userid + '> imgbb uploading failed, contact an admin for your image `' + filename + '.png`') }
        } else {
          bot.createMessage(job.channel,'Sorry <@' + job.userid + '> but your file was too big for discord, contact an admin for your image `' + filename + '.png`')
        }
      }
    }
    })
  }
  catch(err) {console.error(err)}
}
function processQueue () {
  var nextJob = queue[queue.findIndex(x => x.status === 'new')]
  // TODO make a queueing system that prioritizes the users that have recharged the most
  if (nextJob!==undefined&&rendering===false) {
    if (userCreditCheck(nextJob.userid,costCalculator(nextJob))) {
      bot.editStatus('online')
      rendering=true
      log(nextJob.username.bgWhite.red+':'+nextJob.cmd.replace('\r','').replace('\n').bgWhite.black)
      addRenderApi(nextJob.id)
    } else {
      log(nextJob.username+' cant afford this render, denying')
      log('cost: '+costCalculator(nextJob))
      log('credits remaining: '+creditsRemaining(nextJob.userid))
      nextJob.status='failed';dbWrite()
      //chat('sorry <@'+nextJob.userid+'> you don\'t have enough credits for that render (cost '+ costCalculator(nextJob) +').')
      if(config.hivePaymentAddress.length>0){
        rechargePrompt(nextJob.userid,nextJob.channel)
      } else {
        chat('An admin can manually top up your credit with\n`!credit '+ nextJob.userid +' 1`')
      }
      processQueue()
    }
  } else if(!rendering&&!nextJob) {
    // no jobs, not rendering
    log('Finished queue, setting idle status'.dim)
    bot.editStatus('idle')
  }
}
function lexicaSearch(query,channel){
  // Quick and dirty lexica search api, needs docs to make it more efficient (query limit etc)
  var api = 'https://lexica.art/api/v1/search?q='+query
  var link = 'https://lexica.art/search?q='+query
  var reply = {content:'Query: `'+query+'`\nTop 10 results from lexica.art api:\n**More:** '+link, embeds:[], components:[]}
  axios.get(api)
    .then((r)=>{
      // we only care about SD results
      var filteredResults = r.data.images.filter(i=>i.model==='stable-diffusion')//.slice(0,10)
      // want only unique prompt ids
      filteredResults = filteredResults.filter((value, index, self) => {
        return self.findIndex(v => v.promptid === value.promptid) === index;
      })
      log('Lexica search for :`'+query+'` gave '+r.data.images.length+' results, '+filteredResults.length+' after filtering')
      // shuffle and trim to 10 results // todo make this an option once lexica writes api docs
      shuffle(filteredResults)
      filteredResults = filteredResults.slice(0,10)
      //console.log(r.data.images[0])
      /*
      {
        id: '07bb9901-14e8-4d9a-ab8c-ee29361677e0',
        gallery: 'https://lexica.art?q=07bb9901-14e8-4d9a-ab8c-ee29361677e0',
        src: 'https://lexica-serve-encoded-images.sharif.workers.dev/md/07bb9901-14e8-4d9a-ab8c-ee29361677e0',
        srcSmall: 'https://lexica-serve-encoded-images.sharif.workers.dev/sm/07bb9901-14e8-4d9a-ab8c-ee29361677e0',
        prompt: 'milt kahl sketch of black hair cuban girl with dog nose ',
        width: 512,
        height: 512,
        seed: '477122037',
        grid: false,
        model: 'stable-diffusion',
        promptid: '40b36d7e-f1f2-4327-862f-2c77b4a6b808'
      }
      */
      filteredResults.forEach(i=>{
        reply.embeds.push({
          color: getRandomColorDec(),
          description: ':seedling:`'+i.seed+'` :straight_ruler:`'+i.width+'x'+i.height+'`',
          image:{url:i.srcSmall},
          footer:{text:i.prompt}
        })
      })
      //directMessageUser()
      bot.createMessage(channel, reply)
    })
    .catch((error) => console.error(error))
}
lexicaSearch=debounce(lexicaSearch,1000,true)
function shuffle(array) {for (let i = array.length - 1; i > 0; i--) {let j = Math.floor(Math.random() * (i + 1));[array[i], array[j]] = [array[j], array[i]]}} // fisher-yates shuffle
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
    chargeCredits(userid,0.05)
    var extension = ['blink','triggered','animate'].includes(cmd) ? '.gif' : '.png'
    var msg = '<@'+userid+'> used `!meme '+prompt+'`, it cost :coin:`0.05`/`'+creditsRemaining(userid)+'`'
    bot.createMessage(channel, msg, {file: img, name: cmd+'-'+getRandomSeed()+extension})
  }
}
meme=debounce(meme,1000,true)
const unique = (value, index, self) => { return self.indexOf(value) === index }
function getRandomColorDec(){return Math.floor(Math.random()*16777215)}
function timeDiff (date1,date2) { return date2.diff(date1, 'seconds') }
var randoms = ['prompt','artist','city','genre','medium','emoji','subject','madeof','style','animal','bodypart','gerund','verb','adverb','adjective','star','fruit','country','gender']
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
  log('uploading via imgur api')
  const response = await imgur.upload({ image: fs.createReadStream(file), type: 'stream'})
  log(response.data)
  return response.data
}
function imgbbEnabled() { if (config.imgbbClientID.length > 0) { return true } else { return false } }
async function imgbbupload(file) {
  log('uploading via imgbb api')
  //log(file)
  imgbb(config.imgbbClientID, file)
    .then((response) => {log(response); return response})
    .catch((error) => console.error(error))
}

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
