const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    merchantId: process.env.PAYHERE_MERCHANT_ID,
    merchantSecret: process.env.PAYHERE_MERCHANT_SECRET,
    mode: process.env.PAYHERE_MODE || 'sandbox',
    notifyUrl: process.env.PAYHERE_NOTIFY_URL,
    currency: 'LKR',
    baseUrl: 'https://sandbox.payhere.lk'
};
