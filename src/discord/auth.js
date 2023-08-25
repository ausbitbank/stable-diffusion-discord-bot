const {config:config,log:log,debugLog:debugLog,getUUID:getUUID,validateUUID:validateUUID,urlToBuffer:urlToBuffer}=require('../utils.js')
// true/false for if a user,guild,channel is authorised
let allowedUsers=config.allowedUsers
let bannedUsers=config.bannedUsers
let allowedGuilds=config.allowedGuilds
let bannedGuilds=config.bannedGuilds
let allowedChannels=config.allowedChannels
let bannedChannels=config.bannedChannels

// todo TEST MORE

userAllowed=(user)=>{
    if(allowedUsers.length>0&&allowedUsers.includes(user)===false){
        return false} // default deny if allowedUsers are defined but this user isn't on the list
    if(bannedUsers.includes(user)){return false} // deny banned user
    return true // else allow
}
guildAllowed=(guild)=>{
    if(allowedGuilds.length>0&&!guild)return false // default deny if allowedGuilds are defined but no guild supplied (stops direct message use)
    if(allowedGuilds.length>0&&allowedGuilds.includes(guild))return true // allow if this is a whitelisted guild
    if(bannedGuilds.includes(guild))return false // deny banned guild
    return true // else allow
}
channelAllowed=(channel)=>{
    if(allowedChannels.length>0&&!channel)return false // default deny if allowedChannels are defined but no channel supplied (stops direct message use)
    if(allowedChannels.length>0&&allowedChannels.includes(channel))return true // allow if this is a whitelisted channel
    if(bannedChannels.includes(channel))return false // deny banned channel
    return true // else allow
}
check=(userid,guildid,channelid)=>{
    if(userAllowed(parseInt(userid))&&guildAllowed(parseInt(guildid))&&channelAllowed(parseInt(channelid))){
        return true
    }else{return false}
}

module.exports = {
    auth:{
        user:userAllowed,
        guild:guildAllowed,
        channel:channelAllowed,
        check:check
    }
}
