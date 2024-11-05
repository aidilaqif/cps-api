const pool = require('../config/db.config'); // Imports the database connection pool

const fgLocationController = {
    // Create new FG Location Label
    create: async (req, res) => {
        const {locationId} = req.body; // Extracts locationId from request body

        const checkIn = new Date(); // Creates timestamp for when label is created

        try {
            const client = await pool.connect(); // Gets a client from connection pool

            try {
                await client.query('BEGIN'); // Starts database transaction

                // First insert: labels table
                const labelInsert = await client.query(
                    `INSERT INTO labels (label_type, label_id, check_in)
                    VALUES ($1, $2, $3)
                    RETURNING id`,
                    ['fg_location', locationId, checkIn]
                );

                // Second insert: fg_location_labels table
                const locationInsert = await client.query(
                    `INSERT INTO fg_location_labels (label_id, location_id, check_in)
                    VALUES ($1, $2, $3)
                    RETURNING *`,
                    [labelInsert.rows[0].id, locationId, checkIn]
                );

                await client.query('COMMIT'); // Commits the transaction if both inserts succeed

                res.status(201).json({
                    message: 'FG location label created successfully',
                    data: {
                        locationId: locationInsert.rows[0].location_id,
                        checkIn: locationInsert.rows[0].check_in
                    }
                });
            } catch (err) {
                await client.query('ROLLBACK'); // Rolls back transaction if any error occurs
                throw err;
            } finally {
                client.release(); // Returns the client to the pool
            }
        } catch (err) {
            res.status(500).json({
                message: 'Error creating FG location label',
                error: err.message
            });
        }
    },
    // Get all FG Location Label
    getAll: async (req, res) => {
        const {startDate, endDate} = req.query; // Extracts date filters from query parameters

        try {
            let query = `
                SELECT
                    l.check_in,
                    l.label_type,
                    fl.location_id
                FROM labels l
                JOIN fg_location_labels fl on l.id = fl.label_id
                WHERE l.label_type = 'fg_location'
            `;

            const params = []; // Dynamic query bulding based on filters

            if (startDate){
                params.push(new Date(startDate));
                query += ` AND l.check_in >= $${params.length}`;
            }

            if (endDate){
                params.push(new Date(endDate));
                query += ` AND l.check_in <= $${params.length}`
            }

            query += 'ORDER BY l.check_in DESC';

            const result = await pool.query(query, params);

            res.json({
                count: result.rows.length,
                data: result.rows
            });
        } catch (err) {
            res.status(500).json({
                message: 'Error retrieving FG location labels',
                error: err.message
            });
        }
    },
    // Get FG Location label by ID
    getById: async (req, res) => {
        const {id} = req.params; // Gets ID from URL parameters

        try {
            const result = await pool.query(
                `SELECT
                    l.check_in,
                    l.label_type,
                    fl.location_id
                FROM labels l
                JOIN fg_location_labels fl ON l.id = fl.label_id
                WHERE l.label_type = 'fg_location'
                AND fl.location_id = $1
                ORDER BY l.check_in DESC
                LIMIT 1`,
                [id]
            );

            if(result.rows.length === 0){
                return res.status(404).json({
                    message: 'FG location label not found'
                });
            }
            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({
                message: 'Error retrieving FG location label',
                error: err.message
            });
        }
    },
    // Delete FG Location Label
    delete: async (req, res) => {
        const {id} = req.params; // Get location ID from URL parameter

        try {
            const client = await pool.connect(); // Get dedicated client

            try {
                await client.query('BEGIN'); // Start transaction

                // First find the label_id from fg_location_labels
                const findLabel = await client.query(
                    `SELECT label_id
                    FROM fg_location_labels
                    WHERE location_id = $1
                    ORDER BY check_in DESC
                    LIMIT 1`,
                    [id]
                );

                if(findLabel.rows.length === 0){
                    return res.status(404).json({
                        message: 'FG location label not found'
                    });
                }

                const labelId = findLabel.rows[0].label_id;

                // Delete from fg_location_labels first (child table)
                await client.query(
                    `DELETE FROM fg_location_labels
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
                    message: 'FG location label deleted successfully',
                    locationId: id
                });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (err) {
            res.status(500).json({
                message: 'Error deleting FG location label',
                error: err.message
            });
        }
    }
};

module.exports = fgLocationController;