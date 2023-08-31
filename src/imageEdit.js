const sharp = require('sharp')
const jimp = require('jimp')
const {log,getUUID, urlToBuffer}=require('./utils')
const {removeBackground}=require('./removeBackground')

const textOverlay = async(text='arty',img=null,gravity='south',color='black',blendmode='overlay',width=false,height=125,font='Arial',extendimage=false,extendcolor='black')=>{
    // either load the existing image, or create a new one to use as base
    let res = img ? await sharp(img) : await sharp({create:{width:width ? width : 512,height:height ? height : 512,channels:4,background:{r:255,g:255,b:255,alpha:1}}})
    if(extendimage){
        switch(gravity){
            case 'south':
            case 'southeast':
            case 'southwest': {res.extend({bottom:height,background:extendcolor});break}
            case 'north':
            case 'northeast':
            case 'northwest': {res.extend({top:height,background:extendcolor});break}      
        }
        res = sharp(await res.toBuffer()) // metadata will give wrong height value after our extend, reload it. Not too expensive
    }
    let metadata = await res.metadata()
    if(!width){width=metadata.width-10}
    const overlay = await sharp({text: {text: '<span foreground="'+color+'">'+text+'</span>',rgba: true,width: width,height: height,font: font}}).png().toBuffer()
    res = await res.composite([{ input: overlay, gravity: gravity, blend: blendmode }]) // Combine the text overlay with original image
    let buf = await res.png().toBuffer()
    return {
        messages:[{content:img ? 'Added text overlay to image' : 'Created new image from text'}],
        files:[{file:buf,name:getUUID()+'.png'}],
        error:null
    }
}

/* 
/// Jimp version doesn't crop transparent pixels properly
const crop=async(imageurl)=>{
    try{
        var image=await axios({ url: imageurl, responseType: "arraybuffer" })
        var img=await jimp.read(image.data)
        img = img.autocrop(false)
        var buffer = await img.getBufferAsync(jimp.MIME_PNG)
        return {msg:'auto cropped image',image:buffer}
        //bot.createMessage(channel, '<@'+user+'> cropped image', {file: buffer, name: user+'-'+new Date().getTime()+'-rotate.png'})
    }catch(err){
        {return {error:err}}
    }
}
*/
// sharp version not trimming transparent pixels properly either ?
const crop=async(imageurl)=>{
    try{
        //var image=await axios({ url: imageurl, responseType: "arraybuffer" })
        var image = await urlToBuffer(imageurl)
        var img=await sharp(image.data)
        var buffer = img.trim().toBuffer()
        return {msg:'auto cropped image',image:buffer}
        //bot.createMessage(channel, '<@'+user+'> cropped image', {file: buffer, name: user+'-'+new Date().getTime()+'-rotate.png'})
    }catch(err){
        {return {error:err}}
    }
}

module.exports = {
    imageEdit:{
        textOverlay,
        removeBackground,
        crop
    }
}
