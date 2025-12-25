const express = require('express');
const router = express.Router();
// Initialize Stripe with environment variable (if available)
let stripe;
try {
    if (process.env.STRIPE_SECRET_KEY) {
        stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        console.log('🔑 Stripe initialized');
    } else {
        console.warn('⚠️ STRIPE_SECRET_KEY not found in environment variables');
    }
} catch (err) {
    console.error('❌ Failed to initialize Stripe:', err.message);
}

// Create payment intent
router.post('/create-payment-intent', async (req, res) => {
    console.log('✅ /api/payments/create-payment-intent HIT!');
    console.log('Request body:', req.body);

    try {
        // Check if Stripe is initialized
        if (!stripe) {
            console.error('❌ Stripe not initialized');
            return res.status(500).json({
                success: false,
                error: 'Payment service not available'
            });
        }

        const { amount, currency = 'lkr', customer_email } = req.body;

        console.log('🔍 Validating request...');
        console.log('💵 Amount:', amount, 'cents');
        console.log('💰 Currency:', currency);
        console.log('📧 Email:', customer_email);

        // Validate required fields
        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid amount'
            });
        }

        if (!customer_email) {
            return res.status(400).json({
                success: false,
                error: 'Customer email required'
            });
        }

        console.log('🚀 Creating Stripe payment intent...');

        // For testing, let's use USD instead of LKR (better Stripe test mode support)
        // Convert LKR to USD (rough conversion: 1 USD = 200 LKR)
        const usdAmount = Math.max(50, Math.round(amount / 200)); // Minimum $0.50 for Stripe

        console.log('💵 Original amount (LKR cents):', amount);
        console.log('💲 USD amount (cents):', usdAmount);

        // Create payment intent with USD
        const paymentIntent = await stripe.paymentIntents.create({
            amount: usdAmount, // Use USD amount
            currency: 'usd',   // Use USD currency
            automatic_payment_methods: {
                enabled: true
            },
            metadata: {
                original_amount_lkr: amount,
                customer_email: customer_email
            }
        });

        console.log('💰 Payment intent created successfully!');
        console.log('🆔 Payment Intent ID:', paymentIntent.id);
        console.log('💵 Amount:', paymentIntent.amount, paymentIntent.currency);

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            originalAmountLKR: amount
        });

    } catch (err) {
        console.error('❌ Payment intent error:', err);
        console.error('Error type:', err.type);
        console.error('Error code:', err.code);

        let errorMessage = 'Payment processing failed';

        if (err.code === 'invalid_api_key') {
            errorMessage = 'Invalid payment API key. Please check Stripe configuration.';
        } else if (err.code === 'api_key_expired') {
            errorMessage = 'Payment API key has expired.';
        }

        res.status(500).json({
            success: false,
            error: errorMessage,
            details: err.message
        });
    }
});

// Test endpoint to verify Stripe connection
router.get('/test-stripe', async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe not initialized' });
        }

        // Test Stripe connection by creating a small payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 1000, // $10.00
            currency: 'usd',
            automatic_payment_methods: { enabled: true },
        });

        res.json({
            success: true,
            message: 'Stripe connection successful!',
            paymentIntentId: paymentIntent.id
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'Stripe connection failed',
            details: err.message
        });
    }
});

module.exports = router;
