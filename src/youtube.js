const axios = require('axios')
const cheerio = require('cheerio')
const {log, debugLog} = require('./utils')

function getYouTubeVideoId(url) {
    // Support various YouTube URL formats
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{10,11})/,
        /^([a-zA-Z0-9_-]{10,11})$/  // Direct video ID
    ]
    
    for (const pattern of patterns) {
        const match = url.match(pattern)
        if (match && match[1]) {
            return match[1]
        }
    }
    return null
}

async function extractYouTubeMetadata(videoId) {
    try {
        debugLog(`Fetching metadata for video: ${videoId}`)
        
        // Try oEmbed first (most stable)
        try {
            const oembedResponse = await axios.get(
                `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
                {timeout: 5000}
            )
            if (oembedResponse.status === 200 && oembedResponse.data) {
                return {
                    title: oembedResponse.data.title || null,
                    description: null  // oEmbed doesn't provide description
                }
            }
        } catch (oembedError) {
            debugLog('oEmbed failed:', oembedError.message)
        }
        
        // Fallback: scrape the page
        const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        })
        
        const $ = cheerio.load(response.data)
        
        // Try multiple selectors for title
        let title = $('meta[property="og:title"]').attr('content') ||
                   $('meta[name="twitter:title"]').attr('content') ||
                   $('title').text()?.split(' - ')[0]?.trim() ||
                   null
        
        // Try multiple selectors for description
        let description = $('meta[property="og:description"]').attr('content') ||
                         $('meta[name="twitter:description"]').attr('content') ||
                         null
        
        return {title, description}
    } catch (error) {
        log('Error extracting YouTube metadata:', error.message)
        return {title: null, description: null}
    }
}

async function extractTranscript(videoId) {
    try {
        debugLog(`Fetching transcript for video: ${videoId}`)
        
        // Step 1: Get API key from the watch page
        const watchPageResponse = await axios.get(
            `https://www.youtube.com/watch?v=${videoId}`,
            {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            }
        )
        
        const html = watchPageResponse.data
        
        // Extract INNERTUBE_API_KEY
        const apiKeyMatch = html.match(/"innertubeApiKey":"([^"]+)"/)
        const apiKey = apiKeyMatch ? apiKeyMatch[1] : null
        
        if (!apiKey) {
            throw new Error('Could not extract Innertube API key from page')
        }
        
        debugLog(`Extracted API key: ${apiKey.substring(0, 10)}...`)
        
        // Step 2: Make request to get player response
        const playerPayload = {
            context: {
                client: {
                    clientName: 'WEB',
                    clientVersion: '2.20220801.00.00'
                }
            },
            videoId: videoId
        }
        
        debugLog('Fetching player response from Innertube API...')
        const playerResponse = await axios.post(
            `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
            playerPayload,
            {
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        )
        
        // Response structure: data is at top level, not nested in playerResponse
        const playerData = playerResponse.data
        
        // Check playability
        const playability = playerData.playabilityStatus
        if (playability && playability.status !== 'OK') {
            throw new Error(playability.reason || 'Video is not available')
        }
        
        // Extract caption tracks - path is different from expected
        const captionTracklist = playerData.captions?.playerCaptionsTracklistRenderer
        
        if (!captionTracklist || !captionTracklist.captionTracks || captionTracklist.captionTracks.length === 0) {
            throw new Error('No caption tracks available for this video')
        }
        
        const captionTracks = captionTracklist.captionTracks
        
        // Sort tracks: prefer English, prefer non-ASR
        captionTracks.sort((a, b) => {
            if (a.languageCode === 'en' && b.languageCode !== 'en') return -1
            if (b.languageCode === 'en' && a.languageCode !== 'en') return 1
            if (a.kind !== 'asr' && b.kind === 'asr') return -1
            if (b.kind !== 'asr' && a.kind === 'asr') return 1
            return 0
        })
        
        const bestTrack = captionTracks[0]
        debugLog(`Selected caption track: ${bestTrack.languageCode} (kind: ${bestTrack.kind || 'default'})`)
        
        if (!bestTrack.baseUrl) {
            throw new Error('No baseUrl in caption track')
        }
        
        // Step 3: Fetch the transcript XML
        debugLog('Fetching transcript XML...')
        const transcriptResponse = await axios.get(bestTrack.baseUrl, {timeout: 15000})
        const xmlData = transcriptResponse.data
        
        if (!xmlData || xmlData.length === 0) {
            throw new Error('Empty transcript response')
        }
        
        // Step 4: Parse XML using regex
        debugLog('Parsing transcript XML...')
        
        const textMatches = xmlData.match(/<text[^>]*>([^<]*)<\/text>/g)
        
        if (!textMatches || textMatches.length === 0) {
            throw new Error('No text elements found in transcript XML')
        }
        
        const transcript = textMatches
            .map(match => match.replace(/<\/?text[^>]*>/g, ''))
            .join(' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
        
        debugLog(`Transcript extracted: ${transcript.length} characters, ${textMatches.length} segments`)
        
        return {
            transcript,
            language: bestTrack.languageCode || 'en'
        }
    } catch (error) {
        log('Error extracting transcript:', error.message)
        throw error
    }
}

async function getYouTubeTranscript(videoId) {
    try {
        const metadata = await extractYouTubeMetadata(videoId)
        const transcriptData = await extractTranscript(videoId)
        
        return {
            transcript: transcriptData.transcript,
            title: metadata.title,
            description: metadata.description,
            language: transcriptData.language
        }
    } catch (error) {
        const errorMessage = error.message
        
        // Handle specific error cases with user-friendly messages
        if (errorMessage.includes('No caption tracks available')) {
            return {
                transcript: null,
                title: null,
                description: null,
                language: null,
                error: 'Transcript not available for this video (captions may be disabled)'
            }
        }
        
        if (errorMessage.includes('Unable to find YouTube video') || errorMessage.includes('video not found') || errorMessage.includes('not available')) {
            return {
                transcript: null,
                title: null,
                description: null,
                language: null,
                error: 'Video not found or unavailable'
            }
        }
        
        log('Error in getYouTubeTranscript:', errorMessage)
        return {
            transcript: null,
            title: null,
            description: null,
            language: null,
            error: errorMessage
        }
    }
}

module.exports = {
    getYouTubeVideoId,
    extractYouTubeMetadata,
    getYouTubeTranscript
}
