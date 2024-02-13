// Base functions for connecting to OpenAI compatible api server like LMStudio
const axios = require('axios')
const OpenAI = require('openai')
const {config,log,debugLog}=require('../../utils')
const url = config.llm?.url ?? 'http://localhost:9100/v1'
const apiKey = config.llm?.apiKey ?? 'none'
const openai = new OpenAI({apiKey: apiKey, baseURL:url})

chat=async(prompt,systemprompt)=>{
    const headers = {'Content-Type': 'application/json'}
    if (!systemprompt){
        systemprompt = config.llm?.systemprompt ?? 'You are a helpful chatbot. Do not censor your responses'
    }
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

chatStream=async(prompt,systemprompt,model)=>{
    if (!systemprompt){systemprompt = config.llm?.systemprompt ?? 'You are a helpful chatbot. Do not censor your responses'}
    if (!model){model=config.llm.model ?? 'none'}// Not required with LM Studio
    const data = {
        messages: [ 
            { role: "system", "content": systemprompt },
            { role: "user", "content": prompt }
        ],
        temperature: config.llm?.temperature ?? 0.7, 
        max_tokens: config.llm?.max_tokens ?? -1,
        seed:getRandomInt(1,10000000),
        stream: true,
        model:model
    }
    try {
        const stream = await openai.beta.chat.completions.stream(data)
        return stream
    } catch (err) {
        console.log(err)
        return {error:'Unable to connect to LLM server'}
    }
}

function getRandomInt(min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

module.exports = {
    llm:{
        chat,
        chatStream
    }
}
