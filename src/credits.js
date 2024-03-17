// Handle all functions related to credit state management
const {log,debugLog,config} = require('./utils.js')
const {db,User,Op}=require('./db.js')
const { isObject } = require('lodash')
const defaultCredits = config.credits.default??100.00

balance=async(user)=>{
    // Check if a user exists in database, create new user if it doesnt, return true/false if the user already existed
    // first function trigger when interacting with new user
    // accept both job.creator object and plain id
    let userid,username
    if(isObject(user)){userid=user.discordid;username=user.username}else{userid=user;username=null}
    debugLog('balance check for userid '+userid+' , username '+username)
    let [usr,created] = await User.findOrCreate({where:{discordID: userid},defaults:{credits:defaultCredits,username:username}})
    if(created){debugLog('Created new account '+username+' '+userid)}
    return parseFloat((usr.credits).toFixed(2))
}

decrement=async(user,amount=1)=>{
    let usr = await User.findOne({where:{discordID:user}})
    await usr.decrement('credits',{by:amount})
    debugLog('Credit removed: -'+amount+' from '+user)
    return true
}

increment=async(user,amount=1)=>{
    let usr = await User.findOne({where:{discordID:user}})
    await usr.increment('credits',{by:amount})
    debugLog('Credit added: +'+amount+' to '+user)
    return true
}

transfer=async(from,to,amount=1)=>{
    await increment(to,amount)
    await decrement(from,amount)
    debugLog('Credit transferred: +'+amount+' to '+to+' from '+from)
    return true
}

freeRecharge=async()=>{
    // Recharge all accounts with a balance below minimumBalance to rechargeAmount
    // To be triggered on a schedule twice a day
    if(!config.freeRecharge.enabled){return}
    let minimumBalance = config.freeRecharge.minBalance??10
    let rechargeAmount = config.freeRecharge.amount??20
    let result = await User.update({credits:rechargeAmount},{where:{credits:{[Op.lt]:minimumBalance},banned:false}})
    debugLog('Free recharge completed for '+result[0]+' users')
    return result[0]
}

memberRecharge=async()=>{
    // Prelim attempt at a recurring fee membership system that releases credits regularly based on tier
    // To be triggered on a schedule twice a day
    // Free recharge system already assures a min balance of 20 every 12 hrs
    // tier1 = 50, tier2 = 100
    if(!config.freeRecharge.enabled){return}
    log('Recharging credits for members')
    // todo export config options
    let tier1 = 50
    let tier2 = 100
    try{
        let [tier1charges,tier2charges] = await Promise.all([User.update({credits:tier1},{where:{credits:{[Op.lt]:tier1},banned:false,tier:1}}),User.update({credits:tier2},{where:{credits:{[Op.lt]:tier2},banned:false,tier:2}})])
        let result = {tier1:tier1charges[0],tier2:tier2charges[0]}
        log('Members recharged: '+result.tier1+' tier 1, '+result.tier2+' tier 2')
        return result
    } catch (err) {
        return {error:'Membership recharge failed'}
    }
}


module.exports = {
    credits: {
        balance,
        decrement,
        increment,
        freeRecharge,
        transfer,
        memberRecharge
    }
}
