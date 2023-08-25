const {config,log,debugLog,tidyNumber}=require('./js/utils.js')

// Get samplers from config ready for /dream slash command
var samplers=config.samplers.split(',')
var samplersSlash=[]
samplers.forEach((s)=>{samplersSlash.push({name: s, value: s})})
var defaultSampler=samplers[0]
debugLog('Enabled samplers: '+samplers.join(','))
debugLog('Default sampler:'+defaultSampler)

// load our own font list from config
var fonts = config.fonts ? config.fonts.split(',') : ['Arial','Comic Sans MS','Tahoma','Times New Roman','Verdana','Lucida Console']
var fontsSlashCmd = []
fonts.forEach((f)=>{fontsSlashCmd.push({name: f,value: f})})

// slash command setup - beware discord global limitations on the size/amount of slash command options
var slashCommands = [
  {
    name: 'dream',
    description: 'Create a new image from your prompt',
    options: [
      {type: 3, name: 'prompt', description: 'what would you like to see ?', required: true, min_length: 1, max_length:1500 },
      {type: 4, name: 'width', description: 'width of the image in pixels (250-~1024)', required: false, min_value: 256, max_value: 2048 },
      {type: 4, name: 'height', description: 'height of the image in pixels (250-~1024)', required: false, min_value: 256, max_value: 2048 },
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
      {type: 3, name: 'model', description: 'Change the model/checkpoint - see /models for more info', required: false,   min_length: 3, max_length:40}
    ],
    cooldown: 500,
    execute: (i) => {
      // get attachments
      if (i.data.resolved && i.data.resolved.attachments && i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))){
        var attachmentOrig=i.data.resolved.attachments.find(a=>a.contentType.startsWith('image/'))
        var attachment=[{width:attachmentOrig.width,height:attachmentOrig.height,size:attachmentOrig.size,proxy_url:attachmentOrig.proxyUrl,content_type:attachmentOrig.contentType,filename:attachmentOrig.filename,id:attachmentOrig.id}]
      }else{var attachment=[]}
      // below allows for the different data structure in public interactions vs direct messages
      request({cmd:getCmd(prepSlashCmd(i.data.options)),userid:i.member?i.member.id:i.user.id,username:i.member?i.member.user.username:i.user.username,bot:i.member?i.member.user.bot:i.user.bot,channelid:i.channel.id,guildid:i.guildID?i.guildID:undefined,attachments:attachment})
    }
  },
  {
    name: 'random',
    description: 'Show me a random prompt from the library',
    options: [ {type: 3, name: 'prompt', description: 'Add these keywords to a random prompt', required: false} ],
    cooldown: 500,
    execute: (i) => {
      var prompt=i.data.options?i.data.options[0].value+' '+getRandom('prompt'):getRandom('prompt')
      request({cmd:prompt,userid:i.member?i.member.id:i.user.id,username:i.member?i.member.user.username:i.user.username,bot:i.member?i.member.user.bot:i.user.bot,channelid:i.channel.id,guildid:i.guildID?i.guildID:undefined,attachments:[]})
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
  }
]
// If credits are active, add /recharge and /balance otherwise don't include them
if(!creditsDisabled)
{
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
}

module.exports = {
    slashCommands:{
      init:init,
      slashCommands:slashCommands
    }
}