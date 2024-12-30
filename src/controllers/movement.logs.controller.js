const pool = require("../config/db.config");
const moment = require("moment-timezone");

exports.createFlightSession = async (req, res) => {
  const client = await pool.connect();
  try {
    const { flight_data, end_reason, session_summary } = req.body;

    await client.query("BEGIN");

    // Create flight session
    const sessionResult = await client.query(
      `INSERT INTO flight_sessions (
                start_time,
                end_time,
                end_reason,
                battery_start,
                battery_end,
                total_commands
            ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING session_id`,
      [
        moment
          .tz(session_summary.start_time, "Asia/Kuala_Lumpur")
          .toISOString(),
        moment.tz(session_summary.end_time, "Asia/Kuala_Lumpur").toISOString(),
        end_reason,
        session_summary.battery_start,
        session_summary.battery_end,
        session_summary.total_commands,
      ]
    );

    const sessionId = sessionResult.rows[0].session_id;

    // Insert all movement logs
    for (const log of flight_data) {
      await client.query(
        `INSERT INTO movement_logs (
                    session_id,
                    action,
                    timestamp,
                    battery_level,
                    distance,
                    error_type,
                    error_message
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          sessionId,
          log.action,
          moment.tz(log.timestamp, "Asia/Kuala_Lumpur").toISOString(),
          log.battery_level,
          log.distance || null,
          log.error_type || null,
          log.error_message || null,
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Flight session logged successfully",
      session_id: sessionId,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error logging flight session:", err);
    res.status(500).json({
      message: "Error logging flight session",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

exports.getFlightSessions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
                fs.*,
                COUNT(ml.log_id) as total_movements,
                json_agg(json_build_object(
                    'action', ml.action,
                    'timestamp', ml.timestamp,
                    'battery_level', ml.battery_level,
                    'distance', ml.distance,
                    'error_type', ml.error_type,
                    'error_message', ml.error_message
                ) ORDER BY ml.timestamp) as movements
            FROM flight_sessions fs
            LEFT JOIN movement_logs ml ON fs.session_id = ml.session_id
            GROUP BY fs.session_id
            ORDER BY fs.start_time DESC`
    );

    res.json({
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error("Error fetching flight sessions:", err);
    res.status(500).json({
      message: "Error fetching flight sessions",
      error: err.message,
    });
  }
};

exports.getFlightSessionById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT 
                fs.*,
                json_agg(json_build_object(
                    'action', ml.action,
                    'timestamp', ml.timestamp,
                    'battery_level', ml.battery_level,
                    'distance', ml.distance,
                    'error_type', ml.error_type,
                    'error_message', ml.error_message
                ) ORDER BY ml.timestamp) as movements
            FROM flight_sessions fs
            LEFT JOIN movement_logs ml ON fs.session_id = ml.session_id
            WHERE fs.session_id = $1
            GROUP BY fs.session_id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Flight session not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching flight session:", err);
    res.status(500).json({
      message: "Error fetching flight session",
      error: err.message,
    });
  }
};

exports.getMovementStats = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
                action,
                COUNT(*) as count,
                AVG(battery_level) as avg_battery_level,
                AVG(distance) as avg_distance
            FROM movement_logs
            GROUP BY action
            ORDER BY count DESC`
    );

    res.json({
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error("Error fetching movement stats:", err);
    res.status(500).json({
      message: "Error fetching movement stats",
      error: err.message,
    });
  }
};

exports.updateLogStar = async (req, res) => {
  const { id } = req.params;
  const { is_starred } = req.body;

  try {
    const result = await pool.query(
      `UPDATE flight_sessions 
             SET is_starred = $1,
                 last_modified = CURRENT_TIMESTAMP
             WHERE session_id = $2
             RETURNING *`,
      [is_starred, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Flight session not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating flight session star:", err);
    res.status(500).json({
      message: "Error updating flight session",
      error: err.message,
    });
  }
};

exports.renameLog = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  try {
    const result = await pool.query(
      `UPDATE flight_sessions 
             SET name = $1,
                 last_modified = CURRENT_TIMESTAMP
             WHERE session_id = $2
             RETURNING *`,
      [name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Flight session not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error renaming flight session:", err);
    res.status(500).json({
      message: "Error renaming flight session",
      error: err.message,
    });
  }
};

//Delete flight sessions
exports.deleteFlightSession = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Delete all movement logs for this session first
    await client.query("DELETE FROM movement_logs WHERE session_id = $1", [id]);

    // Then delete the flight session
    const result = await client.query(
      "DELETE FROM flight_sessions WHERE session_id = $1 RETURNING *",
      [id]
    );

    await client.query("COMMIT");

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Flight session not found" });
    }

    res.json({ message: "Flight session deleted successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error deleting flight session:", err);
    res.status(500).json({
      message: "Error deleting flight session",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

exports.getDroneCoverageStats = async (req, res) => {
  try {
    const { session_id } = req.query; // Pass `session_id` as a query parameter
    const result = await pool.query(`
      SELECT 
        COUNT(*) AS total_scans, 
        COUNT(DISTINCT labels.location_id) AS unique_locations
      FROM movement_logs
      JOIN labels ON movement_logs.label_id = labels.label_id
      WHERE movement_logs.session_id = $1
    `, [session_id]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching drone coverage stats:", err);
    res.status(500).json({ message: "Failed to fetch drone coverage stats" });
  }
};

exports.getStockTakeStats = async (req, res) => {
  try {
    const { session_id } = req.query; // Pass `session_id` as a query parameter
    const result = await pool.query(`
      SELECT 
        labels.location_id, 
        COUNT(movement_logs.label_id) AS items_scanned
      FROM movement_logs
      JOIN labels ON movement_logs.label_id = labels.label_id
      WHERE movement_logs.session_id = $1
      GROUP BY labels.location_id
      ORDER BY items_scanned DESC
    `, [session_id]);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching stock take stats:", err);
    res.status(500).json({ message: "Failed to fetch stock take stats" });
  }
};

exports.getRelocationStats = async (req, res) => {
  try {
    const { session_id } = req.query; // Pass `session_id` as a query parameter
    const result = await pool.query(`
      SELECT 
        labels.location_id, 
        COUNT(*) AS relocations
      FROM movement_logs
      JOIN labels ON movement_logs.label_id = labels.label_id
      WHERE movement_logs.session_id = $1 AND movement_logs.action = 'relocate'
      GROUP BY labels.location_id
      ORDER BY relocations DESC
    `, [session_id]);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching relocation stats:", err);
    res.status(500).json({ message: "Failed to fetch relocation stats" });
  }
};

exports.getMovementHistory = async (req, res) => {
  try {
    const { session_id } = req.query; // Pass `session_id` as a query parameter
    const result = await pool.query(`
      SELECT 
        movement_logs.action, 
        labels.location_id, 
        movement_logs.timestamp 
      FROM movement_logs
      JOIN labels ON movement_logs.label_id = labels.label_id
      WHERE movement_logs.session_id = $1
      ORDER BY movement_logs.timestamp DESC
      LIMIT 50
    `, [session_id]);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching movement history:", err);
    res.status(500).json({ message: "Failed to fetch movement history" });
  }
};
