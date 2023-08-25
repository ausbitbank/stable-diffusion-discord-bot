const {config,log,debugLog,getRandomColorDec,shuffle,urlToBuffer}=require('../utils')
const {messageCommands}=require('./messageCommands')
const {exif}=require('../exif')
const {invoke}=require('../invoke')
const {auth}=require('./auth')
const {bot}=require('./bot')

let commands = [
    {
        name: 'refresh',
        description: 'Regenerate an image with the same settings and a new seed',
        permissionLevel: 'all',
        aliases: ['refresh'],
        command: async (interaction)=>{
            log('refresh command')
            let img=null
            if(interaction.message.messageReference?.messageID){
                let parentmsg = await bot.getMessage(interaction.message.messageReference.channelID, interaction.message.messageReference.messageID)
                if(messageCommands.messageHasImageAttachments(parentmsg)){img=await messageCommands.extractImageBufferFromMessage(parentmsg)}
            }
            if(messageCommands.messageHasImageAttachments(interaction.message)){
                let buf = await messageCommands.extractImageBufferFromMessage(interaction.message)
                let meta = await exif.load(buf)
                let result = await invoke.jobFromMeta(meta,img)
                let newmsg = interaction.message
                newmsg.member = interaction.member
                return messageCommands.returnMessageResult(newmsg,result)
            }
        }
    }
]

let prefixes=[]
commands.forEach(c=>{c.aliases.forEach(a=>{prefixes.push(a)})})

parseCommand = async(interaction)=>{
    log('parsing component command')
    //log(interaction)
    if(!auth.check(interaction.member.id,interaction.guildId,interaction.channel?.id)){return} // if not authorised, ignore
    let command = interaction.data.custom_id
    if(prefixes.includes(command)){
        commands.forEach(c=>{
            c.aliases.forEach(async a=>{
                if(command===a){
                    try{
                        await interaction.acknowledge().then(async()=>{
                            log('interaction acknowledged')
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
                                chat(interaction.message.channel.id,message,file) // Send message with attachment
                              }else if(message){
                                chat(interaction.message.channel.id,message) // Send message, no attachment
                              }
                            })
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