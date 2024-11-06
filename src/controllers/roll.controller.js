const pool = require('../config/db.config');

const rollController = {
    // Create new roll label
    create: async (req, res) => {
        const {rollId} = req.body;
        const checkIn = new Date();

        try {
            // Begin transaction
            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                // Insert into labels table first
                const labelInsert = await client.query(
                    `INSERT INTO labels (label_type, label_id, check_in, status, status_updated_at)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id`,
                    ['roll', rollId, checkIn, 'Available', checkIn]
                );

                // Insert into roll_labels table
                const rollInsert = await client.query(
                    `INSERT INTO roll_labels (label_id, roll_id, check_in)
                    VALUES ($1, $2, $3)
                    RETURNING *`,
                    [labelInsert.rows[0].id, rollId, checkIn]
                );

                await client.query('COMMIT');

                res.status(201).json({
                    message: 'Roll label created successfully',
                    data: {
                        rollId: rollInsert.rows[0].roll_id,
                        checkIn: rollInsert.rows[0].check_in,
                        status: 'Available'
                    }
                });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
        } catch (err) {
            res.status(500).json({
                message: 'Error creating roll label',
                error: err.message
            });
        }
    },
    // Get all roll labels
    getAll: async (req, res) => {
        const {startDate, endDate} = req.query;

        try {
            let query = `
                SELECT
                    l.check_in,
                    l.label_type,
                    l.status,
                    l.status_updated_at,
                    l.status_notes,
                    rl.roll_id
                FROM labels l
                JOIN roll_labels rl ON l.id = rl.label_id
                WHERE l.label_type = 'roll'
                `;
            const params = [];

            // Add date filters if provided
            if(startDate){
                params.push(new Date(startDate));
                query += ` AND l.check_in >= $${params.length}`;
            }

            if(endDate){
                params.push(new Date(endDate));
                query += ` AND l.check_in <= $${params.length}`;
            }

            query += ' ORDER BY l.check_in DESC';

            const result = await pool.query(query, params);

            res.json({
                count: result.rows.length,
                data: result.rows
            });
        } catch (err) {
            res.status(500).json({
                message: 'Error retrieving roll labels',
                error: err.message
            });
        }
    },
    // Get roll label by ID
    getById: async (req, res) => {
        const {id} = req.params;

        try {
            const query = `
                SELECT
                    l.check_in,
                    l.label_type,
                    l.status,
                    l.status_updated_at,
                    l.status_notes,
                    rl.roll_id
                FROM labels l
                JOIN roll_labels rl ON l.id = rl.label_id
                WHERE rl.roll_id = $1
                ORDER BY l.check_in DESC
                LIMIT 1
            `;

            const result = await pool.query(query, [id]);

            if(result.rows.length === 0){
                return res.status(404).json({
                    message: 'Roll label not found'
                });
            }
            
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error in getById', err);
            res.status(500).json({
                message: 'Error retrieving roll label',
                error: err.message
            });
        }
    },
    // Update Roll Label
    updateStatus: async (req, res) => {
        const {id} = req.params;
        const {status, notes} = req.body;

        // Validate status
        const validStatuses = ['Available', 'Checked out', 'Lost', 'Unresolved'];
        if (!validStatuses.includes(status)) {
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
                     JOIN roll_labels rl ON l.id = rl.label_id
                     WHERE rl.roll_id = $1
                     ORDER BY l.check_in DESC
                     LIMIT 1`,
                    [id]
                );

                if (findLabel.rows.length === 0) {
                    return res.status(404).json({
                        message: 'Roll label not found'
                    });
                }

                const labelId = findLabel.rows[0].id;
                const currentStatus = findLabel.rows[0].current_status;

                // Only update if status is different
                if (currentStatus !== status) {
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
                            rollId: id,
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
                            rollId: id,
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
            console.error('Error in updateStatus:', err);
            res.status(500).json({
                message: 'Error updating roll status',
                error: err.message
            });
        }
    },
    // Delete Roll Label
    delete: async (req, res) => {
        const {id} = req.params; // Get roll ID from URL parameters

        try {
            const client = await pool.connect(); // Get dedicated client for transaction

            try {
                await client.query('BEGIN'); // Start transaction

                // First find the label_id from roll_labels
                const findLabel = await client.query(
                    `SELECT label_id
                    FROM roll_labels
                    WHERE roll_id = $1
                    ORDER BY check_in DESC
                    LIMIT 1`,
                    [id]
                );

                if(findLabel.rows.length === 0){
                    return res.status(400).json({
                        message: 'Roll label not found'
                    });
                }

                const labelId = findLabel.rows[0].label_id;

                // Delete from roll_labels first (child table)
                await client.query(
                    `DELETE FROM roll_labels
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
                    message: 'Roll label deleted successfully',
                    rollId: id
                });

            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (err) {
            console.error('Error in delete:', err);
            res.status(500).json({
                message: 'Error deleting roll label',
                error: err.message
            });
        }
    }
};

module.exports = rollController;