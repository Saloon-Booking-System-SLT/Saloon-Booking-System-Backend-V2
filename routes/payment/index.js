const express = require('express');
const router = express.Router();
const payhereRoutes = require('./PayherePaymentRoute');
const stripeRoutes = require('./stripeRoutes');


//PayHere routes
router.use('/payhere', payhereRoutes);

//Stripe routes
router.use('/stripe', stripeRoutes);

console.log('✅ Payment routes loaded: PayHere mounted at /payhere, Stripe mounted at /stripe');

module.exports = router;
