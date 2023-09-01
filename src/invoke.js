// All functions that directly touch invoke should be handled and/or exported from here
// Abstract and simplify external interface as much as possible

const {config,log,debugLog,getUUID,validUUID,urlToBuffer,sleep,shuffle,tidyNumber}=require('./utils.js')
const {random}=require('./random.js')
const {exif}=require('./exif.js')
const io = require('socket.io-client')
const axios = require('axios')
const FormData = require('form-data')
var colors = require('colors')
const { isString, isObject } = require('lodash')
const parseArgs = require('minimist')
var cluster=config.cluster
const init=async()=>{
    // Setup cluster of invoke ai backends starting with primary
    let initmsg=''
    let primaryBackendOnline=null
    let err=null
    for (const d in cluster){
    //cluster.forEach(async (c)=>{
        let c=cluster[d]
        try{
            if(c.disabled){
                debugLog(c.name+' is disabled, skipping')
                break
            }
            // on connect, get all the backend info we can in parallel
            c.id=getUUID()
            const [version, models, lora, ti, vae, controlnet, cfg] = await Promise.all([getVersion(c),getModels(c,'main'),getModels(c,'lora'),getModels(c,'embedding'),getModels(c,'vae'),getModels(c,'controlnet'),getConfig(c)])
            c.version = version
            c.models = models
            c.lora = lora
            c.ti = ti
            c.vae = vae
            c.controlnet = controlnet
            c.config = cfg
            c.online=true
            c.jobs=[] // session id's we haven't collected results for yet
            msg='Connected to '.bgGreen.black+c.name.bgGreen+' with InvokeAI Version: '+c.version+'\nModels: '+c.models.length+',Loras: '+c.lora.length+', Embeddings: '+c.ti.length+', Vaes: '+c.vae.length+', Controlnets '+c.controlnet.length
            log(msg)
        } catch(err) {
            c.online=false;initmsg+='Failed to initialize invoke server '+c.name+' at '+c.url+'\n'+err
        }
    }
    if(primaryBackendOnline){
        return initmsg
    }else{
        throw(initmsg)
    }

}


buildGraphFromJob = async(job)=>{ // Build new nodes graph based on job details
    let graph = {
        id: getUUID(),
        nodes:{},
        edges:[]
    }
    let lastid={unet:null,clip:null,vae:null,latents:null,noise:null,image:null,width:null,height:null,controlnet:null}
    let pipe = (fromnode,fromfield,tonode,tofield)=>{return {source:{node_id:fromnode,field:fromfield},destination:{node_id:tonode,field:tofield}}}
    let node = (type,params,edges)=>{
        let newid=getUUID()
        graph.nodes[newid]={}
        graph.nodes[newid].type=type
        graph.nodes[newid].id=newid
        graph.nodes[newid].workflow=null
        Object.keys(params).forEach((k)=>{graph.nodes[newid][k]=params[k]})
        // by tracking and updating most recent used ids we can break the job into components easier
        if(['main_model_loader','sdxl_model_loader','sdxl_model_refiner_loader','lora_loader'].includes(type)){lastid.unet=newid}
        if(['main_model_loader','sdxl_model_loader','clip_skip','lora_loader'].includes(type)){lastid.clip=newid}
        if(['sdx_model_loader','sdxl_refiner_model_loader'].includes(type)){lastid.clip2=newid}
        if(['main_model_loader','vae_loader','denoise_latents'].includes(type)){lastid.vae=newid}
        if(['t2l','ttl','lscale','l2l','i2l','denoise_latents'].includes(type)){lastid.latents=newid}
        if(['noise'].includes(type)){lastid.noise=newid}
        if(['controlnet'].includes(type)){lastid.control=newid}
        if(['openpose_image_processor','l2i'].includes(type)){lastid.image=newid}
        edges.forEach(e=>{
            if(!validUUID(e.destination.node_id)){ // not already plumbed with a valid UUID
                if(e.destination.node_id==='SELF'){
                    e.destination.node_id=newid
                }else{
                    let nodenumber=e.destination.node_id.split('-')[1]?e.destination.node_id.split('-')[1]:0
                    let nodetype=e.destination.node_id.split('-')[0]
                    let i=0
                    Object.keys(graph.nodes).forEach(n=>{
                        if(graph.nodes[n].type===nodetype){
                            if(i===nodenumber){e.destination.node_id=graph.nodes[n].node_id
                            }else{}
                            i++
                        }
                    })
                }
            }
            if(!validUUID(e.source.node_id)){ // not already plumbed with a valid UUID
                if(e.source.node_id==='SELF'){
                    e.source.node_id=newid
                }else{
                    let nodenumber=e.source.node_id.split('-')[1]?parseInt(e.source.node_id.split('-')[1]):0
                    let nodetype=e.source.node_id.split('-')[0]
                    let i=0
                    Object.keys(graph.nodes).forEach(n=>{
                        if(graph.nodes[n].type===nodetype){
                            if(i===(Math.max(nodenumber-1,0))){
                                e.source.node_id=graph.nodes[n].id
                            }else{}
                            i++
                        }
                    })
                }
            }
            graph.edges.push(e)
        })
    }
    // Actual graph building starts here
    //      node(type,{parameters},[pipes])
    //      pipes flow backwards only to already created nodes eg
    //      pipe(from id, from field, to id, to field)
    //      id can either be actual id, or a type (type-number for multiples) or reference lastid.clip etc for most recent id's
    var p=[] // 
    // Metadata accumulator
    // todo add vae object and controlnets array
    let vae={model_name:'sd-vae-ft-mse',base_model:'sd-1'}
    let metaObject = {
        generation_mode:'txt2img',
        cfg_scale:job.scale,
        clip_skip:job.clipskip,
        height:job.height,
        width:job.width,
        positive_prompt:job.positive_prompt,
        negative_prompt:job.negative_prompt,
        rand_device:'cpu',
        scheduler:job.scheduler,
        steps:job.steps,
        model:job.model,
        loras:job.loras,
        controlnets:[],
        vae:vae,
        seed:0
    }
    node('metadata_accumulator',metaObject,[])
    if(['sd-1','sd-2'].includes(job.model.base_model)){
        // SD1/2 pipeline
        node('main_model_loader',{model:job.model},[])
        node('vae_loader',{vae_model:vae},[])
        if(job.initimgObject){
            debugLog('Adding init img to graph')
            // todo add auto preprocessing of init images for each type of controlnet
            if(job.control==='openpose'){
                debugLog('Adding openpose preprocessor')
                node('openpose_image_processor',{image:{image_name:job.initimgObject.image_name},hand_and_face:true,detect_resolution:512,image_resolution:512},[])
                p=[pipe('openpose_image_processor','image','SELF','image')]
            }
            node('controlnet',{
                image:{image_name:job.initimgObject.image_name},
                control_model:{model_name:job.control?job.control:'depth',base_model:'sd-1'},
                control_weight:job.controlweight?job.controlweight:1,
                begin_step_percent:job.controlstart?job.controlstart:0,
                end_step_percent:job.controlend?job.controlend:1,
                control_mode:job.controlmode?job.controlmode:'balanced',
                resize_mode:job.controlresize?job.controlresize:'just_resize',
                is_intermediate:true
            },p)
            p=[] // reset after use
            //node('collect',{is_intermediate:true},[pipe('controlnet','control','SELF','item')])
        }
        node('clip_skip',{skipped_layers:job.clipskip?job.clipskip:0},[pipe(lastid.clip,'clip','SELF','clip')])
        // lora loader, chain multiple loras with clip and unet into each other
        // KISS, hardcode withLora(add_detail,0.75) for now
        //node('lora_loader',{lora:{model_name:'add_detail',base_model:'sd-1'},weight:0.75},[pipe(lastid.clip,'clip','SELF','clip'),pipe(lastid.unet,'unet','SELF','unet')])
        if(job.loras?.length>0){
            for (const l in job.loras) {
                node('lora_loader',job.loras[l],[pipe(lastid.clip,'clip','SELF','clip'),pipe(lastid.unet,'unet','SELF','unet')])
            }
        }
        // add positive and negative prompts
        node('compel',{prompt:job.positive_prompt},[pipe(lastid.clip,'clip','SELF','clip')])
        node('compel',{prompt:job.negative_prompt},[pipe(lastid.clip,'clip','SELF','clip')])
        if(job.seed&&job.number===1){ // if seed supplied, force to single render mode
            node('noise',{width:job.width,height:job.height,use_cpu:true,seed:job.seed},[])
        }else{
            // generate random integer to use for seed
            node('rand_int',{low:0,high:2147483647},[])
            // sized range, size field acts as iteration counter that repeats job with random seeds
            node('range_of_size',{size:job.number,step:1},[pipe('rand_int','a','SELF','start')])
            // iterator plumbing, no options
            node('iterate',{is_intermediate:true},[pipe('range_of_size','collection','SELF','collection'),pipe('metadata_accumulator','seed','SELF','item')])
            // bring the latent noise, using cpu for reproducibility, set initial dimensions
            node('noise',{width:job.width,height:job.height,use_cpu:true},[pipe('iterate','item','SELF','seed')])
        }
        p = [
            pipe('compel','conditioning','SELF','positive_conditioning'),
            pipe('compel-2','conditioning','SELF','negative_conditioning'),
            pipe(lastid.noise,'noise','SELF','noise'),
            pipe(lastid.unet,'unet','SELF','unet')
        ]
        // text to latents, use prompt conditioning with latent noise to create latent representation of image at starter resolution
        // input image: If we used i2l earlier, we skip t2l below

        // if using controlnet, add that pipe too
        if(lastid.control){p.push(pipe(lastid.control,'control','SELF','control'))}

        // this denoise_latents node only applies to invoke >= 3.1
        node('denoise_latents',{is_intermediate:true,noise:null,steps:job.steps,cfg_scale:job.scale,denoising_start:0.0,denoising_end:1.0,scheduler:job.scheduler},p)
        // commented out below t2l below applies to invoke < 3.1
        //node('t2l',{steps:job.steps,cfg_scale:job.scale,scheduler:job.scheduler},p)

        if(job.lscale&&job.lscale!==1){ // upscale latents, low fidelity
            node('lscale',{scale_factor:job.lscale,mode:'nearest',antialias:false},[pipe(lastid.latents,'latents','SELF','latents')])
            // add more latent noise at the new resolution, using cpu again
            let a = {use_cpu:true}
            p=[pipe('lscale','width','SELF','width'),pipe('lscale','height','SELF','height')]
            if(job.seed&&job.number===1){ a.seed=job.seed
            } else { p.push(pipe('iterate','item','SELF','seed'))}
            node('noise',a,p)
            // latents to latents, combining noise,latents,prompt conditioning
            let p=[pipe('compel','conditioning','SELF','positive_conditioning'),pipe('compel-2','conditioning','SELF','negative_conditioning'),pipe(lastid.noise,'noise','SELF','noise'),pipe(lastid.unet,'unet','SELF','unet'),pipe(lastid.latents,'latents','SELF','latents')]
            if(lastid.control){p.push(pipe(lastid.control,'control','SELF','control'))}
            node('l2l',{steps:job.steps,cfg_scale:job.scale,scheduler:job.scheduler,strength:job.strength},p)
            // latent to image
            node('l2i',{tiled:false,fp32:false},[pipe(lastid.vae,'vae','SELF','vae'),pipe(lastid.latents,'latents','SELF','latents'),pipe('metadata_accumulator','metadata','SELF','metadata')])
        } else { // bypass extra steps if not using latent scaling
            // latent to image
            node('l2i',{tiled:false,fp32:false,is_intermediate:(job.upscale&&job.upscale===2)?true:false},[pipe(lastid.vae,'vae','SELF','vae'),pipe(lastid.latents,'latents','SELF','latents'),pipe('metadata_accumulator','metadata','SELF','metadata')])
        }
        // optional upscale
        if(job.upscale&&job.upscale===2){node('esrgan',{model_name:'RealESRGAN_x2plus.pth'},[pipe(lastid.image,'image','SELF','image')])}
        // Tada! Graph built, submit to backend
        if(graph){
            //debugLog(graph)
            return graph
        }
    }else{
        // SDXL pipeline
        // todo polish, wire up more controls, consider integrating into sd1/2 pipeline if it can be done cleanly
        node('sdxl_model_loader',{model:job.model},[])
        node('sdxl_compel_prompt',{prompt:job.positive_prompt,original_width:1024,original_height:1024,crop_top:0,crop_left:0,target_width:1024,target_height:1024},[pipe('sdxl_model_loader','clip','SELF','clip'),pipe('sdxl_model_loader','clip2','SELF','clip2')])
        node('sdxl_compel_prompt',{prompt:job.negative_prompt,original_width:1024,original_height:1024,crop_top:0,crop_left:0,target_width:1024,target_height:1024},[pipe('sdxl_model_loader','clip','SELF','clip'),pipe('sdxl_model_loader','clip2','SELF','clip2')])
        node('noise',{is_intermediate:false,width:1024,height:1024,use_cpu:true,seed:job.seed||random.seed()},[])
        node('denoise_latents',{is_intermediate:false,steps:job.steps,cfg_scale:job.scale,denoising_start:0.0,denoising_end:0.8,scheduler:job.scheduler},[pipe(lastid.unet,'unet','SELF','unet'),pipe('sdxl_compel_prompt','conditioning','SELF','positive_conditioning'),pipe('sdxl_compel_prompt-2','conditioning','SELF','negative_conditioning'),pipe('noise','noise','SELF','noise')])
        node('l2i',{is_intermediate:false,tiled:false,fp32:false},[pipe('denoise_latents','latents','SELF','latents'),pipe('sdxl_model_loader','vae','SELF','vae')])
        node('sdxl_refiner_model_loader',{is_intermediate:false,model:{model_name:'sdxl_refiner_1.0',base_model:'sdxl-refiner',model_type:'main'}},[])
        node('sdxl_refiner_compel_prompt',{prompt:job.positive_prompt,original_width:1024,original_height:1024,crop_top:0,crop_left:0,target_width:1024,target_height:1024,aesthetic_score:6.0},[pipe('sdxl_refiner_model_loader','clip2','SELF','clip2')])
        node('sdxl_refiner_compel_prompt',{prompt:job.negative_prompt,original_width:1024,original_height:1024,crop_top:0,crop_left:0,target_width:1024,target_height:1024,aesthetic_score:2.5},[pipe('sdxl_refiner_model_loader','clip2','SELF','clip2')])
        node('denoise_latents',{is_intermediate:false,steps:job.steps,cfg_scale:job.scale,denoising_start:0.8,denoising_end:1.0,scheduler:job.scheduler},[
            pipe('sdxl_refiner_model_loader','unet','SELF','unet'),
            pipe('sdxl_refiner_compel_prompt','conditioning','SELF','positive_conditioning'),
            pipe('sdxl_refiner_compel_prompt-2','conditioning','SELF','negative_conditioning'),
            pipe('denoise_latents','latents','SELF','latents')
        ])
        node('l2i',{is_intermediate:false,tiled:false,fp32:false},[
            pipe('denoise_latents-2','latents','SELF','latents'),
            pipe('sdxl_refiner_model_loader','vae','SELF','vae')
        ])
        if(graph){
            //debugLog(graph)
            return graph
        }
    }
}

const postSession = async (host, graph) => {
    try {
        const response = await axios.post(host.url + '/api/v1/sessions/', graph)
        return response.data.id
    } catch (err) {
        console.error('Error posting session', err)
        throw err
    }
}

const cancelSession = async(host,id) => {
    try {
        let u=host.url+'/api/v1/sessions/'+id+'/invoke'
        debugLog('cancel session '+id+' on '+host.name)
        let response = axios.delete(u)
    } catch (e) {
        log(e.response.statusText)
        throw(e.response.statusText)
    }
}

const startSession = async(host,id)=>{
    try {
        let u=host.url+'/api/v1/sessions/'+id+'/invoke?all=true'
        let response = axios.put(u)
        return response
    } catch (e) {
        log(e.response.statusText)
        throw(e.response.statusText)
    }
}

const findHost = async(job=null)=>{
    // find host with the required models, embeds, etc that isn't currently busy
    let availableHosts=cluster.filter(h=>{return h.online&&!h.disabled})
    //if(job?.host){return cluster[job.host]}
    if(job===null&&availableHosts.length>0){
        debugLog('No job info supplied, returning random available host')
        return availableHosts[0]
    }
    if(isString(job?.model)){
        debugLog('Job.model is a string, convert to model object')
        try{ job.model=await modelnameToObject(job.model)
        }catch(err){
            log('error in findHost model search')
            log(err)
            throw(err)
        }
    }
    let filteredHosts = availableHosts.filter(host => {return host.models.some(model => model.name === job.model.name)})
    // todo sort online hosts by priority value
    if(filteredHosts.length > 0) {
        return filteredHosts[Math.floor(Math.random() * filteredHosts.length)]
    } else {
        throw('No host with required model found') 
    }
}

const pollSession = async(host,id)=>{
    // I hate this solution, but it works for now.
    // Ideally we should subscribe to session via websocket
    let ms=1000
    let err=false
    while(!err) {
        try{
            let sesh = await getSession(host,id)
            if(Object.keys(sesh.errors).length>0){err=true;throw(sesh.errors)}
            if(isSessionComplete(sesh,host.name)){ return sesh
            } else {
                await sleep(ms)
                ms=ms*1.20 // increase poll interval by 20% each time
                if(ms>=15000){ms=1000} // reset once we hit 30 second polling
            }
        }catch(e){
            log(e)
            err=true
        }
    }
}

const getSessionStats = (session)=>{
    let stats = {
        id:session.id,
        results:session.results
    }
    for (const r in stats.results){
        log(stats.results[r])
    }
}

// a tmp cache to reduce redundant progress logs, remove when we update to websocket progress subscriptions
let isctmp = [] 

const isSessionComplete = (session,hostname)=>{
    // return true/false eventually, use debug logging for progress updates
    isctmpnew = hostname+' '+session.id+' : '+Object.keys(session.results).length+' / '+Object.keys(session.execution_graph.nodes).length
    if(!isctmp.includes(isctmpnew)){ // check if we've already posted this message recently
        debugLog(isctmpnew)
        isctmp.push(isctmpnew) // add message to cache
        if(isctmp.length>10){isctmp.slice(-10)} // maximum of 10 in cache, slice to size
    }
    if(Object.keys(session.results).length===Object.keys(session.execution_graph.nodes).length){return true
    }else{return false}
}

getSessionImages = async(host,session)=>{
    // return an array of image objects from session results
    try{
        debugLog(host.name+' '+session.id+' getSessionImages')
        let ia=[]
        let results=[]
        for (const r of Object.keys(session.results)){
            let result=session.results[r]
            if(result.type==='image_output'){ia.push(result)} // &&result.is_intermediate!==true
        }
        for (const i of ia){
            i.name=i.image.image_name
            i.buffer = await getImageBuffer(host,i.name)
            if(i.buffer?.error){return {error:i.buffer.error}}
            if(host.deleteAfterRender)deleteImage(host,i.name)
            results.push(i)
        }
        if(results.length===0){
            log('No images found in session')
        }
        return results
    } catch(err){log(err)}
}

const deleteImage = async(host,name)=>{
    try{
        u = host.url+'/api/v1/images/i/'+name
        debugLog('Deleting image '+name+' from '+host.name)
        await axios.delete(u)
    } catch (err) {throw(err)}
}

subscribe = async(host,id)=>{
    let socket = new io(host.url+'/ws/',{timeout: 60000,path: '/ws/socket.io'})
    debugLog('subscribing to '+id)
    socket.emit('subscribe',{'session':id},(answer)=>{
        log(answer)
    })
    socket.onAny((eventName, ...args) => {
        log(eventName)
        log(args)
    })
    socket.on('message',(m=>{
        log(m)
    }))
}

const getVersion = async(host)=>{
    try{
        let u = host.url+'/api/v1/app/version'
        let response = await axios.get(u)
        return response.data.version
    } catch (err){
        throw(err)
    }
}

const getConfig = async(host)=>{
    try{
        let u = host.url+'/api/v1/app/config'
        let response = await axios.get(u)
        return response.data
    } catch (err){
        throw(err)
    }
}

const getModels = async(host,type='main')=>{
    // type can be embedding , main , vae , controlnet , lora
    try {
        let u = host.url+'/api/v1/models/?model_type='+type
        let response = await axios.get(u)
        return response.data?.models
    } catch (err) {
        throw(err)
    }
}

const getSessions = async(host)=>{
    try {
        let u = host.url+'/api/v1/sessions/'
        let response = await axios.get(u)
        return r.data?.items
    } catch (err) {
        throw(err)
    }
}

const getSession = async(host,id)=>{
    try {
        let u = host.url + '/api/v1/sessions/' + id
        const response = await axios.get(u)
        return response.data
    } catch (err) {
        console.error('Error getting session', err)
        throw err
    } 
}

const getImages = async(host)=>{
    try {
        let u = host.url+'/api/v1/images/?board_id=none&categories=control&categories=mask&categories=user&categories=other&is_intermediate=false&limit=0&offset=0'
        let response = axios.get(u)
        return r.data?.items
    } catch (err) {
        throw(err)
    }
}

const getImage = async(host,name)=>{
    try {
        let u = host.url+'/api/v1/images/'+name
        let r = axios.get(u)
        return r.data
    } catch (err) {
        throw(err)
    }
}

const getImageBuffer = async(host,name)=>{
    try {
        let u = host.url+'/api/v1/images/i/'+name+'/full'
        let buf = urlToBuffer(u)
        return buf
    } catch (err) {
        throw(err)
    }
}

getHeaders=(form)=>{
    form.getLength((err, length) => {
        if(err){throw(err)}
        let headers=Object.assign({'Content-Length': length}, form.getHeaders())
        return headers
    })
}

uploadInitImage=async(host,buf,id)=>{
    try{
        let form = new FormData()
        form.append('data',JSON.stringify({kind:'init'}))
        form.append('file',buf,{contentType:'image/png',filename:id+'.png'})
        let headers = await getHeaders(form)
        let url=host.url+'/api/v1/images/upload?image_category=user&is_intermediate=false'
        let response = await axios.post(url,form,{headers:headers})
        return response.data    
    } catch (err) {
        throw(err.code)
    }
}

const auto2invoke = (text)=>{
  // convert auto1111 weight syntax to invokeai
  // todo convert lora syntax eg <lora:add_detail:1> to withLora(add_detail,1)
  const regex = /\(([^)]+):([^)]+)\)/g
  return text.replaceAll(regex, function(match, $1, $2) {
    return '('+$1+')' + $2
  })
}

const jobFromDream = async(cmd,img=null)=>{
    // input oldschool !dream format, output job object
    var job = parseArgs(cmd,{})//string: ['sampler','text_mask'],boolean: ['seamless','hires_fix']}) // parse arguments //
    // set argument aliases
    if(job.s){job.steps=job.s;delete job.s}
    if(job.S){job.seed=job.S;delete job.S}
    if(job.W){job.width=job.W;delete job.W}
    if(job.H){job.height=job.H;delete job.H}
    if(job.C){job.scale=job.C;delete job.C}
    if(job.A){job.sampler=job.A;delete job.A}
    if(job.f){job.strength=job.f;delete job.f}
    if(job.hrf){job.hires_fix=job.hrf;delete job.hrf}
    if(job.n){job.number=job.n;delete job.n}
    if(job.sampler){job.scheduler=job.sampler;delete job.sampler}
    // take prompt from what's left
    job.prompt=job._.join(' ')
    if(img){job.initimg=img}
    return validateJob(job)
}

const jobFromMeta = async(meta,img=null)=>{
    let job = {}
    if(meta.invoke?.prompt){
        job.prompt=meta.invoke?.prompt
    }else if(meta.invoke?.positive_prompt && meta.invoke?.negative_prompt){
        job.prompt = meta.invoke.positive_prompt+'['+meta.invoke.negative_prompt+']'
    }
    if(img){job.initimg=img}
    if(meta.invoke?.inputImageUrl){
        job.initimg=await urlToBuffer(meta.invoke?.inputImageUrl)
    }else{job.initimg=null}
    job.steps = meta.invoke?.steps ? meta.invoke.steps : config.default.steps
    job.width = meta.invoke?.width ? meta.invoke.width : config.default.size
    job.height = meta.invoke?.height ? meta.invoke.height : config.default.size
    job.scheduler = meta.invoke?.scheduler ? meta.invoke.scheduler : config.default.scheduler
    job.loras = meta.invoke?.loras ? meta.invoke.loras : []
    job.scale = meta.invoke?.scale ? meta.invoke.scale : config.default.scale
    job.model = meta.invoke?.model ? meta.invoke.model : config.default.model
    return validateJob(job)
}

const jobFromGraph = async(graph)=>{
    // input invokeai graph taken from image metadata, output job object
}

const getDiffusionResolution = (number)=>{
    // Diffusion resolution needs to be divisible by a specific number
    // invoke2 = 64 , invoke3 = 8
    let smallestResStep = 8
    const quotient = Math.floor(number / smallestResStep)  // Get the quotient of the division
    const closestNumber = quotient * smallestResStep  // Multiply the quotient by res step to get the closest number
    return closestNumber
}

const extractLoras = async(inputstring)=>{
    // extract Loras in withLora(name,weight) format into job.loras
    const regex = /withLora\((\w+)(?:,(\w+))?\)/g
    const matches = [...inputstring.matchAll(regex)]
    const loras = matches.map(match =>({
        lora: match[1],
        weight: parseFloat(match[2]) || 0.85
    }))
    for (const l in loras){
        let lo = await loranameToObject(loras[l].lora)
        if(!lo) return {error:'Lora not found'}
        loras[l].lora = lo
    }
    const strippedString = inputstring.replace(regex,'')
    const response = {
        loras: loras,
        strippedString: strippedString,
        error: null
    }
    return response
}

const validateJob = async(job)=>{
    // examine job object, reject on invalid parameters, add defaults as required
    // if no prompt, get a random one
    if(!job.prompt||job.prompt.length===0) job.prompt=random.get('prompt')
    // replace randomisers
    job.prompt=random.parse(job.prompt)
    // convert prompt weighting from auto1111 format to invoke/compel
    job.prompt=auto2invoke(job.prompt)
    // extract Loras in withLora(name,wieght) format into job.loras
    try{
        let el = await extractLoras(job.prompt)
        if(el.error){return {error:el.error}}
        job.prompt = el.strippedString
        job.loras = el.loras
    } catch(err){
        return {error: ':warning: '+err}
    }
    // split into positive/negative prompts
    const npromptregex = /\[(.*?)\]/g // match content of [square brackets]
    const npromptmatches = job.prompt.match(npromptregex)
    if(npromptmatches?.length>0){job.negative_prompt=npromptmatches.join(' ').replace('[','').replace(']','')
    }else{job.negative_prompt='<neg-sketch-3>,blur'}
    job.positive_prompt=job.prompt.replace(npromptregex,'')
    // set defaults if not already set
    if(!job.number){job.number=1}else if(job.number>1&&job.seed){delete job.seed} // cannot feed a seed into the iterator afaik
    if(!job.seed&&job.number!==1||!Number.isInteger(job.seed)||job.seed<1||job.seed>4294967295){job.seed=random.seed()}
    if(!job.model){job.model=await modelnameToObject(config.default.model)}//{model_name:'degenerate526urpm',base_model:'sd-1',model_type:'main'}}
    if(!job.steps){job.steps=config.defaultSteps? config.defaultSteps : 30}
    if(job.steps>config.maximum.steps){return{error:'Steps `'+job.steps+'` is above the current maximum step count `'+config.maximum.steps+'`'}}
    if(!job.width){job.width=config.defaultSize? config.defaultSize : 512}
    if(!job.height){job.height=config.defaultSize? config.defaultSize : 512}
    job.height=getDiffusionResolution(job.height)
    job.width=getDiffusionResolution(job.width)
    if(config.maximum.pixels&&(job.width*job.height)>config.maximum.pixels){
        let error = 'Width `'+job.width+'` x Height `'+job.height+'` = `'+tidyNumber(job.width*job.height)+'` , above the current maximum pixel count of `'+tidyNumber(config.maximum.pixels)+'`'
        debugLog(error)
        return {error:error}
        //job.width=config.default.size?config.default.size:512
        //job.height=config.default.size?config.default.size:512
    }
    if(!job.scale){job.scale=config.default.scale? config.default.scale : 0.7}
    // scheduler must be one of these
    let validSchedulers=config.schedulers||['ddim','ddpm','deis','lms','lms_k','pndm','heun','heun_k','euler','euler_k','euler_a','kdpm_2','kdpm_2_a','dpmpp_2s','dpmpp_2s_k','dpmpp_2m','dpmpp_2m_k','dpmpp_2m_sde','dpmpp_2m_sde_k','dpmpp_sde','dpmpp_sde_k','unipc']
    if(!job.scheduler){job.scheduler=config.default.scheduler? config.default.scheduler : 'dpmpp_2m_sde_k'}
     // lscale min 1 max 3 default 1
    if(!job.lscale||job.lscale<1||job.lscale>3){job.lscale=1}
    if(!job.clipskip){job.clipskip=0}
    if(!job.upscale){job.upscale=0}
    if(job.controlresize&&['just_resize','crop_resize','fill_resize'].includes(job.controlresize)===false){job.controlresize='just_resize'}
    if(job.controlmode&&['balanced','more_prompt','more_control','unbalanced'].includes(job.controlresize)===false){job.controlresize='just_resize'}
    //debugLog(job)
    if(true){ // final check, good to go
        return cast(job)
    }
}

const rawGraphResponse = async(host,graph)=>{
    let id = await postSession(host,graph)
    //debugLog(id)
    await startSession(host,id)
    let session = await pollSession(host,id)
    return session
}

const auditGraph = async(job)=>{
    // audit a completed job graph for cost/time
}

const extractMetaFromSession = async(session)=>{
}

const hostHasModel = async(host,model)=>{
    if(host?.models?.includes(model)){ return true
    } else { return false}
}

const modelnameToObject = async(modelname)=>{
    // look up models available on hosts
    let availableHosts=cluster.filter(h=>{return h.online&&!h.disabled})
    for (const h in availableHosts){
        let host=cluster[h]
        let model=host.models.find(m=>{return m.model_name===modelname})
        if(isObject(model)){
            return {
                model_name: model.model_name,
                base_model: model.base_model,
                model_type: model.model_type,
                description: model.description
            }
        }else{ log('No model with name '+modelname+' on host '+host.name)}
    }
    return {error:'Unable to find online host with model: `'+modelname+'`'}
}

const loranameToObject = async(loraname)=>{
    // look up loras available on hosts
    let availableHosts=cluster.filter(h=>{return h.online&&!h.disabled})
    for (const h in availableHosts){
        let host=cluster[h]
        let lora=host.lora.find(m=>{return m.model_name===loraname})
        if(isObject(lora)){ 
            return {
                model_name: lora.model_name,
                base_model: lora.base_model,
                model_type: lora.model_type,
                description: lora.description
            }
        }else{log('Error: No lora with name '+loraname+' on host '+host.name)}
    }
    throw('Unable to find online host with lora: `'+loraname+'`')
}

getHostById = (id)=>{return cluster.find(h=>{h.id===id})}
getHostByName = (name)=>{return cluster.find(h=>{h.name===name})}
getHostByJobId = (id)=>{return cluster.find(h=>{h.jobs.includes(id)})}

cast = async(job)=>{
    // easy mode, submit job, receive results
    const context = {
        job,
        host:null,
        sessionId:null,
        images:[]
    }
    try{
        context.host=await findHost(context.job)
        if(context.job.initimg){
            debugLog('Uploading initimg')
            initimgid = getUUID()
            context.job.initimgObject = await uploadInitImage(context.host,context.job.initimg,initimgid)
            if(!context.job.control){context.job.control='depth'}
        }
        let graph = await buildGraphFromJob(context.job)
        context.sessionId = await postSession(context.host,graph)
        debugLog(context.host.name+' starting '+context.sessionId)
        await startSession(context.host,context.sessionId)
        let session = await pollSession(context.host,context.sessionId) // returned finished session
        debugLog(context.host.name+' '+context.sessionId+' collecting images ')
        context.images = await getSessionImages(context.host,session)
        if(context.images?.error){resolve({error:context.images?.error})}
        if(context.job.initimgObject)deleteImage(context.host,context.job.initimgObject.image_name) // remove uploaded image after use
        let result = {
            job:context.job,
            host:context.host,
            images:context.images,
            session:session
        }
        return result
    }catch(err){
        return {error:err}
    }
}

init().then((r)=>{log(r)}).catch(e=>{log(e)})

module.exports = {
    cluster,
    invoke:{
        init,
        cast,
        jobFromDream,
        jobFromMeta,
        validateJob,
        rawGraphResponse,
        findHost
    }
}
