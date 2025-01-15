const axios = require('axios');
const openaiConfig = require('../config/openai.config');

const openaiService = {
    async analyzeBatteryEfficiency(data) {
        try {
            // Calculate key insights for the prompt
            const metrics = data.metrics;
            const timeSeriesData = data.timeSeriesData;
            
            const consumptionDiff = (metrics.avg_actual_consumption - metrics.avg_recommended_consumption).toFixed(2);
            const efficiencyDiff = (metrics.avg_actual_efficiency - metrics.avg_recommended_efficiency).toFixed(2);
            
            const response = await axios.post(
                openaiConfig.analysisEndpoint,
                {
                    model: openaiConfig.model,
                    messages: [
                        {
                            role: "system",
                            content: "You are a battery efficiency analyst for drone operations. Focus on comparing actual vs recommended metrics and providing actionable insights."
                        },
                        {
                            role: "user",
                            content: `Analyze the following drone battery metrics:
                            
                            Average Metrics:
                            - Actual Consumption: ${metrics.avg_actual_consumption} units
                            - Recommended Consumption: ${metrics.avg_recommended_consumption} units
                            - Actual Efficiency: ${metrics.avg_actual_efficiency} items/unit
                            - Recommended Efficiency: ${metrics.avg_recommended_efficiency} items/unit
                            - Items Scanned: ${metrics.avg_items_scanned}
                            - Flight Duration: ${metrics.avg_duration} minutes
                            
                            Key Differences:
                            - Consumption Difference: ${consumptionDiff} units
                            - Efficiency Difference: ${efficiencyDiff} items/unit
                            
                            Focus on:
                            1. Comparison between actual and recommended consumption patterns
                            2. Efficiency gap analysis and improvement opportunities
                            3. Specific recommendations to align actual performance with recommended levels`
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