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
const bot = new Eris(config.discordBotKey, {
  intents: ["guildMessages", "messageContent"],
  description: "Just a slave to the art, maaan",
  owner: "ausbitbank",
  prefix: "!"
})
var queue = []
var finished = []
var msg = ''
var artspamchannelid = config.channelID
var apiUrl = config.apiUrl
var rendering = false
var newJob = {}

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
      {type: '4', name: 'strength', description: 'how much noise to add to your template image (0.1-0.9)', required: false},
      {type: '4', name: 'scale', description: 'how important is the prompt (1-30)', required: false},
      {type: '4', name: 'number', description: 'how many would you like', required: false, min_value: 1, max_value: 4},
      {type: '3', name: 'sampler', description: 'seed (initial noise pattern)', required: false, choices: [{name: 'ddim', value: 'ddim'},{name: 'plms', value: 'plms'},{name: 'k_lms', value: 'k_lms'},{name: 'k_dpm_2', value: 'k_dpm_2'},{name: 'k_dpm_2_a', value: 'k_dpm_2_a'},{name: 'k_euler', value: 'k_euler'},{name: 'k_euler_a', value: 'k_euler_a'},{name: 'k_heun', value: 'k_heun'}]}
      // {type: '11', name: 'attachment', description: 'use a template image', required: false}
    ],
    // TODO, fix attachment option ^^
    execute: (i) => { request({cmd: getCmd(prepSlashCmd(i.data.options)), userid: i.member.id, username: i.member.user.username, discriminator: i.member.user.discriminator, bot: i.member.user.bot, channelid: i.channel.id, attachments: []}) }
  },
  /*{
    name: 'prompt',
    description: 'Show me a random prompt from the library',
    options: [ {type: '3', name: 'prompt', description: 'Add these keywords to a random prompt', required: false} ],
    execute: (i) => {
      var prompt = ''
      if (i.data[0].value) { prompt+= i.data[0].value + ' ' }
      prompt += getRandomPrompt()
      request({cmd: prompt, userid: i.member.id, username: i.member.user.username, discriminator: i.member.user.discriminator, bot: i.member.user.bot, channelid: i.channel.id, attachments: []})
    }
  }*/
]

bot.on("ready", async () => {
  console.log("Ready to go")
  bot.commands = new Collection()
  for (const c of slashCommands) {
    bot.commands.set(c.name, c)
    bot.createCommand({
      name: c.name,
      description: c.description,
      options: c.options ?? [],
      type: Constants.ApplicationCommandTypes.CHAT_INPUT
    })
  }
  console.log('slash commands loaded')
})

bot.on("interactionCreate", async (interaction) => {
  if(interaction instanceof Eris.CommandInteraction) {
    if (!bot.commands.has(interaction.data.name)) return interaction.createMessage({content:'Command does not exist', flags:64})
    try { await bot.commands.get(interaction.data.name).execute(interaction); await interaction.createMessage({content: 'soon :tm:', flags: 64}) }
    catch (error) { console.error(error); await interaction.createMessage({content:'There was an error while executing this command!', flags: 64}) }
  }
  if(interaction instanceof Eris.ComponentInteraction) {
    if (interaction.data.custom_id.startsWith('refresh')) { // || interaction.data.custom_id === 'refreshNoTemplate' || interaction.data.custom_id === 'refreshBatch' || interaction.data.custom_id === 'upscale') {
      console.log('refresh request')
      var id = interaction.data.custom_id.split('-')[1]
      var newJob = queue[id-1]
      if (newJob) {
        newJob.seed = getRandomSeed()
        var cmd = getCmd(newJob)
        if (!interaction.data.custom_id.startsWith('refreshNoTemplate')) { if (newJob.template){ cmd+= ' --template ' + newJob.template } } else { console.log('refreshNoTemplate') }
        request({cmd: cmd, userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: []})
        return interaction.editParent({embed:{footer:{text: interaction.member.user.username + ' chose ' + interaction.data.custom_id.split('-')[0] + ' id ' + interaction.data.custom_id.split('-')[1] }} ,components:[]}).catch((e) => {console.log(e)})
      } else {
        console.error('unable to refresh render')
        return interaction.editParent({components:[]}).catch((e) => {console.log(e)})
      }
    } else if (interaction.data.custom_id.startsWith('template')) {
      console.log('template request')
      console.log(interaction.data.custom_id)
      id=interaction.data.custom_id.split('-')[1]
      var newJob = queue[id-1]
      if (newJob) {
        console.log('job details found')
        var cmd = getCmd(newJob)
        cmd+= ' --template ' + interaction.data.custom_id.split('-')[2]
        request({cmd: cmd, userid: interaction.member.user.id, username: interaction.member.user.username, discriminator: interaction.member.user.discriminator, bot: interaction.member.user.bot, channelid: interaction.channel.id, attachments: []})
        return interaction.editParent({embed:{footer:{text: interaction.member.user.username + ' chose ' + interaction.data.custom_id.split('-')[0] + ' id ' + interaction.data.custom_id.split('-')[1] }} ,components:[]}).catch((e) => {console.log(e)})
      } else {
        console.error('template request failed')
        return interaction.editParent({components:[]}).catch((e) => {console.log(e)})
      }
    }
  }
})

bot.on("messageCreate", (msg) => {
  if((msg.content.startsWith("!prompt")) && msg.channel.id === artspamchannelid) {
    request({cmd: msg.content.replace('!prompt','').trim() + '' + getRandomPrompt(), userid: msg.author.id, username: msg.author.username, discriminator: msg.author.discriminator, bot: msg.author.bot, channelid: msg.channel.id, attachments: msg.attachments})
    msg.delete().catch(() => {})
  } else if(msg.content.startsWith("!dothething") && msg.channel.id === artspamchannelid && msg.author.id === config.adminID) {
    rendering = false; queue = []; console.log('admin wiped queue'); msg.delete().catch(() => {})
  } else if(msg.content.startsWith("!dream") && msg.channel.id === artspamchannelid) {
    request({cmd: msg.content.substr(7, msg.content.length), userid: msg.author.id, username: msg.author.username, discriminator: msg.author.discriminator, bot: msg.author.bot, channelid: msg.channel.id, attachments: msg.attachments})
  } else if(msg.content === '!queue') {
    queueStatus()
    msg.delete().catch(() => {})
  }
})
bot.connect()

function request(request){
  // request = { cmd: string, userid: int, username: string, discriminator: int, bot: false, channelid: int, attachments: {}, }
  console.log('request'); console.log(request)//tmp logging
  if (request.cmd.includes('{')) { request.cmd = replaceRandoms(request.cmd) } // swap randomizers
  var args = parseArgs(request.cmd.split(' '),{string: ['template','init_img','sampler']}) // parse arguments
  // messy code below contains defaults values, check numbers are actually numbers and within acceptable ranges etc
  if (!args.width || !Number.isInteger(args.width) || (512*args.width>config.pixelLimit)) { args.width = 512 }
  if (!args.height || !Number.isInteger(args.height) || (512*args.height>config.pixelLimit)) { args.height = 512 }
  if (!args.steps || !Number.isInteger(args.steps) || args.steps > 250) { args.steps = 50 } // max 250 steps, default 50
  if (!args.seed || !Number.isInteger(args.seed) || args.seed < 1 || args.seed > 4294967295 ) { args.seed = getRandomSeed() }
  if (!args.strength || args.strength > 1 || args.strength < 0 ) { args.strength = 0.75 }
  if (!args.scale || args.scale > 30 || args.scale < 0 ) { args.scale = 7.5 }
  if (!args.sampler || ['ddim','plms','k_lms','k_dpm_2','k_dpm_2_a','k_euler','k_euler_a','k_heun'].includes(args.sampler)) { args.sampler = 'k_euler_a' }
  if (!args.n || !Number.isInteger(args.n) || args.n > 5 || args.n < 1) { args.n = 1 }
  if (!args.seamless) { args.seamless = 'off'} else { args.seamless = 'on' }
  if (!args.renderer || ['localApi'].includes(args.renderer)) { args.renderer = 'localApi'}
  if (args.template) { newJob.template = sanitize(args.template) } else { newJob.template = null }
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
    n: args.n,
    width: args.width,
    height: args.height,
    steps: args.steps,
    prompt: args.prompt,
    scale: args.scale,
    sampler: args.sampler,
    renderer: args.renderer,
    strength: args.strength,
    template: args.template
  })
  processQueue()
}

function queueStatus() {
  var statusNew = queue.filter(x => x.status === 'new').length
  var statusDone = queue.filter(x => x.status === 'done').length
  var statusRendering = queue.filter(x => x.status === 'rendering').length
  var statusFailed = queue.filter(x => x.status === 'failed').length
  var statusUserCount = queue.map(x => x.userid).filter(unique).length
  chat(':information_source: New: `' + statusNew + '`, Rendering: `' + statusRendering + '`, Failed: `' + statusFailed + '`, Done: `' + statusDone + '`, Total: `' + queue.length + '`, Users: `' + statusUserCount + '`')
}
function prepSlashCmd(options) { // Turn partial options into full command for slash commands, hate the redundant code here
  var job = {}
  for (o of options) {
    if (o.name === 'prompt') {job.prompt = o.value}
    if (o.name === 'width') {job.width = o.value} else { job.width = 512 }
    if (o.name === 'height') {job.height = o.value} else { job.height = 512}
    if (o.name === 'steps') {job.steps = o.value} else { job.steps = 50 }
    if (o.name === 'scale') {job.scale = o.value} else { job.scale = 7.5 }
    if (o.name === 'seed') {job.seed = o.value} else { job.seed = getRandomSeed() }
    if (o.name === 'strength') {job.strength = o.value} else { job.strength = 0.75 }
    if (o.name === 'n') {job.n = options.n} else { job.n = 1 }
  }
  console.log(job)
  return job
}
function getCmd(newJob){ return newJob.prompt+' --width ' + newJob.width + ' --height ' + newJob.height + ' --seed ' + newJob.seed + ' --scale ' + newJob.scale + ' --strength ' + newJob.strength + ' --n 1' }
function getRandomSeed() {return Math.floor(Math.random() * 4294967295)}
function chat(msg) { if (msg !== null && msg !== '') { bot.createMessage(artspamchannelid, msg) } }
function sanitize (prompt) { return prompt.replace(/[^一-龠ぁ-ゔァ-ヴーa-zA-Z0-9ａ-ｚＡ-Ｚ０-９々〆〤ヶ()\*\[\] ,.\:]/g, '') }
function base64Encode(file) { var body = fs.readFileSync(file); return body.toString('base64') }
async function addRenderApi (id) {
  var job = queue[queue.findIndex(x => x.id === id)] 
  var initimg = null
  job.status = 'rendering'
  console.log(job)
  if (job.template !== undefined) { initimg = 'data:image/png;base64,' + base64Encode('allrenders\\sdbot\\' + job.template + '.png') }
  if (job.attachments.length > 0 && job.attachments[0].content_type === 'image/png') { // && job.msg.attachments.width === '512' && job.msg.attachments.height === '512'
    console.log('fetching attachment from ' + job.attachments[0].proxy_url)
    await axios.get(job.attachments[0].proxy_url, {responseType: 'arraybuffer'})
      .then(res => { initimg = 'data:image/ping;base64,' + Buffer.from(res.data).toString('base64'); job.initimg = initimg })
      .catch(err => { console.error('unable to fetch url: ' + job.attachments[0].proxy_url); console.error(err) })
  }
  if (job.strength === undefined){ console.log('no strength defined, setting to 0.75'); job.strength = 0.75 }
  if (job.sampler === undefined){ console.log('no sampler defined, setting to k_euler_a');job.sampler = 'k_euler_a' }
  var prompt = job.prompt
  var postObject = {
      "prompt": prompt,
      "iterations": job.n,
      "steps": job.steps,
      "cfg_scale": job.scale,
      "sampler_name": job.sampler,
      "width": job.width,
      "height": job.height,
      "seed": job.seed,
      "variation_amount": 0,
      "with_variations": '',
      "initimg": initimg,
      "strength": job.strength,
      "fit": "on",
      "gfpgan_strength": 0,
      "upscale_level": '', // 2 or 4 or ''
      "upscale_strength": 0.75,
      "initimg_name": ''
    }
  if (job.seamless) { postObject.seamless = 'on' }
  axios.post(apiUrl, postObject)
    .then(res => {
      // if (queue.length > 0) { console.log('Moving item to pastjobs: ' + queue[0].prompt + ' by ' + queue[0].authorname); finished.push(queue.shift()) }
      var data = res.data.split("\n")
      data.pop() // Remove blank line from the end of api output
      data.forEach(line => {
        line = JSON.parse(line)
        if (line.event !== 'result'){ return } else { 
          line.config.id = job.id
          postRender(line) }
      })
      rendering = false
      job.status = 'done'
      processQueue()
      queueStatus()
    })
    .catch(error => { console.log('error'); console.error(error) })
}

async function postRender (render) {
  console.log('postRender')
  console.log(render)
  fs.readFile(render.url, null, function(err, data) {
    if (err) { console.error(err) } else {
      filename = render.url.split('\\')[render.url.split('\\').length-1].replace(".png","")
      var job = queue[queue.findIndex(x => x.id === render.config.id)]
      // job.status = 'done'
      console.log('postrender job')
      console.log(job)
      job.dateRenderFinish = moment()
      var msg = '`!dream "' + render.config.prompt + '"` for <@' + job.userid + '>\n'
      if (render.config.width !== 512 || render.config.height !== 512) { msg+= ':straight_ruler:`' + render.config.width + 'x' + render.config.height + '`' }
      if (job.G) { msg+= ':mag:**`Upscaled x 2`**'}
      if (job.seamless) { msg+= ':knot:**`Seamless Tiling`**'}
      if (job.template) { msg+= ':frame_photo:`' + job.template + '` :muscle: `' + render.config.strength + '`'}
      if (job.initimg) { msg+= ':frame_photo:` attached template` :muscle: `' + render.config.strength + '`'}
      // if (last.msg.author.bot !== 'true' && last.msg.attachments.length > 0 && last.msg.attachments[0].content_type === 'image/png') { msg+= ':paperclip:**custom template** :muscle: `' + render.config.strength + '`'}
      msg+= ':seedling: `' + render.seed + '`:scales:`' + render.config.cfg_scale + '`:recycle:`' + render.config.steps + '`'
      msg+= ':stopwatch:`' + timeDiff(job.timestampRequested, moment()) + 's` :file_cabinet: `' + filename + '` :eye: `' + render.config.sampler_name + '`'
      var newMessage = { content: msg, components: [ { type: Constants.ComponentTypes.ACTION_ROW, components: [ ] } ] }
      newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "New seed", custom_id: "refresh-" + job.id, emoji: { name: '🎲', id: null}, disabled: false })
      if (job.template) { newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.DANGER, label: "Remove template", custom_id: "refreshNoTemplate-" + job.id, emoji: { name: '🎲', id: null}, disabled: false }) } 
      newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Use as template", custom_id: "template-" + job.id + '-' + filename, emoji: { name: '📷', id: null}, disabled: false })
      bot.createMessage(job.channel, newMessage, {file: data, name: filename + '.png' })
    }
  })
}

function processQueue () {
  var nextJob = queue[queue.findIndex(x => x.status === 'new')] // queue[queue.findIndex(x => x.id === id)
  if (nextJob !== undefined && rendering === false) {
    rendering = true
    console.log('starting prompt: ' + nextJob.prompt)
    // finished.push(queue[0])
    addRenderApi(nextJob.id)
  } else if (rendering === true) { console.error('already rendering') }
}

function process (file) {
  if (file.endsWith('.png') || file.endsWith('.jpg')) {
    setTimeout(function() {
      fs.readFile(file, null, function(err, data) { 
        if (err) { console.error(err); } else {
          filename = file.replace("allrenders\\sdbot\\", "").replace(".png","")
          msg = ':file_cabinet:' + filename
          bot.createMessage(artspamchannelid, msg, {file: data, name: filename })
        }
      }, 300)
    }
  )}
}

const unique = (value, index, self) => { return self.indexOf(value) === index }
function timeDiff (date1,date2) { return date2.diff(date1, 'seconds') }
function getRandomPrompt () { var prompts = fs.readFileSync('prompts.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomArtist () { var prompts = fs.readFileSync('artist.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomCity () { var prompts = fs.readFileSync('city.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomGenre () { var prompts = fs.readFileSync('genre.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomMedium () { var prompts = fs.readFileSync('medium.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomEmoji () { var prompts = fs.readFileSync('emoji.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomSubject () { var prompts = fs.readFileSync('subject.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomMadeOf () { var prompts = fs.readFileSync('madeof.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomStyle () { var prompts = fs.readFileSync('style.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomAnimal () { var prompts = fs.readFileSync('animal.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomBodyPart () { var prompts = fs.readFileSync('bodypart.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomGerund () { var prompts = fs.readFileSync('gerunds.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomVerb () { var prompts = fs.readFileSync('verbs.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomAdverb () { var prompts = fs.readFileSync('adverb.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomAdjective() { var prompts = fs.readFileSync('adjectives.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function getRandomStar() { var prompts = fs.readFileSync('stars.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
// function getRandom() { var prompts = fs.readFileSync('adjectives.txt', 'utf8'); prompts = prompts.split(/\r?\n/); return(prompts[Math.floor(Math.random() * prompts.length)]); }
function replaceRandoms (input) {
  console.log('replaceRandoms')
  var output = input // Disabled randomisers, works fine if you add the required filenames above to script folder ^^
  var output = input.replaceAll('{prompt}',getRandomPrompt())
  output = output.replaceAll('{artist}',getRandomArtist())
  output = output.replaceAll('{city}',getRandomCity())
  output = output.replaceAll('{genre}',getRandomGenre())
  output = output.replaceAll('{medium}',getRandomMedium())
  output = output.replaceAll('{emoji}',getRandomEmoji())
  output = output.replaceAll('{subject}',getRandomSubject())
  output = output.replaceAll('{madeof}',getRandomMadeOf())
  output = output.replaceAll('{style}',getRandomStyle())
  output = output.replaceAll('{animal}',getRandomAnimal())
  output = output.replaceAll('{bodypart}',getRandomBodyPart())
  // output = output.replaceAll('{gerund}',getRandomGerund())
  output = output.replaceAll('{verb}',getRandomVerb())
  // output = output.replaceAll('{adverb}',getRandomAdverb())
  output = output.replaceAll('{adjective}',getRandomAdjective())
  output = output.replaceAll('{star}',getRandomStar())
  console.log(output)
  return output
}

const log = console.log.bind(console)

if (config.filewatcher==="true") { // Easy disable folder monitoring and posting with config key
  const renders = chokidar.watch(config.watchFolder, {
    persistent: true,
    ignoreInitial: true,
    usePolling: false,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 500
    }
  })
  renders
    .on('all', (event, file) => {
      // log(`File ${file} has been ${event}`)
    })
    .on('change', file => {
      // process(file)
    })
    .on('add', file => {
      process(file)
    })
}
