const {config,log,debugLog,urlToBuffer}=require('../utils')
const {bot}=require('./bot')
const {invoke}=require('../invoke')
const {messageCommands}=require('./messageCommands')
const {exif}=require('../exif')
const {auth}=require('./auth')
const Eris = require("eris")
//const Constants = Eris.Constants
const Collection = Eris.Collection

// Get samplers from config ready for /dream slash command
var samplers=config.schedulers||['euler','deis','ddim','ddpm','dpmpp_2s','dpmpp_2m','dpmpp_2m_sde','dpmpp_sde','heun','kdpm_2','lms','pndm','unipc','euler_k','dpmpp_2s_k','dpmpp_2m_k','dpmpp_2m_sde_k','dpmpp_sde_k','heun_k','lms_k','euler_a','kdpm_2_a']
var samplersSlash=[]
samplers.forEach((s)=>{samplersSlash.push({name: s, value: s})})
var defaultSampler=config.default.scheduler?config.default.scheduler:'dpmpp_2m_sde_k'
debugLog('Enabled samplers: '+samplers.join(','))
debugLog('Default sampler:'+defaultSampler)

// load our own font list from config
var fonts = ['Arial','Comic Sans MS','Tahoma','Times New Roman','Verdana','Lucida Console']
var fontsSlashCmd = []
fonts.forEach((f)=>{fontsSlashCmd.push({name: f,value: f})})

// slash command setup - beware discord global limitations on the size/amount of slash command options
var slashCommands = [
  {
    name: 'dream',
    description: 'Create a new image from your prompt',
    options: [
      {type: 3, name: 'prompt', description: 'what you want to see ?', required: true, min_length: 1, max_length:1500 },
      {type: 3, name: 'negative', description: 'what dont you want to see ?', required: false, min_length: 1, max_length:1500 },
      {type: 3, name: 'style', description: 'Positive style prompt (sdxl only)', required: false, min_length: 1, max_length:1500 },
      {type: 3, name: 'negstyle', description: 'Negative style prompt (sdxl only)', required: false, min_length: 1, max_length:1500 },
      {type: 4, name: 'width', description: 'width of the image in pixels', required: false, min_value: 256, max_value: 2048 },
      {type: 4, name: 'height', description: 'height of the image in pixels', required: false, min_value: 256, max_value: 2048 },
      {type: 4, name: 'steps', description: 'how many steps to render for', required: false, min_value: 5, max_value: config.maximum.steps??100 },
      {type: 4, name: 'seed', description: 'seed (initial noise pattern)', required: false},
      {type: 10, name: 'strength', description: 'how much noise to add to your input image (0.1-0.9)', required: false, min_value:0.01, max_value:0.99},
      {type: 10, name: 'scale', description: 'how important is the prompt (cfg_scale)', required: false, min_value:1, max_value:30},
      {type: 4, name: 'number', description: 'how many would you like', required: false, min_value: 1, max_value: config.maximum.iterations??10},
      {type: 3, name: 'model', description: 'Change the model/checkpoint - see /models for more info', required: false,   min_length: 3, max_length:40},
      {type: 3, name: 'sampler', description: 'which sampler to use (default is '+defaultSampler+')', required: false, choices: samplersSlash},
      {type: 4, name: 'clipskip', description: 'clip skip (0-10)', required: false},
      {type: 11, name: 'attachment', description: 'use template image', required: false},
      {type: 3, name: 'control', description: 'controlnet mode to use with attachment', required: false, min_length: 3, max_length:40},
    ],
    cooldown: 500,
    execute: async(i) => {
      let img,imgurl
      let userid=i.member?.id??i.user?.id
      let username=i.member?.username??i.user?.username
      if (i.data.resolved && i.data.resolved.attachments && i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))){
        let attachmentOrig=i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))
        imgurl = attachmentOrig.url
        img = await urlToBuffer(imgurl)
      }
      debugLog(username+' triggered dream command')
      let job={}
      for (const arg in i.data.options){
        let a = i.data.options[arg]
        switch (a.name){
          case('prompt'):job.prompt=a.value;break
          case('negative'):job.prompt=job.prompt+'['+a.value+']';break
          case('attachment'):break
          default:job[a.name]=a.value;break
        }
      }
      if(img){job.initimg=img}
      let dreamresult = await invoke.validateJob(job)
      if(imgurl && !dreamresult.error && dreamresult.images?.length > 0){dreamresult.images[0].buffer = await exif.modify(dreamresult.images[0].buffer,'arty','inputImageUrl',imgurl)}
      let fakemsg = {member:{id:userid}}
      let result = await returnMessageResult(fakemsg,dreamresult)
      let messages = result?.messages
      let files = result?.files
      let error = result?.error
      if(error){
          log('Error: '.bgRed+' '+error)
          i.createMessage({content:':warning: '+error})
          return
      }
      messages.forEach(message=>{
        debugLog(message)
        if(files.length>0)file=files.shift() // grab the top file
        if(message&&file){
          log(message)
          i.createMessage(message,file) // Send message with attachment
        }else if(message){
          i.createMessage(message) // Send message, no attachment
        }
      })
    }
  }
]
/*,
  {
    name: 'help',
    description: 'Learn how to use this bot',
    cooldown: 500,
    execute: (i) => {
      help(i.channel.id)
    }
  },
  {
    name: 'models',
    description: 'See what models are currently available',
    cooldown: 1000,
    execute: (i) => {
      listModels(i.channel.id)
    }
  },
  {
    name: 'embeds',
    description: 'See what embeddings are currently available',
    cooldown: 1000,
    execute: (i) => {
      listEmbeds(i.channel.id)
    }
  },
  {
    name: 'text',
    description: 'Add text overlays to an image',
    options: [
      {type: 3, name: 'text', description: 'What to write on the image', required: true, min_length: 1, max_length:500 },
      {type: 11, name: 'attachment', description: 'Image to add text to', required: true},
      {type: 3, name: 'position', description: 'Where to position the text',required: false,value: 'south',choices: [{name:'centre',value:'centre'},{name:'north',value:'north'},{name:'northeast',value:'northeast'},{name:'east',value:'east'},{name:'southeast',value:'southeast'},{name:'south',value:'south'},{name:'southwest',value:'southwest'},{name:'west',value:'west'},{name:'northwest',value:'northwest'}]},
      {type: 3, name: 'color', description: 'Text color (name or hex)', required: false, min_length: 1, max_length:50 },
      {type: 3, name: 'blendmode', description: 'How to blend the text layer', required: false,value:'overlay',choices:[{name:'clear',value:'clear'},{name:'over',value:'over'},{name:'out',value:'out'},{name:'atop',value:'atop'},{name:'dest',value:'dest'},{name:'xor',value:'xor'},{name:'add',value:'add'},{name:'saturate',value:'saturate'},{name:'multiply',value:'multiply'},{name:'screen',value:'screen'},{name:'overlay',value:'overlay'},{name:'darken',value:'darken'},{name:'lighten',value:'lighten'},{name:'color-dodge',value:'color-dodge'},{name:'color-burn',value:'color-burn'},{name:'hard-light',value:'hard-light'},{name:'soft-light',value:'soft-light'},{name:'difference',value:'difference'},{name:'exclusion',value:'exclusion'}] }, // should be dropdown
      {type: 3, name: 'width', description: 'How many pixels wide is the text?', required: false, min_length: 1, max_length:5 },
      {type: 3, name: 'height', description: 'How many pixels high is the text?', required: false, min_length: 1, max_length:5 },
      {type: 3, name: 'font', description: 'What font to use', required: false,value:'Arial',choices:fontsSlashCmd},
      {type: 5, name: 'extend', description: 'Extend the image?', required: false},
      {type: 3, name: 'extendcolor', description: 'What color extension?', required: false, min_length: 1, max_length:10 },
    ],
    cooldown: 500,
    execute: (i) => {
      var ops=i.data.options
      var {text='word',position='south',color='white',blendmode='difference',width=false,height=125,font=fonts[0],extend=false,extendcolor='black'}=ops.reduce((acc,o)=>{acc[o.name]=o.value;return acc}, {})
      var userid=i.member ? i.member.id : i.user.id
      if (i.data.resolved && i.data.resolved.attachments && i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))){
        var attachmentOrig=i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))
      }
      textOverlay(attachmentOrig.proxyUrl,text,position,i.channel.id,userid,color,blendmode,parseInt(width)||false,parseInt(height),font,extend,extendcolor)
    }
  },
  {
    name: 'background',
    description: 'Remove background from an image',
    options: [
      {type:11,name:'attachment',description:'Image to remove background from',required:true},
      {type: 3, name: 'model', description: 'Which masking model to use',required: false,value: 'u2net',choices: [{name:'u2net',value:'u2net'},{name:'u2netp',value:'u2netp'},{name:'u2net_human_seg',value:'u2net_human_seg'},{name:'u2net_cloth_seg',value:'u2net_cloth_seg'},{name:'silueta',value:'silueta'},{name:'isnet-general-use',value:'isnet-general-use'}]},
      {type: 5, name: 'a', description: 'Alpha matting true/false', required: false,default:false},
      {type: 4, name: 'ab', description: 'Background threshold 0-255 default 10', required: false,min_length:1,max_length:3,value:10},
      {type: 4, name: 'af', description: 'Foreground threshold 0-255 default 240', required: false,value:240},
      {type: 4, name: 'ae', description: 'Alpha erode size 0-255 default 10', required: false,value:10},
      {type: 5, name: 'om', description: 'Mask Only true/false default false', required: false,value:false},
      {type: 5, name: 'ppm', description: 'Post Process Mask true/false default false', required: false,value:false},
      {type: 3, name: 'bgc', description: 'Background color R,G,B,A 0-255 default 0,0,0,0', required: false}
    ],
    cooldown: 500,
    execute: (i) => {
      if (i.data.resolved && i.data.resolved.attachments && i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))){
        var attachmentOrig=i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))
        var userid=i.member ? i.member.id : i.user.id
        var ops=i.data.options
        debugLog(ops)
        var {model='u2net',a=false,ab=10,af=240,ae=10,om=false,ppm=false,bgc='0,0,0,0'}=ops.reduce((acc,o)=>{acc[o.name]=o.value;return acc}, {})
        removeBackground(attachmentOrig.proxyUrl,i.channel.id,userid,model,a,ab,af,ae,om,ppm,bgc)
      }
    }
  }*/

// If credits are active, add /recharge and /balance otherwise don't include them
if(config.credits.enabled)
{
  /*
  slashCommands.push({
    name: 'recharge',
    description: 'Recharge your render credits with Hive, HBD or Bitcoin over lightning network',
    cooldown: 500,
    execute: (i) => {if (i.member) {rechargePrompt(i.member.id,i.channel.id)} else if (i.user){rechargePrompt(i.user.id,i.channel.id)}}
  })
  slashCommands.push({
    name: 'balance',
    description: 'Check your credit balance',
    cooldown: 500,
    execute: (i) => {var userid=i.member?i.member.id:i.user.id;balancePrompt(userid,i.channel.id)}
  })
  */
}
init = async()=>{
  // todo looks like a good spot to:
  // check status of command registration
  // register any commands that aren't already registered
  // update any commands that are registered, but modified
  // remove any registered commands from old version that aren't recreated yet
  let currentCommands = await bot.getCommands()
  bot.commands = new Collection()
  for (const c of slashCommands) {
    if(currentCommands.filter(cmd=>cmd.name===c.name).length>0) {
      // Already registered
      bot.commands.set(c.name,c)
      // todo check if command is modified and re-register if so
    } else {
      // Not registered
      log('Slash command '+c.name+' is unregistered, registering now')
      bot.commands.set(c.name,c)
      bot.createCommand({name: c.name,description: c.description,options: c.options ?? [],type: 1})
    }
  }
}

unregister = async()=>{await bot.bulkEditCommands([])}

parseCommand = async(interaction)=>{
      // check if its already been registered, send message only visible to user if it's not valid
      if (!bot.commands?.has(interaction.data.name)){return interaction.createMessage({content:'Command does not exist', flags:64})}
      try{
        // acknowledge the interacton
        await interaction.acknowledge()
        if(!auth.check(interaction.user?.id,interaction.guild?.id??'DM',interaction.channel?.id)){return} // if not authorised, ignore
        // run the stored slash command
        bot.commands.get(interaction.data.name).execute(interaction)
        interaction.deleteMessage('@original')
      }catch(err){
        log(err)
        await interaction.createMessage({content:'There was an error while executing this command!', flags: 64}).catch((e) => {log(e)})
      }
}

module.exports = {
    slashCommands:{
      init,
      slashCommands,
      unregister,
      parseCommand
    }
}
