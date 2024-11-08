const pool = require('../config/db.config');

exports.getAllItems = async (req, res) => {
  const { type, status, location } = req.query;
  
  try {
    const query = `
      SELECT * FROM labels 
      WHERE 1=1 
      ${type ? 'AND label_type = $1' : ''}
      ${status ? 'AND status = $2' : ''}
      ${location ? 'AND location_id = $3' : ''}
    `;
    
    const params = [type, status, location].filter(Boolean);
    const result = await pool.query(query, params);
    
    res.json({
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    res.status(500).json({
      message: 'Error retrieving items',
      error: err.message
    });
  }
};

exports.getItemById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('SELECT * FROM labels WHERE label_id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      message: 'Error retrieving item',
      error: err.message
    });
  }
};

// Check if item exists
exports.checkItemExists = async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Checking item existence for:', id);
    const result = await pool.query(
      'SELECT l.*, ' +
      'CASE ' +
      '  WHEN l.label_type = \'Roll\' THEN json_build_object(\'code\', pr.code, \'name\', pr.name, \'size_mm\', pr.size_mm) ' +
      '  WHEN l.label_type = \'FG Pallet\' THEN json_build_object(\'plt_number\', fp.plt_number, \'quantity\', fp.quantity, \'work_order_id\', fp.work_order_id, \'total_pieces\', fp.total_pieces) ' +
      '  ELSE NULL ' +
      'END as details ' +
      'FROM labels l ' +
      'LEFT JOIN paper_rolls pr ON l.label_id = pr.label_id ' +
      'LEFT JOIN fg_pallets fp ON l.label_id = fp.label_id ' +
      'WHERE l.label_id = $1',
      [id]
    );
    
    res.json({
      exists: result.rows.length > 0,
      item: result.rows[0] || null
    });
  } catch (err) {
    console.error('Error checking item existence:', err);
    res.status(500).json({
      message: 'Error checking item',
      error: err.message
    });
  }
};

// Create new item
exports.createNewItem = async (req, res) => {
  const { label_id, label_type, details } = req.body;
  
  console.log('Received create item request:', { label_id, label_type, details }); // Debug log

  const client = await pool.connect();
  
  try {
    // Validate input
    if (!label_id || !label_type) {
      throw new Error('Missing required fields: label_id and label_type are required');
    }

    // Validate details based on type
    if (label_type === 'FG Pallet') {
      if (!details.plt_number || !details.quantity || !details.total_pieces) {
        throw new Error('Missing required FG Pallet details: plt_number, quantity, and total_pieces are required');
      }
    }

    await client.query('BEGIN');

    // Insert into labels table
    console.log('Inserting into labels table...'); // Debug log
    const labelResult = await client.query(
      'INSERT INTO labels (label_id, label_type, status) VALUES ($1, $2, $3) RETURNING *',
      [label_id, label_type, 'Unresolved']
    );

    let detailsResult;
    if (label_type === 'FG Pallet') {
      console.log('Inserting FG Pallet details...'); // Debug log
      detailsResult = await client.query(
        'INSERT INTO fg_pallets (label_id, plt_number, quantity, work_order_id, total_pieces) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [
          label_id,
          details.plt_number,
          details.quantity,
          details.work_order_id || null,
          details.total_pieces
        ]
      );
    }

    await client.query('COMMIT');
    console.log('Transaction committed successfully'); // Debug log

    res.status(201).json({
      message: 'Item created successfully',
      data: {
        ...labelResult.rows[0],
        details: detailsResult?.rows[0]
      }
    });
  } catch (err) {
    console.error('Error creating item:', err); // Debug log
    await client.query('ROLLBACK');
    res.status(500).json({
      message: 'Error creating item',
      error: err.message,
      details: err.stack // Include stack trace for debugging
    });
  } finally {
    client.release();
  }
};

exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  // Validate status
  const validStatuses = ['Available', 'Checked Out', 'Lost', 'Unresolved'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
    });
  }

  try {
    console.log('Updating status for item:', id, 'to:', status);
    
    const result = await pool.query(
      `UPDATE labels 
       SET status = $1,
           last_scan_time = CURRENT_TIMESTAMP
       WHERE label_id = $2
       RETURNING label_id, label_type, location_id, status, last_scan_time`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: `Item with ID ${id} not found`
      });
    }

    res.json({
      message: 'Status updated successfully',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({
      message: 'Error updating item status',
      error: err.message
    });
  }
};

exports.updateLocation = async (req, res) => {
  const { id } = req.params;
  const { location_id } = req.body;

  try {
    console.log('Updating location for item:', id, 'to:', location_id);
    
    // First verify the location exists
    const locationCheck = await pool.query(
      'SELECT location_id FROM location_types WHERE location_id = $1',
      [location_id]
    );

    if (locationCheck.rows.length === 0) {
      return res.status(404).json({
        message: `Location ${location_id} not found`
      });
    }

    const result = await pool.query(
      `UPDATE labels 
       SET location_id = $1,
           last_scan_time = CURRENT_TIMESTAMP
       WHERE label_id = $2
       RETURNING label_id, label_type, location_id, status, last_scan_time`,
      [location_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: `Item with ID ${id} not found`
      });
    }

    res.json({
      message: 'Location updated successfully',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Error updating location:', err);
    res.status(500).json({
      message: 'Error updating item location',
      error: err.message
    });
  }
};

exports.deleteItem = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // First get the item type
    const itemResult = await client.query(
      'SELECT label_type FROM labels WHERE label_id = $1',
      [id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Item not found'
      });
    }

    const labelType = itemResult.rows[0].label_type;

    // Delete from the appropriate child table first
    if (labelType === 'Roll') {
      await client.query('DELETE FROM paper_rolls WHERE label_id = $1', [id]);
    } else if (labelType === 'FG Pallet') {
      await client.query('DELETE FROM fg_pallets WHERE label_id = $1', [id]);
    }

    // Then delete from labels table
    await client.query('DELETE FROM labels WHERE label_id = $1', [id]);

    await client.query('COMMIT');

    res.json({
      message: 'Item deleted successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({
      message: 'Error deleting item',
      error: err.message
    });
  } finally {
    client.release();
  }
};