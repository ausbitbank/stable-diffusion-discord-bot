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
    let [usr,created] = await User.findOrCreate({where:{discordID: userid},defaults:{credits:defaultCredits,username:username}})
    if(created){debugLog('Created new account '+username+' '+userid)}
    return parseFloat((usr.credits).toFixed(2))
}

decrement=async(user,amount=1)=>{
    let usr = await User.findOrCreate({where:{discordID:user.discordid},defaults:{credits:defaultCredits,username:user.username}})
    let newcredits = parseFloat((usr[0].credits - amount).toFixed(2))
    if(newcredits<0){newcredits=0}
    await User.update({credits:newcredits},{where:{discordID:user.discordid}})
    debugLog('Credit removed: -'+amount+' from '+user.discordid+' , Balance: '+newcredits)
    return newcredits
}

increment=async(user,amount=1)=>{
    let usr = await User.findOrCreate({where:{discordID:user},defaults:{credits:defaultCredits}})
    let newcredits = parseFloat((usr[0].credits + amount).toFixed(2))
    await User.update({credits:newcredits},{where:{discordID:user}})
    debugLog('Credit added: +'+amount+' to '+user+' , Balance: '+newcredits)
    return newcredits
}

transfer=async(from,to,amount=1)=>{
    // from is a job.creator object, to is just id
    let response = await increment(to,amount)
    debugLog(response)
    let bal = await decrement(from,amount)
    debugLog(bal)
    debugLog('Credit transferred: +'+amount+' to '+to+' from '+from)
    return bal
}

freeRecharge=async()=>{
    // Recharge all accounts with a balance below minimumBalance to rechargeAmount
    // To be triggered on a schedule twice a day
    if(!config.freeRecharge.enabled){return}
    let minimumBalance = config.freeRecharge.minBalance??10
    let rechargeAmount = config.freeRecharge.amount??20
    let result = await User.update({credits:rechargeAmount},{where:{credits:{[Op.lt]:minimumBalance},banned:false}})
    debugLog('Free recharge completed')
    debugLog(result)
    return result
}

module.exports = {
    credits: {
        balance,
        decrement,
        increment,
        freeRecharge,
        transfer
    }
}
