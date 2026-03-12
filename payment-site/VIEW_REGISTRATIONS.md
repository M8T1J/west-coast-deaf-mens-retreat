# How to View Registration List

## Quick Access

### Option 1: Admin Page (Recommended)
1. Open your website
2. Go directly to: `admin.html` in your browser
3. The first time on a new browser/device, you will be asked to create an admin username/password and pass a quick human-verification check
4. After that, sign in to view registrations

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

⚠️ **Security:** The admin page now requires an admin username/password + human verification
- Admin credentials are stored only in that browser (static site limitation)
- If you use multiple devices, export JSON on each device and import into the admin page to combine lists

## For Production

When you deploy to your live website:
1. Set up a backend database (MySQL, MongoDB, etc.)
2. Store registrations server-side
3. Protect admin access server-side (not just in the browser)

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
