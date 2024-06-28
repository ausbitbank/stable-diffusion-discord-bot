// Generic stripe credit card payment adapter
// Provides polling check for unprocessed transactions
// Can receive :

// Uses @stripe/stripe-js https://github.com/stripe/stripe-js
const {log,debugLog,config} = require('./utils.js')
// Stripe requires this wierd loader "FOR PCI COMPLIANCE" ..
loadstripe = async()=>{Stripe = require('stripe');stripe = Stripe(config.credits.stripe.key)}
let Stripe,stripe=null
loadstripe()

const poll=async()=>{
    let stripeEvents = await stripe.events.list({limit:5,types:['checkout.session.completed']})
    let paymentsToCheck = []
    stripeEvents.data.forEach(async e=>{
        if(e.data.object.payment_status==='paid'&&e.data.object.status==='complete'&&e.data.object.mode==='payment'){
            let txid = e.data.object.id
            let discordAccountId = e.data.object.metadata.discord_id
            let value = e.data.object.amount_total/100
            let unixtimestamp = new Date(e.data.object.created * 1000)
            let timestamp = unixtimestamp.toISOString()
            paymentsToCheck.push({value,type:'stripe',txid,timestamp,discordAccountId})
        }
    })
    return paymentsToCheck
}

const request=async(discordid,amount=5)=>{
    // Currently allowing users to set their own price on stripe side, defaulting to $5usd
    let paymentLink = await stripe.paymentLinks.create({line_items: [{price: config.credits.stripe.priceId,quantity: 1}],metadata:{discord_id:discordid}})
    return {type:'Stripe/CC',description:'Pay with Stripe/Credit cards',uri:paymentLink.url}
}


module.exports = {
    stripePayments: {
        poll,
        request
    }
}