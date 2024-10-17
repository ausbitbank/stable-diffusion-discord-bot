const {config,log,debugLog,getRandomColorDec,shuffle,urlToBuffer,getUUID,extractFilenameFromUrl,axios,timestamp}=require('../utils')
const {exif}=require('../exif')
const {invoke,cluster}=require('../invoke')
const {bot}=require('./bot')
const {auth}=require('./auth')
const {imageEdit}=require('../imageEdit')
const parseArgs = require('minimist')
const {fonturls} = require('../fonturls')
const {aspectRatio}=require('./aspectRatio')
const {llm}=require('../plugins/llm/llm')
const {credits}=require('../credits')
const {membership}=require('../membership')
const {ipfs}=require('../ipfs')
const {mod}=require('../mod')
const {payments}=require('../payments')
const { User,Pin } = require('../db')
const {qrcode} = require('../qrcode')
const {comfyui} = require('../comfyui')
const DDG = require('duck-duck-scrape')
const { image_search } = require('duckduckgo-images-api')

// Process discord text message commands
let commands = [
    {
        name: 'dream',
        description: 'Create a new image from your prompt',
        permissionLevel: 'all',
        aliases: ['dream','drm','d','imagine','drm3'],
        prefix:'!',
        command: async (args,msg,creator)=>{
            msg.addReaction('🫡') // salute emoji
            /* todo update to accept multiple init images
                let images = await extractImagesAndUrlsFromMessageOrReply(msg)
                images will be an array in format [{url:'url here','img:'buffer here'}]
                pass them through in place of img object and we deal with it elsewhere
                do not save inputImageUrl meta tag here anymore
                result = await invoke.jobFromDream(args,images,{type:'discord',msg:trackingmsg})
            */
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            let job = await invoke.jobFromDream(args,img)
            job.tracking = {type:'discord',msg:await bot.createMessage(creator.channelid,{content:':saluting_face: dreaming '+timestamp()})}
            job.creator=creator
            job = await auth.userAllowedJob(job)
            let result = await invoke.cast(job)
            // inject the original template image url
            if(imgurl && !result.error && result.images?.length > 0){result.images[0].buffer = await exif.modify(result.images[0].buffer,'arty','inputImageUrl',imgurl)}
            return returnMessageResult(msg,result)
        }
    },
    {
        name:'describe',
        description:'Describe an image',
        permissionLevel:'all',
        aliases:['describe'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(!imgres||!imgres?.img){return {error:'No compatible image found'}}
            // todo add tracking message ability
            let result = await invoke.interrogate(imgres.img)
            result.result=result.result.replace(/(^|\s)(arafed|araffe)\b/g, '') // remove arafed as a whole word or from start of string
            // result.replace(/(\b|^)\s(arafed?d?)\b/g,'')
            let options = result.options
            let newMsg = {
                content:':eyes: Image scanned with `'+options.clip_model+'`, captioned by `'+options.caption_model+'`:',
                embeds:[{description:result.result,color:getRandomColorDec(),thumbnail:{url:imgres.url}}],
                messageReference:{message_id:msg.id}
            }
            return {messages:[newMsg],files:[]}
        }
    },
    {
        name: 'background',
        description: 'Removes the background from an image',
        permissionLevel: 'all',
        aliases: ['bg','background'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            debugLog('background removal triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                let result = await invoke.processImage(img,null,'removebg',{},{type:'discord',msg:await bot.createMessage(creator.channelid,{content:':saluting_face: Removing background '+timestamp()})},creator)
                if(result?.images?.length>0){
                    let buf = result.images[0]?.buffer
                    buf = await exif.modify(buf,'arty','imageType','foreground')
                    return {messages:[{embeds:[{description:'Removed background',color:getRandomColorDec()}],components:[],messageReference:{message_id:msg.id}}],files:[{file:buf,name:result.images[0].name}]}
                }else{
                    return {error:'Failed at background removal'}
                }
            } else {
                return { error:'No image attached to remove background'}
            }
        }
    },
    {
        name:'chat',
        description:'Ask a local LLM for an answer to the given prompt',
        permissionLevel:'all',
        aliases:['chat','c'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            if(!config.llm.enabled){return}
            let allowed = await auth.userAllowedFeature(creator,'llm')
            if(!allowed){return {error:'ai chat is for members only'}}
            msg.addReaction('🫡')
            let newprompt = args.join(' ')
            let newMessage
            let color = getRandomColorDec()
            let latestUpdate = null
            let intervalId = null
            let isUpdating = false
            let done = false
            let page = 0
            let pages = 0
            let maxlength = 4000
            /* Text file attachment support, disabled
            let txtObject = await extractTextFileFromMessageOrReply(msg)
            if(txtObject&&txtObject.txt){
                debugLog(txtObject)
                debugLog('attaching file to prompt')
                newprompt+='\nFile attachment '+txtObject.filename+' :\n```'+txtObject.txt+'\n```'
            }
            */
            // allow replying to a message, insert the message text into the request
            if(msg.messageReference?.messageID){
                let sourcemsg = await bot.getMessage(creator.channelid,msg.messageReference.messageID)
                if (sourcemsg.embeds[0]?.description.length > 0) {
                    newprompt = sourcemsg.embeds[0].description + '\n' + newprompt
                } else if (sourcemsg.content.length>0){
                    newprompt = sourcemsg.content + '\n' + newprompt
                }
            }
            let initResponse = '<@'+creator.discordid+'> :thought_balloon: `'+newprompt.substr(0,500)+'` '+timestamp()
            let stream
            try{
                stream = await llm.chatStream(newprompt)
                if(stream.error){return {error:stream.error}}
            } catch (err) {
                debugLog('caught error in llm module')
                debugLog(err)
                return{error:'Error connecting to llm backend'}
            }

            startEditing=()=>{
                intervalId = setInterval(()=>{
                    // todo replace this whole timer based system cos its shit
                    //debugLog('llm tick')
                    //debugLog(stream)
                    if(!isUpdating&&latestUpdate){
                        const update = latestUpdate
                        latestUpdate=null
                        isUpdating=true
                        let fulltext = update.embeds[0].description
                        let newpage = Math.floor(fulltext.length/maxlength)
                        let pageContentStart = page * maxlength
                        let pageContentEnd = pageContentStart + maxlength
                        let pageContent = fulltext.substr(pageContentStart,pageContentEnd)
                        update.embeds[0].description = pageContent
                        if(page>pages){
                            bot.createMessage(msg.channel?.id,update)
                            .then(async(newmsg)=>{
                                pages++
                                newMessage = newmsg
                                isUpdating=false
                            })
                            .catch((err)=>{isUpdating=false;log(err)})
                        } else {
                            bot.editMessage(newMessage.channel?.id,newMessage.id,update)
                                .then(()=>{
                                    isUpdating=false
                                    if(newpage>page){page++}
                                })
                                .catch((err)=>{log(err);isUpdating=false})
                        }
                    }
                    if(!isUpdating&&done&&page===pages){clearInterval(intervalId)} // if we're done, shut down the timer
                },1000) // check every 1s
            }

            let lastsnapshot = ''
            let currentMessage = initResponse
            stream.on('content', (delta,snapshot)=>{
                if(snapshot.trim().length>0&&lastsnapshot!==snapshot){
                    const newContent = currentMessage + snapshot
                    latestUpdate={content:initResponse, embeds:[{description:snapshot,color:color}],messageReference:{message_id:msg.id}}
                    currentMessage = newContent
                    lastsnapshot = snapshot
                }
            })
            stream.on('finalMessage',(finalmsg)=>{
                done=true
                log('Finished LLM response: '+finalmsg.content)
            })
            stream.on('error', (error)=>{
                log('LLM Stream error:')
                log(error)
                latestUpdate={content:initResponse, embeds:[{title:':warning: Error',description:'Unable to connect to chat server',color:color,messageReference:{message_id:msg.id}}]}
                done=true
            })
            bot.createMessage(msg.channel?.id,{content:initResponse,messageReference:{message_id:msg.id}})
                .then(async(newmsg)=>{
                    newMessage = newmsg
                    startEditing()
                })
                .catch((err)=>{log(err)})
            return {messages:[],files:[]}
        }
    },
    {
        name:'superprompt',
        description:'Improve prompts with superprompt t5 prompt model',
        permissionLevel:'all',
        aliases:['t5','p','superprompt'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            // Requires custom node v1.4 https://github.com/gogurtenjoyer/nightmare-promptgen
            // Do NOT allow repo_id to be directly set by user or you deserve what happens next
            // Superprompt t5 model: roborovski/superprompt-v1  
            let options = parseArgs(args,{})
            let prompt = options._.join(' ')
            let parsedOptions = {
                prompt:'Expand the following prompt to add more detail: '+prompt,
                temp:options.temp??1,
                top_k:options.top_k??40,
                top_p:options.top_p??0.9,
                repo_id:'roborovski/superprompt-v1',
                instruct_mode:true,
                max_new_tokens:300,
                max_time:10,
                repetition_penaly:1,
                typical_p:1,
                use_cache:false
            }
            let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Improving prompt '+timestamp()})
            let response = await invoke.nightmarePromptGen(null,parsedOptions,{type:'discord',msg:trackingmsg})
            let newMsg = {content:':brain: **Generated prompt:**',embeds:[],messageReference:{message_id:msg.id}}
            for (let answer in response){newMsg.embeds.push({description:response[answer].prompt,color:getRandomColorDec()})}
            return {messages:[newMsg],files:[]}
        }
    },
    {
        name: 'depth',
        description: 'Return a depth map of an input image',
        permissionLevel: 'all',
        aliases: ['depth'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            debugLog('depth map creation triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                msg.addReaction('🫡') // salute emoji
                //let result = await invoke.processImage(img,null,'depthmap',{a_mult:2,bg_th:0.1})
                let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Creating depth map '+timestamp()})
                let result = await invoke.processImage(img,null,'depthanything',{},{type:'discord',msg:trackingmsg},creator)
                if (result?.images?.length>0){
                    let buf = result.images[0]?.buffer
                    buf = await exif.modify(buf,'arty','imageType','depth')
                    return {messages:[{embeds:[{description:'Converted image to depth map',color:getRandomColorDec()}],messageReference:{message_id:msg.id}}],files:[{file:buf,name:result.images[0].name}]}
                } else {
                    return {error:'Failed depth map creation'}
                }
            } else {
                return { error:'No image attached to create depthmap'}
            }
        }
    },
    {
        name: 'face',
        description: 'Return a cropped face from an input image',
        permissionLevel: 'all',
        aliases: ['face'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            debugLog('face crop triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                //let result = await invoke.processImage(img,null,'depthmap',{a_mult:2,bg_th:0.1})
                let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Cropping face '+timestamp()})
                let options={face_id:0,minimum_confidence:0.5,x_offset:0,y_offset:0,padding:0,chunk:false}
                if(args[0]){
                    debugLog('Seeking face '+args[0])
                    options.face_id=args[0]
                }
                let result = await invoke.faceCrop(img,undefined,options,{type:'discord',msg:trackingmsg})
                if (result?.images?.length>0){
                    return {messages:[{embeds:[{description:'Cropped face from image',color:getRandomColorDec()}],messageReference:{message_id:msg.id}}],files:[{file:result.images[0]?.file,name:result.images[0].name}]}
                } else {
                    return {error:'Failed to crop face'}
                }
            } else {
                return { error:'No image attached to crop face from'}
            }
        }
    },
    {
        name: 'edges',
        description: 'Return a canny edge detection of an input image',
        permissionLevel: 'all',
        aliases: ['edge','edges','canny'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            debugLog('canny edge detection creation triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Creating canny edge detection '+timestamp()})
                let result = await invoke.processImage(img,null,'canny',{low_threshold:100,high_threshold:200},{type:'discord',msg:trackingmsg},creator)
                if(result?.images?.length>0){
                    debugLog(result.images[0])
                    let buf = result.images[0]?.buffer
                    buf = await exif.modify(buf,'arty','imageType','canny')
                    return {messages:[{embeds:[{description:'Converted to canny edge detection',color:getRandomColorDec()}],messageReference:{message_id:msg.id}}],files:[{file:buf,name:result.images[0].name}]}
                } else {
                    return {error:'Failed canny edge detection'}
                }
            } else {
                return { error:'No image attached to create canny edge detection'}
            }
        }
    },
    {
        name: 'lineart',
        description: 'Return a lineart version of an input image',
        permissionLevel: 'all',
        aliases: ['lineart'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            debugLog('lineart creation triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Creating lineart '+timestamp()})
                let result = await invoke.processImage(img,null,'lineart',{detect_resolution:512,image_resolution:512,coarse:false},{type:'discord',msg:trackingmsg},creator)
                if(result?.images?.length>0){
                    let buf = result.images[0]?.buffer
                    buf = await exif.modify(buf,'arty','imageType','lineart')
                    return {messages:[{embeds:[{description:'Converted to lineart',color:getRandomColorDec()}],messageReference:{message_id:msg.id}}],files:[{file:buf,name:result.images[0].name}]}
                } else {
                    return {error:'Failed lineart'}
                }
            } else {
                return { error:'No image attached to create lineart'}
            }
        }
    },
    {
        name: 'lineartanime',
        description: 'Return a lineart anime version of an input image',
        permissionLevel: 'all',
        aliases: ['lineartanime'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            debugLog('lineart anime creation triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Creating lineart anime '+timestamp()})
                let result = await invoke.processImage(img,null,'lineartanime',{detect_resolution:512,image_resolution:512},{type:'discord',msg:trackingmsg},creator)
                if(result?.images?.length>0){
                    let buf = result.images[0]?.buffer
                    buf = await exif.modify(buf,'arty','imageType','lineartanime')
                    return {messages:[{embeds:[{description:'Converted to lineart anime',color:getRandomColorDec()}],messageReference:{message_id:msg.id}}],files:[{file:buf,name:result.images[0].name}]}
                } else {
                    return {error:'Failed lineart anime'}
                }
            } else {
                return { error:'No image attached to create lineart anime'}
            }
        }
    },
    {
        name: 'colormap',
        description: 'Return a pixelated color map version of an input image',
        permissionLevel: 'all',
        aliases: ['colormap','colourmap','pixel','pixelart'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            debugLog('color map creation triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                debugLog(args)
                let tile_size = args.length>0 ? parseInt(args[0]) : 64
                let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Creating colormap with tilesize '+tile_size+' '+timestamp()})
                let result = await invoke.processImage(img,null,'colormap',{tile_size:tile_size},{type:'discord',msg:trackingmsg},creator)
                if(result?.images?.length>0){
                    let buf = result.images[0]?.buffer
                    buf = await exif.modify(buf,'arty','imageType','colormap')
                    return {messages:[{embeds:[{description:'Converted to colormap with tile size '+tile_size,color:getRandomColorDec()}],messageReference:{message_id:msg.id}}],files:[{file:buf,name:result.images[0].name}]}
                } else {
                    return {error:'Failed color map'}
                }
            } else {
                return { error:'No image attached to create color map'}
            }
        }
    },
    {
        name: 'pose',
        description: 'Return a openpose pose detection of an input image',
        permissionLevel: 'all',
        aliases: ['pose','openpose'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            debugLog('pose detection creation triggered: '+args.join(' '))
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Creating pose detection '+timestamp()})
                let result = await invoke.processImage(img,null,'openpose',{image_resolution:512,draw_hands:true,draw_body:true,draw_face:true},{type:'discord',msg:trackingmsg})
                if(result?.images?.length>0){
                    let buf = result.images[0]?.buffer
                    buf = await exif.modify(buf,'arty','imageType','openpose')
                    let components = [{type:1,components:[{type: 2, style: 1, label: 'Use this pose', custom_id: 'usepose', emoji: { name: '🤸', id: null}, disabled: true }]}]
                    return {messages:[{embeds:[{description:'Converted to openpose detection',color:getRandomColorDec()}],components:components,messageReference:{message_id:msg.id}}],files:[{file:buf,name:result.images[0].name}]}
                }else{
                    return {error:'Failed at openpose detection'}
                }
            } else {
                return { error:'No image attached to create pose detection'}
            }
        }
    },
    {
        name: 'esrgan',
        description: 'Return a 2x upscaled version of an input image',
        permissionLevel: 'all',
        aliases: ['esrgan','upscale','enhance','u'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            debugLog('esrgan triggered: '+args.join(' '))
            // debugLog(host.config?.upscaling_methods?.upscaling_models)
            // RealESRGAN_x2plus.pth
            // RealESRGAN_x4plus.pth
            // RealESRGAN_x4plus_anime_6B
            // ESRGAN_SRx4_DF2KOST_official-ff704c30.pth
            let modelname='RealESRGAN_x2plus.pth'
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                msg.addReaction('🫡') // salute emoji
                let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Upscaling image '+timestamp()})
                let result = await invoke.processImage(img,null,'esrgan',{model_name:modelname},{type:'discord',msg:trackingmsg},creator)
                if(result.error){return {error:result.error}}
                let buf = result.images[0]?.buffer
                let resolution = await imageEdit.getResolution(buf)
                let newWidth = resolution?.width
                let newHeight = resolution?.height
                return {messages:[{embeds:[{description:'Upscaled 2x with '+modelname+' to '+newWidth+' x '+newHeight,color:getRandomColorDec()}],components:[],messageReference:{message_id:msg.id}}],files:[{file:buf,name:result.images[0].name}]}
            } else {
                return { error:'No image attached to upscale'}
            }
        }
    },
    {
        name: 'fancyupscale',
        description: 'Return a 2x upscaled version of an input image',
        permissionLevel: 'admin',
        aliases: ['fancyupscale'],
        prefix:'!!!',
        command: async(args,msg,creator)=>{
            debugLog('fancyupscale triggered: '+args.join(' '))
            // debugLog(host.config?.upscaling_methods?.upscaling_models)
            // RealESRGAN_x2plus.pth
            // RealESRGAN_x4plus.pth
            // RealESRGAN_x4plus_anime_6B
            // ESRGAN_SRx4_DF2KOST_official-ff704c30.pth
            let modelname='RealESRGAN_x2plus.pth'
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            if(img){
                msg.addReaction('🫡') // salute emoji
                let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Upscaling image '+timestamp()})
                let result = await invoke.processImage(img,null,'fancyupscale',{model_name:modelname},{type:'discord',msg:trackingmsg},creator)
                if(result.error){return {error:result.error}}
                let buf = result.images[0]?.buffer
                let resolution = await imageEdit.getResolution(buf)
                let newWidth = resolution?.width
                let newHeight = resolution?.height
                return {messages:[{embeds:[{description:'Upscaled 2x with '+modelname+' to '+newWidth+' x '+newHeight,color:getRandomColorDec()}],components:[],messageReference:{message_id:msg.id}}],files:[{file:buf,name:result.images[0].name}]}
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
        command: async (args,msg,creator)=>{
            let meta
            if(msg.messageReference?.messageID){
                sourcemsg = await bot.getMessage(creator.channelid,msg.messageReference.messageID)
                meta = await extractMetadataFromMessage(sourcemsg)
            } else { meta = await extractMetadataFromMessage(msg)}
            if(meta){ return {messages:[{content:'Extracted metadata from image:',embeds:[{description:JSON.stringify(meta,null,2),color:getRandomColorDec()}],messageReference:{message_id:msg.id}}]}
            } else { return {error:'Unable to find metadata'}}
        }
    },
    {
        name: 'help',
        description: 'Show help dialog, about this bot',
        permissionLevel: 'all',
        aliases: ['help'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            //let response = await help()
            let helpTitles=['let\'s get wierd','help me help you','help!','wait, what ?']
            shuffle(helpTitles)
            let m='```diff\n'
            for (const c in commands){
                let cmd=commands[c]
                if(cmd.permissionLevel==='admin'){continue} // dont show admin commands
                m+='-| '+cmd.name+': '
                for (const a in cmd.aliases){
                    let alias=cmd.aliases[a]
                    m+=cmd.prefix+alias+' '
                }
                m+='\n+| '+cmd.description+'\n\n'
            }
            m+='```\n```yaml\nSee these link buttons below for more commands and info```'
            var helpMsgObject={
                content: '',
                embeds: [
                    {
                        type:'rich',
                        title:helpTitles[0],
                        description:m,
                        color:getRandomColorDec()
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
            helpMsgObject.messageReference={message_id:msg.id}
            return {messages:[helpMsgObject]}
        }
    },
    {
        name: 'text',
        description: 'Create an image containing text for use as a controlnet input image',
        permissionLevel: 'all',
        aliases: ['text','textfontimage'],
        prefix:'!',
        command: async (args,msg,creator)=>{
            //https://github.com/mickr777/textfontimage
            // todo import and use parseArgs to parse settings
            let options = parseArgs(args,{string:['row2']})
            let fonturl = null
            if(options.font){
                fonturl=fonturls.get(options.font)
                if(!fonturl){return {error:'Unable to find font name `'+options.font+'`'}}
            } else {
                let f = fonturls.random()
                options.font = f.name
                fonturl = f.url
            }
            let parsedOptions = {
                text_input: options._.join(' '),
                text_input_second_row: options.row2??'',
                second_row_font_size:options.row2size??'',
                font_url:fonturl,
                local_font_path:'',
                local_font:'',
                image_width:options.width??1024,
                image_height:options.height??1024,
                padding:options.padding??100,
                row_gap:options.gap??50
            }
            result = await invoke.textFontImage(parsedOptions)
            if(result.error||result.images.length==0){return {error:'Error in textfontimage'}}
            let response = {
                embeds:[
                    {description:':tada: textfontimage result for <@'+creator.discordid+'>\nText: `'+parsedOptions.text_input+'`, Width:`'+result.images[0].width+'` , Height: `'+result.images[0].height+'`, Font: `'+options.font+'`, Padding: `'+parsedOptions.padding+'`, Gap: `'+parsedOptions.row_gap+'`',color:getRandomColorDec()}
                ],
                messageReference:{message_id:msg.id}
                /*,
                components:[{type:1,components:[
                    {type: 2, style: 1, label: 'depth controlnet (clear)', custom_id: 'depthcontrol', emoji: { name: '🪄', id: null}, disabled: true },
                    {type: 2, style: 1, label: 'qrcode controlnet (subtle)', custom_id: 'qrcontrol', emoji: { name: '🪄', id: null}, disabled: true }
                ]}]*/
            }
            return {
                messages:[response],
                files:[{file:result.images[0].buffer,name:result.images[0].name}]
            }
        }
    },
    {
        name: 'append',
        description: 'Append to a renders prompt and arguments',
        permissionLevel: 'all',
        aliases: ['..'],
        prefix:'',
        command: async(args,msg,creator)=>{
            let replymsg,meta,img
            let parsedCmd = parseArgs(args,{boolean:['facemask','invert','hrf']})
            if(msg.messageReference?.messageID){
                replymsg = await bot.getMessage(creator.channelid, msg.messageReference.messageID)
                if(replymsg.member.id===bot.application.id&&messageHasImageAttachments(replymsg)){
                    meta = await extractMetadataFromMessage(replymsg)
                    meta.invoke.prompt = meta.invoke?.prompt+' '+parsedCmd._.join(' ')
                } else {return}
            } else {return}
            let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: dreaming '+timestamp()})
            Object.keys(parsedCmd).forEach(k=>{
                if(k!=='_'){meta.invoke[k] = parsedCmd[k]}
            })
            if(meta.invoke?.inputImageUrl){img=urlToBuffer(meta.invoke.inputImageUrl)}
            let job = await invoke.jobFromMeta(meta,img,{type:'discord',msg:trackingmsg})
            job.creator=getCreatorInfoFromMsg(msg)
            job = await checkUserForJob(job)
            if(job.error){return job}
            result = await invoke.cast(job)
            if(meta.invoke?.inputImageUrl && !result.error && result.images?.length > 0){
                debugLog('Attaching input image url to png metadata: '+meta.invoke?.inputImageUrl)
                result.images[0].buffer = await exif.modify(result.images[0].buffer,'arty','inputImageUrl',meta.invoke?.inputImageUrl)
            }
            return returnMessageResult(msg,result)
        }
    },
    {
        name: 'avatar',
        description: 'Replies with the large version of any mentioned users avatar, or their own if nobody is mentioned',
        permissionLevel: 'all',
        aliases: ['avatar','avtr'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let avatars=[]
            let messages=[]
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
                let url=await getAvatarUrl(creator.discordid)
                let buf = await urlToBuffer(url)
                avatars.push({file:buf,name:getUUID()+'.png'})
                messages.push({embeds:[{description:'Here is <@'+userId+'>\'s full size avatar:',color:getRandomColorDec()}],components:components,messageReference:{message_id:msg.id}})
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
        command: async(args,msg,creator)=>{
            let models = await invoke.allUniqueModelsAvailable()
            let sd1 = models.filter(obj => obj.base === 'sd-1')
            let sd2 = models.filter(obj => obj.base === 'sd-2')
            let sdxl = models.filter(obj => obj.base === 'sdxl')
            let flux = models.filter(obj => obj.base === 'flux')
            let dialog = {
                content:'',
                flags:64,
                embeds:[
                    {description:'Models currently available\n**sd-1**: '+sd1.length+' , **sd-2**: '+sd2.length+' **sdxl**: '+sdxl.length+' **flux**: '+flux.length,color:getRandomColorDec()}
                ],
                components:[],
                messageReference:{message_id:msg.id}
            }
            let basemodels = ['sd-1','sd-2','sdxl','flux']
            for (const modeltype in basemodels){
                let filteredModels = models.filter(obj=>obj.base===basemodels[modeltype])
                let marr=[]
                for (const m in filteredModels){
                    let model = filteredModels[m]
                    marr.push(model.name)
                }
                if(marr.length>0){
                    let newdlg = {color:getRandomColorDec(),description:'**'+basemodels[modeltype]+' models**:\n'+marr.join('\n'),messageReference:{message_id:msg.id}}
                    dialog.embeds.push(newdlg)
                }
            }
            return {messages:[dialog],files:[]}
        }
    },
    {
        name: 'loras',
        description: 'List currently available loras',
        permissionLevel: 'all',
        aliases:['lora','loras'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let models = await invoke.allUniqueLorasAvailable()
            let sd1 = models.filter(obj => obj.base === 'sd-1')
            let sd2 = models.filter(obj => obj.base === 'sd-2')
            let sdxl = models.filter(obj => obj.base === 'sdxl')
            let flux = models.filter(obj => obj.base === 'flux')
            let dialog = {
                content:'',
                flags:64,
                embeds:[
                    {description:'Loras currently available\n**sd-1**: '+sd1.length+' , **sd-2**: '+sd2.length+' **sdxl**: '+sdxl.length+' **flux**: '+flux.length,color:getRandomColorDec()}
                ],
                components:[],
                messageReference:{message_id:msg.id}
            }
            let basemodels = ['sd-1','sd-2','sdxl','flux']
            for (const modeltype in basemodels){
                let filteredModels = models.filter(obj=>obj.base===basemodels[modeltype])
                let marr=[]
                for (const m in filteredModels){
                    let model = filteredModels[m]
                    marr.push(model.name)
                }
                if(marr.length>0){
                    let newdlg = {color:getRandomColorDec(),description:'**'+basemodels[modeltype]+' loras**:\n'+marr.join('\n')}
                    dialog.embeds.push(newdlg)
                }
            }
            return {messages:[dialog],files:[]}
        }
    },
    {
        name:'nightmarePromptGen',
        description:'Autocomplete prompts with nightmare prompt generator',
        permissionLevel:'all',
        aliases:['nightmare','n'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            // Requires custom node https://github.com/gogurtenjoyer/nightmare-promptgen
            // Do NOT allow repo_id to be directly set by user or you deserve what happens next
            // OG 500mb model:  cactusfriend/nightmare-invokeai-prompts
            // 1.5gb model:     cactusfriend/nightmare-promptgen-XL
            let options = parseArgs(args,{})
            let parsedOptions = {
                prompt:options._.join(' '),
                temp:options.temp??1.8,
                top_k:options.top_k??40,
                top_p:options.top_p??0.9,
                repo_id:'cactusfriend/nightmare-promptgen-3',
                instruct_mode:false,
                max_new_tokens:300,
                max_time:10,
                repetition_penaly:1,
                typical_p:1,
                use_cache:false
            }
            let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Having a nightmare '+timestamp()})
            let response = await invoke.nightmarePromptGen(null,parsedOptions,{type:'discord',msg:trackingmsg})
            let newMsg = {content:':brain: **Generated prompt:**',embeds:[],messageReference:{message_id:msg.id}}
            for (let answer in response){newMsg.embeds.push({description:response[answer].prompt,color:getRandomColorDec()})}
            return {messages:[newMsg],files:[]}
        }
    },
    {
        name:'load',
        description:'Load a job template from an uploaded image',
        permissionLevel:'admin',
        aliases:['load'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            // get image metadata, show a frame similar to an image result with the controls
            msg.addReaction('🫡') // salute emoji
            let result
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(!imgres||!imgres?.img){return {error:'No compatible image found'}}
            let meta = await exif.load(imgres.img)
            if(Object.keys(meta)?.length===0){
                debugLog('Incompatible image found')
                return {error:'Incompatible image found, missing metadata'}
            }
            result = {images:[{buffer:imgres.img,name:extractFilenameFromUrl(imgres.url)}]}
            return returnMessageResult(msg,result)
        }
    },
    {
        name:'aspect',
        description:'Turn a resolution into an aspect ratio',
        permissionLevel:'all',
        aliases:['aspect','ar'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            if (args[0]){
                let w = args[0].split('x')[0]
                let h = args[0].split('x')[1]
                let ar = await aspectRatio.resToRatio(w,h)
                let newMsg = {
                    content:'',
                    embeds:[{description:':straight_ruler: Resolution of `'+w+'` x `'+h+'` has an aspect ratio of `'+ar+'`',color:getRandomColorDec()}
                    ]
                }
                return {messages:[newMsg],files:[]}
            } else {
                let imgres = await extractImageAndUrlFromMessageOrReply(msg)
                if(!imgres||!imgres?.img){return {error:'No compatible image found'}}
                let res = await imageEdit.getResolution(imgres.img)
                let w = res.width
                let h = res.height
                let ar = await aspectRatio.resToRatio(w,h)
                let newMsg = {
                    content:'',
                    embeds:[{description:':straight_ruler: Resolution of `'+w+'` x `'+h+'` has an aspect ratio of `'+ar+'`',color:getRandomColorDec()}],
                    messageReference:{message_id:msg.id}
                }
                return {messages:[newMsg],files:[]}
            }
        }
    },
    {
        name:'resolution',
        description:'Show the resolution of an attached or replied image',
        permissionLevel:'all',
        aliases:['res','resolution'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(!imgres||!imgres?.img){return {error:'No compatible image found'}}
            let res = await imageEdit.getResolution(imgres.img)
            let newMsg = {
                content:'',
                embeds:[{description:'Image resolution is `'+res.width+'x'+res.height+'`',color:getRandomColorDec()}],
                messageReference:{message_id:msg.id}
            }
            return {messages:[newMsg],files:[]}
        }
    },
    {
        name:'handfix',
        description:'Attempt to fix the hands of an image',
        permissionLevel:'admin', // incomplete
        aliases:['handfix'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(!imgres||!imgres?.img){return {error:'No compatible image found'}}
            let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: attempting to fix hands '+timestamp()})
            let result = await invoke.handfix(imgres.img,undefined,undefined,{type:'discord',msg:trackingmsg})
            debugLog(result)
            return {
                messages:[{embeds:[{description:'Attempted hand fix',color:getRandomColorDec()}],messageReference:{message_id:msg.id}}],
                files:[
                    {file:result.images[1].buffer,name:result.images[1].name}
                ]
            }
        }
    },
    {
        name:'tier1',
        description:'Set users to tier 1 membership',
        permissionLevel:'admin',
        aliases:['tier1'],
        prefix:'!!!',
        command: async(args,msg,creator)=>{
            // extract all the referened users from the message
            let userids = msg.mentions.map(o=>o.id)
            let r = ''
            for (id in userids){
                await membership.setTier(userids[id],1)
                r+='<@'+userids[id]+'> is now tier 1 \n'
            }
            let newMsg = {content:'',embeds:[{description:r,color:getRandomColorDec()}],messageReference:{message_id:msg.id}}
            return {messages:[newMsg],files:[]}
        }
    },
    {
        name:'tier0',
        description:'Set users to tier 0 membership',
        permissionLevel:'admin',
        aliases:['tier0'],
        prefix:'!!!',
        command: async(args,msg,creator)=>{
            // extract all the referened users from the message
            let userids = msg.mentions.map(o=>o.id)
            let r = ''
            for (id in userids){
                await membership.setTier(userids[id],0)
                r+='<@'+userids[id]+'> is now tier 0 \n'
            }
            let newMsg = {content:'',embeds:[{description:r,color:getRandomColorDec()}],messageReference:{message_id:msg.id}}
            return {messages:[newMsg],files:[]}
        }
    },
    {
        name:'test',
        description:'Generic admin test command',
        permissionLevel:'admin',
        aliases:['test'],
        prefix:'!!!',
        command: async(args,msg,creator)=>{
            //let cid = await extractImageCidFromMessageOrReply(msg)
            //if(!cid){return {error:'No cid found'}}
            let response = await llm.chat('tell me a joke','You are a dirty comedian, always telling unique jokes never heard before')
            let res = response.choices[0].message.content
            debugLog(res)
            let newMsg = {
                content:'embedding dataurl',
                embeds: [
                    {
                        image: {
                            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='
                            }
                        }
                    ]
                }
            return
            //return {messages:[newMsg],files:[]}
        }
    },
    {
        name:'search',
        description:'Search duckduckgo for a query',
        permissionLevel:'all',
        aliases:['search','s'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let results = null
            let query = args.join(' ')
            try {
                console.log('DDG Search Request: '+query)
                const searchResults = await DDG.search(query); // also DDG.images, DDG.videos , DDG.news
                results = searchResults.results
            } catch (error) {
                console.error('Error searching DuckDuckGo:', error);
                return {error:'Error searching DuckDuckGo'}
                //return [];
            }
            let files=[]
            let link = 'https://duckduckgo.com/?t=h_&q='+encodeURIComponent(query)+'&ia=web'
            let newMsg = {content:'[search results]('+link+') for `'+query+'`',embeds: []}
            newMsg.embeds.push(
                {
                    title:results[0].title,
                    description:results[0].url+'\n'+results[0].description.substring(0,2000),
                    url:results[0].url,
                    footer:{text:results[0].hostname},
                    color:getRandomColorDec()
                })
            /*
            try {
                console.log('DDG Image Search Request: '+query)
                const searchResults = await image_search({ query, moderate: false })
                results = searchResults.slice(0,1)
                for (r in results){
                    //newMsg.content+='\n'+results[r].image
                    //newMsg.embeds.push({image:{url:results[r].thumbnail},url:results[r].url,color:getRandomColorDec(),footer:{description:results[r].title}})
                    let buf = await urlToBuffer(results[r].url)
                    let cleanUrl = results[r].url.split('?')[0].split('#')[0] // Remove query parameters and hash
                    let filename = cleanUrl.split('/').pop() // Get the last part of the path
                    let extension = filename.split('.').pop()
                    if(['php'].includes(extension)){let filename = 'image.jpg'}
                    files.push({file:buf,name:filename})
                }
            } catch (error) {
                console.error('Error searching DuckDuckGo Images:', error);
                return {error:'Error searching DuckDuckGo Images'}
                //return [];
            }
            */
            return {messages:[newMsg],files}
        }
    },
    {
        name:'addcredit',
        description:'Manually add credit to the named accounts',
        permissionLevel:'admin',
        aliases:['addcredit','addcredits'],
        prefix:'!!!',
        command: async(args,msg,creator)=>{
            // extract all the referened users from the message
            let userids = msg.mentions.map(o=>o.id)
            let usernames = msg.mentions.map(o=>o.username)
            let r = ''
            let amount = 0
            if(args[0]){ amount=parseInt(args[0])
            } else {return {error:amount+' is not a valid amount'}}
            for (id in userids){
                debugLog('Adding '+amount+' to userid '+userids[id])
                let balance = await credits.balance({discordid:userids[id],username:usernames[id]})
                await credits.increment(userids[id],amount)
                balance=balance+amount
                r+='<@'+userids[id]+'> balance is now :coin: '+balance+' \n'
            }
            let newMsg = {embeds:[{description:r,color:getRandomColorDec()}],messageReference:{message_id:msg.id}}
            return {messages:[newMsg],files:[]}
        }
    },
    /*{
        name:'transfer',
        description:'Manually transfer credits to an account',
        permissionLevel:'admin',
        aliases:['transfer','gift'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            // extract all the referened users from the message
            let userids = msg.mentions.map(o=>o.id)
            let usernames = msg.mentions.map(o=>o.username)
            let r = ''
            let amount = 0
            if(args[0]){ amount=parseInt(args[0])}else{return {error:amount+' is not a valid amount'}}
            let senderbalance = await credits.balance(creator)
            debugLog('Sender balance is '+senderbalance)
            if(senderbalance<amount){return {error:'Insufficient balance to send '+amount+' :coin:'}}
            for (id in userids){
                debugLog('Transferring '+amount+' to userid '+userids[id]+' from '+creator.username)
                let balance = await credits.balance({discordid:userids[id],username:usernames[id]})
                //await credits.transfer()
                //await credits.increment(userids[id],amount)
                //balance=balance+amount
                //r+='<@'+userids[id]+'> balance is now :coin: '+balance+' \n'
            }
        }
    }*/
    {
        name:'reinit',
        description:'Trigger a rescan/reinitialization of all invoke hosts status,models,controlnets,etc',
        permissionLevel:'admin',
        aliases:['reinit'],
        prefix:'!!!',
        command: async(args,msg,creator)=>{
            // manually trigger rescan/reinitialize of all hosts using invoke.init()
            // for the truly impatient, scheduler already runs this every 5 minutes
            invoke.init()
            return {messages:[{content:'',embeds:[{description:':information_source: Scanning all invoke backends for model changes',color:getRandomColorDec()}],messageReference:{message_id:msg.id}}],files:[]}
        }
    },
    {
        name:'hosts',
        description:'View current invokeai backends status',
        permissionLevel:'admin',
        aliases:['hosts'],
        prefix:'!!!',
        command: async(args,msg,creator)=>{
            // Get status of all invoke hosts
            let newMsg = {content:'',embeds:[{description:'',color:getRandomColorDec()}],messageReference:{message_id:msg.id}}
            let hoststxt=':information_source: **backend status**\n'
            for (h in cluster){
                let host = cluster[h]
                hoststxt+='`'+host.name+'` by <@'+host.ownerid+'> is '
                if(host.online===true){hoststxt+=' :green_circle: online\n'}else{hoststxt+=' :red_circle: offline\n'}
            }
            newMsg.embeds[0].description=hoststxt
            return {messages:[newMsg],files:[]}
        }
    },
    {   
        name: 'unregisterSlashCommands',
        description: 'forcibly remove all registered slash commands from the server',
        permissionLevel: 'admin',
        aliases: ['unregisterslashcommands'],
        prefix:'!!!',
        command: async(args,msg,creator)=>{
            await bot.bulkEditCommands([])
            let response = {content:':information_source: Unregistered Slash Commands'}
            return {messages:[response]}
        }
    },
    {
        name: 'restart',
        description: 'forcibly restart the bot process',
        permissionLevel: 'admin',
        aliases: ['restart'],
        prefix:'!!!',
        command: async(args,msg,creator)=>{
            process.exit(0)
        }
    },
    {
        name:'togglehost',
        description:'Toggle status of a backend host by name',
        permissionLevel:'admin',
        aliases:['togglehost','th'],
        prefix:'!!!',
        command: async(args,msg,creator)=>{
            if (args[0]){
                let hostnametodisable = args[0].toString()
                for (h in cluster){
                    let host = cluster[h]
                    if(host.name===hostnametodisable){
                        if(host.disabled){
                            host.online=true
                            host.disabled=false
                            return {messages:[{embeds:[{description:':white_check_mark: Enabled backend host `'+hostnametodisable+'`',color:getRandomColorDec()}],messageReference:{message_id:msg.id}}]}
                        } else {
                            host.online=false
                            host.disabled=true
                            return {messages:[{embeds:[{description:':x: Disabled backend host `'+hostnametodisable+'`',color:getRandomColorDec()}],messageReference:{message_id:msg.id}}]}
                        }
                    }
                }
            }
        }        
    },
    {
        name:'forward',
        description:'Copy a message to a new channel',
        permissionLevel:'admin',
        aliases:['f','forward'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            if(msg.messageReference?.messageID && args[0]) { // if replying to a message, with a channel 
                //let sourcemsg = await bot.getMessage(msg.channel.id, msg.messageReference.messageID)
                // args[0] should be <#1115603175412613121>
                //let newchannelreg = args[0].match(/<(\d+)>/)
                //newchannelreg = newchannelreg ? newchannelreg[1] : null
                //todo need to check channel is in the same server as OP
                //todo need to check requesting user is also in channel they want to forward to
                //let msgcopy = await bot.getMessage(msg.channel.id,msg.id)
            }
        }
    },
    {
        name:'upvote',
        description:'Upvote a specific cid',
        permissionLevel:'all',
        aliases:['upvote','up'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let cid = args[0]
            let res = await mod.upvote(cid,creator)
            if(res.error){return res}
            msg.addReaction('🫡')
        }
    },
    {
        name:'downvote',
        description:'Downvote a specific cid',
        permissionLevel:'all',
        aliases:['download','down'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let cid = args[0]
            let res = await mod.downvote(cid,creator)
            if(res.error){return res}
            msg.addReaction('🫡')
        }
    },
    {
        name:'nsfw',
        description:'Mark a specific cid as nsfw',
        permissionLevel:'all',
        aliases:['nsfw'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let cid = args[0]
            let res = await mod.nsfw(cid,creator)
            if(res.error){return res}
            msg.addReaction('🫡')
        }
    },
    {
        name:'sfw',
        description:'Mark a specific cid as sfw',
        permissionLevel:'all',
        aliases:['sfw'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let cid = args[0]
            let res = await mod.sfw(cid,creator)
            if(res.error){return res}
            msg.addReaction('🫡')
        }
    },
    {
        name:'unvote',
        description:'Unvote a specific cid',
        permissionLevel:'all',
        aliases:['unvote'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let cid = args[0]
            let res = await mod.unvote(cid,creator)
            if(res.error){return res}
            msg.addReaction('🫡')
        }
    },
    {
        name:'star',
        description:'Mark a specific cid as starred/favourited',
        permissionLevel:'all',
        aliases:['star'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let cid = args[0]
            let res = await mod.star(cid,creator)
            if(res.error){return res}
            msg.addReaction('🫡')
        }
    },
    {
        name:'unstar',
        description:'Unmark a specific cid as starred/favourited',
        permissionLevel:'all',
        aliases:['unstar'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let cid = args[0]
            let res = await mod.unstar(cid,creator)
            if(res.error){return res}
            msg.addReaction('🫡')
        }
    },
    {
        name:'rm',
        description:'Remove a specific cid',
        permissionLevel:'all',
        aliases:['rm'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let cid = args[0]
            let res = await mod.rm(cid,creator)
            if(res.error){return res}
            msg.addReaction('🫡')
        }
    },
    {
        name: 'wojakify',
        description: 'Create wojaks with prompts or optional face photo attachments',
        permissionLevel:'all',
        aliases:['wojakify','wojak','wojack','w'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: wojakifying '+timestamp()})
            let preprompt = args.join(' ')
            let preset = config?.presets?.lightning
            let model = preset?.model ?? config?.default?.sdxlmodel
            let scale = preset?.scale ?? config?.default.scale
            let steps = preset?.steps
            let newjob = {prompt:preprompt+' wojak+ withLora(wojak_SDXL,0.6) cartoon [photo]', model,scale,steps}
            if(imgres?.img&&imgres?.url){newjob.ipamodel = 'ip-adapter-plus-face_sdxl_vit-h'; newjob.ipamethod='full';newjob.control='ipa';newjob.controlstart=0;newjob.controlend=1;newjob.controlweight=0.85 }
            let job = await invoke.validateJob(newjob)
            job.initimg = img
            job.tracking = {msg:trackingmsg,type:'discord'}
            job.creator=creator
            job = await auth.userAllowedJob(job)
            let result = await invoke.cast(job)
            // inject the original template image url
            if(imgurl && !result.error && result.images?.length > 0){
                debugLog('Attaching input image url to png metadata: '+imgurl)
                result.images[0].buffer = await exif.modify(result.images[0].buffer,'arty','inputImageUrl',imgurl)
            }
            return returnMessageResult(msg,result)
        }
    },
    {
        name: 'pepe',
        description: 'Create pepes with prompts or optional face photo attachments',
        permissionLevel:'all',
        aliases:['pepe'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let img,imgurl
            let imgres = await extractImageAndUrlFromMessageOrReply(msg)
            if(imgres&&imgres?.img&&imgres?.url){img=imgres.img;imgurl=imgres.url}
            let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: creating pepe '+timestamp()})
            let preprompt = args.join(' ')
            let preset = config?.presets?.lightning
            let model = preset?.model ?? config?.default?.sdxlmodel
            let scale = preset?.scale ?? config?.default.scale
            let steps = preset?.steps
            let newjob = {prompt:preprompt+' (pepe):2 withLora(pepexl,1) cartoon [photo]', model,scale,steps}
            if(imgres?.img&&imgres?.url){newjob.ipamodel = 'ip-adapter-plus-face_sdxl_vit-h'; newjob.ipamethod='full';newjob.control='ipa';newjob.controlstart=0;newjob.controlend=1;newjob.controlweight=1 }
            let job = await invoke.validateJob(newjob)
            job.initimg = img
            job.tracking = {msg:trackingmsg,type:'discord'}
            job.creator=creator
            job = await auth.userAllowedJob(job)
            let result = await invoke.cast(job)
            // inject the original template image url
            if(imgurl && !result.error && result.images?.length > 0){
                debugLog('Attaching input image url to png metadata: '+imgurl)
                result.images[0].buffer = await exif.modify(result.images[0].buffer,'arty','inputImageUrl',imgurl)
            }
            return returnMessageResult(msg,result)
        }
    },
    {
        name:'ban',
        description:'Ban user by discord id',
        permissionLevel:'admin',
        aliases:['ban'],
        prefix:'!!!',
        command:async(args,msg,creator)=>{
            let idtoban = args[0]
            if(!idtoban){return {error:'Add a discord id to ban'}}
            debugLog('Ban discord id '+idtoban)
            let result = await User.update({banned:true},{where:{discordID:idtoban}})
            if(result){msg.addReaction('🫡')}
        }
    },
    {
        name:'unban',
        description:'Unan user by discord id',
        permissionLevel:'admin',
        aliases:['unban'],
        prefix:'!!!',
        command:async(args,msg,creator)=>{
            let idtoban = args[0]
            if(!idtoban){return {error:'Add a discord id to ban'}}
            debugLog('Ban discord id '+idtoban)
            let result = await User.update({banned:true},{where:{discordID:idtoban}})
            if(result){msg.addReaction('🫡')}
        }
    },
    {
        name:'exit',
        description:'Exit the process gracefully, letting queue finish first',
        permissionLevel:'admin',
        aliases:['exit'],
        prefix:'!!!',
        command:async(args,msg,creator)=>{
            debugLog('Attempting to exit gracefully after queue is finished')
            let js = invoke.jobStats()
            if (js.pending>0||js.progress>0){
                debugLog('Jobs pending: '+js.pending+' , In progress: '+js.progress)
                // todo loop and recheck until no jobs are in progress or pending then exit asap
            } else {
                process.exit()
            }
        }
    },
    {
        name:'purgeUserRenders',
        description:'Delete all renders for a specific discord id',
        permissionLevel:'admin',
        aliases:['purge'],
        prefix:'!!!',
        command: async(args,msg,creator)=>{
            debugLog('Find and delete all renders for a specific discord id')
            let id = args[0]
            if(!id){return {error:'Add a discord id to purge all images from that user'}}
            let usr = await User.findOne({where:{discordID:id},include:[{model:Pin, as: 'pins'}]})
            if(!usr){return{error:'User not found'}}
            if(!usr.pins){return{error:'No pins found for this user'}}
            let count = usr.pins.length
            //let pinids = usr.pins.map(p=>p.id)
            Pin.update({flags:'d'},{where:{discordID:id}})
            let newMsg = {content:'Purged '+count+' pinned images from '+usr.username}
            return [newMsg]
        }
    },
    {
        name:'qr',
        description:'generate qr codes for input',
        permissionLevel:'admin',
        aliases:['qr'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            let data = args.join(' ')
            let buf = await qrcode.toBuffer(data)
            return {messages:[{content:'`'+data+'`'}],files:[{name:getUUID+'.png',file:buf}]}
        }
    },
    {
        name:'sd3',
        description:'experimental sd3 render via comfyui',
        permissionLevel:'admin',
        aliases:['sd3'],
        prefix:'!',
        command: async(args,msg,creator)=>{
            msg.addReaction('🫡') // salute emoji
            let job = await comfyui.jobFromDream(args)
            job.creator=creator
            let result = await comfyui.cast({job})
            if(result.error){return {error:result.error}}
            let meta = result.meta
            let prompt = meta.prompt ?? 'success'
            return {
                messages:[
                    {
                        content:':brain: <@'+creator.discordid+'>',
                        embeds:[
                            {
                                description:meta.prompt,
                                color:getRandomColorDec()
                            },
                            {
                                description:':straight_ruler: '+meta.width+'x'+meta.height+' :recycle: '+meta.steps+' :eye: '+meta.sampler_name+' ('+meta.scheduler+') :game_die: '+meta.seed+' :scales: '+meta.cfg+' :floppy_disk: '+meta.ckpt_name,
                                color:getRandomColorDec()
                            }
                        ]
                    }
                ],files:[result.images]}
        }
    },
    {
        name: 'refreshcluster',
        description: 'Refresh the list of backend hosts and available models/loras/etc',
        permissionLevel: 'admin',
        aliases: ['refreshcluster', 'rc'],
        prefix: '!!!',
        command: async (args, msg, creator) => {
            const result = await invoke.refreshCluster()
            return {
                messages: [{
                    content: '',
                    embeds: [{
                        description: ':arrows_counterclockwise: Cluster Refresh Results:\n\n' + result,
                        color: getRandomColorDec()
                    }],
                    messageReference: { message_id: msg.id }
                }],
                files: []
            }
        }
    }
]

// generate simple lookup array of all command aliases with prefixes
let prefixes=[]
commands.forEach(c=>{c.aliases.forEach(a=>{prefixes.push(c.prefix+a)})})

parseMsg=async(msg,selfid=null)=>{
    // normalise values between responses in channel and DM
    let creator = getCreatorInfoFromMsg(msg)
    if(!auth.check(creator.discordid,creator.guildid,creator.channelid)){return} // if not authorised, ignore
    if(msg.length===0||msg.content.length===0){return} // if empty message (or just an image) ignore
    let firstword = msg.content.split(' ')[0].toLowerCase()
    if(selfid&&(firstword==='<@'+selfid+'>')){ // todo parse @mention as first word as a command
        debugLog('@mentioned by '+creator.username+' , replace with !dream')
        firstword='!dream'
    }
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
                            if(creator.discordid.toString()!==config.adminID.toString()){
                                log('Denied admin command for '+username)
                                return
                            }
                            break
                        }
                    }
                    log(c.name+' triggered by '+creator.username+' in '+msg.channel.name??creator.channelid+' ('+creator.guildid+')')
                    try{
                        let result = await c.command(args,msg,creator)
                        let messages = result?.messages
                        let files = result?.files
                        let error = result?.error
                        if(error){
                            log('Error: '.bgRed+' '+error)
                            debugLog(error.toString())
                            chat(creator.channelid,{content:'<@'+creator.discordid+'>', embeds:[{title:':warning: Error',description:error.toString(),color:getRandomColorDec()}]})
                            if(result?.tracking?.msg){result.tracking.msg.delete()} // delete tracking message for failed job
                            return
                        }
                        if(!Array.isArray(messages)){messages=[messages]}
                        if(!Array.isArray(files)){files=[files]}
                        // unpack messages array and send each msg seperately
                        // if we have a file for each message, pair them up
                        // if we have multi messages and 1 file, attach to first message only
                        // if there are more files then there are messages attempt to bundle all files on first message
                        messages.forEach((message,index)=>{
                            let file
                            if(index===0&&files.length>messages.length){
                                file=files
                            } else if(files.length>0) {
                                file=files.shift()// grab the top file
                            }
                            if(message&&file){
                                chat(creator.channelid,message,file) // Send message with attachment
                            }else if(message){
                                chat(creator.channelid,message) // Send message, no attachment
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

returnMessageResult = async(msg,result,creator)=>{
    // generic response function for invoke results or errors
    if(result.error){return {error:result.error}}
    messages=[];files=[];error=null
    if(result?.images){
        for (const i in result.images){
            let image=result.images[i]
            let meta=await exif.load(image.buffer)
            if(!creator) creator = getCreatorInfoFromMsg(msg)
            //message = await imageResultMessage(msg.member?.id||msg.author?.id,image,result,meta)
            // Good coverage spot to intercept image result for ipfs pinning
            let ipfsresult = await ipfs.add(image.buffer,creator)
            let cid = ipfsresult.cid
            let filename = 'cid-'+cid+'.png' // hijack filename to identify images later
            message = await imageResultMessage(creator.discordid,image,result,meta,cid)
            messages.push(message)
            files.push({file:image.buffer,name:filename})
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
    // extract a single image buffer from a message
    let buf=null
    for (const a of msg.attachments){
        let validMimetypes=['image/png','image/jpeg','image/jpg','image/webp','image/svg']
        if(validMimetypes.includes(a.content_type)){
            buf = await urlToBuffer(a.proxy_url)
            if(['image/webp','image/svg'].includes(a.content_type)){buf = await imageEdit.convertToPng(buf)}
            break
        }
    }
    return buf
}

extractImageBuffersFromMessage = async (msg)=>{
    // extract multiple buffers from message as an array
    let buf=null
    let bufArr=[]
    for (const a of msg.attachments){
        let validMimetypes=['image/png','image/jpeg','image/jpg','image/webp','image/svg']
        if(validMimetypes.includes(a.content_type)){
            buf = await urlToBuffer(a.proxy_url)
            if(['image/webp','image/svg'].includes(a.content_type)){buf = await imageEdit.convertToPng(buf)}
            bufArr.push(buf)
        }
    }
    return bufArr
}

extractImageUrlFromMessage = async (msg)=>{
    // extract a single image url from a message
    for (const a of msg.attachments){
        let validMimetypes=['image/png','image/jpeg','image/webp']
        if(validMimetypes.includes(a.content_type)){
            return a.proxy_url
        }
    }
}

extractImageUrlsFromMessage = async (msg)=>{
    // extract an array of image urls from a message
    let imgArr=[]
    for (const a of msg.attachments){
        let validMimetypes=['image/png','image/jpeg','image/webp']
        if(validMimetypes.includes(a.content_type)){
            imgArr.push(a.proxy_url)
        }
    }
    return imgArr
}

extractImageCidFromMessageOrReply = async (msg)=>{
    // extract a single image cid from the filename of a message attachment or its parent comment
    let cid,filename
    let regex = /^(cid-)(.*?).png$/
    let validMimetypes=['image/png'] // Only care about png's in this context, direct arty creations
    for (const a of msg.attachments){ // Cycle through first message's attachments
        if(validMimetypes.includes(a.content_type)){ // image found
            let matched = a.filename.match(regex) // check for cid
            if(matched){return matched[2]} // return cid
        }
    }
    // No valid cid's found in message, check parent msg
    if (msg?.messageReference?.messageID){
        let sourcemsg = await bot.getMessage(msg.channel.id, msg.messageReference.messageID)
        for (const a of sourcemsg.attachments){
            if(validMimetypes.includes(a.content_type)){ // image found
                let matched = a.filename.match(regex) // check for cid
                if(matched){return matched[2]} // return cid
            }
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
    // return true or false
    if(msg.attachments?.length>0){
        for (const a of msg.attachments){
            let validMimetypes=['image/png','image/jpeg','image/webp']
            if(validMimetypes.includes(a.content_type)){return true}
        }
        return false
    }else{return false}
}

messageHasTextFileAttachments = (msg)=>{
    // return true or false
    if(msg.attachments?.length>0){
        for (const a of msg.attachments){
            debugLog('Checking mimetype for txt attachment : '+a.content_type)
            let validMimetypes=['text/plain','text/html','application/json','application/json; charset=utf-8','text/csv','application/xml','text/xml','text/css','application/javascript','application/javascript; charset=utf-8','text/javascript','text/markdown','text/sql','text/x-python','text/x-csrc','text/x-shellscript']
            if(validMimetypes.includes(a.content_type)){return true}
        }
        return false
    }else{return false}
}

extractTextFromMessageAttachments = async (msg) =>{
    let txt = ''
    let filename = ''
    let size = 0
    for (const a of msg.attachments){
        let validMimetypes=['text/plain','text/html','application/json','application/json; charset=utf-8','text/csv','application/xml','text/xml','text/css','application/javascript','application/javascript; charset=utf-8','text/javascript','text/markdown','text/sql','text/x-python','text/x-csrc','text/x-shellscript']
        if(validMimetypes.includes(a.content_type)){
            filename=a.filename
            size=size+a.size
            let res = await axios.get(a.url)
            if(Object.prototype.toString.call(res.data) === '[object Object]'){
                //txt=JSON.stringify(res.data)
                txt=res.data.toString()
            } else { txt=res.data }
        }
    }
    return {txt,size,filename}
}

extractTextFileFromMessageOrReply = async(msg)=>{
    // extract a single text based file from a message or reply
    let txtObject
    debugLog(msg)
    if(messageHasTextFileAttachments(msg)){
        //txt = await extractTextFromMessageAttachments(msg)
        txtObject = await extractTextFromMessageAttachments(msg)
        debugLog('Extracted txt attachment from message '+url)
    } else if(msg.messageReference?.messageID) {
        debugLog('getting message reply to check for txt attachments')
        let sourcemsg = await bot.getMessage(msg.channel.id, msg.messageReference.messageID)
        if(messageHasTextFileAttachments(sourcemsg)){
            txtObject = await extractTextFromMessageAttachments(sourcemsg)
            debugLog('Extracted txt attachment from message reply')
        } else {
            debugLog('no txt attachment in reply')
        }
    } else {
        debugLog('unable to extract txt attachment from message or reply')
        txt=''
    }
    return txtObject
}

extractImageAndUrlFromMessageOrReply = async(msg)=>{
    // extract a single image buffer and url from a message or reply
    let img,url
    if(messageHasImageAttachments(msg)){
        img = await extractImageBufferFromMessage(msg)
        url = await extractImageUrlFromMessage(msg)
        debugLog('Extracted image attachment from message '+url)
    } else if(msg.messageReference?.messageID) {
        let sourcemsg = await bot.getMessage(msg.channel.id, msg.messageReference.messageID)
        if(messageHasImageAttachments(sourcemsg)){
            img = await extractImageBufferFromMessage(sourcemsg)
            url = await extractImageUrlFromMessage(sourcemsg)
            debugLog('Extracted image attachment from message reply '+url)
        }
    } else {
        img=null
        url=null
    }
    return {img,url}
}

extractImagesAndUrlsFromMessageOrReply = async(msg)=>{
    // extract multiple image buffers and urls from a message or reply
    let imgs,urls = []
    if(messageHasImageAttachments(msg)){
        imgs = await extractImageBuffersFromMessage(msg)
        urls = await extractImageUrlsFromMessage(msg)
        //debugLog('Extracted image attachments from message:')
        //debugLog(urls)
    } else if(msg.messageReference?.messageID) {
        let sourcemsg = await bot.getMessage(msg.channel.id, msg.messageReference.messageID)
        if(messageHasImageAttachments(sourcemsg)){
            imgs = await extractImageBuffersFromMessage(sourcemsg)
            urls = await extractImageUrlsFromMessage(sourcemsg)
            //debugLog('Extracted image attachments from message reply:')
            //debugLog(urls)
        }
    } else {
        imgs=[]
        urls=[]
    }
    const result = urls.map((url, index) => {
        return { url: url, img: imgs[index] }
    })
    return result
}

getAvatarUrl = async(userId)=>{
    let user = await bot.users.get(userId)
    let avatarHash = user.avatar
    let avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=512`
    return avatarUrl
}

imageResultMessage = async(userid,img,result,meta,cid)=>{
    let p=meta?.invoke?.prompt??'Unable to extract prompt'
    let cost = meta.invoke?.cost??null
    //if(result.job.negative_prompt){p=p+' ['+result.job.negative_prompt+']'}
    let t=''
    if(img.width&&img.height){t+=' :straight_ruler: '+img.width+'x'+img.height}
    //if(img.genWidth&&img.genHeight){t+=' :triangle_ruler: '+img.genWidth+'x'+img.genHeight}
    if(meta.invoke?.steps){t+=' :recycle: '+meta.invoke.steps}
    if(meta.invoke?.scheduler){t+=' :eye: '+meta.invoke.scheduler}
    if(meta.invoke?.seed){t+=' :game_die: '+meta.invoke.seed}
    if(meta.invoke?.scale){t+=' :scales: '+meta.invoke.scale}
    if(meta.invoke?.model){t+=' :floppy_disk: '+meta.invoke.model?.name}
    if(meta.invoke?.clipskip){t+=' :clipboard: '+meta.invoke.clipskip}
    if(meta.invoke?.strength){t+=' :muscle: '+meta.invoke.strength}
    if(meta.invoke?.lscale&&meta.invoke?.lscale!==1){t+=' :mag_right: '+meta.invoke.lscale}
    if(meta.invoke?.loras?.length>0){
        t+=' :pill: '
        for (const l in meta.invoke?.loras){t+=meta.invoke.loras[l].model.name+'('+meta.invoke.loras[l].weight+') '}
    }
    if(meta.invoke?.inputImageUrl){t+=' :paperclip: [img]('+meta.invoke.inputImageUrl+')'}
    if(meta.invoke?.control){t+=' :video_game: '+meta.invoke.control}
    if(meta.invoke?.ipamodel){t+=' '+meta.invoke.ipamodel}
    if(meta.invoke?.ipamethod){t+=' ('+meta.invoke.ipamethod+')'}
    if(meta.invoke?.controlweight){t+=',w:'+meta.invoke.controlweight}
    if(meta.invoke?.controlstart){t+=',s:'+meta.invoke.controlstart}
    if(meta.invoke?.controlend){t+=',e:'+meta.invoke.controlend}
    if(meta.invoke?.facemask){t+=' :performing_arts: facemask'}
    if(meta.invoke?.invert){t+=' inverted'}
    if(meta.invoke?.hrf){t+=' :telescope: hrf'}
    if(meta.invoke?.hrfwidth){t+=' '+meta.invoke.hrfwidth+'x'}
    if(meta.invoke?.hrfheight){t+=meta.invoke.hrfheight}
    if(meta.invoke?.seamlessx===true||meta.invoke?.seamlessy===true){t+=' :knot: '}
    if(meta.invoke?.seamlessx===true){t+='x '}
    if(meta.invoke?.seamlessy===true){t+='y '}
    let colordec=getRandomColorDec()
    let content = ':brain: <@'+userid+'>'
    if(config.credits?.enabled&&cost){
        let balance = await credits.balance(meta.invoke.creator)
        content+=' :coin: '+balance+'(-'+cost+')'
    }
    let newmsg = {
        content:content,
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
                {type:2,style:4,label:'No',custom_id:'remove-'+cid,emoji:{name:'🗑️',id:null},disabled:false}
            ]}
        ],
        allowed_mentions:{users:[userid]}
    }
    // if controlnet is enabled, allow dropdown menu for controlweight changes
    let cnwos = [0,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100]
    let cnwos2 = [...cnwos,125,150,175,200]
    if(meta.invoke?.inputImageUrl&&meta.invoke?.control&&meta.invoke?.controlweight&&meta.invoke?.control!=='i2l'){
        let cnwo = []
        for (const i in cnwos2){
            let o = cnwos2[i]
            let od = (parseFloat(meta.invoke.controlweight).toFixed(2)===(o/100).toFixed(2)) ? 'Selected' : null
            cnwo.push({value:(o/100).toFixed(2),description:od,label:o+'%'})
        }
        newmsg.components.push({type:1,components:[{type: 3,custom_id:'edit-x-controlweight',placeholder:'Controlnet weight '+(parseFloat(meta.invoke.controlweight)*100).toFixed(0)+'%',min_values:1,max_values:1,options:cnwo}]})
    }
    // same for controlstart
    // todo the controlstart check is failing, this never displays
    // faulty logic, meta.invoke.controlstart returns false if value is 0
    if(meta.invoke?.inputImageUrl&&meta.invoke?.control&&meta.invoke?.controlstart&&meta.invoke?.control!=='i2l'){
        let cnwo = []
        for (const i in cnwos){
            let o = cnwos[i]
            let od = (parseFloat(meta.invoke.controlstart).toFixed(2)===(o/100).toFixed(2)) ? 'Selected' : null
            cnwo.push({value:(o/100).toFixed(2),description:od,label:o+'%'})
        }
        newmsg.components.push({type:1,components:[{type: 3,custom_id:'edit-x-controlstart',placeholder:'Controlnet start at '+(parseFloat(meta.invoke.controlstart)*100).toFixed(0)+'%',min_values:1,max_values:1,options:cnwo}]})
    }
    // same for controlend
    if(meta.invoke?.inputImageUrl&&meta.invoke?.control&&meta.invoke?.controlend&&meta.invoke?.control!=='i2l'){
        let cnwo = []
        for (const i in cnwos){
            let o = cnwos[i]
            let od = (parseFloat(meta.invoke.controlend).toFixed(2)===(o/100).toFixed(2)) ? 'Selected' : null
            cnwo.push({value:(o/100).toFixed(2),description:od,label:o+'%'})
        }
        newmsg.components.push({type:1,components:[{type: 3,custom_id:'edit-x-controlend',placeholder:'Controlnet end at '+(parseFloat(meta.invoke.controlend)*100).toFixed(0)+'%',min_values:1,max_values:1,options:cnwo}]})
    }
    // get all available controlnet modes and ipa types for base model
    if(meta.invoke?.inputImageUrl&&meta.invoke?.control){
        let cnwo = []
        let basemodel = meta.invoke.model.base
        //let controltypes = ['ipa','i2l','depth','canny','openpose','qrCodeMonster_v20']
        if(meta.invoke.control==='ipa'){ // if control=ipa, we actually need to modify ipamodel
            let ipatypes = await invoke.allUniqueIpAdaptersAvailable()
            ipatypes = ipatypes.filter(o=>o.base===basemodel).map(o=>o.name)
            for (const i in ipatypes){
                let o = ipatypes[i]
                let od = (meta.invoke.ipamodel===o) ? 'Selected' : null
                cnwo.push({value:o,label:od,label:o})
            }
            if(cnwo.length>0){newmsg.components.push({type:1,components:[{type: 3,custom_id:'edit-x-ipamodel',placeholder:'Ip Adapter: '+meta.invoke.ipamodel,min_values:1,max_values:1,options:cnwo}]})}
        } else { // otherwise assume control is the name of a controlnet
            let controltypes = await invoke.allUniqueControlnetsAvailable()
            controltypes = controltypes.filter(o=>o.base===basemodel).map(o=>o.name)
            for (const i in controltypes){
                let o = controltypes[i]
                let od = (meta.invoke.control===o) ? 'Selected' : null
                cnwo.push({value:o,label:od,label:o})
            }
            if(cnwo.length>0){newmsg.components.push({type:1,components:[{type: 3,custom_id:'edit-x-control',placeholder:'Controlnet: '+meta.invoke.control,min_values:1,max_values:1,options:cnwo}]})}
        }
    }
    return newmsg
}

const checkUserForJob=async(job)=>{
    log('Check user for job')
    log(job.creator)
    // is job errored already
    if(job.error){return job}
    // do they have the funds
    let balance = await credits.balance(job.creator)
    if(balance<job.cost){job.error = 'Insufficient :coin:'; return job}
    // check model type allowed
    let modelAllowed = await auth.userAllowedFeature(job.creator,job.model.base)
    if(modelAllowed){return job}else{job.error=job.model.base+' is for members only';return job}
}

const getCreatorInfoFromMsg=(msg)=>{
    return {discordid:msg.member?.id||msg.author?.id,username:msg.user?.username||msg.member?.username||msg.author?.username,channelid:msg.channel?.id,guildid:msg.guildID||'DM'}
}

const rechargePromptMsg = async()=>{
    let c=[{type:1,components:[]}]
    for (const p in payments.methods){
        let method=payments.methods[p]
        switch(method){
            case 'stripe':c[0].components.push({type: 2, style: 1, label: 'Pay with Stripe / Credit Cards', custom_id: 'recharge-stripe', emoji: { name: '💳', id: null}, disabled: false });break
            case 'lightning':c[0].components.push({type: 2, style: 1, label: 'Pay with BTC Lightning', custom_id: 'recharge-lightning', emoji: { name: '⚡', id: null}, disabled: false });break;
            case 'hive':c[0].components.push({type: 2, style: 1, label: 'Pay with HIVE', custom_id: 'recharge-hive', emoji: { name: 'hive', id: '1110123056501887007'}, disabled: false },);break;
            case 'hbd':c[0].components.push({type: 2, style: 1, label: 'Pay with HBD', custom_id: 'recharge-hbd', emoji: { name: 'hbd', id: '1110282940686016643'}, disabled: false },);break;
            default:break;
        }
    }
    let salespitch = config.credits.salespitch ?? ''
    let newMsg = {flags:64,embeds:[{title:'Recharge',description:salespitch,color:getRandomColorDec()}],components:c}
    return newMsg
}

const balanceMsg = async(creator)=>{
    let balance = await credits.balance(creator)
    let newMsg = {flags:64,embeds:[{description:'**'+creator.username+'** has `'+balance+'` :coin:',color:getRandomColorDec()}]}
    return newMsg
}

module.exports = {
    messageCommands:{
        commands,
        prefixes,
        parseMsg,
        extractImageBufferFromMessage,
        extractImageBuffersFromMessage,
        extractMetadataFromMessage,
        extractImageUrlFromMessage,
        extractImageUrlsFromMessage,
        extractImageCidFromMessageOrReply,
        extractTextFileFromMessageOrReply,
        messageHasImageAttachments,
        returnMessageResult,
        rechargePromptMsg,
        balanceMsg,
    }
}