const {config,log,debugLog}=require('./utils')
const axios = require('axios')
const rembg = config.rembg||'http://rembg:5000/api/remove?url='

// js implementation of python rembg lib, degrades quality, needs more testing
/*
//  var image=(await axios({ url: url, responseType: "arraybuffer" })).data
//  image = sharp(image)
//  const remBg = new Rembg({logging: false})
//  var remBgOutput = await remBg.remove(image)
//  var buffer = await remBgOutput.png().toBuffer()
*/
// original rembg python/docker version
// requires docker run -p 127.0.0.1:5000:5000 danielgatis/rembg s
// http://127.0.0.1:5000/?url=imgurl?model=u2net&a=true&ab=10&ae=10&af=240&bgc=0,0,0,0&ppm=true&om=false
// model = u2net,u2netp,u2net_human_seg,u2net_cloth_seg,silueta,isnet-general-use,isnet-anime
// a = alpha matting                          bool default false
// ab = alpha matting background threshold    int 0-255 default 10
// af = alpha matting foreground threshold    int 0-255 default 240
// ae = alpha erode size                      int 0-255 default 10
// om = only mask, returns the mask directly  bool default false
// ppm = post process mask (clean edges)      bool default false
// bgc = background color to insert           str 0,0,0,1 default none , 4 ints 0-255 for RGB + alpha

const removeBackground=async(url,model='u2net',a=false,ab=10,af=240,ae=10,om=false,ppm=true,bgc='0,0,0,0')=>{
    try{
        let fullUrl=rembg+encodeURIComponent(url)+'&model='+model+'&a='+a+'&ab='+ab+'&ae='+ae+'&af='+af+'&bgc='+bgc+'&ppm='+ppm+'&om='+om
        debugLog('Removing background from image using rembg: '+fullUrl)
        let buffer = await axios.get(fullUrl,{responseType: 'arraybuffer'})
        buffer = buffer.data ? Buffer.from(buffer.data) : undefined   
        newMsg='\n**model:**`'+model+'`, **alpha matting:**`'+a+'`, **background threshold:**`'+ab+'`, **alpha erode size:**`'+ae+'` **foreground threshold:**`'+af+'`, **background color:**`'+bgc+'`, **post process:**`'+ppm+'`, **only mask:** `'+om+'`'
        return {msg: newMsg,image: buffer}    
    }catch(err){return{error: err}}
    //var newMsgObject={content: newMsg,components:[{type: 1, components:[{type:2,style:2,label:"Fill transparency",custom_id:"twkinpaint",emoji:{name:'🖌️',id:null},disabled:false},{type:2,style:2,label:"Crop",custom_id:"twkcrop",emoji:{name:'✂️',id:null},disabled:false}]}]}
    //try{bot.createMessage(channel, newMsgObject, {file: buffer, name: user+'-bg.png'})}catch(err){log(err)}
    //}).catch((err)=>{log(err)})
}

module.exports = {
    removeBackground
}