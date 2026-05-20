const express = require('express');
const router = express.Router();
const Payment = require('../../models/Payment');
const payHereService = require('../../services/payment.service');

// ===================================================================
// POST /initiate
// Accepts pending appointment data, generates PayHere form fields.
// The actual appointment is created in /notify AFTER payment succeeds.
// ===================================================================
router.post('/initiate', async (req, res) => {
    try {
        const {
            amount,
            currency,
            customer,
            items,
            pendingAppointments,
            customerInfo,
            isGroupBooking,
            salonId,
        } = req.body;

        // Basic Validation
        if (!amount || !customer) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: amount, customer'
            });
        }

        if (!customer.email || !customer.first_name) {
            return res.status(400).json({
                success: false,
                error: 'Customer email and first name are required'
            });
        }

        if (!pendingAppointments || pendingAppointments.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No appointment data provided. Please select a time slot first.'
            });
        }

        // Generate a unique order ID for this payment session
        const orderId = `ORDER-${Date.now()}`;

        // Create a pending payment record that stores the full appointment data
        const newPayment = new Payment({
            provider: 'payhere',
            appointmentId: orderId,       // Use orderId as the reference key
            amount: amount,
            currency: currency || 'LKR',
            status: 'pending',
            customerEmail: customer.email,
            metadata: {
                customer_name: `${customer.first_name} ${customer.last_name}`,
                customer_phone: customer.phone,
                isGroupBooking: isGroupBooking,
                salonId: salonId,
                // Store the full pending appointments so they can be created on payment success
                pendingAppointments: pendingAppointments,
                customerInfo: customerInfo || {
                    name: `${customer.first_name} ${customer.last_name}`,
                    phone: customer.phone,
                    email: customer.email,
                },
            }
        });

        await newPayment.save();

        // Generate PayHere Form Data using orderId (not an appointmentId)
        const paymentData = payHereService.getPaymentData(
            orderId,
            amount,
            currency || 'LKR',
            customer
        );

        console.log('✅ PayHere payment initiated:', {
            orderId,
            merchant_id: paymentData.merchant_id,
            amount: paymentData.amount,
            currency: paymentData.currency,
            pendingAppointmentsCount: pendingAppointments.length,
        });

        res.json({
            success: true,
            data: paymentData
        });

    } catch (err) {
        console.error('❌ PayHere Initiation Error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate PayHere payment',
            details: err.message
        });
    }
});

// ===================================================================
// POST /notify
// PayHere server-to-server webhook.
// On payment success, creates the actual appointment in the DB.
// ===================================================================
router.post('/notify', express.urlencoded({ extended: true }), async (req, res) => {
    console.log('📩 PayHere Webhook Received:', req.body);

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

        // 4. Find the Payment Record (stored with appointmentId = order_id)
        const payment = await Payment.findOne({ appointmentId: order_id });

        if (!payment) {
            console.error(`❌ Payment record not found for Order ID: ${order_id}`);
            return res.status(200).send('Payment not found');
        }

        // Update payment record
        payment.status = newStatus;
        payment.transactionId = payment_id;
        payment.metadata = {
            ...payment.metadata,
            payhere_response: notification
        };

        await payment.save();
        console.log(`✅ Payment updated for Order ${order_id}: ${newStatus}`);

        // 5. On SUCCESS: Create the actual appointments in the DB
        if (newStatus === 'succeeded') {
            const pendingAppointments = payment.metadata?.pendingAppointments;
            const customerInfo = payment.metadata?.customerInfo;

            if (pendingAppointments && pendingAppointments.length > 0) {
                try {
                    const Appointment = require('../../models/Appointment');
                    const TimeSlot = require('../../models/TimeSlot');
                    const Salon = require('../../models/Salon');
                    const dayjs = require('dayjs');
                    const notificationService = require('../../services/notificationService');

                    const createdAppointments = [];

                    for (const appt of pendingAppointments) {
                        const newAppt = new Appointment({
                            salonId: appt.salonId,
                            professionalId: appt.professionalId || null,
                            services: [{
                                name: appt.serviceName || 'Service',
                                price: appt.price || 0,
                                duration: appt.duration || '30 minutes',
                            }],
                            date: appt.date,
                            startTime: appt.startTime,
                            endTime: appt.endTime,
                            user: {
                                name: appt.memberName || customerInfo?.name || 'Guest',
                                phone: appt.phone || customerInfo?.phone || '',
                                email: appt.email || customerInfo?.email || '',
                                photoURL: '',
                            },
                            status: 'confirmed',  // Confirmed because payment succeeded
                            paymentStatus: 'paid',
                            paymentReference: payment_id,
                            isGroupBooking: pendingAppointments.length > 1,
                            bookingGroupId: order_id,
                        });

                        const savedAppt = await newAppt.save();
                        createdAppointments.push(savedAppt);

                        // Mark time slots as booked
                        if (appt.professionalId && appt.date && appt.startTime && appt.endTime) {
                            await TimeSlot.updateMany(
                                {
                                    professionalId: appt.professionalId,
                                    date: appt.date,
                                    startTime: { $gte: appt.startTime },
                                    endTime: { $lte: appt.endTime },
                                    isBooked: false,
                                },
                                { isBooked: true }
                            );
                        }

                        console.log(`✅ Appointment created after payment: ${savedAppt._id}`);
                    }

                    // Link the payment record to the first created appointment for reference
                    payment.metadata.createdAppointmentIds = createdAppointments.map(a => a._id.toString());
                    await payment.save();

                    // Send notifications
                    try {
                        const salonId = pendingAppointments[0]?.salonId;
                        const salon = salonId ? await Salon.findById(salonId) : null;

                        if (salon) {
                            for (const appointment of createdAppointments) {
                                const serviceNames = appointment.services.map(s => s.name).join(', ') || 'Service';
                                const totalAmount = appointment.services.reduce((sum, s) => sum + (s.price || 0), 0);

                                const notificationData = {
                                    customerEmail: customerInfo?.email || appointment.user?.email,
                                    customerPhone: customerInfo?.phone || appointment.user?.phone,
                                    customerName: appointment.user?.name || 'Guest',
                                    salonName: salon.name,
                                    serviceName: serviceNames,
                                    date: dayjs(appointment.date).format('MMMM DD, YYYY'),
                                    time: appointment.startTime,
                                    totalAmount: totalAmount,
                                    appointmentId: appointment._id.toString().slice(-6).toUpperCase()
                                };

                                await notificationService.sendAppointmentConfirmation(notificationData);

                                if (salon.email) {
                                    await notificationService.notifyOwnerNewBooking(
                                        { ownerEmail: salon.email, ownerName: salon.name, salonName: salon.name },
                                        { ...notificationData, customerPhone: customerInfo?.phone }
                                    );
                                }
                            }
                        }
                    } catch (notifErr) {
                        console.error('⚠️ Notification error after payment:', notifErr.message);
                        // Don't fail the webhook response for notification errors
                    }

                    console.log(`✅ ${createdAppointments.length} appointments created after PayHere payment success.`);
                } catch (apptErr) {
                    console.error('❌ Error creating appointments after payment:', apptErr);
                    // Still return 200 to PayHere - we'll need manual reconciliation
                }
            } else {
                console.warn('⚠️ Payment succeeded but no pendingAppointments found in metadata.');
            }
        }

        // Always respond 200 OK to PayHere
        res.status(200).send('OK');

    } catch (err) {
        console.error('❌ PayHere Webhook Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

// ===================================================================
// GET /status/:orderId
// Polling endpoint: frontend checks if appointment was created after payment.
// Used by ConfirmationPage to verify payment and fetch booking details.
// ===================================================================
router.get('/status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const payment = await Payment.findOne({ appointmentId: orderId });

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment record not found' });
        }

        const createdIds = payment.metadata?.createdAppointmentIds || [];

        res.json({
            success: true,
            orderId,
            paymentStatus: payment.status,
            appointmentsCreated: createdIds.length > 0,
            appointmentIds: createdIds,
            isGroupBooking: payment.metadata?.isGroupBooking || false,
        });
    } catch (err) {
        console.error('❌ Payment status check error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ===================================================================
// POST /confirm-from-redirect/:orderId
//
// FALLBACK endpoint called by the ConfirmationPage after PayHere
// redirects the user back (return_url). Used when the PayHere
// server-to-server webhook (/notify) hasn't fired yet — which happens
// in LOCAL DEVELOPMENT where PayHere can't reach localhost.
//
// In PRODUCTION the webhook fires quickly and the polling in
// ConfirmationPage succeeds before this is ever needed.
//
// Flow:
//   1. User completes (or cancels) payment on PayHere.
//   2. PayHere redirects user to return_url (/confirmationpage?order_id=...).
//   3. ConfirmationPage polls /status/:orderId.
//   4. If polling times out (webhook not received), ConfirmationPage calls
//      this endpoint as a fallback.
//   5. This endpoint reads the pending appointment data stored in the
//      Payment record, creates the appointments, and sends notifications.
// ===================================================================
router.post('/confirm-from-redirect/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log(`📩 Confirm-from-redirect called for Order: ${orderId}`);

        const payment = await Payment.findOne({ appointmentId: orderId });

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment record not found' });
        }

        // If appointments were already created (e.g. webhook fired in time), return them
        const alreadyCreatedIds = payment.metadata?.createdAppointmentIds || [];
        if (alreadyCreatedIds.length > 0) {
            console.log(`✅ Appointments already created for Order ${orderId}, skipping duplicate creation.`);
            return res.json({
                success: true,
                alreadyExisted: true,
                appointmentIds: alreadyCreatedIds,
                orderId,
            });
        }

        const pendingAppointments = payment.metadata?.pendingAppointments;
        const customerInfo = payment.metadata?.customerInfo;

        if (!pendingAppointments || pendingAppointments.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No pending appointment data found in payment record.'
            });
        }

        // Create the appointments
        const Appointment = require('../../models/Appointment');
        const TimeSlot = require('../../models/TimeSlot');
        const Salon = require('../../models/Salon');
        const dayjs = require('dayjs');
        const notificationService = require('../../services/notificationService');

        const createdAppointments = [];

        for (const appt of pendingAppointments) {
            const newAppt = new Appointment({
                salonId: appt.salonId,
                professionalId: appt.professionalId || null,
                services: [{
                    name: appt.serviceName || 'Service',
                    price: appt.price || 0,
                    duration: appt.duration || '30 minutes',
                }],
                date: appt.date,
                startTime: appt.startTime,
                endTime: appt.endTime,
                user: {
                    name: appt.memberName || customerInfo?.name || 'Guest',
                    phone: appt.phone || customerInfo?.phone || '',
                    email: appt.email || customerInfo?.email || '',
                    photoURL: '',
                },
                status: 'confirmed',
                paymentStatus: 'paid',
                paymentReference: orderId,
                isGroupBooking: pendingAppointments.length > 1,
                bookingGroupId: orderId,
            });

            const savedAppt = await newAppt.save();
            createdAppointments.push(savedAppt);
            console.log(`✅ Appointment created (redirect fallback): ${savedAppt._id}`);

            // Mark time slots as booked
            if (appt.professionalId && appt.date && appt.startTime && appt.endTime) {
                await TimeSlot.updateMany(
                    {
                        professionalId: appt.professionalId,
                        date: appt.date,
                        startTime: { $gte: appt.startTime },
                        endTime: { $lte: appt.endTime },
                        isBooked: false,
                    },
                    { isBooked: true }
                );
            }
        }

        // Save the created appointment IDs back to the payment record
        payment.status = 'succeeded';
        payment.metadata = {
            ...payment.metadata,
            createdAppointmentIds: createdAppointments.map(a => a._id.toString()),
            confirmedVia: 'redirect_fallback',
        };
        await payment.save();

        // Send email & SMS notifications
        try {
            const salonId = pendingAppointments[0]?.salonId;
            const salon = salonId ? await Salon.findById(salonId) : null;

            if (salon) {
                for (const appointment of createdAppointments) {
                    const serviceNames = appointment.services.map(s => s.name).join(', ') || 'Service';
                    const totalAmount = appointment.services.reduce((sum, s) => sum + (s.price || 0), 0);

                    const notificationData = {
                        customerEmail: customerInfo?.email || appointment.user?.email,
                        customerPhone: customerInfo?.phone || appointment.user?.phone,
                        customerName: appointment.user?.name || 'Guest',
                        salonName: salon.name,
                        serviceName: serviceNames,
                        date: dayjs(appointment.date).format('MMMM DD, YYYY'),
                        time: appointment.startTime,
                        totalAmount: totalAmount,
                        appointmentId: appointment._id.toString().slice(-6).toUpperCase(),
                    };

                    console.log(`📧 Sending confirmation to: ${notificationData.customerEmail}`);
                    await notificationService.sendAppointmentConfirmation(notificationData);

                    if (salon.email) {
                        await notificationService.notifyOwnerNewBooking(
                            { ownerEmail: salon.email, ownerName: salon.name, salonName: salon.name },
                            { ...notificationData, customerPhone: customerInfo?.phone }
                        );
                    }
                }
                console.log(`✅ Notifications sent for ${createdAppointments.length} appointment(s).`);
            } else {
                console.warn('⚠️ Salon not found, skipping notifications.');
            }
        } catch (notifErr) {
            console.error('⚠️ Notification error in confirm-from-redirect:', notifErr.message);
            // Don't fail — appointments are created, just notifications failed
        }

        res.json({
            success: true,
            alreadyExisted: false,
            appointmentIds: createdAppointments.map(a => a._id.toString()),
            orderId,
            message: `${createdAppointments.length} appointment(s) confirmed and notifications sent.`,
        });

    } catch (err) {
        console.error('❌ confirm-from-redirect error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

