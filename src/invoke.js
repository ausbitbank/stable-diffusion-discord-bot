const {config,log,debugLog,getUUID,validUUID,urlToBuffer,sleep}=require('./utils.js')
const {random}=require('./random.js')
const {exif}=require('./exif.js')
const io = require('socket.io-client')
const axios = require('axios')
const FormData = require('form-data')
var colors = require('colors')
const { isString, isObject } = require('lodash')
var cluster=config.cluster
const init=async()=>{
    return new Promise(async (resolve,reject)=>{
    // Setup cluster of invoke ai backends starting with primary
    let initmsg=''
    let primaryBackendOnline=null
    let err=null
    for (const d in cluster){
    //cluster.forEach(async (c)=>{
        let c=cluster[d]
        try{
            if(c.disabled)break
            // on connect, get all the backend info we can in parallel
            c.id=getUUID()
            c.version = await getVersion(c)
            c.models = await getModels(c,'main')
            c.lora = await getModels(c,'lora')
            c.ti = await getModels(c,'embedding')
            c.vae = await getModels(c,'vae')
            c.controlnet = await getModels(c,'controlnet')
            c.config = await getConfig(c)
            c.online=true
            c.jobs=[] // session id's we haven't collected results for yet
            msg='Connected to '.bgGreen.black+c.name.bgGreen+' with InvokeAI Version: '+c.version+'\nModels: '+c.models.length+',Loras: '+c.lora.length+', Embeddings: '+c.ti.length+', Vaes: '+c.vae.length+', Controlnets '+c.controlnet.length
            log(msg)
        } catch(err) {c.online=false;initmsg+='Failed to initialize invoke server '+c.name+' at '+c.url+'\n'+err}
    }
    if(primaryBackendOnline){resolve(initmsg)
    }else{reject(initmsg)}
})
}

// All functions that directly touch invoke should be handled and/or exported from here
// Abstract and simplify external interface as much as possible

buildGraphFromJob = async(job)=>{ // Build new nodes graph based on job details
    return new Promise(async (resolve,reject)=>{
        //log(job)
        let graph = {
            id: getUUID(),
            nodes:{},
            edges:[]
        }
        let lastid={unet:null,clip:null,vae:null,latents:null,noise:null,image:null,width:null,height:null,controlnet:null}
        let pipe = (fromnode,fromfield,tonode,tofield)=>{return {source:{node_id:fromnode,field:fromfield},destination:{node_id:tonode,field:tofield}}}
        let lora = (l,w)=>{
            // convert short lora name to lora object
            // assume sd-1 for now, lookup from embed db in future
            return {lora:{model_name:l,base_model:'sd-1'},weight: w}
        }
        let loras = (l)=>{
            /*
            input lora array
            [
                lora('add_detail',0.75),lora('pixel_art',0.5)

            ]
            add piped nodes to graph
            */
        }
        let node = (type,params,edges)=>{
            let newid=getUUID()
            graph.nodes[newid]={}
            graph.nodes[newid].type=type
            graph.nodes[newid].id=newid
            Object.keys(params).forEach((k)=>{graph.nodes[newid][k]=params[k]})
            // by tracking and updating most recent used ids we can break the job into components easier
            if(['main_model_loader','lora_loader'].includes(type)){lastid.unet=newid}
            if(['main_model_loader','clip_skip','lora_loader'].includes(type)){lastid.clip=newid}
            if(['main_model_loader','vae_loader'].includes(type)){lastid.vae=newid}
            if(['t2l','ttl','lscale','l2l','i2l'].includes(type)){lastid.latents=newid}
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
        let p=[] // 
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
            loras:[{lora:{model_name:'add_detail',base_model:'sd-1'},weight:0.75}],
            controlnets:[],
            vae:vae,
            seed:0
        }
        node('metadata_accumulator',metaObject,[])
        if(['sd-1','sd-2'].includes(job.model.base_model)){
            // SD1/2 pipeline
            node('main_model_loader',{model:job.model},[])
            node('vae_loader',{vae_model:vae},[])
            if(job.initimg){
                log(job.initimg)
                // todo add auto preprocessing of init images for each type of controlnet
                if(job.control==='openpose'){
                    debugLog('Adding openpose preprocessor')
                    node('openpose_image_processor',{
                        image:{image_name:job.initimg.image_name},
                        hand_and_face:true,
                        detect_resolution:512,
                        image_resolution:512
                    },[])
                    p=[pipe('openpose_image_processor','image','SELF','image')]
                }
                node('controlnet',{
                    image:{image_name:job.initimg.image_name},
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
            // text to latents, use prompt conditioning with latent noise to create latent representation of image at starter resolution
            // input image: If we used i2l earlier, we skip t2l below
            p =[pipe('compel','conditioning','SELF','positive_conditioning'),pipe('compel-2','conditioning','SELF','negative_conditioning'),pipe(lastid.noise,'noise','SELF','noise'),pipe(lastid.unet,'unet','SELF','unet')]
            if(lastid.control){p.push(pipe(lastid.control,'control','SELF','control'))}
            node('t2l',{steps:job.steps,cfg_scale:job.scale,scheduler:job.scheduler},p)
            if(job.lscale&&job.lscale!==1){ // upscale latents, low fidelity
                node('lscale',{scale_factor:job.lscale,mode:'nearest',antialias:false},[pipe(lastid.latents,'latents','SELF','latents')])
                // add more latent noise at the new resolution, using cpu again
                let a = {use_cpu:true}
                p=[pipe('lscale','width','SELF','width'),pipe('lscale','height','SELF','height')]
                if(job.seed&&job.number===1){ a.seed=job.seed
                } else { p.push(pipe('iterate','item','SELF','seed'))}
                //node('noise',a,[pipe('iterate','item','SELF','seed'),pipe('lscale','width','SELF','width'),pipe('lscale','height','SELF','height')])
                node('noise',a,p)
                // latents to latents, combining noise,latents,prompt conditioning
                let p=[pipe('compel','conditioning','SELF','positive_conditioning'),pipe('compel-2','conditioning','SELF','negative_conditioning'),pipe(lastid.noise,'noise','SELF','noise'),pipe(lastid.unet,'unet','SELF','unet'),pipe(lastid.latents,'latents','SELF','latents')]
                if(lastid.control){p.push(pipe(lastid.control,'control','SELF','control'))}
                node('l2l',{steps:job.steps,cfg_scale:job.scale,scheduler:job.scheduler,strength:job.strength},p)
                // latent to image
                node('l2i',{tiled:false,fp32:false},[pipe(lastid.vae,'vae','SELF','vae'),pipe(lastid.latents,'latents','SELF','latents')])//,pipe('metadata_accumulator','metadata','SELF','metadata')])
            } else { // bypass extra steps if not using latent scaling
                // latent to image
                node('l2i',{tiled:false,fp32:false,is_intermediate:(job.upscale&&job.upscale===2)?true:false},[pipe(lastid.vae,'vae','SELF','vae'),pipe(lastid.latents,'latents','SELF','latents'),pipe('metadata_accumulator','metadata','SELF','metadata')])
            }
            // optional upscale
            if(job.upscale&&job.upscale===2){
                node('esrgan',{model_name:'RealESRGAN_x2plus.pth'},[pipe(lastid.image,'image','SELF','image')])
            }
            // Tada! Graph built, submit to backend
            if(graph){log(graph);resolve(graph)}else{reject()}
        }else{ // SDXL pipeline
            reject()
            //todo 
        }
    })
}

postSession = async(host,graph)=>{
    return new Promise(async (resolve,reject)=>{
        // POST graph to /api/v1/sessions
        log('posting graph id '+graph.id+' to '+host.name)
        s=JSON.stringify(graph)
        let u=host.url+'/api/v1/sessions/'
        axios.post(u,graph)
            .then(r=>{resolve(r.data?.id)})
            .catch(e=>{
                log(e)
                let em='failed to post graph '+graph.id+' to '+host.name+'\nError: '+e?.code+' '+e?.response?.status+' '+e?.response?.statusText
                reject(em)})
        // PUT /api/v1/sessions/80fd0e46-ab60-4cdc-82b9-64769ccb65b5/invoke?all=true
    })
}

cancelSession = async(host,id)=>{
    let u=host.url+'/api/v1/sessions/'+id+'/invoke'
    debugLog('cancel session '+id+' on '+host.name)
    axios.delete(u)
        .then(response=>{return response.data})
        .catch(e=>{log(e.response.statusText);throw(e.response.statusText)})
    // DELETE /api/v1/session/{id}
}

startSession = async(host,id)=>{
    return new Promise(async (resolve,reject)=>{
        let u=host.url+'/api/v1/sessions/'
        //debugLog('start session '+id)
        axios.put(u+id+'/invoke?all=true')
            .then(()=>{resolve(true)}) // blank response
            .catch(e=>{log(e.response.statusText);reject(e.response.statusText)})
    })
}

findHost = async(job=null)=>{
    // find host with the required models, embeds, etc that isn't currently busy
    let availableHosts=cluster.filter(h=>{return h.online&&!h.disabled})
    if(job===null&&availableHosts.length>0){return availableHosts[0]}
    debugLog('Finding host for job')
    if(isString(job?.model)){
        debugLog('Job.model is a string, convert to model object')
        try{ job.model=await modelnameToObject(job.model)
        }catch(err){
            log('error in findHost model search')
            log(err)
            throw(err)
        }
    }
    // todo sort online hosts by priority value
    for (const i in availableHosts){
        let host = availableHosts[i]
        if(hostHasModel(host,job.model)){return host}
    }
    throw('Failed to find suitable available host')
}

pollSession = async(host,id)=>{
    // I hate this solution, but it works for now.
    // Ideally we should subscribe to session via websocket
    let ms=2000
    let err=false
    while(!err) {
        try{
            let sesh = await getSession(host,id)
            if(Object.keys(sesh.errors).length>0){err=true;throw(sesh.errors)}
            if(isSessionComplete(sesh)){ return sesh
            } else {
                await sleep(ms)
                ms=ms*1.20 // increase poll interval by 20% each time
                if(ms>=30000){ms=1000} // reset once we hit 30 second polling
            }
        }catch(e){
            log(e)
            err=true
        }
    }
}

getSessionStats = (session)=>{
    //log(session.results)
    let stats = {
        id:session.id,
        results:session.results
    }
    for (const r in stats.results){
        log(stats.results[r])
    }
}

isSessionComplete = (session)=>{
    // return true/false
    debugLog(session.id+' : '+Object.keys(session.results).length+' / '+Object.keys(session.execution_graph.nodes).length)
    if(Object.keys(session.results).length===Object.keys(session.execution_graph.nodes).length){return true
    }else{return false}
}

getSessionImages = async(host,session)=>{
    // return an array of image objects from session results
    try{
        log(host.name+' '+session.id+' getSessionImages')
        let ia=[]
        let results=[]
        for (const r of Object.keys(session.results)){
            let result=session.results[r]
            if(result.type==='image_output'){ia.push(result)} // &&result.is_intermediate!==true
        }
        for (const i of ia){
            i.name=i.image.image_name
            i.buffer = await getImageBuffer(host,i.name)
            if(host.deleteAfterRender)deleteImage(host,i.name)
            results.push(i)
        }
        if(results.length===0){
            log('No images found in session')
        }
        return results
    } catch(err){log(err)}
}

deleteImage = async(host,name)=>{
    u = host.url+'/api/v1/images/i/'+name
    log('deleting image '+name+' from '+host.name)
    axios.delete(u)
        .then(r=>{return r.data})
        .catch(e=>{throw(e)})
}

subscribe = async(host,id)=>{
    let socket = new io(host.url+'/ws/',{timeout: 60000,path: '/ws/socket.io'})
    log('subscribing to '+id)
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

getVersion = async(host)=>{
    return new Promise(async (resolve,reject)=>{
        axios.get(host.url+'/api/v1/app/version')
            .then(r=>{if(r.data.version){resolve(r.data.version)}else{reject(null)}})
            .catch(e=>{reject(e)})
    })
}

getConfig = async(host)=>{
    return new Promise(async (resolve,reject)=>{
        axios.get(host.url+'/api/v1/app/config')
            .then(r=>{if(r.data){resolve(r.data)}else{reject(null)}})
            .catch(e=>{log(e);reject(e)})
    })
}

getModels = async(host,type='main')=>{
    // type can be embedding , main , vae , controlnet , lora
    return new Promise(async (resolve,reject)=>{
        axios.get(host.url+'/api/v1/models/?model_type='+type)
            .then(r=>{if(r.data.models){resolve(r.data.models)}else{reject(null)}})
            .catch(e=>{log(e);reject(e)})
    })
}

getSessions = async(host)=>{
    return new Promise(async (resolve,reject)=>{
        axios.get(host.url+'/api/v1/sessions/')
            .then(r=>{if(r.data.items){resolve(r.data.items)}else{reject(null)}})
            .catch(e=>{log(e);reject(e)})
    })
}

getSession = async(host,id)=>{
    return new Promise(async (resolve,reject)=>{
        axios.get(host.url+'/api/v1/sessions/'+id)
            .then(r=>{if(r.data){resolve(r.data)}else{reject(null)}})
            .catch(e=>{log(e);reject(e)})
    })
}

getImages = async(host)=>{
    return new Promise(async (resolve,reject)=>{
        axios.get(host.url+'/api/v1/images/?board_id=none&categories=control&categories=mask&categories=user&categories=other&is_intermediate=false&limit=0&offset=0')
            .then(r=>{if(r.data.items){resolve(r.data.items)}else{reject(null)}})
            .catch(e=>{log(e);reject(e)})
    })
}

getImage = async(host,name)=>{
    return new Promise(async (resolve,reject)=>{
        axios.get(host.url+'/api/v1/images/'+name)
            .then(r=>{
                if(r.data){resolve(r.data)
                }else{reject(null)}})
            .catch(e=>{log('error');log(e);reject(e)})
    })
}

getImageBuffer = async(host,name)=>{
    return new Promise(async (resolve,reject)=>{
        let u = host.url+'/api/v1/images/i/'+name+'/full'
        log('getImageBuffer name '+name+' from '+host.url+'\n'+u)
        urlToBuffer(u)
            .then(buf=>{
                resolve(buf)
            })
            .catch(err=>{log('failed to get image '+name+' from '+host.name);reject(err)})
    })
}

getHeaders=(form)=>{
    return new Promise((resolve, reject) => {
        form.getLength((err, length) => {
            if(err){reject(err)}
            let headers=Object.assign({'Content-Length': length}, form.getHeaders())
            resolve(headers)
        })
    })
}

uploadInitImage=async(buf,id)=>{
    return new Promise((resolve,reject)=>{
        let form = new FormData()
        form.append('data',JSON.stringify({kind:'init'}))
        form.append('file',buf,{contentType:'image/png',filename:id+'.png'})
        getHeaders(form).then(headers=>{
            return axios.post(host.url+'/api/v1/images/upload?image_category=user&is_intermediate=false',form, {headers:headers})
        }).then((response)=>{resolve(response.data)}).catch(err=>reject(err.code))// {url,width,height,mtime,thumbnail}
    })
}

function auto2invoke(text) {
  // convert auto1111 weight syntax to invokeai
  // todo convert lora syntax eg <lora:add_detail:1> to withLora(add_detail,1)
  const regex = /\(([^)]+):([^)]+)\)/g
  return text.replaceAll(regex, function(match, $1, $2) {
    return '('+$1+')' + $2
  })
}

jobFromDream = async(cmd,img=null)=>{
    const parseArgs = require('minimist')
    // input oldschool !dream format, output job object
    var job = parseArgs(cmd,{})//string: ['sampler','text_mask'],boolean: ['seamless','hires_fix']}) // parse arguments //
    // set argument aliases
    if(job.s){job.steps=job.s;delete(job.s)}
    if(job.S){job.seed=job.S;delete(job.S)}
    if(job.W){job.width=job.W;delete(job.W)}
    if(job.H){job.height=job.H;delete(job.H)}
    if(job.C){job.scale=job.C;delete(job.C)}
    if(job.A){job.sampler=job.A;delete(job.A)}
    if(job.f){job.strength=job.f;delete(job.f)}
    if(job.hrf){job.hires_fix=job.hrf;delete(job.hrf)}
    if(job.n){job.number=job.n;delete(job.n)}
    if(job.sampler){job.scheduler=job.sampler;delete(job.sampler)}
    // take prompt from what's left
    job.prompt=job._.join(' ')
    if(img){job.initimg=img}
    return validateJob(job)
}

jobFromMeta = async(meta,img=null)=>{
    let prompt = meta.invoke.positive_prompt?meta.invoke.positive_prompt:''
    //if(meta.invoke.negative_prompt) prompt+='['+meta.invoke.negative_prompt+']'
    let job = {
        prompt:prompt,
        positive_prompt: meta.invoke.positive_prompt,
        negative_prompt: meta.invoke.negative_prompt,
        steps: meta.invoke.steps,
        width: meta.invoke.genWidth,
        height: meta.invoke.genHeight,
        scheduler: meta.invoke.scheduler,
        loras: meta.invoke.loras,
        scale: meta.invoke.scale
    }
    if(img){job.initimg=img}
    return validateJob(job)
}

jobFromGraph = async(graph)=>{
    // input invokeai graph taken from image metadata, output job object
}

getDiffusionResolution = (number)=>{
    // Diffusion resolution needs to be divisible by a specific number
    // invoke2 = 64 , invoke3 = 8
    let smallestResStep = 8
    const quotient = Math.floor(number / smallestResStep)  // Get the quotient of the division
    const closestNumber = quotient * smallestResStep  // Multiply the quotient by res step to get the closest number
    return closestNumber
}

extractLoras = async(inputstring)=>{
    // extract Loras in withLora(name,wieght) format into job.loras
    // todo fix format of returned lora array (convert string to object)
    const regex = /withLora\((\w+)(?:,(\w+))?\)/g
    const matches = [...inputstring.matchAll(regex)]
    const loras = matches.map(match =>({
        lora: match[1],
        weight: parseFloat(match[2]) || 0.85
    }))
    //log(loras)
    for (const l in loras){
        //log(loras[l].lora)
        let lo = await loranameToObject(loras[l].lora)
        //log(lo)
        loras[l].lora = lo
    }
    const strippedString = inputstring.replace(regex,'')
    const response = {
        loras: loras,
        strippedString: strippedString
    }
    log(response)
    return response
}

validateJob = async(job)=>{
    // examine job object, reject on invalid parameters, add defaults as required
    // if no prompt, get a random one
    if(!job.prompt||job.prompt.length===0) job.prompt=random.get('prompt')
    // replace randomisers
    job.prompt=random.parse(job.prompt)
    // convert prompt weighting from auto1111 format to invoke/compel
    job.prompt=auto2invoke(job.prompt)
    // extract Loras in withLora(name,wieght) format into job.loras
    let el = await extractLoras(job.prompt)
    job.prompt = el.strippedString
    job.loras = el.loras
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
    if(!job.width){job.width=config.defaultSize? config.defaultSize : 512}
    if(!job.height){job.height=config.defaultSize? config.defaultSize : 512}
    job.height=getDiffusionResolution(job.height)
    job.width=getDiffusionResolution(job.width)
    if(config.maximum.pixels&&(job.width*job.height)>config.maximum.pixels){
        log('Too many pixels, reset dimensions to default')
        job.width=config.default.size?config.default.size:512
        job.height=config.default.size?config.default.size:512
    }
    if(!job.scale){job.scale=config.default.scale? config.default.scale : 0.7}
    // scheduler must be one of these
    let validSchedulers=['ddim','ddpm','deis','lms','lms_k','pndm','heun','heun_k','euler','euler_k','euler_a','kdpm_2','kdpm_2_a','dpmpp_2s','dpmpp_2s_k','dpmpp_2m','dpmpp_2m_k','dpmpp_2m_sde','dpmpp_2m_sde_k','dpmpp_sde','dpmpp_sde_k','unipc']
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

rawGraphResponse = async(host,graph)=>{
    let id = await postSession(host,graph)
    log(id)
    await startSession(host,id)
    let session = await pollSession(host,id)
    return session
}

auditGraph = async(job)=>{
    // audit a completed job graph for cost/time
}

extractMetaFromSession = async(session)=>{
}

hostHasModel = async(host,model)=>{
    if(host?.models?.includes(model)){ return true
    } else { return false}
}

modelnameToObject = async(modelname)=>{
    // look up models available on hosts
    let availableHosts=cluster.filter(h=>{return h.online&&!h.disabled})
    for (const h in availableHosts){
        let host=cluster[h]
        let model=host.models.find(m=>{return m.model_name===modelname})
        if(isObject(model)){ return model
        }else{ log('No model with name '+modelname+' on host '+host.name)}
    }
    throw('Unable to find online host with model: `'+modelname+'`')
}

loranameToObject = async(loraname)=>{
    // look up loras available on hosts
    let availableHosts=cluster.filter(h=>{return h.online&&!h.disabled})
    for (const h in availableHosts){
        let host=cluster[h]
        let lora=host.lora.find(m=>{return m.model_name===loraname})
        if(isObject(lora)){ return lora
        }else{ log('No lora with name '+loraname+' on host '+host.name)}
    }
    throw('Unable to find online host with lora: `'+loraname+'`')
}

getHostById = (id)=>{return cluster.find(h=>{h.id===id})}
getHostByName = (name)=>{return cluster.find(h=>{h.name===name})}
getHostByJobId = (id)=>{return cluster.find(h=>{h.jobs.includes(id)})}

cast = async(job)=>{
    // easy mode, submit job, receive results
    return new Promise(async (resolve,reject)=>{
        try{
            host=await findHost(job)
            debugLog('found host for job: '+host.name)
            if(job.initimg){
                initimgid = getUUID()
                job.initimg = await uploadInitImage(job.initimg,initimgid)
                //log(job.initimg.image_name)
                if(!job.control){job.control='depth'}
            }
            let graph = await buildGraphFromJob(job)
            let id = await postSession(host,graph)
            debugLog(host.name+' starting '+id)
            await startSession(host,id)
            let session = await pollSession(host,id) // returned finished session
            debugLog(host.name+' '+id+' collecting images ')
            let images = await getSessionImages(host,session)
            if(job.initimg)deleteImage(host,job.initimg.image_name) // remove uploaded image after use
            let result = {
                job:job,
                host:host,
                images:images,
                session:session
            }
            //host.currentJob=null
            resolve(result)
        }catch(err){
            resolve({error:err})
        }
    })
}

init().then((r)=>{log(r)}).catch(e=>{log(e)})

module.exports = {
    cluster:cluster,
    invoke:{
        init:init,
        cast:cast,
        jobFromDream,
        jobFromMeta,
        validateJob,
        rawGraphResponse,
        findHost
    }
}
