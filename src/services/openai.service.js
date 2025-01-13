const axios = require('axios');
const openaiConfig = require('../config/openai.config');

const openaiService = {
    async analyzeBatteryEfficiency(data) {
        try {
            const response = await axios.post(
                openaiConfig.analysisEndpoint,
                {
                    model: openaiConfig.model,
                    messages: [
                        {
                            role: "system",
                            content: "You are a battery efficiency analyst for drone operations. Analyze the data and provide insights focused on battery usage optimization."
                        },
                        {
                            role: "user",
                            content: `Analyze this drone battery data: ${JSON.stringify(data)} 
                                    Focus on:
                                    1. Battery consumption vs. items scanned ratio
                                    2. Optimal flight duration predictions
                                    3. Most efficient movement patterns based on battery usage`
                        }
                    ],
                    max_tokens: openaiConfig.maxTokens,
                    temperature: openaiConfig.temperature
                },
                {
                    headers: {
                        'Authorization': `Bearer ${openaiConfig.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('OpenAI API Error:', error);
            throw new Error('Failed to analyze battery efficiency');
        }
    },

    async analyzeMovementPatterns(data) {
        try {
            const response = await axios.post(
                openaiConfig.analysisEndpoint,
                {
                    model: openaiConfig.model,
                    messages: [
                        {
                            role: "system",
                            content: "You are a movement pattern analyst for drone operations. Analyze flight patterns for efficiency."
                        },
                        {
                            role: "user",
                            content: `Analyze these drone movement patterns: ${JSON.stringify(data)} 
                                    Focus on:
                                    1. Most successful movement sequences
                                    2. Pattern correlations with scan success rates
                                    3. Suggested improvements for movement efficiency`
                        }
                    ],
                    max_tokens: openaiConfig.maxTokens,
                    temperature: openaiConfig.temperature
                },
                {
                    headers: {
                        'Authorization': `Bearer ${openaiConfig.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('OpenAI API Error:', error);
            throw new Error('Failed to analyze movement patterns');
        }
    },

    async analyzeDronePerformance(data) {
        try {
            const response = await axios.post(
                openaiConfig.analysisEndpoint,
                {
                    model: openaiConfig.model,
                    messages: [
                        {
                            role: "system",
                            content: "You are a drone performance analyst. Focus on overall efficiency metrics and optimization opportunities."
                        },
                        {
                            role: "user",
                            content: `Analyze this drone performance data: ${JSON.stringify(data)} 
                                    Focus on:
                                    1. Overall efficiency metrics
                                    2. Battery usage optimization
                                    3. Movement pattern effectiveness
                                    4. Time-based performance variations`
                        }
                    ],
                    max_tokens: openaiConfig.maxTokens,
                    temperature: openaiConfig.temperature
                },
                {
                    headers: {
                        'Authorization': `Bearer ${openaiConfig.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('OpenAI API Error:', error);
            throw new Error('Failed to analyze drone performance');
        }
    }
};

module.exports = openaiService;