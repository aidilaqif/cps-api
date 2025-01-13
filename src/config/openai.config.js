const openaiConfig = {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo',
    maxTokens: 500,
    temperature: 0.3,
    analysisEndpoint: 'https://api.openai.com/v1/chat/completions'
};

module.exports = openaiConfig;