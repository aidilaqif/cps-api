const pool = require('../config/db.config'); // Import db connection pool

const fgPalletController = {
    // Create new FG pallet label
    create: async (req, res) => {
        const{plateId, workOrder, rawValue} = req.body;

        const checkIn = new Date(); // Timestamp for label creation

        try {
            const client = await pool.connect(); // Gets dedicated database client for transaction

            try {
                await client.query('BEGIN'); // Starts transaction

                // First insert into labels table
                const labelInsert = await client.query(
                    `INSERT INTO labels (label_type, label_id, check_in, status, status_updated_at)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id`,
                    ['fg_pallet', plateId, checkIn, 'Available', checkIn]
                ); // Create parent label record

                // Second insert into fg_pallet_labels table
                const palletInsert = await client.query(
                    `INSERT INTO fg_pallet_labels
                    (label_id, raw_value, plate_id, work_order, check_in)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING *`,
                    [labelInsert.rows[0].id, rawValue, plateId, workOrder, checkIn]
                ); // Creates child pallet-specific record with additional data

                await client.query('COMMIT');

                res.status(201).json({
                    message: 'FG pallet label created successfully',
                    data: {
                        plateId: palletInsert.rows[0].plate_id,
                        workOrder: palletInsert.rows[0].work_order,
                        rawValue: palletInsert.rows[0].raw_value,
                        checkIn: palletInsert.rows[0].check_in,
                        status: 'Available'
                    }
                });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (err) {
            res.status(500).json({
                message: 'Error creating FG pallet label',
                error: err.message
            });
        }
    },
    // Get all FG pallet with filtering options
    getAll: async (req, res) => {
        const {startDate, endDate, plateId, workOrder, status} = req.query;

        try {
            let query = `
                SELECT
                    l.check_in,
                    l.label_type,
                    l.status,
                    l.status_updated_at,
                    l.status_notes,
                    fpl.raw_value,
                    fpl.plate_id,
                    fpl.work_order
                FROM labels l
                JOIN fg_pallet_labels fpl ON l.id = fpl.label_id
                WHERE l.label_type = 'fg_pallet'
            `;
            const params = [];
            // Dynamic query building based on filters

            if(startDate){
                params.push(new Date(startDate));
                query += ` AND l.check_in >= $${params.length}`;
            }

            if(endDate){
                params.push(new Date(endDate));
                query += ` AND l.check_in <= $${params.length}`;
            }

            if(plateId){
                params.push(`%${plateId}%`);
                query += ` AND fpl.plate_id ILIKE $${params.length}`;
            }

            if(workOrder){
                params.push(`%${workOrder}%`);
                query += ` AND fpl.work_order ILIKE $${params.length}`;
            }

            query += ' ORDER BY l.check_in DESC';

            const result = await pool.query(query, params);

            res.json({
                count: result.rows.length,
                data: result.rows
            });
        } catch (err) {
            res.status(500).json({
                message: 'Error retrieving FG pallet labels',
                error: err.message
            });
        }
    },
    // Get Latest FG Pallet Label
    getLatest: async (req, res) => {
        try {
            const query = `
                SELECT 
                    l.check_in,
                    l.label_type,
                    l.status,
                    l.status_updated_at,
                    l.status_notes,
                    fpl.raw_value,
                    fpl.plate_id,
                    fpl.work_order
                FROM labels l
                JOIN fg_pallet_labels fpl ON l.id = fpl.label_id
                WHERE l.label_type = 'fg_pallet'
                ORDER BY l.check_in DESC
            `;

            const result = await pool.query(query);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: 'No FG pallet labels found'
                });
            }

            res.json({
                count: result.rows.length,
                data: result.rows.map(row => ({
                    rawValue: row.raw_value,
                    plateId: row.plate_id,
                    workOrder: row.work_order,
                    checkIn: row.check_in,
                    labelType: row.label_type,
                    status: row.status,
                    statusUpdatedAt: row.status_updated_at,
                    statusNotes: row.status_notes
                }))
            });
        } catch (err) {
            console.error('Error in getLatest:', err);
            res.status(500).json({
                message: 'Error retrieving latest FG pallet labels',
                error: err.message
            });
        }
    },
    // Get Latest FG Pallet Labels Stats
    getLatestStats: async (req, res) => {
        try {
            const query = `
                SELECT
                    COUNT(DISTINCT fpl.plate_id) as total_pallets,
                    COUNT(DISTINCT CASE WHEN l.status = 'Available' THEN fpl.plate_id END) as available_pallets,
                    COUNT(DISTINCT CASE WHEN l.status = 'Checked out' THEN fpl.plate_id END) as checked_out_pallets,
                    COUNT(DISTINCT CASE WHEN l.status = 'Lost' THEN fpl.plate_id END) as lost_pallets,
                    COUNT(DISTINCT CASE WHEN l.status = 'Unresolved' THEN fpl.plate_id END) as unresolved_pallets,
                    MAX(l.check_in) as latest_scan_time,
                    MIN(l.check_in) as oldest_scan_time
                FROM labels l
                JOIN fg_pallet_labels fpl ON l.id = fpl.label_id
                WHERE l.label_type = 'fg_pallet'
            `;

            const result = await pool.query(query);

            const stats = result.rows[0];
            res.json({
                data: {
                    totalPallets: parseInt(stats.total_pallets),
                    availablePallets: parseInt(stats.available_pallets),
                    checkedOutPallets: parseInt(stats.checked_out_pallets),
                    lostPallets: parseInt(stats.lost_pallets),
                    unresolvedPallets: parseInt(stats.unresolved_pallets),
                    latestScanTime: stats.latest_scan_time,
                    oldestScanTime: stats.oldest_scan_time
                }
            });
        } catch (err) {
            console.error('Error in getLatestStats:', err);
            res.status(500).json({
                message: 'Error retrieving FG pallet statistics',
                error: err.message
            });
        }
    },
    // Get specific pallet label by ID
    getById: async (req, res) => {
        const {id} = req.params;

        try {
            const result = await pool.query(
                `SELECT
                    l.check_in,
                    l.label_type,
                    l.status,
                    l.status_updated_at,
                    l.status_notes,
                    fpl.raw_value,
                    fpl.plate_id,
                    fpl.work_order
                FROM labels l
                JOIN fg_pallet_labels fpl ON l.id = fpl.label_id
                WHERE l.label_type = 'fg_pallet'
                AND fpl.plate_id = $1
                ORDER BY l.check_in DESC
                LIMIT 1`,
                [id]
            );

            if(result.rows.length === 0){
                return res.status(404).json({
                    message: 'FG pallet label not found'
                });
            }

            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({
                message: 'Error retrieving FG pallet label',
                error: err.message
            });
        }
    },
    // Upadate FG Pallet Label Status
    updateStatus: async (req, res) => {
        const {id} = req.params;
        const {status, notes} = req.body;

        // Validate status
        const validStatuses = ['Available', 'Checked out', 'Lost', 'Unresolved'];
        if(!validStatuses.includes(status)){
            return res.status(400).json({
                message: 'Invalid status value'
            });
        }

        try {
            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // First find the label_id
                const findLabel = await client.query(
                    `SELECT l.id, l.status as current_status
                    FROM labels l
                    JOIN fg_pallet_labels fpl on l.id = fpl.label_id
                    WHERE fpl.plate_id = $1
                    ORDER BY l.check_in DESC
                    LIMIT 1`,
                    [id]
                );

                if(findLabel.rows.length === 0){
                    return res.status(400).json({
                        message: 'FG pallet label not found'
                    });
                }

                const labelId = findLabel.rows[0].id;
                const currentStatus = findLabel.rows[0].current_status;

                // Only update if status is different
                if(currentStatus !== status){
                    const updateResult = await client.query(
                        `UPDATE labels
                        SET status = $1,
                            status_updated_at = CURRENT_TIMESTAMP,
                            status_notes = $2
                        WHERE id = $3
                        RETURNING status, status_updated_at, status_notes`,
                        [status, notes, labelId]
                    );

                    await client.query('COMMIT');

                    res.json({
                        message: 'Status updated successfully',
                        data: {
                            plateId: id,
                            status: updateResult.rows[0].status,
                            statusUpdatedAt: updateResult.rows[0].status_updated_at,
                            notes: updateResult.rows[0].status_notes
                        }
                    });
                } else {
                    await client.query('ROLLBACK');
                    res.json({
                        message: 'No status change needed',
                        data: {
                            plateId: id,
                            status: currentStatus
                        }
                    });
                }
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (err) {
            res.status(500).json({
                message: 'Error updating FG pallet status',
                error: err.message
            });
        }
    },
    // Delete FG Pallet Label
    delete: async (req, res) => {
        const {id} = req.params; // Get plate ID from URL parameter

        try {
            const client = await pool.connect(); // Get dedicated client for transaction

            try {
                await client.query('BEGIN'); // Start transaction

                // First find the label_id from fg_pallet_labels
                const findLabel = await client.query(
                    `SELECT label_id
                    FROM fg_pallet_labels
                    WHERE plate_id = $1
                    ORDER BY check_in DESC
                    LIMIT 1`,
                    [id]
                );

                if (findLabel.rows.length === 0){
                    return res.status(404).json({
                        message: 'FG pallet label not found'
                    });
                }

                const labelId = findLabel.rows[0].label_id;

                // Delete from fg_pallet_labels first (child table)
                await client.query(
                    `DELETE FROM fg_pallet_labels
                    WHERE label_id = $1`,
                    [labelId]
                );

                // Then delete from labels table (parent table)
                await client.query(
                    `DELETE FROM labels
                    WHERE id = $1`,
                    [labelId]
                );

                await client.query('COMMIT');

                res.json({
                    message: 'FG pallet label deleted successfully',
                    plateId: id
                });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (err) {
            res.status(500).json({
                message: 'Error deleting FG pallet label',
                error: err.message
            });
        }
    }
};

module.exports = fgPalletController;