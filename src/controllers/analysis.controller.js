const pool = require('../config/db.config');
const openaiService = require('../services/openai.service');
const moment = require('moment-timezone');
const { hasSignificantChange } = require('../utils/analysisUtils');

const CACHE_DURATION = 24;

const getCachedAnalysis = async (analysisType) => {
    const query = `
        SELECT metrics, analysis, updated_at
        FROM analysis_cache
        WHERE analysis_type = $1
    `;
    const result = await pool.query(query, [analysisType]);

    if (result.rows.length > 0) {
        const cachedData = result.rows[0];
        const cacheAge = moment().diff(moment(cachedData.updated_at), 'hours');
      
        if (cacheAge < CACHE_DURATION) {
            return {
                metrics: cachedData.metrics,
                analysis: cachedData.analysis
            };
        }
    }
    return null;
};
  
const updateCache = async (analysisType, metrics, analysis) => {
    try {

        // Ensure metrics is properly formatted as JSON
        const metricsJson = typeof metrics === 'string' ? metrics : JSON.stringify(metrics);


        const query = `
        INSERT INTO analysis_cache (analysis_type, metrics, analysis)
        VALUES ($1, $2::jsonb, $3)
        ON CONFLICT (analysis_type) 
        DO UPDATE SET 
            metrics = $2::jsonb,
            analysis = $3,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
        `;

        const result = await pool.query(query, [analysisType, metricsJson, analysis]);
        return result.rows[0];
    } catch (err) {
        console.error('Error in updateCache:', err);
        console.error('Failed metrics:', metrics);
        throw err;
    }
};

exports.getBatteryEfficiencyAnalysis = async (req, res) => {
    try {
        // Check cache first
        const cachedData = await getCachedAnalysis('battery');
        if (cachedData) {
            return res.json(cachedData);
        }
        // If no cache, perform analysis
        const query = `
            WITH BatteryMetrics AS (
                SELECT 
                    fs.session_id,
                    fs.battery_start - fs.battery_end as battery_consumed,
                    COUNT(ria.label_id) as items_scanned,
                    EXTRACT(EPOCH FROM (fs.end_time - fs.start_time))/60 as duration_minutes
                FROM flight_sessions fs
                LEFT JOIN rack_item_assignments ria ON ria.scan_session_id::text = fs.session_id::text
                WHERE fs.battery_start > fs.battery_end
                GROUP BY fs.session_id, fs.battery_start, fs.battery_end, fs.start_time, fs.end_time
            )
            SELECT 
                ROUND(AVG(battery_consumed)::numeric, 2) as avg_battery_consumption,
                ROUND(AVG(items_scanned)::numeric, 2) as avg_items_scanned,
                ROUND(AVG(duration_minutes)::numeric, 2) as avg_flight_duration,
                ROUND(AVG(CASE WHEN items_scanned > 0 
                    THEN battery_consumed::float / items_scanned 
                    ELSE NULL END)::numeric, 2) as battery_per_scan,
                ROUND(AVG(CASE WHEN duration_minutes > 0 
                    THEN battery_consumed::float / duration_minutes 
                    ELSE NULL END)::numeric, 2) as battery_per_minute
            FROM BatteryMetrics`;

        const result = await pool.query(query);
        const metrics = result.rows[0];
        const analysis = await openaiService.analyzeBatteryEfficiency(metrics);

        // Update cache
        await updateCache('battery', metrics, analysis);

        res.json({
            metrics,
            analysis
        });
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            error: 'Failed to analyze battery efficiency'
        });
    }
};

exports.getMovementPatternsAnalysis = async (req, res) => {
    try {
        // Check cache first
        const cachedData = await getCachedAnalysis('movemnent');
        if (cachedData) {
            return res.json(cachedData);
        }
        // If no cache, perform analysis
        const query = `
        WITH MovementStats AS (
            SELECT 
            ml.action,
            COUNT(*) as usage_count,
            COUNT(DISTINCT ml.session_id) as session_count,
            ROUND(AVG(ml.battery_level)::numeric, 2) as avg_battery_level,
            ROUND(AVG(ml.distance)::numeric, 2) as avg_distance
            FROM movement_logs ml
            GROUP BY ml.action
        )
        SELECT
            action,
            usage_count,
            session_count,
            avg_battery_level,
            avg_distance,
            ROUND((usage_count::float / (SELECT SUM(usage_count) FROM MovementStats) * 100)::numeric, 2) as usage_percentage
        FROM MovementStats
        ORDER BY usage_count DESC`;

        const result = await pool.query(query);
        const metrics = result.rows.map(row => ({
            ...row,
            usage_count: Number(row.usage_count),
            session_count: Number(row.session_count),
            avg_battery_level: Number(row.avg_battery_level),
            avg_distance: Number(row.avg_distance),
            usage_percentage: Number(row.usage_percentage)
          }));

        const analysis = await openaiService.analyzeMovementPatterns(metrics);

        const cacheData = {
            patterns: metrics,
            analysis: analysis
        }
        await updateCache('movement', cacheData, analysis);
        res.json(cacheData);
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            error: 'Failed to analyze movement patterns'
        });
    }
};

exports.getDronePerformanceAnalysis = async (req, res) => {
    try {
        const cachedData = await getCachedAnalysis('performance');
            if (cachedData) {
            return res.json(cachedData);
            }

        // If no cache, perform analysis
        const query = `
            WITH PerformanceMetrics AS (
                SELECT 
                    fs.session_id,
                    fs.battery_start - fs.battery_end as battery_used,
                    fs.total_commands,
                    EXTRACT(EPOCH FROM (fs.end_time - fs.start_time))/60 as duration_minutes,
                    COUNT(DISTINCT ria.label_id) as unique_items_scanned,
                    COUNT(DISTINCT ml.action) as unique_movements
                FROM flight_sessions fs
                LEFT JOIN movement_logs ml ON fs.session_id = ml.session_id
                LEFT JOIN rack_item_assignments ria ON ria.scan_session_id::text = fs.session_id::text
                GROUP BY fs.session_id, fs.battery_start, fs.battery_end, fs.total_commands, fs.start_time, fs.end_time
            )
            SELECT 
                ROUND(AVG(battery_used)::numeric, 2) as avg_battery_consumption,
                ROUND(AVG(total_commands)::numeric, 2) as avg_commands_per_flight,
                ROUND(AVG(duration_minutes)::numeric, 2) as avg_flight_duration,
                ROUND(AVG(unique_items_scanned)::numeric, 2) as avg_items_scanned,
                ROUND(AVG(unique_movements)::numeric, 2) as avg_unique_movements,
                ROUND(AVG(CASE WHEN duration_minutes > 0 
                    THEN unique_items_scanned::float / duration_minutes 
                    ELSE NULL END)::numeric, 2) as items_per_minute,
                ROUND(AVG(CASE WHEN battery_used > 0 
                    THEN unique_items_scanned::float / battery_used 
                    ELSE NULL END)::numeric, 2) as items_per_battery_unit
            FROM PerformanceMetrics`;

        const result = await pool.query(query);
        const metrics = result.rows[0];
        const analysis = await openaiService.analyzeDronePerformance(metrics);
    
        await updateCache('performance', metrics, analysis);
    
        res.json({
            metrics,
            analysis
        });
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            error: 'Failed to analyze drone performance'
        });
    }
};