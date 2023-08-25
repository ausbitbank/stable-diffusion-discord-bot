const {config,log,debugLog,getRandomColorDec,shuffle,urlToBuffer, getUUID}=require('../utils')
const {exif}=require('../exif')
const {invoke}=require('../invoke')
const {bot}=require('./bot')
const {auth}=require('./auth')
const {imageEdit}=require('../imageEdit')
//const {discord}=require('./discord.js')
// Process discord text message commands
let commands = [
    {
        name: 'dream',
        description: 'Text to image',
        permissionLevel: 'all',
        aliases: ['dream','drm','imagine','magin'],
        prefix:'!',
        command: async (args,msg)=>{
            debugLog('new dream request:'+args.join(' '))
            let img
            if(messageHasImageAttachments(msg)){ img = await extractImageBufferFromMessage(msg)
            }else if(msg.messageReference?.messageID){
                await bot.getMessage(msg.channel.id, msg.messageReference.messageID)
                    .then(async m=>{if(messageHasImageAttachments(m)){img = await extractImageBufferFromMessage(m)}})
                    .catch(e=>{log(e)})
            }else{img=null}
            result = await invoke.jobFromDream(args,img)
            return returnMessageResult(msg,result)
        }
    },
    {
        name: '4k',
        description: 'Make a 4k (3840x2160) wallpaper',
        permissionLevel: 'all',
        aliases: ['4k'],
        prefix:'!',
        command: async(args,msg)=>{
            debugLog('new 4k request: '+args.join(' '))
            job={prompt:args.join(' '),lscale:3,upscale:2,width:640,height:360}
            result = await invoke.validateJob(job)
            return returnMessageResult(msg,result)
        }
    },
    {
        name: 'test',
        description: 'Generic test trigger',
        permissionLevel: 'owner',
        aliases: ['test'],
        prefix:'!',
        command: async(args,msg)=>{
            debugLog('test triggered: '+args.join(' '))
            let buf = await urlToBuffer('https://media.discordapp.net/attachments/968822563662860338/1143934598401757265/app_outputs_111410.691e4e6c.2999260581.png')
            let newbuf = await exif.edit(buf,'initimg','url','arty')
            let result = {
                images: [{file:newbuf,name:getUUID()+'.png'}],
                messages:[{content:'exif test'}]
            }
            return result
            //graph={'nodes':{'midas_depth_image_processor':{'id':'midas_depth_image_processor','type':'midas_depth_image_processor','a_mult':2,'bg_th':0.1,'is_intermediate':true,'image':{'image_name':'13e06670-0572-4187-92ed-cb5aea231060.png'}}}}
            //host=invoke.findHost()
            //result = await invoke.rawGraphResponse(host,graph)
            //return returnMessageResult(msg,result)
        }
    },
    {
        name: 'metadata',
        description: 'Extract metadata from images',
        permissionLevel: 'all',
        aliases: ['metadata'],
        prefix:'!',
        command: async (args,msg)=>{
            log('new metadata request')
            return true
        }
    },
    {
        name: 'help',
        description: 'Show help dialog, about this bot',
        permissionLevel: 'all',
        aliases: ['halp'],
        prefix:'!',
        command: async(args,msg)=>{
            return [await help()]
        }
    },
    {
        name: 'text',
        description: 'Create an image containing text for use as an controlnet input image, overlay if an image is supplied',
        permissionLevel: 'all',
        aliases: ['text'],
        prefix:'!',
        command: async (args,msg)=>{
            let text = args.join(' ')
            let img=null
            if(messageHasImageAttachments(msg)){ img = await extractImageBufferFromMessage(msg)}
            result = await imageEdit.textOverlay(text,img)
            return result
        }
    }
]

// generate simple lookup array of all command aliases with prefixes
let prefixes=[]
commands.forEach(c=>{c.aliases.forEach(a=>{prefixes.push(c.prefix+a)})})

parseMsg=async(msg)=>{
    if(!auth.check(msg.member.id,msg.guildId,msg.channel?.id)){return} // if not authorised, ignore
    if(msg.length===0||msg.content.length===0){return} // if empty message (or just an image) ignore
    let firstword = msg.content.split(' ')[0].toLowerCase()
    if(prefixes.includes(firstword)){
        commands.forEach(c=>{
            c.aliases.forEach(async a=>{
                if(firstword===c.prefix+a){
                    let args=msg.content.split(' ')
                    args.shift() // only pass on the message without the prefix and command
                    //let [messages,files] = await c.command(args,msg)
                    let result = await c.command(args,msg)
                    log(result)
                    let messages = result?.messages
                    let files = result?.files
                    let error = result?.error
                    if(error){
                        log('Error: '.bgRed+' '+error)
                        chat(msg.channel.id,{content:':warning: '+error})
                        return
                    }
                    if(!Array.isArray(messages)){messages=[messages]}
                    if(!Array.isArray(files)){files=[files]}
                    // unpack messages array and send each msg seperately
                    // if we have a file for each message, pair them up
                    // if we have multi messages and 1 file, attach to first message only
                    // todo If there are more files then there are messages attempt to bundle all files on first message
                    messages.forEach(message=>{
                      if(files.length>0)file=files.shift() // grab the top file
                      if(message&&file){
                        //msg.reply(message,file)
                        chat(msg.channel.id,message,file) // Send message with attachment
                      }else if(message){
                        //msg.reply(message)
                        chat(msg.channel.id,message) // Send message, no attachment
                      }
                    })
                  }
            })
        })
    }
}

returnMessageResult = async(msg,result)=>{
    // generic response function for invoke results or errors
    messages=[];files=[];error=null
    log(result)
    if(result.error){error=result.error}
    if(result?.images){
        for (const i in result.images){
            let image=result.images[i]
            let meta=await exif.load(image.buffer)
            message = imageResultMessage(msg.member.id,image,result,meta)
            message.messageReference={message_id:msg.id}
            messages.push(message)
            files.push({file:image.buffer,name:image.name})
        }
    }else if(result?.messages?.length>0){for (const m in result.messages){messages.push(m)}}
    return {
        messages:messages,
        files:files,
        error:error
    }
}

//
extractImageBufferFromMessage = async (msg)=>{
    let buf=null
    for (const a of msg.attachments){
        let validMimetypes=['image/png','image/jpeg']
        if(validMimetypes.includes(a.content_type)){
            buf = await urlToBuffer(a.proxy_url)
        }
    }
    return buf
}

messageHasImageAttachments = (msg)=>{
    if(msg.attachments.length>0){
        for (const a of msg.attachments){
            let validMimetypes=['image/png','image/jpeg']
            if(validMimetypes.includes(a.content_type)){return true}
        }
        return false
    }else{return false}
}

imageResultMessage = (userid,img,result,meta)=>{
    //log('meta in imageresultmessage')
    //log(meta)
    let p=result.job.prompt
    //log(meta.invoke)
    let t='\n :brain: <@'+userid+'>'
    if(meta.invoke.cost){t+=' :coin: '+meta.invoke.cost}
    //if(meta.invoke.pixelSteps){t+=' :fire: '+meta.invoke.pixelSteps/1000000}
    if(img.width&&img.height){t+=' :straight_ruler: '+img.width+'x'+img.height}
    if(meta.invoke.steps){t+=' :recycle: '+meta.invoke.steps}
    if(meta.invoke.scheduler){t+=' :eye: '+meta.invoke.scheduler}
    if(meta.invoke.seed){t+=' :seedling: '+meta.invoke.seed}
    if(meta.invoke.scale){t+=' :scales: '+meta.invoke.scale}
    if(meta.invoke.model){t+=' :floppy_disk: '+meta.invoke.model?.model_name}
    let colordec=getRandomColorDec()
    return {
        content:'',
        embeds:[
            {
                color: colordec,
                description:p,
                inline:true
            },
            {
                color: colordec,
                description:t,
                inline:true
            }
        ],
        components:[
            {type: 1,components:[
                {type:2,style:1,label:'refresh',custom_id:'refresh',emoji:{name:'🎲',id:null}}
            ]}
        ]
    }
}

help=()=>{
  var helpTitles=['let\'s get wierd','help me help you','help!','wait, what ?']
  shuffle(helpTitles)
  var helpMsgObject={
    content: '',
    embeds: [
        {
        type: 'rich',
        title: helpTitles[0],
        //description: '```diff\n-| To create art: \n /dream\n !dream *your idea here*\n /random\n\n-| For text overlays / memes:\n /text\n !text words (reply to image result)\n\n-| Accounting:\n /balance\n /recharge\n !gift 10 @whoever\n\n-| Advanced customisation:\n /models\n /embeds\n !randomisers\n\n+| See these link buttons below for more commands and info\n```',
        description: '```diff\n-| To create art: \n+| /dream\n+| !dream *your idea here*\n+| /random\n\n-| For text overlays & memes:\n+| /text\n+| !text words (reply to image result)\n\n-| Accounting:\n+| /balance\n+| /recharge\n+| !gift 10 @whoever\n\n-| Advanced customisation:\n+| /models\n+| /embeds\n+| !randomisers\n``` ```yaml\nSee these link buttons below for more commands and info```',
        color: getRandomColorDec()
        }
    ],
    components: [
        {type: 1, components:[
        {type: 2, style: 5, label: "Intro Post", url:'https://peakd.com/@ausbitbank/our-new-stable-diffusion-discord-bot', emoji: { name: 'hive', id: '1110123056501887007'}, disabled: false },
        {type: 2, style: 5, label: "Github", url:'https://github.com/ausbitbank/stable-diffusion-discord-bot', emoji: { name: 'Github', id: '1110915942856282112'}, disabled: false },
        {type: 2, style: 5, label: "Commands", url:'https://github.com/ausbitbank/stable-diffusion-discord-bot/blob/main/commands.md', emoji: { name: 'Book_Accessibility', id: '1110916595863269447'}, disabled: false },
        //{type: 2, style: 5, label: "Invite to server", url:'https://discord.com/oauth2/authorize?client_id='+discord.bot.application.id+'&scope=bot&permissions=124992', emoji: { name: 'happy_pepe', id: '1110493880304013382'}, disabled: false },
        {type: 2, style: 5, label: "Privacy Policy", url:'https://gist.github.com/ausbitbank/cd8ba9ea6aa09253fcdcdfad36b9bcdd', emoji: { name: '📜', id: null}, disabled: false },
        ]}
    ] 
  }
  return helpMsgObject
}

module.exports = {
    messageCommands:{
        commands,
        prefixes,
        parseMsg,
        extractImageBufferFromMessage,
        messageHasImageAttachments,
        returnMessageResult
    }
}