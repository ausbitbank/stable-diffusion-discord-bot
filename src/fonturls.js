// Load font list from fonturls.json, parse and return object
const fsPromises = require('fs').promises
const {log,debugLog}=require('./utils')
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

init()

module.exports = {
    fonturls: {
        list,
        get,
        random
    }
}