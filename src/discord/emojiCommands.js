const {config,log,debugLog,tidyNumber, urlToBuffer, getUUID}=require('../utils.js')
const {bot} = require('./bot.js')
const {auth}=require('./auth')
const {messageCommands}=require('./messageCommands')

var commands = [
    {
        name: 'sendResultToGallery',
        description: 'Copy a star result to a gallery channel, if one is configured for that guild',
        permissionLevel: 'all',
        aliases: ['⭐','❤️'],
        command: async (msg,emoji,reactor)=>{
            try{
                sendToStarGallery(msg,emoji,reactor)
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
                // todo admin votes should still be double confirmed
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

const sendToStarGallery = async(msg,emoi,reactor)=>{ // Make a copy without buttons for the gallery
    // todo need to take server id, lookup guild object, find star-gallery if it exists
    // need to explore guild, check for star-gallery channel and send simplified result there with no buttons
    // also needs to make sure this hasn't already happened
    let guildId = msg.guildID
    let originalChannelId = msg.channel?.id
    let messageId = msg.id
    let alreadyInGallery = false
    let guild = bot.guilds.get(guildId)
    if(!guild) return
    let galleryChannel = guild.channels.find(channel => {return channel.name === 'star-gallery'})
    if(!galleryChannel) return
    if (originalChannelId===galleryChannel.id) return
    // Make sure we have the full message object now instead of the shortform thing we get when eris doesn't have the message cached yet
    msg = await bot.getMessage(msg.channel.id,msg.id)
    if(msg.author?.id!==bot.application.id){return} // only care about our own results
    if(galleryChannel.messages.length<50){ // if theres less then 50 in the channel message cache, fetch 100
        debugLog('fetching gallery message history')
        await galleryChannel.getMessages({limit: 100})
    } 
    const messageLink = `https://discord.com/channels/${guildId}/${originalChannelId}/${messageId}`
    const components = [{ type: 1, components: [{ type: 2, style: 5, label: "Original message", url: messageLink, disabled: false }]}]
    galleryChannel.messages.forEach(message=>{
        if(message.content===msg.content && message.embeds === msg.embeds){
            alreadyInGallery=true
            debugLog('found in gallery')
        }
    }) // look through eris message cache for channel for matching msg
    if (!alreadyInGallery){
        let buf,file
        if(messageCommands.messageHasImageAttachments(msg)){buf = await messageCommands.extractImageBufferFromMessage(msg)}
        if(buf){file={file:buf,name:getUUID()+'.png'}}
        let content = msg.content
        // todo need to extract original creator from content or allowed_mentions array, new message reference original creator + reactor
        if(file){
            await galleryChannel.createMessage({content:msg.content,embeds:msg.embeds,allowed_mentions:{}},file)
        } else {
            await galleryChannel.createMessage({content:msg.content,embeds:msg.embeds,allowed_mentions:{}})
        }
    } else {debugLog('Found identical existing star gallery message')}
  }
  

module.exports = {
    emojiCommands:{
        parse:parse
    }
}
