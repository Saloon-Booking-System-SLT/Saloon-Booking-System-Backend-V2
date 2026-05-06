const crypto = require('crypto');
const payhereConfig = require('../config/payhere');

class PayHereService {
    constructor() {
        this.merchantId = (payhereConfig.merchantId || '').trim();
        this.merchantSecret = (payhereConfig.merchantSecret || '').trim();
    }

    /**
     * Generates MD5 hash for PayHere initiation
     * Hash = strtoupper(md5(merchant_id + order_id + amount + currency + strtoupper(md5(merchant_secret))))
     */
    generateHash(orderId, amount, currency = 'LKR') {
        if (!this.merchantId || !this.merchantSecret) {
            throw new Error('PayHere merchant ID or secret not configured');
        }

        // 1. Ensure orderId is a clean string
        const cleanOrderId = String(orderId).trim();
        
        // 2. Ensure amount is exactly 2 decimal places
        const formattedAmount = Number(amount).toFixed(2); 

        // 3. Generate Secret Hash
        const secretHash = crypto.createHash('md5')
            .update(this.merchantSecret)
            .digest('hex')
            .toUpperCase();

        // 4. Construct the final string
        const dataToHash = String(this.merchantId).trim() + 
                           cleanOrderId + 
                           formattedAmount + 
                           String(currency).trim() + 
                           secretHash;
        
        // 5. Generate Final Hash
        const finalHash = crypto.createHash('md5')
            .update(dataToHash)
            .digest('hex')
            .toUpperCase();
            
        console.log('--- PAYHERE HASH DEBUG ---');
        console.log('Merchant ID:', this.merchantId);
        console.log('Order ID:', cleanOrderId);
        console.log('Amount:', formattedAmount);
        console.log('Currency:', currency);
        console.log('Secret Hash:', secretHash);
        console.log('Full Data String:', dataToHash);
        console.log('Final Generated Hash:', finalHash);
        console.log('--------------------------');

        return finalHash;
    }

    /**
     * Verifies MD5 signature from PayHere webhook
     * Hash = strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))
     */
    verifySignature(notificationData) {
        const {
            merchant_id,
            order_id,
            payhere_amount,
            payhere_currency,
            status_code,
            md5sig
        } = notificationData;

        if (!md5sig) return false;

        // Verify merchant ID matches
        if (merchant_id !== this.merchantId) {
 console.warn(`PayHere merchant ID mismatch: received ${merchant_id}, expected ${this.merchantId}`);
            return false;
        }

        const secretHash = crypto.createHash('md5')
            .update(this.merchantSecret)
            .digest('hex')
            .toUpperCase();

        const dataToHash = `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${secretHash}`;

        const localHash = crypto.createHash('md5')
            .update(dataToHash)
            .digest('hex')
            .toUpperCase();

        return localHash === md5sig;
    }

    /**
     * Maps PayHere status code to internal status
     * 2 = Success
     * 0 = Pending
     * -1 = Canceled
     * -2 = Failed
     * -3 = Chargedback
     */
    mapStatus(statusCode) {
        switch (Number(statusCode)) {
            case 2:
                return 'succeeded';
            case 0:
                return 'pending';
            case -1:
                return 'canceled';
            case -2:
                return 'failed';
            case -3:
                return 'chargedback';
            default:
                return 'failed';
        }
    }

    /**
     * Get formatted payment data for frontend form
     */
    getPaymentData(orderId, amount, currency, customerDetails, metadata = {}) {
        // Validate configuration
        if (!this.merchantId || !this.merchantSecret) {
            throw new Error('PayHere merchant credentials not properly configured');
        }

        // Validate required customer fields
        if (!customerDetails || !customerDetails.email || !customerDetails.first_name) {
            throw new Error('Customer email and first_name are required for PayHere payment');
        }

        const hash = this.generateHash(orderId, amount, currency);

        return {
            sandbox: payhereConfig.mode === 'sandbox',
            merchant_id: this.merchantId,
            return_url: metadata.return_url || undefined, // Optional: Frontend usually handles
            cancel_url: metadata.cancel_url || undefined, // Optional
            notify_url: payhereConfig.notifyUrl,
            order_id: orderId,
            items: metadata.items || 'Salon Service',
            currency: currency,
            amount: Number(amount).toFixed(2),
            first_name: customerDetails.first_name || '',
            last_name: customerDetails.last_name || '',
            email: customerDetails.email || '',
            phone: customerDetails.phone || '',
            address: customerDetails.address || '',
            city: customerDetails.city || '',
            country: customerDetails.country || 'Sri Lanka',
            hash: hash
        };
    }
}

module.exports = new PayHereService();
