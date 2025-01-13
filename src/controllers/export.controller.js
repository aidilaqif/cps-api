const pool = require('../config/db.config');
const moment = require('moment-timezone');

exports.exportToCSV = async (req, res) => {
  try {
    // Query for items
    const itemsQuery = `
      WITH ItemData AS (
        -- Get Paper Rolls
        SELECT 
          l.label_id,
          'Roll' as label_type,
          l.location_id,
          l.status,
          l.last_scan_time,
          pr.code,
          pr.name,
          pr.size_mm as size,
          NULL as plt_number,
          NULL as quantity,
          NULL as work_order_id,
          NULL as total_pieces
        FROM labels l
        JOIN paper_rolls pr ON l.label_id = pr.label_id
        UNION ALL
        -- Get FG Pallets
        SELECT 
          l.label_id,
          'FG Pallet' as label_type,
          l.location_id,
          l.status,
          l.last_scan_time,
          NULL as code,
          NULL as name,
          NULL as size,
          fp.plt_number,
          fp.quantity,
          fp.work_order_id,
          fp.total_pieces
        FROM labels l
        JOIN fg_pallets fp ON l.label_id = fp.label_id
      )
      SELECT * FROM ItemData
      ORDER BY last_scan_time DESC
    `;

    // Query for flight sessions
    const flightSessionsQuery = `
      WITH flight_data AS (
        SELECT
          fs.session_id,
          fs.start_time,
          fs.end_time,
          fs.battery_start,
          fs.battery_end,
          fs.total_commands,
          EXTRACT(EPOCH FROM (fs.end_time - fs.start_time))/60 as flight_duration,
          CASE
            WHEN EXTRACT(HOUR FROM fs.start_time) < 12 THEN 'morning'
            WHEN EXTRACT(HOUR FROM fs.start_time) < 17 THEN 'afternoon'
            ELSE 'evening'
          END as time_of_day,
          TO_CHAR(fs.start_time, 'Day') as day_of_week,
          TO_CHAR(fs.start_time, 'YYYY-MM-DD') as date,
          (
            SELECT COUNT(*)
            FROM movement_logs ml
            WHERE ml.session_id = fs.session_id
          ) as scan_attempts,
          (
            SELECT COUNT(*)
            FROM rack_item_assignments ria
            WHERE ria.scan_session_id::text = fs.session_id::text
            AND ria.label_id IS NOT NULL
          ) as items_scanned_count,
          (
            SELECT COUNT(*)
            FROM rack_item_assignments ria
            WHERE ria.scan_session_id::text = fs.session_id::text
            AND ria.label_id IS NOT NULL
            AND ria.scan_sequence = 2
          ) as successful_scans,
          (
            SELECT COUNT(*)
            FROM rack_item_assignments ria
            WHERE ria.scan_session_id::text = fs.session_id::text
            AND ria.label_id IS NULL
          ) as failed_scans
        FROM flight_sessions fs
      )
      SELECT * FROM flight_data
      ORDER BY start_time DESC
    `;

    // Query for Scan Results
    const scanResultsQuery = `
      SELECT 
        ria.scan_session_id as session_id,
        ria.scan_timestamp,
        ria.label_id,
        CASE WHEN ria.scan_sequence = 2 THEN true ELSE false END as scan_success,
        CASE 
          WHEN ria.label_id IS NULL THEN 'QR Code Not Detected'
          WHEN ria.scan_sequence != 2 THEN 'Invalid Scan Sequence'
        END as scan_failure_reason,
        l.label_type as item_type,
        ria.location_id,
        (
          SELECT ml.battery_level
          FROM movement_logs ml
          WHERE ml.session_id = (
            SELECT fs.session_id 
            FROM flight_sessions fs 
            WHERE fs.session_id::text = ria.scan_session_id::text
            LIMIT 1
          )
          AND ml.timestamp <= ria.scan_timestamp
          ORDER BY ml.timestamp DESC
          LIMIT 1
        ) as battery_level_at_scan
      FROM rack_item_assignments ria
      LEFT JOIN labels l ON ria.label_id = l.label_id
      ORDER BY ria.scan_timestamp DESC
    `;

    // Query for Item Status
    const itemsStatusQuery = `
        WITH scan_stats AS (
          SELECT 
            label_id,
            COUNT(*) as scan_attempts,
            COUNT(CASE WHEN scan_sequence = 2 THEN 1 END) as successful_scans
          FROM rack_item_assignments
          WHERE label_id IS NOT NULL
          GROUP BY label_id
        )
        SELECT 
          l.label_id,
          l.label_type,
          l.status,
          l.last_scan_time,
          COALESCE(ss.scan_attempts, 0) as scan_attempts,
          COALESCE(ss.successful_scans, 0) as successful_scans,
          l.location_id,
          EXTRACT(DAY FROM (NOW() - l.last_scan_time)) as days_since_last_scan
        FROM labels l
        LEFT JOIN scan_stats ss ON l.label_id = ss.label_id
        ORDER BY l.last_scan_time DESC
      `;

    // Execute all queries in parallel
    const [itemsResult, flightSessionsResult, scanResultsResult, itemsStatusResult] = await Promise.all([
      pool.query(itemsQuery),
      pool.query(flightSessionsQuery),
      pool.query(scanResultsQuery),
      pool.query(itemsStatusQuery)
    ]);

    
    // Transform data to match CPS Data-2 format
    const formattedData = {
      locations: [],
      labels: [],
      rolls: [],
      pallets: [],
      flight_sessions: flightSessionsResult.rows.map(row => ({
        session_id: row.session_id,
        date: row.date,
        time_of_day: row.time_of_day,
        day_of_week: row.day_of_week.trim(),
        start_time: moment(row.start_time).format(),
        end_time: moment(row.end_time).format(),
        battery_start: row.battery_start,
        battery_end: row.battery_end,
        total_commands: row.total_commands,
        items_scanned_count: row.items_scanned_count,
        successful_scans: row.successful_scans,
        failed_scans: row.failed_scans,
        flight_duration: parseFloat(row.flight_duration).toFixed(2)
      })),
      scan_results: scanResultsResult.rows.map(row => ({
        session_id: row.session_id,
        scan_timestamp: moment(row.scan_timestamp).format(),
        label_id: row.label_id,
        scan_success: row.scan_success,
        scan_failure_reason: row.scan_failure_reason,
        item_type: row.item_type,
        location_id: row.location_id,
        battery_level_at_scan: row.battery_level_at_scan
      })),
      items_status: itemsStatusResult.rows.map(row => ({
        label_id: row.label_id,
        label_type: row.label_type,
        status: row.status,
        last_scan_time: moment(row.last_scan_time).format(),
        scan_attempts: row.scan_attempts,
        successful_scans: row.successful_scans,
        location_id: row.location_id,
        days_since_last_scan: parseInt(row.days_since_last_scan)
      }))
    };

    // Process location types
    const locationTypes = new Set();
    itemsResult.rows.forEach(row => {
      if (row.location_id) {
        locationTypes.add({
          id: row.location_id,
          type: row.label_type === 'Roll' ? 'Paper Roll Location' : 'FG Pallet Location'
        });
      }
    });
    formattedData.locations = Array.from(locationTypes);

    // Process items
    itemsResult.rows.forEach(row => {
      // Add to labels list
      formattedData.labels.push({
        labelId: row.label_id,
        labelType: row.label_type,
        location: row.location_id,
        status: row.status,
        lastScanTime: row.last_scan_time
      });

      // Add to specific type lists
      if (row.label_type === 'Roll') {
        formattedData.rolls.push({
          labelId: row.label_id,
          code: row.code,
          name: row.name,
          size: row.size,
          status: row.status,
          lastScanTime: row.last_scan_time
        });
      } else if (row.label_type === 'FG Pallet') {
        formattedData.pallets.push({
          labelId: row.label_id,
          pltNumber: row.plt_number,
          quantity: row.quantity,
          workOrderId: row.work_order_id,
          totalPieces: row.total_pieces,
          status: row.status,
          lastScanTime: row.last_scan_time
        });
      }
    });

      res.json(formattedData);
    } catch (err) {
      res.status(500).json({
        message: 'Error exporting data',
        error: err.message
      });
    }
  };