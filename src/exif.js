const ExifReader = require('exifreader')
const sharp = require('sharp')
const {log,debugLog} = require('./utils.js')
const pngextract = require('png-chunks-extract')
const pngencode = require('png-chunks-encode')
const pngtext = require('png-chunk-text')



load=async(buf)=>{
    //buf = await modify(buf,'arty_meta','keyname','value')
    exif = ExifReader.load(buf)
    //debugLog(exif)
    let width = exif['Image Width'].value
    let height = exif['Image Height'].value
    let results = {}
    // todo move this to invoke module after polish
    if(exif.invokeai_metadata){ //&&exif.invokeai_graph
        let meta=null
        try {
            meta=JSON.parse(exif.invokeai_metadata.value)
        } catch(err){
            debugLog('Error parsing invokeai_metadata metadata')
            debugLog(err)
        }
        let seed = meta?.seed
        let model = meta?.model
        let clipskip = meta?.clip_skip
        let loras=meta?.loras
        let control, controlweight, controlstart, controlend, ipamodel, facemask, strength, lscale, invert, hrf, hrfwidth, hrfheight, prompt = null
        try{
            //debugLog(exif.invokeai_metadata.value)
            let workflow = JSON.parse(meta.arty)
            //debugLog('extracted job info from meta:')
            //debugLog(workflow)
            control = workflow?.control
            controlweight = workflow?.controlweight
            controlstart = workflow?.controlstart
            controlend = workflow?.controlend
            ipamodel = workflow?.ipamodel
            facemask = workflow?.facemask
            prompt = workflow?.prompt
            lscale = workflow?.lscale
            strength = workflow?.strength
            invert = workflow?.invert
            hrf = workflow?.hrf
            hrfwidth = workflow?.hrfwidth
            hrfheight = workflow?.hrfheight
            //width = workflow?.notes?.width
            //height = workflow?.notes?.height
        } catch(err){
            debugLog('Error parsing invokeai_workflow metadata')
            //debugLog(err)
        }
        let positive_prompt=meta?.positive_prompt
        let negative_prompt=meta?.negative_prompt
        //let prompt = positive_prompt
        //if(negative_prompt){prompt=prompt+' ['+negative_prompt+']'}
        let style=meta?.positive_style_prompt
        let negstyle=meta?.negative_style_prompt
        let scale=meta?.cfg_scale
        let steps=meta?.steps
        let pixelSteps=0
        let genWidth=exif['Image Width'].value
        let genHeight=exif['Image Height'].value
        let controlnets=meta?.controlnets
        let inputImageUrl=null
        let scheduler=meta?.scheduler
        // todo the entire graph was removed from metadata in invoke 3.1* update.. Need to find another way to calculate cost, pixelsteps, generation resolution (not final resolution)
        /*
        for (const i in graph?.nodes){
            let n = graph?.nodes[i]
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
            }
        }
        */
        let cost=(pixelSteps/7864320) // 1 normal 30 step 512x512 render to 1 coin
        if(exif.arty){
            let arty = JSON.parse(exif.arty.value)
            inputImageUrl=arty.inputImageUrl
        }
        cost = Math.round((cost + Number.EPSILON) * 1000) / 1000 // max 3 decimals, if needed
        results.invoke={
            positive_prompt,
            negative_prompt,
            pixelSteps,
            steps,
            width,
            height,
            genHeight,
            genWidth,
            loras,
            seed,
            cost,
            scheduler,
            model,
            scale,
            lscale,
            controlnets,
            inputImageUrl,
            clipskip,
            style,
            negstyle,
            control,
            controlweight,
            controlstart,
            controlend,
            ipamodel,
            facemask,
            prompt,
            strength,
            hrf,
            hrfheight,
            hrfwidth
        }
    }
    return results
}

modify=async(buf,parent,key,value)=>{
    // load all the chunk data from the buffer
    let chunks = pngextract(buf)
    // find the tEXt chunks
    let textChunks = chunks.filter(chunk=>{
        return chunk.name === 'tEXt'
    }).map(chunk=>{
        return pngtext.decode(chunk.data)
    })
    newdata = {}
    newdata[key] = value
    dataAlreadyExists=()=>{
        d = textChunks.filter(c=>{return c.value===JSON.stringify(newdata)})
        if(d.length>0){return true}else{return false}
    }
    if(dataAlreadyExists()){
        debugLog('already existed in original png metadata')
    } else {
        //debugLog('Splicing in new metadata')
        // splice in the new encoded tEXt chunk
        chunks.splice(-1,0,pngtext.encode(parent,JSON.stringify(newdata)))
    }
    // turn it all back into the original buffer format and return
    //let output = pngencode(chunks)
    buf = Buffer.from(pngencode(chunks))
    return buf

}

module.exports={exif:{load,modify}}
