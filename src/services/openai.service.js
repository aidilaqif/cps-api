const axios = require('axios');
const openaiConfig = require('../config/openai.config');

const openaiService = {
    async analyzeBatteryEfficiency(data) {
        try {
          const metrics = data.metrics;
          const timeSeriesData = data.timeSeriesData;
          
          // Calculate key insights for the prompt
          const actualDuration = metrics.avg_duration; // seconds from your test data
          const recommendedDuration = 780; // seconds from specifications
          const actualRate = metrics.avg_actual_rate;
          const recommendedRate = metrics.avg_recommended_rate;
          const efficiencyDiff = ((actualRate - recommendedRate) / recommendedRate * 100).toFixed(2);
      
          const response = await axios.post(
            openaiConfig.analysisEndpoint,
            {
              model: openaiConfig.model,
              messages: [
                {
                  role: "system",
                  content: "You are a battery efficiency analyst for drone operations. Focus on comparing actual vs recommended metrics and providing actionable insights based on DJI Tello specifications."
                },
                {
                  role: "user",
                  content: `Analyze the following drone battery metrics:
      
      Specifications vs Actual Performance:
      - Recommended Flight Duration: ${recommendedDuration} seconds (13 minutes)
      - Actual Flight Duration: ${actualDuration} seconds (${(actualDuration/60).toFixed(2)} minutes)
      - Recommended Consumption Rate: ${recommendedRate}% per second
      - Actual Consumption Rate: ${actualRate}% per second
      - Efficiency Difference: ${efficiencyDiff}%
      
      Performance Gap:
      - Duration Gap: ${recommendedDuration - actualDuration} seconds
      - Rate Difference: ${(actualRate - recommendedRate).toFixed(2)}% per second
      
      Focus your analysis on:
      1. Comparison between actual and recommended consumption patterns
      2. Potential causes for the performance gap
      3. Impact on operational efficiency
      4. Specific recommendations to align actual performance with specifications
      
      Please provide a structured analysis with clear sections for findings, implications, and recommendations.`
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