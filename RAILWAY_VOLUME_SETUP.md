# Railway Persistent Volume Setup for Backups

## Why Use Persistent Volumes?

By default, backups are stored in `/tmp` on Railway, which:
- ❌ Gets cleared on each deployment
- ❌ May be cleared periodically by the system
- ✅ Works for temporary storage but not ideal for backups

With persistent volumes:
- ✅ Data survives deployments and restarts
- ✅ Permanent storage for your backups
- ✅ Can store weeks or months of backup history

## Setup Instructions

### Step 1: Add a Volume in Railway

1. Go to your Railway project dashboard
2. Click on your deployed service
3. Navigate to the **Settings** tab
4. Scroll down to the **Volumes** section
5. Click **"Add Volume"**
6. Configure the volume:
   - **Mount Path**: `/data`
   - **Size**: 1GB (or more based on your needs)
7. Click **"Add"** to create the volume

### Step 2: Add Environment Variable

After adding the volume, add this environment variable to your Railway service:

1. Go to the **Variables** tab in your service
2. Add a new variable:
   ```
   RAILWAY_VOLUME_MOUNT_PATH=/data
   ```
3. Railway will automatically restart your service

### Step 3: Verify Setup

After deployment, check the backup management page in your admin panel:
- The system will now use `/data/backups` for storing backups
- These backups will persist across deployments

## Storage Hierarchy

The backup system uses this priority order:

1. **First choice**: `RAILWAY_VOLUME_MOUNT_PATH` (if configured) - Permanent storage
2. **Fallback**: `/tmp` (on Railway without volume) - Temporary storage
3. **Local dev**: Current working directory - For local development

## Estimating Storage Needs

- Average backup size: ~100-500 KB (depending on data)
- Daily backups with 30-day retention: ~15 MB
- Daily backups with 365-day retention: ~180 MB

Recommended volume sizes:
- **Light usage**: 500 MB (several months of backups)
- **Standard usage**: 1 GB (1+ year of backups)
- **Heavy usage**: 2-5 GB (multiple years with frequent backups)

## Environment Variables Summary

```bash
# Required for persistent storage
RAILWAY_VOLUME_MOUNT_PATH=/data

# Optional: Customize backup schedule (default: 2 AM daily)
BACKUP_SCHEDULE=0 0 2 * * *

# Optional: Disable automatic backups
DISABLE_SCHEDULED_BACKUPS=false
```

## Monitoring

After setup, you can verify everything is working:

1. Go to Admin Dashboard → Backup Management
2. Click "Create & Store on Server"
3. Check that the backup appears in the list
4. The path should show `/data/backups/backup_[timestamp].json`

## Troubleshooting

### "Permission denied" errors
- Make sure the volume is properly mounted
- Check that `RAILWAY_VOLUME_MOUNT_PATH` is set correctly

### Backups not persisting
- Verify the volume is attached in Railway settings
- Check environment variables are set
- Look for warnings in logs about using `/tmp`

### Volume full
- Increase volume size in Railway settings
- Reduce the number of backups kept (adjust in code)
- Download and delete old backups manually

## Best Practices

1. **Regular Downloads**: Periodically download backups to your local machine
2. **Monitor Storage**: Check volume usage in Railway dashboard
3. **Test Restores**: Periodically test that backups can be restored
4. **External Backups**: Consider additional backup to S3/Google Cloud for critical data