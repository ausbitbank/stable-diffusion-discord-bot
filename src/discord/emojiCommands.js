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
            sendToStarGallery(msg,emoji,reactor)
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
            msg = await bot.getMessage(msg.channel.id,msg.id)
            let buf,file
            let dmchannel = await bot.getDMChannel(reactor.user.id)
            if(messageCommands.messageHasImageAttachments(msg)){buf = await messageCommands.extractImageBufferFromMessage(msg)}
            if(buf){file={file:buf,name:getUUID()+'.png'}}
            if(file){ await dmchannel.createMessage({content:msg.content,embeds:msg.embeds,components:msg.components,allowed_mentions:{}},file)
            } else { await dmchannel.createMessage({content:msg.content,embeds:msg.embeds,components:msg.components,allowed_mentions:{}})}
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
                    (reactedmsg.member?.id!==bot.application.id)&&
                    (reactor.user?.id!==reactedmsg.member?.id)){
                        debugLog('ignoring removeBadResult request')
                        return
                    }
                if(
                    (parseInt(reactor.user?.id)===config.adminID)||
                    (reactedmsg.mentions&&reactedmsg.mentions[0]?.id===reactor.user?.id)||
                    (reactor.user?.id===reactedmsg.member?.id)){
                        // admin and owner can remove renders without voting
                        // anyone can remove their own messages via self votes
                        debugLog('Removing bad result from '+reactedmsg?.member?.username+' triggered by '+reactor?.user?.username??reactor?.id)
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
    //
    //let userid = interaction.member?.id||interaction.author?.id||interaction.user?.id
    //let username = interaction.user?.username||interaction.member?.username||interaction.author?.username
    //let channelid = interaction.channel.id
    //let guildid = interaction.guildID||'DM'
    //
    let userid = parseInt(reactor?.id)
    let channelid = parseInt(msg.channel?.id)
    if(!emojis.includes(emoji.name)) return // Quickly rule out irrelevant emoji reactions
    if(!auth.check(userid,msg.guildID??'DM',channelid)){return} // if not authorised, ignore
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
}

const starGalleryEntries = new Set() // Keep in memory set of message id's to stop duplicates, lost on restart
const sendToStarGallery = async(msg,emoi,reactor)=>{ // Make a copy without buttons for the gallery
    // need to explore guild, check for star-gallery channel and send simplified result there with no buttons
    let guildId = msg.guildID
    let originalChannelId = msg.channel?.id
    let messageId = msg.id
    let guild = bot.guilds.get(guildId)
    if(!guild){debugLog('Unable to find guild, DM?');return}
    let galleryChannel = guild.channels.find(channel => {return channel.name === 'star-gallery'})
    if(!galleryChannel) return
    if (originalChannelId===galleryChannel.id) return
    if(starGalleryEntries.has(messageId)) return
    // Make sure we have the full message object now instead of the shortform thing we get when eris doesn't have the message cached yet
    msg = await bot.getMessage(msg.channel.id,msg.id)
    if(msg.author?.id!==bot.application.id) return // only care about our own results
    const messageLink = `https://discord.com/channels/${guildId}/${originalChannelId}/${messageId}`
    const components = [{ type: 1, components: [{ type: 2, style: 5, label: "Original message", url: messageLink, disabled: false }]}]
    let buf,file
    if(messageCommands.messageHasImageAttachments(msg)){buf = await messageCommands.extractImageBufferFromMessage(msg)}
    if(buf){file={file:buf,name:getUUID()+'.png'}}
    // todo extract original creator from content or allowed_mentions array, new message reference original creator + reactor
    if(file){
        await galleryChannel.createMessage({content:msg.content,embeds:msg.embeds,components:components,allowed_mentions:{}},file)
    } else {
        await galleryChannel.createMessage({content:msg.content,embeds:msg.embeds,components:components,allowed_mentions:{}})
    }
    starGalleryEntries.add(messageId)
}

module.exports = {
    emojiCommands:{
        parse:parse
    }
}
