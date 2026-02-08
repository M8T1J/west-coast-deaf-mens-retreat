# How to View Registration List

## Quick Access

### Option 1: Admin Page (Recommended)
1. Open your website
2. Scroll to the footer
3. Click **"Admin: View Registrations"** link
4. Or go directly to: `admin.html` in your browser

### Option 2: Direct File
1. Open Finder
2. Navigate to: `/Users/thomas/payment-site/`
3. Double-click `admin.html`
4. It will open in your browser

## What You'll See

The admin page shows:

### Statistics Dashboard
- **Total Registrations** - All registrations
- **Completed** - Paid registrations
- **Pending** - Unpaid registrations
- **Total Revenue** - Sum of all completed payments

### Registration Table
- Date & Time
- Full Name
- Email
- Phone
- Church Name
- Amount Paid
- Payment ID
- Status (Completed/Pending)

### Features

✅ **Search** - Search by name, email, or church
✅ **Click any row** - View full registration details
✅ **Export to CSV** - Download as spreadsheet
✅ **Export to JSON** - Download as JSON file
✅ **Auto-refresh** - Updates every 30 seconds
✅ **Clear Data** - Delete all registrations (use with caution!)

## Viewing Full Details

Click on any registration row to see:
- All personal information
- Emergency contact details
- Accommodation preferences
- Bunk selection
- Youth information
- Payment details

## Exporting Data

### Export to CSV (Excel/Sheets)
1. Click **"Export to CSV"** button
2. File downloads automatically
3. Open in Excel, Google Sheets, or any spreadsheet app

### Export to JSON
1. Click **"Export to JSON"** button
2. File downloads automatically
3. Use for data backup or importing to other systems

## Important Notes

⚠️ **Data Storage:** Registrations are stored in browser localStorage
- Data is saved per browser/computer
- If you clear browser data, registrations are lost
- For production, set up a backend database

⚠️ **Security:** The admin page is not password protected
- Anyone with the link can view registrations
- For production, add password protection

## For Production

When you deploy to your live website:
1. Add password protection to `admin.html`
2. Set up a backend database (MySQL, MongoDB, etc.)
3. Store registrations server-side
4. Create a secure admin login system

## Quick Test

1. Complete a test registration on your website
2. Open `admin.html`
3. You should see your test registration in the list!

## Troubleshooting

**No registrations showing?**
- Make sure someone has completed the registration form
- Check browser console (F12) for errors
- Verify localStorage is enabled in your browser

**Can't find admin.html?**
- It's in the same folder as `index.html`
- Look in `/Users/thomas/payment-site/`

**Data not updating?**
- Click the "Refresh" button
- Or reload the page (F5)

Enjoy managing your registrations! 🎉
