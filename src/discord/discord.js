// handle all discord functions
const Eris = require("eris")
const Constants = Eris.Constants
const Collection = Eris.Collection
const {bot} = require('./bot')
const {config,log,debugLog,tidyNumber}=require('../utils')
const {exif}=require('../exif')
const {messageCommands}=require('./messageCommands')
const {componentCommands}=require('./componentCommands')
//const {slashCommands}=require('./slashCommands.js')
var colors = require('colors')
const {auth}=require('./auth')
const {emojiCommands} = require("./emojiCommands")
const { isFunction } = require("lodash")

chat=async(channel,msg,file=null)=>{
  if(msg!==null&&msg!==''&&msg!=={}){
    try{
      if(file){bot.createMessage(channel,msg,file).then().catch(e=>{chatFail(e,channel,msg,file)})
      }else{bot.createMessage(channel,msg).then().catch(e=>{chatFail(e,channel,msg)})}
    }catch(err){
      debugLog('Error posting to discord')
      debugLog(err)
    }}
}

chatFail=(error,channel,msg,file=null)=>{
  debugLog('caught error posting to discord:'.bgRed.black)
  debugLog(error.message)
  if(error.message?.includes('message_reference: Unknown message')&&msg.messageReference){
        debugLog('The request message was deleted before we responded, removing reference and trying again')
        delete msg.messageReference
        delete msg.message_reference
        chat(channel,msg,file)
  }
}

chatWin=(response,channel,msg,file)=>{
  debugLog('msg sent to channel '+channel.name+' id '+channel.id)
}

async function directMessageUser(id,msg,channel){ // try, fallback to channel
  d = await bot.getDMChannel(id).catch(() => {
    log('failed to get dm channel, sending public message instead')
    if (channel&&channel.length>0){bot.createMessage(channel,msg).then(()=>{log('DM sent to '.dim+id)}).catch((err) => {log(err);log('failed to both dm a user or message in channel'.bgRed.white)})}
  })
  d.createMessage(msg).catch(() => {
    if (channel&&channel.length>0){bot.createMessage(channel,msg).then(()=>{log('DM sent to '.dim+id)}).catch((err) => {log(err);log('failed to both dm a user or message in channel'.bgRed.white)})}
  })
}

deleteMsg=async(channelid,messageids,reason=undefined)=>{
  log('Deleting message ids '+messageids.join(',')+' in channelid '+channelid)
  if(reason)log('Reason:'+reason)
  bot.deleteMessages(channelid,messageids,reason)
    .then(r=>{log(r)})
    .catch(e=>{log(e)})
}

let lastMsgChan=null

let logChat=async(msg)=>{ // irc-like view
  if(lastMsgChan!==msg.channel?.id&&msg.channel?.name&&msg.channel.guild){
    r='#'+msg.channel.name.bgBlue+'-'+msg.channel.id+'-'+msg.channel.guild.name
    log(r)
    lastMsgChan=msg.channel.id // Track last channel so messages can be grouped with channel headers
  }
  log(msg.author?.username.bgBlue+':'+msg.content)
  msg.attachments.map((u)=>{return u.proxy_url}).forEach((a)=>{log(a)})
  msg.embeds.map((e)=>{return e}).forEach((e)=>{log(e)})
  msg.components.map((c)=>{return c}).forEach((c)=>{log(c)})
}

unregisterSlashCommands=()=>{bot.bulkEditCommands([])}

async function botInit(){
  bot.connect()
  bot.on('error', async(err)=>{log(err)})
  bot.on("disconnect", () => {log('disconnected'.bgRed)})
  bot.on("guildCreate", (guild) => {var m='joined new guild: '+guild.name;log(m.bgRed);log(guild);directMessageUser(config.adminID,m)})
  bot.on("guildDelete", (guild) => {var m='left guild: '+guild.name;log(m.bgRed);log(guild);directMessageUser(config.adminID,m)})
  bot.on('ready', async () => {
    log('Connected to '.bgGreen.black+' discord'.bgGreen+' in '+bot.guilds.size+' guilds')
    log(('Invite bot to server: https://discord.com/oauth2/authorize?client_id='+bot.application.id+'&scope=bot&permissions=124992').dim)
    /*
    bot.getCommands().then(cmds=>{ // check current commands setup, update if needed
      bot.commands = new Collection()
      for (const c of slashCommands) {
        if(cmds.filter(cmd=>cmd.name===c.name).length>0) {
          bot.commands.set(c.name, c) // needed ?
        } else {
          log('Slash command '+c.name+' is unregistered, registering')
          bot.commands.set(c.name, c)
          bot.createCommand({name: c.name,description: c.description,options: c.options ?? [],type: Constants.ApplicationCommandTypes.CHAT_INPUT})
        }
      }
    })*/
    //if (config.hivePaymentAddress.length>0){checkNewPayments()}
  })
  // Runs on all messages received
  bot.on('messageCreate',async(msg)=>{
    if(config.ignoreAllBots&&msg.author.bot) return // ignore all bot messages
    if(config.showChat)logChat(msg)
    parseMsg(msg).then().catch(e=>log(e))
  })
  // Runs on all interactions
  bot.on("interactionCreate", async (interaction) => {
    //log(interaction)
    // todo AUTH check return here
    //auth.check()
    /*
    if (!authorised(interaction,interaction.channel.id,interaction.guildID)) {
      log('unauthorised usage attempt from'.bgRed)
      log(interaction.member)
      return interaction.createMessage({content:':warning: You dont currently have permission to use this feature', flags:64}).catch((e) => {console.error(e)})
    }
    */
    // if it's a slash command interaction
    if(interaction instanceof Eris.CommandInteraction){
      // check if its already been registered, send message only visible to user if it's not valid
      if (isFunction(bot.commands.has) && !bot.commands.has(interaction.data.name)) return interaction.createMessage({content:'Command does not exist', flags:64}).catch((e) => {log('command does not exist'.bgRed);log(e)})
      try{
        // acknowledge the interacton
        await interaction.acknowledge().then(()=>{
          // run the stored slash command
          bot.commands.get(interaction.data.name).execute(interaction)
          interaction.deleteMessage('@original')
        })
      }catch(err){
        log(err)
        await interaction.createMessage({content:'There was an error while executing this command!', flags: 64}).catch((e) => {log(e)})
      }
    }
    // If it's a component interacton
    if(interaction instanceof Eris.ComponentInteraction){
      componentCommands.parseCommand(interaction).then().catch(e=>log(e))
    }

    // If its a modal dialog submisson
    if(interaction instanceof Eris.ModalSubmitInteraction){

    }
  })
  bot.on("messageReactionAdd", async (msg,emoji,reactor) => {
    // Runs each time an emoji is added to a message
    emojiCommands.parse(msg,emoji,reactor)
  })
}

module.exports={
  discord:{
    botInit,
    chat,
  }
}
