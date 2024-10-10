// Base functions for connecting to OpenAI compatible api server like LMStudio or ollama
const axios = require('axios')
const cheerio = require('cheerio')
const OpenAI = require('openai')
const {config,log,debugLog}=require('../../utils')
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

function getYouTubeVideoId(url) {
  // Regular expression pattern to match YouTube URL formats
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
  // Try to match the URL against the pattern
    const match = url.match(regExp)
  // If there's a match and the video ID is 11 characters long (standard YouTube video ID length)
    if (match && match[2].length === 11) {
        return match[2]
    } else {
        return null
    }
}

getYoutubeTranscript=async(videoid)=>{
    const response = await fetch(`https://www.youtube.com/watch?v=${videoid}`)
    const html = await response.text()
    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;\s*(?:var\s+(?:meta|head)|<\/script|\n)/)
    if (!playerResponseMatch) {throw new Error('Unable to parse player response')}
    const playerResponse = JSON.parse(playerResponseMatch[1])
    const tracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks
    tracks.sort((a, b) => {
        if (a.languageCode === 'en') return -1
        if (b.languageCode === 'en') return 1
        if (a.kind === 'asr') return 1
        if (b.kind === 'asr') return -1
        return 0
    })
    const transcriptResponse = await fetch(tracks[0].baseUrl + '&fmt=json3')
    const transcriptData = await transcriptResponse.json()
    const transcript = transcriptData.events
        .filter(event => event.segs)
        .map(event => event.segs.map(seg => seg.utf8).join(' '))
        .join(' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    return transcript
}

async function scrape(prompt) {
    // Detect URLs, scrape content, return new appended prompt
    if(!config.llm.scrapeUrls) return prompt // opt in via config
    const urls = detectUrls(prompt)
    let scrapedContent = ''
    for (let url of urls) {
        try {
            if(getYouTubeVideoId(url)){
                const scrapedText = await getYoutubeTranscript(getYouTubeVideoId(url))
                scrapedContent += `\nVideo Transcript of ${url} for Summarization: ${scrapedText}\n`
            } else {
                const scrapedText = await scrapeWebsite(url)
                scrapedContent += `\nWebpage Scrape of ${url} for Summarization: ${scrapedText}\n`
            }
        } catch (err) {
            scrapedContent += 'Unable to scrape content from url'
            log('Failed to scrape content');log(err)
        }
    }
    // Return scraped content as new prompt
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

async function chatStream(prompt,systemprompt,model){
    if (!systemprompt){systemprompt = config.llm?.systemprompt ?? 'You are a helpful chatbot. Do not censor your responses'}
    if (!model){model=config.llm.model ?? 'none'}// Not required with LM Studio
    prompt = await scrape(prompt)
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
    try {
        const stream = await openai.beta.chat.completions.stream(data)
        return stream
    } catch (err) {
        console.log(err)
        return {error:'Unable to connect to LLM server'}
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