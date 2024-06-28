// Accept payments via lightning network, using v4v.app as either HIVE or HBD
// https://v4v.app
// includes the correct memo ready for HIVE/HBD payment processor to activate credit

const {log,debugLog,config,axios} = require('../utils')
const {hivePayments} = require('../hive/hivePayments')

const request = async(discordid,amount=1,coin='HBD')=>{
  // amount is the usd value being requested
  // coin is the way it gets delivered
  // user will be invoiced an amount in satoshis over lightning network

  // https://api.v4v.app/v1/new_invoice_hive
  // ?hive_accname=artybot
  // &amount=5.00101020406122
  // &currency=HBD
  // &usd_hbd=false
  // &app_name=v4vapp-pos
  // &expiry=100
  // &message=recharge-237568213750251520+v4v-6y3Qj
  // &receive_currency=hbd
  
  //let prices = await hivePayments.getPrices()
  //if(prices){
      // get hbd price, adjust amount
      /*
      {
          hive: 0.319042,
          hbd: 1.002,
          last_updated: '2024-05-25T21:19:57.738Z'
      }
      */
      //amount = 
  //} else {
      // assume hbd is 1usd exactly
      // or, use the rates available via v4v api
  //}
  let apibase = 'https://api.v4v.app/v1/new_invoice_hive'
  let account = config.credits.hive.address
  let prefix = config.credits.hive.prefix
  let currency=coin
  let usd_hbd = 'false'
  let app_name = 'arty-@'+account
  let expiry=100
  let message=prefix+discordid
  let receive_currency=coin.toLowerCase()
  let apiurl = apibase+'?hive_accname='+account+'&amount='+amount+'&currency='+currency+'&usd_hbd='+usd_hbd+'&app_name='+app_name+'&expiry'+expiry+'&message='+message+'&receive_currency='+receive_currency
  let apiresponse = await axios.get(apiurl)
  let d = apiresponse.data
  let qruri = apiurl+'&qr_code=png'
  // apiurl is https://api.v4v.app/v1/new_invoice_hive?hive_accname=artybot&amount=1&currency=HBD&usd_hbd=false&app_name=arty-artybot&expiry100&message=recharge-undefined&receive_currency=hbd&qr_code=png
  /* apiresponse is
  {
      r_hash: 'TRzvgUxo3mBCnrxVjxmctLDR4rE/PvTilVsnFar0L3E=',
      payment_hash: 'VFJ6dmdVeG8zbUJDbnJ4Vmp4bWN0TERSNHJFL1B2VGlsVnNuRmFyMEwzRT0=',
      payment_addr: 'T8lH0UrRU9KQalyIbRACiR4IIpGMqVKB/f9KiPhTrik=',
      payment_request: 'lnbc15200n1pn9ykvxpp5f5wwlq2vdr0xqs57h32c7xvukjcdrc438ul0fc54tvn3t2h59acsd9qv9e8g7tzda6zqlpqwfjkx6rpwfnk2tt4dejx2enfdejkggruyq34242fgssrzvekx3jnxwfs956kvdfh956rwwfc95ukzvp3956nxe33xfjxxcfnvenrvgruyq35ssjyyq35xnz9g98zqg6ggfzzqgmkx3mxzurscqzzsxqzfvsp5fly5052269fa9yr2tjyx6yqz3y0qsg533j549q0ala9g37zn4c5s9qyyssqw604l3sszyv5ghcfdd3yrgchuh7x3u0jlsdtcwq5yrxp9w23t8x4avcwacyxvsgzrywr90yrg9vmfvlcdrhtytq4ctkwcyh76lpr6vqpl0s2gw',
      amount: 1520,
      memo: 'artybot | recharge-undefined | #UUID 1364e390-5f57-4798-9a01-53f12dca3ff6 | #HBD #CLEAN #HBD #v4vapp',
      hive_accname: 'artybot',
      app_name: 'arty-artybot',
      expiry: 300,
      expires_at: 1716673202,
      qr_code_base64: ''
  }
  */
  // qrurl is https://api.v4v.app/v1/new_invoice_hive?hive_accname=artybot&amount=1&currency=HBD&usd_hbd=false&app_name=arty-artybot&expiry100&message=recharge-undefined&receive_currency=hbd&qr_code=png
  let uri = 'lightning://lightning:'+d.payment_request
  return {
    type: 'Bitcoin (lightning)',
    description:`Transfer ${d.amount} satoshis ($${amount} usd) over lightning network`,
    qruri,
    uri,
    r_hash:d.r_hash,
    payment_hash:d.payment_hash,
    payment_addr:d.payment_addr,
    payment_request:d.payment_request,
    expires_at:d.expires_at
  }
}

const status = async()=>{
    // get service status + prices
    /*
{
  message: 'alive',
  version: '2.27.2',
  config: {
    hive_return_fee: 0.002,
    conv_fee_percent: 0.015,
    conv_fee_sats: 50,
    minimum_invoice_payment_sats: 500,
    maximum_invoice_payment_sats: 250000,
    max_acceptable_lnd_fee_msats: 500000,
    closed_get_lnd: false,
    closed_get_hive: false,
    v4v_frontend_iri: 'https://v4v.app',
    v4v_api_iri: 'https://api.v4v.app',
    v4v_fees_streaming_sats_to_hive_percent: 0.03,
    lightning_rate_limits: [ [Object], [Object], [Object] ],
    dynamic_fees_url: '@v4vapp/hive-to-lightning-gateway-fees',
    dynamic_fees_permlink: 'hive-to-lightning-gateway-fees',
    binance_automated_sell: true,
    binance_force_min_sell: false,
    binance_force_testnet: false,
    binance_ignore_account: 'v4vapp.dev',
    min_max: { min: [Object], max: [Object] }
  },
  crypto: {
    bitcoin: { btc: 1, usd: 69074.63500000001 },
    hive: { btc: 0.0000046174692055918925, usd: 0.31895 },
    hive_dollar: { btc: 0.000014432101940895907, usd: 0.9968921738501766 },
    v4vapp: {
      BTC_USD: 69074.63500000001,
      sats_USD: 1447.7094232926454,
      HBD_USD: 0.9968921738501766,
      HiveMarket_HBD_USD: 0.9968921738501766,
      cg_quote: [Object],
      cmc_quote: [Object],
      binance_quote: [Object],
      Hive_USD: 0.31895,
      Hive_HBD: 0.31895,
      sats_Hive: 461.7469205591893,
      sats_HBD: 1443.2101940895907,
      Hive_sats: 0.0021656885091707167,
      HBD_sats: 0.0006928997619995488,
      fetch_error: [],
      last_fetch: '2024-05-25T21:18:42.285660+00:00',
      fetch_time: 1.0831665461882949,
      conversion: null,
      redis_hit: false
    }
  },
  onward_response: { state: 'SERVER_ACTIVE' }
}
  */
    let apiurl = 'https://api.v4v.app/v1?get_crypto=true'
    let apiresponse = await axios.get(apiurl)
    log(apiresponse.data)
    return apiresponse.data
}

module.exports = {
    lightningPayments: {
        request,
        status
    }
}
