const config = require('dotenv').config().parsed
const Eris = require("eris")
const Constants = Eris.Constants
const Collection = Eris.Collection
const CommandInteraction = Eris.CommandInteraction
const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')
const moment = require('moment')
var parseArgs = require('minimist')
const axios = require('axios')
const { ImgurClient } = require('imgur')
const imgur = new ImgurClient({ clientId: config.imgurClientID})
const bot = new Eris(config.discordBotKey, {
  intents: ["guildMessages", "messageContent"],
  description: "Just a slave to the art, maaan",
  owner: "ausbitbank",
  prefix: "!",
  reconnect: 'auto'
})
const defaultSize = 512
const basePath = config.basePath
if (!config||!config.apiUrl||!config.basePath||!config.channelID||!config.adminID||!config.discordBotKey||!config.pixelLimit||!config.fileWatcher) { throw('Please re-read the setup instructions at https://github.com/ausbitbank/stable-diffusion-discord-bot , you are missing the required .env configuration file') }
var queue = []
var msg = ''
var apiUrl = config.apiUrl
var rendering = false
var newJob = {}
var dialogs = { // Track our own messages to reduce spam with timed deletion
  queue: null
}


var slashCommands = [
  {
    name: 'dream',
    description: 'Create a new image from your prompt',
    options: [
      {type: '3', name: 'prompt', description: 'what would you like to see ?', required: true, min_length: 1, max_length:75 },
      {type: '4', name: 'width', description: 'width of the image in pixels', required: false, min_value: 128, max_value: 1024 },
      {type: '4', name: 'height', description: 'height of the image in pixels', required: false, min_value: 128, max_value: 1024 },
      {type: '4', name: 'steps', description: 'how many steps to render for', required: false, min_value: 5, max_value: 250 },
      {type: '4', name: 'seed', description: 'seed (initial noise pattern)', required: false},
      {type: '10', name: 'strength', description: 'how much noise to add to your template image (0.1-0.9)', required: false, min_value:0.1, max_value:1},
      {type: '4', name: 'scale', description: 'how important is the prompt (1-30)', required: false},
      {type: '4', name: 'number', description: 'how many would you like', required: false, min_value: 1, max_value: 4},
      {type: '5', name: 'seamless', description: 'Seamlessly tiling textures', required: false},
      {type: '3', name: 'sampler', description: 'which sampler to use (default is k_euler_a)', required: false, choices: [{name: 'ddim', value: 'ddim'},{name: 'plms', value: 'plms'},{name: 'k_lms', value: 'k_lms'},{name: 'k_dpm_2', value: 'k_dpm_2'},{name: 'k_dpm_2_a', value: 'k_dpm_2_a'},{name: 'k_euler', value: 'k_euler'},{name: 'k_euler_a', value: 'k_euler_a'},{name: 'k_heun', value: 'k_heun'}]},
      {type: '11', name: 'attachment', description: 'use template image (BROKEN USE !dream instead for attachments for now)', required: false},
      {type: '10', name: 'gfpgan_strength', description: 'GFPGan strength (low= more face correction, high= more accuracy)', required: false, min_value: 0, max_value: 1},
      {type: '3', name: 'upscale_level', description: 'upscale amount', required: false, choices: [{name: 'none', value: '0'},{name: '2x', value: '2'},{name: '4x', value: '4'}]},
      {type: '10', name: 'upscale_strength', description: 'upscale strength (smoothing/detail loss)', required: false, min_value: 0, max_value: 1},
      {type: '10', name: 'variation_amount', description: 'how much variation from the original image (need seed+not k_euler_a sampler)', required: false, min_value:0.01, max_value:1},
      {type: '3', name: 'with_variations', description: 'advanced variant control, provide seed(s)+weight eg "seed:weight,seed:weight"', required: false, min_length:4,max_length:100},
    ],
    // TODO, fix attachment option ^^ i.data.resolved.attachments?
    execute: (i) => { request({cmd: getCmd(prepSlashCmd(i.data.options)), userid: i.member.id, username: i.member.user.username, discriminator: i.member.user.discriminator, bot: i.member.user.bot, channelid: i.channel.id, attachments: []}) }
  },
  {
    name: 'prompt',
    description: 'Show me a random prompt from the library',
    options: [ {type: '3', name: 'prompt', description: 'Add these keywords to a random prompt', required: false} ],
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
})

bot.on("interactionCreate", async (interaction) => {
  if(interaction instanceof Eris.CommandInteraction && interaction.channel.id === config.channelID) {
    if (!bot.commands.has(interaction.data.name)) return interaction.createMessage({content:'Command does not exist', flags:64}).catch((e) => {console.log(e)})
    try { bot.commands.get(interaction.data.name).execute(interaction); interaction.createMessage({content: 'Your image will be rendered soon :tm:', flags: 64}).catch((e) => {console.log(e)}) }
    catch (error) { console.error(error); await interaction.createMessage({content:'There was an error while executing this command!', flags: 64}).catch((e) => {console.log(e)}) }
  }
  if(interaction instanceof Eris.ComponentInteraction && interaction.channel.id === config.channelID) {
    if (interaction.data.custom_id.startsWith('refresh')) { // || interaction.data.custom_id === 'refreshNoTemplate' || interaction.data.custom_id === 'refreshBatch' || interaction.data.custom_id === 'upscale') {
      console.log('refresh request from ' + interaction.member.user.username)
      var id = interaction.data.custom_id.split('-')[1]
      var newJob = queue[id-1]
      if (newJob) {
        newJob.number = 1
        newJob.seed = getRandomSeed()
        var cmd = getCmd(newJob)
        if (!interaction.data.custom_id.startsWith('refreshNoTemplate')) { if (newJob.template){ cmd+= ' --template ' + newJob.template } } else { console.log('refreshNoTemplate') }
        request({cmd: cmd, userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: []})
        // return interaction.editParent({embeds:{footer:{text: queue[id-1].prompt}},components:[interaction.message.components]}).catch((e) => {console.log(e)})
        return interaction.createMessage({content:'Refreshing', flags:64}).catch((e) => {console.log(e)})
      } else {
        console.error('unable to refresh render')
        return interaction.editParent({components:[]}).catch((e) => {console.log(e)})
      }
    } else if (interaction.data.custom_id.startsWith('template')) {
      console.log('template request from ' + interaction.member.user.username)
      // console.log(interaction.data.custom_id)
      id=interaction.data.custom_id.split('-')[1]
      var newJob = queue[id-1]
      if (newJob) {
        newJob.number = 1
        // console.log('job details found')
        var cmd = getCmd(newJob)
        cmd+= ' --template ' + interaction.data.custom_id.split('-')[2]
        request({cmd: cmd, userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: []})
        // return interaction.editParent({embed:{footer:{text: queue[id-1].prompt}} ,components:[interaction.message.components]}).catch((e) => {console.log(e)})
        return interaction.createMessage({content:'Using template', flags:64}).catch((e) => {console.log(e)})
      } else {
        console.error('template request failed')
        return interaction.editParent({components:[]}).catch((e) => {console.log(e)})
      }
    }
  }
})

bot.on("messageCreate", (msg) => {
  // console.log(msg)
  if((msg.content.startsWith("!prompt")) && msg.channel.id === config.channelID) {
    request({cmd: msg.content.replace('!prompt','').trim() + '' + getRandom('prompt'), userid: msg.author.id, username: msg.author.username, discriminator: msg.author.discriminator, bot: msg.author.bot, channelid: msg.channel.id, attachments: msg.attachments})
    msg.delete().catch(() => {})
  } else if(msg.content.startsWith("!dothething") && msg.channel.id === config.channelID && msg.author.id === config.adminID) {
    rendering = false; queue = []; console.log('admin wiped queue'); msg.delete().catch(() => {})
  } else if(msg.content.startsWith("!dream") && msg.channel.id === config.channelID) {
    console.log('!dream request from ' + msg.author.username)
    request({cmd: msg.content.substr(7, msg.content.length), userid: msg.author.id, username: msg.author.username, discriminator: msg.author.discriminator, bot: msg.author.bot, channelid: msg.channel.id, attachments: msg.attachments})
  } else if(msg.content === '!queue') {
    queueStatus()
    msg.delete().catch(() => {})
  }
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
  if (!args.sampler) { args.sampler = 'k_euler_a' }
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
  queue.push({
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
  })
  processQueue()
}

function queueStatus() {
  if(dialogs.queue!==null){dialogs.queue.delete().catch((err)=>{console.error(err)})}
  bot.createMessage(config.channelID,':information_source: New: `'+queue.filter(x=>x.status==='new').length+'`, Rendering: `'+queue.filter(x=>x.status==='rendering').length+'`, Done: `'+queue.filter(x=>x.status==='done').length + '`, Total: `'+queue.length+'`, Users: `'+queue.map(x=>x.userid).filter(unique).length+'`').then(x=>{dialogs.queue=x})
}
function prepSlashCmd(options) { // Turn partial options into full command for slash commands, hate the redundant code here
  var job = {}
  var defaults = [{ name: 'prompt', value: ''},{name: 'width', value: defaultSize},{name:'height',value:defaultSize},{name:'steps',value:50},{name:'scale',value:7.5},{name:'sampler',value:'k_euler_a'},{name:'seed', value: getRandomSeed()},{name:'strength',value:0.75},{name:'number',value:1},{name:'gfpgan_strength',value:0},{name:'upscale_strength',value:0.75},{name:'upscale_level',value:''},{name:'seamless',value:'off'},{name:'variation_amount',value:0},{name:'with_variations',value:''}]
  defaults.forEach(d=>{ if (options.find(o=>{ if (o.name===d.name) { return true } else { return false } })) { job[d.name] = options.find(o=>{ if (o.name===d.name) { return true } else { return false } }).value } else { job[d.name] = d.value } })
  return job
}
function getCmd(newJob){ return newJob.prompt+' --width ' + newJob.width + ' --height ' + newJob.height + ' --seed ' + newJob.seed + ' --scale ' + newJob.scale + ' --sampler ' + newJob.sampler + ' --steps ' + newJob.steps + ' --strength ' + newJob.strength + ' --n ' + newJob.number + ' --gfpgan_strength ' + newJob.gfpgan_strength + ' --upscale_level ' + newJob.upscale_level + ' --upscale_strength ' + newJob.upscale_strength + ' --seamless ' + newJob.seamless + ' --variation_amount ' + newJob.variation_amount + ' --with_variations ' + newJob.with_variations}
function getRandomSeed() {return Math.floor(Math.random() * 4294967295)}
function chat(msg) { if (msg !== null && msg !== '') { bot.createMessage(config.channelID, msg) } }
function sanitize (prompt) { return prompt.replace(/[^一-龠ぁ-ゔァ-ヴーa-zA-Z0-9_ａ-ｚＡ-Ｚ０-９々〆〤ヶ()\*\[\] ,.\:]/g, '') }
function base64Encode(file) { var body = fs.readFileSync(file); return body.toString('base64') }
async function addRenderApi (id) {
  var job = queue[queue.findIndex(x => x.id === id)] 
  var initimg = null
  job.status = 'rendering'
  //console.log(job)
  if (job.template !== undefined) {
    try { initimg = 'data:image/png;base64,' + base64Encode(basePath + job.template + '.png') }
    catch (err) { console.error(err); initimg = null; job.template = '' }
  }
  if (job.attachments.length > 0 && job.attachments[0].content_type === 'image/png') { // && job.msg.attachments.width === '512' && job.msg.attachments.height === '512'
    console.log('fetching attachment from ' + job.attachments[0].proxy_url)
    await axios.get(job.attachments[0].proxy_url, {responseType: 'arraybuffer'})
      .then(res => { initimg = 'data:image/png;base64,' + Buffer.from(res.data).toString('base64'); job.initimg = initimg })
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
  // console.log('postRender')
  // console.log(render)
  try { fs.readFile(render.url, null, function(err, data) {
    if (err) { console.error(err) } else {
      filename = render.url.split('\\')[render.url.split('\\').length-1].replace(".png","")
      var job = queue[queue.findIndex(x => x.id === render.config.id)]
      job.dateRenderFinish = moment()
      var msg = '<@' + job.userid + '>'
      if (render.config.width !== defaultSize || render.config.height !== defaultSize) { msg+= ':straight_ruler:`' + render.config.width + 'x' + render.config.height + '`' }
      if (job.upscale_level !== '') { msg+= ':mag:**`Upscaled x ' + job.upscale_level + '(' + job.upscale_strength + ')`**'}
      if (job.gfpgan_strength !== 0) { msg+= ':magic_wand:`gfpgan face fix (' + job.gfpgan_strength + ')`'}
      if (job.seamless === 'on') { msg+= ':knot:**`Seamless Tiling`**'}
      if (job.template) { msg+= ':frame_photo:`' + job.template + '` :muscle: `' + render.config.strength + '`'}
      if (job.initimg) { msg+= ':paperclip:` attached template` :muscle: `' + render.config.strength + '`'}
      if (job.variation_amount !== 0) { msg+= ':microbe:**`Variation ' + job.variation_amount + '`**'}
      if (job.with_variations !== '') { msg+= ':linked_paperclips:**variants `' + job.with_variations + '`**'}
      msg+= ':seedling: `' + render.seed + '`:scales:`' + render.config.cfg_scale + '`:recycle:`' + render.config.steps + '`'
      msg+= ':stopwatch:`' + timeDiff(job.timestampRequested, moment()) + 's` :file_cabinet: `' + filename + '` :eye: `' + render.config.sampler_name + '`'
      var newMessage = { content: msg, embeds: [{description: render.config.prompt}], components: [ { type: Constants.ComponentTypes.ACTION_ROW, components: [ ] } ] }
      if (job.upscale_level==='') {
        newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Refresh", custom_id: "refresh-" + job.id, emoji: { name: '🎲', id: null}, disabled: false })
        newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Template", custom_id: "template-" + job.id + '-' + filename, emoji: { name: '📷', id: null}, disabled: false })
        // newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Upscale", custom_id: "upscale-" + job.id + '-' + seed, emoji: { name: '🔍', id: null}, disabled: false })
      } else if (job.template) { newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.DANGER, label: "Remove template", custom_id: "refreshNoTemplate-" + job.id, emoji: { name: '🎲', id: null}, disabled: false })
      } else { delete newMessage.components } // If no components are used, the empty frame causes a crash so remove it
      var filesize = fs.statSync(render.url).size
      if (filesize < 8000000) { // Within discord 8mb filesize limit
        try { bot.createMessage(job.channel, newMessage, {file: data, name: filename + '.png' }) }
        catch (err) {console.error(err)}
      } else {
        if (imgurEnabled()) {
          chat('<@' + job.userid + '> your file was too big for discord, uploading to imgur now..')
          try { imgurupload(render.url).then(upload => { chat({ content: msg, embeds: [{image: {url: upload.link}, description:render.config.prompt}]}) }) }
          catch (err) { console.error(err); chat('Sorry <@' + job.userid + '> imgur uploading failed, contact an admin for your image `' + filename + '.png`') }
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
  queueStatus()
  var nextJob = queue[queue.findIndex(x => x.status === 'new')]
  if (nextJob !== undefined && rendering === false) {
    rendering = true
    console.info({user: nextJob.username, cmd: nextJob.cmd, prompt: nextJob.prompt})
    addRenderApi(nextJob.id)
  }
}

const unique = (value, index, self) => { return self.indexOf(value) === index }
function timeDiff (date1,date2) { return date2.diff(date1, 'seconds') }
function getRandom(what) { if (['prompt','artist','city','genre','medium','emoji','subject','madeof','style','animal','bodypart','gerund','verb','adverb','adjective','star'].includes(what)) { try { var lines = fs.readFileSync('txt\\' + what + '.txt', 'utf-8').split(/r?\n/); return lines[Math.floor(Math.random()*lines.length)] } catch (err) { console.error(err)} } else { return what } }
function replaceRandoms (input) {
  var output = input.replaceAll('{prompt}',getRandom('prompt'))
  output = output.replaceAll('{artist}',getRandom('artist'))
  output = output.replaceAll('{city}',getRandom('city'))
  output = output.replaceAll('{genre}',getRandom('genre'))
  output = output.replaceAll('{medium}',getRandom('medium'))
  // output = output.replaceAll('{emoji}',getRandom('emoji))
  output = output.replaceAll('{subject}',getRandom('subject'))
  output = output.replaceAll('{madeof}',getRandom('madeof'))
  output = output.replaceAll('{style}',getRandom('style'))
  output = output.replaceAll('{animal}',getRandom('animal'))
  output = output.replaceAll('{bodypart}',getRandom('bodypart'))
  output = output.replaceAll('{gerund}',getRandom('gerund'))
  output = output.replaceAll('{verb}',getRandom('verb'))
  output = output.replaceAll('{adverb}',getRandom('adverb'))
  output = output.replaceAll('{adjective}',getRandom('adjective'))
  output = output.replaceAll('{star}',getRandom('star'))
  return output
}

function imgurEnabled() { if (config.imgurClientID.length > 0) { return true } else { return false } }
async function imgurupload(file) {
  console.log('uploading via imgur api')
  const response = await imgur.upload({ image: fs.createReadStream(file), type: 'stream'})
  console.log(response.data)
  return response.data
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
