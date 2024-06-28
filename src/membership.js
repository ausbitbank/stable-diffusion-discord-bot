// Handle all functions related to membership state management
const {log,debugLog,config} = require('./utils.js')
const {db,User}=require('./db.js')

getTier=async(user)=>{
    let usr = await User.findOne({where:{discordID: user}})
    if(!usr){return {error:'user not found'}}
    return usr.tier
}
setTier=async(user,tier)=>{
    let usr = await User.findOne({where:{discordID: user}})
    if(!usr){return {error:'user not found'}}
    usr.set({tier:tier})
    await usr.save()
}

module.exports = {
    membership: {
        getTier,
        setTier
    }
}