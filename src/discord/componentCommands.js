const {config,log,debugLog,getRandomColorDec,timestamp,urlToBuffer, getUUID}=require('../utils')
const {messageCommands}=require('./messageCommands')
const {exif}=require('../exif')
const {invoke}=require('../invoke')
const {auth}=require('./auth')
const {bot}=require('./bot')
const {random}=require('../random')
const {imageEdit} = require('../imageEdit')
const {aspectRatio}=require('./aspectRatio')
const {payments} = require('../payments')
const {mod} = require('../mod')
const {qrcode} = require('../qrcode')


let commands = [
    {
        name: 'refresh',
        description: 'Regenerate an image with the same settings and a new seed',
        permissionLevel: 'all',
        aliases: ['refresh'],
        command: async (interaction,creator)=>{
            let trackingmsg = null
            try{
                if(!interaction?.acknowledged){await interaction?.acknowledge()}
                //interaction.message.addReaction('🎲')
                trackingmsg = await bot.createMessage(interaction.channel.id,{content:':saluting_face: refreshing '+timestamp()})
            } catch(err){
                log(err)
            }
            let img=null
            let meta = await messageCommands.extractMetadataFromMessage(interaction.message)
            if(meta.invoke?.inputImageUrl){img = await urlToBuffer(meta.invoke.inputImageUrl)}
            meta.invoke.seed = random.seed()
            let job = await invoke.jobFromMeta(meta,img,{type:'discord',msg:trackingmsg})
            job.creator = await getCreatorInfoFromInteraction(interaction)
            job = await auth.userAllowedJob(job)
            let result = await invoke.cast(job)
            if(job.error){return job}
            if(meta.invoke?.inputImageUrl && !result.error && result.images?.length > 0){result.images[0].buffer = await exif.modify(result.images[0].buffer,'arty','inputImageUrl',meta.invoke.inputImageUrl)}
            let newmsg = interaction.message
            newmsg.member = interaction.member
            return messageCommands.returnMessageResult(newmsg,result,creator)
        }
    },
    {
        name: 'edit',
        description: 'Capture a modified setting from a modal dialog and apply it to an existing image',
        permissionLevel: 'all',
        aliases: ['edit'],
        command: async (interaction,creator)=>{
            if(!interaction?.acknowledged){await interaction?.acknowledge()}
            let msgid = (interaction.data.custom_id.split('-')[1]==='x')?interaction.message.id : interaction.data.custom_id.split('-')[1]
            let channelid = interaction.channel.id
            let img = null
            // todo arty1 templates are sending edit component commands with no key or interaction.data.components
            // Send update notice and tell to use /dream ?
            let key = interaction.data.custom_id.split('-')[2]??interaction.data.components[0].components[0].custom_id
            if(!key){debugLog('Someone trying to use an old arty1 template ?')}
            let value = interaction.data.custom_id.split('-')[2]?interaction.data.values[0]:interaction.data.components[0].components[0].value
            let trackingmsg = null
            trackingmsg = await bot.createMessage(channelid,{content:':saluting_face: refreshing with **'+key+'** of `'+value.substring(0,1000)+'` '+timestamp()})
            switch(key){
                case 'scale':{value=parseFloat(value);break}
                case 'steps':{value=parseInt(value);break}
                case 'strength':{value=parseFloat(value);break}
            }
            let sourcemsg = await bot.getMessage(channelid, msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            debugLog(creator.username+' edit '+key+' to: '+value)
            if(meta.invoke){meta.invoke[key] = value}
            if(meta.invoke?.inputImageUrl){img = await urlToBuffer(meta.invoke.inputImageUrl)}
            let job = await invoke.jobFromMeta(meta,img,{type:'discord',msg:trackingmsg})
            job.creator = await getCreatorInfoFromInteraction(interaction)
            job = await auth.userAllowedJob(job)
            let result = await invoke.cast(job)
            if(meta.invoke?.inputImageUrl && !result.error && result.images?.length > 0){result.images[0].buffer = await exif.modify(result.images[0].buffer,'arty','inputImageUrl',meta.invoke.inputImageUrl)}
            let newmsg = sourcemsg
            newmsg.member = interaction.member
            return messageCommands.returnMessageResult(newmsg,result,creator)
        }
    },
    {
        name: 'editResolution',
        description: 'Capture a resolution from a modal dialog and apply it as width and height to an existing image',
        permissionLevel: 'all',
        aliases: ['editResolution'],
        command: async (interaction,creator)=>{
            let msgid = interaction.data.custom_id.split('-')[1]
            let channelid = interaction.channel.id
            let img = null
            let key = interaction.data.components[0].components[0].custom_id
            let value = interaction.data.components[0].components[0].value
            let trackingmsg = null
            trackingmsg = await bot.createMessage(channelid,{content:':saluting_face: refreshing with **'+key+'** of `'+value.substring(0,1000)+'` '+timestamp()})
            let sourcemsg = await bot.getMessage(channelid, msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            debugLog(interaction.member?.username||interaction.author?.username||interaction.user?.username+' edit '+key+' to: '+value)
            if(meta.invoke){
                let w=value.split('x')[0]
                let h=value.split('x')[1]
                meta.invoke.width = w
                meta.invoke.height = h
            }
            if(meta.invoke?.inputImageUrl){img = await urlToBuffer(meta.invoke.inputImageUrl)}
            let job = await invoke.jobFromMeta(meta,img,{type:'discord',msg:trackingmsg})
            job.creator = creator
            //job.creator = await getCreatorInfoFromInteraction(interaction)
            job = await auth.userAllowedJob(job)
            let result = await invoke.cast(job)
            if(meta.invoke?.inputImageUrl && !result.error && result.images?.length > 0){result.images[0].buffer = await exif.modify(result.images[0].buffer,'arty','inputImageUrl',meta.invoke.inputImageUrl)}
            let newmsg = sourcemsg
            newmsg.member = interaction.member
            return messageCommands.returnMessageResult(newmsg,result,creator)
        }
    },
    {
        name: 'editPrompt',
        description: 'Modal dialog to regenerate an image with a new prompt and seed, with the same settings',
        permissionLevel: 'all',
        aliases: ['editPrompt'],
        command: async (interaction,creator)=>{
            if(!interaction?.acknowledged){await interaction.acknowledge}
            let meta = await messageCommands.extractMetadataFromMessage(interaction.message)
            let prompt = meta.invoke?.prompt
            //if(meta.invoke?.negative_prompt){prompt=prompt+' ['+meta.invoke?.negative_prompt+']'}
            return interaction.createModal({
                custom_id:'edit-'+interaction.message.id,
                title:'Edit the random prompt?',
                components:[
                    {type:1,components:[
                        {
                            type:4,
                            custom_id:'prompt',
                            label:'Prompt',
                            style:2,
                            value:prompt,
                            required:true
                        }
                    ]}
                ]
            })
        }
    },
    {
        name: 'editPromptRandom',
        description: 'Modal dialog to regenerate an image with a new random prompt and seed, with the same settings',
        permissionLevel: 'all',
        aliases: ['editPromptRandom'],
        command: async (interaction,creator)=>{
            let prompt = random.get('prompt')
            return interaction.createModal({
                custom_id:'edit-'+interaction.message.id,
                title:'Edit the random prompt?',
                components:[
                    {type:1,components:[
                        {
                            type:4,
                            custom_id:'prompt',
                            label:'Prompt',
                            style:2,
                            value:prompt,
                            required:true
                        }
                    ]}
                ]
            })
        }
    },
    {
        name: 'editScale',
        description: 'Modal dialog to regenerate an image with a new scale and seed, with the same settings',
        permissionLevel: 'all',
        aliases: ['editScale'],
        command: async (interaction,creator)=>{
            if(!interaction.acknowledged){await interaction.acknowledge}
            let msgid = interaction.data.custom_id.split('-')[1]
            let channelid = interaction.channel.id
            let sourcemsg = await bot.getMessage(channelid,msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            let scale = meta.invoke.scale.toString()
            return interaction.createModal({
                custom_id:'edit-'+sourcemsg.id,
                title:'Edit the scale / cfg_scale',
                components:[
                    {type:1,components:[
                        {
                            type:4,
                            custom_id:'scale',
                            label:'Scale',
                            style:2,
                            value:scale,
                            required:true
                        }
                    ]}
                ]
            })
        }
    },
    {
        name: 'editSteps',
        description: 'Modal dialog to regenerate an image with a new step count and seed, with the same settings',
        permissionLevel: 'all',
        aliases: ['editSteps'],
        command: async (interaction,creator)=>{
            let msgid = interaction.data.custom_id.split('-')[1]
            let channelid = interaction.channel.id
            let sourcemsg = await bot.getMessage(channelid,msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            let steps = meta.invoke.steps.toString()
            return interaction.createModal({
                custom_id:'edit-'+sourcemsg.id,
                title:'Edit the step count',
                components:[
                    {type:1,components:[
                        {
                            type:4,
                            custom_id:'steps',
                            label:'Steps',
                            style:2,
                            value:steps,
                            required:true
                        }
                    ]}
                ]
            })
        }
    },
    {
        name: 'editStrength',
        description: 'Modal dialog to regenerate an image with a new strength and seed, with the same settings',
        permissionLevel: 'all',
        aliases: ['editStrength'],
        command: async (interaction,creator)=>{
            if(!interaction.acknowledged){await interaction.acknowledge}
            let msgid = interaction.data.custom_id.split('-')[1]
            let channelid = interaction.channel.id
            let sourcemsg = await bot.getMessage(channelid,msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            let strength = meta.invoke.strength??config.default.strength
            strength = strength.toString()
            //let strength = config?.default?.strength?.toString()||'0.7'
            return interaction.createModal({
                custom_id:'edit-'+sourcemsg.id,
                title:'Edit the strength',
                components:[
                    {type:1,components:[
                        {
                            type:4,
                            custom_id:'strength',
                            label:'Strength',
                            style:2,
                            value:strength,
                            required:true
                        }
                    ]}
                ]
            })
        }
    },
    {
        name: 'chooseResolution',
        description: 'Modal dialog to regenerate an image with a new resolution and seed, with the same settings',
        permissionLevel: 'all',
        aliases: ['chooseResolution'],
        command: async (interaction,creator)=>{
            let msgid = interaction.data.custom_id.split('-')[1]
            let channelid = interaction.channel.id
            let sourcemsg = await bot.getMessage(channelid,msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            let resolution = meta.invoke.width+'x'+meta.invoke.height
            //let strength = config?.default?.strength?.toString()||'0.7'
            //strength = strength.toString()
            return interaction.createModal({
                custom_id:'edit-'+sourcemsg.id,
                title:'Edit the resolution',
                components:[
                    {type:1,components:[
                        {
                            type:4,
                            custom_id:'editResolution',
                            label:'Resolution',
                            style:2,
                            value:resolution,
                            required:true
                        }
                    ]}
                ]
            })
        }
    },
    {
        name: 'tweak',
        description: 'Display tweak menu, as a message only visible to the requester',
        permissionLevel: 'all',
        aliases: ['tweak'],
        command: async (interaction,creator)=>{
            let msgid=interaction.message.id
            let tweakmsg = {
                content: ':test_tube: **Tweak Menu**',
                flags: 64,
                components:[
                    {
                        type:1,
                        components:[
                            {type: 2, style: 1, label: 'Aspect Ratio', custom_id: 'chooseAspectRatio-'+msgid, emoji: { name: '📐', id: null}, disabled: false },
                            {type: 2, style: 1, label: 'Models', custom_id: 'chooseModel-'+msgid, emoji: { name: '💾', id: null}, disabled: false },
                            //{type: 2, style: 1, label: 'Textual Inversions', custom_id: 'chooseTi-'+msgid, emoji: { name: '💊', id: null}, disabled: true },
                            //{type: 2, style: 1, label: 'Loras', custom_id: 'chooseLora-'+msgid, emoji: { name: '💊', id: null}, disabled: true },
                            //{type: 2, style: 1, label: 'Control', custom_id: 'chooseControl-'+msgid, emoji: { name: '🎮', id: null}, disabled: true },
                    ]},
                    {
                        type:1,
                        components:[
                            //{type: 2, style: 1, label: 'Resolution', custom_id: 'chooseResolution-'+msgid, emoji: { name: '📏', id: null}, disabled: true },
                            {type: 2, style: 1, label: 'Scale', custom_id: 'editScale-'+msgid, emoji: { name: '⚖️', id: null}, disabled: false },
                            {type: 2, style: 1, label: 'Steps', custom_id: 'editSteps-'+msgid, emoji: { name: '♻️', id: null}, disabled: false },
                            {type: 2, style: 1, label: 'Strength', custom_id: 'editStrength-'+msgid, emoji: { name: '💪', id: null}, disabled: false },
                            {type: 2, style: 1, label: 'Sampler', custom_id: 'chooseSampler-'+msgid, emoji: { name: '👁️', id: null}, disabled: false }
                    ]},
                    {
                        type:1,
                        components:[
                            {type: 2, style: 1, label: 'Remove Background', custom_id: 'removeBackground-'+msgid, emoji: { name: '🪄', id: null}, disabled: false },
                            {type: 2, style: 1, label: 'Upscale', custom_id: 'upscale-'+msgid, emoji: { name: '🪄', id: null}, disabled: false }
                    ]}
                ]
            }
            // todo Add dropdown menus for presets from config file
            if(config.presets){
                let options = []
                for (const p in config.presets){
                    let pd = config.presets[p]
                    options.push({
                        label:p,
                        value:p,
                        description:pd.description,
                        emoji:null
                    })
                }
                let dropdown = {
                    type: 1,
                    components:[
                        {
                            type: 3,
                            custom_id: 'edit-'+msgid+'-preset',
                            placeholder: 'Quality Presets',
                            min_values: 1,
                            max_values: 1,
                            options: options
                        }
                    ]
                }
                tweakmsg.components.unshift(dropdown)
            }
            
            interaction.createMessage(tweakmsg)
        }
    },
{
    name: 'chooseModel',
    description: 'Select a model from a dialog and apply it to an image',
    permissionLevel: 'all',
    aliases: ['chooseModel'],
    command: async (interaction,creator) => {
        // todo make a general purpose function that pages data as needed = 5 dropdowns per page / 25 options per dropdown 
        let msgid = interaction.data.custom_id.split('-')[1]
        let models = await invoke.allUniqueModelsAvailable()
        if (interaction.data.values) {
            if (!interaction.acknowledged) {
                await interaction?.acknowledge()
            }
            let newmodelname = interaction.data.values[0]
            debugLog('Changing model to ' + newmodelname)
            let trackingmsg = await bot.createMessage(interaction.channel.id, { content: ':saluting_face: Changing model to ' + newmodelname+' '+timestamp(), embeds: [], components: [] })
            let channelid = interaction.channel.id
            let sourcemsg = await bot.getMessage(channelid, msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            let newmodel = models.find(m => m.name === newmodelname) // undefined ?
            if (meta.invoke?.model?.base !== newmodel?.base) { // changing base model class (sd1 to sdxl etc)
                let ar = await aspectRatio.resToRatio(meta.invoke?.width, meta.invoke?.height)
                let newpixels = newmodel?.base === 'sdxl' ? 1048576 : 262144 // 1024x1024 for sdxl, 512x512 for sd1/2
                let newres = await aspectRatio.ratioToRes(ar, newpixels)
                if (meta.invoke && newmodel) {
                    meta.invoke.width = newres?.width
                    meta.invoke.height = newres?.height
                }
                // unset ipamodel when switching base class, leave control set to ipa so it autodetects new default ipa for base class
                if(meta.invoke.control==='ipa'&&meta.invoke.ipamodel){delete meta.invoke.ipamodel;delete meta.invoke.control}
            }
            if (meta.invoke) {
                meta.invoke.model = newmodelname
            }
            let img = null
            if (meta.invoke?.inputImageUrl) {
                img = await urlToBuffer(meta.invoke.inputImageUrl)
            }
            //let result = await invoke.jobFromMeta(meta, img, { type: 'discord', msg: trackingmsg })
            let job = await invoke.jobFromMeta(meta, img, { type: 'discord', msg: trackingmsg })
            job.creator = await getCreatorInfoFromInteraction(interaction)
            job = await auth.userAllowedJob(job)
            let result = await invoke.cast(job)
            if (meta.invoke?.inputImageUrl && !result.error && result.images?.length > 0) {
                result.images[0].buffer = await exif.modify(result.images[0].buffer, 'arty', 'inputImageUrl', meta.invoke.inputImageUrl)
            }
            let newmsg = sourcemsg
            newmsg.member = interaction.member
            return messageCommands.returnMessageResult(newmsg, result,creator)
        }
        let categories = {
            'sd-1': [],
            'sd-2': [],
            'sdxl': []
        }
        for (const i in models) {
            let m = models[i]
            if (m.type === 'main') {
                switch (m.base) {
                    case 'sd-1': {
                        categories['sd-1'].push({
                            label: m.name?.substring(0, 50),
                            value: m.name,
                            description: m.description?.substring(0, 50),
                            emoji: null
                        })
                        break
                    }
                    case 'sd-2': {
                        categories['sd-2'].push({
                            label: m.name?.substring(0, 50),
                            value: m.name,
                            description: m.description?.substring(0, 50),
                            emoji: null
                        })
                        break
                    }
                    case 'sdxl': {
                        categories['sdxl'].push({
                            label: m.name?.substring(0, 50),
                            value: m.name,
                            description: m.description?.substring(0, 50),
                            emoji: null
                        })
                        break
                    }
                }
            }
        }

        let components = []
        let dropdownCount = 0
        let optionsCount = 0
        let options = []

        for (const category in categories) {
            const categoryOptions = categories[category]
            let dropdownIndex = 1 // start from 1 for first dropdown
            for (let i = 0; i < categoryOptions.length; i++) {
                options.push(categoryOptions[i])
                optionsCount++
                if (optionsCount === 25 || (i === categoryOptions.length - 1 && optionsCount > 0)) {
                    const dropdownLabel = dropdownIndex === 1 ? `${category} models` : `${category} models ${dropdownIndex}`;
                    let menu = {
                        type: 1,
                        components: [{
                            type: 3,
                            custom_id: `chooseModel-${msgid}-${category}-${dropdownIndex}`,
                            placeholder: dropdownLabel,
                            min_values: 1,
                            max_values: 1,
                            options: options
                        }]
                    };
                    components.push(menu);
                    options = []
                    optionsCount = 0
                    dropdownCount++
                    dropdownIndex++
                }
            }
        }
        let dialog = {
            content: ':floppy_disk: **Model Menu**\nUse this menu to change the model/checkpoint being used, to give your image a specific style',
            flags: 64,
            components: components.slice(0, 5) // Limit to 5 dropdown menus per message
        }
        try {
            interaction.editParent(dialog)
        } catch (err) {
            log(err)
            return { error: err }
        }
        }
    },
    {
        name: 'chooseControl',
        description: 'Add, remove and configure control adapters',
        permissionLevel: ['all'],
        aliases: ['chooseControl'],
        command: async (interaction,creator)=>{
            if(!interaction.acknowledged){await interaction?.acknowledge()}
            let msgid = interaction.data.custom_id.split('-')[1]
            // At first, keep it simple and allow configuring a single control adapter by name
            // need to discover current if base model is sdxl or not
            // pull image meta
            let channelid = interaction.channel.id
            let sourcemsg = await bot.getMessage(channelid,msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            let base = meta?.invoke?.model?.base
            debugLog(base)
            debugLog(meta?.invoke?.inputImageUrl)
            debugLog(meta?.invoke?.inputImageUrl)
            // get all controlnet types
            let cnets = await invoke.allUniqueControlnetsAvailable()
            // reduce to simple array of names of relevant models
            cnets = cnets.filter(c=>c.base===base).map(c=>c.name)
            // get all ip adapter types
            let ipa = await invoke.allUniqueIpAdaptersAvailable()
            ipa = ipa.filter(c=>c.base===base).map(c=>c.name)
        }
    },
    {
        name: 'remove',
        description: 'Allow either the creator or bot admin to remove a result',
        permissionLevel: ['all'],
        aliases: ['remove'],
        command: async (interaction,creator)=>{
            if(!interaction.acknowledged){await interaction?.acknowledge()}
            let msgid=interaction.message.id
            let msg=await bot.getMessage(interaction.channel.id,msgid)
            // should immediately delete for admin, creator, guild admin
            // otherwise add 🗑️ emoji if not already existing 
            // and tell user to click it to confirm their vote for removal

            // Downvote result
            //debugLog(interaction)
            let cid = await messageCommands.extractImageCidFromMessageOrReply(msg)
            if(cid){await mod.downvote(cid,creator)}
            
            if(
                (interaction.member?.id===config.adminID)|| // admin
                (msg.mentions.length>0&&interaction.member?.id===msg.mentions[0].id) // creator
                ){
                // admin or owner can delete
                // tag the original request so its obvious what happened
                if(interaction.message.messageReference&&interaction.message.messageReference.messageID!==null){
                    try{
                        let sourcemsg = await bot.getMessage(interaction.channel.id,interaction.message.messageReference.messageID)
                        if(sourcemsg.member.id!==bot.application.id){sourcemsg.addReaction('🗑️')}
                    } catch(err){log(err)}
                }
                try{await msg?.delete()}catch(err){debugLog('Discord error removing message');debugLog(err)}
            } else {
                // otherwise make them show their vote
                try{
                    msg.addReaction('🗑️')
                } catch (err) {
                    debugLog('Emoji command remove failed')
                    debugLog(err)
                }
            }
        }
    },
    {
        name: 'removeBackground',
        description: 'Remove the background from an image using rembg',
        permissionLevel: ['all'],
        aliases: ['removeBackground'],
        command: async (interaction,creator)=>{
            let trackingmsg = interaction.editParent({content:':saluting_face: Removing background '+timestamp(),embeds:[],components:[]})
            //interaction.acknowledge()
            debugLog(creator)
            let userid = interaction.member?.id||interaction.author?.id||interaction.user?.id
            let channelid = interaction.channel.id
            let msgid=interaction.data.custom_id.split('-')[1]
            let msg=await bot.getMessage(channelid,msgid)
            if(messageCommands.messageHasImageAttachments(msg)){
                //let url = await messageCommands.extractImageUrlFromMessage(msg)
                //let response = await removeBackground(url)
                let img = await messageCommands.extractImageBufferFromMessage(msg)
                if(img){
                    //let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Removing background '+timestamp()})
                    let result = await invoke.processImage(img,null,'removebg',{type:'discord',msg:trackingmsg},creator)
                    if(result?.images?.length>0){
                        let buf = result.images[0]?.buffer
                        reply = {
                            content:'',
                            embeds:[{description:'<@'+userid+'> removed image background',color:getRandomColorDec()}],
                            components:[]
                        }
                        interaction.createMessage(reply,{file:buf,name:getUUID()+'.png'})
                    }
                }
            }
        }
    },
    {
        name: 'upscale',
        description: 'Upscale an image',
        permissionLevel: ['all'],
        aliases: ['upscale'],
        command: async (interaction,creator)=>{
            let trackingmsg = await interaction.editParent({content:':saluting_face: Upscaling '+timestamp(),embeds:[],components:[]})
            let userid = interaction.member?.id||interaction.author?.id||interaction.user?.id
            let channelid = interaction.channel.id
            let msgid=interaction.data.custom_id.split('-')[1]
            let msg=await bot.getMessage(channelid,msgid)
            let model_name = 'RealESRGAN_x2plus.pth'
            if(messageCommands.messageHasImageAttachments(msg)){
                let img = await messageCommands.extractImageBufferFromMessage(msg)
                if(img){
                    //let trackingmsg = await bot.createMessage(creator.channelid,{content:':saluting_face: Upscaling image '+timestamp()})
                    let result = await invoke.processImage(img,null,'esrgan',{model_name},{type:'discord',msg:trackingmsg},creator)
                    if(result?.images?.length>0){
                        let buf = result.images[0]?.buffer
                        let resolution = await imageEdit.getResolution(buf)
                        let newWidth = resolution?.width
                        let newHeight = resolution?.height
                        reply = {
                            content:'',
                            embeds:[{description:'<@'+userid+'> Upscaled with '+model_name+' to '+newWidth+' x '+newHeight,color:getRandomColorDec()}],
                            components:[]
                        }
                        interaction.createMessage(reply,{file:buf,name:getUUID()+'.png'})
                    }
                }
            }
        }
    },
    {
        name:'chooseAspectRatio',
        description: 'Dialog to select an aspect ratio',
        permissionLevel:['all'],
        aliases:['chooseAspectRatio'],
        command: async (interaction,creator)=>{
            let msgid = interaction.data.custom_id.split('-')[1]
            let msg=await bot.getMessage(interaction.channel.id,msgid)
            if(messageCommands.messageHasImageAttachments(msg)){
                let meta = await messageCommands.extractMetadataFromMessage(msg)
                let height = meta?.invoke?.height ?? meta?.invoke?.genHeight
                let width = meta?.invoke?.width ?? meta?.invoke?.genWidth
                if(meta && meta.invoke && width && height){
                    let pixels = parseInt(height) * parseInt(width)
                    if(interaction.data.values){
                        if(interaction.acknowledged===false){await interaction.acknowledge()}
                        let res = await aspectRatio.ratioToRes(interaction.data.values[0],pixels)
                        // interaction.channel.createMessage does not work in DM
                        //let trackingmsg = await interaction.channel.createMessage({content:':saluting_face: '+res.description+' '+res.width+' x '+res.height+' selected',components:[],embeds:[]})
                        let trackingmsg = await bot.createMessage(msg.channel.id,{content:':saluting_face: '+res.description+' '+res.width+' x '+res.height+' selected '+timestamp(),components:[],embeds:[]})
                        meta.invoke.width = res.width
                        meta.invoke.height = res.height
                        let img = null
                        if(meta.invoke?.inputImageUrl){img = await urlToBuffer(meta.invoke.inputImageUrl)}
                        //let result = await invoke.jobFromMeta(meta,img,{type:'discord',msg:trackingmsg})
                        let job = await invoke.jobFromMeta(meta,img,{type:'discord',msg:trackingmsg})
                        job.creator = await getCreatorInfoFromInteraction(interaction)
                        job = await auth.userAllowedJob(job)
                        let result = await invoke.cast(job)
                        if(meta.invoke?.inputImageUrl && !result.error && result.images?.length > 0){result.images[0].buffer = await exif.modify(result.images[0].buffer,'arty','inputImageUrl',meta.invoke.inputImageUrl)}
                        let newmsg = msg
                        newmsg.member = interaction.member
                        return messageCommands.returnMessageResult(newmsg,result,creator)
                    } else { //if (interaction)
                        // Still fails randomly with DiscordRESTError Unknown Interaction and crashes bot despite the try/catch
                        let dialog = await aspectRatio.dialog(msgid,pixels)
                        try{
                            interaction.editParent(dialog)
                        } catch (err) {
                            log(err)
                        }
                    }
                }
            }
        }
    },
    {
        name:'chooseSampler',
        description:'Collect a scheduler / sampler choice from the user via a dropdown menu',
        permissionLevel: ['all'],
        aliases: ['chooseSampler'],
        command: async (interaction,creator)=>{
            let msgid = interaction.data.custom_id.split('-')[1]
            if(interaction.data.values){
                // capture a response instead of asking for one
                if(!interaction.acknowledged){await interaction?.acknowledge()}
                let channelid = interaction.channel.id
                let trackingmsg = await bot.createMessage(channelid,{content:':saluting_face: refreshing with **Scheduler** of `'+interaction.data.values[0]+'` '+timestamp()})
                let sourcemsg = await bot.getMessage(channelid,msgid)
                let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
                let img = null
                meta.invoke.scheduler = interaction.data.values[0]
                if(meta.invoke.inputImageUrl){img = await urlToBuffer(meta.invoke.inputImageUrl)}
                //let result = await invoke.jobFromMeta(meta,img,{type:'discord',msg:trackingmsg})
                let job = await invoke.jobFromMeta(meta,img,{type:'discord',msg:trackingmsg})
                job.creator = await getCreatorInfoFromInteraction(interaction)
                job = await auth.userAllowedJob(job)
                let result = await invoke.cast(job)
                if(meta.invoke.inputImageUrl && !result.error && result.images?.length > 0){result.images[0].buffer = await exif.modify(result.images[0].buffer,'arty','inputImageUrl',meta.invoke.inputImageUrl)}
                let newmsg = interaction.message
                newmsg.member = interaction.member
                newmsg.message_reference=null
                newmsg.messageReference=null
                return messageCommands.returnMessageResult(newmsg,result,creator)    
            }
            var changeSamplerResponse={
                content:':eye: **Sampler / Scheduler Menu**\nUse this menu to change the sampler being used',
                flags:64,
                components:[
                    {
                        type:1,
                        components:[
                            {
                                type: 3,
                                custom_id:'chooseSampler-'+msgid,
                                placeholder:'Choose a sampler / scheduler',
                                min_values:1,
                                max_values:1,
                                options:[]
                            }
                        ]
                    }
                ]
            }
            config.schedulers.forEach((s)=>{
                changeSamplerResponse.components[0].components[0].options.push({label: s,value: s})
            })
            return interaction.editParent(changeSamplerResponse)//.then((r)=>{}).catch((e)=>{console.error(e)})
        }
    },
    {
        name:'cancelBatch',
        description:'Cancel a specific batchid',
        permissionLevel:['all'],
        aliases:['cancelBatch'], // aliases wont work here
        command: async(interaction)=>{
            // Ideally this should only respond to cancel requests from original creator, or bot admin
            // keep it simple for initial version
            // extract batchid from commmand id
            let requester = await getCreatorInfoFromInteraction(interaction)
            let userid = requester.discordid
            if(!interaction?.acknowledged){await interaction?.acknowledge()}
            let batchid = interaction.data.custom_id.replace('cancelBatch-','')
            // todo auth gating here
            if(userid.toString()===config?.adminID.toString()){
                let response = await invoke.cancelBatch(batchid)
                log(response)
            } else {
                log('Rejected cancel attempt - not admin')
                log(interaction?.user?.id)
                log(config.adminID)
            }
        }
    },
    {
        name:'recharge',
        description:'Trigger a private dialog box with recharge payment information',
        permissionLevel:['all'],
        aliases:['recharge'],
        command: async(interaction,creator)=>{
            amount = 5
            let rechargetype = interaction.data.custom_id.split('-')[1] ?? 'all'
            //debugLog(interaction)
            if(interaction?.acknowledged===false){
                //debugLog('interaction not acknowledged, doing that now')
                await interaction.acknowledge()
            }
            let paymentmethods = await payments.request(creator.discordid,amount,rechargetype)
            debugLog(paymentmethods)
            if(!paymentmethods){return {error:'No payment methods configured'}}
            let newMsg = {content:'', flags:64, embeds:[]}
            let files = []
            for (const p in paymentmethods){
                let pi = paymentmethods[p]
                let ne = {
                    title:pi.type,
                    description:pi.description+'\n\n`'+pi.uri+'`',
                    color:getRandomColorDec()
                }
                if(pi.uri&&!pi.qruri){
                    let buf = await qrcode.toBuffer('URL:'+pi.uri)
                    files.push({name:getUUID+'.png',file:buf})
                }
                if(pi.uri?.startsWith('http')){ne.url=pi.uri} // discord blocks anything but http/https , need to use qrcode or a proxy service to bypass this limitation
                if(pi.qruri?.startsWith('http')){ne.image={url:pi.qruri}} // discord also blocks dataurls
                newMsg.embeds.push(ne)
            }
            interaction.createMessage(newMsg,files)
        }
    }
]

let prefixes=[]
commands.forEach(c=>{c.aliases.forEach(a=>{prefixes.push(a)})})

getCreatorInfoFromInteraction = async(interaction)=>{
    let discordid = interaction.member?.id??interaction.author?.id??interaction.user?.id
    let username = interaction.user?.username??interaction.member?.username??interaction.author?.username
    let channelid = interaction.channel.id
    let guildid = interaction.guildID??'DM'
    return {discordid:discordid,username:username,channelid:channelid,guildid:guildid}
}

parseCommand = async(interaction)=>{
    let creator = await getCreatorInfoFromInteraction(interaction)
    if(!auth.check(creator.discordid,creator.guildid,creator.channelid)){return}
    let command = interaction.data.custom_id.split('-')[0]
    if(prefixes.includes(command)){
        commands.forEach(c=>{
            c.aliases.forEach(async a=>{
                if(command===a){
                    try{
                        // todo multi-tier permissions system
                        switch(c.permissionLevel){
                            case 'all':{break} // k fine
                            case 'admin':{
                                if(parseInt(creator.discordid)!==config.adminID){
                                    log('Denied admin command for '+creator.username)
                                    return
                                }
                                break
                            }
                            case 'creator':{
                                // todo need creator discord id
                                break
                            }
                        }
                        log(c.name+' triggered by '+creator.username+' in '+creator.channelid+' ('+creator.guildid||'DM'+')')
                        let result
                        try{result = await c.command(interaction,creator)
                        } catch(err){log(err)}
                        let messages = result?.messages
                        let files = result?.files
                        let error = result?.error
                        if(error){
                            log('Error: '.bgRed+' '+error)
                            interaction.createMessage({title:':warning: Error',content:error})
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
                                chat(creator.channelid,message,file) // Send message with attachment
                            }else if(message){
                                chat(creator.channelid,message) // Send message, no attachment
                            }
                        })
                    }catch(e){log('error in componentCommands\\parseCmd');log(e)}
                }
            })
        })
    } else {
        return interaction.createMessage({content:'Command does not exist', flags:64}).catch((e) => {
            log('command does not exist'.bgRed)
            log(e)
        })
    }
}

module.exports = {
    componentCommands:{
        commands,
        prefixes,
        parseCommand
    }
}
