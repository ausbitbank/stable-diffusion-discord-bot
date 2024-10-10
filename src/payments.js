// Central payment methods file, import submodules to here and export an interface to poll all methods at once.
const {log,debugLog,config} = require('./utils')
const {Payment,User}=require('./db.js')

// Hive Layer 1 = Hive , HBD
const {hivePayments} = require('./hive/hivePayments')

// Hive Layer 2 = Hive-Engine Tokens

// BTC Lightning delivered as HBD
const {lightningPayments} = require('./lightning/lightningPayments.js')

// Stripe CC payments, delivered as USD
const {stripePayments} = require('./stripePayments')

// TipCC transfers, kept as original token but noted with a USD value
let paymentMethods = []

if(config.credits.enabled){
    if(config.credits.stripe.enabled&&config.credits.stripe.key&&config.credits.stripe.priceId){paymentMethods.push('stripe')}
    if(config.credits.hive.enabled&&config.credits.hive.address&&config.credits.hive.prefix){
        paymentMethods.push('hive')
        paymentMethods.push('hbd')
        if(config.credits.lightning.enabled){paymentMethods.push('lightning')}
    }
    //if(config.credits.hiveEngine.enabled){paymentMethods.push('hiveEngine')}
    if(paymentMethods.length>0){log('Enabled payment methods: '+paymentMethods.join(', '))}
}

poll=async()=>{
    //debugLog('Polling payment methods')
    for (const m of paymentMethods){
        let paymentsIncoming = null
        switch(m){
            case 'hive':
                paymentsIncoming = await hivePayments.poll()
                break
            case 'stripe':
                paymentsIncoming = await stripePayments.poll()
                break
            default:
                break
        }
        if(paymentsIncoming){
            for (const p of paymentsIncoming){
                checkValidPayment(p)
            }
        }
    }
}

request=async(discordid,usdAmount=1,type='all')=>{
    //debugLog('Requesting payment links for each payment method')
    let paymentLinks=[]
    for (const m of paymentMethods){
        let paymentinfo = null
        switch(m){
            case 'hive':
                if(type!=='all'&&type!==m){break}
                paymentinfo = await hivePayments.request(discordid,usdAmount,'HIVE')
                paymentLinks.push(paymentinfo)
                break
            case 'hbd':
                if(type!=='all'&&type!==m){break}
                paymentinfo = await hivePayments.request(discordid,usdAmount,'HBD')
                paymentLinks.push(paymentinfo)
                break
            case 'stripe':
                if(type!=='all'&&type!==m){break}
                paymentinfo = await stripePayments.request(discordid)
                paymentLinks.push(paymentinfo)
                break
            case 'lightning':
                if(type!=='all'&&type!==m){break}
                paymentinfo = await lightningPayments.request(discordid,usdAmount,'HBD')
                paymentLinks.push(paymentinfo)
            default:
                break
        }
    }
    return paymentLinks
}

checkValidPayment=async(p)=>{
    // enforce minimum payment of $0.001 USD , smaller is ignored
    if(p.value<0.001) return false
    // check the payment is not already in the db
    let dbresult = await Payment.findOne({where:{type:p.type,txid:p.txid,timestamp:p.timestamp}})
    if(dbresult!==null) return true // If already in db, pass
    // need to turn discord id into arty user
    let dbuser = await User.findOne({where:{discordID:p.discordAccountId}})
    if(dbuser===null) return false // If we can't find a user, fail
    await addPayment(p,dbuser)
    return true
}

addPayment=async(p,u)=>{
    log(p)
    // calculate how many credits to apply, round to $0.01
    let creditsPer1usd = config.credits.rate??100
    let creditsToApply = Number(p.value).toFixed(3) * creditsPer1usd
    // have everything we need to apply the payment now
    // add payment to payments table
    let dbresponse = await Payment.create({type:p.type,timestamp:p.timestamp,txid:p.txid,value:p.value,userid:u.id})
    // Add credits to user
    log('Add '+creditsToApply+' credits to '+u.username+'('+u.id+')')
    dbresponse = await u.increment('credits',{by:creditsToApply})
}

module.exports = {
    payments:{
        methods: paymentMethods,
        poll,
        request
    }
}
