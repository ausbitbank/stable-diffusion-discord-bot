// Generic hive payment adapter
// Provides polling check for unprocessed transactions
// Can receive :
//      Regular payments (transfer with memo of recharge-xxxx) to apply credit to account
//      TODO Recurrent transfers (subscriptions) to apply credit to account
//      TODO Request payments (encrypted, or not) with dream arguments in memo, reply with image album + payment change
// Can Generate :
//      hive payment uri's for transfer transactions
// Should use :
// https://gitlab.syncad.com/hive/hive-uri
// https://gitlab.syncad.com/hive/dhive

const {Client} = require('@hiveio/dhive')
const hiveuri = require('hive-uri')
const hiverpc = ['https://rpc.ausbit.dev','https://api.hive.blog', 'https://api.deathwing.me', 'https://api.hive.blue', 'https://api.openhive.network', 'https://hive-api.arcange.eu', 'https://hived.emre.sh', 'https://techcoderx.com', 'https://anxy.io', 'https://rpc.mahdiyari.info']
const client = new Client(hiverpc)
const {config,log,debugLog,axios}=require('../utils.js')
const {qrcode} = require('../qrcode')
let acc = config.credits.hive.address
let prefix = config.credits.hive.prefix
let pricecache = null

const poll = async()=>{
    if(!config.credits.hive.enabled||!config.credits.hive.address){debugLog('aborting hive poll');return}// If credits disabled or not configured, abort
    try{
        let prices = await getPrices()
        let accHistory = await client.database.getAccountHistory(acc,-1,100,[4,524288]) // last 100 transfer / fill_recurrent_transfer ops for acc
        let paymentsToCheck = []
        // if invalid data is returned by api, abort
        if(!Array.isArray(accHistory)){debugLog('Invalid Hive account history returned,aborting');return}
        for (const r in accHistory){
            let tx = accHistory[r]
            let optype = tx[1].op[0]
            let op = tx[1].op[1]
            let timestamp = tx[1].timestamp
            let txid = tx[1].trx_id
            if(['transfer'].includes(optype) && op.to===acc && op.memo.startsWith(prefix)){
                let amount = op.amount.split(' ')[0]
                let coin = op.amount.split(' ')[1]
                let value
                if(coin==='HIVE'){
                    value = prices.hive * amount
                } else if (coin==='HBD'){
                    value = prices.hbd * amount
                }
                let discordAccountId = op.memo.split('-')[1]
                paymentsToCheck.push({amount,type:coin,txid,timestamp,from:op.from,to:op.to,value:value.toFixed(3),discordAccountId})
            }
        }
        return paymentsToCheck
    }catch(err){log(err)}
}

const request = async(discordid,value=1,coin='HIVE')=>{
    let amount = null
    let price = await getPrices()
    if(coin==='HIVE'){
        amount=Number(value/price.hive).toFixed(3)
    } else if (coin==='HBD') {
        amount=Number(value/price.hbd).toFixed(3)
    }
    //debugLog('Generating payment link for '+amount+' '+coin+' (value: '+value+'usd)')
    let memo = config.credits.hive.prefix+discordid
    let paymenturi = await hiveuri.encodeOp(['transfer', {to:config.credits.hive.address,amount:amount+' '+coin,memo:memo}])
    // todo generate qrcode for paymenturi to bypass discord linking limitations
    // cannot use dataurl inside discord (even though it works in multiple online discord embed builders..)
    // will need to rehost qr images to use in discord or just generate them via a web route directly ..
    // let qruri = await qrcode.toDataUrl(paymenturi,{scale:1,errorCorrectionLevel:'L',margin:2})
    return {type:coin, description:'Transfer '+amount+' '+coin+' ($'+value+' usd) to account `'+config.credits.hive.address+'` with memo `'+memo+'`',uri:paymenturi}// ,qruri
}

const getPrices = async()=>{
    // return object with usd value of hive and hbd from coingecko api
    // can return code 429 "too many requests if triggered too often"
    let url='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=hive,hive_dollar&order=id_asc&per_page=2&page=1&sparkline=false'
    let price={hive:0.31,hbd:1.00,last_updated:null}
    try{
        let priceRequest = await axios.get(url)
        let prices = priceRequest.data
        if(prices){
            price.hive = prices[0].current_price
            price.hbd = prices[1].current_price
            price.last_updated = prices[0].last_updated
            pricecache=price
            return price
        } else {
            log('Failed to get hive/hbd prices from coingecko')
            return null
        }
    } catch(err){
        log('Failed to get hive/hbd prices from coingecko')
        if(pricecache) {
            price=pricecache
            return price
        } else {
            return null
        }
        // todo fallback to condenser_api.get_ticker processing
    }
}

module.exports = {
    hivePayments: {
        poll,
        request,
        getPrices
    }
}