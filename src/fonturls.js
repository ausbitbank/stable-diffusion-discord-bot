// Load font list from fonturls.json, parse and return object
const fsPromises = require('fs').promises
const {log,debugLog,axios}=require('./utils')
let fonturlsjson = null
let fonts = null

init = async() =>{
    fonturlsjson = await fsPromises.readFile('./src/fonturls.json')
    fonts = JSON.parse(fonturlsjson)
    log('Loaded '+fonts.length+' TTF fonts')
}

list = ()=>{
    // get random font
    return fonts
}

get = (name)=>{
    let font = fonts.find(f=>{f.name===name})
    if(!font){return {error:'Unable to find font'}}
    return font.url
}

random = ()=>{
    let randomfont = fonts[Math.floor(Math.random()*fonts.length)]
    return randomfont
}

test = async() =>{
    let newfonts = []
    log('Starting with '+fonts.length)
    for(const f in fonts){
        let font = fonts[f]
        try {
            await axios.head(font.url)
            log(font.name+' works')
            newfonts.push(font)
        } catch (error){
            log(font.name+' is INVALID, removed from list')
        }
    }
    log('Finish with '+newfonts.length)
    const jsonresult = JSON.stringify(newfonts,null,2)
    await fsPromises.writeFile('./src/fonturls.json',jsonresult,'utf-8')
}

init()

module.exports = {
    fonturls: {
        list,
        get,
        random
    }
}