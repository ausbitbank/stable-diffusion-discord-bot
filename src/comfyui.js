// Experimental comfyui support , starting with the most basic sd3 renders
// Raw request captured in browser
// {"client_id":"8c491c8244b64ea387ebebf50f37ab08","prompt":{"3":{"inputs":{"seed":125338548270506,"steps":30,"cfg":5.45,"sampler_name":"euler","scheduler":"sgm_uniform","denoise":1,"model":["4",0],"positive":["16",0],"negative":["40",0],"latent_image":["53",0]},"class_type":"KSampler"},"4":{"inputs":{"ckpt_name":"sd3_medium_incl_clips_t5xxlfp8.safetensors"},"class_type":"CheckpointLoaderSimple"},"8":{"inputs":{"samples":["3",0],"vae":["4",2]},"class_type":"VAEDecode"},"9":{"inputs":{"filename_prefix":"ComfyUI","images":["8",0]},"class_type":"SaveImage"},"16":{"inputs":{"text":"a bottle with a pink and red galaxy inside it on top of a wooden table on a table in the middle of a modern kitchen","clip":["4",1]},"class_type":"CLIPTextEncode"},"40":{"inputs":{"text":"","clip":["4",1]},"class_type":"CLIPTextEncode"},"53":{"inputs":{"width":1024,"height":1024,"batch_size":1},"class_type":"EmptySD3LatentImage"}},"extra_data":{"extra_pnginfo":{"workflow":{"last_node_id":53,"last_link_id":102,"nodes":[{"id":8,"type":"VAEDecode","pos":[1200,96],"size":{"0":210,"1":46},"flags":{},"order":6,"mode":0,"inputs":[{"name":"samples","type":"LATENT","link":7},{"name":"vae","type":"VAE","link":53,"slot_index":1}],"outputs":[{"name":"IMAGE","type":"IMAGE","links":[51],"slot_index":0}],"properties":{"Node name for S&R":"VAEDecode"}},{"id":9,"type":"SaveImage","pos":[1440,96],"size":{"0":952.5112915039062,"1":1007.9328002929688},"flags":{},"order":7,"mode":0,"inputs":[{"name":"images","type":"IMAGE","link":51,"slot_index":0}],"properties":{},"widgets_values":["ComfyUI"]},{"id":3,"type":"KSampler","pos":[864,96],"size":{"0":315,"1":262},"flags":{},"order":5,"mode":0,"inputs":[{"name":"model","type":"MODEL","link":99,"slot_index":0},{"name":"positive","type":"CONDITIONING","link":21},{"name":"negative","type":"CONDITIONING","link":80},{"name":"latent_image","type":"LATENT","link":100}],"outputs":[{"name":"LATENT","type":"LATENT","links":[7],"slot_index":0}],"properties":{"Node name for S&R":"KSampler"},"widgets_values":[125338548270506,"randomize",30,5.45,"euler","sgm_uniform",1]},{"id":40,"type":"CLIPTextEncode","pos":[384,336],"size":{"0":432,"1":192},"flags":{},"order":4,"mode":0,"inputs":[{"name":"clip","type":"CLIP","link":102}],"outputs":[{"name":"CONDITIONING","type":"CONDITIONING","links":[80],"shape":3,"slot_index":0}],"title":"Negative Prompt","properties":{"Node name for S&R":"CLIPTextEncode"},"widgets_values":[""],"color":"#322","bgcolor":"#533"},{"id":53,"type":"EmptySD3LatentImage","pos":[480,576],"size":{"0":315,"1":106},"flags":{},"order":0,"mode":0,"outputs":[{"name":"LATENT","type":"LATENT","links":[100],"shape":3,"slot_index":0}],"properties":{"Node name for S&R":"EmptySD3LatentImage"},"widgets_values":[1024,1024,1]},{"id":51,"type":"Note","pos":[-48,240],"size":{"0":384,"1":192},"flags":{},"order":1,"mode":0,"properties":{"text":""},"widgets_values":["sd3_medium_incl_clips.safetensors and sd3_medium_incl_clips_t5xxlfp8.safetensors will work with this workflow, just make sure they are in your ComfyUI/models/checkpoints folder."],"color":"#432","bgcolor":"#653"},{"id":16,"type":"CLIPTextEncode","pos":[384,96],"size":{"0":432,"1":192},"flags":{},"order":3,"mode":0,"inputs":[{"name":"clip","type":"CLIP","link":101}],"outputs":[{"name":"CONDITIONING","type":"CONDITIONING","links":[21],"slot_index":0}],"title":"Positive Prompt","properties":{"Node name for S&R":"CLIPTextEncode"},"widgets_values":["a bottle with a pink and red galaxy inside it on top of a wooden table on a table in the middle of a modern kitchen"],"color":"#232","bgcolor":"#353"},{"id":4,"type":"CheckpointLoaderSimple","pos":[-48,96],"size":{"0":384.75592041015625,"1":98},"flags":{},"order":2,"mode":0,"outputs":[{"name":"MODEL","type":"MODEL","links":[99],"slot_index":0},{"name":"CLIP","type":"CLIP","links":[101,102],"slot_index":1},{"name":"VAE","type":"VAE","links":[53],"slot_index":2}],"properties":{"Node name for S&R":"CheckpointLoaderSimple"},"widgets_values":["sd3_medium_incl_clips_t5xxlfp8.safetensors"]}],"links":[[7,3,0,8,0,"LATENT"],[21,16,0,3,1,"CONDITIONING"],[51,8,0,9,0,"IMAGE"],[53,4,2,8,1,"VAE"],[80,40,0,3,2,"CONDITIONING"],[99,4,0,3,0,"MODEL"],[100,53,0,3,3,"LATENT"],[101,4,1,16,0,"CLIP"],[102,4,1,40,0,"CLIP"]],"groups":[],"config":{},"extra":{"ds":{"scale":1.1000000000000003,"offset":[162.43082104175153,127.49053741615663]}},"version":0.4,"seed_widgets":{"3":0}}}}}
/*
{"type": "status", "data": {"status": {"exec_info": {"queue_remaining": 1}}}}
{"type": "execution_start", "data": {"prompt_id": "be3a5eff-2316-4c60-98ac-96b654da618a"}}
{"type": "execution_cached", "data": {"nodes": [], "prompt_id": "be3a5eff-2316-4c60-98ac-96b654da618a"}}
{"type": "executing", "data": {"node": "4", "prompt_id": "be3a5eff-2316-4c60-98ac-96b654da618a"}}
{"type": "progress", "data": {"value": 1, "max": 30, "prompt_id": "be3a5eff-2316-4c60-98ac-96b654da618a", "node": "3"}} <-- value is tracking current step
{"type": "executed", "data": {"node": "9", "output": {"images": [{"filename": "ComfyUI_00019_.png", "subfolder": "", "type": "output"}]}, "prompt_id": "be3a5eff-2316-4c60-98ac-96b654da618a"}}
*/
// https://github.com/StableCanvas/comfyui-client?tab=readme-ov-file#readme
// https://www.npmjs.com/package/@stable-canvas/comfyui-client
// https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/websockets_api_example_ws_images.py
// https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/websockets_api_example.py

const { ComfyUIApiClient }=require('@stable-canvas/comfyui-client')
const WebSocket = require('ws')
const {config,log,debugLog,getUUID,urlToBuffer,axios,sleep}=require('./utils')
const {random}=require('./random')
const parseArgs = require('minimist')
const {credits}=require('./credits')

let hosts = []
for (h in config.cluster){
    if (config.cluster[h].type==='comfy'){
        hosts.push(config.cluster[h])
    }
}

const findHost = async()=>{
    for (const h in hosts){
        if(hosts[h].online){return hosts[h]}
    }
    log('Unable to find host')
    return null
}

const init = async()=>{
    for (const h in hosts){
        if(hosts[h].enabled){
            try{
                await initHost(hosts[h])
            } catch(err){
                hosts[h].online=false
                debugLog('Failed to initialize comfyui server ')
            }
        }
    }
}

const initHost = async(host)=>{
    try {
        const client = new ComfyUIApiClient({api_host:host.url,WebSocket,fetch})
        host.client=client
        debugLog('Initializing comfyui client on '+host.name)
        host.client.init()
    } catch (err) {
        debugLog(err)
    }
}

const cast = async(job)=>{
    let host = await findHost()
    if(job.job){job=job.job}
    if(!job.prompt){job.prompt = random.get('prompt')}
    let prompt = job.prompt
    let sampler_name = job.sampler ?? "euler"
    let ckpt_name = job.ckpt_name ?? "sd3_medium_incl_clips_t5xxlfp16.safetensors"//"sd3_medium_incl_clips_t5xxlfp8.safetensors"
    let seed = job.seed ?? random.seed()
    let steps = job.steps ?? 30
    let cfg = job.cfg ?? 5.45
    let filename_prefix = "arty"
    let width = job.width ?? 1024
    let height = job.height ?? 1024
    let batch_size = job.n ?? 1
    let scheduler = job.scheduler ?? "sgm_uniform"
    let denoise = job.denoise ?? 1
    let meta = {prompt,steps,seed,cfg,width,height,n:batch_size,sampler_name,scheduler,ckpt_name,denoise}
    let sd3request = {
        "client_id":"8c491c8244b64ea387ebebf50f37ab08",
        "prompt":{
            "3":{"inputs":{seed,steps,cfg,sampler_name,scheduler,denoise,"model":["4",0],"positive":["16",0],"negative":["40",0],"latent_image":["53",0]},"class_type":"KSampler"},
            "4":{"inputs":{ckpt_name},"class_type":"CheckpointLoaderSimple"},
            "8":{"inputs":{"samples":["3",0],"vae":["4",2]},"class_type":"VAEDecode"},
            "9":{"inputs":{filename_prefix,"images":["8",0]},"class_type":"SaveImage"},
            "16":{"inputs":{"text":prompt,"clip":["4",1]},"class_type":"CLIPTextEncode"},
            "40":{"inputs":{"text":"","clip":["4",1]},"class_type":"CLIPTextEncode"},
            "53":{"inputs":{width,height,batch_size},"class_type":"EmptySD3LatentImage"}
        },
        "extra_data":{ // check if this extra_data is actually required to process prompt
            "extra_pnginfo":{
                "workflow":{
                    "last_node_id":53,"last_link_id":102,
                    "nodes":[
                        {
                            "id":8,"type":"VAEDecode","pos":[1200,96],"size":{"0":210,"1":46},"flags":{},"order":6,"mode":0,
                            "inputs":[{"name":"samples","type":"LATENT","link":7},{"name":"vae","type":"VAE","link":53,"slot_index":1}],
                            "outputs":[{"name":"IMAGE","type":"IMAGE","links":[51],"slot_index":0}],
                            "properties":{"Node name for S&R":"VAEDecode"}
                        },
                        {
                            "id":9,"type":"SaveImage","pos":[1440,96],"size":{"0":952.5112915039062,"1":1007.9328002929688},"flags":{},"order":7,"mode":0,
                            "inputs":[{"name":"images","type":"IMAGE","link":51,"slot_index":0}],
                            "properties":{},"widgets_values":["ComfyUI"]
                        },
                        {
                            "id":3,"type":"KSampler","pos":[864,96],"size":{"0":315,"1":262},"flags":{},"order":5,"mode":0,
                            "inputs":[{"name":"model","type":"MODEL","link":99,"slot_index":0},{"name":"positive","type":"CONDITIONING","link":21},{"name":"negative","type":"CONDITIONING","link":80},{"name":"latent_image","type":"LATENT","link":100}],
                            "outputs":[{"name":"LATENT","type":"LATENT","links":[7],"slot_index":0}],
                            "properties":{"Node name for S&R":"KSampler"},"widgets_values":[seed,"randomize",steps,cfg,sampler_name,"sgm_uniform",1]
                        },
                        {
                            "id":40,"type":"CLIPTextEncode","pos":[384,336],"size":{"0":432,"1":192},"flags":{},"order":4,"mode":0,
                            "inputs":[{"name":"clip","type":"CLIP","link":102}],
                            "outputs":[{"name":"CONDITIONING","type":"CONDITIONING","links":[80],"shape":3,"slot_index":0}],
                            "title":"Negative Prompt","properties":{"Node name for S&R":"CLIPTextEncode"},"widgets_values":[""],"color":"#322","bgcolor":"#533"
                        },
                        {
                            "id":53,"type":"EmptySD3LatentImage","pos":[480,576],"size":{"0":315,"1":106},"flags":{},"order":0,"mode":0,
                            "outputs":[{"name":"LATENT","type":"LATENT","links":[100],"shape":3,"slot_index":0}],
                            "properties":{"Node name for S&R":"EmptySD3LatentImage"},"widgets_values":[1024,1024,1]
                        },
                        {"id":51,"type":"Note","pos":[-48,240],"size":{"0":384,"1":192},"flags":{},"order":1,"mode":0,"properties":{"text":""},"widgets_values":["notes"],"color":"#432","bgcolor":"#653"},
                        {
                            "id":16,"type":"CLIPTextEncode","pos":[384,96],"size":{"0":432,"1":192},"flags":{},"order":3,"mode":0,
                            "inputs":[{"name":"clip","type":"CLIP","link":101}],
                            "outputs":[{"name":"CONDITIONING","type":"CONDITIONING","links":[21],"slot_index":0}],
                            "title":"Positive Prompt","properties":{"Node name for S&R":"CLIPTextEncode"},"widgets_values":[prompt],"color":"#232","bgcolor":"#353"
                        },
                        {
                            "id":4,"type":"CheckpointLoaderSimple","pos":[-48,96],"size":{"0":384.75592041015625,"1":98},"flags":{},"order":2,"mode":0,
                            "outputs":[{"name":"MODEL","type":"MODEL","links":[99],"slot_index":0},{"name":"CLIP","type":"CLIP","links":[101,102],"slot_index":1},{"name":"VAE","type":"VAE","links":[53],"slot_index":2}],
                            "properties":{"Node name for S&R":"CheckpointLoaderSimple"},"widgets_values":[ckpt_name]
                        }
                        
                    ],
                    "links":[[7,3,0,8,0,"LATENT"],[21,16,0,3,1,"CONDITIONING"],[51,8,0,9,0,"IMAGE"],[53,4,2,8,1,"VAE"],[80,40,0,3,2,"CONDITIONING"],[99,4,0,3,0,"MODEL"],[100,53,0,3,3,"LATENT"],[101,4,1,16,0,"CLIP"],[102,4,1,40,0,"CLIP"]],
                    "groups":[],"config":{},"extra":{"ds":{"scale":1.1000000000000003,"offset":[162.43082104175153,127.49053741615663]}},"version":0.4,"seed_widgets":{"3":0}
                }
            }
        }
    }
    debugLog('Cast job :');debugLog(job)
    const resp = await host.client.runPrompt(sd3request.prompt, {workflow: sd3request.extra_data.extra_pnginfo.workflow,disable_random_seed: false})
    let result = {meta,images:[]}
    if (!resp){result.error='Failed to connect to comfyui host '+host.name}
    for (const i in resp.images){
        let imguri = resp.images[i].data
        let buffer = await urlToBuffer(imguri,true)
        if(resp.images[i].type==='url'){result.images.push({name:getUUID()+'.png',file:buffer})}
    }
    if(result.error){return {error:result.error}}
    if(config.credits.enabled&&job.cost>0&&job.creator.discordid&&host.ownerid){
        if(job.creator.discordid!==host.ownerid){
            await credits.transfer(job.creator.discordid,host.ownerid,job.cost)
        }
    }
    return result
}

const jobFromDream = async(cmd,images=null)=>{ //,tracking=null
    // input oldschool !dream format, output job object
    var job = parseArgs(cmd)
    // set argument aliases
    if(job.seamless){job.seamlessy=true;job.seamlessx=true}
    if(job.s){job.steps=job.s;delete job.s}
    if(job.S){job.seed=job.S;delete job.S}
    if(job.W){job.width=job.W;delete job.W}
    if(job.H){job.height=job.H;delete job.H}
    if(job.C){job.scale=job.C;delete job.C}
    if(job.A){job.sampler=job.A;delete job.A}
    if(job.f){job.strength=job.f;delete job.f}
    if(job.n){job.number=job.n;delete job.n}
    if(job.p){job.preset=job.p;delete job.p}
    if(job.scale){job.cfg=job.scale;delete job.scale}
    if(job.sampler){job.sampler_name=job.sampler;delete job.sampler}
    job.prompt=job._.join(' ')
    if(images){job.initimg=images}
    job.cost = getJobCost(job)
    return job
}

const getJobCost = (job) =>{
    // calculate and return a cost float based on job properties
    let cost = 1
    let pixelStepsBase = 7864320 // based on 512x512x30 default sd-1 render
    let width = job.width??512
    let height = job.height??512
    let steps = job.steps??30
    let pixelSteps = width*height*steps
    let number = job.number??1
    cost=(pixelSteps/pixelStepsBase)*cost
    cost=cost*number
    return parseFloat(cost.toFixed(2))
}

init().then(()=>{}).catch(e=>{log('init error:');log(e)})

module.exports = {
    comfyui:{
        init,
        cast,
        hosts,
        jobFromDream
    }
}