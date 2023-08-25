// Central payment methods file, import submodules to here and export an interface to poll all methods at once.
const {log,debugLog,config} = require('./utils.js')

// Hive Layer 1 = Hive , HBD
// Hive Layer 2 = Hive-Engine Tokens
// BTC Lightning delivered as HBD
// Stripe CC payments, delivered as USD
// TipCC transfers, kept as original token but noted with a USD value
let paymentMethods = []

if(config.credits.enabled){
    if(config.credits.hive.enabled&&config.credits.hive.address&&config.credits.hive.prefix){paymentMethods.push('hive')}
    if(config.credits.hiveEngine.enabled){paymentMethods.push('hiveEngine')}
    if(config.credits.stripe.enabled&&config.credits.stripe.key&&config.credits.stripe.priceId){paymentMethods.push('stripe')}
    if(config.credits.lightning.enabled){paymentMethods.push('lightning')}
    if(config.credits.tipcc.enabled&&config.credits.tipcc.key){paymentMethods.push('tipcc')}
}


modules.export = {
    payments:{
        methods: paymentMethods
    }
}
