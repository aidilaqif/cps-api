const express = require("express");
const router = express.Router();
const itemController = require("../controllers/item.controller");
const locationController = require("../controllers/location.controller");
const exportController = require("../controllers/export.controller");
const movementLogsController = require("../controllers/movement.logs.controller");
const analysisController = require("../controllers/analysis.controller");

// Export routes
router.get("/export/csv", exportController.exportToCSV);

// Item routes
router.get("/items", itemController.getAllItems);
router.get("/items/:id", itemController.getItemById);
router.get("/items/:id/exists", itemController.checkItemExists);
router.post("/items", itemController.createNewItem); // Changed from createItem to createNewItem
router.put("/items/:id/status", itemController.updateStatus);
router.put("/items/:id/location", itemController.updateLocation);
router.delete("/items/:id", itemController.deleteItem);

// Location routes
router.get("/locations", locationController.getAllLocations);
router.get("/locations/:id", locationController.getLocationById);
router.post("/locations", locationController.createLocation);
router.delete("/locations/:id", locationController.deleteLocation);

// Movement logs routes
router.post("/movement-logs", movementLogsController.createFlightSession);
router.get("/movement-logs", movementLogsController.getFlightSessions);
router.get("/movement-logs/:id", movementLogsController.getFlightSessionById);
router.get("/movement-stats", movementLogsController.getMovementStats);
router.put("/movement-logs/:id/star", movementLogsController.updateLogStar);
router.put("/movement-logs/:id/rename", movementLogsController.renameLog);
router.delete("/movement-logs/:id", movementLogsController.deleteFlightSession);

//Item Tracking routes
router.post("/scan/rack", locationController.handleRackScan);
router.post("/scan/item", locationController.handleItemScan);

// Analysis Routes
router.get('/analysis/battery', analysisController.getBatteryEfficiencyAnalysis);
router.get('/analysis/movements', analysisController.getMovementPatternsAnalysis);
router.get('/analysis/performance', analysisController.getDronePerformanceAnalysis);

module.exports = router;
