const fs = require('fs')
const fsPromises = require('fs').promises
const log = console.log.bind(console)
const crypto = require('crypto')
const debounce = require('debounce')
const {Image}=require('./db')
const debugLog = (m)=>{if(config.logging.debug){log(m)}}
const shuffle = (array)=>{for (let i = array.length - 1; i > 0; i--) {let j = Math.floor(Math.random() * (i + 1));[array[i], array[j]] = [array[j], array[i]]}} // fisher-yates shuffle
const getRandomColorDec=()=>{return Math.floor(Math.random()*16777215)}
const {imageproxy} = require('./imageproxy')
const moment = require('moment')
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

const urlToBuffer = async(url,nocache)=>{
  if(nocache){
    let res = await axios.get(url,{responseType:'arraybuffer'})
    return Buffer.from(res.data)
  } else {
    let img = await imageproxy.get(url)
    return img
  }
}

const extractFilenameFromUrl=(url)=>{
  var path = decodeURI(url) // Decode URL if it contains encoded characters
  var lastSlashIndex = path.lastIndexOf('/') // Find the last occurrence of "/"
  var filenameWithExtension = path.substring(lastSlashIndex + 1) // Extract the filename with extension
  var filename = filenameWithExtension.split('?')[0] // Remove any query parameters from the filename
  return filename
}

const isURL=(string)=>{
  const urlPattern = /^(https?:\/\/)?([\w.-]+\.[a-zA-Z]{2,})(:[0-9]+)?(\/[\w\/.-]*)*(\?[\w=&-]+)?(#\w*)?$/
  return urlPattern.test(string)
}

const timestamp=()=>{ // returns relative timestamp in discord format as string
  let currentTimestamp = Math.floor(Date.now() / 1000)
  return `<t:${currentTimestamp}:R>`
}

const relativeTime=(timestamp)=>{
  var momentObj = moment.unix(timestamp / 1000)
  return momentObj.fromNow()
}

const trimText = (text, maxLength) => {
  let words = text.split(' ')
  let totalLength = 0
  let trimmedText = ''
  for (const word of words) {
    totalLength += word.length + 1 // +1 for the space
    trimmedText += word + ' '
    if (totalLength > maxLength) { // Trim to the last word that fits
      trimmedText = trimmedText.trim() // remove trailing space
      break
    }
  }
  if (trimmedText.length > maxLength) { // If the trimmed text is still too long, try to trim by cutting at the end of a word
    trimmedText = ''
    let newLength = 0
    for (const word of words) {
      newLength += word.length + 1 // +1 for the space
      if (newLength > maxLength) {break}
      trimmedText += word + ' '
    }
    trimmedText = trimmedText.trim() // remove trailing space
  }
  return trimmedText
}

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
    tidyNumber,
    extractFilenameFromUrl,
    isURL,
    axios,
    timestamp,
    relativeTime,
    trimText
}