const express = require('express');
const router = express.Router();
const itemController = require('../controllers/item.controller');
const locationController = require('../controllers/location.controller');
const exportController = require('../controllers/export.controller');

// Export routes
router.get('/export/csv', exportController.exportToCSV);

// Item routes
router.get('/items', itemController.getAllItems);
router.get('/items/:id', itemController.getItemById);
router.get('/items/:id/exists', itemController.checkItemExists);
router.post('/items', itemController.createNewItem);  // Changed from createItem to createNewItem
router.put('/items/:id/status', itemController.updateStatus);
router.put('/items/:id/location', itemController.updateLocation);
router.delete('/items/:id', itemController.deleteItem);


// Location routes
router.get('/locations', locationController.getAllLocations);
router.get('/locations/:id', locationController.getLocationById);
router.post('/locations', locationController.createLocation);

module.exports = router;