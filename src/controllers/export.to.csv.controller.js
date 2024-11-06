const pool = require('../config/db.config');

const exportToCSVController = {
    // Get all labels with filtering
    getAllLabels: async (req, res) => {
        const {startDate, endDate, labelTypes} = req.query;
        // labelTypes should be comma-separated string of types: fg_pallet, roll, fg_location, paper_roll_location

        try {
            let query = `
                WITH base_labels AS(
                    SELECT
                        l.id,
                        l.check_in,
                        l.label_type,
                        l.label_id,
                        fpl.raw_value,
                        fpl.work_order,
                        CASE
                            WHEN l.label_type = 'fg_pallet' THEN fpl.plate_id
                            WHEN l.label_type = 'roll' THEN rl.roll_id
                            WHEN l.label_type = 'fg_location' THEN fl.location_id
                            WHEN l.label_type = 'paper_roll_location' THEN prl.location_id
                        END as identifier
                    FROM labels l
                    LEFT JOIN fg_pallet_labels fpl ON l.id = fpl.label_id
                    LEFT JOIN roll_labels rl ON l.id = rl.label_id
                    LEFT JOIN fg_location_labels fl ON l.id = fl.label_id
                    LEFT JOIN paper_roll_location_labels prl ON l.id = prl.label_id
                    WHERE 1=1
                    ${startDate ? ' AND l.check_in >= $1' : ''}
                    ${endDate ? ` AND l.check_in <= $${startDate ? 2 : 1}` : ''}
                    ${labelTypes ? ` AND l.label_type = ANY($${(startDate ? 1 : 0) + (endDate ? 1 : 0) + 1}::text[])` : ''}
                )
                SELECT * FROM base_labels
                ORDER BY check_in DESC
            `;

            const params = [];
            if(startDate) params.push(new Date(startDate));
            if(endDate) params.push(new Date(endDate));
            if(labelTypes) params.push(labelTypes.split(',').map(type => type.trim()));

            console.log('Executing query:', query); // Debug log
            console.log('Parameters:', params); // Debug log

            const result = await pool.query(query);

            console.log('Query result:', result.rows.slice(0,2)); // Debug log first 2 rows

            // Transform data for response
            const transformedData = result.rows.map(row => ({
                scanTime: row.check_in,
                labelType: row.label_type,
                identifier: row.identifier,
                additionalInfo: _getAdditionalInfo(row)
            }));

            res.json({
                count: result.rows.length,
                data: transformedData
            });
        } catch (err) {
            console.error('Full error:', err); // Debug log
            res.status(500).json({
                message: 'Error retrieving labels for export',
                error: err.message,
                fullError: err.toString() // Additional error info
            });
        }
    },
    // Get labels by type with filtering
    getLabelsByType: async (req, res) => {
        const {type} = req.params;
        const {startDate, endDate} = req.query;

        try {
            let query;
            const params = [];

            switch (type){
                case 'fg_pallet':
                    query = `
                        SELECT
                            l.check_in,
                            fpl.plate_id,
                            fpl.work_order,
                            fpl.raw_value
                        FROM labels l
                        JOIN fg_pallet_labels fpl ON l.id = fpl.label_id
                        WHERE l.label_type = 'fg_pallet'
                    `;
                    break;

                case 'roll':
                    query = `
                        SELECT
                            l.check_in,
                            rl.roll_id
                        FROM labels l
                        JOIN roll_labels rl ON l.id = rl.label_id
                        WHERE l.label_type = 'roll'
                    `;
                    break;

                case 'fg_location':
                    query = `
                        SELECT
                            l.check_in,
                            fl.location_id
                        FROM labels l
                        JOIN fg_location_labels fl ON l.id = fl.label_id
                        WHERE l.label_type = 'fg_location'
                    `;
                    break;

                case 'paper_roll_location':
                    query = `
                        SELECT
                            l.check_in,
                            prl.location_id
                        FROM labels l
                        JOIN paper_roll_location_labels prl ON l.id = prl.label_id
                        WHERE l.label_type = 'paper_roll_location'
                    `;
                    break;

                default:
                    return res.status(400).json({
                        message: 'Invalid label type'
                    });
            }

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
                message: `Error retrieving ${type} labels`,
                error: err.message
            });
        }
    }
}
// Helper funtion to format additional info based on label type
function _getAdditionalInfo(row){
    switch (row.label_type){
        case 'fg_pallet':
            return `Work Order: ${row.work_order}, Raw Value: ${row.raw_value}`;
        case 'roll':
            return '';
        case 'fg_location':
            return '';
        case 'paper_roll_location':
            return '';
        default:
            return '';
    }
}

module.exports = exportToCSVController;