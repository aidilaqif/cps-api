const pool = require("../config/db.config");
const { randomUUID } = require("crypto");

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
      console.log("Scanning rack location:", location_id); // Debug log

      // Verify location exists
      const locationCheck = await client.query(
          "SELECT * FROM location_types WHERE location_id = $1",
          [location_id.trim()] // Add trim() to handle whitespace
      );

      if (locationCheck.rows.length === 0) {
          console.log("Location not found:", location_id); // Debug log
          await client.release();
          return res.status(404).json({
              status: "error",
              message: "Invalid rack location"
          });
      }

      // Generate new scan session
      const sessionId = randomUUID();

      // Record rack scan
      await client.query(
          `INSERT INTO rack_item_assignments 
          (location_id, scan_sequence, scan_session_id)
          VALUES ($1, 1, $2)`,
          [location_id.trim(), sessionId]
      );

      const response = {
          status: "success",
          message: "Rack scan recorded",
          session_id: sessionId,
          location: locationCheck.rows[0]
      };

      await client.release();
      return res.json(response);

  } catch (err) {
      console.error("Rack scan error:", err);
      await client.release();
      return res.status(500).json({
          status: "error",
          message: "Error processing rack scan",
          error: err.message
      });
  }
};

//Tracking item location
exports.handleItemScan = async (req, res) => {
  const { label_id, session_id } = req.body;
  const client = await pool.connect();
  try {
    // Get the most recent rack scan for this session
    const rackScan = await pool.query(
      `SELECT lt.location_id, lt.type_name 
           FROM rack_item_assignments ria 
           JOIN location_types lt ON ria.location_id = lt.location_id
           WHERE ria.scan_session_id = $1 AND ria.scan_sequence = 1
           ORDER BY ria.scan_timestamp DESC LIMIT 1`,
      [session_id]
    );

    if (rackScan.rows.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Please scan rack location first",
      });
    }

    const scanned_location = rackScan.rows[0];

    // Get item details
    const itemCheck = await pool.query(
      `SELECT l.label_type, l.location_id as current_location
           FROM labels l
           WHERE l.label_id = $1`,
      [label_id]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Invalid item",
      });
    }

    const { label_type, current_location } = itemCheck.rows[0];

    // Validate location type matches item type
    const isValidLocationType =
      (label_type === "Roll" &&
        scanned_location.type_name === "Paper Roll Location") ||
      (label_type === "FG Pallet" &&
        scanned_location.type_name === "FG Pallet Location");

    res.json({
      status: "success",
      validation: {
        correct_location_type: isValidLocationType,
        in_assigned_location: current_location === scanned_location.location_id,
        current_location: current_location,
        scanned_location: scanned_location.location_id,
      },
      message: isValidLocationType
        ? "Item is in correct rack type"
        : "WARNING: Item is in wrong rack type",
      details: {
        label_id,
        rack_location: scanned_location.location_id,
        item_type: label_type,
      },
    });
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
