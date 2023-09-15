const sharp = require('sharp')
const jimp = require('jimp')
const {config,log,debugLog,getUUID, urlToBuffer}=require('./utils')
const {removeBackground}=require('./removeBackground')

const textOverlay = async(text='arty',img=null,gravity='south',color='white',blendmode='overlay',width=null,height=512,font='Arial',extendimage=false,extendcolor='black')=>{
    // either load the existing image, or create a new one to use as base
    try{
        let res = img ? await sharp(img) : await sharp({create:{width:width?width:512,height:height?height:512,channels:4,background:{r:0,g:0,b:0,a:1}}})
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
    } catch (err) {
        debugLog('Error creating text overlay')
        debugLog(err)
    }
}

const convertToPng = async(img)=>{
    try{
        let buf = await sharp(img).toFormat('png').toBuffer()
        return buf
    } catch(err){
        log(err)
        return null
    }
}

const diff = async(img1,img2)=>{
    try{
        if(!img1||!img2){throw('Missing images required for diff')}
        img1 = await jimp.read(img1)
        img2 = await jimp.read(img2)
        let distance = await jimp.distance(img1,img2)
        let diff = jimp.diff(img1,img2)
        let newMsg = 'Image 1 hash: `'+img1.hash()+'`\nImage 2 hash: `'+img2.hash()+'`\nHash Distance: `'+distance+'`\nImage Difference: `'+diff.percent*100+' %`'
        let diffimg = await diff.image.getBuffer(jimp.MIME_PNG)
        return {msg:newMsg,img:diffimg}
    } catch(err) {
        debugLog(err)
        return {error: 'Failed to create image diff'}
    }
}

async function textImage(text, width=768, height=768,font='Arial',size=32,color='red') {
    log(width)
    log(height)
    const image = sharp({
        create: { 
            width:width,
            height:height, 
            channels: 4,
            background: {r:0,g:0,b:0,alpha:1}
        }
    })
    const overlay = await sharp({text: {text: '<span foreground="'+color+'">'+text+'</span>',rgba: true,width: width,height: height,font: font}}).png().toBuffer()
    image.composite([{
        input: overlay,
        gravity: sharp.gravity.center
    }])
    let buf = await image.png().toBuffer()
    return {
        messages:[{content:'Created new image from text'}],
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

const getResolution=async(buf)=>{
    // input image buffer, output width and height
    let img = await sharp(buf)
    let meta = await img.metadata()
    debugLog(meta)
    let result = {width:meta.width,height:meta.height}
    return result
}

module.exports = {
    imageEdit:{
        textOverlay,
        textImage,
        removeBackground,
        crop,
        convertToPng,
        getResolution
    }
}
