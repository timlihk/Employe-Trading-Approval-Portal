require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');

const tradingRoutes = require('./routes/tradingRoutes');
const restrictedStockRoutes = require('./routes/restrictedStockRoutes');
const authRoutes = require('./routes/authRoutes');
const employeeAuthRoutes = require('./routes/employeeAuthRoutes');
const inquiryRoutes = require('./routes/inquiryRoutes');
const auditRoutes = require('./routes/auditRoutes');
const stockRoutes = require('./routes/stockRoutes');

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '../public')));




app.use('/api/auth', authRoutes);
app.use('/api/auth', employeeAuthRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/restricted-stocks', restrictedStockRoutes);
app.use('/api/inquiry', inquiryRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/stock', stockRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!' 
  });
});

app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Access the application at http://localhost:${PORT}`);
  }
});

module.exports = app;