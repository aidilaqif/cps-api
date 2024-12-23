const pool = require('../config/db.config');

exports.getAllLocations = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM location_types ORDER BY location_id');
    res.json({
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    res.status(500).json({
      message: 'Error retrieving locations',
      error: err.message
    });
  }
};

exports.getLocationById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('SELECT * FROM location_types WHERE location_id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Location not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      message: 'Error retrieving location',
      error: err.message
    });
  }
};

exports.createLocation = async (req, res) => {
  const { location_id, type_name } = req.body;
  
  try {
    const result = await pool.query(
      'INSERT INTO location_types (location_id, type_name) VALUES ($1, $2) RETURNING *',
      [location_id, type_name]
    );
    
    res.status(201).json({
      message: 'Location created successfully',
      data: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({
      message: 'Error creating location',
      error: err.message
    });
  }
};