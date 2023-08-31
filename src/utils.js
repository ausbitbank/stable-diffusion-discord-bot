const fs = require('fs')
const fsPromises = require('fs').promises
const log = console.log.bind(console)
const crypto = require('crypto')
const debounce = require('debounce')
const debugLog = (m)=>{if(config.logging.debug){log(m)}}
function shuffle(array) {for (let i = array.length - 1; i > 0; i--) {let j = Math.floor(Math.random() * (i + 1));[array[i], array[j]] = [array[j], array[i]]}} // fisher-yates shuffle
const getRandomColorDec=()=>{return Math.floor(Math.random()*16777215)}
const partialMatches=(strings,search)=>{
  let results = []
  for(let i=0;i<strings.length;i++){if(searchString(strings[i], search)){results.push(strings[i])}}
  return results 
} 
const searchString=(str,searchTerm)=>{
  let searchTermLowerCase = searchTerm.toLowerCase() 
  let strLowerCase = str.toLowerCase() 
  return strLowerCase.includes(searchTermLowerCase) 
}
const tidyNumber=(x)=>{if(x){var parts=x.toString().split('.');parts[0]=parts[0].replaceAll(/\B(?=(\d{3})+(?!\d))/g, ',');return parts.join('.')}else{return null}}
const getUUID=()=>{let uuid=crypto.randomUUID();return uuid}
const validUUID=(uuid)=>{
  let REGEX=/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i
  return typeof uuid === 'string' && REGEX.test(uuid)
}
const sleep = async(ms)=>{return new Promise((resolve)=>{setTimeout(resolve,ms)}).catch(()=>{})}
let config=JSON.parse(fs.readFileSync('./config/config.json','utf8'))
const axios=require('axios')
const urlToBuffer = async(url)=>{
    return new Promise((resolve,reject)=>{
      axios.get(url,{responseType:'arraybuffer'})
        .then(res=>{resolve(Buffer.from(res.data))})
        .catch(err=>{reject(err)})
      })
}
function shuffle(array) {for (let i = array.length - 1; i > 0; i--) {let j = Math.floor(Math.random() * (i + 1));[array[i], array[j]] = [array[j], array[i]]}} // fisher-yates shuffle

module.exports = {
    config,
    log,
    debugLog,
    shuffle,
    getRandomColorDec,
    getUUID,
    validUUID,
    urlToBuffer,
    sleep,
    shuffle,
    debounce,
    tidyNumber
}
