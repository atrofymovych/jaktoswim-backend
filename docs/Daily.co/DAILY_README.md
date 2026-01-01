# Daily.co Video Call Integration

## Quick Start

### 1. Setup Environment Variables

Copy the example environment file and configure your Daily.co API key:

```bash
cp daily.env.example .env
```

Edit `.env` and add your Daily.co API key:

```bash
DAILY_API_KEY=your_daily_api_key_here
DAILY_DOMAIN=crm-system.daily.co
```

### 2. Get Daily.co API Key

1. Go to [Daily.co Dashboard](https://dashboard.daily.co/)
2. Sign up or log in
3. Navigate to "Developers" → "API Keys"
4. Create a new API key
5. Copy the key to your environment variables

### 3. Test the Integration

Start your server and test the API:

```bash
# Create a video call room
curl -X POST http://localhost:8080/daily/quick-start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "max_participants": 10,
    "duration": 60,
    "user_id": "user_123",
    "user_name": "John Doe"
  }'
```

## API Endpoints

### Quick Start (Recommended)
- `POST /daily/quick-start` - Create room and get embed config

### Room Management
- `POST /daily/rooms` - Create room
- `GET /daily/rooms` - List rooms
- `GET /daily/rooms/:roomName` - Get room details
- `PUT /daily/rooms/:roomName` - Update room
- `DELETE /daily/rooms/:roomName` - Delete room

### Participant Management
- `GET /daily/rooms/:roomName/participants` - Get participants
- `DELETE /daily/rooms/:roomName/participants/:participantId` - Remove participant

### Token Management
- `POST /daily/rooms/:roomName/token` - Create meeting token

### Recording
- `POST /daily/rooms/:roomName/recording` - Start recording
- `DELETE /daily/rooms/:roomName/recording` - Stop recording

### Frontend Integration
- `GET /daily/embed/:roomName` - Get embed configuration

### Webhooks
- `POST /daily/webhooks` - Handle Daily.co webhooks

## Frontend Integration

### Simple Iframe

```html
<iframe
  src="https://crm-system.daily.co/room-name"
  width="100%"
  height="600px"
  frameborder="0">
</iframe>
```

### Daily.co SDK

```javascript
import DailyIframe from '@daily-co/daily-react';

const callFrame = DailyIframe.createFrame(document.getElementById('call-container'));
callFrame.join({ url: 'https://crm-system.daily.co/room-name' });
```

## Features

✅ **Room Management** - Create, update, delete rooms
✅ **Participant Tracking** - Monitor who's in the call
✅ **Token Authentication** - Secure access with meeting tokens
✅ **Recording** - Start/stop room recordings
✅ **Custom Styling** - Branded video call interface
✅ **Webhooks** - Real-time event notifications
✅ **Frontend Integration** - Ready-to-use embed configurations
✅ **Metrics** - Prometheus metrics for monitoring

## Documentation

- [Complete Integration Guide](DAILY_INTEGRATION_GUIDE.md)
- [API Reference](DAILY_INTEGRATION_GUIDE.md#api-endpoints)
- [Frontend Examples](DAILY_INTEGRATION_GUIDE.md#frontend-implementation-examples)
- [Webhook Configuration](DAILY_INTEGRATION_GUIDE.md#webhooks)

## Support

- [Daily.co Documentation](https://docs.daily.co/)
- [Daily.co Community](https://community.daily.co/)
- [Daily.co Support](https://help.daily.co/)

## Pricing

Daily.co offers a free tier with:
- 2,000 participant minutes per month
- Up to 10 participants per call
- Basic features

For more information, visit [Daily.co Pricing](https://www.daily.co/pricing).
