const express = require('express');
const router = express.Router();
const Payment = require('../../models/Payment');
const payHereService = require('../../services/payment.service');

// Initiate PayHere Payment
router.post('/initiate', async (req, res) => {
    try {
        const { appointmentId, amount, currency, customer } = req.body;

        // Basic Validation
        if (!appointmentId || !amount || !customer) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: appointmentId, amount, customer'
            });
        }

        // Check if a successful payment already exists for this appointment
        const existingPayment = await Payment.findOne({
            appointmentId: appointmentId,
            status: 'succeeded'
        });

        if (existingPayment) {
            return res.status(400).json({
                success: false,
                error: 'Payment already completed for this appointment'
            });
        }

        // Create a NEW pending payment record
        const newPayment = new Payment({
            provider: 'payhere',
            appointmentId: appointmentId,
            amount: amount,
            currency: currency || 'LKR',
            status: 'pending',
            customerEmail: customer.email,
            metadata: {
                customer_name: `${customer.first_name} ${customer.last_name}`,
                customer_phone: customer.phone
            }
        });

        await newPayment.save();

        // Generate PayHere Form Data
        const paymentData = payHereService.getPaymentData(
            appointmentId,
            amount,
            currency || 'LKR',
            customer
        );

        res.json({
            success: true,
            data: paymentData
        });

    } catch (err) {
        console.error('PayHere Initiation Error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate PayHere payment',
            details: err.message
        });
    }
});

// PayHere Webhook Notification
router.post('/notify', express.urlencoded({ extended: true }), async (req, res) => {
    console.log('🔔 PayHere Webhook Received:', req.body);

    try {
        const notification = req.body;

        // 1. Verify Signature
        const isValid = payHereService.verifySignature(notification);
        if (!isValid) {
            console.warn('⚠️ Invalid PayHere Signature');
            return res.status(400).send('Invalid Signature');
        }

        // 2. Extract Data
        const { order_id, payment_id, status_code } = notification;

        // 3. Map Status
        const newStatus = payHereService.mapStatus(status_code);

        // 4. Update Payment Record
        const payment = await Payment.findOne({ appointmentId: order_id });

        if (!payment) {
            console.error(`❌ Payment record not found for Order ID: ${order_id}`);
            return res.status(200).send('Payment not found');
        }

        // Update fields
        payment.status = newStatus;
        payment.transactionId = payment_id; // Save PayHere Payment ID

        payment.metadata = {
            ...payment.metadata,
            payhere_response: notification
        };

        await payment.save();

        console.log(`✅ Payment updated for Order ${order_id}: ${newStatus}`);

        // Respond to PayHere
        res.status(200).send('OK');

    } catch (err) {
        console.error('❌ PayHere Webhook Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
