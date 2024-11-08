const express = require('express');
const router = express.Router();
const itemController = require('../controllers/item.controller');
const locationController = require('../controllers/location.controller');
const exportController = require('../controllers/export.controller');

// Export routes
router.get('/export/csv', exportController.exportToCSV);

// Item routes
router.get('/items', itemController.getAllItems);

router.post('/items', itemController.createItem);
router.put('/items/:id/status', itemController.updateStatus);
router.put('/items/:id/location', itemController.updateLocation);
router.get('/items/:id', itemController.getItemById);

// Location routes
router.get('/locations', locationController.getAllLocations);
router.get('/locations/:id', locationController.getLocationById);
router.post('/locations', locationController.createLocation);

module.exports = router;