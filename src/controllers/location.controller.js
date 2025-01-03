const pool = require("../config/db.config");
const { randomUUID } = require("crypto");
const { v4: uuidv4 } = require("uuid");

// Store active scan sessions in memory
const activeScanSessions = new Map();

exports.getAllLocations = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM location_types ORDER BY location_id"
    );
    res.json({
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    res.status(500).json({
      message: "Error retrieving locations",
      error: err.message,
    });
  }
};

exports.getLocationById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM location_types WHERE location_id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Location not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      message: "Error retrieving location",
      error: err.message,
    });
  }
};

exports.createLocation = async (req, res) => {
  const { location_id, type_name } = req.body;

  // Add validation for type_name
  if (!["FG Pallet Location", "Paper Roll Location"].includes(type_name)) {
    return res.status(400).json({
      message:
        "Invalid type_name. Must be either 'FG Pallet Location' or 'Paper Roll Location'",
    });
  }

  try {
    const result = await pool.query(
      "INSERT INTO location_types (location_id, type_name) VALUES ($1, $2) RETURNING *",
      [location_id, type_name]
    );

    res.status(201).json({
      message: "Location created successfully",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({
      message: "Error creating location",
      error: err.message,
    });
  }
};

// Delete Location
exports.deleteLocation = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check if location exists
    const locationCheck = await client.query(
      "SELECT * FROM location_types WHERE location_id = $1",
      [id]
    );

    if (locationCheck.rows.length === 0) {
      return res.status(404).json({
        message: "Location not found",
      });
    }

    // Check if any items is in the location in any table
    const itemCheck = await Promise.all([
      // Check labels table
      client.query(
        "SELECT label_id FROM labels WHERE location_id = $1 LIMIT 1",
        [id]
      ),
      // Check paper rolls table
      client.query(
        "SELECT label_id FROM paper_rolls WHERE location_id = $1 LIMIT 1",
        [id]
      ),
      // Check fg pallets table
      client.query(
        "SELECT label_id FROM fg_pallets WHERE location_id = $1 LIMIT 1",
        [id]
      ),
    ]);

    // If any query returns rows, items are still in the location
    const hasAssignedItems = itemCheck.some((result) => result.rows.length > 0);

    if (hasAssignedItems) {
      return res.status(400).json({
        message:
          "Cannot delete locations: Items are still assigned to this location",
      });
    }

    // If no items in the location
    await client.query("DELETE FROM location_types WHERE location_id = $1", [
      id,
    ]);

    await client.query("COMMIT");

    res.json({
      message: "Location deleted successfully",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error deleting location:", err);
    res.status(500).json({
      message: "Error deleting location",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

//Handle rack of the location
exports.handleRackScan = async (req, res) => {
  const { location_id } = req.body;
  const client = await pool.connect();

  try {
    // Verify location exists
    const locationCheck = await client.query(
      "SELECT * FROM location_types WHERE location_id = $1",
      [location_id]
    );

    if (locationCheck.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Invalid rack location",
      });
    }

    // Generate new scan session
    const sessionId = uuidv4();

    // Store session info in memory
    activeScanSessions.set(sessionId, {
      location_id,
      timestamp: new Date(),
      scan_sequence: 1,
    });

    // Set session expiry (e.g., 5 minutes)
    setTimeout(() => {
      activeScanSessions.delete(sessionId);
    }, 5 * 60 * 1000);

    res.json({
      status: "success",
      message: "Rack scan recorded",
      session_id: sessionId,
      location: locationCheck.rows[0],
    });
  } catch (err) {
    console.error("Rack scan error:", err);
    res.status(500).json({
      status: "error",
      message: "Error processing rack scan",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

//Tracking item location
exports.handleItemScan = async (req, res) => {
  const { label_id, session_id } = req.body;
  const client = await pool.connect();

  try {
    // Check if session exists and is valid
    const sessionData = activeScanSessions.get(session_id);
    if (!sessionData) {
      return res.status(400).json({
        status: "error",
        message:
          "Invalid or expired scan session. Please scan rack location first",
      });
    }

    const scanned_location = sessionData.location_id; // Get location from session

    // Get item details including location history
    const itemCheck = await client.query(
      `WITH current_assignment AS (
              SELECT location_id, scan_timestamp
              FROM rack_item_assignments
              WHERE label_id = $1
              ORDER BY scan_timestamp DESC
              LIMIT 1
          )
          SELECT 
              l.label_type,
              l.location_id as registered_location,
              ca.location_id as current_location,
              CASE 
                  WHEN ca.location_id IS NOT NULL THEN l.location_id
                  ELSE NULL
              END as past_location
          FROM labels l
          LEFT JOIN current_assignment ca ON true
          WHERE l.label_id = $1`,
      [label_id]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Invalid item",
      });
    }

    const { label_type, registered_location, current_location, past_location } =
      itemCheck.rows[0];

    // Get location type info for validation
    const locationTypeCheck = await client.query(
      "SELECT type_name FROM location_types WHERE location_id = $1",
      [scanned_location]
    );

    const isValidLocationType =
      (label_type === "Roll" &&
        locationTypeCheck.rows[0].type_name === "Paper Roll Location") ||
      (label_type === "FG Pallet" &&
        locationTypeCheck.rows[0].type_name === "FG Pallet Location");

    // Create new rack-item assignment
    await client.query(
      `INSERT INTO rack_item_assignments
           (location_id, label_id, scan_timestamp, scan_sequence, scan_session_id)
           VALUES ($1, $2, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur', $3, $4)`,
      [scanned_location, label_id, sessionData.scan_sequence, session_id]
    );

    // Format response object
    const responseData = {
      status: "success",
      validation: {
        correct_location_type: isValidLocationType,
        in_assigned_location: registered_location === scanned_location,
      },
      message: isValidLocationType
        ? "Item is in correct rack type"
        : "WARNING: Item is in wrong rack type",
      details: {
        label_id,
        type: label_type,
        work_order: req.body.work_order,
        current_location: scanned_location, // Use scanned location as current
        past_location: current_location || registered_location, // Use previous current location as past
        correct_location: isValidLocationType,
        exists: true,
        timestamp: new Date().toISOString(),
      },
    };

    res.json(responseData);
  } catch (err) {
    console.error("Item scan error:", err);
    res.status(500).json({
      status: "error",
      message: "Error processing item scan",
      error: err.message,
    });
  } finally {
    client.release();
  }
};
