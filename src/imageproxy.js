// Interactions with the image caching proxy server
const {Image,Op}=require('./db')
const axios=require('axios')
const fileType = import('file-type')

const get = async(url)=>{ // fetch image from image server, add to cache if not existing
    try{
        let img = await Image.findOne({where:{url:url}})
        if(img){return img.data}
        // proxy server doesn't have a copy, get it directly from url
        let res = await axios.get(url,{responseType:'arraybuffer'})
        img = Buffer.from(res.data)
        if(img){ //&&await isImage(img)
            await Image.create({url:url,data:img})// Add image to proxy server
            return img
        }
    } catch(err){
        throw(err)
    }
}

const remove = async(url)=>{ // remove a specific url from the caching proxy
    let img = await Image.findOne({where:{url:url}})
    if(!img) return
    img.destroy()
}

const purgeOld = async()=>{ // remove all images older then 24hrs
    try{
        let twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
        let deletedCount = await Image.destroy({where: {createdAt: {[Op.lt]: twentyFourHoursAgo}}})
        console.log(`Deleted ${deletedCount} old images from image caching proxy`)
    } catch(err) { console.log('Failed to purge old images from image caching proxy');console.log(err)}
}

const isImage = async(buffer)=>{
    const fileInfo = await fileType(buffer)
    return fileInfo !== undefined && fileInfo.mime.startsWith('image/')
}

module.exports = {
    imageproxy:{
        get,
        remove,
        purgeOld
    }
}