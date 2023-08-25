const sharp = require('sharp')
const {log,getUUID}=require('./utils')
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

module.exports = {
    imageEdit:{
        textOverlay
    }
}


/* old version, use this technique but simplify
const textOverlay=async(imageurl,text,gravity='south',channel,user,color='white',blendmode='overlay',width=false,height=125,font='Arial',extendimage=false,extendcolor='black')=>{
    // todo caption area as a percentage of image size
    time('textOverlay')
    try{
      var image=(await axios({ url: imageurl, responseType: "arraybuffer" })).data
      var res=await sharp(image)
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
      var metadata = await res.metadata()
      if(!width){width=metadata.width-10}
      const overlay = await sharp({text: {text: '<span foreground="'+color+'">'+text+'</span>',rgba: true,width: width,height: height,font: font}}).png().toBuffer()
      res = await res.composite([{ input: overlay, gravity: gravity, blend: blendmode }]) // Combine the text overlay with original image
      try{var buffer = await res.toBuffer()}catch(err){log(err)}
      bot.createMessage(channel, '<@'+user+'> added **text**: `'+text+'`\n**position**: '+gravity+', **color**:'+color+', **blendmode**:'+blendmode+', **width**:'+width+', **height**:'+height+', **font**:'+font+', **extendimage**:'+extendimage+', **extendcolor**:'+extendcolor, {file: buffer, name: user+'-'+new Date().getTime()+'-text.png'})
    }catch(err){log(err)}
    timeEnd('textOverlay')
    */