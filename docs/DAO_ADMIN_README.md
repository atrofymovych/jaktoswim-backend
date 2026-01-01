# DAO Command Admin Server

A local admin server for managing DAO commands with a Windows 95-style web interface.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
# Copy the package.json and install dependencies
cp dao-admin-package.json package.json
npm install
```

### 2. Start the Server
```bash
# Start the admin server
npm start

# Or for development with auto-restart
npm run dev
```

### 3. Access the Editor
Open your browser and go to: **http://localhost:3001**

## 🔧 Features

### **Real MongoDB Connection**
- ✅ Connects to your actual MongoDB database
- ✅ Decrypts command ciphertext using your decrypt key
- ✅ Shows all real DAO commands (not mock data)
- ✅ Handles pagination for large command sets

### **Command Management**
- ✅ **View** all commands with pagination (20 per page)
- ✅ **Edit** command code in real-time
- ✅ **Save** changes back to MongoDB
- ✅ **Delete** commands with confirmation
- ✅ **Create** new commands
- ✅ **Refresh** command list

### **Split View Editor**
- ✅ **Left Panel**: Code editor for command JavaScript
- ✅ **Right Panel**: Complete MongoDB document data
- ✅ **Real-time updates** when saving changes

### **Windows 95 Style UI**
- ✅ Authentic retro interface
- ✅ Color-coded status indicators
- ✅ Pagination controls
- ✅ Action buttons for each command

## 📋 Usage

### **Login**
1. Enter your **MongoDB Connection URL** (e.g., `mongodb://localhost:27017`)
2. Enter your **Database Name** (e.g., `your-database-name`)
3. Enter your **Decrypt Key** (the key used to encrypt/decrypt commands)
4. Click **Connect**

### **Browse Commands**
- View all commands in a paginated list
- See command status, org ID, user ID, and creation date
- Use **Previous/Next** buttons to navigate pages
- Click **Edit** (✏️) to edit a command
- Click **Delete** (🗑️) to delete a command

### **Edit Commands**
- **Left Panel**: Edit the JavaScript command code
- **Right Panel**: View all MongoDB fields and data
- Click **Save Changes** to update the database
- Click **Cancel** to return to browse mode

## 🔒 Security

- **Local Only**: Server runs on localhost:3001
- **No External Access**: Only accessible from your machine
- **Connection Management**: Each session gets a unique connection ID
- **Automatic Cleanup**: Connections are closed when disconnecting

## 🛠️ API Endpoints

The server provides these REST API endpoints:

- `POST /api/connect` - Connect to MongoDB
- `GET /api/commands/:connectionId` - Get paginated commands
- `GET /api/commands/:connectionId/:commandId` - Get single command
- `PUT /api/commands/:connectionId/:commandId` - Update command
- `DELETE /api/commands/:connectionId/:commandId` - Delete command
- `POST /api/commands/:connectionId` - Create new command
- `DELETE /api/connect/:connectionId` - Disconnect

## 📁 Files

- `dao-admin-server.js` - Main server file
- `dao-command-editor.html` - Web interface
- `dao-admin-package.json` - Dependencies
- `DAO_ADMIN_README.md` - This file

## 🚨 Important Notes

1. **Local Development Only**: This is for local development and testing
2. **MongoDB Access**: Ensure your MongoDB is accessible from localhost
3. **Decrypt Key**: Use the same key that encrypts your DAO commands
4. **Backup**: Always backup your database before making changes
5. **Permissions**: Ensure you have read/write access to the DAO commands collection

## 🔧 Troubleshooting

### Connection Issues
- Check MongoDB is running and accessible
- Verify connection URL format
- Ensure database name is correct
- Check decrypt key is valid

### Command Issues
- Verify command syntax before saving
- Check MongoDB permissions
- Look at server console for error messages

### UI Issues
- Refresh the page if UI seems stuck
- Check browser console for JavaScript errors
- Ensure you're using a modern browser

## 🎯 Next Steps

1. **Start the server**: `npm start`
2. **Open browser**: Go to `http://localhost:3001`
3. **Connect to your MongoDB** with your credentials
4. **Start managing your DAO commands**!

---

**Happy Command Editing!** 🎮
