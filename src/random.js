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
    debugLog('Enabled randomisers: '+randoms.join(','))
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

/*
getRandom=(what)=>{
  if(randoms.includes(what)){
    try{
      var lines=randomsCache[randoms.indexOf(what)]
      return lines[Math.floor(Math.random()*lines.length)]
    }catch(err){log(err)}
  }else{return what}
}
*/

const replaceRandoms = (input) => {
  const regex = new RegExp(`\{(${randoms.join("|")})\}`, "g")
  return input.replace(regex, matched => {
    const randomiser = matched.slice(1, -1)
    return getRandom(randomiser)
  })
}

/*
replaceRandoms=(input)=>{
  // todo recreate this, not working for multiple randomisers
  var output=input
  randoms.forEach(x=>{
    var wordToReplace='{'+x+'}'
    var before='';var after='';var replacement=''
    var wordToReplaceLength=wordToReplace.length
    var howManyReplacements=output.split(wordToReplace).length-1
    for (let i=0;i<howManyReplacements;i++){ // to support multiple {x} of the same type in the same prompt
      var wordToReplacePosition=output.indexOf(wordToReplace) // where the first {x} starts (does this need +1?)
      if (wordToReplacePosition!==-1&&wordToReplacePosition > 0 && wordToReplacePosition < output.length - wordToReplaceLength){ // only continue if a match was found
        var wordToReplacePositionEnd=wordToReplacePosition+wordToReplaceLength
        before=output.substr(0,wordToReplacePosition)
        replacement=getRandom(x)
        after=output.substr(wordToReplacePositionEnd)
        output=before+replacement+after
      } else if (wordToReplacePosition === 0) {
        replacement = getRandom(x)
        output = replacement + output.substr(wordToReplaceLength)
      } else if (wordToReplacePositionEnd === output.length) {
        output = output.substr(0, wordToReplacePositionEnd - wordToReplaceLength) + getRandom(x)
      }
    }
  })
  return output
}
*/

function getRandomSeed(){return Math.floor(Math.random()*4294967295)}

module.exports = {
    random:{
        get:getRandom,
        list:randoms,
        parse:replaceRandoms,
        seed:getRandomSeed
    }
}
