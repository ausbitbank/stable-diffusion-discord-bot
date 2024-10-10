// load text files from txt directory, usable as {filename} in prompts, will return a random line from the file
const fs=require('fs')
const {log,debugLog}=require('./utils.js')
var randoms=[]
var randomsCache=[]

try{
  fs.readdir('txt',(err,files)=>{ 
    if(err){log('Unable to read txt file directory'.bgRed);log(err)}
    files.forEach((file)=>{
      if (file.includes('.txt')){
        var name=file.replace('.txt','')
        randoms.push(name)
        randomsCache.push(fs.readFileSync('txt/'+file,'utf-8').split(/r?\n/))
      }
    })
    debugLog('Loaded '+randoms.length+' randomisers from ./txt/*.txt')
  })
}catch(err){log('Unable to read txt file directory'.bgRed);log(err)}
if(randoms.includes('prompt')){randoms.splice(randoms.indexOf('prompt'),1);randoms.splice(0,0,'prompt')} // Prompt should be interpreted first

function getRandom(name) {
  if (!randoms.includes(name)) {throw new Error(`Invalid randomiser: ${name}`)}
  const index = randoms.indexOf(name)
  const lines = randomsCache[index]
  if (!lines) {throw new Error(`No lines for randomiser: ${name}`)}
  return lines[Math.floor(Math.random() * lines.length)]
}

const replaceRandoms = (input) => {
  const regex = new RegExp(`\{(${randoms.join("|")})\}`, "g")
  return input.replace(regex, matched => {
    const randomiser = matched.slice(1, -1)
    return getRandom(randomiser)
  }).replace(/(\r\n|\r|\n)/g,' ')
}

function getRandomSeed(){
  // return Math.floor(Math.random()*4294967295)
  return Math.floor(Math.random() * 2 ** 32)
}

module.exports = {
    random:{
        get:getRandom,
        list:randoms,
        parse:replaceRandoms,
        seed:getRandomSeed
    }
}