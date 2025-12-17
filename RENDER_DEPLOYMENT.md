# 🚀 Render Deployment Guide - Memory-Optimized Backend

## Prerequisites
- ✅ Render account (free tier works)
- ✅ MongoDB Atlas account (free tier M0 works)
- ✅ Gmail account with App Password enabled
- ✅ Cloudinary account (optional, for image uploads)

---

## Step 1: Prepare MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a **free M0 cluster**
3. Add your IP to whitelist (or use `0.0.0.0/0` for all IPs)
4. Create a database user with password
5. Get your connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/salon-booking?retryWrites=true&w=majority
   ```

---

## Step 2: Setup Gmail App Password

1. Enable 2-Factor Authentication on your Gmail account
2. Go to: https://myaccount.google.com/apppasswords
3. Create new App Password for "Mail"
4. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)
5. Remove spaces: `abcdefghijklmnop`

---

## Step 3: Deploy to Render

### 3.1 Create Web Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `salon-booking-backend`
   - **Environment**: `Node`
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### 3.2 Add Environment Variables

Click **"Environment"** tab and add:

```bash
NODE_ENV=production
PORT=5000

# Database
MONGO_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/salon-booking?retryWrites=true&w=majority

# Frontend URL (replace with your actual Vercel URL)
FRONTEND_URL=https://your-app.vercel.app

# Email Service
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password-no-spaces

# JWT (generate a random 64-character string)
JWT_SECRET=your-super-secret-random-string-change-this

# Cloudinary (optional)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# IMPORTANT: Disable cron jobs for Render Free tier
ENABLE_CRON_JOBS=false
```

### 3.3 Deploy

1. Click **"Create Web Service"**
2. Wait for deployment (2-5 minutes)
3. Your backend URL will be: `https://salon-booking-backend.onrender.com`

---

## Step 4: Test Deployment

### 4.1 Check Health
```bash
curl https://your-backend.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-17T...",
  "uptime": 123,
  "memoryMB": {
    "rss": 150,
    "heapTotal": 45,
    "heapUsed": 30,
    "external": 2
  },
  "database": "connected"
}
```

### 4.2 Test API Endpoint
```bash
curl https://your-backend.onrender.com/api/salons
```

---

## Step 5: Setup External Cron Jobs

Since Render Free tier sleeps after inactivity, use [cron-job.org](https://cron-job.org) for scheduled tasks:

### 5.1 Create Account
1. Go to https://cron-job.org
2. Sign up (free)

### 5.2 Add Cron Jobs

**Job 1: Generate Daily Time Slots**
- **Title**: Generate Time Slots
- **URL**: `https://your-backend.onrender.com/api/appointments/generate-slots`
- **Method**: POST
- **Schedule**: Daily at 2:00 AM
- **Headers**: Add header `Content-Type: application/json`

**Job 2: Send Appointment Reminders**
- **Title**: Send Appointment Reminders
- **URL**: `https://your-backend.onrender.com/api/admin/notifications/trigger?type=reminders`
- **Method**: GET
- **Schedule**: Daily at 9:00 AM

**Job 3: Send Feedback Requests**
- **Title**: Send Feedback Requests
- **URL**: `https://your-backend.onrender.com/api/admin/notifications/trigger?type=feedback`
- **Method**: GET
- **Schedule**: Daily at 10:00 AM

### 5.3 Optional: Keep-Alive Ping
To prevent Render from sleeping:
- **Title**: Keep Alive Ping
- **URL**: `https://your-backend.onrender.com/health`
- **Method**: GET
- **Schedule**: Every 10 minutes

---

## Step 6: Update Frontend Configuration

In your frontend `.env` file:
```bash
REACT_APP_API_URL=https://your-backend.onrender.com
```

---

## Step 7: Verify Everything Works

### Test Checklist:
- ✅ Health endpoint returns 200 OK
- ✅ Database connection shows "connected"
- ✅ Memory usage under 200 MB
- ✅ Login/Register works
- ✅ Appointments can be created
- ✅ Images upload to Cloudinary
- ✅ Emails send successfully

---

## 📊 Monitor Your Deployment

### Render Dashboard
- Check **Logs** tab for errors
- Monitor **Metrics** for CPU/Memory usage
- Set up **Notifications** for service failures

### Memory Usage
Normal operation should show:
- **Idle**: 80-120 MB
- **Under Load**: 150-250 MB
- **Peak**: 300-400 MB (should not exceed 512 MB)

### Warning Signs
🚨 **Memory Issues**: If memory exceeds 400 MB consistently
- Check `/health` endpoint
- Review recent code changes
- Check for stuck cron jobs

🚨 **Database Issues**: If connection fails
- Verify MongoDB Atlas is running
- Check IP whitelist settings
- Verify connection string

---

## 🔧 Troubleshooting

### Issue: "Application failed to respond"
**Solution**: Check if Render service is sleeping. Visit the URL to wake it up.

### Issue: "Cannot connect to MongoDB"
**Solution**: 
1. Check MongoDB Atlas is running
2. Whitelist Render IPs or use `0.0.0.0/0`
3. Verify connection string in environment variables

### Issue: "Emails not sending"
**Solution**:
1. Verify Gmail App Password is correct (no spaces)
2. Check EMAIL_USER and EMAIL_PASSWORD env vars
3. Enable "Less secure app access" if needed

### Issue: "Out of memory error"
**Solution**:
1. Check `/health` for memory usage
2. Restart service from Render dashboard
3. Review recent queries in logs
4. Verify pagination is working

### Issue: "CORS errors"
**Solution**:
1. Add your frontend URL to FRONTEND_URL env var
2. Ensure URL has no trailing slash
3. Check CORS configuration in server.js

---

## 📈 Scaling Up

When you outgrow the free tier:

### Render Starter ($7/month)
- More reliable uptime
- No sleep on inactivity
- Better performance

### MongoDB Atlas M10+ ($9/month)
- Better performance
- Automated backups
- Advanced monitoring

### Enable Built-in Cron Jobs
Once on paid tier, you can enable:
```bash
ENABLE_CRON_JOBS=true
```

---

## 🎯 Performance Tips

1. **Use Pagination**: Always include `?page=1&limit=20` in API calls
2. **Cache Data**: Cache salon lists and services in frontend
3. **Optimize Images**: Compress images before upload
4. **Batch Requests**: Combine multiple API calls when possible
5. **Monitor Memory**: Check `/health` regularly

---

## 🆘 Support Resources

- **Render Status**: https://status.render.com
- **MongoDB Atlas Status**: https://status.cloud.mongodb.com
- **Community Forums**: https://community.render.com

---

## ✅ Post-Deployment Checklist

- [ ] Backend deployed and accessible
- [ ] Health check returns correct data
- [ ] MongoDB connected successfully
- [ ] Frontend can communicate with backend
- [ ] Authentication works (login/register)
- [ ] Appointments can be created
- [ ] Emails are sending
- [ ] Images upload successfully
- [ ] Cron jobs configured externally
- [ ] Memory usage is normal (<250 MB)
- [ ] No errors in Render logs
- [ ] CORS configured correctly
- [ ] Environment variables all set
- [ ] Admin panel accessible
- [ ] Salon owner features work

---

**Deployment Guide Version**: 1.0  
**Last Updated**: December 17, 2025  
**Backend Version**: 1.1.0 (Memory Optimized)
