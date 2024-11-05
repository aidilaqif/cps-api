const pool = require('../config/db.config');

const paperRollLocationController = {
    // Create new paper roll location label
    create: async (req, res) => {
        const {locationId} = req.body;
        const checkIn = new Date();

        try {
            const client = await pool.connect();

            try {
                await client.query('BEGIN'); // Start transaction

                // First insert: base label record
                const labelInsert = await client.query(
                    `INSERT INTO labels (label_type, label_id, check_in)
                    VALUES ($1, $2, $3)
                    RETURNING id`,
                    ['paper_roll_location', locationId, checkIn]
                );

                // Second insert: Paper roll location specific data
                const locationInsert = await client.query(
                    `INSERT INTO paper_roll_location_labels (label_id, location_id, check_in)
                    VALUES ($1, $2, $3)
                    RETURNING *`,
                    [labelInsert.rows[0].id, locationId, checkIn]
                );

                await client.query('COMMIT');

                res.status(201).json({
                    message: 'Paper roll location label created successfully',
                    data: {
                        locationId: locationInsert.rows[0].location_id,
                        checkIn: locationInsert.rows[0].check_in
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
                message: 'Error creating paper roll location label',
                error: err.message
            });
        }
    },
    // Get all paper roll location labels
    getAll: async (req, res) => {
        const {startDate, endDate} = req.query;

        try {
            let query = `
                SELECT l.check_in, l.label_type, prl.location_id
                FROM labels l
                JOIN paper_roll_location_labels prl ON l.id = prl.label_id
            `;

            const params = [];

            if(startDate){
                params.push(new Date(startDate));
                query += `${params.length === 1 ? ' WHERE' : ' AND'} l.check_in >= $${params.length}`;
            }

            if(endDate){
                params.push(new Date(endDate));
                query =+ `${params.length === 1 ? ' WHERE' : ' AND'} l.check_in <= $${params.length}`;
            }

            query += ' ORDER BY l.check_in DESC';

            const result = await pool.query(query, params);

            res.json({
                count: result.rows.length,
                data: result.rows,
                // message: 'Paper roll location labels retrieved successfully'
            });
        } catch (err) {
            res.status(500).json({
                message: 'Error retrieving paper roll location labels',
                error: err.message
            });
        }
    },
    // Get paper roll location label by ID
    getById: async (req, res) => {
        const {id} = req.params;

        try {
            const query =
                `SELECT l.check_in, l.label_type, prl.location_id
                FROM labels l
                JOIN paper_roll_location_labels prl ON l.id = prl.label_id
                WHERE l.label_type = 'paper_roll_location'
                AND prl.location_id = $1
                ORDER BY l.check_in DESC
                LIMIT 1`;
            
            const result = await pool.query(query, [id]);

            if(result.rows.length === 0){
                return res.status(404).json({
                    message: 'Paper roll location label not found'
                });
            }
            
            res.json(result.rows[0]);
        } catch (error) {
            res.status(500).json({
                messagge: 'Error retrieving paper roll location label',
                error: err.message
            });
        }
    },
    // Delete paper roll location label by ID
    delete: async (req, res) => {
        const {id} = req.params; // Get location ID via URL parameter

        try {
            const client = await pool.connect(); // Get dedicated client for transaction

            try {
                await client.query('BEGIN'); // Start transaction

                // First find the label_id from paper_roll_location_labels
                const findLabel = await client.query(
                    `SELECT label_id
                    FROM paper_roll_location_labels
                    WHERE location_id = $1
                    ORDER BY check_in DESC
                    LIMIT 1`,
                    [id]
                );

                if(findLabel.rows.length === 0) {
                    return res.status(404).json({
                        message: 'Paper roll location label not found'
                    });
                }
                const labelId = findLabel.rows[0].label_id;

                // Delete from paper_roll_location_labels first (child table)
                await client.query(
                    `DELETE FROM paper_roll_location_labels
                    WHERE label_id = $1`,
                    [labelId]
                );

                // Delete from labels table (parent table)
                await client.query(
                    `DELETE FROM labels
                    WHERE id = $1`,
                    [labelId]
                );

                await client.query('COMMIT');

                res.json({
                    message: 'Paper roll location label deleted successfully',
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
                message: 'Error deleting paper roll lcoation label',
                error: err.message
            });
        }
    }
};

module.exports = paperRollLocationController;