const {config,log,debugLog,getRandomColorDec,shuffle,urlToBuffer}=require('../utils')
const {messageCommands}=require('./messageCommands')
const {exif}=require('../exif')
const {invoke}=require('../invoke')
const {auth}=require('./auth')
const {bot}=require('./bot')
const {random}=require('../random')
const { intersection } = require('lodash')

let commands = [
    {
        name: 'refresh',
        description: 'Regenerate an image with the same settings and a new seed',
        permissionLevel: 'all',
        aliases: ['refresh'],
        command: async (interaction)=>{
            interaction.createMessage({content:':saluting_face: refreshing',flags:64})
            let img=null
            // if there is a message reference, and that has an image attachment, use it as an imit img
            if(interaction.message.messageReference?.messageID){
                let parentmsg = await bot.getMessage(interaction.message.messageReference.channelID, interaction.message.messageReference.messageID)
                if(messageCommands.messageHasImageAttachments(parentmsg)){img=await messageCommands.extractImageBufferFromMessage(parentmsg)}
            }
            let meta = await messageCommands.extractMetadataFromMessage(interaction.message)
            let result = await invoke.jobFromMeta(meta,img)
            let newmsg = interaction.message
            newmsg.member = interaction.member
            return messageCommands.returnMessageResult(newmsg,result)
        }
    },
    {
        name: 'edit',
        description: 'Capture a modified setting from a modal dialog and apply it to an existing image',
        permissionLevel: 'all',
        aliases: ['edit'],
        command: async (interaction)=>{
            let msgid = interaction.data.custom_id.split('-')[1]
            let channelid = interaction.channel.id
            let key = interaction.data.components[0].components[0].custom_id
            let value = interaction.data.components[0].components[0].value
            await interaction.createMessage({content:':saluting_face: refreshing with **'+key+'** of `'+value+'`',flags:64})
            switch(key){
                case 'scale':{value=parseFloat(value)}
                case 'steps':{value=parseInt(value)}
                case 'strength':{value=parseFloat(value)}
            }
            let sourcemsg = await bot.getMessage(channelid, msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            debugLog('edit '+key+' to: '+value)
            meta.invoke[key] = value
            let result = await invoke.jobFromMeta(meta,null)
            let newmsg = sourcemsg
            newmsg.member = interaction.member
            return messageCommands.returnMessageResult(newmsg,result)
        }
    },
    {
        name: 'editPrompt',
        description: 'Modal dialog to regenerate an image with a new prompt and seed, with the same settings',
        permissionLevel: 'all',
        aliases: ['editPrompt'],
        command: async (interaction)=>{
            let meta = await messageCommands.extractMetadataFromMessage(interaction.message)
            let prompt = meta.invoke.positive_prompt+' ['+meta.invoke.negative_prompt+']'
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
        command: async (interaction)=>{
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
        command: async (interaction)=>{
            let msgid = interaction.data.custom_id.split('-')[1]
            let channelid = interaction.channel.id
            let sourcemsg = await bot.getMessage(channelid,msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            let scale = meta.invoke.scale
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
        command: async (interaction)=>{
            let msgid = interaction.data.custom_id.split('-')[1]
            let channelid = interaction.channel.id
            let sourcemsg = await bot.getMessage(channelid,msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            let steps = meta.invoke.steps
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
        command: async (interaction)=>{
            let msgid = interaction.data.custom_id.split('-')[1]
            let channelid = interaction.channel.id
            let sourcemsg = await bot.getMessage(channelid,msgid)
            let meta = await messageCommands.extractMetadataFromMessage(sourcemsg)
            let strength = meta.invoke.strength
            log('strength')
            log(meta)
            log(strength)
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
        name: 'tweak',
        description: 'Display tweak menu, as a message only visible to the requester',
        permissionLevel: 'all',
        aliases: ['tweak'],
        command: async (interaction)=>{
            let msgid=interaction.message.id
            let tweakmsg = {
                content: ':test_tube: **Tweak Menu**',
                flags: 64,
                components:[
                    {
                        type:1,
                        components:[
                            {type: 2, style: 1, label: 'Aspect Ratio', custom_id: 'chooseAspect-'+msgid, emoji: { name: '📐', id: null}, disabled: true },
                            {type: 2, style: 1, label: 'Models', custom_id: 'chooseModel-'+msgid, emoji: { name: '💾', id: null}, disabled: true },
                            {type: 2, style: 1, label: 'Textual Inversions', custom_id: 'chooseTi-'+msgid, emoji: { name: '💊', id: null}, disabled: true },
                            {type: 2, style: 1, label: 'Loras', custom_id: 'chooseLora-'+msgid, emoji: { name: '💊', id: null}, disabled: true }        
                    ]},
                    {
                        type:1,
                        components:[
                            {type: 2, style: 1, label: 'Resolution', custom_id: 'editResolution-'+msgid, emoji: { name: '📏', id: null}, disabled: true },
                            {type: 2, style: 1, label: 'Scale', custom_id: 'editScale-'+msgid, emoji: { name: '⚖️', id: null}, disabled: false },
                            {type: 2, style: 1, label: 'Steps', custom_id: 'editSteps-'+msgid, emoji: { name: '♻️', id: null}, disabled: false },
                            {type: 2, style: 1, label: 'Strength', custom_id: 'editStrength-'+msgid, emoji: { name: '💪', id: null}, disabled: true },
                            {type: 2, style: 1, label: 'Sampler', custom_id: 'chooseSampler-'+msgid, emoji: { name: '👁️', id: null}, disabled: true }
                      ]}
                ]
            }
            interaction.createMessage(tweakmsg)
        }
    }
]

let prefixes=[]
commands.forEach(c=>{c.aliases.forEach(a=>{prefixes.push(a)})})

parseCommand = async(interaction)=>{
    if(!auth.check(interaction.member.id,interaction.guildId,interaction.channel?.id)){return} // if not authorised, ignore
    let command = interaction.data.custom_id.split('-')[0]
    if(prefixes.includes(command)){
        commands.forEach(c=>{
            c.aliases.forEach(async a=>{
                if(command===a){
                    try{
                        let result = await c.command(interaction)
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
                            chat(interaction.channel.id,message,file) // Send message with attachment
                            }else if(message){
                            chat(interaction.channel.id,message) // Send message, no attachment
                            }
                        })
                    }catch(e){log(e)}
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
