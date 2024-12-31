const pool = require("../config/db.config");
const moment = require("moment-timezone");

exports.getAllItems = async (req, res) => {
  const { type, status, location } = req.query;

  try {
    const query = `
      SELECT * FROM labels 
      WHERE 1=1 
      ${type ? "AND label_type = $1" : ""}
      ${status ? "AND status = $2" : ""}
      ${location ? "AND location_id = $3" : ""}
    `;

    const params = [type, status, location].filter(Boolean);
    const result = await pool.query(query, params);

    res.json({
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    res.status(500).json({
      message: "Error retrieving items",
      error: err.message,
    });
  }
};

exports.getItemById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM labels WHERE label_id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      message: "Error retrieving item",
      error: err.message,
    });
  }
};

// Check if item exists
exports.checkItemExists = async (req, res) => {
  const { id } = req.params;
  try {
    console.log("Checking item existence for:", id);
    const result = await pool.query(
      "SELECT l.*, " +
        "CASE " +
        "  WHEN l.label_type = 'Roll' THEN json_build_object('code', pr.code, 'name', pr.name, 'size_mm', pr.size_mm) " +
        "  WHEN l.label_type = 'FG Pallet' THEN json_build_object('plt_number', fp.plt_number, 'quantity', fp.quantity, 'work_order_id', fp.work_order_id, 'total_pieces', fp.total_pieces) " +
        "  ELSE NULL " +
        "END as details " +
        "FROM labels l " +
        "LEFT JOIN paper_rolls pr ON l.label_id = pr.label_id " +
        "LEFT JOIN fg_pallets fp ON l.label_id = fp.label_id " +
        "WHERE l.label_id = $1",
      [id]
    );

    res.json({
      exists: result.rows.length > 0,
      item: result.rows[0] || null,
    });
  } catch (err) {
    console.error("Error checking item existence:", err);
    res.status(500).json({
      message: "Error checking item",
      error: err.message,
    });
  }
};

// Create new item
exports.createNewItem = async (req, res) => {
  const { label_id, label_type, location_id, details } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get CURRENT Malaysia time (not future date)
    const malaysiaTime = moment().tz("Asia/Kuala_Lumpur").toISOString();
    console.log("Current Malaysia time:", malaysiaTime); // Debug log

    const labelResult = await client.query(
      `INSERT INTO labels (
        label_id, 
        label_type, 
        location_id, 
        status, 
        last_scan_time
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur') 
      RETURNING *`,
      [label_id, label_type, location_id, "Unresolved"]
    );

    let detailsResult;
    if (label_type === "FG Pallet") {
      detailsResult = await client.query(
        "INSERT INTO fg_pallets (label_id, plt_number, quantity, work_order_id, total_pieces, location_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
        [
          label_id,
          details.plt_number,
          details.quantity,
          details.work_order_id || null,
          details.total_pieces,
          location_id,
        ]
      );
    } else if (label_type === "Roll") {
      detailsResult = await client.query(
        "INSERT INTO paper_rolls (label_id, code, name, size_mm, location_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [label_id, details.code, details.name, details.size_mm, location_id]
      );
    }

    await client.query("COMMIT");
    console.log("Transaction committed successfully");

    // Format the timestamp before sending response
    const formattedResult = {
      ...labelResult.rows[0],
      last_scan_time: moment(labelResult.rows[0].last_scan_time)
        .tz("Asia/Kuala_Lumpur")
        .format(),
      details: detailsResult?.rows[0],
    };

    res.status(201).json({
      message: "Item created successfully",
      data: formattedResult,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in createNewItem:", err);
    res.status(500).json({
      message: "Error creating item",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE labels 
       SET status = $1,
           last_scan_time = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur'
       WHERE label_id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: `Item with ID ${id} not found`,
      });
    }

    // Format the timestamp before sending response
    const formattedResult = {
      ...result.rows[0],
      last_scan_time: moment(result.rows[0].last_scan_time)
        .tz("Asia/Kuala_Lumpur")
        .format(),
    };

    res.json({
      message: "Status updated successfully",
      data: formattedResult,
    });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({
      message: "Error updating item status",
      error: err.message,
    });
  }
};

exports.updateLocation = async (req, res) => {
  const { id } = req.params;
  const { location_id } = req.body;

  try {
    const result = await pool.query(
      `UPDATE labels 
       SET location_id = $1,
           last_scan_time = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur'
       WHERE label_id = $2
       RETURNING *`,
      [location_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: `Item with ID ${id} not found`,
      });
    }

    // Format the timestamp before sending response
    const formattedResult = {
      ...result.rows[0],
      last_scan_time: moment(result.rows[0].last_scan_time)
        .tz("Asia/Kuala_Lumpur")
        .format(),
    };

    res.json({
      message: "Location updated successfully",
      data: formattedResult,
    });
  } catch (err) {
    console.error("Error updating location:", err);
    res.status(500).json({
      message: "Error updating item location",
      error: err.message,
    });
  }
};

exports.deleteItem = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // First get the item type
    const itemResult = await client.query(
      "SELECT label_type FROM labels WHERE label_id = $1",
      [id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        message: "Item not found",
      });
    }

    const labelType = itemResult.rows[0].label_type;

    // Delete from the appropriate child table first
    if (labelType === "Roll") {
      await client.query("DELETE FROM paper_rolls WHERE label_id = $1", [id]);
    } else if (labelType === "FG Pallet") {
      await client.query("DELETE FROM fg_pallets WHERE label_id = $1", [id]);
    }

    // Then delete from labels table
    await client.query("DELETE FROM labels WHERE label_id = $1", [id]);

    await client.query("COMMIT");

    res.json({
      message: "Item deleted successfully",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({
      message: "Error deleting item",
      error: err.message,
    });
  } finally {
    client.release();
  }
};
