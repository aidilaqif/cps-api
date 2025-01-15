# CPS Dragonfly API Service 🔌

## Overview
CPS Dragonfly API is a Node.js-based RESTful service that powers inventory management and drone analytics for industrial automation. The service integrates with OpenAI for intelligent analysis and provides comprehensive endpoints for inventory tracking, location management, and performance analytics.

## Related Repositories
- 📱 [Mobile Scanner App Repository]([https://github.com/aidilaqif/cps_dragonfly_mobile_app)
- 🖥️ [Web Dashboard Repository](https://github.com/dzker/CPS-X-4.0_Frontend)

## Features 🌟

### Core Services
- **Inventory Management**
  - Item tracking and status updates
  - Location assignment and validation
  - QR code validation
  - History tracking

- **Location Management**
  - Dynamic location types
  - Rack organization
  - Utilization tracking
  - Assignment validation

- **Movement Logging**
  - Flight session recording
  - Movement pattern tracking
  - Battery efficiency monitoring
  - Performance metrics

### AI-Powered Analytics
- **Battery Efficiency Analysis**
  - Consumption patterns
  - Optimization recommendations
  - Usage predictions
  - Efficiency metrics

- **Movement Pattern Analysis**
  - Success rate evaluation
  - Pattern optimization
  - Performance metrics
  - Improvement suggestions

- **Performance Analysis**
  - Operational metrics
  - Time-based analysis
  - Resource utilization
  - Optimization recommendations

## Technical Architecture 🏗️

### Core Technologies
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **AI Integration**: OpenAI GPT-3.5 Turbo
- **Cache**: Session Storage

### Database Schema
```sql
ENUMS:
- item_status (Available, Checked_Out, Lost, Unresolved)
- movement_type (takeoff, land, up, down, etc.)

TABLES:
- location_types
- labels
- paper_rolls
- fg_pallets
- flight_sessions
- movement_logs
- rack_item_assignments
- analysis_cache
```

### API Structure
```
src/
├── config/
│   ├── db.config.js     # Database configuration
│   └── openai.config.js # OpenAI settings
├── controllers/
│   ├── item.controller.js
│   ├── location.controller.js
│   ├── movement.logs.controller.js
│   ├── analysis.controller.js
│   └── export.controller.js
├── routes/
│   └── api.routes.js
├── services/
│   └── openai.service.js
└── server.js
```

## API Endpoints 📡

### Item Management
```
GET    /api/items
POST   /api/items
GET    /api/items/:id
PUT    /api/items/:id/status
PUT    /api/items/:id/location
DELETE /api/items/:id
```

### Location Management
```
GET    /api/locations
POST   /api/locations
GET    /api/locations/:id
DELETE /api/locations/:id
```

### Movement & Analysis
```
POST   /api/movement-logs
GET    /api/movement-logs
GET    /api/movement-logs/:id
GET    /api/movement-stats
GET    /api/analysis/battery
GET    /api/analysis/movements
GET    /api/analysis/performance
```

### Export Functionality
```
GET    /api/export/csv
```

## Installation & Setup ⚙️

### Prerequisites
- Node.js 14+
- PostgreSQL 12+
- OpenAI API key

### Environment Setup
1. Clone the repository
2. Create `.env` file:
```env
# Server Configuration
PORT=8080

# Database Configuration
DB_HOST=your-host
DB_PORT=5432
DB_NAME=your-db-name
DB_USER=your-username
DB_PASSWORD=your-password

# OpenAI API Key
OPENAI_API_KEY=your-api-key
```
3. Install dependencies:
```bash
npm install
```
4. Start server:
```bash
npm start
```

## Development Guidelines 📝

### Error Handling
- Comprehensive error responses
- Proper HTTP status codes
- Detailed error logging
- Error tracking

### Data Validation
- Input sanitization
- Type validation
- Business rule validation
- Data integrity checks

### Performance Optimization
- Query optimization
- Response caching
- Batch processing
- Connection pooling

## Security Features 🔒

- API request validation
- SQL injection prevention
- Input sanitization
- Error message security
- Rate limiting
- Data encryption

## Features in Development 🛣️

- [ ] Enhanced AI analysis
- [ ] Performance optimization
- [ ] Extended metrics
- [ ] Advanced caching
- [ ] Batch operations

---
Built with Node.js and PostgreSQL for industrial automation
