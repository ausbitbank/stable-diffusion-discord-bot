// Handle all functions related to credit state management
const {log,debugLog,config} = require('./utils.js')
const {db,User,Op}=require('./db.js')
const defaultCredits = 100.00

balance=async(user)=>{
    // Check if a user exists in database, create new user if it doesnt, return true/false if the user already existed
    let [usr,created] = await User.findOrCreate({where:{discordID: user},defaults:{credits:defaultCredits}})
    return parseFloat((usr.credits).toFixed(2))
}

decrement=async(user,amount=1)=>{
    let usr = await User.findOrCreate({where:{discordID:user},defaults:{credits:defaultCredits}})
    let newcredits = parseFloat((usr[0].credits - amount).toFixed(2))
    if(newcredits<0){newcredits=0}
    await usr.update({credits:newcredits})
    debugLog('Credit removed: -'+amount+' from '+user+' , Balance: '+newcredits)
    return newcredits
}

increment=async(user,amount=1)=>{
    let usr = await User.findOrCreate({where:{discordID:user},defaults:{credits:defaultCredits}})
    let newcredits = parseFloat((usr[0].credits + amount).toFixed(2))
    await usr.update({credits:newcredits})
    debugLog('Credit added: +'+amount+' to '+user+' , Balance: '+newcredits)
    return newcredits
}

transfer=async(from,to,amount=1)=>{
    let usrFrom = await User.findOrCreate({where:{discordID:from},defaults:{credits:defaultCredits}})
    let usrTo = await User.findOrCreate({where:{discordID:to},defaults:{credits:defaultCredits}})
    let newcreditsTo = parseFloat((usrTo.credits + amount).toFixed(2))
    let newcreditsFrom = parseFloat((usrFrom.credits + amount).toFixed(2))
    await usrTo.update({credits:newcreditsTo})
    await usrFrom.update({credits:newcreditsFrom})
    debugLog('Credit added: +'+amount+' to '+user+' , Balance: '+newcredits)
    return newcredits
}

freeRecharge=async()=>{
    // Recharge all accounts with a balance below minimumBalance to rechargeAmount
    // To be triggered on a schedule twice a day
    if(!config.freeRecharge.enabled){return}
    let minimumBalance = config.freeRecharge.minBalance??10
    let rechargeAmount = config.freeRecharge.amount??20
    let result = await User.update({credits:rechargeAmount},{where:{credits:{[Op.lt]:minimumBalance},banned:false}})
    debugLog('Free recharge completed')
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
