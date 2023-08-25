const {config,log,debugLog,tidyNumber}=require('../utils.js')
const {bot} = require('./bot.js')
const {auth}=require('./auth')

var commands = [
    {
        name: 'sendResultToGallery',
        description: 'Copy a star result to a gallery channel, if one is configured for that guild',
        permissionLevel: 'all',
        aliases: ['⭐','❤️'],
        command: async (msg,emoji,reactor)=>{
            log(msg);log(emoji);log(reactor)
        }
    },
    {
        name: 'sendResultToNSFWGallery',
        description: 'Move a result to an NSFW gallery channel, if one is configured for that guild',
        permissionLevel: 'all',
        aliases: ['🙈'],
        command: async (msg,emoji,reactor)=>{
            log(msg);log(emoji);log(reactor)
        }
    },
    {
        name: 'sendResultToDirectMessages',
        description: 'Send a result to a user by direct message',
        permissionLevel: 'all',
        aliases: ['✉️'],
        command: async (msg,emoji,reactor)=>{
            log(msg);log(emoji);log(reactor)
        }
    },
    {
        name: 'removeBadResult',
        description: 'Delete a bot message',
        permissionLevels: ['botOwner','guildMod','requester'],
        aliases: ['👎','⚠️','❌','💩'],
        command: async (msg,emoji,reactor)=>{
            try{
                if(parseInt(reactor.user.id)===config.adminID){
                    log('removing result')
                    let reactedmsg = await bot.getMessage(msg.channel.id,msg.id)
                    reactedmsg.delete().catch(() => {})
                } else {
                    log('not removing result, not triggered by creator or admin')
                    log(reactor.user.id)
                    log(config.adminID)
                    //log(msg)
                }
            }catch(err){log(err)}
        }
    }
]
// Quick lookup table for all relevant emoji reactions
let emojis=[]
for (const ci in commands){
    let c=commands[ci]
    for (const a in c.aliases){emojis.push(c.aliases[a])}
}

parse = async(msg,emoji,reactor)=>{
    if(!emojis.includes(emoji.name)) return // Quickly rule out irrelevant emoji reactions
    if(!auth.check(msg.member?.id,msg.guildId,msg.channel?.id)){return} // if not authorised, ignore
    for (const ci in commands){
        let c=commands[ci]
        if(c.aliases.includes(emoji.name)){
            try{
                log('Executing emoji command '+c.name+' for '+reactor?.user?.username)
                result = await c.command(msg,emoji,reactor)
                if(result)log(result)
            }catch(err){log('Error parsing emoji command');log(err)}
        }
    }
    /* Move all of this to either the command or an abstracted function if needed multiple places
    // if we already have msg.author (the msg was already internally cached by eris) we're good to continue
    if (msg?.author){
        targetUserId=reactor?.user?.id
    } else {
        // Otherwise, get it
        try{
            msg=await bot.getMessage(msg.channel.id,msg.id)
            targetUserId=reactor.id // todo investigate: I forget why its a different reference
        }catch(err){log('Discord error fetching message');debugLog(err)}
    }
    // Only process reactions on our own creations
    if(msg?.author?.id!==bot.application.id) return
    let reactorid = reactor.id ? reactor.id : reactor.user.id
    switch(emoji.name){
        case '😂':
        case '👍':
        case '⭐':
        case '❤️': try{sendToGalleryChannel(msg.channel.guild.id, msg.channel.id, msg.id, { content: msg.content, embeds: embeds })}catch(err){};break
        case '✉️': directMessageUser(targetUserId,{content: msg.content, embeds: embeds});break
        case '🙈': if(msg.content.includes(reactorid)||reactorid===config.adminID){try{moveToNSFWChannel(msg.channel.guild.id, msg.channel.id, msg.id, { content: msg.content, embeds: embeds, attachments: msg.attachments, components: msg.components });msg.delete().catch(() => {})}catch(err){log(err)}};break
        case '👎':
        case '⚠️':
        case '❌':
        case '💩': {
        log('Negative emojis'.red+emoji.name.red)
        try{if(msg.content.includes(reactorid)||reactorid===config.adminID){msg.delete().catch(() => {})}}catch(err){log(err)}
        break
        }
    }
    */
}

module.exports = {
    emojiCommands:{
        parse:parse
    }
}