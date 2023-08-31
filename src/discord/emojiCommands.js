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
            try{
                sendToStarGallery(servid,channelid,msgid,msg)
            } catch (err) {
                log(err)
            }
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
        permissionLevels: ['owner','guildMod','admin'],
        aliases: ['👎','⚠️','❌','💩','🗑️'],
        command: async (msg,emoji,reactor)=>{
            try{
                let reactedmsg = await bot.getMessage(msg.channel.id,msg.id)
                // only care about messages created by the bot or people reacting to their own messages
                if(
                    (reactedmsg.member.id!==bot.application.id)&&
                    (reactor.user.id!==reactedmsg.member.id)){
                        debugLog('ignoring removeBadResult request')
                        return
                    }
                if(
                    (parseInt(reactor.user.id)===config.adminID)||
                    (reactedmsg.mentions&&reactedmsg.mentions[0].id===reactor.user.id)||
                    (reactor.user.id===reactedmsg.member.id)){
                        // admin and owner can remove renders without voting
                        // anyone can remove their own messages via self votes
                        debugLog('Removing bad result from '+reactedmsg.member.username+' triggered by '+reactor.user.username)
                        reactedmsg.delete().catch(()=>{})
                } else {
                    debugLog('not removing result, not triggered by creator or admin')
                    debugLog(reactedmsg.reactions)
                    // todo tally positive versus negative emoji count when deciding to remove or not
                    
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
    if(!auth.check(msg.member?.id,msg.guildID,msg.channel?.id)){return} // if not authorised, ignore
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

const sendToStarGallery = async(guildId, originalChannelId, messageId, msg)=>{ // Make a copy without buttons for the gallery
    // todo need to take server id, lookup guild object, find star-gallery if it exists
    // need to explore guild, check for star-gallery channel and send simplified result there with no buttons
    // also needs to make sure this hasn't already happened
    log(guildId,originalChannelId,messageId,msg)
    let guild = bot.guilds.get(guildId)
    if(!guild) return
    let galleryChannel = guild.channels.find(channel => {return channel.name === 'star-gallery'})
    if(!galleryChannel) return
    log(galleryChannel)
    if (originalChannelId===galleryChannel.id) return
    //const galleryChannel = allGalleryChannels[serverId]
    //if (!galleryChannel) {log(`No gallery channel found for server ID: ${serverId}`);return}
    //var alreadyInGallery=false
    //if(channel.messages.length<50){debugLog('fetching gallery message history');await channel.getMessages({limit: 100})} // if theres less then 50 in the channel message cache, fetch 100
    // await channel.getMessages({limit: 100})
    const messageLink = `https://discord.com/channels/${guildId}/${originalChannelId}/${messageId}`
    const components = [{ type: 1, components: [{ type: 2, style: 5, label: "Original message", url: messageLink, disabled: false }]}]
    channel.messages.forEach(message=>{
        if(message.content===msg.content){
            alreadyInGallery=true
            debugLog('found in gallery')
        }
    }) // look through eris message cache for channel for matching msg
    if (!alreadyInGallery){
      if (msg && msg.embeds && msg.embeds.length > 0) {
        msg.embeds[0].description = ``
        await channel.createMessage({ content: msg.content, embeds: msg.embeds, components: components }).catch(() => {log(`Failed to send message to the specified channel for server ID: ${serverId}`)})
      } else {await channel.createMessage({ content: msg.content, components: components }).catch(() => {log(`Failed to send message to the specified channel for server ID: ${serverId}`)})}
    } else {debugLog('Found identical existing star gallery message')}
  }
  

module.exports = {
    emojiCommands:{
        parse:parse
    }
}
