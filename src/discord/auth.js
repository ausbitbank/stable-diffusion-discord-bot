const {config:config,log:log,debugLog:debugLog,getUUID:getUUID,validateUUID:validateUUID,urlToBuffer:urlToBuffer}=require('../utils.js')
// true/false for if a user,guild,channel is authorised
let allowedUsers=config.authentication.allowed.users
let bannedUsers=config.authentication.banned.users
let allowedGuilds=config.authentication.allowed.guilds
let bannedGuilds=config.authentication.banned.guilds
let allowedChannels=config.authentication.allowed.channels
let bannedChannels=config.authentication.banned.channels

// todo TEST MORE

userAllowed=(user)=>{
    if(allowedUsers.length>0&&allowedUsers.includes(user)===false){
        debugLog('Auth fail, default deny if allowedUsers are defined but this user isn\'t on the list: '+user)
        return false} // default deny if allowedUsers are defined but this user isn't on the list
    if(bannedUsers.includes(user)){
        debugLog('Auth fail, deny banned user '+user)
        return false} // deny banned user
    return true // else allow
}
guildAllowed=(guild)=>{
    if(allowedGuilds.length>0&&allowedGuilds?.includes(guild)){return true} // allow if this is a whitelisted guild
    if(allowedGuilds.length>0&&!guild){
        debugLog('Auth fail, default deny if allowedGuilds are defined but no guild supplied (stops direct message use)')
        return false} // default deny if allowedGuilds are defined but no guild supplied (stops direct message use)
    if(bannedGuilds.includes(guild)){
        debugLog('Auth fail, deny banned guild '+guild)
        return false} // deny banned guild
    return true // else allow
}
channelAllowed=(channel)=>{
    if(allowedChannels.length>0&&allowedChannels.includes(channel))return true // allow if this is a whitelisted channel
    if(allowedChannels.length>0&&!channel){
        debugLog('Auth fail, default deny if allowedChannels are defined but no channel supplied (stops direct message use)')
        return false} // default deny if allowedChannels are defined but no channel supplied (stops direct message use)
    if(bannedChannels.includes(channel)){
        debugLog('Auth fail, deny banned channel '+channel)
        return false} // deny banned channel
    return true // else allow
}
check=(userid,guildid,channelid)=>{
    if(guildid!=='DM'){guildid=parseInt(guildid)}
    if(userAllowed(parseInt(userid))&&guildAllowed(guildid)&&channelAllowed(parseInt(channelid))){
        return true
    }else{
        debugLog('auth fail for userid '+userid+' in channelid '+channelid+' and guildid '+guildid)
        return false
    }
}

module.exports = {
    auth:{
        user:userAllowed,
        guild:guildAllowed,
        channel:channelAllowed,
        check:check
    }
}
