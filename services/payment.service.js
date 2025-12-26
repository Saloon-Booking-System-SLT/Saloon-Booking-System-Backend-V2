const crypto = require('crypto');
const payhereConfig = require('../config/payhere');

class PayHereService {
    constructor() {
        this.merchantId = payhereConfig.merchantId;
        this.merchantSecret = payhereConfig.merchantSecret;
    }

    /**
     * Generates MD5 hash for PayHere initiation
     * Hash = strtoupper(md5(merchant_id + order_id + amount + currency + strtoupper(md5(merchant_secret))))
     */
    generateHash(orderId, amount, currency = 'LKR') {
        if (!this.merchantId || !this.merchantSecret) {
            throw new Error('PayHere merchant ID or secret not configured');
        }

        const formattedAmount = Number(amount).toFixed(2); // Ensure 2 decimal places
        const secretHash = crypto.createHash('md5')
            .update(this.merchantSecret)
            .digest('hex')
            .toUpperCase();

        const dataToHash = `${this.merchantId}${orderId}${formattedAmount}${currency}${secretHash}`;

        return crypto.createHash('md5')
            .update(dataToHash)
            .digest('hex')
            .toUpperCase();
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
