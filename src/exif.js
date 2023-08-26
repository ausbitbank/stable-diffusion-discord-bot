const ExifReader = require('exifreader')
const sharp = require('sharp')
const {log,debugLog} = require('./utils.js')
//const exiftool = require('exiftool-vendored').ExifTool
//const ExifParser = require('exif-parser')
//const { PNGImage, PNGChunk_tEXt } = require('png-chunk-editor')
//const pako = require('pako')

load=async(buf)=>{
    exif = ExifReader.load(buf)
    let width = exif['Image Width'].value
    let height = exif['Image Height'].value
    let results = {}
    //log(exif)
    // todo move this to invoke module after polish
    if(exif.invokeai_metadata&&exif.invokeai_graph){
        meta=JSON.parse(exif.invokeai_metadata.value)
        let seed = meta.seed
        let model = meta.model
        let clipskip = meta.clip_skip
        let loras=meta.loras
        let graph = JSON.parse(exif.invokeai_graph.value)
        let positive_prompt=meta.positive_prompt
        let negative_prompt=meta.negative_prompt
        let scale=meta.cfg_scale
        let steps=0
        let pixelSteps=0
        let genWidth=0
        let genHeight=0
        let lscale=1
        let controlnets=meta.controlnets
        let inputimages=[]
        let scheduler=meta.scheduler
        for (const i in graph.nodes){
            let n = graph.nodes[i]
            if(n.type==='noise'){
                genWidth=n.width
                genHeight=n.height
            }
            if(n.type==='t2l'){
                steps=steps+n.steps
                pixelSteps=pixelSteps+((genWidth*genHeight)*n.steps)
            }
            if(n.type==='lscale'){lscale=n.scale_factor}
            if(n.type==='l2l'){
                steps=steps+(n.steps*n.strength)
                pixelSteps=pixelSteps+(((genHeight*genWidth)*lscale)*(n.steps*n.strength))
            }
            if(n.type==='controlnet'){
                controlnets.push({controlnet:n.control_model,weight:n.control_weight,begin:n.begin_step_percent,end:n.end_step_percent,mode:n.control_mode,resize:n.resize_mode})
                if(n.image){inputimages.push({name:n.image.image_name})}
            }
        }
        let cost=(pixelSteps/7864320) // 1 normal 30 step 512x512 render to 1 coin
        cost = Math.round((cost + Number.EPSILON) * 1000) / 1000 // max 3 decimals, if needed
        results.invoke={positive_prompt:positive_prompt,negative_prompt:negative_prompt,pixelSteps:pixelSteps,steps:steps,genHeight:genHeight,genWidth:genWidth,loras:loras,seed:seed,cost:cost,scheduler:scheduler,model:model,scale:scale}
        //log(results.invoke)
    }
    return results
}

read=async(buf)=>{ // fails to detect invokeai_graph tags, totally different output to load ^^
    let img=sharp(buf)
    let exif=await img.metadata()
    return exif
}

save=async(buf,parent,tag,data)=>{
    let img = sharp(buf)
    let newbuffer=img.withMetadata().withMetadata({exif:{parent:{tag:data}}}).toBuffer().then((newbuffer=>{return newbuffer}))
    //let meta = await read(buf)
    //log(meta)
    let newmeta=meta
    newmeta[parent] = meta[parent] ? meta[parent] : {} // if parent exists, copy, if not create it
    if(newmeta[parent][tag]){log('exif: key '+parent+' '+tag+' already existed with data, overwriting: '+newmeta[parent][tag])}
    newmeta[parent][tag]=data
    log(newmeta)
    //await img.withMetadata({exif: {IFD0: {ImageDescription: 'example'}}})
    await img.withMetadata(newmeta)
}

// newbuf = await exif.edit(buf,'initimg','url','arty')
edit=async(buf,key,value,parent='arty')=>{
    /*
    let pngimage = PNGImage.fromBytes([...buf])
    log(pngimage.chunks)
    let textChunk = pngimage.getChunk(pngimage.getChunkIndex("tEXt"))
    log(textChunk)
    //log(pako.deflate(textChunk))
    //pngimage.insertChunk(new PNGChunk_tEXt(key,value), 1)
    //log(exifData)
    //exifData[parent] = {}
    //exifData[parent][key] = value
    let newbuf = pngimage.toBytes()
    //let newbuf=ExifParser.create(exifData).encode()
    */
    return newbuf
}

module.exports={exif:{load,save,read,edit}}
