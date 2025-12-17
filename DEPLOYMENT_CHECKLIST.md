# Migration & Testing Checklist

## 📋 Pre-Deployment Testing

### Local Testing (Before Deploying)
- [ ] Run `npm install` to ensure all dependencies work
- [ ] Start MongoDB locally or connect to Atlas
- [ ] Copy `.env.example` to `.env` and fill in values
- [ ] Run `npm start` - server should start without errors
- [ ] Check `http://localhost:5000/health` - should show memory stats
- [ ] Test login endpoint: `POST /api/users/google-login`
- [ ] Test pagination: `GET /api/appointments?page=1&limit=10`
- [ ] Create a test appointment
- [ ] Verify email sending works
- [ ] Check memory usage stays under 200 MB

---

## 🚀 Deployment Steps

### 1. MongoDB Atlas Setup
- [ ] Create MongoDB Atlas account (free M0 cluster)
- [ ] Create database user with password
- [ ] Whitelist all IPs (`0.0.0.0/0`) or specific Render IPs
- [ ] Get connection string
- [ ] Test connection from local machine

### 2. Gmail App Password
- [ ] Enable 2FA on Gmail account
- [ ] Generate App Password for "Mail"
- [ ] Save password (without spaces)

### 3. Cloudinary Setup (Optional)
- [ ] Create Cloudinary account
- [ ] Get Cloud Name, API Key, API Secret
- [ ] Test upload from local

### 4. Render Deployment
- [ ] Create new Web Service on Render
- [ ] Connect GitHub repository
- [ ] Set build command: `npm install`
- [ ] Set start command: `npm start`
- [ ] Add all environment variables (see `.env.example`)
- [ ] Set `ENABLE_CRON_JOBS=false`
- [ ] Deploy and wait for build

### 5. External Cron Jobs (cron-job.org)
- [ ] Create account on cron-job.org
- [ ] Add job: Generate Slots (POST /api/appointments/generate-slots) - Daily 2 AM
- [ ] Add job: Send Reminders (GET /api/admin/notifications/trigger?type=reminders) - Daily 9 AM
- [ ] Add job: Send Feedback (GET /api/admin/notifications/trigger?type=feedback) - Daily 10 AM
- [ ] Optional: Add keep-alive ping (GET /health) - Every 10 minutes

---

## ✅ Post-Deployment Verification

### API Endpoints Testing
- [ ] Health check: `GET /health` returns correct memory stats
- [ ] Root endpoint: `GET /` shows API info
- [ ] CORS test: `GET /api/test` from frontend domain
- [ ] User login: `POST /api/users/google-login`
- [ ] Get salons: `GET /api/salons?page=1&limit=10`
- [ ] Get services: `GET /api/services`
- [ ] Create appointment: `POST /api/appointments`
- [ ] Upload image test (if using Cloudinary)

### Authentication Flow
- [ ] Google login works from frontend
- [ ] Phone login works from frontend
- [ ] JWT token is generated correctly
- [ ] Protected routes require authentication
- [ ] Role-based access control works (customer, owner, admin)

### Memory & Performance
- [ ] Memory usage < 250 MB under normal load
- [ ] Memory usage < 400 MB under peak load
- [ ] Response times < 500ms for most endpoints
- [ ] No memory leaks after 1 hour of operation
- [ ] Database queries use `.lean()`
- [ ] Pagination works on all list endpoints

### Email Notifications
- [ ] Appointment confirmation emails send
- [ ] Password reset emails send
- [ ] Salon approval emails send
- [ ] Promotional emails send (test with small list)

### Admin Features
- [ ] Admin login works
- [ ] Dashboard loads with statistics
- [ ] User management works
- [ ] Salon approval/rejection works
- [ ] Feedback moderation works
- [ ] Revenue reports generate correctly

### Salon Owner Features
- [ ] Salon registration works
- [ ] Login after approval works
- [ ] Service management (add/edit/delete)
- [ ] Professional management (add/edit/delete)
- [ ] Appointment viewing by salon
- [ ] Salon profile editing

### Customer Features
- [ ] Browse salons by location
- [ ] View salon services
- [ ] Book individual appointment
- [ ] Book family appointment
- [ ] View my appointments
- [ ] Cancel appointment
- [ ] Submit feedback

---

## 🔍 Monitoring & Maintenance

### Daily Checks (First Week)
- [ ] Check Render logs for errors
- [ ] Monitor memory usage via `/health`
- [ ] Verify cron jobs are running
- [ ] Check email delivery rate
- [ ] Monitor MongoDB Atlas metrics

### Weekly Checks
- [ ] Review API response times
- [ ] Check for any memory leaks
- [ ] Verify database indexes are effective
- [ ] Review error logs
- [ ] Check SSL certificate validity

### Monthly Tasks
- [ ] Review MongoDB Atlas storage usage
- [ ] Check for database optimization opportunities
- [ ] Review and archive old appointments
- [ ] Update dependencies if needed
- [ ] Review security best practices

---

## 🚨 Troubleshooting Guide

### Issue: High Memory Usage (>400 MB)
**Steps:**
1. Check `/health` endpoint for current memory
2. Restart service from Render dashboard
3. Check Render logs for memory warnings
4. Verify pagination is being used in queries
5. Check for stuck background processes

### Issue: Database Connection Errors
**Steps:**
1. Verify MongoDB Atlas cluster is running
2. Check IP whitelist in Atlas
3. Verify connection string in env vars
4. Test connection string locally
5. Check MongoDB Atlas status page

### Issue: Emails Not Sending
**Steps:**
1. Verify EMAIL_USER and EMAIL_PASSWORD are correct
2. Check Gmail App Password is active
3. Test email sending locally
4. Check Render logs for SMTP errors
5. Verify Gmail hasn't blocked the app

### Issue: CORS Errors from Frontend
**Steps:**
1. Verify FRONTEND_URL in env vars
2. Check URL has no trailing slash
3. Verify frontend is using correct backend URL
4. Check CORS configuration in server.js
5. Test with curl to isolate issue

### Issue: Slow Response Times
**Steps:**
1. Check if pagination is being used
2. Verify database indexes exist
3. Check MongoDB Atlas performance metrics
4. Review recent queries in logs
5. Consider upgrading Render tier

---

## 📊 Success Metrics

### Performance Targets
- ✅ Memory usage: < 250 MB normal, < 400 MB peak
- ✅ Response time: < 500ms for 95% of requests
- ✅ Uptime: > 99% (excluding Render free tier sleeps)
- ✅ Database queries: < 100ms average
- ✅ Email delivery: > 95% success rate

### Business Metrics
- ✅ Appointment booking success rate > 98%
- ✅ User registration success rate > 95%
- ✅ Image upload success rate > 90%
- ✅ Payment processing success rate > 99%
- ✅ Zero data loss incidents

---

## 🎓 Best Practices Reminder

1. **Always use pagination** on list endpoints
2. **Always use `.lean()`** for read-only queries
3. **Always use `.select()`** to limit returned fields
4. **Always add early `$match`** in aggregations
5. **Always close connections** on shutdown
6. **Always validate** query parameters
7. **Always monitor** memory usage
8. **Always test** before deploying
9. **Always backup** database regularly
10. **Always log** errors for debugging

---

## 📝 Documentation Updates Needed

After deployment, update:
- [ ] README.md with production URLs
- [ ] API documentation with new pagination params
- [ ] Frontend config with backend URL
- [ ] Admin credentials (if changed)
- [ ] Support documentation
- [ ] Team onboarding docs

---

## 🔐 Security Checklist

- [ ] JWT_SECRET is strong and unique
- [ ] Database passwords are strong
- [ ] API keys are not in code (use env vars)
- [ ] CORS is properly configured
- [ ] Rate limiting is considered
- [ ] Input validation is in place
- [ ] SQL/NoSQL injection prevention
- [ ] XSS protection enabled
- [ ] HTTPS only in production
- [ ] Sensitive data is encrypted

---

## ✨ Optimization Verification

- [ ] All routes use `paginatedFind()` or manual pagination
- [ ] All queries use `.lean()` for read operations
- [ ] All queries use `.select()` for field projection
- [ ] All aggregations have early `$match` and `$limit`
- [ ] Batch operations used instead of loops
- [ ] Cursor-based iteration for large datasets
- [ ] Connection pooling configured correctly
- [ ] Graceful shutdown implemented
- [ ] Memory monitoring in place
- [ ] No global in-memory caches

---

**Checklist Version**: 1.0  
**Last Updated**: December 17, 2025  
**For Backend Version**: 1.1.0 (Memory Optimized)

---

## ✅ Final Sign-Off

Once all items are checked:
- [ ] Development testing complete
- [ ] Staging deployment successful
- [ ] Production deployment successful
- [ ] All features verified working
- [ ] Performance metrics met
- [ ] Security verified
- [ ] Documentation updated
- [ ] Team trained
- [ ] Monitoring configured
- [ ] Support contacts established

**Deployed by**: _________________  
**Date**: _________________  
**Production URL**: _________________  
**Verified by**: _________________
