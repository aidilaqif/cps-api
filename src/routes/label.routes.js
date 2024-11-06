const express = require('express');
const router = express.Router(); // Creates new router instances

// Import controllers
const fgLocationController = require('../controllers/fg.location.controller');
const fgPalletController = require('../controllers/fg.pallet.controller');
const paperRollLocationController = require('../controllers/paper.roll.location.controller');
const rollController = require('../controllers/roll.controller');
const exportToCSVController = require('../controllers/export.to.csv.controller');

// Fg Location Label routes
router.post('/fg-location', fgLocationController.create);
router.get('/fg-location', fgLocationController.getAll); // Get all FG location labels
router.get('/fg-location/:id', fgLocationController.getById);
router.delete('/fg-location/:id', fgLocationController.delete);

// Fg Pallet Label Routes
router.post('/fg-pallet', fgPalletController.create);
router.get('/fg-pallet', fgPalletController.getAll);
router.get('/fg-pallet/:id', fgPalletController.getById);
router.delete('/fg-pallet/:id', fgPalletController.delete);

// Paper roll Location Label Routes
router.post('/paper-roll-location', paperRollLocationController.create);
router.get('/paper-roll-location', paperRollLocationController.getAll);
router.get('/paper-roll-location/:id', paperRollLocationController.getById);
router.delete('/paper-roll-location/:id', paperRollLocationController.delete);

// Roll Label Routes
router.post('/roll', rollController.create);
router.get('/roll', rollController.getAll);
router.get('/roll/:id', rollController.getById);
router.delete('/roll/:id', rollController.delete);

// Export to CSV Routes
router.get('/exportToCSV/labels', exportToCSVController.getAllLabels);
router.get('/exportToCSV/labels/:type', exportToCSVController.getLabelsByType);

module.exports = router;