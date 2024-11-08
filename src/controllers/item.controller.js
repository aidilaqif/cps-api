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

exports.createItem = async (req, res) => {
  const { label_id, label_type, location_id } = req.body;
  
  try {
    const result = await pool.query(
      'INSERT INTO labels (label_id, label_type, location_id) VALUES ($1, $2, $3) RETURNING *',
      [label_id, label_type, location_id]
    );
    
    res.status(201).json({
      message: 'Item created successfully',
      data: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({
      message: 'Error creating item',
      error: err.message
    });
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