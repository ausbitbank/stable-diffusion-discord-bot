const {config,log,debugLog,getRandomColorDec,shuffle,urlToBuffer,getUUID}=require('../utils')
const {exif}=require('../exif')
const {invoke}=require('../invoke')
const {bot}=require('./bot')
const {auth}=require('./auth')
const {imageEdit}=require('../imageEdit')
const parseArgs = require('minimist')
// Process discord text message commands
let commands = [
    {
        name: 'dream',
        description: 'Text to image',
        permissionLevel: 'all',
        aliases: ['dream','drm','imagine','magin'],
        prefix:'!',
        command: async (args,msg)=>{
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            result = await invoke.jobFromDream(args,img)
            // inject the original template image url
            if(imgurl && !result.error && result.images?.length > 0){
                debugLog('Attaching input image url to png metadata: '+imgurl)
                result.images[0].buffer = await exif.modify(result.images[0].buffer,'arty','inputImageUrl',imgurl)
            }
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
        name: 'depth',
        description: 'Return a depth map of an input image',
        permissionLevel: 'all',
        aliases: ['depth'],
        prefix:'!',
        command: async(args,msg)=>{
            debugLog('depth map creation triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                //let buf = await extractImageBufferFromMessage(msg)
                let result = await invoke.depthMap(img)
                let buf = result.images[0]?.buffer
                buf = await exif.modify(buf,'arty','imageType','depth')
                return {messages:[{embeds:[{description:'Converted image to depth map',color:getRandomColorDec()}]}],files:[{file:buf,name:result.images[0].name}]}
            } else {
                return { error:'No image attached to create depthmap'}
            }
        }
    },
    {
        name: 'edges',
        description: 'Return a canny edge detection of an input image',
        permissionLevel: 'all',
        aliases: ['edges'],
        prefix:'!',
        command: async(args,msg)=>{
            debugLog('canny edge detection creation triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                let result = await invoke.canny(img)
                let buf = result.images[0]?.buffer
                buf = await exif.modify(buf,'arty','imageType','canny')
                return {messages:[{embeds:[{description:'Converted to canny edge detection',color:getRandomColorDec()}]}],files:[{file:buf,name:result.images[0].name}]}
            } else {
                return { error:'No image attached to create canny edge detection'}
            }
        }
    },
    {
        name: 'pose',
        description: 'Return a openpose pose detection of an input image',
        permissionLevel: 'all',
        aliases: ['pose','openpose'],
        prefix:'!',
        command: async(args,msg)=>{
            debugLog('pose detection creation triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                let result = await invoke.openpose(img)
                let buf = result.images[0]?.buffer
                buf = await exif.modify(buf,'arty','imageType','openpose')
                let components = [{type:1,components:[{type: 2, style: 1, label: 'Use this pose', custom_id: 'usepose', emoji: { name: '🤸', id: null}, disabled: true }]}]
                return {messages:[{embeds:[{description:'Converted to openpose detection',color:getRandomColorDec()}],components:components}],files:[{file:buf,name:result.images[0].name}]}
            } else {
                return { error:'No image attached to create pose detection'}
            }
        }
    },
    {
        name: 'esrgan',
        description: 'Return a 2x upscaled version of an input image',
        permissionLevel: 'all',
        aliases: ['esrgan','upscale'],
        prefix:'!',
        command: async(args,msg)=>{
            debugLog('esrgan triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                let result = await invoke.esrgan(img)
                if(result.error){return {error:result.error}}
                let buf = result.images[0]?.buffer
                let resolution = await imageEdit.getResolution(buf)
                let newWidth = resolution?.width
                let newHeight = resolution?.height
                return {messages:[{embeds:[{description:'Upscaled 2x with esrgan to '+newWidth+' x '+newHeight,color:getRandomColorDec()}],components:[]}],files:[{file:buf,name:result.images[0].name}]}
            } else {
                return { error:'No image attached to upscale'}
            }
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
            if(msg.messageReference?.messageID){
                sourcemsg = await bot.getMessage(msg.channel.id,msg.messageReference.messageID)
                let meta = await extractMetadataFromMessage(sourcemsg)
                log('Got meta from sourcemsg')
                log(meta)
            } else {
                let meta = await extractMetadataFromMessage(msg)
                log('Got meta from image')
                log(meta)
            }
            if(meta){
                return {message:[{content:meta}]}
            } else {
                return {error:'Unable to find metadata'}
            }
        }
    },
    {
        name: 'help',
        description: 'Show help dialog, about this bot',
        permissionLevel: 'all',
        aliases: ['help'],
        prefix:'!',
        command: async(args,msg)=>{
            let response = await help()
            return {messages:[response]}
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
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(messageHasImageAttachments(msg)){ img = await extractImageBufferFromMessage(msg)}
            result = await imageEdit.textOverlay(text,img)
            return result
        }
    },
    {
        name: 'append',
        description: 'Append to a renders prompt and arguments',
        permissionLevel: 'all',
        aliases: ['..'],
        prefix:'',
        command: async(args,msg)=>{
            let replymsg,meta,img
            let parsedCmd = parseArgs(args,{})
            if(msg.messageReference?.messageID){
                replymsg = await bot.getMessage(msg.channel.id, msg.messageReference.messageID)
                if(replymsg.member.id===bot.application.id&&messageHasImageAttachments(replymsg)){
                    meta = await extractMetadataFromMessage(replymsg)
                    meta.invoke.prompt = meta.invoke?.positive_prompt+'['+meta.invoke?.negative_prompt+'] '+parsedCmd._.join(' ')
                }
            } else {
                return
            }
            Object.keys(parsedCmd).forEach(k=>{
                debugLog('Appending '+parsedCmd[k])
                if(k!=='_'){meta.invoke[k] = parsedCmd[k]}
            })
            if(meta.invoke?.inputImageUrl){img=urlToBuffer(meta.invoke.inputImageUrl)}
            result = await invoke.jobFromMeta(meta,img)
            return returnMessageResult(msg,result)
        }
    },
    {
        name: 'unregisterSlashCommands',
        description: 'forcibly remove all registered slash commands from the server',
        permissionLevel: 'admin',
        aliases: ['unregisterslashcommands'],
        prefix:'!!!',
        command: async(args,msg)=>{
            await bot.bulkEditCommands([])
            let response = {content:':information_source: Unregistered Slash Commands'}
            return {messages:[response]}
        }
    },
    {
        name: 'restart',
        description: 'forcibly restart the bot process',
        permissionLevel: 'admin',
        aliases: ['restart','rstrt'],
        prefix:'!!!',
        command: async(args,msg)=>{
            process.exit(0)
        }
    },
    {
        name: 'avatar',
        description: 'Replies with the large version of any mentioned users avatar, or their own if nobody is mentioned',
        permissionLevel: 'all',
        aliases: ['avatar','avtr'],
        prefix:'!',
        command: async(args,msg)=>{
            let avatars=[]
            let messages=[]
            let userId=msg.user?.id||msg.member?.id||msg.author?.id
            log(userId)
            let components = [{type:1,components:[{type: 2, style: 1, label: 'Pimp', custom_id: 'pimp', emoji: { name: '🪄', id: null}, disabled: true }]}]
            if(msg.mentions?.length>0){
                for (const m in msg.mentions){
                    let uid=msg.mentions[m].id
                    let url=await getAvatarUrl(uid)
                    let buf = await urlToBuffer(url)
                    avatars.push({file:buf,name:getUUID()+'.png'})
                    messages.push({embeds:[{description:'Here is <@'+uid+'>\'s full size avatar:',color:getRandomColorDec()}],components:components})
                }
            } else {
                let url=await getAvatarUrl(userId)
                let buf = await urlToBuffer(url)
                avatars.push({file:buf,name:getUUID()+'.png'})
                messages.push({embeds:[{description:'Here is <@'+userId+'>\'s full size avatar:',color:getRandomColorDec()}],components:components})
            }
            if(avatars.length>0){return {messages:messages,files:avatars}}
        }
    },
    {
        name: 'models',
        description: 'List currently available models',
        permissionLevel: 'all',
        aliases:['models','mdl'],
        prefix:'!',
        command: async(args,msg)=>{
            let models = await invoke.allUniqueModelsAvailable()
            let sd1 = models.filter(obj => obj.base_model === 'sd-1')
            let sd2 = models.filter(obj => obj.base_model === 'sd-2')
            let sdxl = models.filter(obj => obj.base_model === 'sdxl')
            let dialog = {
                content:'',
                flags:64,
                embeds:[
                    {description:'Models currently available\nsd1: '+sd1.length+' , sd2: '+sd2.length+' sdxl: '+sdxl.length,color:getRandomColorDec()}
                ],
                components:[]
            }
            for (const modeltype in ['sd-1','sd-2','sdxl']){
                let filteredModels = models.filter(obj=>obj.base_model===modeltype)
                let marr=[]
                for (const m in filteredModels){
                    let model = filteredModels[m]
                    log(model)
                    marr.push(model.model_name)
                }
                if(marr.length>0){
                    let newdlg = {color:getRandomColorDec(),description:marr[0].base_model+' models: '+marr.join(',')}
                    dialog.embeds.push(newdlg)
                }
            }
            return {messages:[dialog],files:[]}
        }
        
    }
]

// generate simple lookup array of all command aliases with prefixes
let prefixes=[]
commands.forEach(c=>{c.aliases.forEach(a=>{prefixes.push(c.prefix+a)})})

parseMsg=async(msg)=>{
    // normalise values between responses in channel and DM
    let userid = msg.member?.id||msg.author?.id
    let username = msg.user?.username||msg.member?.username||msg.author?.username
    let channelid = msg.channel?.id
    let guildid = msg.guildID||'DM'
    if(!auth.check(userid,guildid,channelid)){return} // if not authorised, ignore
    if(msg.length===0||msg.content.length===0){return} // if empty message (or just an image) ignore
    let firstword = msg.content.split(' ')[0].toLowerCase()
    if(prefixes.includes(firstword)){
        commands.forEach(c=>{
            c.aliases.forEach(async a=>{
                if(firstword===c.prefix+a){
                    let args=msg.content.split(' ')
                    args.shift() // only pass on the message without the prefix and command
                    // check permissionLevel
                    switch(c.permissionLevel){
                        case 'all':{break} // k fine
                        case 'admin':{
                            if(parseInt(userid)!==config.adminID){
                                log('Denied admin command for '+username)
                                return
                            }
                            break
                        }
                    }
                    log(c.name+' triggered by '+username+' in '+msg.channel.name||msg.channel.id+' ('+guild+')')
                    msg.addReaction('🫡') // salute emoji
                    try{
                        let result = await c.command(args,msg)
                        let messages = result?.messages
                        let files = result?.files
                        let error = result?.error
                        if(error){
                            log('Error: '.bgRed+' '+error)
                            chat(channelid,{content:':warning: '+error})
                            return
                        }
                        if(!Array.isArray(messages)){messages=[messages]}
                        if(!Array.isArray(files)){files=[files]}
                        // unpack messages array and send each msg seperately
                        // if we have a file for each message, pair them up
                        // if we have multi messages and 1 file, attach to first message only
                        // todo If there are more files then there are messages attempt to bundle all files on first message
                        messages.forEach(message=>{
                            let file
                            if(files.length>0)file=files.shift() // grab the top file
                            if(message&&file){
                                chat(channelid,message,file) // Send message with attachment
                            }else if(message){
                                chat(channelid,message) // Send message, no attachment
                            }
                        })
                    } catch (err) {
                        log(err)
                    }
                }
            })
        })
    }
}

returnMessageResult = async(msg,result)=>{
    // generic response function for invoke results or errors
    if(result.error){return {error:result.error}}
    messages=[];files=[];error=null
    if(result?.images){
        for (const i in result.images){
            let image=result.images[i]
            let meta=await exif.load(image.buffer)
            message = imageResultMessage(msg.member?.id||msg.author?.id,image,result,meta)
            if(msg.id){
                message.messageReference={message_id:msg.id}
            }
            messages.push(message)
            files.push({file:image.buffer,name:image.name})
        }
    }else if(result?.messages?.length>0){
        for (const m in result.messages){
            messages.push(m)
        }
    }
    return {
        messages:messages,
        files:files,
        error:error
    }
}

extractImageBufferFromMessage = async (msg)=>{
    let buf=null
    for (const a of msg.attachments){
        let validMimetypes=['image/png','image/jpeg','image/webp']
        if(validMimetypes.includes(a.content_type)){
            buf = await urlToBuffer(a.proxy_url)
            if(['image/webp','image/svg'].includes(a.content_type)){buf = await imageEdit.convertToPng(buf)}
            break
        }
    }
    return buf
}

extractImageUrlFromMessage = async (msg)=>{
    for (const a of msg.attachments){
        let validMimetypes=['image/png','image/jpeg','image/webp']
        if(validMimetypes.includes(a.content_type)){
            return a.proxy_url
        }
    }
}

extractMetadataFromMessage = async (msg)=>{
    if(messageHasImageAttachments(msg)){
        buf = await extractImageBufferFromMessage(msg)
        meta = await exif.load(buf)
        return meta
    } else {
        return null
    }
}

messageHasImageAttachments = (msg)=>{
    if(msg.attachments?.length>0){
        for (const a of msg.attachments){
            let validMimetypes=['image/png','image/jpeg','image/webp']
            if(validMimetypes.includes(a.content_type)){return true}
        }
        return false
    }else{return false}
}

extractImageAndUrlFromMessageOrReply = async(msg)=>{
    let img,url
    if(messageHasImageAttachments(msg)){
        img = await extractImageBufferFromMessage(msg)
        url = await extractImageUrlFromMessage(msg)
    } else if(msg.messageReference?.messageID) {
        let sourcemsg = await bot.getMessage(msg.channel.id, msg.messageReference.messageID)
        if(messageHasImageAttachments(sourcemsg)){
            img = await extractImageBufferFromMessage(sourcemsg)
            url = await extractImageUrlFromMessage(sourcemsg)
        }
    } else {
        img=null
        url=null
    }
    return {img,url}
}

getAvatarUrl = async(userId)=>{
    let user = await bot.users.get(userId)
    let avatarHash = user.avatar
    let avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=512`
    return avatarUrl
}

imageResultMessage = (userid,img,result,meta)=>{
    let p=result.job.prompt
    let t=''
    if(meta.invoke?.cost){t+=' :coin: '+meta.invoke.cost}
    if(img.width&&img.height){t+=' :straight_ruler: '+img.width+'x'+img.height}
    if(meta.invoke?.steps){t+=' :recycle: '+meta.invoke.steps}
    if(meta.invoke?.scheduler){t+=' :eye: '+meta.invoke.scheduler}
    if(meta.invoke?.seed){t+=' :seedling: '+meta.invoke.seed}
    if(meta.invoke?.scale){t+=' :scales: '+meta.invoke.scale}
    if(meta.invoke?.model){t+=' :floppy_disk: '+meta.invoke.model?.model_name}
    if(meta.invoke?.clipskip){t+=' :clipboard: '+meta.invoke.clipskip}
    if(meta.invoke?.loras?.length>0){
        t+=' :pill: '
        for (const l in meta.invoke?.loras){t+=meta.invoke.loras[l].lora.model_name+'('+meta.invoke.loras[l].weight+') '}
    }
    if(meta.invoke?.inputImageUrl){t+=' :paperclip:attachment'}
    let colordec=getRandomColorDec()
    return {
        content:':brain: <@'+userid+'>',
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
                {type:2,style:3,label:'Refresh',custom_id:'refresh',emoji:{name:'🎲',id:null}},
                {type:2,style:1,label:'Edit Prompt',custom_id:'editPrompt',emoji:{name:'✏️',id:null},disabled:false},
                {type:2,style:2,label:'Random',custom_id:'editPromptRandom',emoji:{name:'🔀',id:null},disabled:false},
                {type:2,style:1,label:'Tweak',custom_id:'tweak',emoji:{name:'🧪',id:null},disabled:false},
                {type:2,style:4,label:'No',custom_id:'remove',emoji:{name:'🗑️',id:null},disabled:false}
            ]}
        ],
        allowed_mentions:{users:[userid]}
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
        extractMetadataFromMessage,
        extractImageUrlFromMessage,
        messageHasImageAttachments,
        returnMessageResult
    }
}
