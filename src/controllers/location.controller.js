const pool = require("../config/db.config");

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
    await client.query('BEGIN');

    // Check if location exists
    const locationCheck = await client.query(
      'SELECT * FROM location_types WHERE location_id = $1',
      [id]
    );

    if(locationCheck.rows.length === 0){
      return res.status(404).json({
        message: 'Location not found'
      });
    }

    // Check if any items is in the location in any table
    const itemCheck = await Promise.all([
      // Check labels table
      client.query('SELECT label_id FROM labels WHERE location_id = $1 LIMIT 1', [id]),
      // Check paper rolls table
      client.query('SELECT label_id FROM paper_rolls WHERE location_id = $1 LIMIT 1', [id]),
      // Check fg pallets table
      client.query('SELECT label_id FROM fg_pallets WHERE location_id = $1 LIMIT 1', [id])
    ]);

    // If any query returns rows, items are still in the location
    const hasAssignedItems = itemCheck.some(result => result.rows.length > 0);

    if(hasAssignedItems){
      return res.status(400).json({
        message: 'Cannot delete locations: Items are still assigned to this location'
      });
    }

    // If no items in the location
    await client.query(
      'DELETE FROM location_types WHERE location_id = $1',
      [id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Location deleted successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting location:', err);
    res.status(500).json({
      message: 'Error deleting location',
      error: err.message
    });
  } finally {
    client.release();
  }
};

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
    const sessionId = crypto.randomUUID();

    // Record rack scan
    await client.query(
      `INSERT INTO rack_item_assignments 
          (location_id, scan_sequence, scan_session_id)
          VALUES ($1, 1, $2)`,
      [location_id, sessionId]
    );

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
    // Get the most recent rack scan for this session
    const rackScan = await client.query(
      `SELECT location_id FROM rack_item_assignments 
           WHERE scan_session_id = $1 AND scan_sequence = 1 
           ORDER BY scan_timestamp DESC LIMIT 1`,
      [session_id]
    );

    if (rackScan.rows.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Please scan rack location first",
      });
    }

    const scanned_location_id = rackScan.rows[0].location_id;

    // Get item details and assigned location based on item type
    const itemCheck = await client.query(
      `SELECT 
              l.label_type,
              l.location_id as labels_location,
              CASE 
                  WHEN l.label_type = 'Roll' THEN 
                      (SELECT location_id FROM paper_rolls WHERE label_id = $1)
                  WHEN l.label_type = 'FG Pallet' THEN 
                      (SELECT location_id FROM fg_pallets WHERE label_id = $1)
              END as item_location
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

    const { label_type, labels_location, item_location } = itemCheck.rows[0];

    // Get valid locations for this item type
    const validLocations = await client.query(
      `SELECT location_id 
           FROM location_types 
           WHERE $1 = ANY(allowed_item_types)`,
      [label_type]
    );

    const validLocationIds = validLocations.rows.map((row) => row.location_id);

    // Validate if scanned location is valid for this item type
    const isValidLocationType = validLocationIds.includes(scanned_location_id);

    // Check if item is in its assigned location
    const isInCorrectLocation =
      scanned_location_id === (item_location || labels_location);

    // Record item scan with validation results
    await client.query(
      `INSERT INTO rack_item_assignments 
          (location_id, label_id, scan_sequence, scan_session_id)
          VALUES ($1, $2, 2, $3)`,
      [scanned_location_id, label_id, session_id]
    );

    // If scan is valid, update locations in all relevant tables
    if (isValidLocationType && isInCorrectLocation) {
      await client.query("BEGIN");

      // Update labels table
      await client.query(
        "UPDATE labels SET location_id = $1 WHERE label_id = $2",
        [scanned_location_id, label_id]
      );

      // Update type-specific table
      if (label_type === "Roll") {
        await client.query(
          "UPDATE paper_rolls SET location_id = $1 WHERE label_id = $2",
          [scanned_location_id, label_id]
        );
      } else if (label_type === "FG Pallet") {
        await client.query(
          "UPDATE fg_pallets SET location_id = $1 WHERE label_id = $2",
          [scanned_location_id, label_id]
        );
      }

      await client.query("COMMIT");
    }

    res.json({
      status: "success",
      validation: {
        correct_location_type: isValidLocationType,
        in_assigned_location: isInCorrectLocation,
        current_location: item_location || labels_location,
        scanned_location: scanned_location_id,
        valid_locations: validLocationIds,
      },
      message:
        isValidLocationType && isInCorrectLocation
          ? "Item is in correct rack and matches assigned location"
          : !isValidLocationType
          ? `WARNING: Item is in wrong rack type. Valid locations are: ${validLocationIds.join(
              ", "
            )}`
          : "WARNING: Item is not in its assigned location",
      details: {
        label_id,
        rack_location: scanned_location_id,
        item_type: label_type,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
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
