const config = require('dotenv').config().parsed
const Eris = require("eris")
const Constants = Eris.Constants
const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')
const moment = require('moment')
var parseArgs = require('minimist')
const axios = require('axios')
const bot = new Eris(config.discordBotKey, {
  intents: ["guildMessages"],
  description: "Just a slave to the art, maaan",
  owner: "ausbitbank",
  prefix: "!"
})
var queue = []
var finished = []
var msg = ''
var artspamchannelid = config.channelID
var adminid = config.adminID
var apiUrl = config.apiUrl
var rendering = false
var promptError = false
var newJob = {}

bot.on("ready", async () => { console.log("Ready to go") })

bot.on("interactionCreate", (interaction) => {
    if(interaction instanceof Eris.ComponentInteraction) {
      if (interaction.data.custom_id === 'refresh' || interaction.data.custom_id === 'refreshNoTemplate' || interaction.data.custom_id === 'refreshBatch' || interaction.data.custom_id === 'upscale') {
        console.log('refresh request')
        // look in finished for the job.msg.id matching the interaction.message.messageReference.messageID
          var newJob = finished.find(x => x.msg.id === interaction.message.messageReference.messageID)
        if (newJob) {
          console.log('job details found')
          if (interaction.data.custom_id === 'upscale') {
            console.log('upscale request')
            newJob.G = 1
          } else {
            newJob.G = undefined
            newJob.seed = Math.floor(Math.random() * 4294967295)
          }
          newJob.authorid = interaction.member.user.id
          newJob.authorName = interaction.member.user.username + '#' + interaction.member.user.discriminator
          newJob.dateAdded = moment()
          newJob.dateRenderStart = null
          newJob.dateRenderFinish = null
          newJob.msg = interaction.message
          if (interaction.data.custom_id === 'refreshNoTemplate' && newJob.template) { delete newJob.template }
          queue.push(newJob)
          console.log('processQueue from interaction')
          processQueue()
          console.log('edit button')
          return interaction.editParent({embed:{footer:{text: interaction.member.user.username + ' chose ' + interaction.data.custom_id}} ,components:[]}).catch((e) => {console.log(e)})
        } else {
          console.error('unable to refresh render')
          return interaction.createMessage({
            content: "Error",
            flags: 64
          })
        }
        console.log(newJob)
      } else if (interaction.data.custom_id === 'template' || interaction.data.custom_id === 'templateNewPromptAnswer') {
        console.log('template request')
        if (interaction.data.custom_id === 'templateNewPromptAnswer') { console.log('templateNewPromptAnswer'); console.log(interaction) }
        var newJob = finished.find(x => x.msg.id === interaction.message.messageReference.messageID)
        if (newJob) {
          console.log('job details found')
          newJob.seed = Math.floor(Math.random() * 4294967295)
          newJob.authorid = interaction.member.user.id
          newJob.authorName = interaction.member.user.username + '#' + interaction.member.user.discriminator
          newJob.dateAdded = moment()
          newJob.dateRenderStart = null
          newJob.dateRenderFinish = null
          newJob.msg = interaction.message
          newJob.template = newJob.file
          if (newJob.strength === undefined) {newJob.strength = 0.8}
          queue.push(newJob)
          processQueue()
          return interaction.editParent({embed:{footer:{text: interaction.member.user.username + ' chose ' + interaction.data.custom_id}} ,components:[]}).catch((e) => {console.log(e)})
        } else {
          console.error('unable to refresh render')
          return interaction.createMessage({
            content: "Unable to refresh automatically",
            flags: 64
          })
        }
      }
    }
})

bot.on("messageCreate", (msg) => {
  if((msg.content.startsWith("!prompt")) && msg.channel.id === artspamchannelid) {
    var promptPrefix = msg.content.replace('!prompt','')
    if (promptPrefix.trim().length > 0) { chat('!dream \"' + replaceRandoms(promptPrefix).trim() + ' ' + getRandomPrompt().replace('!dream \"','')) } else { chat(getRandomPrompt()) } 
  } else if(msg.content.startsWith("!dothething") && msg.channel.id === artspamchannelid && msg.author.id === config.adminID) {
    rendering = false
    queue = []
    console.log('admin wiped queue')
    msg.delete().catch(() => {})
  } else if(msg.content.startsWith("!dream") && msg.channel.id === artspamchannelid) {
    console.log('dream request')
    var prompt = msg.content.substr(7, msg.content.length)
    if (prompt.includes('{')) { prompt = replaceRandoms(prompt) }
    var args = parseArgs(prompt.split(' '),{string: ['template','init_img','sampler']})
    promptError = false
    var dateAdded = moment()
    promptError = false
    var pixelLimit = config.pixelLimit
    // if (Number.isInteger(args.width) && Number.isInteger(args.height)) { if ((args.width * args.height) > pixelLimit) { promptError = true} } else if (args.width) { if ((args.width * 512) > pixelLimit) { promptError = true} } else if (args.height) { if ((args.height * 512) > pixelLimit) { promptError = true}}
    if (!args.width) {args.width = 512 } else { if (!Number.isInteger(args.width) || args.width > 3950){ promptError = true } } // args.width = 512
    if (!args.height) {args.height = 512 } else { if (!Number.isInteger(args.height) || args.height > 2250){ promptError = true } } // args.height = 512
    if (!args.steps) { args.steps = 50 } else { if (!Number.isInteger(args.steps) || args.steps > 250){ promptError = true } }// max 250 steps, default 50
    if (!args.seed) {args.seed = Math.floor(Math.random() * 4294967295)} else { if (!Number.isInteger(args.seed) || args.seed > 4294967295 || args.seed <= 0) { promptError = true} }
    if (!args.strength) {args.strength = 0.75 } else { if (args.strength > 1||args.strength < 0){ promptError = true } }
    args.c = 4 // DISABLED // if (!args.c) {args.c = 4} else { args.c = sanitize(args.c); if (args.c > 30 || args.c < 0){ promptError = true}}
    if (!args.scale) {args.scale = 7.5 } else { if (!Number.isInteger(args.scale)){ console.log(args.scale); promptError = true } } // || args.height > 30 || args.scale < 0
    if (!args.sampler) { console.log('no sampler, setting k_eular_a'); args.sampler = 'k_eular_a' } else { console.log('sampler set to ' + args.sampler)}
    if (args.G) {args.G = 1}
    if (!args.n) { args.n = 1 } else { if (!Number.isInteger(args.n) || args.n > 4) { console.log(args.n); promptError = true }} // 4 max
    var newprompt = sanitize(args._.join(' '))
    console.log('Prompt is: ' + newprompt)
    var useRenderer = 'localApi'
    newJob = {
      authorid: msg.author.id,
      authorname: msg.author.username + '#' + msg.author.discriminator,
      dateAdded: dateAdded, dateRenderStart: null, dateRenderFinish: null, 
      seed: args.seed,
      n: args.n,
      width: args.width,
      height: args.height,
      steps: args.steps,
      prompt: newprompt,
      c: args.c,
      scale: args.scale,
      sampler: args.sampler,
      renderer: useRenderer,
      msg: msg,
      G: args.G || undefined
    }
    if (args.seamless) { newJob.seamless = 'on' }
    if (args.template) { console.log(args.template); newJob.template = args.template; newJob.strength = args.strength }
    if (promptError === false) {
      queue.push(newJob);
      msg.addReaction('✔️') 
      // msg.delete().catch(() => {})
    } else { console.log('failed to push to queue'); msg.addReaction('⛔') }
    processQueue()
  }
})

bot.connect()

function chat(msg) { if (msg !== null && msg !== '') { bot.createMessage(artspamchannelid, msg) } }
function sanitize (prompt) { return prompt.replace(/[^一-龠ぁ-ゔァ-ヴーa-zA-Z0-9ａ-ｚＡ-Ｚ０-９々〆〤ヶ()\[\] ,.\:]/g, '') }
function base64Encode(file) { var body = fs.readFileSync(file); return body.toString('base64') }
function encodeImageFileAsURL(file) {
  var reader = new FileReader()
  reader.onloadend = function() { console.log('RESULT', reader.result); return reader.result }
  reader.readAsDataURL(file)
}
async function addRenderApi (job) {
  var initimg = null
  // console.log(job.msg.attachments[0])
  if (job.template !== undefined) { initimg = 'data:image/png;base64,' + base64Encode('allrenders\\sdbot\\' + job.template + '.png') }
  if (job.msg.attachments.length > 0 && job.msg.attachments[0].content_type === 'image/png') { // && job.msg.attachments.width === '512' && job.msg.attachments.height === '512'
    console.log('fetching attachment from ' + job.msg.attachments[0].proxy_url) 
    await axios.get(job.msg.attachments[0].proxy_url, {responseType: 'arraybuffer'})
      .then(res => { initimg = 'data:image/ping;base64,' + Buffer.from(res.data).toString('base64') })
      .catch(err => { console.error('unable to fetch url: ' + job.msg.attachments[0].proxy_url); console.error(err) })
  }
  if (job.strength === undefined){ job.strength = 0.75 }
  if (job.sampler === undefined){ job.sampler = 'k_euler_a' }
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
      "gfpgan_strength": 0.8,
      "upscale_level": '',
      "upscale_strength": 0.75,
      "initimg_name": ''
    }
  if (job.seamless) { postObject.seamless = 'on' }
  axios.post(apiUrl, postObject)
    .then(res => {
      if (queue.length > 0) { console.log('Moving item to pastjobs: ' + queue[0].prompt + ' by ' + queue[0].authorname); finished.push(queue.shift()) }
      var data = res.data.split("\n")
      data.pop() // Remove blank line from the end of api output
      data.forEach(line => {
        line = JSON.parse(line)
        if (line.event !== 'result'){ return } else { postRender(line) }
      })
      rendering = false
      processQueue()
    })
    .catch(error => { console.log('error'); console.error(error) })
}

function postRender (render) {
  console.log('postRender')
  console.log(render)
  fs.readFile(render.url, null, function(err, data) {
    if (err) { console.error(err) } else {
      filename = render.url.split('\\')[render.url.split('\\').length-1].replace(".png","")
      var last = finished[finished.length-1] // find a better way to get requesting user
      last.dateRenderFinish = moment()
      var msg = '`!dream "' + render.config.prompt + '"\n` for <@' + last.authorid + '>'
      if (render.config.width !== 512 || render.config.height !== 512) { msg+= ':straight_ruler:`' + render.config.width + 'x' + render.config.height + '`' }
      if (last.G) { msg+= ':mag:**`Upscaled x 2`**'}
      if (last.seamless) { msg+= ':knot:**`Seamless Tiling`**'}
      if (last.template) { msg+= ':frame_photo:`' + last.template + '` :muscle: `' + render.config.strength + '`'}
      msg+= ':seedling: `' + filename.split('.')[1] + '`:scales:`' + render.config.cfg_scale + '`:recycle:`' + render.config.steps + '`'
      msg+= ':stopwatch:`' + timeDiff(moment(),last.dateAdded) + 's`:brain:`' + timeDiff(last.dateRenderFinish, last.dateRenderStart) + 's` :file_cabinet: `' + filename + '` :eye: `' + render.config.sampler_name + '`'
      var newMessage = {
        content: msg,
        messageReference: { channelId: last.msg.channel.id, failIfNotExists: false, guildID: last.msg.guildID, message_id: last.msg.id },
        components: [
          {
            type: Constants.ComponentTypes.ACTION_ROW,
            components: [
              {
                type: Constants.ComponentTypes.BUTTON,
                style: Constants.ButtonStyles.SECONDARY,
                label: "New seed",
                custom_id: "refresh",
                emoji: { name: '🎲', id: null},
                disabled: false
              }
            ]
          }
        ]
      }
      if (last.template) { newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.DANGER, label: "Remove template", custom_id: "refreshNoTemplate", emoji: { name: '🎲', id: null}, disabled: false }) } 
      if (last.G !== 1) { newMessage.components[0].components.push({ type: Constants.ComponentTypes.BUTTON, style: Constants.ButtonStyles.SECONDARY, label: "Use as template", custom_id: "template", emoji: { name: '📷', id: null}, disabled: false })  } 
      bot.createMessage(artspamchannelid, newMessage, {file: data, name: filename + '.png' })
    }
  })
}

function processQueue () {
  if (queue.length > 0 && rendering === false) {
    rendering = true
    console.log('starting prompt: ' + queue[0].prompt)
    queue[0].dateRenderStart = moment()
    finished.push(queue[0])
    addRenderApi(queue[0])
  } else if (rendering === true) { console.error('already rendering') }
}

function process (file) {
  if (file.endsWith('.png') || file.endsWith('.jpg')) {
    setTimeout(function() {
      fs.readFile(file, null, function(err, data) { 
        if (err) { console.error(err); } else {
          filename = file.replace("allrenders\\sdbot\\", "").replace(".png","")
          if (finished.length > 0) {finished[finished.length-1].file = filename} // bad
          filename = file
          if (file.includes('allrenders\\sdbot')) { filename = file.replace("allrenders\\sdbot\\", "").replace(".png","") }
          msg = ':file_cabinet:' + filename
          bot.createMessage(artspamchannelid, msg, {file: data, name: file })
        }
      }, 300)
    }
  )}
}

function timeDiff (date1,date2) { return date1.diff(date2, 'seconds') }
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
