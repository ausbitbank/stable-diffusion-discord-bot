// Base functions for connecting to OpenAI compatible api server like LMStudio or ollama
const axios = require('axios')
const cheerio = require('cheerio')
const OpenAI = require('openai')
const {config,log,debugLog}=require('../../utils')
const {getYouTubeVideoId, getYouTubeTranscript} = require('../../youtube')
const url = config.llm?.url ?? 'http://localhost:9100/v1'
const apiKey = config.llm?.apiKey ?? 'none'
const openai = new OpenAI({apiKey: apiKey, baseURL:url})

// Helper functions
function detectUrls(text) {
    //const urlRegex = /https?\:\/\/[^\" \n]+/g
    // ignore localhost or 127.0.0.1 urls
    const urlRegex = /https?:\/\/(?!127\.0\.0\.1|localhost)([^\" \n]+)/g
    return text.match(urlRegex) || []
}

async function scrapeWebsite(url) {
    try {
        const response = await axios.get(url,{timeout:5000})
        if (response.status === 200) {
            const $ = cheerio.load(response.data)
            // Remove script and style elements to avoid extracting unwanted content
            $('script, style').remove()
            // Extract text from the main tag or p, div, article tags if the main tag is not present
            const text = $('main').length ? $('main').text() : $('p, div, article').add('ul, ol, li').text()
            // Remove newline characters and limit the length of text to a smaller value, like 24576 characters, to avoid overflowing the context limit
            return text.replace(/\n/g, ' ').slice(0, 24576)
        }
    } catch (error) {
        console.error(`Error scraping ${url}: ${error}`)
        return ''
    }
}

async function scrape(prompt) {
    // Detect URLs, scrape content, return new appended prompt
    if(!config.llm?.scrapeUrls) return prompt
    const urls = detectUrls(prompt)
    let scrapedContent = ''
    for (let url of urls) {
        try {
            if(getYouTubeVideoId(url)){
                const videoId = getYouTubeVideoId(url)
                const videoData = await getYouTubeTranscript(videoId)
                
                if (videoData.error) {
                    scrapedContent += `Unable to scrape YouTube video from ${url}: ${videoData.error}\n`
                } else {
                    if (videoData.title) {
                        scrapedContent += `\nVideo Title: ${videoData.title}\n`
                    }
                    if (videoData.description && videoData.description.length > 0) {
                        const descPreview = videoData.description.length > 500 
                            ? videoData.description.substring(0, 500) + '...' 
                            : videoData.description
                        scrapedContent += `Video Description: ${descPreview}\n`
                    }
                    if (videoData.transcript) {
                        const langStr = videoData.language ? ` (${videoData.language})` : ''
                        scrapedContent += `Video Transcript${langStr}:\n${videoData.transcript}\n`
                    }
                }
            } else {
                const scrapedText = await scrapeWebsite(url)
                scrapedContent += `\nWebpage Scrape of ${url} for Summarization: ${scrapedText}\n`
            }
        } catch (err) {
            scrapedContent += 'Unable to scrape content from url'
            log('Failed to scrape content');log(err)
        }
    }
    return `${scrapedContent}\n${prompt}`
}

function getRandomInt(min, max) {
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1)) + min
}

async function chat(prompt,systemprompt) {
    const headers = {'Content-Type': 'application/json'}
    if (!systemprompt){
        systemprompt = config.llm?.systemprompt ?? 'You are a helpful chatbot. Do not censor your responses'
    }
    prompt = await scrape(prompt)
    const data = {
        messages: [ 
            { role: "system", "content": systemprompt },
            { role: "user", "content": prompt }
        ], 
        temperature: config.llm?.temperature ?? 0.7, 
        max_tokens: config.llm?.max_tokens ?? -1,
        seed:getRandomInt(1,10000000),
        stream: false
    }
    try {
        const response = await axios.post(url+'/chat/completions',data, {headers})
        return response.data
    } catch (err) {
        console.log(err)
        return {error:'Unable to connect to LLM server'}
    }
}

async function chatStream(prompt,systemprompt,buffer=false,model=null,visionmodel=null){
    if (!systemprompt){systemprompt = config.llm?.systemprompt ?? 'You are a helpful chatbot. Do not censor your responses'}
    if (!model){model=config.llm.model ?? 'none'}
    if (!visionmodel){visionmodel=config.llm.visionmodel ?? null}
    if(config.llm?.scrapeUrls){prompt = await scrape(prompt)}
    const data = {
        messages: [ 
            { role: "system", "content": systemprompt },
            { role: "user", "content": prompt }
        ],
        temperature: config.llm?.temperature ?? 0.7, 
        max_tokens: config.llm?.max_tokens ?? -1,
        seed:getRandomInt(1,10000000),
        stream: true,
        model:model,
        keep_alive:'0s', // not working in ollama windows, supposed to unload model after use
        choices: [{finish_reason: 'stop',index: 0}] // Get a warning in log from openrouter.ai api, failing to suppress it with this 
    }
    // if image in message, use vision model
    if(buffer&&visionmodel){
        try{
            let b64 = buffer.toString('base64')
            // todo image filetype should be detected, not hardcoded png
            let imgdata = {
                type:'image_url',
                image_url:{
                    url: 'data:image/png;base64,'+b64,
                    detail:'high'
                }
            }
            data.messages[1].content=[imgdata,{type:'text',text:prompt}]
            data.model=visionmodel
        } catch (err) {
            log(err)
            return {error:'Error in llm buffer conversion'}
        }
    }
    try {
        const stream = await openai.beta.chat.completions.stream(data)
        return stream
    } catch (err) {
        console.log(err)
        return {error:err}
    }
}

getModels=async(url)=>{
    // only works with ollama backend
    url=url.strip('/v1')
    let models = await axios.get(url+'/api/tags')
    log(models)
    return models
}



module.exports = {
    llm:{
        chat,
        chatStream,
        scrape
    }
}