const pool = require('../config/db.config');

exports.exportToCSV = async (req, res) => {
  try {
    const query = `
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

    const result = await pool.query(query);
    
    // Transform data to match CPS Data-2 format
    const formattedData = {
      locations: [],
      labels: [],
      rolls: [],
      pallets: []
    };

      // Process location types
      const locationTypes = new Set();
      result.rows.forEach(row => {
        if (row.location_id) {
          locationTypes.add({
            id: row.location_id,
            type: row.label_type === 'Roll' ? 'Paper Roll Location' : 'FG Location'
          });
        }
      });
      formattedData.locations = Array.from(locationTypes);

      // Process items
      result.rows.forEach(row => {
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